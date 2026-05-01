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
const videoPreview = document.getElementById("video-preview");
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
const previewCanvas = document.getElementById("preview-canvas");
const livePreviewCanvas = document.getElementById("live-preview-canvas");
const workCanvas = document.getElementById("work-canvas");
const progressFill = document.getElementById("progress-fill");
const progressStage = document.getElementById("progress-stage");
const progressPercent = document.getElementById("progress-percent");
const tintColor = document.getElementById("tint-color");
const tintHex = document.getElementById("tint-hex");
const bgColorPicker = document.getElementById("bg-color");
const bgHex = document.getElementById("bg-hex");
const previewLoader = document.getElementById("preview-loader");

let currentVideoPath = null;
let videoInfo = null;
let outputPath = null;
let previewFrameImg = null;
let previewDebounceTimer = null;

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

function computeCols() {
  if (!videoInfo) return 160;
  const { charW } = measureChar(settings.fontSize, settings.fontWeight);
  return Math.floor(videoInfo.width / charW);
}

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[name].classList.add("active");
}

function measureChar(fontSize, fontWeight) {
  const tmpCanvas = document.createElement("canvas");
  const tmpCtx = tmpCanvas.getContext("2d");
  tmpCtx.font = `${fontWeight} ${fontSize}px "JetBrains Mono", "Courier New", monospace`;
  const metrics = tmpCtx.measureText("M");
  return { charW: metrics.width, charH: fontSize };
}

// --- Replace mode renderer (existing: chars on solid bg) ---
function renderReplaceFrame(ctx, pixels, cols, rows, charW, charH, charset) {
  const bgR = hexToRgb(settings.bgColor);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 4;
      const red = pixels[idx], grn = pixels[idx + 1], blu = pixels[idx + 2];
      const brightness = red * 0.299 + grn * 0.587 + blu * 0.114;

      const x = Math.round(c * charW);
      const y = r * charH;
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

// --- Overlay mode renderer (original image dimmed + boosted chars on top) ---
function renderOverlayFrame(ctx, sourceImg, cols, rows, charW, charH, charset, outW, outH) {
  const dimFactor = 1 - settings.dim / 100;
  const boost = settings.boost;

  // Draw original image scaled to output size, then dim it
  ctx.drawImage(sourceImg, 0, 0, outW, outH);
  ctx.fillStyle = `rgba(0, 0, 0, ${1 - dimFactor})`;
  ctx.fillRect(0, 0, outW, outH);

  // Sample source at grid resolution for character picking
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  const sampleCtx = sampleCanvas.getContext("2d");
  sampleCtx.drawImage(sourceImg, 0, 0, cols, rows);
  const pixels = sampleCtx.getImageData(0, 0, cols, rows).data;

  // Draw characters on top
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

      const x = Math.round(c * charW);
      const y = r * charH;

      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillText(char, x, y);
    }
  }
}

function getColor(red, grn, blu, brightness) {
  if (settings.colorMode === "original") {
    return [red, grn, blu];
  } else if (settings.colorMode === "mono") {
    const b = Math.floor(brightness);
    return [b, b, b];
  } else {
    const t = hexToRgb(settings.tintColor);
    const f = brightness / 255;
    return [Math.floor(t.r * f), Math.floor(t.g * f), Math.floor(t.b * f)];
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
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

// --- Drop zone ---
dropZone.addEventListener("click", async () => {
  const path = await window.api.selectVideo();
  if (path) loadVideo(path);
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) loadVideo(file.path);
});

async function loadVideo(path) {
  currentVideoPath = path;
  try {
    videoInfo = await window.api.getVideoInfo(path);
  } catch (err) {
    alert("Could not read video: " + err);
    return;
  }

  videoPreview.src = `local-video://${encodeURIComponent(path)}`;
  document.getElementById("video-name").textContent = path.split("/").pop();
  document.getElementById("pill-res").textContent = `${videoInfo.width}×${videoInfo.height}`;
  document.getElementById("pill-fps").textContent = `${videoInfo.fps} fps`;
  document.getElementById("pill-dur").textContent = formatDuration(videoInfo.duration);

  showView("process");
  updateColsDisplay();
  await extractAndPreview(path);
}

async function extractAndPreview(path) {
  previewLoader.classList.remove("hidden");
  try {
    const seekTime = Math.min(0.5, videoInfo.duration * 0.1);
    const base64 = await window.api.extractPreviewFrame({ filePath: path, time: seekTime });
    previewFrameImg = await loadImage(`data:image/png;base64,${base64}`);
    generatePreview();
  } catch (err) {
    console.error("Preview extraction failed:", err);
  }
  previewLoader.classList.add("hidden");
}

function schedulePreviewRefresh() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => {
    if (previewFrameImg) {
      previewLoader.classList.remove("hidden");
      requestAnimationFrame(() => {
        generatePreview();
        previewLoader.classList.add("hidden");
      });
    }
  }, 150);
}

