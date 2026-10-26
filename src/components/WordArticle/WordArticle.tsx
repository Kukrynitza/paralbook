import { type ReactNode } from 'react'
import { type DictEntry } from '@/sorse/types'
import styles from './WordArticle.module.css'

export default function WordArticle({
  lemma,
  ipa,
  rank,
  senses,
  leading,
  trailing,
  extra,
}: {
  lemma: string
  ipa: string | null
  rank: number
  senses: DictEntry['senses']
  leading?: ReactNode
  trailing?: ReactNode
  extra?: ReactNode
}) {
  return (
    <article>
      <div className={styles.head}>
        <div className={styles.title}>
          {leading}
          <div>
            <h2>{lemma}</h2>
            <div className={styles.ipa}>
              {ipa}
              {rank ? <span> #{rank}</span> : null}
            </div>
          </div>
        </div>
        {trailing}
      </div>
      {senses.map((sense, index) => (
        <div className={styles.sense} key={`${sense.pos}-${sense.text}-${index}`}>
          {index === 0 || senses[index - 1].pos !== sense.pos ? <span className={styles.pos}>{sense.pos}</span> : null}
          <p className={styles.tr}>— {sense.text}</p>
          {sense.examples.length ? (
            <ul>
              {sense.examples.map((example) => (
                <li key={example.textEn + (example.textRu ?? '')}>
                  {example.textRu ? `${example.textEn} — ${example.textRu}` : example.textEn}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {extra ? <div className={styles.extra}>{extra}</div> : null}
    </article>
  )
}
