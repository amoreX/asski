import { PRESETS } from '../hooks/useAsciiRenderer'

function Slider({ id, label, value, min, max, step, hints, onChange }) {
  return (
    <div className="mb-4">
      <label className="flex justify-between items-center text-[13px] font-medium mb-2" htmlFor={id}>
        {label}
        <span className="font-mono text-[11px] text-accent">{value}</span>
      </label>
      <input type="range" id={id} min={min} max={max} step={step} value={typeof value === 'string' ? parseInt(value) : value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-[3px] rounded bg-border appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"
      />
      {hints && <div className="flex justify-between text-[10px] text-dim mt-1"><span>{hints[0]}</span><span>{hints[1]}</span></div>}
    </div>
  )
}

function ButtonGroup({ options, value, onChange, label }) {
  return (
    <div className="mb-4">
      <p className="text-[13px] font-medium mb-2">{label}</p>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button key={opt.value} onClick={() => onChange(opt.value)}
            className={`flex-1 py-1.5 px-1.5 border rounded-[6px] font-mono text-[11px] cursor-pointer transition-colors duration-150 whitespace-nowrap ${
              value === opt.value ? 'bg-accent-dim text-accent border-accent' : 'bg-transparent text-muted border-border hover:border-border-hover hover:text-text'
            }`}
          >{opt.label}</button>
        ))}
      </div>
    </div>
  )
}

export default function Settings({ settings, onChange, cols }) {
  const set = (key) => (val) => onChange({ ...settings, [key]: val })

  return (
    <div className="p-4 bg-raised border border-border rounded-[10px]">
      <h3 className="font-mono text-[11px] text-dim uppercase tracking-[0.1em] mb-4">Settings</h3>

      <Slider id="font-slider" label="Character Size" value={`${settings.fontSize}px`} min={4} max={24} step={1} hints={['More Detail', 'Larger']} onChange={set('fontSize')} />

      <div className="mb-4">
        <p className="flex justify-between items-center text-[13px] font-medium mb-1">
          Resolution <span className="font-mono text-[11px] text-accent">{cols} cols</span>
        </p>
        <p className="text-[11px] text-dim">Auto-matched to source.</p>
      </div>

      <ButtonGroup label="Character Set" value={settings.charsetPreset} onChange={(preset) => {
        if (preset === 'custom') return onChange({ ...settings, charsetPreset: 'custom' })
        onChange({ ...settings, charsetPreset: preset, charset: PRESETS[preset] })
      }} options={[
        { value: 'binary', label: '01' },
        { value: 'ascii', label: 'ASCII' },
        { value: 'blocks', label: 'Blocks' },
        { value: 'custom', label: 'Custom' },
      ]} />

      <div className="mb-4 -mt-2">
        <input type="text" value={settings.charset} spellCheck={false} aria-label="Custom character set"
          onChange={(e) => {
            if (e.target.value.length > 0) {
              const match = Object.entries(PRESETS).find(([, v]) => v === e.target.value)
              onChange({ ...settings, charset: e.target.value, charsetPreset: match ? match[0] : 'custom' })
            }
          }}
          className="w-full py-1.5 px-2.5 border border-border rounded-[6px] bg-bg text-text font-mono text-xs outline-none focus:border-accent transition-colors duration-150"
        />
      </div>

      <ButtonGroup label="Color Mode" value={settings.colorMode} onChange={set('colorMode')} options={[
        { value: 'original', label: 'Original' },
        { value: 'mono', label: 'Mono' },
        { value: 'tint', label: 'Tint' },
      ]} />

      {settings.colorMode === 'tint' && (
        <div className="flex items-center gap-2 mb-4 -mt-2">
          <input type="color" value={settings.tintColor} onChange={(e) => set('tintColor')(e.target.value)} className="w-7 h-7 border-[1.5px] border-border rounded-[6px] bg-transparent cursor-pointer p-0" />
          <span className="font-mono text-[11px] text-muted">{settings.tintColor}</span>
        </div>
      )}

      <ButtonGroup label="Background" value={settings.bgPreset} onChange={(val) => {
        if (val === 'custom') return onChange({ ...settings, bgPreset: 'custom' })
        onChange({ ...settings, bgPreset: val, bgColor: val })
      }} options={[
        { value: '#000000', label: 'Black' },
        { value: '#09090b', label: 'Zinc' },
        { value: '#ffffff', label: 'White' },
        { value: 'custom', label: 'Pick' },
      ]} />

      {settings.bgPreset === 'custom' && (
        <div className="flex items-center gap-2 mb-4 -mt-2">
          <input type="color" value={settings.bgColor} onChange={(e) => onChange({ ...settings, bgColor: e.target.value })} className="w-7 h-7 border-[1.5px] border-border rounded-[6px] bg-transparent cursor-pointer p-0" />
          <span className="font-mono text-[11px] text-muted">{settings.bgColor}</span>
        </div>
      )}

      {settings.renderMode === 'overlay' && (
        <>
          <Slider id="dim-slider" label="Image Dim" value={`${settings.dim}%`} min={0} max={80} step={5} onChange={set('dim')} />
          <Slider id="boost-slider" label="Character Boost" value={settings.boost} min={0} max={150} step={5} onChange={set('boost')} />
        </>
      )}

      <Slider id="weight-slider" label="Font Weight" value={settings.fontWeight} min={100} max={900} step={100} onChange={set('fontWeight')} />
    </div>
  )
}
