# ezcut

A lightweight, no-friction desktop video editor focused on fast cuts and high-quality audio cleanup. ezcut does the small set of things creators actually need every day — trim, split, reorder, speed, volume, voiceover recording, background-noise removal, and export — without the bloat or subscription wall of larger editors.

> Status: early development. Phase 1 (Electron shell, secure IPC, bundled ffmpeg foundation) is complete. See [DEVPLAN.md](DEVPLAN.md) for the roadmap.

## Highlights

- **Cross-platform desktop** (Windows + macOS; Linux as a side effect) built on Electron + TypeScript + React.
- **Bundled ffmpeg/ffprobe** — no system install required; all media processing goes through pinned binaries.
- **Audio-first cleanup** — RNNoise (`arnndn`) noise reduction for both standalone audio and video-embedded audio.
- **Localized from day one** — Turkish (default) and English.
- **Dark, token-driven UI** — every color/size/spacing is a CSS custom property; CSS Modules, no Tailwind.

## Tech stack

| Layer | Choice |
|-------|--------|
| Shell | Electron |
| Language | TypeScript (main, preload, renderer, shared) |
| UI | React |
| Build | electron-vite + electron-builder |
| State | Zustand (added as stores arrive) |
| Media | `ffmpeg-static` + `ffprobe-static` |
| i18n | i18next / react-i18next |

## Architecture

A single authoritative `TimelineModel` (pure data) is consumed read-only by two renderers: the in-renderer **PlaybackEngine** (preview) and the main-process **FiltergraphBuilder** (export). Anything the preview applies must have a 1:1 representation in the export filtergraph — this is what keeps preview and output identical. The renderer reaches the system only through a typed `contextBridge` API; `contextIsolation` is on and `nodeIntegration` is off.

```
shared/      cross-process types + IPC contract
  main/      ffmpeg/probe/export/denoise services, secure IPC handlers
  preload/   typed contextBridge → window.electronAPI
  renderer/  React feature slices, Zustand stores, theme.css + i18n
```

## Getting started

Prerequisites: Node.js 20+ and npm.

```bash
npm install
npm run dev          # launch in development (alias: npm run electron:dev)
```

If `npm run dev` fails with `Error: Electron uninstall`, the Electron runtime binary did not download during install. Fetch it manually:

```bash
node node_modules/electron/install.js
```

### Build & package

```bash
npm run typecheck    # type-check main/preload/shared and renderer
npm run build        # production bundles into out/
npm run package:win  # Windows installer (nsis) into dist/
npm run package:mac  # macOS dmg
npm run package:dir  # unpacked build for quick local verification
```

## License

[GPL-3.0-or-later](LICENSE). ezcut bundles GPL-licensed ffmpeg builds, so the project is distributed under the GPL to keep the distribution license-coherent.
