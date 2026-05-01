import { useRef, useEffect, useCallback, useState } from 'react'
import useAsciiRenderer, { measureChar } from '../hooks/useAsciiRenderer'

export default function Preview({ videoUrl, videoInfo, settings }) {
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const workRef = useRef(document.createElement('canvas'))
  const rafRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const { renderFrame } = useAsciiRenderer()

  const getDimensions = useCallback(() => {
    if (!videoInfo) return null
    const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight)
    const cols = Math.floor(videoInfo.width / charW)
    const rows = Math.round((cols * videoInfo.height / videoInfo.width) * (charW / charH))
    return { cols, rows, outW: Math.ceil(cols * charW), outH: rows * charH }
  }, [videoInfo, settings.fontSize, settings.fontWeight])

  const renderPreviewFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return
    const dims = getDimensions()
    if (!dims) return

    const work = workRef.current
    work.width = dims.outW
    work.height = dims.outH
    const ctx = work.getContext('2d')
    renderFrame(ctx, video, dims.outW, dims.outH, settings)

    canvas.width = dims.outW
    canvas.height = dims.outH
    canvas.getContext('2d').drawImage(work, 0, 0)
  }, [settings, getDimensions, renderFrame])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoUrl) return
    video.src = videoUrl
    setLoading(true)
    video.addEventListener('loadeddata', () => {
      renderPreviewFrame()
      setLoading(false)
    }, { once: true })
  }, [videoUrl])

  useEffect(() => {
    if (!playing) renderPreviewFrame()
  }, [settings, renderPreviewFrame, playing])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (playing) {
      video.pause()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setPlaying(false)
    } else {
      video.currentTime = 0
      video.play()
      setPlaying(true)

      const loop = () => {
        if (video.paused || video.ended) {
          setPlaying(false)
          return
        }
        renderPreviewFrame()
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
  }, [playing, renderPreviewFrame])

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  return (
    <div className="bg-raised border border-border rounded-[10px] overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border">
        <div className="flex gap-0.5 bg-bg rounded-[5px] p-0.5" role="radiogroup" aria-label="Render mode">
          {['overlay', 'replace'].map((mode) => (
            <button key={mode} role="radio" aria-checked={settings.renderMode === mode}
              onClick={() => settings.onModeChange(mode)}
              className={`py-1 px-3 rounded font-mono text-[11px] cursor-pointer transition-colors duration-150 ${
                settings.renderMode === mode ? 'bg-accent-dim text-accent' : 'text-dim hover:text-muted'
              }`}
            >{mode.charAt(0).toUpperCase() + mode.slice(1)}</button>
          ))}
        </div>
        <button onClick={renderPreviewFrame} className="p-1 rounded text-dim hover:text-accent transition-colors duration-150" aria-label="Refresh preview">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
      <div className="relative aspect-video bg-black flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full object-contain" aria-label="ASCII preview" />
        <video ref={videoRef} muted playsInline className="hidden" />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/85 z-10">
            <div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" />
            <span className="font-mono text-[11px] text-dim">Generating preview...</span>
          </div>
        )}

        <button onClick={togglePlay} aria-label={playing ? 'Pause preview' : 'Play preview'}
          className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/15 text-white cursor-pointer flex items-center justify-center z-20 backdrop-blur-sm hover:bg-black/80 transition-colors duration-150"
        >
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
        </button>
      </div>
    </div>
  )
}
