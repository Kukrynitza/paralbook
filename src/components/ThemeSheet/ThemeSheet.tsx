'use client'

import { useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import { FONTS } from '@/sorse/fonts'
import { useTheme } from '@/contexts/ThemeContext'
import { paletteFor } from '@/sorse/themePrefs'
import { contrastRatio } from '@/sorse/themeColors'
import {
  ACCENT_COLORS,
  DEFAULT_SECTIONS,
  SECTIONS,
  THEME_PRESETS,
  type ThemeMode,
  type ThemePalette,
} from '@/sorse/themeTypes'
import styles from './ThemeSheet.module.css'

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'Системная' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
  { id: 'custom', label: 'Своя' },
]

function contrastLabel(value: number) {
  if (value >= 7) return { text: 'Отличный контраст', tone: 'good' }
  if (value >= 4.5) return { text: 'Хороший контраст', tone: 'good' }
  if (value >= 3) return { text: 'Слабовато для текста', tone: 'mid' }
  return { text: 'Плохо читается', tone: 'bad' }
}

export default function ThemeSheet({ onClose }: { onClose: () => void }) {
  const { prefs, save, reset } = useTheme()
  const [tab, setTab] = useState<'theme' | 'sections'>('theme')
  const palette = paletteFor(prefs)
  const ratio = contrastRatio(palette.text, palette.bg)
  const hint = contrastLabel(ratio)

  function chooseMode(mode: ThemeMode) {
    if (mode === 'custom') {
      save({ ...prefs, mode, custom: palette })
      return
    }
    save({ ...prefs, mode })
  }

  function editPalette(key: keyof ThemePalette, value: string) {
    const base = prefs.mode === 'custom' ? prefs.custom : palette
    save({ ...prefs, mode: 'custom', custom: { ...base, [key]: value } })
  }

  function applyPreset(preset: ThemePalette) {
    save({ ...prefs, mode: 'custom', custom: preset })
  }

  return (
    <div className="modal-dim" onClick={onClose}>
      <div
        className={`modal ${styles.sheet}`}
        role="dialog"
        aria-modal="true"
        aria-label="Оформление"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <h2>Оформление</h2>
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.tabs}>
          <button type="button" className={tab === 'theme' ? 'chip on' : 'chip'} onClick={() => setTab('theme')}>
            Тема
          </button>
          <button type="button" className={tab === 'sections' ? 'chip on' : 'chip'} onClick={() => setTab('sections')}>
            Цвета разделов
          </button>
        </div>
        <div className={styles.body}>

          {tab === 'theme' ? (
            <>
              <div className={styles.preview}>
                <div className={styles.previewTop}>
                  <b>Пример карточки</b>
                  <span className="chip on">B1</span>
                </div>
                <p>Текст на выбранном фоне. Так будут выглядеть карточки и кнопки в приложении.</p>
                <div className="actions">
                  <button className="btn slim" type="button">
                    Читать
                  </button>
                  <button className="btn soft slim" type="button">
                    В словарь
                  </button>
                </div>
              </div>
              <div className={styles.block}>
                <span className={styles.blockTitle}>Режим</span>
                <div className={styles.modes}>
                  {MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={prefs.mode === mode.id ? 'chip on' : 'chip'}
                      onClick={() => chooseMode(mode.id)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.block}>
                <span className={styles.blockTitle}>Готовые палитры</span>
                <div className={styles.presets}>
                  {THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={styles.preset}
                      onClick={() => applyPreset(preset.palette)}
                    >
                      <span className={styles.dots}>
                        <i style={{ background: preset.palette.bg }} />
                        <i style={{ background: preset.palette.surface }} />
                        <i style={{ background: preset.palette.text }} />
                      </span>
                      <b>{preset.label}</b>
                      <span>{preset.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.block}>
                <span className={styles.blockTitle}>Свои цвета</span>
                {(['bg', 'surface', 'text'] as const).map((key) => (
                  <label className={styles.colorRow} key={key}>
                    <span>{key === 'bg' ? 'Фон' : key === 'surface' ? 'Карточки' : 'Текст'}</span>
                    <input type="color" value={palette[key]} onChange={(event) => editPalette(key, event.target.value)} />
                    <code>{palette[key]}</code>
                  </label>
                ))}
                <p className={`${styles.contrast} ${styles[hint.tone]}`}>
                  Контраст текста {ratio.toFixed(1)}:1 — {hint.text.toLowerCase()}
                </p>
              </div>

              <button type="button" className="btn ghost slim" onClick={reset}>
                <RotateCcw size={15} />
                Сбросить оформление
              </button>
            </>
          ) : (
            <>
              <p className={styles.note}>Цвет показывает, в каком разделе вы находитесь. Связанные разделы делят один цвет.</p>
              {SECTIONS.map((section) => (
                <div className={styles.sectionRow} key={section.id}>
                  <div className={styles.sectionMeta}>
                    <b>{section.label}</b>
                    <span>{section.hint}</span>
                  </div>
                  <div className={styles.swatches}>
                    {ACCENT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={prefs.sections[section.id] === color ? `${styles.swatch} ${styles.swatchOn}` : styles.swatch}
                        style={{ background: color }}
                        aria-label={`${section.label}: ${color}`}
                        onClick={() =>
                          save({ ...prefs, sections: { ...prefs.sections, [section.id]: color } })
                        }
                      >
                        {prefs.sections[section.id] === color ? <Check size={12} /> : null}
                      </button>
                    ))}
                    <label className={styles.customSwatch} title="Свой цвет">
                      <input
                        type="color"
                        value={prefs.sections[section.id]}
                        onChange={(event) =>
                          save({ ...prefs, sections: { ...prefs.sections, [section.id]: event.target.value } })
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="btn ghost slim"
                onClick={() => save({ ...prefs, sections: { ...DEFAULT_SECTIONS } })}
              >
                <RotateCcw size={15} />
                Вернуть цвета по умолчанию
              </button>
            </>
          )}
        </div>
        <div className={styles.foot}>
          <span className={styles.footText}>
            Шрифт интерфейса: {FONTS[prefs.fonts.ui].label} · чтение: {FONTS[prefs.fonts.reading].label}
          </span>
          <button className="btn" type="button" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  )
}
