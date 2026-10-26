import type { CSSProperties } from 'react'

export function sideColor(correct: number, wrong: number): CSSProperties {
  const total = correct + wrong
  const share = total === 0 ? 0 : (correct / total) * 100
  const stripe = total === 0 ? 'var(--danger)' : `var(--ok) 0 ${share}%, var(--danger) ${share}% 100%`
  return {
    borderLeftColor: 'transparent',
    backgroundImage: `linear-gradient(${stripe})`,
    backgroundSize: '4px 100%',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'left top',
    backgroundOrigin: 'border-box',
  }
}
