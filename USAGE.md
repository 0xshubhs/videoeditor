# MEOW Video Editor — Usage Guide

A browser-based video editor built with SvelteKit + FFmpeg.wasm. Runs entirely in the browser — no server processing, no uploads, no accounts.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
open http://localhost:5173
```

> Works in **Chrome**, **Brave**, **Edge**, and other Chromium browsers. Firefox has limited support.

## Importing Media

**Drag & drop** files anywhere in the editor window, or click the **Import** button in the top bar.

Supported formats:
- **Video**: MP4, WebM, MKV, AVI, MOV, FLV, WMV, TS, MTS
- **Audio**: MP3, WAV, AAC, OGG, FLAC
- **Image**: PNG, JPG, GIF, WebP, SVG

Videos with codecs the browser can't play natively (HEVC, ProRes — common in `.mov` from Mac) are **automatically transcoded** to H.264 via FFmpeg.wasm on import.

## Editor Layout

```
┌──────────────────────────────────────────────────┐
│                    Top Bar                        │
├──────────────┬───────────────────────────────────┤
│              │                                   │
│  Media       │        Preview Panel              │
│  Browser     │     (video preview + controls)    │
│              │                                   │
├──────────────┴───────────────────────────────────┤
│                                                  │
│               Timeline Panel                     │
│    (tracks, clips, playhead, ruler)              │
│                                                  │
├──────────────────────────────────────────────────┤
│                  Status Bar                      │
└──────────────────────────────────────────────────┘
```

## Working with Clips

### Adding to Timeline
1. Import media files (drag & drop or Import button)
2. Thumbnails appear in the Media Browser (left panel)
3. **Drag** a thumbnail from the Media Browser onto a timeline track
4. A track is auto-created on first import if none exist

### Selecting
- **Click** a clip to select it
- **Ctrl+Click** to add to selection
- **Ctrl+A** to select all clips
- **Escape** to deselect all

### Editing
- **Drag** a clip to move it along the timeline
- **Drag clip edges** to trim start/end
- **S** to split at the playhead position
- **Delete / Backspace** to remove selected clips

### Undo/Redo
- **Ctrl+Z** — Undo
- **Ctrl+Shift+Z** or **Ctrl+Y** — Redo

All editing operations (add, remove, move, split, trim) are fully undoable.

## Playback

| Action | Shortcut |
|--------|----------|
| Play / Pause | **Space** |
| Go to start | **Home** |
| Go to end | **End** |
| Previous frame | **Left Arrow** |
| Next frame | **Right Arrow** |
| Jump back 5s | **Shift+Left Arrow** |
| Jump forward 5s | **Shift+Right Arrow** |

### Audio
- Audio plays from video clips during playback
- Per-track volume and mute controls in the Properties panel (Audio Mixer section)
- If audio doesn't play on first click, click anywhere in the editor to enable audio (browser autoplay policy)

## Timeline Controls

| Action | Shortcut |
|--------|----------|
| Zoom in | **Ctrl + =** |
| Zoom out | **Ctrl + -** |
| Zoom to fit | **Ctrl + 0** |

- **Scroll wheel** on the timeline to scroll horizontally
- **Ctrl + Scroll wheel** to zoom in/out

## Text Overlays

1. Press **T** to add a text overlay at the playhead position
2. Edit text properties in the Properties panel:
   - Text content, font family, font size
   - Color, background color
   - Position (X/Y percentage)
   - Alignment, font weight
   - Opacity
   - Duration and timing

## Transitions

- Select a clip and use the Properties panel to add transitions between clips
- Supported types: Fade, Dissolve, Wipe (Left/Right/Up/Down), Cross-Zoom

## Exporting

1. Press **Ctrl+E** or click the Export button
2. Configure:
   - **Format**: MP4, WebM, MKV
   - **Resolution**: 720p, 1080p, 1440p, 4K
   - **Bitrate / Quality**
   - **Codec settings**
3. Click Export — the file downloads when processing completes

Export is handled entirely by FFmpeg.wasm in a Web Worker (no server needed).

## All Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space | Play / Pause |
| S | Split clip at playhead |
| Delete / Backspace | Delete selected clips |
| T | Add text overlay |
| I | Import media |
| M | Mute selected track |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Ctrl+C | Copy |
| Ctrl+V | Paste |
| Ctrl+X | Cut |
| Ctrl+A | Select all |
| Escape | Deselect all |
| Ctrl+= | Zoom in |
| Ctrl+- | Zoom out |
| Ctrl+0 | Zoom to fit |
| Home | Go to start |
| End | Go to end |
| Left Arrow | Previous frame |
| Right Arrow | Next frame |
| Shift+Left | Jump back 5s |
| Shift+Right | Jump forward 5s |
| Ctrl+E | Export |

## Architecture

```
Session-based — all state lives in memory. Nothing persists after closing the tab.

Browser (Main Thread)              Browser (Web Worker)
┌────────────────────┐             ┌──────────────────┐
│  Svelte 5 UI       │             │  FFmpeg.wasm     │
│  ├─ State (runes)  │  messages   │  ├─ Transcode    │
│  ├─ Commands       │◄───────────►│  ├─ Export       │
│  ├─ Playback       │             │  └─ Thumbnails   │
│  └─ Canvas render  │             └──────────────────┘
└────────────────────┘
```

- **State**: Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **Commands**: Full undo/redo via Command pattern with atomic transactions
- **Playback**: HTML5 `<video>` elements for native decode + Canvas 2D for compositing
- **FFmpeg**: Runs in Web Worker — never blocks UI
- **Audio**: Remotion-style — video elements play natively, lazy drift correction (0.45s threshold)

## Build & Deploy

```bash
# Development
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Type checking
npm run check
```

### Requirements
- Node.js 18+
- Modern Chromium browser (Chrome, Brave, Edge)
- Cross-Origin Isolation headers (configured in `vite.config.ts` and `hooks.server.ts`)

### COOP/COEP Headers
The app requires Cross-Origin Isolation for `SharedArrayBuffer` (used by FFmpeg.wasm). Headers are set automatically in dev mode via the Vite plugin. For production, ensure your server sends:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| App won't load | Check browser console. Ensure COOP/COEP headers are present. |
| Video won't import | Format may need transcoding. Wait for FFmpeg to finish loading. |
| No audio | Click anywhere in the editor first (browser autoplay policy). |
| Low preview quality | Resize the preview panel larger. Canvas renders at display resolution. |
| Export fails | Check browser console for FFmpeg errors. Ensure enough memory. |
| .mov files slow to import | Mac .mov files (HEVC/ProRes) are auto-transcoded to H.264 — this takes time. |
