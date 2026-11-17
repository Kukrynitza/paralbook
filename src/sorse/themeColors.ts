const HEX = /^#([0-9a-f]{6})$/i

export function normalizeHex(value: unknown, fallback: string) {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex, '#000000').slice(1)
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

export function rgbToHex(red: number, green: number, blue: number) {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
  return `#${part(red)}${part(green)}${part(blue)}`
}

export function mix(first: string, second: string, weight: number) {
  const ratio = Math.max(0, Math.min(1, weight))
  const [r1, g1, b1] = hexToRgb(first)
  const [r2, g2, b2] = hexToRgb(second)
  return rgbToHex(r1 + (r2 - r1) * ratio, g1 + (g2 - g1) * ratio, b1 + (b2 - b1) * ratio)
}

export function alpha(hex: string, value: number) {
  const [red, green, blue] = hexToRgb(hex)
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, value))})`
}

export function darken(hex: string, amount: number) {
  return mix(hex, '#000000', amount)
}

export function lighten(hex: string, amount: number) {
  return mix(hex, '#ffffff', amount)
}

function channel(value: number) {
  const normalized = value / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string) {
  const [red, green, blue] = hexToRgb(hex)
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

export function contrastRatio(first: string, second: string) {
  const a = luminance(first)
  const b = luminance(second)
  const light = Math.max(a, b)
  const dark = Math.min(a, b)
  return (light + 0.05) / (dark + 0.05)
}

export function readableOn(hex: string) {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#101014') ? '#ffffff' : '#101014'
}

export function ensureContrast(hex: string, background: string, target: number) {
  if (contrastRatio(hex, background) >= target) return hex
  const towards = luminance(background) > 0.45 ? '#000000' : '#ffffff'
  let result = hex
  for (let step = 1; step <= 10; step += 1) {
    result = mix(hex, towards, step / 10)
    if (contrastRatio(result, background) >= target) return result
  }
  return result
}

export function accentVars(hex: string, theme: 'dark' | 'light', background: string) {
  const accent = ensureContrast(hex, background, 3)
  return {
    '--accent': accent,
    '--accent-soft': alpha(hex, theme === 'dark' ? 0.16 : 0.12),
    '--on-accent': readableOn(accent),
  }
}

export function baseVars(palette: { bg: string; surface: string; text: string }, theme: 'dark' | 'light') {
  const { bg, surface, text } = palette
  return {
    '--bg': bg,
    '--bar': mix(surface, text, 0.04),
    '--surface': surface,
    '--input': surface,
    '--border': mix(bg, text, 0.14),
    '--text': text,
    '--muted': mix(bg, text, 0.55),
    '--canvas': theme === 'dark' ? darken(bg, 0.32) : darken(bg, 0.06),
    '--shadow': theme === 'dark' ? '0 4px 12px rgba(0, 0, 0, 0.35)' : '0 4px 12px rgba(24, 24, 26, 0.12)',
  }
}
