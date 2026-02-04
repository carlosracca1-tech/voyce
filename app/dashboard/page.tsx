"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

// Types for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
    speechSynthesis: SpeechSynthesis
  }
}

// Types
interface UserData {
  id: number
  email: string
  name: string
  token: string
  subscription?: {
    status: string
    canAccess: boolean
    daysLeft?: number
  }
}

// Demo responses
const demoResponses: Record<string, string[]> = {
  default: [
    "Perfecto, estoy procesando tu consulta sobre ese tema...",
    "Interesante pregunta. Dejame darte un contexto completo...",
    "Analizando la informacion disponible para vos...",
  ],
  podcast: [
    "Para tu podcast de hoy, te sugiero arrancar con las principales noticias del momento...",
    "El tema que mencionas tiene varios angulos interesantes para tu audiencia...",
    "Prepare un resumen con los puntos clave que podrias mencionar al aire...",
  ],
  news: [
    "Las ultimas noticias sobre ese tema indican que...",
    "Encontre varios articulos relevantes. Los principales puntos son...",
    "Segun las fuentes mas recientes, la situacion es la siguiente...",
  ]
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentText, setCurrentText] = useState("")
  const [aiResponse, setAiResponse] = useState("")
  const [activeMode, setActiveMode] = useState<"chat" | "podcast" | "news">("chat")
  const [menuOpen, setMenuOpen] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  // const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  // const audioRef = useRef<HTMLAudioElement | null>(null)
  // const currentTextRef = useRef("")
  // const synthRef = useRef<SpeechSynthesis | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
const dcRef = useRef<RTCDataChannel | null>(null)
const remoteAudioElRef = useRef<HTMLAudioElement | null>(null)

// estados que ya tenés y reutilizamos:
/// isListening = conectado y escuchando (live)
/// isSpeaking = el asistente está hablando (lo controlamos “aprox” al principio)

  const menuRef = useRef<HTMLDivElement | null>(null)

  // Cerrar menu al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Usar setTimeout para que el onClick de los botones se ejecute primero
      setTimeout(() => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setMenuOpen(false)
        }
      }, 0)
    }
    
    if (menuOpen) {
      document.addEventListener("click", handleClickOutside)
    }
    
    return () => {
      document.removeEventListener("click", handleClickOutside)
    }
  }, [menuOpen])

  // Logout handler
  const handleLogout = () => {
    setMenuOpen(false)
    localStorage.removeItem("voyce_user")
    localStorage.removeItem("voyce_settings")
    router.push("/")
  }

  const sendEvent = (evt: any) => {
  const dc = dcRef.current
  if (!dc || dc.readyState !== "open") return
  dc.send(JSON.stringify(evt))
}

const injectSystemText = (text: string) => {
  sendEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "system",
      content: [{ type: "input_text", text }],
    },
  })
}

const requestResponse = (instructions?: string) => {
  setIsSpeaking(true)
  sendEvent({
    type: "response.create",
    response: {
      modalities: ["audio", "text"],
      instructions,
    },
  })
}

