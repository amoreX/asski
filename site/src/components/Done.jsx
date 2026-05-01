export default function Done({ outputUrl, outputBlob, fileName, onAnother }) {
  const ext = outputBlob?.type?.includes('mp4') ? 'mp4' : 'webm'

  const handleDownload = () => {
    if (!outputUrl) return
    const a = document.createElement('a')
    a.href = outputUrl
    a.download = `ascuwu_${(fileName || 'output').replace(/\.[^.]+$/, '')}.${ext}`
    a.click()
  }

  return (
    <div className="text-center flex flex-col items-center gap-3.5">
      <div className="w-16 h-16 rounded-full bg-green-dim flex items-center justify-center text-green" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2 className="text-xl font-semibold">Done</h2>
      <p className="font-mono text-xs text-dim">Your ASCII video is ready.</p>
      <div className="flex gap-2.5 mt-1.5">
        <button onClick={handleDownload} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[6px] bg-accent text-white text-sm font-medium cursor-pointer hover:opacity-90 active:scale-[0.97] transition-all duration-150">
          Download .{ext}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button onClick={onAnother} className="px-5 py-2.5 rounded-[6px] bg-transparent text-muted border border-border text-sm font-medium cursor-pointer hover:text-text hover:border-border-hover transition-colors duration-150">
          Convert Another
        </button>
      </div>
    </div>
  )
}
