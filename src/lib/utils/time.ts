export function formatTimecode(seconds: number, fps: number = 30): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const f = Math.floor((seconds % 1) * fps);
	return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

export function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
	return n.toString().padStart(2, '0');
}

export function secondsToPixels(seconds: number, pixelsPerSecond: number): number {
	return seconds * pixelsPerSecond;
}

export function pixelsToSeconds(pixels: number, pixelsPerSecond: number): number {
	return pixels / pixelsPerSecond;
}

export function snapToFrame(seconds: number, fps: number): number {
	return Math.round(seconds * fps) / fps;
}

export function clampTime(time: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, time));
}
