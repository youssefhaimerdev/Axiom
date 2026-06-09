import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const WELCOME = "AXIOM online. All systems nominal. What do you need?"

export default function Home() {
  const [apiKey, setApiKey] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [messages, setMessages] = useState([])
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [status, setStatus] = useState('STANDBY')
  const [voices, setVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState(null)
  const [orbScale, setOrbScale] = useState(1)

  const recognitionRef = useRef(null)
  const chatEndRef = useRef(null)
  const interimRef = useRef('')
  const finalRef = useRef('')
  const orbAnimRef = useRef(null)

  useEffect(() => {
    const saved = localStorage.getItem('axiom_key')
    if (saved) {
      setApiKey(saved)
      setKeySaved(true)
      setKeyInput('••••••••••••••••••••••••')
    }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices()
      setVoices(v)
      const preferred = v.find(x =>
        x.name.toLowerCase().includes('daniel') ||
        x.name.toLowerCase().includes('google uk english male') ||
        x.name.toLowerCase().includes('male')
      ) || v[0]
      setSelectedVoice(preferred)
    }
    window.speechSynthesis.onvoiceschanged = loadVoices
    loadVoices()
  }, [])

  const animateOrb = useCallback((speaking) => {
    if (orbAnimRef.current) cancelAnimationFrame(orbAnimRef.current)
    if (!speaking) { setOrbScale(1); return }
    const animate = () => {
      setOrbScale(1 + Math.random() * 0.15)
      orbAnimRef.current = requestAnimationFrame(() => {
        setTimeout(animate, 80 + Math.random() * 80)
      })
    }
    animate()
  }, [])

  const speak = useCallback((text) => {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    if (selectedVoice) utt.voice = selectedVoice
    utt.rate = 1.0
    utt.pitch = 0.85
    utt.volume = 1
    setIsSpeaking(true)
    setStatus('TRANSMITTING')
    animateOrb(true)
    utt.onend = () => {
      setIsSpeaking(false)
      setStatus('STANDBY')
      animateOrb(false)
    }
    utt.onerror = () => {
      setIsSpeaking(false)
      setStatus('STANDBY')
      animateOrb(false)
    }
    window.speechSynthesis.speak(utt)
  }, [selectedVoice, animateOrb])

  const detectWeatherQuery = (text) => {
    const m = text.match(/weather\s+(?:in\s+|for\s+|at\s+)?([a-zA-Z\s,]+?)(?:\?|$)/i)
    return m ? m[1].trim() : null
  }

  const sendMessage = useCallback(async (text) => {
    if (!text.trim()) return
    if (!apiKey) {
      setStatus('NO API KEY')
      return
    }

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setTranscript('')
    setIsThinking(true)
    setStatus('PROCESSING')

    let weatherData = null
    const city = detectWeatherQuery(text)
    if (city) {
      setStatus('FETCHING WEATHER')
      try {
        const wRes = await fetch(`/api/weather?city=${encodeURIComponent(city)}`)
        const wJson = await wRes.json()
        if (!wJson.error) weatherData = wJson.summary
      } catch {}
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-groq-key': apiKey,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].slice(-12),
          weatherData,
        }),
      })
      const data = await res.json()
      setIsThinking(false)

      if (data.error) {
        setStatus('ERROR')
        setMessages(prev => [...prev, { role: 'assistant', content: `System error: ${data.error}` }])
        return
      }

      const reply = data.reply
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      speak(reply)
    } catch {
      setIsThinking(false)
      setStatus('CONNECTION LOST')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection to Groq lost. Check network.' }])
    }
  }, [apiKey, messages, speak])

  const setupRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return null
    const r = new SR()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'

    r.onresult = (e) => {
      let interim = ''
      let final = finalRef.current
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      finalRef.current = final
      setTranscript(final + interim)
    }
    r.onerror = () => { stopListening() }
    r.onend = () => {
      if (recognitionRef.current?._active) r.start()
    }
    return r
  }, [])

  const startListening = useCallback(() => {
    if (isSpeaking) window.speechSynthesis.cancel()
    finalRef.current = ''
    interimRef.current = ''
    setTranscript('')
    const r = setupRecognition()
    if (!r) { setStatus('NO MIC ACCESS'); return }
    r._active = true
    recognitionRef.current = r
    r.start()
    setIsListening(true)
    setStatus('LISTENING')
  }, [isSpeaking, setupRecognition])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current._active = false
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setStatus('STANDBY')
    const text = finalRef.current.trim()
    if (text) sendMessage(text)
    finalRef.current = ''
  }, [sendMessage])

  const toggleListening = () => {
    if (isListening) stopListening()
    else startListening()
  }

  const saveKey = () => {
    const k = keyInput.trim()
    if (!k || k.includes('•')) return
    localStorage.setItem('axiom_key', k)
    setApiKey(k)
    setKeySaved(true)
    setKeyInput('••••••••••••••••••••••••')
    setStatus('KEY ACCEPTED')
    setTimeout(() => {
      setMessages([{ role: 'assistant', content: WELCOME }])
      speak(WELCOME)
    }, 300)
  }

  const clearKey = () => {
    localStorage.removeItem('axiom_key')
    setApiKey('')
    setKeyInput('')
    setKeySaved(false)
    setMessages([])
    setStatus('STANDBY')
  }

  const statusColor = {
    'STANDBY': '#3d5566',
    'LISTENING': '#00e5ff',
    'PROCESSING': '#ffb300',
    'TRANSMITTING': '#00e5ff',
    'FETCHING WEATHER': '#ffb300',
    'KEY ACCEPTED': '#00ff88',
    'ERROR': '#ff4444',
    'CONNECTION LOST': '#ff4444',
    'NO API KEY': '#ff4444',
    'NO MIC ACCESS': '#ff4444',
  }[status] || '#3d5566'

  return (
    <>
      <Head>
        <title>AXIOM</title>
        <meta name="description" content="AXIOM — Advanced AI Assistant" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='%23040608' stroke='%2300e5ff' stroke-width='1.5'/><circle cx='16' cy='16' r='5' fill='%2300e5ff' opacity='0.8'/></svg>" />
      </Head>

      <div className={styles.container}>
        {/* Background grid */}
        <div className={styles.grid} aria-hidden="true" />
        <div className={styles.gridFade} aria-hidden="true" />

        {/* Header */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoDot} />
            <span className={styles.logoText}>AXIOM</span>
          </div>
          <div className={styles.statusBar}>
            <span className={styles.statusDot} style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
            <span className={styles.statusLabel} style={{ color: statusColor }}>{status}</span>
          </div>
          {keySaved && (
            <button className={styles.clearBtn} onClick={clearKey} title="Reset API key">
              RESET KEY
            </button>
          )}
        </header>

        {/* Orb */}
        <div className={styles.orbSection}>
          <div
            className={`${styles.orb} ${isListening ? styles.orbListening : ''} ${isSpeaking ? styles.orbSpeaking : ''}`}
            style={{ transform: `scale(${orbScale})` }}
            aria-hidden="true"
          >
            <div className={styles.orbCore} />
            <div className={styles.orbRing1} />
            <div className={styles.orbRing2} />
            <div className={styles.orbRing3} />
          </div>
        </div>

        {/* API Key setup */}
        {!keySaved && (
          <div className={styles.keySetup}>
            <p className={styles.keyLabel}>GROQ API KEY REQUIRED</p>
            <p className={styles.keySub}>
              Get your free key at{' '}
              <a href="https://console.groq.com" target="_blank" rel="noreferrer" className={styles.link}>
                console.groq.com
              </a>
            </p>
            <div className={styles.keyRow}>
              <input
                type="password"
                className={styles.keyInput}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="gsk_..."
                onKeyDown={e => e.key === 'Enter' && saveKey()}
                autoComplete="off"
              />
              <button className={styles.keyBtn} onClick={saveKey}>
                INITIALIZE
              </button>
            </div>
          </div>
        )}

        {/* Chat log */}
        <div className={styles.chatLog}>
          {messages.length === 0 && keySaved && (
            <div className={styles.emptyState}>
              <span className={styles.emptyText}>Tap the orb and speak</span>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`${styles.message} ${styles[msg.role]}`}>
              <span className={styles.msgRole}>{msg.role === 'user' ? 'YOU' : 'AXIOM'}</span>
              <p className={styles.msgText}>{msg.content}</p>
            </div>
          ))}
          {isThinking && (
            <div className={`${styles.message} ${styles.assistant}`}>
              <span className={styles.msgRole}>AXIOM</span>
              <div className={styles.thinking}>
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Transcript */}
        {transcript && (
          <div className={styles.transcriptBar}>
            <span className={styles.transcriptText}>{transcript}</span>
          </div>
        )}

        {/* Controls */}
        <div className={styles.controls}>
          <select
            className={styles.voiceSelect}
            onChange={e => setSelectedVoice(voices[parseInt(e.target.value)])}
            value={voices.indexOf(selectedVoice)}
          >
            {voices.map((v, i) => (
              <option key={i} value={i}>{v.name}</option>
            ))}
          </select>

          <button
            className={`${styles.micBtn} ${isListening ? styles.micActive : ''}`}
            onClick={toggleListening}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
            disabled={!keySaved || isThinking}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {isListening ? (
                <>
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </>
              ) : (
                <>
                  <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </>
              )}
            </svg>
          </button>

          <button
            className={styles.stopBtn}
            onClick={() => { window.speechSynthesis.cancel(); setIsSpeaking(false); setStatus('STANDBY'); animateOrb(false) }}
            aria-label="Stop speaking"
            title="Stop speaking"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}
