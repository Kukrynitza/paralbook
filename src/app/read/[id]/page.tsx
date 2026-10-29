'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Star, Volume2, X } from 'lucide-react'
import saveProgress from '@/actions/Reading/saveProgress'
import selectText from '@/actions/Reading/selectText'
import selectWord from '@/actions/Words/selectWord'
import resolveSense, { type ResolvedSense } from '@/actions/Words/resolveSense'
import addVocabulary from '@/actions/Vocabulary/addVocabulary'
import { type DictEntry, type ReadPayload } from '@/sorse/types'
import { bare, sentenceAt } from '@/sorse/tokens'
import { useUi } from '@/contexts/AuthContext'
import WordArticle from '@/components/WordArticle/WordArticle'
import Pager from '@/components/Pager/Pager'
import styles from './page.module.css'

function paragraphs(tokens: ReadPayload['pages'][number]['tokens']) {
  const blocks: { token: ReadPayload['pages'][number]['tokens'][number]; index: number }[][] = [[]]
  const flat = !tokens.some((token) => /\n/.test(token.text))
  let sentences = 0
  tokens.forEach((token, index) => {
    if (/\n/.test(token.text)) {
      sentences = 0
      if (blocks[blocks.length - 1].length) blocks.push([])
      return
    }
    blocks[blocks.length - 1].push({ token, index })
    if (flat && /[.!?]["”»']*$/.test(token.text.trim())) {
      sentences += 1
      if (sentences % 3 === 0) blocks.push([])
    }
  })
  const filled = blocks.filter((block) => block.some((item) => item.token.text.trim()))
  if (filled.length) return filled
  return [tokens.map((token, index) => ({ token, index }))]
}

export default function Page() {
  const params = useParams()
  const id = String(params?.id ?? '')
  const router = useRouter()
  const { notify } = useUi()
  const [data, setData] = useState<ReadPayload | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [progress, setProgress] = useState(0)
  const [finished, setFinished] = useState(false)
  const [pick, setPick] = useState<{
    index: number
    lemma: string
    translation?: string
    align?: number
    phase: 'gloss' | 'popup'
    missing?: boolean
    reason?: string
  } | null>(null)
  const [entry, setEntry] = useState<DictEntry | null>(null)
  const [resolved, setResolved] = useState<ResolvedSense | null>(null)
  const [saved, setSaved] = useState(false)
  const [glossAt, setGlossAt] = useState<{ top: number; left: number } | null>(null)
  const glossRequest = useRef(0)

  useEffect(() => {
    let active = true
    setError('')
    selectText(id)
      .then((value) => {
        if (!active) return
        setData(value)
        setPage(value.page)
        setProgress(value.progress)
        setFinished(false)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить')
      })
    return () => {
      active = false
    }
  }, [id])

  async function go(next: number) {
    if (!data) return
    const value = Math.max(0, next)
    try {
      const result = await saveProgress(id, value)
      setProgress(result.progress)
      setFinished(result.finished)
      if (!result.finished) setPage(result.page)
      setPick(null)
      setGlossAt(null)
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось сохранить прогресс')
    }
  }

  async function onToken(index: number, lemma: string, align: number | undefined, tokens: string[], sentenceRu: string) {
    if (pick?.index === index && pick.phase === 'gloss' && pick.translation && !pick.missing) {
      const word = await selectWord(pick.lemma)
      setEntry(word)
      setSaved(false)
      setPick({ ...pick, phase: 'popup' })
      return
    }
    const sentence = sentenceAt(tokens, index)
    const request = glossRequest.current + 1
    glossRequest.current = request
    setResolved(null)
    setSaved(false)
    setPick({ index, lemma, align, phase: 'gloss' })
    try {
      const sense = await resolveSense({ word: lemma, sentence, sentenceRu })
      if (glossRequest.current !== request) return
      setResolved(sense)
      setPick({
        index,
        lemma: sense.lemma || lemma,
        translation: sense.inKb ? sense.translation ?? undefined : undefined,
        align,
        phase: 'gloss',
        missing: !sense.inKb,
        reason: sense.reason,
      })
    } catch (reason) {
      if (glossRequest.current !== request) return
      notify(reason instanceof Error ? reason.message : 'Не удалось разобрать слово')
    }
  }

  async function addWord() {
    if (!resolved?.inKb || !resolved.lemma) return
    try {
      await addVocabulary({
        lemma: resolved.lemma,
        senseId: resolved.senseId,
        contextEn: resolved.sentence,
        contextRu: resolved.sentenceRu,
        disagreement: resolved.disagreement,
      })
      setSaved(true)
      notify('Сохранено')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось сохранить')
    }
  }

  function speak() {
    if (!entry || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(entry.lemma))
  }

  if (error) return <p className="form-error pad">{error}</p>
  if (!data) return <p className="loading">Загрузка…</p>
  const current = data.pages[page]
  const percent = `${Math.round((finished ? 1 : progress) * 100)}%`

  return (
    <div className={styles.screen}>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <div className="grow">{data.title}</div>
        <span>{percent}</span>
      </header>
      {finished ? <div className="bar"><i style={{ width: '100%' }} /></div> : null}
      <div
        className={styles.scroll}
        onScroll={() => {
          setGlossAt(null)
          setPick((current) => (current?.phase === 'gloss' ? null : current))
        }}
      >
        <div className={styles.text}>
          {paragraphs(current?.tokens ?? []).map((block, blockIndex) => (
            <p key={blockIndex}>
              {block.map(({ token, index }) => {
                const word = token.lemma || bare(token.text)
                const clickable = word.length > 1 && /[a-z]/i.test(word)
                return clickable ? (
                  <span key={index} className={styles.anchor}>
                    <button
                      type="button"
                      className={pick?.index === index ? `${styles.token} ${styles.on}` : styles.token}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect()
                        setGlossAt({
                          top: rect.bottom + 6,
                          left: Math.max(12, Math.min(rect.left, window.innerWidth - 292)),
                        })
                        void onToken(
                          index,
                          word,
                          token.align,
                          current?.tokens.map((item) => item.text) ?? [],
                          current?.ruTokens.map((item) => item.text).join('') ?? '',
                        )
                      }}
                    >
                      {token.text}
                    </button>
                  </span>
                ) : (
                  <span key={index}>{token.text}</span>
                )
              })}
            </p>
          ))}
        </div>
        {pick?.phase === 'gloss' && glossAt ? (
          <div className={styles.gloss} style={{ top: glossAt.top, left: glossAt.left }}>
            <span className={styles.glossText}>
              <b>{pick.lemma}</b>
              <span>{pick.missing ? 'Слова нет в базе знаний' : pick.translation || '…'}</span>
            </span>
            {pick.missing || !pick.translation ? null : (
              <button type="button" className={styles.plus} aria-label="Добавить в словарь" onClick={addWord}>
                {saved ? '✓' : '+'}
              </button>
            )}
          </div>
        ) : null}
        {finished ? (
          <div className="pad" style={{ textAlign: 'center' }}>
            <div className="card">
              <div className={styles.done}>✓</div>
              <h2>Текст прочитан</h2>
              <p className="big" style={{ fontSize: 32 }}>
                100%
              </p>
              <p className="muted">{data.title}</p>
            </div>
            <Link className="btn" href="/" style={{ marginTop: 16 }}>
              Готово
            </Link>
          </div>
        ) : null}
      </div>
      <Pager
        className={styles.pager}
        page={page + 1}
        pages={data.pageCount}
        prevDisabled={page <= 0 || finished}
        nextDisabled={finished}
        onPage={(next) => {
          if (!finished) go(next - 1)
        }}
      />
      {pick?.phase === 'popup' && entry ? (
        <div className={styles.dim} onClick={() => setPick({ ...pick, phase: 'gloss' })}>
          <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
            <div className={styles.handle} />
            <WordArticle
              lemma={entry.lemma}
              ipa={entry.ipa}
              rank={entry.rank}
              senses={
                resolved?.senseId
                  ? [...entry.senses.filter((sense) => sense.id === resolved.senseId), ...entry.senses.filter((sense) => sense.id !== resolved.senseId)]
                  : entry.senses
              }
              extra={
                resolved?.memory || resolved?.disagreement ? (
                  <div className="small muted">
                    {resolved.memory ? <p>Опора: {resolved.memory}</p> : null}
                    {resolved.disagreement ? <p>{resolved.reason}</p> : null}
                  </div>
                ) : null
              }
              leading={
                <button className="icon-btn" onClick={addWord} aria-label="В словарь" style={{ color: saved ? 'var(--accent)' : 'var(--muted)' }}>
                  <Star size={22} fill={saved ? 'currentColor' : 'none'} />
                </button>
              }
              trailing={
                <div className="gap8">
                  <button className="icon-btn" onClick={speak} aria-label="Произнести">
                    <Volume2 size={20} />
                  </button>
                  <button className="icon-btn" onClick={() => setPick({ ...pick, phase: 'gloss' })} aria-label="Закрыть">
                    <X size={20} />
                  </button>
                </div>
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
