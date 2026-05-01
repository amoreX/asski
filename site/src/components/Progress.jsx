import { useRef, useEffect } from 'react'

export default function Progress({ stage, percent, canvasRef }) {
  return (
    <div className="w-full max-w-[580px] flex flex-col items-center gap-7">
      <div className="relative w-full aspect-video rounded-[10px] overflow-hidden bg-black border border-border">
        <canvas ref={canvasRef} className="w-full h-full object-contain" aria-label="Conversion progress" />
      </div>
      <div className="w-full text-center">
        <p className="text-sm font-medium mb-3.5" aria-live="polite">{stage}</p>
        <div className="w-full h-[3px] bg-border rounded overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-accent rounded transition-[width] duration-200 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <p className="font-mono text-[28px] font-semibold text-accent mt-2.5">{Math.round(percent)}%</p>
      </div>
    </div>
  )
}
