import { useCallback, useRef, useState } from 'react'

/** 浏览器语音识别（一木 SpeechActivity 的对应实现；仅 Chromium 系可用） */
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [unsupported, setUnsupported] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) { setUnsupported(true); return }
    const rec = new Ctor()
    rec.lang = 'zh-CN'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e) => {
      const text = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join('')
      if (text) onText(text)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }, [onText])

  const stop = useCallback(() => { recRef.current?.stop(); setListening(false) }, [])

  return { listening, unsupported, start, stop }
}
