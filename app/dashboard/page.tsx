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

  // 👇 PEGALO ACÁ
  const handleLogout = () => {
    setMenuOpen(false)
    localStorage.removeItem("voyce_user")
    localStorage.removeItem("voyce_settings")
    router.push("/")
  }

  // UI/estado de VOYCE
  const [activeMode, setActiveMode] = useState<Mode>("conversacion")
  const [isListening, setIsListening] = useState(false) // live (webrtc abierto)
  const [isProcessing, setIsProcessing] = useState(false) // conectando
  const [isSpeaking, setIsSpeaking] = useState(false) // “aprox”: mientras pedimos response
  const [currentText, setCurrentText] = useState("") // transcripción
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

  // ---------- Auth local + modo preferido ----------
useEffect(() => {
  const stored = localStorage.getItem("voyce_user")
  if (!stored) {
    router.push("/")
    return
  }

  try {
    const userData = JSON.parse(stored)
    setUser(userData)

    // ✅ cargar settings desde DB y setear defaults del dashboard
    ;(async () => {
      try {
        const res = await fetch(
          `/api/user/settings?userId=${userData.id}`,
          { cache: "no-store" }
        )

        const data = await res.json()

        if (data?.ok && data?.settings) {
          const preferred = data.settings.preferred_mode
          setActiveMode(preferred === "podcast" ? "podcast" : "conversacion")
        }
      } catch (err) {
        // si falla, queda conversacion por default
      }
    })()

    // ✅ leer modo preferido desde ajustes (mismo naming que Settings)
    const rawSettings = localStorage.getItem("voyce_settings")
    if (rawSettings) {
      try {
        const s = JSON.parse(rawSettings)

        // migración por si quedó algo viejo ("chat"/"news")
        const preferred =
          s?.preferredMode === "podcast"
            ? "podcast"
            : s?.preferredMode === "conversacion"
              ? "conversacion"
              : s?.preferredMode === "chat"
                ? "conversacion"
                : s?.preferredMode === "news"
                  ? "conversacion"
                  : null

        if (preferred === "podcast" || preferred === "conversacion") {
          setActiveMode(preferred)
        }
      } catch {
        // ignore
      }
    }
  } catch {
    router.push("/")
  }
}, [router])

useEffect(() => {
  if (!user?.token) return

  ;(async () => {
    try {
      const res = await fetch("/api/user/settings", {
        method: "GET",
        headers: { Authorization: `Bearer ${user.token}` },
        cache: "no-store",
      })
      const data = await res.json()
      if (!data?.ok || !data?.settings) return

      const pm = (data.settings.preferred_mode ?? data.settings.preferredMode ?? "conversacion").toString().toLowerCase()
      setActiveMode(pm === "podcast" ? "podcast" : "conversacion")

      // opcional: guardar local para fallback/offline
      localStorage.setItem("voyce_settings", JSON.stringify({
        voiceSpeed: Number(data.settings.voice_speed ?? 1),
        preferredMode: pm === "podcast" ? "podcast" : "conversacion",
        autoListen: Boolean(data.settings.auto_listen ?? true),
        darkMode: Boolean(data.settings.dark_mode ?? true),
      }))
    } catch {
      // ignore
    }
  })()
}, [user?.token])


  // ---------- Precarga de titulares HOY ----------
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

  // ---------- Animación audio level ----------
  useEffect(() => {
    if (isListening || isSpeaking) {
      const interval = setInterval(() => setAudioLevel(Math.random() * 100), 100)
      return () => clearInterval(interval)
    } else {
      setAudioLevel(0)
    }
  }, [isListening, isSpeaking])

  // ---------- Suscripción (badge como antes) ----------
  const subscriptionBadge = useMemo(() => {
    const s = user?.subscription
    const status = (s?.status || "beta").toLowerCase()

    let label = "BETA - Acceso gratuito"
    if (status === "active") label = "PRO - Activo"
    else if (status === "trial") {
      const dl = typeof s?.daysLeft === "number" ? s.daysLeft : undefined
      label = dl != null ? `TRIAL - ${dl} días` : "TRIAL - Activo"
    } else if (status === "none") label = "Sin suscripción"
    else if (status === "beta") label = "BETA - Acceso gratuito"

    // Colores (suaves) según estado
    const classes =
      status === "active"
        ? "from-[#00f0ff]/20 to-[#00f0ff]/10"
        : status === "trial"
        ? "from-[#ff00aa]/20 to-[#8b5cf6]/15"
        : status === "none"
        ? "from-white/10 to-white/5"
        : "from-[#00f0ff]/20 to-[#ff00aa]/20"

    return { label, classes }
  }, [user])

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

        const formatted = formattedHeadlines()
        if (!formatted) {
          injectSystemText(
            `NO HAY TITULARES CARGADOS EN DB PARA HOY.\n` +
              `Regla: decí "todavía no tengo titulares cargados para hoy" y ofrecé refrescar.`
          )
          requestResponse(`Decí: "Todavía no tengo titulares cargados para hoy. ¿Querés que intente actualizar ahora?" y esperá.`)
          return
        }

        injectSystemText(`TITULARES HOY (Argentina). Usá SOLO esto:\n${formatted}`)

        requestResponse(
          activeMode === "podcast"
            ? `Arrancá el programa. Leé 7 titulares y terminá con: "¿Cuál querés que amplíe?"`
            : `Saludá breve. Leé 5 titulares y terminá con: "¿Cuál querés que amplíe?"`
        )
      }

      dc.onmessage = async (msg) => {
        try {
          const evt = JSON.parse(msg.data)

          if (evt?.type?.includes("response.completed") || evt?.type?.includes("response.done")) {
            setIsSpeaking(false)
          }

          const transcript =
            (evt?.transcript && typeof evt.transcript === "string" && evt.transcript.trim()) ? evt.transcript.trim() : ""

          if (transcript) {
            setCurrentText(transcript)
          }

          if (!transcript) return

          const wantsRefresh =
            /actualiz(a|á)|refresc(a|á)|recarg(a|á)|descarg(a|á)\s+de\s+nuevo|nuevas\s+noticias/i.test(transcript)

          if (wantsRefresh) {
            try {
              await fetch("/api/news/ingest", { method: "POST" })
            } catch {}

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

                {/* ✅ Badge real de suscripción + acceso a pricing */}
                <div className={`mt-2 px-2 py-1 bg-gradient-to-r ${subscriptionBadge.classes} rounded-full inline-flex items-center gap-2`}>
                  <span className="text-xs font-medium">{subscriptionBadge.label}</span>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      router.push("/pricing")
                    }}
                    className="text-xs text-[#00f0ff] hover:text-[#ff00aa] transition-colors"
                  >
                    Ver plan
                  </button>
                </div>
              </div>

              <div className="p-2">
                {/* ✅ Mantengo todo lo tuyo y sumo "Mi suscripción" como item */}
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    router.push("/pricing")
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all"
                >
                  <span>Mi suscripción</span>
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false)
                    router.push("/profile")
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all"
                >
                  <span>Mi Perfil</span>
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false)
                    router.push("/settings")
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all"
                >
                  <span>Ajustes</span>
                </button>

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
        {/* Mode Selector */}
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
              <p className="text-sm text-white/30 mt-2">Cargando VOYCE (titulares ya están listos desde la app)</p>
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
                {activeMode === "conversacion" ? "Titulares de hoy + ampliación por elección" : "Modo programa: lectura corrida y luego elegís"}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center">
        <p className="text-xs text-white/30">{headlinesReadyRef.current ? "Titulares de hoy precargados" : "Cargando titulares…"}</p>
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
