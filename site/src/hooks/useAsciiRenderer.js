import { useRef, useCallback } from 'react'

const PRESETS = {
  binary: '01',
  ascii: ' .,:;=+x*X#%@&$',
  blocks: ' ░▒▓█',
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function getColor(settings, red, grn, blu, brightness) {
  if (settings.colorMode === 'original') return [red, grn, blu]
  if (settings.colorMode === 'mono') {
    const b = Math.floor(brightness)
    return [b, b, b]
  }
  const t = hexToRgb(settings.tintColor)
  const f = brightness / 255
  return [Math.floor(t.r * f), Math.floor(t.g * f), Math.floor(t.b * f)]
}

function measureChar(fontSize, fontWeight) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  ctx.font = `${fontWeight} ${fontSize}px "JetBrains Mono", "Courier New", monospace`
  return { charW: ctx.measureText('M').width, charH: fontSize }
}

function renderReplaceFrame(ctx, settings, pixels, cols, rows, charW, charH, charset) {
  const bgR = hexToRgb(settings.bgColor)
  const blend = 0.35

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 4
      const red = pixels[idx], grn = pixels[idx + 1], blu = pixels[idx + 2]
      const brightness = red * 0.299 + grn * 0.587 + blu * 0.114
      const x = Math.round(c * charW), y = r * charH
      const cellW = Math.round((c + 1) * charW) - x
      const [cr, cg, cb] = getColor(settings, red, grn, blu, brightness)

      ctx.fillStyle = `rgb(${Math.floor(bgR.r * (1 - blend) + cr * blend)},${Math.floor(bgR.g * (1 - blend) + cg * blend)},${Math.floor(bgR.b * (1 - blend) + cb * blend)})`
      ctx.fillRect(x, y, cellW, charH)

      const charIdx = Math.min(Math.floor((brightness / 255) * charset.length), charset.length - 1)
      const char = charset[charIdx]
      if (char === ' ') continue

      ctx.fillStyle = `rgb(${cr},${cg},${cb})`
      ctx.fillText(char, x, y)
    }
  }
}

function renderOverlayFrame(ctx, settings, source, cols, rows, charW, charH, charset, outW, outH) {
  const dimFactor = 1 - settings.dim / 100
  const boost = settings.boost

  ctx.drawImage(source, 0, 0, outW, outH)
  ctx.fillStyle = `rgba(0, 0, 0, ${1 - dimFactor})`
  ctx.fillRect(0, 0, outW, outH)

  const sc = document.createElement('canvas')
  sc.width = cols
  sc.height = rows
  const sctx = sc.getContext('2d')
  sctx.drawImage(source, 0, 0, cols, rows)
  const pixels = sctx.getImageData(0, 0, cols, rows).data

  ctx.font = `${settings.fontWeight} ${settings.fontSize}px "JetBrains Mono", "Courier New", monospace`
  ctx.textBaseline = 'top'

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 4
      const red = pixels[idx], grn = pixels[idx + 1], blu = pixels[idx + 2]
      const brightness = red * 0.299 + grn * 0.587 + blu * 0.114

      const charIdx = Math.min(Math.floor((brightness / 255) * charset.length), charset.length - 1)
      const char = charset[charIdx]
      if (char === ' ') continue

      let [cr, cg, cb] = getColor(settings, red, grn, blu, brightness)
      cr = Math.min(255, cr + boost)
      cg = Math.min(255, cg + boost)
      cb = Math.min(255, cb + boost)

      ctx.fillStyle = `rgb(${cr},${cg},${cb})`
      ctx.fillText(char, Math.round(c * charW), r * charH)
    }
  }
}

export { PRESETS, measureChar }

export default function useAsciiRenderer() {
  const workCanvasRef = useRef(null)

  const computeDimensions = useCallback((videoWidth, videoHeight, settings) => {
    const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight)
    const cols = Math.floor(videoWidth / charW)
    const rows = Math.round((cols * videoHeight / videoWidth) * (charW / charH))
    const outW = Math.ceil(cols * charW)
    const outH = rows * charH
    return { cols, rows, outW, outH, charW, charH }
  }, [])

  const renderFrame = useCallback((ctx, source, outW, outH, settings) => {
    const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight)
    const cols = Math.floor(source.videoWidth / charW)
    const rows = Math.round((cols * source.videoHeight / source.videoWidth) * (charW / charH))

    if (settings.renderMode === 'overlay') {
      renderOverlayFrame(ctx, settings, source, cols, rows, charW, charH, settings.charset, outW, outH)
    } else {
      const sc = document.createElement('canvas')
      sc.width = cols
      sc.height = rows
      sc.getContext('2d').drawImage(source, 0, 0, cols, rows)
      const pixels = sc.getContext('2d').getImageData(0, 0, cols, rows).data
      ctx.fillStyle = settings.bgColor
      ctx.fillRect(0, 0, outW, outH)
      ctx.font = `${settings.fontWeight} ${settings.fontSize}px "JetBrains Mono", "Courier New", monospace`
      ctx.textBaseline = 'top'
      renderReplaceFrame(ctx, settings, pixels, cols, rows, charW, charH, settings.charset)
    }
  }, [])

  const renderFrameFromImage = useCallback((ctx, img, outW, outH, settings) => {
    const { charW, charH } = measureChar(settings.fontSize, settings.fontWeight)
    const cols = Math.floor(img.width / charW)
    const rows = Math.round((cols * img.height / img.width) * (charW / charH))

    if (settings.renderMode === 'overlay') {
      renderOverlayFrame(ctx, settings, img, cols, rows, charW, charH, settings.charset, outW, outH)
    } else {
      const sc = document.createElement('canvas')
      sc.width = cols
      sc.height = rows
      sc.getContext('2d').drawImage(img, 0, 0, cols, rows)
      const pixels = sc.getContext('2d').getImageData(0, 0, cols, rows).data
      ctx.fillStyle = settings.bgColor
      ctx.fillRect(0, 0, outW, outH)
      ctx.font = `${settings.fontWeight} ${settings.fontSize}px "JetBrains Mono", "Courier New", monospace`
      ctx.textBaseline = 'top'
      renderReplaceFrame(ctx, settings, pixels, cols, rows, charW, charH, settings.charset)
    }
  }, [])

  return { workCanvasRef, computeDimensions, renderFrame, renderFrameFromImage }
}
