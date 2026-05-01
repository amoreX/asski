import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

let ffmpeg = null;
const CORE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return ffmpeg;
}

const PRESETS = {
  binary: "01",
  ascii: " .,:;=+x*X#%@&$",
  blocks: " ░▒▓█",
};

const views = {
  upload: document.getElementById("upload-view"),
  process: document.getElementById("process-view"),
  progress: document.getElementById("progress-view"),
  done: document.getElementById("done-view"),
};

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const videoPreview = document.getElementById("video-preview");
const sourceVideo = document.getElementById("source-video");
const fontSlider = document.getElementById("font-slider");
const weightSlider = document.getElementById("weight-slider");
const dimSlider = document.getElementById("dim-slider");
const boostSlider = document.getElementById("boost-slider");
const colsValue = document.getElementById("cols-value");
const fontValue = document.getElementById("font-value");
const weightValue = document.getElementById("weight-value");
const dimValue = document.getElementById("dim-value");
const boostValue = document.getElementById("boost-value");
const charsetInput = document.getElementById("charset-input");
const livePreviewCanvas = document.getElementById("live-preview-canvas");
const progressCanvas = document.getElementById("progress-canvas");
const workCanvas = document.getElementById("work-canvas");
const sampleCanvas = document.getElementById("sample-canvas");
const progressFill = document.getElementById("progress-fill");
const progressStage = document.getElementById("progress-stage");
const progressPercent = document.getElementById("progress-percent");
const tintColor = document.getElementById("tint-color");
const tintHex = document.getElementById("tint-hex");
const bgColorPicker = document.getElementById("bg-color");
const bgHex = document.getElementById("bg-hex");
const previewLoader = document.getElementById("preview-loader");

let videoFile = null;
let videoURL = null;
let outputBlob = null;
let outputURL = null;
let previewDebounceTimer = null;
let converting = false;

let settings = {
  renderMode: "overlay",
  fontSize: 10,
  fontWeight: 400,
  charset: "01",
  colorMode: "original",
  tintColor: "#22d3ee",
  bgColor: "#000000",
  dim: 40,
  boost: 60,
};

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[name].classList.add("active");
}

function measureChar(fontSize, fontWeight) {
  const ctx = workCanvas.getContext("2d");
  ctx.font = `${fontWeight} ${fontSize}px "JetBrains Mono", "Courier New", monospace`;
  return { charW: ctx.measureText("M").width, charH: fontSize };
}

function computeCols() {
  if (!sourceVideo.videoWidth) return 160;
  const { charW } = measureChar(settings.fontSize, settings.fontWeight);
  return Math.floor(sourceVideo.videoWidth / charW);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function getColor(red, grn, blu, brightness) {
  if (settings.colorMode === "original") return [red, grn, blu];
  if (settings.colorMode === "mono") {
    const b = Math.floor(brightness);
    return [b, b, b];
  }
  const t = hexToRgb(settings.tintColor);
  const f = brightness / 255;
  return [Math.floor(t.r * f), Math.floor(t.g * f), Math.floor(t.b * f)];
}

// --- Renderers ---
function renderReplaceFrame(ctx, pixels, cols, rows, charW, charH, charset) {
  const bgR = hexToRgb(settings.bgColor);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 4;
      const red = pixels[idx], grn = pixels[idx + 1], blu = pixels[idx + 2];
      const brightness = red * 0.299 + grn * 0.587 + blu * 0.114;
      const x = Math.round(c * charW), y = r * charH;
      const cellW = Math.round((c + 1) * charW) - x;
      const [cr, cg, cb] = getColor(red, grn, blu, brightness);
      const blend = 0.35;
      ctx.fillStyle = `rgb(${Math.floor(bgR.r * (1 - blend) + cr * blend)},${Math.floor(bgR.g * (1 - blend) + cg * blend)},${Math.floor(bgR.b * (1 - blend) + cb * blend)})`;
      ctx.fillRect(x, y, cellW, charH);
      const charIdx = Math.min(Math.floor((brightness / 255) * charset.length), charset.length - 1);
      const char = charset[charIdx];
      if (char === " ") continue;
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillText(char, x, y);
    }
  }
}

