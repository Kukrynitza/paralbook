'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Star, Volume2, X } from 'lucide-react'
import saveProgress from '@/actions/Reading/saveProgress'
import selectText from '@/actions/Reading/selectText'
import selectWord from '@/actions/Words/selectWord'
import addVocabulary from '@/actions/Vocabulary/addVocabulary'
import { type DictEntry, type ReadPage, type ReadPayload } from '@/sorse/types'
import { sentenceAt } from '@/sorse/context'
import { useUi } from '@/contexts/AuthContext'
import WordArticle from '@/components/WordArticle/WordArticle'
import Pager from '@/components/Pager/Pager'
import styles from './page.module.css'

function wordTokens<T extends { text: string }>(tokens: T[]) {
  return tokens.filter((token) => token.text.trim())
}

export default function Page() {
  const params = useParams()
  const id = String(params?.id ?? '')
  const router = useRouter()
  const { notify } = useUi()
  const [data, setData] = useState<ReadPayload | null>(null)
  const [cache, setCache] = useState<Record<number, ReadPage>>({})
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [along, setAlong] = useState(0)
  const [finished, setFinished] = useState(false)
  const [pick, setPick] = useState<{ index: number; lemma: string; translation?: string; align?: number; phase: 'gloss' | 'popup' } | null>(null)
  const [entry, setEntry] = useState<DictEntry | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const lineRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const navSeq = useRef(0)
  const current = cache[page]
  const slice = current ? wordTokens(current.ruTokens) : []
  const wordCount = current ? wordTokens(current.tokens).length : 0
  const hit = pick?.align === undefined || !slice.length
    ? undefined
    : Math.min(slice.length - 1, Math.floor((pick.align * slice.length) / Math.max(1, wordCount)))

  function merge(value: ReadPayload) {
    setCache((previous) => {
      const next = { ...previous }
      for (const item of value.pages) next[item.page] = item
      return next
    })
    setData((previous) => previous
      ? {
          ...previous,
          pageCount: value.pageCount,
          progress: value.progress,
          hasTranslation: value.hasTranslation,
          pages: value.pages,
        }
      : value)
  }

  useEffect(() => {
    let active = true
    setError('')
    setCache({})
    selectText(id, undefined, 4)
      .then((value) => {
        if (!active) return
        merge(value)
        setPage(value.page)
        setAlong(0)
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
    const seq = ++navSeq.current
    const cached = cache[value]
    if (cached) {
      setPage(value)
      setAlong(0)
      setPick(null)
    } else {
      setLoading(true)
    }
    try {
      const result = await saveProgress(id, value)
      if (seq !== navSeq.current) return
      setFinished(result.finished)
      if (result.finished) {
        setPage(Math.min(value, data.pageCount - 1))
        return
      }
      const target = result.page
      if (!cache[target]) {
        const payload = await selectText(id, target, 4)
        if (seq !== navSeq.current) return
        merge(payload)
        setPage(payload.page)
      } else {
        setPage(target)
        void selectText(id, target, 4)
          .then((payload) => {
            if (seq === navSeq.current) merge(payload)
          })
          .catch(() => undefined)
      }
      setAlong(0)
      setPick(null)
    } catch (reason) {
      if (seq === navSeq.current) {
        notify(reason instanceof Error ? reason.message : 'Не удалось загрузить страницу')
      }
    } finally {
      if (seq === navSeq.current) setLoading(false)
    }
  }

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = 0
  }, [page])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const measure = () => {
      const room = node.scrollHeight - node.clientHeight
      setAlong(room <= 0 ? 1 : Math.min(1, Math.max(0, node.scrollTop / room)))
    }
    measure()
    node.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      node.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [page, data, finished, pick])

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
    if (!data?.hasTranslation) {
      const word = await selectWord(lemma)
      setEntry(word)
      setSaved(Boolean(word.saved))
      setPick({ index, lemma, translation, align, phase: 'popup' })
      return
    }
    if (pick?.index === index && pick.phase === 'gloss') {
      const word = await selectWord(lemma)
      setEntry(word)
      setSaved(Boolean(word.saved))
      setPick({ index, lemma, translation, align, phase: 'popup' })
      return
    }
    setPick({ index, lemma, translation, align, phase: 'gloss' })
  }

  async function addWord() {
    if (!entry || saving) return
    setSaving(true)
    try {
      const context = pick ? sentenceAt(current?.tokens ?? [], pick.index) : ''
      const result = await addVocabulary(entry.lemma, context)
      setSaved(result.saved)
      notify(result.saved ? 'Сохранено в словарь' : 'Убрано из словаря')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  function speak() {
    if (!entry || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(entry.lemma))
  }

  if (error) return <p className="form-error pad">{error}</p>
  if (!data) return <p className="pad muted">Загрузка…</p>
  const percent = finished
    ? '100%'
    : `${Math.round(((page + along) / Math.max(1, data.pageCount)) * 100)}%`

  return (
    <div className={styles.screen}>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <div className="grow">{data.title}</div>
        <span>{loading ? '…' : percent}</span>
      </header>
      {finished ? <div className="bar"><i style={{ width: '100%' }} /></div> : null}
      {pick && data.hasTranslation ? (
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
      <div className={styles.scroll} ref={scrollRef}>
        <p className={styles.text}>
          {(current?.tokens ?? []).map((token, index) =>
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
        jump
        finishLabel="Завершить"
        prevDisabled={page <= 0 || finished || loading}
        nextDisabled={finished || loading}
        onPage={(next) => {
          if (!finished && !loading) void go(next - 1)
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
                <button className="icon-btn" onClick={addWord} disabled={saving} aria-label={saved ? 'Убрать из словаря' : 'В словарь'} style={{ color: saved ? 'var(--accent)' : 'var(--muted)' }}>
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
