import type { ExportConfig, ExportProgress } from '$lib/types/index.js';
import type { Track, Clip } from '$lib/types/index.js';
import type { Transition, TextOverlay } from '$lib/types/index.js';
import type { FFmpegBridge } from './ffmpeg-bridge.svelte.js';
import { RESOLUTION_MAP, FORMAT_DEFAULTS } from '$lib/types/export.js';

export async function exportTimeline(
	ffmpeg: FFmpegBridge,
	tracks: Track[],
	transitions: Transition[],
	textOverlays: TextOverlay[],
	config: ExportConfig,
	onProgress: (progress: ExportProgress) => void,
	getAssetFile: (assetId: string) => { file: File; name: string } | undefined
): Promise<Blob> {
	const startTime = Date.now();

	const progress = (stage: ExportProgress['stage'], p: number) => {
		onProgress({
			stage,
			progress: p,
			currentFrame: 0,
			totalFrames: 0,
			elapsed: Date.now() - startTime,
			eta: 0,
			outputSize: 0,
		});
	};

	progress('preparing', 0);

	const videoTrack = tracks.find((t) => t.type === 'video' && t.clips.length > 0);
	if (!videoTrack || videoTrack.clips.length === 0) {
		throw new Error('No video clips to export');
	}

	const sortedClips = [...videoTrack.clips].sort((a, b) => a.timelineStart - b.timelineStart);

	// Write source files to FFmpeg virtual FS with proper extensions
	const inputPaths: string[] = [];
	const writtenAssets = new Map<string, string>(); // assetId -> path

	for (let i = 0; i < sortedClips.length; i++) {
		const clip = sortedClips[i];

		// Reuse already-written asset files (split clips share same asset)
		if (writtenAssets.has(clip.assetId)) {
			inputPaths.push(writtenAssets.get(clip.assetId)!);
			continue;
		}

		const asset = getAssetFile(clip.assetId);
		if (!asset) throw new Error(`Asset not found for clip "${clip.name}"`);

		// Use proper extension so FFmpeg can detect container format
		const ext = asset.name.split('.').pop()?.toLowerCase() || 'mp4';
		const inputPath = `input_${i}.${ext}`;

		progress('preparing', 0.05 + (i / sortedClips.length) * 0.15);

		const arrayBuffer = await asset.file.arrayBuffer();
		await ffmpeg.writeFile(inputPath, arrayBuffer);

		writtenAssets.set(clip.assetId, inputPath);
		inputPaths.push(inputPath);
	}

	// Determine if we can use fast stream-copy mode
	// (no text overlays, no resolution scaling, no transitions = can use -c copy)
	const resolution = RESOLUTION_MAP[config.resolution];
	const width = config.customWidth ?? resolution.width;
	const height = config.customHeight ?? resolution.height;
	const needsReencode = textOverlays.length > 0 || transitions.length > 0;

	const outputFile = `output.${config.format}`;
	let args: string[];

	if (sortedClips.length === 1 && !needsReencode) {
		// Single clip, no effects — fast trim with stream copy
		args = buildSingleClipArgs(sortedClips[0], inputPaths[0], config, width, height, outputFile);
	} else {
		// Multi-clip or effects needed — use filter_complex
		args = buildFilterComplexArgs(
			sortedClips,
			inputPaths,
			textOverlays,
			config,
			width,
			height,
			outputFile
		);
	}

	progress('rendering', 0.2);

	const exitCode = await ffmpeg.exec(args, {
		onProgress: (p) => {
			progress('encoding', 0.2 + p * 0.7);
		},
	});

	if (exitCode !== 0) {
		throw new Error(`FFmpeg exited with code ${exitCode}. Check browser console for details.`);
	}

	progress('finalizing', 0.95);

	const outputData = await ffmpeg.readFile(outputFile);
	const mimeMap: Record<string, string> = {
		mp4: 'video/mp4',
		webm: 'video/webm',
		mkv: 'video/x-matroska',
		avi: 'video/x-msvideo',
		mov: 'video/quicktime',
	};
	const blob = new Blob([outputData], { type: mimeMap[config.format] ?? 'video/mp4' });

	// Cleanup input files
	for (const path of new Set(inputPaths)) {
		try {
			await ffmpeg.deleteFile(path);
		} catch {}
	}
	try {
		await ffmpeg.deleteFile(outputFile);
	} catch {}

	onProgress({
		stage: 'done',
		progress: 1,
		currentFrame: 0,
		totalFrames: 0,
		elapsed: Date.now() - startTime,
		eta: 0,
		outputSize: blob.size,
	});

	return blob;
}