function renderOverlayFrame(ctx, source, cols, rows, charW, charH, charset, outW, outH) {
  const dimFactor = 1 - settings.dim / 100;
  const boost = settings.boost;

  ctx.drawImage(source, 0, 0, outW, outH);
  ctx.fillStyle = `rgba(0, 0, 0, ${1 - dimFactor})`;
  ctx.fillRect(0, 0, outW, outH);

  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  const sampleCtx = sampleCanvas.getContext("2d");
  sampleCtx.drawImage(source, 0, 0, cols, rows);
  const pixels = sampleCtx.getImageData(0, 0, cols, rows).data;

  ctx.font = `${settings.fontWeight} ${settings.fontSize}px "JetBrains Mono", "Courier New", monospace`;
  ctx.textBaseline = "top";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 4;
      const red = pixels[idx], grn = pixels[idx + 1], blu = pixels[idx + 2];
      const brightness = red * 0.299 + grn * 0.587 + blu * 0.114;
      const charIdx = Math.min(Math.floor((brightness / 255) * charset.length), charset.length - 1);
      const char = charset[charIdx];
      if (char === " ") continue;
      let [cr, cg, cb] = getColor(red, grn, blu, brightness);
      cr = Math.min(255, cr + boost);
      cg = Math.min(255, cg + boost);
      cb = Math.min(255, cb + boost);
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillText(char, Math.round(c * charW), r * charH);
    }
  }
}

function renderFrame(ctx, source, outW, outH) {
  const cols = computeCols();
  const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight);
  const rows = Math.round((cols * source.videoHeight / source.videoWidth) * (charW / charH));

  if (settings.renderMode === "overlay") {
    renderOverlayFrame(ctx, source, cols, rows, charW, charH, settings.charset, outW, outH);
  } else {
    sampleCanvas.width = cols;
    sampleCanvas.height = rows;
    const sampleCtx = sampleCanvas.getContext("2d");
    sampleCtx.drawImage(source, 0, 0, cols, rows);
    const pixels = sampleCtx.getImageData(0, 0, cols, rows).data;
    ctx.fillStyle = settings.bgColor;
    ctx.fillRect(0, 0, outW, outH);
    ctx.font = `${settings.fontWeight} ${settings.fontSize}px "JetBrains Mono", "Courier New", monospace`;
    ctx.textBaseline = "top";
    renderReplaceFrame(ctx, pixels, cols, rows, charW, charH, settings.charset);
  }
}

// --- Drop zone ---
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) loadVideo(e.target.files[0]);
});

dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) loadVideo(e.dataTransfer.files[0]);
});

function loadVideo(file) {
  videoFile = file;
  if (videoURL) URL.revokeObjectURL(videoURL);
  videoURL = URL.createObjectURL(file);

  sourceVideo.src = videoURL;
  videoPreview.src = videoURL;

  sourceVideo.addEventListener("loadeddata", () => {
    document.getElementById("video-name").textContent = file.name;
    document.getElementById("pill-res").textContent = `${sourceVideo.videoWidth}×${sourceVideo.videoHeight}`;
    document.getElementById("pill-dur").textContent = formatDuration(sourceVideo.duration);
    updateColsDisplay();
    showView("process");
    generatePreview();
  }, { once: true });
}

function formatDuration(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// --- Preview ---
function generatePreview() {
  if (!sourceVideo.videoWidth) return;
  previewLoader.classList.remove("hidden");

  requestAnimationFrame(() => {
    const cols = computeCols();
    const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight);
    const rows = Math.round((cols * sourceVideo.videoHeight / sourceVideo.videoWidth) * (charW / charH));
    const outW = Math.ceil(cols * charW);
    const outH = rows * charH;

    workCanvas.width = outW;
    workCanvas.height = outH;
    const ctx = workCanvas.getContext("2d");

    renderFrame(ctx, sourceVideo, outW, outH);

    livePreviewCanvas.width = outW;
    livePreviewCanvas.height = outH;
    livePreviewCanvas.getContext("2d").drawImage(workCanvas, 0, 0);
    previewLoader.classList.add("hidden");
  });
}

function schedulePreviewRefresh() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => generatePreview(), 150);
}

// --- Live playback preview ---
let previewPlaying = false;
let previewRAF = null;

const playBtn = document.getElementById("btn-play-preview");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");

playBtn?.addEventListener("click", () => {
  if (previewPlaying) {
    stopPreviewPlayback();
  } else {
    startPreviewPlayback();
  }
});

