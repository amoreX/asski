import { useState, useRef, useCallback } from 'react'
import { Analytics } from '@vercel/analytics/react'
import Header from './components/Header'
import DropZone from './components/DropZone'
import Preview from './components/Preview'
import Settings from './components/Settings'
import Progress from './components/Progress'
import Done from './components/Done'
import useAsciiRenderer, { measureChar } from './hooks/useAsciiRenderer'

const DEFAULT_SETTINGS = {
  renderMode: 'overlay',
  fontSize: 10,
  fontWeight: 400,
  charset: '01',
  charsetPreset: 'binary',
  colorMode: 'original',
  tintColor: '#22d3ee',
  bgColor: '#000000',
  bgPreset: '#000000',
  dim: 40,
  boost: 60,
}

export default function App() {
  const [view, setView] = useState('upload')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [videoInfo, setVideoInfo] = useState(null)
  const [progress, setProgress] = useState({ stage: 'Preparing...', percent: 0 })
  const [outputUrl, setOutputUrl] = useState(null)
  const [outputBlob, setOutputBlob] = useState(null)
  const [converting, setConverting] = useState(false)

  const sourceVideoRef = useRef(null)
  const progressCanvasRef = useRef(null)
  const { renderFrame } = useAsciiRenderer()

  const handleFile = useCallback((file) => {
    setVideoFile(file)
    const url = URL.createObjectURL(file)
    setVideoUrl(url)

    const video = sourceVideoRef.current
    video.src = url
    video.addEventListener('loadeddata', () => {
      setVideoInfo({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      })
      setView('process')
    }, { once: true })
  }, [])

  const cols = videoInfo
    ? Math.floor(videoInfo.width / measureChar(settings.fontSize, settings.fontWeight).charW)
    : 0

  const handleConvert = useCallback(async () => {
    if (converting) return
    setConverting(true)
    setView('progress')
    setProgress({ stage: 'Preparing...', percent: 0 })

    // Wait for React to render the progress view so the canvas ref is available
    await new Promise((r) => setTimeout(r, 100))

    const video = sourceVideoRef.current
    const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight)
    const c = Math.floor(video.videoWidth / charW)
    const rows = Math.round((c * video.videoHeight / video.videoWidth) * (charW / charH))
    const outW = Math.ceil(c * charW)
    const outH = rows * charH

    const renderCanvas = document.createElement('canvas')
    renderCanvas.width = outW
    renderCanvas.height = outH
    const renderCtx = renderCanvas.getContext('2d')

    const pCanvas = progressCanvasRef.current
    if (pCanvas) { pCanvas.width = outW; pCanvas.height = outH }
    const pCtx = pCanvas?.getContext('2d')

    const stream = renderCanvas.captureStream(0)
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find((m) => MediaRecorder.isTypeSupported(m)) || ''
    const recorder = new MediaRecorder(stream, {
      ...(mimeType && { mimeType }),
      videoBitsPerSecond: 8_000_000,
    })
    const chunks = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    const duration = video.duration
    const fps = 30
    const totalFrames = Math.ceil(duration * fps)
    const frameDuration = 1 / fps

    recorder.start()
    const track = stream.getVideoTracks()[0]

    const seekTo = (t) => new Promise((resolve) => {
      video.onseeked = resolve
      video.currentTime = t
    })

    // Ensure video is ready before processing
    if (!video.videoWidth) {
      await new Promise((resolve) => {
        video.addEventListener('loadeddata', resolve, { once: true })
      })
    }

    const settingsSnapshot = { ...settings }

    for (let i = 0; i < totalFrames; i++) {
      await seekTo(Math.min(i * frameDuration, duration))
      renderFrame(renderCtx, video, outW, outH, settingsSnapshot)
      if (track.requestFrame) track.requestFrame()
      await new Promise((r) => setTimeout(r, 30))

      if (pCtx) pCtx.drawImage(renderCanvas, 0, 0)
      setProgress({
        stage: `Frame ${i + 1} / ${totalFrames}`,
        percent: Math.min(95, ((i + 1) / totalFrames) * 95),
      })
    }

    recorder.stop()
    await new Promise((resolve) => { recorder.onstop = resolve })

    const blob = new Blob(chunks, { type: mimeType || 'video/webm' })

    setProgress({ stage: 'Finalizing...', percent: 97 })

    // Try ffmpeg.wasm mp4 conversion with timeout
    let finalBlob = blob
    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { toBlobURL } = await import('@ffmpeg/util')

      const ff = new FFmpeg()
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      await ff.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })

      await ff.writeFile('input.webm', new Uint8Array(await blob.arrayBuffer()))
      await ff.exec(['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-y', 'output.mp4'])
      const data = await ff.readFile('output.mp4')
      finalBlob = new Blob([data.buffer], { type: 'video/mp4' })
    } catch (err) {
      console.warn('MP4 conversion unavailable, using webm:', err)
    }

    const url = URL.createObjectURL(finalBlob)
    setOutputBlob(finalBlob)
    setOutputUrl(url)
    setProgress({ stage: 'Done!', percent: 100 })

    setTimeout(() => {
      setView('done')
      setConverting(false)
    }, 500)
  }, [converting, settings, renderFrame])

  const handleAnother = useCallback(() => {
    setVideoFile(null)
    setVideoUrl(null)
    setVideoInfo(null)
    if (outputUrl) URL.revokeObjectURL(outputUrl)
    setOutputUrl(null)
    setOutputBlob(null)
    setView('upload')
  }, [outputUrl])

  const settingsWithModeChange = {
    ...settings,
    onModeChange: (mode) => setSettings((s) => ({ ...s, renderMode: mode })),
  }

  return (
    <div className="flex flex-col h-screen px-8 pb-8 font-body max-md:px-4 max-md:pb-4 max-md:h-auto max-md:min-h-screen">
      <Header />

      {view === 'upload' && (
        <main className="flex-1 flex items-center justify-center animate-fade-in">
          <DropZone onFile={handleFile} />
        </main>
      )}

      {view === 'process' && (
        <main className="flex-1 flex items-center justify-center animate-fade-in overflow-hidden">
          <div className="w-full flex gap-5 items-start max-md:flex-col">
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              <div className="flex gap-3.5 p-3.5 bg-raised border border-border rounded-[10px]">
                <div className="w-[120px] h-[68px] rounded-[6px] overflow-hidden bg-black shrink-0">
                  {videoUrl && <video src={videoUrl} muted className="w-full h-full object-cover" />}
                </div>
                <div className="flex flex-col justify-center gap-2 min-w-0">
                  <p className="text-[13px] font-medium truncate">{videoFile?.name || '--'}</p>
                  <div className="flex gap-1.5">
                    <span className="font-mono text-[10px] py-0.5 px-2 bg-accent-dim text-accent rounded-full">{videoInfo ? `${videoInfo.width}×${videoInfo.height}` : '--'}</span>
                    <span className="font-mono text-[10px] py-0.5 px-2 bg-accent-dim text-accent rounded-full">{videoInfo ? formatDur(videoInfo.duration) : '--'}</span>
                  </div>
                </div>
              </div>
              <Preview videoUrl={videoUrl} videoInfo={videoInfo} settings={settingsWithModeChange} />
            </div>
            <div className="w-80 shrink-0 flex flex-col gap-3 max-h-[calc(100vh-100px)] overflow-y-auto max-md:w-full max-md:max-h-none scrollbar-thin">
              <Settings settings={settings} onChange={setSettings} cols={cols} />
              <div className="flex justify-between gap-2.5">
                <button onClick={() => { setVideoFile(null); setVideoUrl(null); setVideoInfo(null); setView('upload') }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[6px] bg-transparent text-muted border border-border text-sm font-medium cursor-pointer hover:text-text hover:border-border-hover transition-colors duration-150">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  Back
                </button>
                <button onClick={handleConvert}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[6px] bg-accent text-white text-sm font-medium cursor-pointer hover:opacity-90 active:scale-[0.97] transition-all duration-150">
                  Convert
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {view === 'progress' && (
        <main className="flex-1 flex items-center justify-center animate-fade-in">
          <Progress stage={progress.stage} percent={progress.percent} canvasRef={progressCanvasRef} />
        </main>
      )}

      {view === 'done' && (
        <main className="flex-1 flex items-center justify-center animate-fade-in">
          <Done outputUrl={outputUrl} outputBlob={outputBlob} fileName={videoFile?.name} onAnother={handleAnother} />
        </main>
      )}

      <video ref={sourceVideoRef} muted playsInline className="hidden" />
      <Analytics />
    </div>
  )
}

function formatDur(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