// --- Live playback preview ---
let previewPlaying = false;
let previewRAF = null;
const playBtn = document.getElementById("btn-play-preview");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");

playBtn?.addEventListener("click", () => {
  previewPlaying ? stopPreviewPlayback() : startPreviewPlayback();
});

function renderFrameFromVideo(ctx, video, outW, outH) {
  const cols = computeCols();
  const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight);
  const rows = Math.round((cols * video.videoHeight / video.videoWidth) * (charW / charH));
  const charset = settings.charset;

  if (settings.renderMode === "overlay") {
    const dimFactor = 1 - settings.dim / 100;
    ctx.drawImage(video, 0, 0, outW, outH);
    ctx.fillStyle = `rgba(0,0,0,${1 - dimFactor})`;
    ctx.fillRect(0, 0, outW, outH);

    const sc = document.createElement("canvas");
    sc.width = cols; sc.height = rows;
    sc.getContext("2d").drawImage(video, 0, 0, cols, rows);
    const pixels = sc.getContext("2d").getImageData(0, 0, cols, rows).data;

    ctx.font = `${settings.fontWeight} ${settings.fontSize}px "JetBrains Mono", "Courier New", monospace`;
    ctx.textBaseline = "top";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = (r * cols + c) * 4;
        const red = pixels[idx], grn = pixels[idx+1], blu = pixels[idx+2];
        const brightness = red * 0.299 + grn * 0.587 + blu * 0.114;
        const charIdx = Math.min(Math.floor((brightness / 255) * charset.length), charset.length - 1);
        const char = charset[charIdx];
        if (char === " ") continue;
        let [cr, cg, cb] = getColor(red, grn, blu, brightness);
        cr = Math.min(255, cr + settings.boost);
        cg = Math.min(255, cg + settings.boost);
        cb = Math.min(255, cb + settings.boost);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillText(char, Math.round(c * charW), r * charH);
      }
    }
  } else {
    const sc = document.createElement("canvas");
    sc.width = cols; sc.height = rows;
    sc.getContext("2d").drawImage(video, 0, 0, cols, rows);
    const pixels = sc.getContext("2d").getImageData(0, 0, cols, rows).data;
    const bgR = hexToRgb(settings.bgColor);

    ctx.fillStyle = settings.bgColor;
    ctx.fillRect(0, 0, outW, outH);
    ctx.font = `${settings.fontWeight} ${settings.fontSize}px "JetBrains Mono", "Courier New", monospace`;
    ctx.textBaseline = "top";
    renderReplaceFrame(ctx, pixels, cols, rows, charW, charH, charset);
  }
}

function startPreviewPlayback() {
  if (!videoPreview.videoWidth) return;
  previewPlaying = true;
  playIcon.style.display = "none";
  pauseIcon.style.display = "block";
  videoPreview.currentTime = 0;
  videoPreview.play();

  const cols = computeCols();
  const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight);
  const rows = Math.round((cols * videoPreview.videoHeight / videoPreview.videoWidth) * (charW / charH));
  const outW = Math.ceil(cols * charW);
  const outH = rows * charH;

  livePreviewCanvas.width = outW;
  livePreviewCanvas.height = outH;
  const ctx = livePreviewCanvas.getContext("2d");

  const renderLoop = () => {
    if (!previewPlaying || videoPreview.paused || videoPreview.ended) {
      stopPreviewPlayback();
      return;
    }
    workCanvas.width = outW;
    workCanvas.height = outH;
    const wCtx = workCanvas.getContext("2d");
    renderFrameFromVideo(wCtx, videoPreview, outW, outH);
    ctx.drawImage(workCanvas, 0, 0);
    previewRAF = requestAnimationFrame(renderLoop);
  };
  previewRAF = requestAnimationFrame(renderLoop);
}

