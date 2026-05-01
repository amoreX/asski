import { useRef, useState, useCallback } from 'react'

export default function DropZone({ onFile }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0])
  }, [onFile])

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload video file"
      className={`w-full max-w-[520px] aspect-[16/10] border-[1.5px] border-dashed rounded-[10px] flex items-center justify-center cursor-pointer transition-colors duration-200 ${
        dragOver ? 'border-accent bg-accent-dim border-solid' : 'border-border hover:border-accent hover:bg-accent-dim'
      }`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() }}}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="text-center">
        <div className={`mb-3.5 transition-colors duration-200 ${dragOver ? 'text-accent' : 'text-dim'}`}>
          <svg className="mx-auto" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <p className="text-base font-medium mb-1">Drop your video here</p>
        <p className="text-sm text-muted mb-3">or click to browse</p>
        <p className="font-mono text-[11px] text-dim tracking-wider">MP4 / MOV / WebM</p>
      </div>
      <input ref={inputRef} type="file" accept="video/*" hidden onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
    </div>
  )
}