function startPreviewPlayback() {
  if (!sourceVideo.videoWidth) return;
  previewPlaying = true;
  playIcon.style.display = "none";
  pauseIcon.style.display = "block";

  sourceVideo.currentTime = 0;
  sourceVideo.play();

  const ctx = livePreviewCanvas.getContext("2d");
  const cols = computeCols();
  const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight);
  const rows = Math.round((cols * sourceVideo.videoHeight / sourceVideo.videoWidth) * (charW / charH));
  const outW = Math.ceil(cols * charW);
  const outH = rows * charH;

  livePreviewCanvas.width = outW;
  livePreviewCanvas.height = outH;

  const renderLoop = () => {
    if (!previewPlaying || sourceVideo.paused || sourceVideo.ended) {
      stopPreviewPlayback();
      return;
    }
    workCanvas.width = outW;
    workCanvas.height = outH;
    const wCtx = workCanvas.getContext("2d");
    renderFrame(wCtx, sourceVideo, outW, outH);
    ctx.drawImage(workCanvas, 0, 0);
    previewRAF = requestAnimationFrame(renderLoop);
  };

  previewRAF = requestAnimationFrame(renderLoop);
}

function stopPreviewPlayback() {
  previewPlaying = false;
  sourceVideo.pause();
  if (previewRAF) cancelAnimationFrame(previewRAF);
  playIcon.style.display = "block";
  pauseIcon.style.display = "none";
}

function updateColsDisplay() {
  colsValue.textContent = `${computeCols()} cols (auto)`;
}

// --- Mode toggle ---
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    settings.renderMode = btn.dataset.mode;
    const isOverlay = settings.renderMode === "overlay";
    document.getElementById("overlay-settings").style.display = isOverlay ? "" : "none";
    document.getElementById("boost-setting").style.display = isOverlay ? "" : "none";
    schedulePreviewRefresh();
  });
});

// --- Sliders ---
fontSlider.addEventListener("input", () => {
  settings.fontSize = parseInt(fontSlider.value);
  fontValue.textContent = `${settings.fontSize}px`;
  updateColsDisplay();
  schedulePreviewRefresh();
});
weightSlider.addEventListener("input", () => {
  settings.fontWeight = parseInt(weightSlider.value);
  weightValue.textContent = settings.fontWeight;
  updateColsDisplay();
  schedulePreviewRefresh();
});
dimSlider.addEventListener("input", () => {
  settings.dim = parseInt(dimSlider.value);
  dimValue.textContent = `${settings.dim}%`;
  schedulePreviewRefresh();
});
boostSlider.addEventListener("input", () => {
  settings.boost = parseInt(boostSlider.value);
  boostValue.textContent = settings.boost;
  schedulePreviewRefresh();
});

// --- Charset ---
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const preset = btn.dataset.preset;
    if (preset === "custom") { charsetInput.focus(); return; }
    settings.charset = PRESETS[preset];
    charsetInput.value = settings.charset;
    schedulePreviewRefresh();
  });
});
charsetInput.addEventListener("input", () => {
  if (charsetInput.value.length > 0) settings.charset = charsetInput.value;
  document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
  const match = Object.entries(PRESETS).find(([, v]) => v === charsetInput.value);
  if (match) document.querySelector(`.preset-btn[data-preset="${match[0]}"]`)?.classList.add("active");
  else document.querySelector('.preset-btn[data-preset="custom"]')?.classList.add("active");
  schedulePreviewRefresh();
});

// --- Color mode ---
document.querySelectorAll(".color-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".color-mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    settings.colorMode = btn.dataset.mode;
    document.getElementById("tint-controls").classList.toggle("hidden", settings.colorMode !== "tint");
    schedulePreviewRefresh();
  });
});
tintColor.addEventListener("input", () => { settings.tintColor = tintColor.value; tintHex.textContent = tintColor.value; schedulePreviewRefresh(); });

// --- Background ---
document.querySelectorAll(".bg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".bg-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const bg = btn.dataset.bg;
    if (bg === "custom") { document.getElementById("bg-picker-row").classList.remove("hidden"); settings.bgColor = bgColorPicker.value; }
    else { document.getElementById("bg-picker-row").classList.add("hidden"); settings.bgColor = bg; }
    schedulePreviewRefresh();
  });
});
bgColorPicker.addEventListener("input", () => { settings.bgColor = bgColorPicker.value; bgHex.textContent = bgColorPicker.value; schedulePreviewRefresh(); });

document.getElementById("btn-refresh-preview").addEventListener("click", generatePreview);

// --- Back ---
document.getElementById("btn-back").addEventListener("click", () => {
  videoFile = null;
  showView("upload");
});