function stopPreviewPlayback() {
  previewPlaying = false;
  videoPreview.pause();
  if (previewRAF) cancelAnimationFrame(previewRAF);
  playIcon.style.display = "block";
  pauseIcon.style.display = "none";
}

function formatDuration(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// --- Sliders ---
function updateColsDisplay() {
  const cols = computeCols();
  if (colsValue) colsValue.textContent = `${cols} cols (auto)`;
}

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

// --- Charset presets ---
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const preset = btn.dataset.preset;
    if (preset === "custom") {
      charsetInput.focus();
    } else {
      settings.charset = PRESETS[preset];
      charsetInput.value = settings.charset;
      schedulePreviewRefresh();
    }
  });
});

charsetInput.addEventListener("input", () => {
  if (charsetInput.value.length > 0) settings.charset = charsetInput.value;
  document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
  const match = Object.entries(PRESETS).find(([, v]) => v === charsetInput.value);
  if (match) {
    document.querySelector(`.preset-btn[data-preset="${match[0]}"]`)?.classList.add("active");
  } else {
    document.querySelector('.preset-btn[data-preset="custom"]')?.classList.add("active");
  }
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

tintColor.addEventListener("input", () => {
  settings.tintColor = tintColor.value;
  tintHex.textContent = tintColor.value;
  schedulePreviewRefresh();
});

// --- Background (replace mode only) ---
document.querySelectorAll(".bg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".bg-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const bg = btn.dataset.bg;
    if (bg === "custom") {
      document.getElementById("bg-picker-row").classList.remove("hidden");
      settings.bgColor = bgColorPicker.value;
    } else {
      document.getElementById("bg-picker-row").classList.add("hidden");
      settings.bgColor = bg;
    }
    schedulePreviewRefresh();
  });
});

bgColorPicker.addEventListener("input", () => {
  settings.bgColor = bgColorPicker.value;
  bgHex.textContent = bgColorPicker.value;
  schedulePreviewRefresh();
});

// --- Preview ---
document.getElementById("btn-refresh-preview").addEventListener("click", () => {
  if (previewFrameImg) {
    previewLoader.classList.remove("hidden");
    requestAnimationFrame(() => {
      generatePreview();
      previewLoader.classList.add("hidden");
    });
  }
});

function generatePreview() {
  if (!previewFrameImg) return;

  const canvas = workCanvas;
  const ctx = canvas.getContext("2d");
  const previewCtx = livePreviewCanvas.getContext("2d");

  const cols = computeCols();
  const fontSize = settings.fontSize;
  const charset = settings.charset;
  const { charW, charH } = measureChar(fontSize, settings.fontWeight);

  const srcW = previewFrameImg.width;
  const srcH = previewFrameImg.height;
  const rows = Math.round((cols * srcH / srcW) * (charW / charH));
  const outW = Math.ceil(cols * charW);
  const outH = rows * charH;

  canvas.width = outW;
  canvas.height = outH;

  if (settings.renderMode === "overlay") {
    renderOverlayFrame(ctx, previewFrameImg, cols, rows, charW, charH, charset, outW, outH);
  } else {
    // Sample pixels for replace mode
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = cols;
    sampleCanvas.height = rows;
    const sampleCtx = sampleCanvas.getContext("2d");
    sampleCtx.drawImage(previewFrameImg, 0, 0, cols, rows);
    const pixels = sampleCtx.getImageData(0, 0, cols, rows).data;

    ctx.fillStyle = settings.bgColor;
    ctx.fillRect(0, 0, outW, outH);
    ctx.font = `${settings.fontWeight} ${fontSize}px "JetBrains Mono", "Courier New", monospace`;
    ctx.textBaseline = "top";
    renderReplaceFrame(ctx, pixels, cols, rows, charW, charH, charset);
  }

  livePreviewCanvas.width = outW;
  livePreviewCanvas.height = outH;
  previewCtx.drawImage(canvas, 0, 0);
}

