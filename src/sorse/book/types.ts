export type BookFormat = 'txt' | 'md' | 'fb2' | 'epub' | 'docx'

export interface BookDraft {
  title?: string
  author?: string | null
  text: string
  warnings?: string[]
}

export interface ParsedBook {
  title: string
  author: string | null
  format: BookFormat
  text: string
  warnings: string[]
}
