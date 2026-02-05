"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

interface UserData {
  id: number
  email: string
  name: string
  token: string
  subscription?: { status: string; canAccess: boolean; daysLeft?: number }
}

type Mode = "conversacion" | "podcast"

export default function Dashboard() {
  const router = useRouter()

  const [user, setUser] = useState<UserData | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // UI/estado de VOYCE
  const [activeMode, setActiveMode] = useState<Mode>("conversacion")
  const [isListening, setIsListening] = useState(false)   // live (webrtc abierto)
  const [isProcessing, setIsProcessing] = useState(false) // conectando
  const [isSpeaking, setIsSpeaking] = useState(false)     // “aprox”: mientras pedimos response
  const [currentText, setCurrentText] = useState("")      // transcripción
  const [audioLevel, setAudioLevel] = useState(0)

  const menuRef = useRef<HTMLDivElement | null>(null)

  // Realtime refs
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const remoteAudioElRef = useRef<HTMLAudioElement | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  // Cache de noticias (HOY) precargadas al abrir la app
  const headlinesCacheRef = useRef<any[]>([])
  const headlinesReadyRef = useRef(false)

  // Guards
  const connectingRef = useRef(false)
  const configuredSessionRef = useRef(false)

  // ---------- Helpers “safe” ----------
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
    // “aprox”: lo usamos para UI
    setIsSpeaking(true)
    sendEvent({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions,
      },
    })
  }

  const ensureMic = async () => {
    if (micStreamRef.current) return micStreamRef.current
    // Pedimos permiso SOLO con gesto (cuando toca orbe)
    micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    return micStreamRef.current
  }

  const formattedHeadlines = () => {
    const list = (headlinesCacheRef.current || []).slice(0, 10)
    if (!list.length) return ""
    return list.map((h: any, i: number) => `${i + 1}) [id:${h.id}] ${h.title} — ${h.source}`).join("\n")
  }

  // ---------- Cerrar menú clic afuera ----------
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      setTimeout(() => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setMenuOpen(false)
        }
      }, 0)
    }

    if (menuOpen) document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [menuOpen])

  // ---------- Auth local ----------
  useEffect(() => {
    const stored = localStorage.getItem("voyce_user")
    if (!stored) {
      router.push("/")
      return
    }
    try {
      const userData = JSON.parse(stored)
      setUser(userData)
    } catch {
      router.push("/")
    }
  }, [router])

  const handleLogout = () => {
    setMenuOpen(false)
    localStorage.removeItem("voyce_user")
    localStorage.removeItem("voyce_settings")
    router.push("/")
  }

  // ---------- Precarga de titulares HOY (apenas abre la app) ----------
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const r = await fetch("/api/news?limit=10", { cache: "no-store" })
        const d = await r.json()
        if (cancelled) return

        headlinesCacheRef.current = d?.news || []
        headlinesReadyRef.current = true
      } catch {
        if (cancelled) return
        headlinesCacheRef.current = []
        headlinesReadyRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // ---------- Animación audio level (cosmética) ----------
  useEffect(() => {
    if (isListening || isSpeaking) {
      const interval = setInterval(() => setAudioLevel(Math.random() * 100), 100)
      return () => clearInterval(interval)
    } else {
      setAudioLevel(0)
    }
  }, [isListening, isSpeaking])

  // ---------- Instrucciones estrictas (NOTICIERO) ----------
  const baseInstructions = useMemo(() => {
    const todayAR = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())

    return (
      `Sos VOYCE, locutor argentino. Fecha (Argentina): ${todayAR}.\n` +
      `Tu objetivo principal es contar y ampliar SOLO las noticias de HOY que te pasamos desde la base de datos.\n` +
      `Reglas duras:\n` +
      `- NO inventes noticias, NO uses conocimiento externo.\n` +
      `- Si el usuario pregunta algo que no está en los titulares/artículo inyectado, respondé breve y volvé a: "¿Qué titular querés que amplíe?"\n` +
      `- Podés ser cálido y conversacional, pero SIEMPRE volvé al noticiero.\n` +
      `- Primero leés titulares (de la lista), luego preguntás cuál ampliar.\n`
    )
  }, [])

  const modeInstructions = (mode: Mode) => {
    if (mode === "podcast") {
      return (
        baseInstructions +
        `Modo PODCAST: tono más continuo, estilo programa de radio. ` +
        `Leé 7 titulares en forma de monólogo breve (60-90s) y después preguntá: "¿Cuál querés que amplíe?"`
      )
    }
    return (
      baseInstructions +
      `Modo CONVERSACIÓN: más ida y vuelta. ` +
      `Leé 5 titulares, preguntá cuál ampliar y esperá.`
    )
  }

  // ---------- Conectar Realtime (solo cuando tocan la orbe) ----------
  const connectRealtime = async () => {
    if (connectingRef.current) return
    if (isListening && dcRef.current?.readyState === "open") return

    connectingRef.current = true
    setIsProcessing(true)
    setCurrentText("")

    try {
      // 1) Token efímero
      const tokenResp = await fetch("/api/realtime/token", { cache: "no-store" })
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

      // mic local (solo ahora)
      const ms = await ensureMic()
      ms.getTracks().forEach((t) => pc.addTrack(t))

      // data channel
      const dc = pc.createDataChannel("oai-events")
      dcRef.current = dc

      dc.onopen = async () => {
        setIsListening(true)
        setIsProcessing(false)
        connectingRef.current = false
        configuredSessionRef.current = false

        // 3) Config sesión (server_vad + transcribe)
        sendEvent({
          type: "session.update",
          session: {
            type: "realtime",
            turn_detection: { type: "server_vad" },
            input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
            instructions: modeInstructions(activeMode),
          },
        })
        configuredSessionRef.current = true

        // 4) Inyectar titulares precargados (HOY)
        const formatted = formattedHeadlines()
        if (!formatted) {
          injectSystemText(
            `NO HAY TITULARES CARGADOS EN DB PARA HOY.\n` +
              `Regla: decí "todavía no tengo titulares cargados para hoy" y ofrecé refrescar.`
          )
          requestResponse(
            `Decí: "Todavía no tengo titulares cargados para hoy. ¿Querés que intente actualizar ahora?" y esperá.`
          )
          return
        }

        injectSystemText(`TITULARES HOY (Argentina). Usá SOLO esto:\n${formatted}`)

        // 5) Primera salida: titulares
        requestResponse(
          activeMode === "podcast"
            ? `Arrancá el programa. Leé 7 titulares y terminá con: "¿Cuál querés que amplíe?"`
            : `Saludá breve. Leé 5 titulares y terminá con: "¿Cuál querés que amplíe?"`
        )
      }

      dc.onmessage = async (msg) => {
        try {
          const evt = JSON.parse(msg.data)

          // UX: cuando termina una respuesta, bajamos “hablando”
          if (evt?.type?.includes("response.completed") || evt?.type?.includes("response.done")) {
            setIsSpeaking(false)
          }

          // Transcripción (según evento que te llegue)
          const transcript =
            (evt?.transcript && typeof evt.transcript === "string" && evt.transcript.trim()) ? evt.transcript.trim() : ""

          if (transcript) {
            setCurrentText(transcript)
          }

          if (!transcript) return

          // Comandos “controlados”
          const wantsRefresh =
            /actualiz(a|á)|refresc(a|á)|recarg(a|á)|descarg(a|á)\s+de\s+nuevo|nuevas\s+noticias/i.test(transcript)

          if (wantsRefresh) {
            // 1) disparo ingest (si tu route es POST, ajustá a POST)
            try {
              await fetch("/api/news/ingest", { method: "POST" })
            } catch {}

            // 2) vuelvo a pedir titulares HOY
            try {
              const r = await fetch("/api/news?limit=10", { cache: "no-store" })
              const d = await r.json()
              headlinesCacheRef.current = d?.news || []
              headlinesReadyRef.current = true
            } catch {}

            const formatted = formattedHeadlines()
            injectSystemText(`TITULARES ACTUALIZADOS HOY (Argentina). Usá SOLO esto:\n${formatted || "(vacío)"}`)
            requestResponse(`Decí si hay titulares nuevos. Leé 5 titulares y preguntá cuál ampliar.`)
            return
          }

          // Selección de noticia: “la 3”, “el 2”, “id 123”
          const numMatch = transcript.match(/\b(?:la|el)\s+(\d{1,2})\b/i)
          const idMatch = transcript.match(/\bid\s*[:#]?\s*(\d+)\b/i)

          let pickedId: number | null = null

          if (idMatch) {
            pickedId = Number(idMatch[1])
          } else if (numMatch) {
            const idx = Number(numMatch[1]) - 1
            const list = headlinesCacheRef.current || []
            if (idx >= 0 && idx < list.length) pickedId = list[idx].id
          }

          if (!pickedId) return

          // Traer artículo completo (desde DB) e inyectar
          const aRes = await fetch(`/api/news/article?id=${pickedId}`, { cache: "no-store" })
          const aData = await aRes.json()

          if (aData?.ok && aData?.article) {
            const a = aData.article
            injectSystemText(
              `ARTÍCULO SELECCIONADO (HOY - DB). Usá SOLO esto.\n` +
                `Título: ${a.title}\nFuente: ${a.source}\nFecha: ${a.published_at}\nLink: ${a.link}\n\n` +
                `Resumen: ${a.summary ?? ""}\n\nContenido:\n${a.content ?? ""}`
            )

            requestResponse(
              `Ampliá esta noticia en 30 a 60 segundos. ` +
                `No inventes nada fuera del contenido. ` +
                `Después preguntá: "¿Querés que amplíe otro titular o te doy contexto de este?"`
            )
          }
        } catch {
          // ignore
        }
      }

      // 4) SDP handshake
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
      connectingRef.current = false
      configuredSessionRef.current = false
      setIsProcessing(false)
      setIsListening(false)
      setIsSpeaking(false)
    }
  }

  const disconnectRealtime = () => {
    try {
      dcRef.current?.close()
      pcRef.current?.close()
    } catch {}

    dcRef.current = null
    pcRef.current = null
    remoteAudioElRef.current = null

    // NO paramos el mic stream para reusar permiso y bajar latencia en próxima conexión,
    // pero si querés ahorro extremo, descomentá:
    // try { micStreamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    // micStreamRef.current = null

    setIsListening(false)
    setIsSpeaking(false)
    setCurrentText("")
  }

  const toggleListening = () => {
    if (isListening) {
      disconnectRealtime()
      return
    }
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

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
              <div className="p-4 border-b border-white/10">
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-white/40">{user.email}</p>
                <div className="mt-2 px-2 py-1 bg-gradient-to-r from-[#00f0ff]/20 to-[#ff00aa]/20 rounded-full inline-block">
                  <span className="text-xs font-medium">BETA - Acceso gratuito</span>
                </div>
              </div>
              <div className="p-2">
                <a href="/profile" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all">
                  <span>Mi Perfil</span>
                </a>
                <a href="/settings" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all">
                  <span>Ajustes</span>
                </a>
                <div className="my-2 border-t border-white/10" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#ff00aa] hover:bg-[#ff00aa]/10 transition-all"
                >
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-6">
        {/* Mode Selector (solo 2) */}
        <div className="flex gap-2 mb-12">
          {[
            { id: "conversacion" as const, label: "Conversación" },
            { id: "podcast" as const, label: "Podcast" },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
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

        {/* Orb */}
        <div className="relative mb-8 w-56 h-56 md:w-64 md:h-64 group">
          <div className="absolute inset-0">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute w-full h-full animate-spin"
                style={{ animationDuration: `${12 + i * 3}s`, animationDirection: i % 2 === 0 ? "normal" : "reverse" }}
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
                  }}
                />
              </div>
            ))}
          </div>

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
                ? "0 0 80px rgba(0, 240, 255, 0.6), 0 0 120px rgba(255, 0, 170, 0.4)"
                : isSpeaking
                  ? "0 0 80px rgba(255, 0, 170, 0.5), 0 0 120px rgba(139, 92, 246, 0.3)"
                  : "0 0 50px rgba(0, 240, 255, 0.25), 0 0 100px rgba(255, 0, 170, 0.1)",
              border: "1px solid rgba(0, 240, 255, 0.2)",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              {isProcessing ? (
                <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <div className={`relative transition-all duration-300 ${isListening || isSpeaking ? "scale-110" : "scale-100"}`}>
                  <div
                    className="w-16 h-16 md:w-20 md:h-20 rounded-full"
                    style={{
                      boxShadow: isListening
                        ? "0 0 40px #00f0ff"
                        : isSpeaking
                          ? "0 0 40px #ff00aa"
                          : "0 0 30px rgba(0,240,255,0.4), 0 0 60px rgba(255,0,170,0.2)",
                      animation: isListening || isSpeaking ? "pulse 1s ease-in-out infinite" : "none",
                      background:
                        isListening
                          ? "linear-gradient(135deg,#00f0ff,#0080ff)"
                          : isSpeaking
                            ? "linear-gradient(135deg,#ff00aa,#8b5cf6)"
                            : "linear-gradient(135deg,rgba(0,240,255,.5),rgba(255,0,170,.5))",
                    }}
                  />
                  {(isListening || isSpeaking) && (
                    <div className="absolute inset-0 flex items-center justify-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-white rounded-full animate-pulse"
                          style={{
                            height: `${12 + Math.sin(Date.now() / 200 + i) * 8 + audioLevel / 10}px`,
                            animationDelay: `${i * 0.1}s`,
                            animationDuration: "0.5s",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Status Text */}
        <div className="text-center mb-8 h-24">
          {isListening && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-[#00f0ff] mb-2">Escuchando…</p>
              {currentText && <p className="text-lg text-white/60 max-w-md">"{currentText}"</p>}
            </div>
          )}

          {isProcessing && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-[#ff00aa]">Conectando…</p>
              <p className="text-sm text-white/30 mt-2">
                Cargando VOYCE (titulares ya están listos desde la app)
              </p>
            </div>
          )}

          {isSpeaking && !isProcessing && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-[#8b5cf6]">VOYCE al aire</p>
            </div>
          )}

          {!isListening && !isProcessing && !isSpeaking && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-white/40 mb-2">Tocá para hablar</p>
              <p className="text-sm text-white/30">
                {activeMode === "conversacion"
                  ? "Titulares de hoy + ampliación por elección"
                  : "Modo programa: lectura corrida y luego elegís"}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center">
        <p className="text-xs text-white/30">
          {headlinesReadyRef.current
            ? "Titulares de hoy precargados"
            : "Cargando titulares…"}
        </p>
      </footer>

      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        @keyframes pulse {
          0%,100% { transform: scale(1); opacity: .9; }
          50% { transform: scale(1.08); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
