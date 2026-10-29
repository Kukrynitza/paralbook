'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Star, Volume2, X } from 'lucide-react'
import saveProgress from '@/actions/Reading/saveProgress'
import selectText from '@/actions/Reading/selectText'
import selectWord from '@/actions/Words/selectWord'
import addVocabulary from '@/actions/Vocabulary/addVocabulary'
import { type DictEntry, type ReadPayload } from '@/sorse/types'
import { useUi } from '@/contexts/AuthContext'
import WordArticle from '@/components/WordArticle/WordArticle'
import Pager from '@/components/Pager/Pager'
import styles from './page.module.css'

function wordTokens<T extends { text: string }>(tokens: T[]) {
  return tokens.filter((token) => token.text.trim())
}

function splitByShare<T>(items: T[], weights: number[]) {
  const total = weights.reduce((sum, value) => sum + value, 0)
  if (!total) return weights.map(() => [] as T[])
  let used = 0
  return weights.map((weight, index) => {
    const start = Math.round((items.length * used) / total)
    used += weight
    const end = index === weights.length - 1 ? items.length : Math.round((items.length * used) / total)
    return items.slice(start, end)
  })
}

function russianSlices(pages: ReadPayload['pages']) {
  const own = pages.map((page) => wordTokens(page.ruTokens))
  const weights = pages.map((page) => wordTokens(page.tokens).length)
  if (pages.length < 2) return own
  const dump = own.findIndex((words, index) => {
    const rest = own.reduce((sum, item, itemIndex) => (itemIndex === index ? sum : sum + item.length), 0)
    return words.length > weights[index] * 2 && rest <= 8
  })
  if (dump < 0) return own
  return splitByShare(own[dump], weights)
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
  const [pick, setPick] = useState<{ index: number; lemma: string; translation?: string; align?: number; phase: 'gloss' | 'popup' } | null>(null)
  const [entry, setEntry] = useState<DictEntry | null>(null)
  const [saved, setSaved] = useState(false)
  const lineRef = useRef<HTMLDivElement>(null)
  const slices = useMemo(() => (data ? russianSlices(data.pages) : []), [data])
  const slice = slices[page] ?? []
  const wordCount = data ? wordTokens(data.pages[page]?.tokens ?? []).length : 0
  const hit = pick?.align === undefined || !slice.length
    ? undefined
    : Math.min(slice.length - 1, Math.floor((pick.align * slice.length) / Math.max(1, wordCount)))

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
    const result = await saveProgress(id, value)
    setProgress(result.progress)
    setFinished(result.finished)
    if (!result.finished) setPage(result.page)
    setPick(null)
  }

  useEffect(() => {
    if (hit === undefined) return
    const line = lineRef.current
    const node = line?.querySelector<HTMLElement>(`[data-word="${hit}"]`)
    if (!line || !node) return
    const lineBox = line.getBoundingClientRect()
    const wordBox = node.getBoundingClientRect()
    const delta = wordBox.left + wordBox.width / 2 - (lineBox.left + lineBox.width / 2)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    line.scrollBy({ left: delta, behavior: reduce ? 'auto' : 'smooth' })
  }, [hit, page])

  async function onToken(index: number, lemma: string, translation?: string, align?: number) {
    if (pick?.index === index && pick.phase === 'gloss') {
      const word = await selectWord(lemma)
      setEntry(word)
      setSaved(false)
      setPick({ index, lemma, translation, align, phase: 'popup' })
      return
    }
    setPick({ index, lemma, translation, align, phase: 'gloss' })
  }

  async function addWord() {
    if (!entry) return
    try {
      await addVocabulary(entry.lemma)
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
  if (!data) return <p className="pad muted">Загрузка…</p>
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
      {pick && current ? (
        <div className={styles.parallel}>
          {slice.length ? (
            <div className={styles.line} ref={lineRef} onClick={() => setPick(null)}>
              {slice.map((token, index) => (
                <span key={index} data-word={index} className={hit === index ? styles.ruOn : undefined}>
                  {index ? ' ' : ''}
                  {token.text}
                </span>
              ))}
            </div>
          ) : null}
          {pick.translation ? (
            <div className={styles.gloss}>
              <b>{pick.lemma}</b>
              {pick.translation}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={styles.scroll}>
        <p className={styles.text}>
          {current?.tokens.map((token, index) =>
            token.lemma ? (
              <button
                key={index}
                type="button"
                className={pick?.index === index ? `${styles.token} ${styles.on}` : styles.token}
                onClick={() => onToken(index, token.lemma!, token.translation, token.align)}
              >
                {token.text}
              </button>
            ) : (
              <span key={index}>{token.text}</span>
            ),
          )}
        </p>
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
              senses={entry.senses}
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
