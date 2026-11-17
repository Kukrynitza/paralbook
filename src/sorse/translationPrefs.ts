export type ChunkUnit = 'sentences' | 'tokens'

export interface ChunkPrefs {
  unit: ChunkUnit
  size: number
}

export const DEFAULT_CHUNK: ChunkPrefs = { unit: 'tokens', size: 1200 }
const KEY = 'paralbook.translation.v1'

export function normalizeChunk(unit: unknown, size: unknown): ChunkPrefs {
  const nextUnit: ChunkUnit = unit === 'sentences' ? 'sentences' : 'tokens'
  const number = Number(size)
  if (!Number.isFinite(number)) {
    return { ...DEFAULT_CHUNK, unit: nextUnit }
  }
  const safe = nextUnit === 'sentences'
    ? Math.max(1, Math.min(20, Math.round(number)))
    : Math.max(300, Math.min(4000, Math.round(number)))
  return { unit: nextUnit, size: safe }
}

export function readChunkPrefs(): ChunkPrefs {
  if (typeof window === 'undefined') return DEFAULT_CHUNK
  try {
    const raw = window.localStorage.getItem(KEY)
    const value = raw ? JSON.parse(raw) : null
    if (!value || typeof value !== 'object') return DEFAULT_CHUNK
    return normalizeChunk(value.unit, value.size)
  } catch {
    return DEFAULT_CHUNK
  }
}

export function writeChunkPrefs(value: ChunkPrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(normalizeChunk(value.unit, value.size)))
  } catch {
    // localStorage может быть недоступен
  }
}

export function requestsPer10k(value: ChunkPrefs) {
  if (value.unit === 'tokens') {
    return Math.max(1, Math.round((10000 * 1.33) / value.size))
  }
  return Math.max(1, Math.round(10000 / (value.size * 15)))
}
