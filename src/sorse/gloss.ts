const LABELS: Record<string, string[]> = {
  NOUN: ['сущ.'],
  PROPN: ['сущ.'],
  VERB: ['гл.'],
  AUX: ['гл.'],
  ADJ: ['прил.'],
  ADV: ['нареч.'],
  PRON: ['мест.'],
  DET: ['арт.', 'мест.'],
  ADP: ['предл.'],
  CCONJ: ['союз'],
  SCONJ: ['союз'],
  NUM: ['числ.'],
  INTJ: ['межд.'],
  PART: ['част.', 'нареч.'],
}

export function labelsFor(pos?: string | null): string[] {
  if (!pos) return []
  return LABELS[pos] ?? []
}
