import type { ReactNode } from 'react'
import {
  Bad_Script,
  Caveat,
  Cormorant,
  IBM_Plex_Sans,
  Inter,
  JetBrains_Mono,
  Kelly_Slab,
  Literata,
  Lora,
  Manrope,
  Marck_Script,
  Nunito,
  Onest,
  Oswald,
  Playfair_Display,
  Prata,
  PT_Serif,
  Rubik,
  Ruslan_Display,
  Russo_One,
  Source_Serif_4,
  Unbounded,
} from 'next/font/google'
import Shell from '@/components/Shell/Shell'
import { FONT_VARS, READER_SIZES } from '@/sorse/fonts'
import { SECTION_ROUTES } from '@/sorse/themeTypes'
import './global.css'

export const metadata = { title: 'Paralbook' }

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' })
const manrope = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-manrope', display: 'swap', preload: false })
const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest', display: 'swap', preload: false })
const nunito = Nunito({ subsets: ['latin', 'cyrillic'], variable: '--font-nunito', display: 'swap', preload: false })
const rubik = Rubik({ subsets: ['latin', 'cyrillic'], variable: '--font-rubik', display: 'swap', preload: false })
const plex = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
  preload: false,
})
const unbounded = Unbounded({ subsets: ['latin', 'cyrillic'], variable: '--font-unbounded', display: 'swap', preload: false })
const russo = Russo_One({ subsets: ['latin', 'cyrillic'], weight: '400', variable: '--font-russo', display: 'swap', preload: false })
const oswald = Oswald({ subsets: ['latin', 'cyrillic'], variable: '--font-oswald', display: 'swap', preload: false })
const kelly = Kelly_Slab({ subsets: ['latin', 'cyrillic'], weight: '400', variable: '--font-kelly', display: 'swap', preload: false })
const ruslan = Ruslan_Display({ subsets: ['latin', 'cyrillic'], weight: '400', variable: '--font-ruslan', display: 'swap', preload: false })
const caveat = Caveat({ subsets: ['latin', 'cyrillic'], variable: '--font-caveat', display: 'swap', preload: false })
const badscript = Bad_Script({ subsets: ['latin', 'cyrillic'], weight: '400', variable: '--font-badscript', display: 'swap', preload: false })
const marck = Marck_Script({ subsets: ['latin', 'cyrillic'], weight: '400', variable: '--font-marck', display: 'swap', preload: false })
const jetbrains = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-jetbrains', display: 'swap', preload: false })
const lora = Lora({ subsets: ['latin', 'cyrillic'], variable: '--font-lora', display: 'swap', preload: false })
const literata = Literata({ subsets: ['latin', 'cyrillic'], variable: '--font-literata', display: 'swap', preload: false })
const sourceserif = Source_Serif_4({ subsets: ['latin', 'cyrillic'], variable: '--font-sourceserif', display: 'swap', preload: false })
const ptserif = PT_Serif({ subsets: ['latin', 'cyrillic'], weight: ['400', '700'], variable: '--font-ptserif', display: 'swap', preload: false })
const cormorant = Cormorant({ subsets: ['latin', 'cyrillic'], variable: '--font-cormorant', display: 'swap', preload: false })
const playfair = Playfair_Display({ subsets: ['latin', 'cyrillic'], variable: '--font-playfair', display: 'swap', preload: false })
const prata = Prata({ subsets: ['latin', 'cyrillic'], weight: '400', variable: '--font-prata', display: 'swap', preload: false })

const fontClass = [
  inter,
  manrope,
  onest,
  nunito,
  rubik,
  plex,
  unbounded,
  russo,
  oswald,
  kelly,
  ruslan,
  caveat,
  badscript,
  marck,
  jetbrains,
  lora,
  literata,
  sourceserif,
  ptserif,
  cormorant,
  playfair,
  prata,
]
  .map((font) => font.variable)
  .join(' ')

const themeScript = `
(function () {
  var root = document.documentElement
  var theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  var cache = null
  try { cache = JSON.parse(localStorage.getItem('paralbook.theme.v1') || 'null') } catch (error) { cache = null }
  if (cache && cache.prefs) {
    var mode = cache.prefs.mode
    if (mode === 'light') theme = 'light'
    else if (mode === 'dark') theme = 'dark'
    else if (mode === 'custom') theme = cache.customTheme || 'dark'
    var resolved = cache.resolved && cache.resolved[theme]
    if (resolved) {
      if (resolved.base) {
        for (var baseKey in resolved.base) root.style.setProperty(baseKey, resolved.base[baseKey])
      }
      var section = 'collection'
      var routes = ${JSON.stringify(SECTION_ROUTES)}
      for (var index = 0; index < routes.length; index += 1) {
        var prefix = routes[index].prefix
        if (location.pathname === prefix || location.pathname.indexOf(prefix + '/') === 0) {
          section = routes[index].section
          break
        }
      }
      var accent = resolved.sections && resolved.sections[section]
      if (accent) {
        for (var accentKey in accent) root.style.setProperty(accentKey, accent[accentKey])
      }
    }
    var fonts = cache.prefs.fonts || {}
    var fontVars = ${JSON.stringify(FONT_VARS)}
    if (fonts.ui) root.style.setProperty('--ui-font', fontVars[fonts.ui] ? 'var(' + fontVars[fonts.ui] + ')' : 'system-ui')
    if (fonts.reading) root.style.setProperty('--reading-font', fontVars[fonts.reading] ? 'var(' + fontVars[fonts.reading] + ')' : 'system-ui')
    var sizes = ${JSON.stringify(READER_SIZES)}
    root.style.setProperty('--reader-size', sizes[fonts.size] || '19px')
  }
  root.dataset.theme = theme
  root.style.colorScheme = theme
})()
`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={fontClass} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
