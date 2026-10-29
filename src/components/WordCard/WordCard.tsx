import { Eye, RotateCcw, Volume2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SessionCard } from '@/sorse/types'
import styles from '@/app/train/page.module.css'

export default function WordCard({
  card,
  flipped,
  showTranslation,
  onHint,
  onTranslation,
  onBack,
  reviewLabel,
}: {
  card: SessionCard
  flipped: boolean
  showTranslation: boolean
  hintSeen?: boolean
  reviewLabel?: string | null
  onHint: () => void
  onTranslation: () => void
  onBack: () => void
}) {
  const mark = [card.level, card.band].filter(Boolean).join(' · ')
  const open = showTranslation || flipped
  const glosses = (card.translation || '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
  return (
    <div className={open ? `${styles.flip} ${styles.flipped}` : styles.flip}>
      <div className={`${styles.face} ${styles.side}`}>
        <Head card={card} mark={mark} reviewLabel={reviewLabel} />
        <hr className="line" />
        <button className="btn ghost" onClick={onHint}>
          <Eye size={16} />
          Показать подсказку
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={onTranslation}>
          <Eye size={16} />
          Показать перевод
        </button>
      </div>
      <div className={`${styles.face} ${styles.side} ${styles.back}`}>
        <Head card={card} mark={mark} reviewLabel={reviewLabel} />
        {showTranslation ? null : (
          <button className="btn ghost" onClick={onBack}>
            <RotateCcw size={16} />
            К слову
          </button>
        )}
        <hr className="line" />
        <div className={styles.sheet}>
          {showTranslation ? <p className={styles.gloss}>{card.translation || 'Перевода нет'}</p> : null}
          {card.examples.length ? (
            card.examples.map((item) => (
              <div key={item.textEn} className={showTranslation ? styles.pair : styles.sample}>
                <p className={styles.spoken}>
                  <span>{paint(item.textEn, [card.lemma])}</span>
                  <button type="button" className={styles.speak} aria-label="Произнести пример" onClick={() => pronounce(item.textEn)}>
                    <Volume2 size={16} />
                  </button>
                </p>
                {showTranslation && item.textRu ? <p className={styles.ru}>{paint(item.textRu, glosses)}</p> : null}
              </div>
            ))
          ) : (
            <p className="muted">Примеров нет</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Head({ card, mark, reviewLabel }: { card: SessionCard; mark: string; reviewLabel?: string | null }) {
  return (
    <>
      {mark ? <span className={styles.badge}>{mark}</span> : null}
      {reviewLabel ? <span className={styles.review}>{reviewLabel}</span> : null}
      <h2>{card.display || card.lemma}</h2>
      <p className={styles.sound}>
        <span className="muted">{card.ipa}</span>
        <button type="button" className={styles.speak} aria-label="Произнести" onClick={() => pronounce(card.lemma)}>
          <Volume2 size={18} />
        </button>
      </p>
      {card.pos ? <p className={`muted ${styles.pos}`}>{card.pos}</p> : null}
      {card.note ? <p className={styles.note}>{card.note}</p> : null}
    </>
  )
}

function pronounce(lemma: string) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(lemma)
  utter.lang = 'en-US'
  window.speechSynthesis.speak(utter)
}

function paint(text: string, words: string[]): ReactNode {
  const needles = words.filter(Boolean).sort((a, b) => b.length - a.length)
  if (!needles.length) return text
  const pattern = new RegExp(
    needles.map((word) => (/[a-z]/i.test(word) ? `\\b${escapeRegExp(word)}\\b` : escapeRegExp(word))).join('|'),
    'ig',
  )
  const parts = text.split(pattern)
  const hits = text.match(pattern) || []
  const nodes: ReactNode[] = []
  parts.forEach((part, index) => {
    nodes.push(part)
    if (hits[index]) nodes.push(<strong key={`${hits[index]}-${index}`}>{hits[index]}</strong>)
  })
  return nodes
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
