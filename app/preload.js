const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectVideo: () => ipcRenderer.invoke("select-video"),
  selectOutput: () => ipcRenderer.invoke("select-output"),
  getVideoInfo: (path) => ipcRenderer.invoke("get-video-info", path),
  extractPreviewFrame: (opts) => ipcRenderer.invoke("extract-preview-frame", opts),
  processVideo: (opts) => ipcRenderer.invoke("process-video", opts),
  readFrame: (path) => ipcRenderer.invoke("read-frame", path),
  writeFrame: (data) => ipcRenderer.invoke("write-frame", data),
  assembleVideo: (opts) => ipcRenderer.invoke("assemble-video", opts),
  cleanupTmp: (dir) => ipcRenderer.invoke("cleanup-tmp", dir),
  onProgress: (cb) => ipcRenderer.on("progress", (_, data) => cb(data)),
  onStartConversion: (cb) =>
    ipcRenderer.on("start-ascii-conversion", (_, data) => cb(data)),
  openFile: (path) => ipcRenderer.invoke("open-file", path),
});
