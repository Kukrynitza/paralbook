const ENGLISH = [
  'fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'fuckin',
  'motherfuck', 'motherfucker', 'motherfuckers', 'motherfucking',
  'shit', 'shits', 'shitty', 'bullshit', 'shithead', 'shitheads',
  'bitch', 'bitches', 'bitchy',
  'bastard', 'bastards',
  'asshole', 'assholes', 'arsehole', 'arseholes', 'dumbass', 'dumbasses', 'jackass', 'jackasses',
  'twat', 'twats', 'wanker', 'wankers', 'bollocks',
  'cunt', 'cunts',
  'dick', 'dicks', 'dickhead', 'dickheads',
  'pussy', 'pussies',
  'whore', 'whores',
  'slut', 'sluts',
  'nigger', 'niggers', 'nigga', 'niggas',
  'faggot', 'faggots',
  'retard', 'retards', 'retarded',
  'porn', 'porno', 'pornography',
]

const RUSSIAN = [
  'хуй', 'хуя', 'хую', 'хуем', 'хуе', 'хуи', 'нахуй', 'нахуя', 'похуй', 'похуя', 'нихуя',
  'хуйня', 'хуйни', 'хуйню', 'хуйней',
  'хуевый', 'хуевая', 'хуевое', 'хуевые',
  'пизда', 'пизды', 'пизде', 'пизду', 'пиздой', 'пиздец', 'пиздеца',
  'пиздато', 'пиздатый', 'пиздить', 'пиздишь', 'пиздят',
  'бля', 'блять', 'блядь', 'бляди', 'блядей', 'блядский', 'блядская', 'блядское', 'блядство',
  'ебать', 'ебу', 'ебет', 'ебал', 'ебала', 'ебали', 'ебан', 'ебаный', 'ебанутый',
  'заебал', 'заебали', 'заебало', 'наебал', 'наебали', 'уебал', 'уебали',
  'выебал', 'выебали', 'ебля', 'ебли',
  'залупа', 'залупы', 'залупе', 'залупу', 'залупой',
  'мудак', 'мудаки', 'мудака', 'мудаков', 'мудила', 'мудило',
  'гандон', 'гандона', 'гандонов',
  'долбоеб', 'долбоебы',
  'жопа', 'жопы', 'жопе', 'жопу', 'жопой',
  'говно', 'говна', 'говне', 'говном', 'говнюк', 'говнюки',
  'срать', 'сру', 'срал', 'срала', 'срали', 'сраный', 'сраная', 'сраное', 'сраные',
  'сука', 'суки', 'суке', 'суку', 'сукой',
  'шлюха', 'шлюхи', 'шлюхе', 'шлюху', 'шлюхой',
  'пидор', 'пидора', 'пидору', 'пидором', 'пидоры', 'пидорас', 'пидорасы',
  'пиздюк', 'пиздюки', 'пиздюка',
  'хуйло', 'хуйла', 'хуйлу', 'хуйлом',
  'еблан', 'ебланы', 'еблана',
  'уебок', 'уебки', 'уебка',
  'мразь', 'мрази',
  'порно', 'порнография', 'порнуха', 'порнухи',
]

const ALLOWED_PATTERNS = [
  /moby[\s-]+dick/gu,
  /dick[\s-]+whittington/gu,
  /dick[\s-]+and[\s-]+jane/gu,
  /dick[\s-]+tracy/gu,
  /dick[\s-]+van[\s-]+dyke/gu,
  /pussy[\s-]+willow/gu,
  /pussy[\s-]?cat/gu,
]

const WORDS = [...ENGLISH, ...RUSSIAN]
const WORD = `(?<![\\p{L}\\p{N}])(?:${WORDS.join('|')})(?![\\p{L}\\p{N}])`
const SPACED = WORDS.map((word) => word.split('').join('\\s+')).join('|')
const WORD_PATTERN = new RegExp(WORD, 'iu')
const SPACED_PATTERN = new RegExp(`(?<![\\p{L}\\p{N}])(?:${SPACED})(?![\\p{L}\\p{N}])`, 'iu')

export interface ModerationResult {
  allowed: boolean
  reason?: string
}

export function moderateText(text: string): ModerationResult {
  let clean = (text || '').toLowerCase().replace(/ё/g, 'е')
  for (const pattern of ALLOWED_PATTERNS) {
    clean = clean.replace(pattern, ' ')
  }
  const spaced = clean.replace(/[^\p{L}\p{N}]+/gu, ' ')
  if (WORD_PATTERN.test(spaced) || SPACED_PATTERN.test(spaced)) {
    return {
      allowed: false,
      reason: 'Текст содержит недопустимые выражения. Измените формулировку перед публикацией.',
    }
  }
  return { allowed: true }
}