const connectRealtime = async () => {
  if (isProcessing) return
  setIsProcessing(true)

  try {
    // 1) Token efímero desde tu backend
    const tokenResp = await fetch("/api/realtime/token")
    const tokenData = await tokenResp.json()
    const EPHEMERAL_KEY = tokenData?.value
    if (!EPHEMERAL_KEY) throw new Error("No ephemeral key returned from /api/realtime/token")

    // 2) WebRTC
    const pc = new RTCPeerConnection()
    pcRef.current = pc

    // audio remoto
    const audioEl = document.createElement("audio")
    audioEl.autoplay = true
    remoteAudioElRef.current = audioEl

    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0]
    }

    // mic local
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
    pc.addTrack(ms.getTracks()[0])

    // data channel
    const dc = pc.createDataChannel("oai-events")
    dcRef.current = dc

    dc.onopen = async () => {
      // “Estamos live”
      setIsListening(true)
      setIsProcessing(false)

      // 3) Config de sesión (natural + titulares primero)
      sendEvent({
        type: "session.update",
        session: {
          type: "realtime",
          turn_detection: { type: "server_vad" },
          input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
          instructions:
            "Sos VOYCE, locutor argentino. Conversación súper natural y rápida. " +
            "Regla: primero leés 5 a 7 titulares del día basándote SOLO en la lista que te pasamos. " +
            "Después preguntás: '¿Cuál querés que amplíe?' y esperás. " +
            "Cuando el usuario elige un número o id, ampliás SOLO con el artículo completo que te vamos a inyectar. " +
            "Si el usuario te interrumpe, frenás y escuchás.",
        },
      })

      // 4) Inyectar titulares desde tu DB
      const newsRes = await fetch("/api/news?limit=10")
      const newsData = await newsRes.json()
      const list = (newsData?.news || []).slice(0, 10)
      const formatted = list
        .map((h: any, i: number) => `${i + 1}) [id:${h.id}] ${h.title} — ${h.source}`)
        .join("\n")

      injectSystemText(`TITULARES DISPONIBLES HOY (usá SOLO esto):\n${formatted}`)

      // 5) Primera respuesta
      requestResponse("Saludá y leé 5 a 7 titulares. Terminá preguntando cuál ampliar.")
    }

    // (Opcional) escucha transcripciones para detectar “la 3” y traer artículo
    dc.onmessage = async (msg) => {
      try {
        const evt = JSON.parse(msg.data)

        // cuando el usuario habla y se completa la transcripción
        const transcript =
          evt?.type?.includes("transcription") && evt?.transcript ? String(evt.transcript) : null

        if (!transcript) return

        // Detectar selección (la 3 / id 123)
        const numMatch = transcript.match(/\b(?:la|el)\s+(\d{1,2})\b/i)
        const idMatch = transcript.match(/\bid\s*[:#]?\s*(\d+)\b/i)

        let pickedId: number | null = null

        if (idMatch) pickedId = Number(idMatch[1])
        else if (numMatch) {
          const idx = Number(numMatch[1]) - 1
          const list = (await (await fetch("/api/news?limit=10")).json())?.news || []
          if (idx >= 0 && idx < list.length) pickedId = list[idx].id
        }

        if (pickedId) {
          // traer artículo completo e inyectar
          const aRes = await fetch(`/api/news/article?id=${pickedId}`)
          const aData = await aRes.json()

          if (aData?.ok && aData?.article) {
            const a = aData.article
            injectSystemText(
              `ARTÍCULO SELECCIONADO (usá SOLO esto, no inventes):\n` +
                `Título: ${a.title}\nFuente: ${a.source}\nFecha: ${a.published_at}\nLink: ${a.link}\n\n` +
                `Resumen: ${a.summary ?? ""}\n\nContenido:\n${a.content ?? ""}`
            )
            requestResponse(
              "Ampliá esta noticia en 30 a 60 segundos y después preguntá: '¿Querés impacto, contexto o escenarios?'"
            )
          }
        }
      } catch {
        // ignore
      }
    }

    // 6) SDP handshake
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    const sdpResp = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    })

    if (!sdpResp.ok) throw new Error(await sdpResp.text())

    const answerSdp = await sdpResp.text()
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp })
  } catch (e) {
    console.error(e)
    setIsProcessing(false)
    setIsListening(false)
  }
}