// --- Back ---
document.getElementById("btn-back").addEventListener("click", () => {
  currentVideoPath = null;
  videoInfo = null;
  showView("upload");
});

// --- Convert ---
document.getElementById("btn-convert").addEventListener("click", async () => {
  const out = await window.api.selectOutput();
  if (!out) return;
  outputPath = out;

  showView("progress");

  try {
    const result = await window.api.processVideo({
      inputPath: currentVideoPath,
      outputPath: out,
      cols: computeCols(),
      fontSize: settings.fontSize,
    });

    window._processResult = result;
  } catch (err) {
    alert("Error: " + err);
    showView("process");
  }
});

// --- Progress ---
window.api.onProgress(({ stage, percent }) => {
  progressStage.textContent = stage;
  progressFill.style.width = `${percent}%`;
  progressPercent.textContent = `${Math.round(percent)}%`;

  if (percent >= 100) {
    setTimeout(() => {
      document.getElementById("done-path").textContent = outputPath;
      showView("done");
    }, 600);
  }
});

// --- Frame-by-frame conversion ---
window.api.onStartConversion(
  async ({ framesDir, asciiDir, frameFiles, cols, fontSize }) => {
    const totalFrames = frameFiles.length;
    const ctx = workCanvas.getContext("2d");
    const previewCtx = previewCanvas.getContext("2d");

    const charset = settings.charset;
    const { charW, charH } = measureChar(fontSize, settings.fontWeight);
    const isOverlay = settings.renderMode === "overlay";

    for (let i = 0; i < totalFrames; i++) {
      const framePath = `${framesDir}/${frameFiles[i]}`;
      const base64 = await window.api.readFrame(framePath);
      const img = await loadImage(`data:image/png;base64,${base64}`);

      const rows = Math.round((cols * img.height / img.width) * (charW / charH));
      const outW = Math.ceil(cols * charW);
      const outH = rows * charH;

      workCanvas.width = outW;
      workCanvas.height = outH;

      if (isOverlay) {
        renderOverlayFrame(ctx, img, cols, rows, charW, charH, charset, outW, outH);
      } else {
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = cols;
        sampleCanvas.height = rows;
        const sampleCtx = sampleCanvas.getContext("2d");
        sampleCtx.drawImage(img, 0, 0, cols, rows);
        const pixels = sampleCtx.getImageData(0, 0, cols, rows).data;

        ctx.fillStyle = settings.bgColor;
        ctx.fillRect(0, 0, outW, outH);
        ctx.font = `${settings.fontWeight} ${fontSize}px "JetBrains Mono", "Courier New", monospace`;
        ctx.textBaseline = "top";
        renderReplaceFrame(ctx, pixels, cols, rows, charW, charH, charset);
      }

      const dataUrl = workCanvas.toDataURL("image/png");
      const outFramePath = `${asciiDir}/${frameFiles[i]}`;
      await window.api.writeFrame({ framePath: outFramePath, dataUrl });

      if (i % 5 === 0 || i === totalFrames - 1) {
        previewCanvas.width = outW;
        previewCanvas.height = outH;
        previewCtx.drawImage(workCanvas, 0, 0);
      }

      const percent = 5 + (i / totalFrames) * 85;
      progressStage.textContent = `Converting frame ${i + 1} / ${totalFrames}`;
      progressFill.style.width = `${percent}%`;
      progressPercent.textContent = `${Math.round(percent)}%`;

      if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    const result = window._processResult;
    try {
      await window.api.assembleVideo({
        asciiDir,
        outputPath: result.outputPath,
        inputPath: result.inputPath,
        fps: videoInfo.fps,
        hasAudio: videoInfo.hasAudio,
        totalFrames,
      });
      await window.api.cleanupTmp(result.tmpDir);
    } catch (err) {
      alert("Assembly error: " + err);
      showView("process");
    }
  }
);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// --- Done ---
document.getElementById("btn-open").addEventListener("click", () => {
  window.api.openFile(outputPath);
});

document.getElementById("btn-another").addEventListener("click", () => {
  currentVideoPath = null;
  videoInfo = null;
  outputPath = null;
  showView("upload");
});