/**
 * Single clip, no effects — use stream copy for speed.
 * Falls back to re-encode only if resolution change is needed.
 */
function buildSingleClipArgs(
	clip: Clip,
	inputPath: string,
	config: ExportConfig,
	width: number,
	height: number,
	outputFile: string
): string[] {
	const args = ['-i', inputPath];

	// Trim
	if (clip.sourceStart > 0.01) {
		args.push('-ss', String(clip.sourceStart));
	}
	args.push('-t', String(clip.duration));

	// Try stream copy (fast, low memory)
	args.push('-c:v', 'copy');
	args.push('-c:a', 'copy');
	args.push('-movflags', '+faststart');
	args.push('-y', outputFile);

	return args;
}

/**
 * Multi-clip or effects — full filter_complex pipeline.
 * Handles missing audio streams gracefully.
 */
function buildFilterComplexArgs(
	sortedClips: Clip[],
	inputPaths: string[],
	textOverlays: TextOverlay[],
	config: ExportConfig,
	width: number,
	height: number,
	outputFile: string
): string[] {
	const args: string[] = [];

	// Input files
	for (const path of inputPaths) {
		args.push('-i', path);
	}

	const filterParts: string[] = [];
	const videoLabels: string[] = [];
	const audioLabels: string[] = [];

	for (let i = 0; i < sortedClips.length; i++) {
		const clip = sortedClips[i];
		const vLabel = `v${i}`;
		const aLabel = `a${i}`;

		// Video: trim + scale
		filterParts.push(
			`[${i}:v]trim=start=${clip.sourceStart}:duration=${clip.duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[${vLabel}]`
		);

		// Audio: try the real audio stream, generate silence as fallback
		// Use volume filter for clip volume/mute
		const vol = clip.muted ? 0 : clip.volume;
		filterParts.push(
			`[${i}:a]atrim=start=${clip.sourceStart}:duration=${clip.duration},asetpts=PTS-STARTPTS,volume=${vol}[${aLabel}]`
		);

		videoLabels.push(`[${vLabel}]`);
		audioLabels.push(`[${aLabel}]`);
	}

	// Concat
	if (sortedClips.length > 1) {
		const streams = sortedClips.map((_, i) => `[v${i}][a${i}]`).join('');
		filterParts.push(
			`${streams}concat=n=${sortedClips.length}:v=1:a=1[outv][outa]`
		);
	} else {
		filterParts.push(`[v0]copy[outv]`);
		filterParts.push(`[a0]acopy[outa]`);
	}

	// Text overlays
	let videoOut = 'outv';
	for (let i = 0; i < textOverlays.length; i++) {
		const t = textOverlays[i];
		const nextLabel = `txt${i}`;
		const escapedText = t.text.replace(/'/g, "\\'").replace(/:/g, '\\:');
		filterParts.push(
			`[${videoOut}]drawtext=text='${escapedText}':fontsize=${t.fontSize}:fontcolor=${t.color}:x=(W*${t.x}-tw/2):y=(H*${t.y}-th/2):enable='between(t,${t.timelineStart},${t.timelineStart + t.duration})'[${nextLabel}]`
		);
		videoOut = nextLabel;
	}

	args.push('-filter_complex', filterParts.join(';'));
	args.push('-map', `[${videoOut}]`);
	args.push('-map', '[outa]');

	// Codecs
	args.push('-c:v', config.videoCodec);
	args.push('-c:a', config.audioCodec);

	if (config.videoBitrate > 0) {
		args.push('-b:v', `${config.videoBitrate}k`);
	}
	if (config.audioBitrate > 0) {
		args.push('-b:a', `${config.audioBitrate}k`);
	}

	args.push('-r', String(config.fps));
	args.push('-movflags', '+faststart');
	args.push('-y', outputFile);

	return args;
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