const disconnectRealtime = () => {
  try {
    dcRef.current?.close()
    pcRef.current?.close()

    // cortar tracks del mic si querés fino (opcional)
    const pc = pcRef.current
    pc?.getSenders()?.forEach((s) => {
      try {
        s.track?.stop()
      } catch {}
    })
  } catch {}

  dcRef.current = null
  pcRef.current = null
  remoteAudioElRef.current = null

  setIsListening(false)
  setIsSpeaking(false)
}


  // Cargar usuario - MODO BETA: todos pueden acceder
  useEffect(() => {
    const stored = localStorage.getItem("voyce_user")
    if (stored) {
      try {
        const userData = JSON.parse(stored)
        setUser(userData)
        // MODO BETA: No redirigir a pricing, todos pueden probar
        // if (userData.subscription && !userData.subscription.canAccess) {
        //   router.push("/pricing")
        // }
      } catch {
        router.push("/")
      }
    } else {
      router.push("/")
    }
  }, [router])

  // Audio level simulation
  useEffect(() => {
    if (isListening || isSpeaking) {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 100)
      }, 100)
      return () => clearInterval(interval)
    } else {
      setAudioLevel(0)
    }
  }, [isListening, isSpeaking])

  // Speech Recognition setup
  // useEffect(() => {
  //   if (typeof window !== "undefined") {
  //     const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  //     if (SpeechRecognition) {
  //       const recognition = new SpeechRecognition()
  //       recognition.lang = "es-AR"
  //       recognition.continuous = true // Modo continuo
  //       recognition.interimResults = true

  //       recognition.onresult = (event) => {
  //         const transcript = Array.from(event.results)
  //           .map(result => result[0].transcript)
  //           .join("")
  //         setCurrentText(transcript)
  //         currentTextRef.current = transcript
          
  //         // Si el resultado es final, procesar
  //         const lastResult = event.results[event.results.length - 1]
  //         if (lastResult.isFinal && transcript.trim()) {
  //           recognition.stop()
  //           processMessage(transcript)
  //         }
  //       }

  //       recognition.onend = () => {
  //         setIsListening(false)
  //       }

  //       recognition.onerror = () => {
  //         setIsListening(false)
  //       }

  //       recognitionRef.current = recognition
  //     }

  //     synthRef.current = window.speechSynthesis
  //     audioRef.current = new Audio()
  //   }
  // }, [])

  const processMessage = async (message: string) => {
    setIsProcessing(true)
    setAiResponse("")

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user?.token}`
        },
        body: JSON.stringify({ message, mode: activeMode })
      })

      const data = await res.json()
      const response = data.response || "Lo siento, hubo un error. Intenta de nuevo."
      
      setAiResponse(response)
      speakResponse(response)
    } catch {
      const fallback = demoResponses[activeMode]?.[Math.floor(Math.random() * 3)] || demoResponses.default[0]
      setAiResponse(fallback)
      speakResponse(fallback)
    } finally {
      setIsProcessing(false)
    }
  }

  // Usar SOLO Web Speech API para respuesta INSTANTANEA
  const speakResponse = (text: string) => {
    if (!synthRef.current) return
    
    synthRef.current.cancel()
    
    // Limitar texto para respuesta más rápida
    const shortText = text.length > 300 ? text.substring(0, 300) + "..." : text
    
    const utterance = new SpeechSynthesisUtterance(shortText)
    utterance.lang = "es-AR"
    utterance.rate = 1.1 // Un poco más rápido
    utterance.pitch = 1
    
    // Buscar voz en español si existe
    const voices = synthRef.current.getVoices()
    const spanishVoice = voices.find(v => v.lang.includes("es"))
    if (spanishVoice) utterance.voice = spanishVoice
    
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => {
      setIsSpeaking(false)
      // Volver a escuchar INMEDIATAMENTE
      setTimeout(() => {
        setCurrentText("")
        try {
          recognitionRef.current?.start()
          setIsListening(true)
        } catch {
          // Ignorar error si ya está escuchando
        }
      }, 300) // Reducido a 300ms
    }
    
    synthRef.current.speak(utterance)
  }

  const toggleListening = () => {
  // si está conectado (live) => cortá
  if (isListening) {
    disconnectRealtime()
    return
  }

  // si no, conectá
  connectRealtime()
}


  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white relative">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00f0ff]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#ff00aa]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#8b5cf6]/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-50 flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <svg className="w-10 h-10" viewBox="0 0 60 60" fill="none">
              <circle cx="30" cy="30" r="28" stroke="url(#logoGrad)" strokeWidth="2" />
              <path d="M20 22L30 38L40 22" stroke="url(#logoGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="30" cy="18" r="4" fill="url(#logoGrad)" />
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00f0ff" />
                  <stop offset="50%" stopColor="#ff00aa" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-2xl font-bold bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] bg-clip-text text-transparent">
              VOYCE
            </span>
          </div>
        </div>

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#ff00aa] flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 60 60" fill="none">
                <path d="M20 22L30 38L40 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="30" cy="18" r="4" fill="currentColor" />
              </svg>
            </div>
            <span className="text-sm font-medium">{user.name || user.email.split("@")[0]}</span>
            <svg className={`w-4 h-4 transition-transform ${menuOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
              <div className="p-4 border-b border-white/10">
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-white/40">{user.email}</p>
                <div className="mt-2 px-2 py-1 bg-gradient-to-r from-[#00f0ff]/20 to-[#ff00aa]/20 rounded-full inline-block">
                  <span className="text-xs font-medium">
                    BETA - Acceso gratuito
                  </span>
                </div>
              </div>
              <div className="p-2">
                <a
                  href="/profile"
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>Mi Perfil</span>
                </a>
                <a
                  href="/pricing"
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                  <span>Suscripcion</span>
                </a>
                <a
                  href="/settings"
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Ajustes</span>
                </a>
                <div className="my-2 border-t border-white/10" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#ff00aa] hover:bg-[#ff00aa]/10 transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Cerrar sesion</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-6">
        {/* Mode Selector */}
        <div className="flex gap-2 mb-12">
          {[
            { id: "chat", label: "Asistente" },
            { id: "podcast", label: "Podcast" },
            { id: "news", label: "Noticias" },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id as typeof activeMode)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                activeMode === mode.id
                  ? "bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] text-white shadow-[0_0_30px_rgba(0,240,255,0.3)]"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Futuristic Orb Voice Button */}
        <div className="relative mb-8 w-56 h-56 md:w-64 md:h-64 group">
          {/* IDLE: Floating particles that orbit slowly - ALWAYS visible but more intense when active */}
          <div className="absolute inset-0">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute w-full h-full animate-spin"
                style={{
                  animationDuration: `${12 + i * 3}s`,
                  animationDirection: i % 2 === 0 ? "normal" : "reverse"
                }}
              >
                <div
                  className={`absolute w-2 h-2 rounded-full transition-all duration-500 ${
                    isListening ? "bg-[#00f0ff] shadow-[0_0_20px_#00f0ff]" :
                    isSpeaking ? "bg-[#ff00aa] shadow-[0_0_20px_#ff00aa]" :
                    "bg-[#00f0ff]/60 shadow-[0_0_10px_#00f0ff]"
                  }`}
                  style={{
                    top: "50%",
                    left: "50%",
                    transform: `rotate(${i * 45}deg) translateX(${100 + i * 8}px) translateY(-50%)`,
                    opacity: isListening || isSpeaking ? 1 : 0.6,
                    animation: !isListening && !isSpeaking ? "pulse 2s ease-in-out infinite" : "none",
                    animationDelay: `${i * 0.25}s`
                  }}
                />
              </div>
            ))}
          </div>

          {/* IDLE: Breathing glow effect - subtle pulsing ring */}
          <div 
            className={`absolute inset-0 rounded-full transition-all duration-1000 ${
              isListening || isSpeaking ? "opacity-0" : "opacity-100"
            }`}
            style={{
              background: "radial-gradient(circle, transparent 50%, rgba(0, 240, 255, 0.1) 70%, transparent 80%)",
              animation: "breathe 3s ease-in-out infinite"
            }}
          />

          {/* Outer Glow Ring 1 - ALWAYS animated */}
          <div 
            className={`absolute inset-0 rounded-full transition-all duration-700 ${
              isListening || isSpeaking ? "opacity-60" : "opacity-30"
            }`}
            style={{
              background: `conic-gradient(from 0deg, transparent, ${isListening ? "#00f0ff" : isSpeaking ? "#ff00aa" : "#00f0ff"}, transparent, ${isListening ? "#ff00aa" : isSpeaking ? "#8b5cf6" : "#ff00aa"}, transparent)`,
              animation: "spin 8s linear infinite",
              filter: "blur(2px)"
            }}
          />

          {/* Outer Glow Ring 2 - ALWAYS animated */}
          <div 
            className={`absolute inset-2 rounded-full transition-all duration-700 ${
              isListening || isSpeaking ? "opacity-50" : "opacity-20"
            }`}
            style={{
              background: `conic-gradient(from 180deg, transparent, #8b5cf6, transparent, #00f0ff, transparent)`,
              animation: "spin 12s linear infinite reverse",
              filter: "blur(1px)"
            }}
          />

          {/* IDLE: Soft pulsing invitation ring */}
          {!isListening && !isSpeaking && !isProcessing && (
            <div 
              className="absolute inset-4 rounded-full border-2 border-[#00f0ff]/30"
              style={{
                animation: "pulse-ring-soft 3s ease-in-out infinite"
              }}
            />
          )}

          {/* Energy Pulse Rings - Only when active */}
          {(isListening || isSpeaking) && (
            <>
              <div className="absolute inset-4 rounded-full border border-[#00f0ff]/40 animate-ping" style={{ animationDuration: "2s" }} />
              <div className="absolute inset-8 rounded-full border border-[#ff00aa]/30 animate-ping" style={{ animationDuration: "2.5s", animationDelay: "0.5s" }} />
              <div className="absolute inset-12 rounded-full border border-[#8b5cf6]/20 animate-ping" style={{ animationDuration: "3s", animationDelay: "1s" }} />
            </>
          )}

          {/* Main Orb Button */}
          <button
            onClick={toggleListening}
            disabled={isProcessing}
            className={`absolute inset-6 rounded-full transition-all duration-500 transform hover:scale-110 active:scale-95 ${
              isProcessing ? "cursor-wait" : "cursor-pointer"
            }`}
            style={{
              background: isListening 
                ? "radial-gradient(circle at 30% 30%, #00f0ff 0%, #0080ff 30%, #ff00aa 70%, #8b5cf6 100%)"
                : isSpeaking
                  ? "radial-gradient(circle at 30% 30%, #ff00aa 0%, #8b5cf6 50%, #4c1d95 100%)"
                  : "radial-gradient(circle at 30% 30%, #1a1a2e 0%, #0f0f1a 50%, #0a0a12 100%)",
              boxShadow: isListening 
                ? "0 0 80px rgba(0, 240, 255, 0.6), 0 0 120px rgba(255, 0, 170, 0.4), inset 0 0 40px rgba(255, 255, 255, 0.1)"
                : isSpeaking
                  ? "0 0 80px rgba(255, 0, 170, 0.5), 0 0 120px rgba(139, 92, 246, 0.3), inset 0 0 40px rgba(255, 255, 255, 0.1)"
                  : "0 0 50px rgba(0, 240, 255, 0.25), 0 0 100px rgba(255, 0, 170, 0.1), inset 0 0 40px rgba(0, 0, 0, 0.6)",
              border: "1px solid rgba(0, 240, 255, 0.2)",
              animation: !isListening && !isSpeaking && !isProcessing ? "orb-breathe 4s ease-in-out infinite" : "none"
            }}
          >
            {/* Inner Glow Core */}
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div 
                className={`absolute inset-0 transition-opacity duration-500 ${isListening || isSpeaking ? "opacity-100" : "opacity-30"}`}
                style={{
                  background: "radial-gradient(circle at 40% 40%, rgba(255,255,255,0.4) 0%, transparent 50%)"
                }}
              />
              
              {/* Animated Inner Swirl */}
              <div 
                className={`absolute inset-0 ${isListening || isSpeaking ? "animate-spin" : ""}`}
                style={{ animationDuration: "3s" }}
              >
                <div 
                  className="absolute inset-4 rounded-full"
                  style={{
                    background: isListening 
                      ? "conic-gradient(from 0deg, transparent 0%, rgba(0,240,255,0.3) 25%, transparent 50%, rgba(255,0,170,0.3) 75%, transparent 100%)"
                      : isSpeaking
                        ? "conic-gradient(from 0deg, transparent 0%, rgba(255,0,170,0.3) 25%, transparent 50%, rgba(139,92,246,0.3) 75%, transparent 100%)"
                        : "none"
                  }}
                />
              </div>
            </div>

            {/* Center Icon/Indicator */}
            <div className="absolute inset-0 flex items-center justify-center">
              {isProcessing ? (
                <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <div className={`relative transition-all duration-300 ${isListening || isSpeaking ? "scale-110" : "scale-100"}`}>
                  {/* Pulsing Core */}
                  <div 
                    className={`w-16 h-16 md:w-20 md:h-20 rounded-full transition-all duration-300 ${
                      isListening ? "bg-gradient-to-br from-[#00f0ff] to-[#0080ff]" :
                      isSpeaking ? "bg-gradient-to-br from-[#ff00aa] to-[#8b5cf6]" :
                      "bg-gradient-to-br from-[#00f0ff]/50 to-[#ff00aa]/50"
                    }`}
                    style={{
                      boxShadow: isListening 
                        ? "0 0 40px #00f0ff, inset 0 0 20px rgba(255,255,255,0.3)"
                        : isSpeaking
                          ? "0 0 40px #ff00aa, inset 0 0 20px rgba(255,255,255,0.3)"
                          : "0 0 30px rgba(0,240,255,0.4), 0 0 60px rgba(255,0,170,0.2)",
                      animation: isListening || isSpeaking ? "pulse 1s ease-in-out infinite" : "core-glow 3s ease-in-out infinite"
                    }}
                  />
                  
                  {/* Sound Wave Bars */}
                  {(isListening || isSpeaking) && (
                    <div className="absolute inset-0 flex items-center justify-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-white rounded-full animate-pulse"
                          style={{
                            height: `${12 + Math.sin(Date.now() / 200 + i) * 8 + audioLevel / 10}px`,
                            animationDelay: `${i * 0.1}s`,
                            animationDuration: "0.5s"
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </button>

          {/* Floating Text Indicator */}
          <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 transition-all duration-300 ${
            isListening || isSpeaking ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}>
            <span className={`text-xs font-medium tracking-widest uppercase ${
              isListening ? "text-[#00f0ff]" : "text-[#ff00aa]"
            }`}>
              {isListening ? "escuchando" : isSpeaking ? "hablando" : ""}
            </span>
          </div>
        </div>

        {/* Status Text */}
        <div className="text-center mb-8 h-24">
          {isListening && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-[#00f0ff] mb-2">Escuchando...</p>
              {currentText && (
                <p className="text-lg text-white/60 max-w-md">"{currentText}"</p>
              )}
            </div>
          )}
          
          {isProcessing && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-[#ff00aa]">Procesando...</p>
            </div>
          )}
          
          {isSpeaking && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-[#8b5cf6] mb-2">VOYCE responde</p>
            </div>
          )}
          
          {!isListening && !isProcessing && !isSpeaking && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-white/40 mb-2">
                Toca para hablar
              </p>
              <p className="text-sm text-white/30">
                {activeMode === "chat" && "Preguntame lo que necesites"}
                {activeMode === "podcast" && "Preparemos tu proximo programa"}
                {activeMode === "news" && "Buscare las ultimas noticias"}
              </p>
            </div>
          )}
        </div>

        {/* AI Response Card */}
        {aiResponse && !isListening && (
          <div className="max-w-2xl w-full animate-fade-in">
            <div className="bg-[#12121a]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#ff00aa] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 60 60" fill="none">
                    <path d="M20 22L30 38L40 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="30" cy="18" r="4" fill="currentColor" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-white/90 leading-relaxed">{aiResponse}</p>
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex gap-3 mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={() => speakResponse(aiResponse)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  Repetir
                </button>
                <button
                  onClick={toggleListening}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#00f0ff]/20 to-[#ff00aa]/20 hover:from-[#00f0ff]/30 hover:to-[#ff00aa]/30 text-white text-sm transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                  Nueva consulta
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Status */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center">
        <p className="text-xs text-white/30">
          {user.subscription?.status === "trial" 
            ? `Trial gratuito - ${user.subscription.daysLeft} dias restantes`
            : user.subscription?.status === "active"
              ? "Plan Pro activo"
              : ""}
          {user.subscription?.status === "trial" && (
            <button 
              onClick={() => router.push("/pricing")}
              className="ml-2 text-[#00f0ff] hover:underline"
            >
              Actualizar plan
            </button>
          )}
        </p>
      </footer>

      {/* Global Styles */}
      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