// --- Convert (real-time playback + MediaRecorder capture) ---
document.getElementById("btn-convert").addEventListener("click", async () => {
  if (converting) return;
  converting = true;

  showView("progress");

  const cols = computeCols();
  const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight);
  const rows = Math.round((cols * sourceVideo.videoHeight / sourceVideo.videoWidth) * (charW / charH));
  const outW = Math.ceil(cols * charW);
  const outH = rows * charH;

  const renderCanvas = document.createElement("canvas");
  renderCanvas.width = outW;
  renderCanvas.height = outH;
  const renderCtx = renderCanvas.getContext("2d");

  progressCanvas.width = outW;
  progressCanvas.height = outH;
  const progressCtx = progressCanvas.getContext("2d");

  const stream = renderCanvas.captureStream(30);
  const mimeType = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ].find((m) => MediaRecorder.isTypeSupported(m)) || "";
  const recorder = new MediaRecorder(stream, {
    ...(mimeType && { mimeType }),
    videoBitsPerSecond: 8_000_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const settingsSnapshot = { ...settings };
  const duration = sourceVideo.duration;

  recorder.start();
  sourceVideo.currentTime = 0;
  sourceVideo.playbackRate = 1;

  await new Promise((resolve) => {
    sourceVideo.onseeked = () => {
      sourceVideo.play();
      resolve();
    };
    sourceVideo.currentTime = 0;
  });

  const processFrame = () => {
    if (sourceVideo.paused || sourceVideo.ended) {
      recorder.stop();
      return;
    }

    renderFrame(renderCtx, sourceVideo, outW, outH);

    progressCtx.drawImage(renderCanvas, 0, 0);

    const pct = Math.min(99, (sourceVideo.currentTime / duration) * 100);
    progressStage.textContent = `Recording... ${formatDuration(sourceVideo.currentTime)} / ${formatDuration(duration)}`;
    progressFill.style.width = `${pct}%`;
    progressPercent.textContent = `${Math.round(pct)}%`;

    requestAnimationFrame(processFrame);
  };

  requestAnimationFrame(processFrame);

  await new Promise((resolve) => {
    recorder.onstop = resolve;
    sourceVideo.onended = () => {
      setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 100);
    };
  });

  sourceVideo.pause();

  const webmBlob = new Blob(chunks, { type: mimeType || "video/webm" });

  // Try converting webm → mp4 via ffmpeg.wasm (with 8s timeout)
  progressStage.textContent = "Converting to MP4...";
  progressFill.style.width = "95%";
  progressPercent.textContent = "95%";

  let convertedToMp4 = false;
  try {
    const ffPromise = (async () => {
      const ff = await getFFmpeg();
      await ff.writeFile("input.webm", new Uint8Array(await webmBlob.arrayBuffer()));
      await ff.exec(["-i", "input.webm", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-y", "output.mp4"]);
      return await ff.readFile("output.mp4");
    })();
    const timeout = new Promise((_, reject) => setTimeout(() => reject("timeout"), 8000));
    const data = await Promise.race([ffPromise, timeout]);
    if (outputURL) URL.revokeObjectURL(outputURL);
    outputBlob = new Blob([data.buffer], { type: "video/mp4" });
    outputURL = URL.createObjectURL(outputBlob);
    convertedToMp4 = true;
  } catch (err) {
    console.warn("MP4 conversion unavailable, downloading as webm:", err);
  }

  if (!convertedToMp4) {
    if (outputURL) URL.revokeObjectURL(outputURL);
    outputBlob = webmBlob;
    outputURL = URL.createObjectURL(outputBlob);
  }

  const ext = outputBlob?.type?.includes("mp4") ? "mp4" : "webm";
  progressFill.style.width = "100%";
  progressPercent.textContent = "100%";
  progressStage.textContent = "Done!";

  setTimeout(() => {
    document.getElementById("btn-download").textContent = `Download .${ext}`;
    showView("done");
    converting = false;
  }, 500);
});

// --- Done ---
document.getElementById("btn-download").addEventListener("click", () => {
  if (!outputURL) return;
  const a = document.createElement("a");
  a.href = outputURL;
  const ext = outputBlob?.type?.includes("mp4") ? "mp4" : "webm";
  a.download = `ascuwu_${(videoFile?.name || "output").replace(/\.[^.]+$/, "")}.${ext}`;
  a.click();
});

document.getElementById("btn-another").addEventListener("click", () => {
  videoFile = null;
  if (outputURL) { URL.revokeObjectURL(outputURL); outputURL = null; }
  outputBlob = null;
  showView("upload");
});



// ========= DROP ZONE KEYBOARD =========
const dz = document.getElementById("drop-zone");
dz?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    document.getElementById("file-input")?.click();
  }
});
