export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export const INTERESTS = ['Путешествия', 'Природа', 'Наука', 'Детектив', 'Культура', 'Технологии'] as const
export const GOALS = [10, 15, 20, 30] as const

export type Cefr = (typeof LEVELS)[number]
export type ThemePref = 'system' | 'light' | 'dark'

export interface User {
  id: string
  email: string
  cefr: Cefr
  interests: string[]
  dailyGoalMin: number
  showMinutes: boolean
  theme: ThemePref
  streak: number
}

export interface Friend {
  id: string
  name: string
  minutesToday: number
  minutesLabel: string
  streak: number
}

export interface Today {
  readingMin: number
  words: number
  goalMin: number
  leftMin: number
  friends: Friend[]
}

export interface CollectionItem {
  id: string
  textId: string
  source: 'library' | 'chat'
  published: boolean
  title: string
  excerpt: string
  minutes: number
  level: Cefr
  topic: string
  rating: number
  progress: number
  createdAt: string
}

export interface LibraryItem {
  id: string
  title: string
  excerpt: string
  minutes: number
  level: Cefr
  topic: string
  rating: number
  vote: 'like' | 'dislike' | null
  saved: boolean
  createdAt: string
}

export interface PageResult<T> {
  page: number
  pages: number
  total: number
  items: T[]
}

export interface ChatText {
  id: string
  title: string
  excerpt: string
  minutes: number
  level: Cefr
  published: boolean
}

export type ChatMessage =
  | { id: string; role: 'assistant' | 'user'; text: string }
  | { id: string; role: 'result'; text: ChatText | null }
  | { id: string; role: 'error'; text: string; retry: { topic: string; minutes: number; level: Cefr } }

export interface ReadToken {
  text: string
  lemma?: string
  translation?: string
  align?: number
}

export interface RuToken {
  text: string
}

export interface ReadPayload {
  id: string
  title: string
  minutes: number
  level: Cefr
  page: number
  pageCount: number
  progress: number
  pages: { ruTokens: RuToken[]; tokens: ReadToken[] }[]
}

export interface DictEntry {
  lemma: string
  ipa: string | null
  translation: string | null
  rank: number
  senses: { pos: string; text: string; examples: { textEn: string; textRu: string | null }[] }[]
  example: string | null
  hint: string | null
}

export interface VocabItem {
  id: string
  lemma: string
  ipa: string | null
  translation: string | null
  example: string | null
  hint: string | null
  correct: number
  wrong: number
  mastered: boolean
  tone: 'ok' | 'error'
}

export interface SessionCard {
  lemma: string
  ipa: string | null
  translation: string | null
  example: string | null
  hint: string | null
}

export interface SessionSummary {
  minutes: number
  words: number
  correct: number
  wrong: number
  streak: number
  goalMin: number
  todayMin: number
  compliment: string
}

export interface Session {
  id: string
  index: number
  total: number
  done: boolean
  card: SessionCard | null
  next: { lemma: string } | null
  summary: SessionSummary | null
}

export interface Stats {
  streak: number
  days: { label: string; minutes: number }[]
  weekMinutes: number
  goalMin: number
  todayMin: number
  leftMin: number
}
