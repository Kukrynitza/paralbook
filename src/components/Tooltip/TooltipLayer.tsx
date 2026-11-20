'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Tooltip.module.css'

const SELECTOR = '[data-tip], .icon-btn[aria-label], .back[aria-label], .send[aria-label]'

interface Tip {
  text: string
  left: number
  top: number
  below: boolean
}

export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  const timer = useRef<number | null>(null)
  const active = useRef<Element | null>(null)

  useEffect(() => {
    const clear = () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      active.current = null
      setTip(null)
    }

    const show = (element: Element) => {
      const text = element.getAttribute('data-tip') || element.getAttribute('aria-label')
      if (!text) return
      const box = element.getBoundingClientRect()
      const below = box.top < 70
      const half = Math.min(120, window.innerWidth / 2 - 8)
      const left = Math.min(Math.max(box.left + box.width / 2, half + 8), window.innerWidth - half - 8)
      setTip({ text, left, top: below ? box.bottom + 8 : box.top - 8, below })
    }

    const schedule = (element: Element, delay: number) => {
      if (active.current === element) return
      if (timer.current !== null) window.clearTimeout(timer.current)
      active.current = element
      timer.current = window.setTimeout(() => show(element), delay)
    }

    const over = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest(SELECTOR) : null
      if (target) schedule(target, 220)
    }

    const out = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest(SELECTOR) : null
      if (!target) return
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return
      clear()
    }

    const focus = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target.closest(SELECTOR) : null
      if (target) schedule(target, 80)
    }

    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear()
    }

    const visibility = () => {
      if (document.visibilityState === 'hidden') clear()
    }

    document.addEventListener('pointerover', over)
    document.addEventListener('pointerout', out)
    document.addEventListener('pointerdown', clear, true)
    document.addEventListener('click', clear, true)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', clear)
    document.addEventListener('keydown', key)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('scroll', clear, true)
    window.addEventListener('resize', clear)
    window.addEventListener('blur', clear)
    window.addEventListener('popstate', clear)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerout', out)
      document.removeEventListener('pointerdown', clear, true)
      document.removeEventListener('click', clear, true)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', clear)
      document.removeEventListener('keydown', key)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('scroll', clear, true)
      window.removeEventListener('resize', clear)
      window.removeEventListener('blur', clear)
      window.removeEventListener('popstate', clear)
    }
  }, [])

  if (!tip || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="tooltip"
      className={tip.below ? `${styles.tooltip} ${styles.below}` : styles.tooltip}
      style={{ left: tip.left, top: tip.top }}
    >
      {tip.text}
    </div>,
    document.body,
  )
}
