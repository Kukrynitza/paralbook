import { CamelCasePlugin, type GeneratedAlways, Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
type ThemePref = 'system' | 'light' | 'dark'

export interface Profiles {
  id: GeneratedAlways<string>
  email: string
  passwordHash: string
  friendCode: string
  cefr: Cefr
  interests: string[]
  dailyGoalMin: number
  showMinutes: boolean
  theme: ThemePref
  streak: number
  createdAt: GeneratedAlways<Date>
}

export interface Texts {
  id: GeneratedAlways<string>
  ownerId: string | null
  title: string
  excerpt: string
  minutes: number
  level: Cefr
  topic: string
  baseRating: number
  published: boolean
  createdAt: GeneratedAlways<Date>
}

export interface Pages {
  id: GeneratedAlways<string>
  textId: string
  position: number
}

export interface RuTokens {
  id: GeneratedAlways<string>
  pageId: string
  position: number
  text: string
}

export interface EnTokens {
  id: GeneratedAlways<string>
  pageId: string
  position: number
  text: string
  lemma: string | null
  align: number | null
}

export interface Lemmas {
  lemma: string
  ipa: string | null
  translation: string | null
  rank: number
  example: string | null
  hint: string | null
  level: Cefr | null
}

export interface Senses {
  id: GeneratedAlways<string>
  lemma: string
  position: number
  pos: string
  text: string
  source: string
  updatedAt: GeneratedAlways<Date>
}

export interface SenseExamples {
  id: GeneratedAlways<string>
  senseId: string
  position: number
  textEn: string
  textRu: string | null
  source: string
}

export interface WordForms {
  lemma: string
  form: string
  formNorm: string
  kind: string
  source: string
}

export interface CollectionItems {
  id: GeneratedAlways<string>
  userId: string
  textId: string
  source: 'library' | 'chat'
  progress: number
  credited: boolean
  addedAt: GeneratedAlways<Date>
}

export interface Votes {
  userId: string
  textId: string
  value: 'like' | 'dislike'
}

export interface UserWords {
  id: GeneratedAlways<string>
  userId: string
  lemma: string
  hint: string
  correct: number
  wrong: number
  mastered: boolean
}

export interface ActivityDays {
  userId: string
  day: Date
  minutes: number
  words: number
}

export interface Friendships {
  userId: string
  friendId: string
  createdAt: GeneratedAlways<Date>
}

export interface ChatMessages {
  id: GeneratedAlways<string>
  userId: string
  role: 'assistant' | 'user' | 'result' | 'error'
  body: string | null
  textId: string | null
  retryTopic: string | null
  retryMinutes: number | null
  retryLevel: Cefr | null
  createdAt: GeneratedAlways<Date>
}

export interface TrainingSessions {
  id: GeneratedAlways<string>
  userId: string
  cardIndex: number
  correct: number
  wrong: number
  minutes: number
  createdAt: GeneratedAlways<Date>
}

export interface TrainingCards {
  id: GeneratedAlways<string>
  sessionId: string
  position: number
  lemma: string
}

export interface Database {
  profiles: Profiles
  texts: Texts
  pages: Pages
  ruTokens: RuTokens
  enTokens: EnTokens
  lemmas: Lemmas
  senses: Senses
  senseExamples: SenseExamples
  wordForms: WordForms
  collectionItems: CollectionItems
  votes: Votes
  userWords: UserWords
  activityDays: ActivityDays
  friendships: Friendships
  chatMessages: ChatMessages
  trainingSessions: TrainingSessions
  trainingCards: TrainingCards
}

const connectionString = process.env.DATABASE_CONNECTION_STRING
const supabase = connectionString?.includes('supabase')

const database = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString,
      max: process.env.VERCEL ? 1 : 3,
      ssl: supabase ? { rejectUnauthorized: false } : undefined
    })
  }),
  plugins: [
    new CamelCasePlugin({
      maintainNestedObjectKeys: true
    })
  ]
})

export default database
