export default function Header() {
  return (
    <header className="flex items-center justify-between py-5">
      <div className="flex items-center gap-2.5">
        <span className="font-mono font-bold text-xs bg-accent text-black px-1.5 py-0.5 rounded leading-none" aria-hidden="true">01</span>
        <span className="font-mono font-semibold text-[15px] tracking-tight">ascwu</span>
      </div>
      <p className="font-mono text-xs text-dim uppercase tracking-widest">video → ascii</p>
    </header>
  )
}
