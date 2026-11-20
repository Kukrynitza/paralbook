let current: HTMLAudioElement | null = null

const PREFERRED = [
  'Google US English',
  'Microsoft Aria Online (Natural) - English (United States)',
  'Microsoft Zira - English (United States)',
  'Samantha',
  'Alex',
  'Daniel',
]

function chooseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  for (const name of PREFERRED) {
    const match = english.find((voice) => voice.name === name)
    if (match) return match
  }
  return english.find((voice) => voice.lang.toLowerCase() === 'en-us') ?? english[0] ?? null
}

function stop() {
  if (current) {
    current.onerror = null
    current.pause()
    current.src = ''
    current = null
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
}

function browserSpeak(text: string, options: { rate?: number; pitch?: number }) {
  if (!window.speechSynthesis) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = options.rate ?? 0.9
  utterance.pitch = options.pitch ?? 1
  const voice = chooseVoice()
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
}

export function speak(text: string, options: { rate?: number; pitch?: number } = {}) {
  if (typeof window === 'undefined') return
  const value = text.trim()
  if (!value) return
  stop()
  if (typeof Audio === 'undefined') {
    browserSpeak(value, options)
    return
  }
  const sound = new Audio(`/api/tts?text=${encodeURIComponent(value)}`)
  let fallbackUsed = false
  const fallback = () => {
    if (fallbackUsed) return
    fallbackUsed = true
    if (current === sound) current = null
    browserSpeak(value, options)
  }
  sound.preload = 'auto'
  sound.playbackRate = 0.96
  sound.onerror = fallback
  current = sound
  void sound.play().catch(fallback)
}
