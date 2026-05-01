# ascwu

Turn any video into ASCII art. Pick your characters, colors, and style — get back a video made entirely of text.

Two versions: an **Electron desktop app** and a **React web app**. Both use the same rendering engine.

## How It Works

1. **Drop a video** — MP4, MOV, WebM, AVI, MKV
2. **Pick your settings** — character set, color mode, render mode, font size/weight
3. **Preview** — see the result on a single frame, or hit play to watch it live
4. **Convert** — processes every frame and outputs a video file

### Render Modes

- **Overlay** — draws the original video dimmed, then layers ASCII characters on top with a brightness boost. The image stays visible with a text texture over it.
- **Replace** — builds the entire image from characters on a solid background. Each character cell gets a blended background fill + the character drawn in the pixel's color.

### Character Sets

| Preset | Characters | Effect |
|--------|-----------|--------|
| Binary | `01` | Everything in 0s and 1s |
| ASCII | ` .,:;=+x*X#%@&$` | Full density ramp, dark to bright |
| Blocks | `░▒▓█` | Unicode block elements |
| Custom | anything you type | Your own characters |

Characters are ordered dark-to-bright. Pixel brightness maps to a character index in your set.

### Color Modes

- **Original** — each character inherits the RGB color of the source pixel
- **Mono** — grayscale based on brightness
- **Tint** — single color scaled by brightness

## Project Structure

```
ascwu/
├── app/                  # Electron desktop app
│   ├── main.js           # Electron main process (ffmpeg, IPC, window)
│   ├── preload.js        # Context bridge between main and renderer
│   ├── renderer.js       # UI logic, ASCII rendering, preview playback
│   ├── index.html        # App shell
│   ├── styles.css        # Styling
│   └── package.json
│
├── site/                 # React web app (Vite + Tailwind)
│   ├── src/
│   │   ├── App.jsx       # Main app state, conversion pipeline
│   │   ├── hooks/
│   │   │   └── useAsciiRenderer.js  # Shared rendering engine
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── DropZone.jsx
│   │   │   ├── Preview.jsx    # Live preview with play/pause
│   │   │   ├── Settings.jsx   # All controls
│   │   │   ├── Progress.jsx   # Conversion progress
│   │   │   └── Done.jsx       # Download with editable filename
│   │   ├── index.css     # Tailwind + theme tokens
│   │   └── main.jsx
│   ├── vite.config.js
│   └── package.json
│
└── .gitignore
```

## Running

### Desktop App (Electron)

Requires `ffmpeg` and `ffprobe` installed on your system.

```bash
cd app
npm install
npm start
```

The desktop app uses system ffmpeg to:
- Extract every frame as PNG
- Process each frame with canvas
- Reassemble into MP4 with original audio preserved

### Web App (React)

```bash
cd site
npm install
npm run dev
```

Opens at `http://localhost:5173`. The web app runs entirely in the browser:
- Video loads via `<video>` element
- Frame-by-frame seeking for conversion (same quality as the desktop app)
- MediaRecorder captures the canvas output
- ffmpeg.wasm converts to MP4 (falls back to WebM if CORS blocks it)

Vite is configured with `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers so ffmpeg.wasm can use SharedArrayBuffer.

## Rendering Pipeline

Both versions share the same core algorithm:

1. **Sample** — draw the source frame onto a small canvas at grid resolution (cols × rows)
2. **Read pixels** — `getImageData` to get RGB values for each cell
3. **Map brightness** — `R×0.299 + G×0.587 + B×0.114` → character index in the charset
4. **Color** — apply color mode (original RGB, mono, or tint)
5. **Draw** — render each character at its grid position on the output canvas

For overlay mode, the original image is drawn first (dimmed), then characters are drawn on top with a brightness boost.

The output canvas resolution matches the source video — character size determines how many columns fit, which determines the grid density.

## Settings Reference

| Setting | Range | What it does |
|---------|-------|-------------|
| Character Size | 4–24px | Font size for rendering. Smaller = more columns = more detail |
| Character Set | preset or custom | Which characters map to brightness levels |
| Color Mode | Original / Mono / Tint | How characters are colored |
| Background | Black / Zinc / White / Pick | Background color (replace mode) |
| Image Dim | 0–80% | How much to darken the original image (overlay mode) |
| Character Boost | 0–150 | Extra brightness added to characters (overlay mode) |
| Font Weight | 100–900 | Thin to bold characters |

## Tech Stack

**Desktop:** Electron, Node.js, Canvas API, ffmpeg/ffprobe (system)

**Web:** React, Vite, Tailwind CSS, Canvas API, MediaRecorder, ffmpeg.wasm
