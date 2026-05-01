const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");

let mainWindow;

function createWindow() {
  protocol.handle("local-video", (request) => {
    const filePath = decodeURIComponent(request.url.replace("local-video://", ""));
    return net.fetch(`file://${filePath}`);
  });

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#09090b",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");
}

protocol.registerSchemesAsPrivileged([
  { scheme: "local-video", privileges: { stream: true, bypassCSP: true } },
]);

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

ipcMain.handle("select-video", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Videos", extensions: ["mp4", "mov", "avi", "mkv", "webm"] },
    ],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("select-output", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: "ascii_output.mp4",
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle("get-video-info", async (_, filePath) => {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      (error, stdout) => {
        if (error) return reject(error.message);
        try {
          const info = JSON.parse(stdout);
          const videoStream = info.streams.find(
            (s) => s.codec_type === "video"
          );
          if (!videoStream) return reject("No video stream found");
          const [num, den] = (videoStream.r_frame_rate || "30/1").split("/");
          resolve({
            width: parseInt(videoStream.width),
            height: parseInt(videoStream.height),
            fps: Math.round(parseInt(num) / parseInt(den)),
            duration: parseFloat(info.format.duration),
            hasAudio: info.streams.some((s) => s.codec_type === "audio"),
          });
        } catch (e) {
          reject(e.message);
        }
      }
    );
  });
});

ipcMain.handle(
  "process-video",
  async (event, { inputPath, outputPath, cols, fontSize }) => {
    const tmpDir = path.join(app.getPath("temp"), `ascuwu_${Date.now()}`);
    const framesDir = path.join(tmpDir, "frames");
    const asciiDir = path.join(tmpDir, "ascii");
    fs.mkdirSync(framesDir, { recursive: true });
    fs.mkdirSync(asciiDir, { recursive: true });

    try {
      mainWindow.webContents.send("progress", {
        stage: "Extracting frames...",
        percent: 0,
      });

      await new Promise((resolve, reject) => {
        const proc = spawn("ffmpeg", [
          "-i",
          inputPath,
          "-vsync",
          "cfr",
          path.join(framesDir, "frame_%06d.png"),
        ]);
        proc.on("close", (code) =>
          code === 0 ? resolve() : reject(`ffmpeg extract failed: ${code}`)
        );
        proc.on("error", reject);
      });

      const frameFiles = fs
        .readdirSync(framesDir)
        .filter((f) => f.endsWith(".png"))
        .sort();
      const totalFrames = frameFiles.length;

      mainWindow.webContents.send("progress", {
        stage: "Converting frames to binary...",
        percent: 5,
      });

      mainWindow.webContents.send("start-ascii-conversion", {
        framesDir,
        asciiDir,
        frameFiles,
        cols,
        fontSize,
      });

      return {
        tmpDir,
        framesDir,
        asciiDir,
        totalFrames,
        inputPath,
        outputPath,
      };
    } catch (err) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw err;
    }
  }
);

ipcMain.handle("extract-preview-frame", async (_, { filePath, time }) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const proc = spawn("ffmpeg", [
      "-ss", String(time || 0.5),
      "-i", filePath,
      "-frames:v", "1",
      "-f", "image2pipe",
      "-vcodec", "png",
      "pipe:1",
    ]);
    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) return reject("Failed to extract frame");
      resolve(Buffer.concat(chunks).toString("base64"));
    });
    proc.on("error", reject);
  });
});

ipcMain.handle("read-frame", async (_, framePath) => {
  return fs.readFileSync(framePath).toString("base64");
});

ipcMain.handle("write-frame", async (_, { framePath, dataUrl }) => {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(framePath, Buffer.from(base64, "base64"));
});

ipcMain.handle(
  "assemble-video",
  async (
    _,
    { asciiDir, outputPath, inputPath, fps, hasAudio, totalFrames }
  ) => {
    mainWindow.webContents.send("progress", {
      stage: "Assembling video...",
      percent: 90,
    });

    const args = [
      "-framerate",
      String(fps),
      "-i",
      path.join(asciiDir, "frame_%06d.png"),
    ];

    if (hasAudio) {
      args.push("-i", inputPath, "-map", "0:v", "-map", "1:a", "-shortest");
    }

    args.push(
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-preset",
      "fast",
      "-y",
      outputPath
    );

    await new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", args);
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(`ffmpeg assemble failed: ${code}`)
      );
      proc.on("error", reject);
    });

    mainWindow.webContents.send("progress", { stage: "Done!", percent: 100 });
    return outputPath;
  }
);

ipcMain.handle("cleanup-tmp", async (_, tmpDir) => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

ipcMain.handle("open-file", async (_, filePath) => {
  const { shell } = require("electron");
  shell.showItemInFolder(filePath);
});
