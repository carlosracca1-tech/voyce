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
type VoicePreset = "radio_pro" | "radio_canchero" | "podcast_story"

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function normalizeMode(x: any): Mode {
  const v = String(x ?? "").toLowerCase()
  return v === "podcast" ? "podcast" : "conversacion"
}

function normalizePreset(x: any): VoicePreset {
  const v = String(x ?? "").toLowerCase()
  if (v === "radio_canchero") return "radio_canchero"
  if (v === "podcast_story") return "podcast_story"
  return "radio_pro"
}

function normalizeSpeed(x: any): number {
  const n = Number(x)
  if (!Number.isFinite(n)) return 1.15
  return clamp(n, 0.25, 1.5)
}

// ✅ preset -> voice realtime
function presetToVoice(preset: VoicePreset) {
  if (preset === "radio_canchero") return "verse"
  if (preset === "podcast_story") return "shimmer"
  return "marin" // radio_pro
}

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function guessSourceFromTranscript(t: string) {
  const x = norm(t)

  // orden importa (primero matches más específicos)
  if (/(la\s*nacion|nacion)/.test(x)) return "La Nación"
  if (/(clarin)/.test(x)) return "Clarín"
  if (/(ambito)/.test(x)) return "Ámbito"
  if (/(cronista|el\s*cronista)/.test(x)) return "El Cronista"
  if (/(infobae)/.test(x)) return "Infobae"
  if (/(pagina\s*12|pagina12)/.test(x)) return "Página 12"

  return null
}

function wantsTopWithoutSource(t: string) {
  const x = norm(t)
  // “principales” / “top” / “lo mas importante” sin elegir un diario
  return /(principales|top|mas\s*importantes|lo\s*mas\s*importante|titulares\s*principales)/.test(x)
}

function wantsChangeSource(t: string) {
  const x = norm(t)
  return /(otro\s*diario|cambiar\s*diario|cambiemos\s*de\s*diario|ninguno|no\s*me\s*gusta)/.test(x)
}

export default function Dashboard() {
  const router = useRouter()

  const [user, setUser] = useState<UserData | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    setMenuOpen(false)
    localStorage.removeItem("voyce_user")
    localStorage.removeItem("voyce_settings")
    router.push("/")
  }

  // ✅ Settings (desde DB)
  const [activeMode, setActiveMode] = useState<Mode>("conversacion")
  const [voicePreset, setVoicePreset] = useState<VoicePreset>("radio_pro")
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.15)
  const [autoListen, setAutoListen] = useState<boolean>(true)

  // UI/estado VOYCE
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentText, setCurrentText] = useState("")
  const [audioLevel, setAudioLevel] = useState(0)

  // ✅ transcripción desplegable
  const [showTranscript, setShowTranscript] = useState(false)

  const menuRef = useRef<HTMLDivElement | null>(null)

  // Realtime refs
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const remoteAudioElRef = useRef<HTMLAudioElement | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  // Cache titulares
  const headlinesCacheRef = useRef<any[]>([])
  const headlinesReadyRef = useRef(false)

  // Guards
  const connectingRef = useRef(false)

  // ✅ estado simple de “diario elegido” (solo para ayudar al flujo)
  const chosenSourceRef = useRef<string | null>(null)

  // ---------- Helpers realtime ----------
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

  const byImportanceDesc = (a: any, b: any) => {
    const sa = typeof a?.importance_score === "number" ? a.importance_score : 0
    const sb = typeof b?.importance_score === "number" ? b.importance_score : 0
    return sb - sa
  }

  const formatList = (list: any[], max = 10) => {
    const slice = (list || []).slice(0, max)
    if (!slice.length) return ""
    return slice
      .map((h: any, i: number) => {
        const score = typeof h.importance_score === "number" ? h.importance_score : null
        return `${i + 1}) [id:${h.id}] ${h.title} — ${h.source}${score != null ? ` (score:${score})` : ""}`
      })
      .join("\n")
  }

  const formattedHeadlines = () => formatList([...headlinesCacheRef.current].sort(byImportanceDesc), 30)

  const listForSource = (sourceName: string) => {
    const all = headlinesCacheRef.current || []
    const nsource = norm(sourceName)
    const filtered = all.filter((h) => norm(String(h?.source ?? "")).includes(nsource))
    return filtered.sort(byImportanceDesc)
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

  // ---------- Auth + load settings ----------
  useEffect(() => {
    const stored = localStorage.getItem("voyce_user")
    if (!stored) {
      router.push("/")
      return
    }

    try {
      const userData = JSON.parse(stored)
      setUser(userData)

      ;(async () => {
        try {
          const res = await fetch(`/api/user/settings?userId=${userData.id}`, { cache: "no-store" })
          const data = await res.json()
          if (data?.ok && data?.settings) {
            setActiveMode(normalizeMode(data.settings.preferred_mode))
            setVoiceSpeed(normalizeSpeed(data.settings.voice_speed))
            setVoicePreset(normalizePreset(data.settings.voice_preset))
            setAutoListen(Boolean(data.settings.auto_listen ?? true))
          }
        } catch {
          // fallback local
          const raw = localStorage.getItem("voyce_settings")
          if (raw) {
            try {
              const s = JSON.parse(raw)
              setActiveMode(normalizeMode(s.preferredMode))
              setVoiceSpeed(normalizeSpeed(s.voiceSpeed))
              setVoicePreset(normalizePreset(s.voicePreset))
              setAutoListen(Boolean(s.autoListen ?? true))
            } catch {}
          }
        }
      })()
    } catch {
      router.push("/")
    }
  }, [router])

  // ---------- Precarga titulares HOY ----------
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const r = await fetch("/api/news?limit=30", { cache: "no-store" })
        const d = await r.json()
        if (cancelled) return
        headlinesCacheRef.current = (d?.news || []).sort(byImportanceDesc)
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

  // ---------- Badge suscripción ----------
  const subscriptionBadge = useMemo(() => {
    const s = user?.subscription
    const status = (s?.status || "beta").toLowerCase()

    let label = "BETA - Acceso gratuito"
    if (status === "active") label = "PRO - Activo"
    else if (status === "trial") {
      const dl = typeof s?.daysLeft === "number" ? s.daysLeft : undefined
      label = dl != null ? `TRIAL - ${dl} días` : "TRIAL - Activo"
    } else if (status === "none") label = "Sin suscripción"

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

  // ---------- Instrucciones (AL GRANO + flujo diarios) ----------
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
      `Usás SOLO titulares de HOY que vienen de la DB (listas inyectadas). NO inventes.\n` +
      `Reglas duras:\n` +
      `- NO hagas charla social. NO "hola, ¿cómo estás?". Empezá directo con la pregunta de diarios.\n` +
      `- Si piden algo fuera de la lista/artículo: decí "No lo tengo en los titulares de hoy" y volvé a la elección.\n` +
      `Flujo obligatorio:\n` +
      `1) Preguntá: "¿De qué diarios querés los principales titulares hoy? La Nación, Clarín, Ámbito, Cronista, Infobae, Página 12."\n` +
      `2) Si el usuario dice "principales" sin diario: listá TOP 5 por importancia y nombrá el diario en cada uno.\n` +
      `3) Si elige diario: listá titulares de ESE diario (ordenados por importancia) y pedí elegir por número o id.\n` +
      `4) Si dice "otro diario"/"ninguno": volvé a la pregunta 1.\n`
    )
  }, [])

  const modeInstructions = (mode: Mode) => {
    if (mode === "podcast") {
      return (
        baseInstructions +
        `Modo PODCAST: lectura corrida estilo radio. Sin saludos. Con hilo conductor.\n` +
        `Cuando listás titulares: hacelo como monólogo breve y al final pedí elegir uno para ampliar.\n`
      )
    }
    return (
      baseInstructions +
      `Modo CONVERSACIÓN: ida y vuelta. Sin saludos. Preguntá y esperá.\n`
    )
  }

  // ---------- Conectar Realtime ----------
  const connectRealtime = async () => {
    if (connectingRef.current) return
    if (isListening && dcRef.current?.readyState === "open") return

    connectingRef.current = true
    setIsProcessing(true)
    setCurrentText("")
    setIsSpeaking(false)

    try {
      const voice = presetToVoice(voicePreset)
      const speed = normalizeSpeed(voiceSpeed)

      // ✅ mint con VOICE + SPEED
      const tokenResp = await fetch(
        `/api/realtime/token?voice=${encodeURIComponent(voice)}&speed=${encodeURIComponent(String(speed))}`,
        { cache: "no-store" }
      )
      const tokenData = await tokenResp.json()
      const EPHEMERAL_KEY = tokenData?.value
      if (!EPHEMERAL_KEY) throw new Error("No ephemeral key returned from /api/realtime/token")

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      const audioEl = document.createElement("audio")
      audioEl.autoplay = true
      remoteAudioElRef.current = audioEl
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0]
      }

      const ms = await ensureMic()
      ms.getTracks().forEach((t) => pc.addTrack(t))

      const dc = pc.createDataChannel("oai-events")
      dcRef.current = dc

      dc.onopen = async () => {
        setIsListening(true)
        setIsProcessing(false)
        connectingRef.current = false
        chosenSourceRef.current = null

        // ✅ MUY IMPORTANTE: mandar audio.output acá también
        sendEvent({
          type: "session.update",
          session: {
            type: "realtime",
            turn_detection: { type: "server_vad" },
            input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
            instructions: modeInstructions(activeMode),
            audio: { output: { voice, speed } },
          },
        })

        const allFormatted = formattedHeadlines()
        if (!allFormatted) {
          injectSystemText(`NO HAY TITULARES CARGADOS EN DB PARA HOY.`)
          requestResponse(`Decí directo: "Todavía no tengo titulares cargados para hoy. ¿Querés que intente actualizar ahora?"`)
          return
        }

        // Inyectamos: 1) lista completa 2) listas por diario (para que el modelo no improvise)
        const sources = ["La Nación", "Clarín", "Ámbito", "El Cronista", "Infobae", "Página 12"]
        const perSourceBlocks = sources
          .map((s) => {
            const list = listForSource(s)
            const block = formatList(list, 12)
            return `\n=== ${s.toUpperCase()} ===\n${block || "(sin titulares)"}`
          })
          .join("\n")

        injectSystemText(
          `TITULARES HOY (Argentina) - ORDENADOS POR IMPORTANCIA.\n` +
          `Lista completa (top 30):\n${allFormatted}\n\n` +
          `Listas por diario:\n${perSourceBlocks}\n`
        )

        // ✅ Arranque AL GRANO: pregunta diarios
        requestResponse(
          `Sin saludar. Preguntá textual:\n` +
          `"¿De qué diarios querés los principales titulares hoy? La Nación, Clarín, Ámbito, Cronista, Infobae, Página 12."\n` +
          `Si responde "principales" sin elegir diario: leé TOP 5 (con diario) y preguntá si elige un diario o un titular.\n`
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

          if (transcript) setCurrentText(transcript)
          if (!transcript) return

          // 0) Cambio de diario / ninguno
          if (wantsChangeSource(transcript)) {
            chosenSourceRef.current = null
            requestResponse(
              `Sin saludar. Volvé a preguntar:\n` +
              `"¿De qué diarios querés los principales titulares hoy? La Nación, Clarín, Ámbito, Cronista, Infobae, Página 12."`
            )
            return
          }

          // 1) “principales” sin diario
          const pickedSource = guessSourceFromTranscript(transcript)
          if (!pickedSource && wantsTopWithoutSource(transcript)) {
            const top5 = [...(headlinesCacheRef.current || [])].sort(byImportanceDesc).slice(0, 5)
            injectSystemText(`TOP 5 PRINCIPALES (HOY - DB):\n${formatList(top5, 5)}`)
            requestResponse(
              activeMode === "podcast"
                ? `Leé estos 5 como monólogo corto y al final preguntá: "¿Querés elegir un diario o amplío uno de estos? Decime número o id."`
                : `Leé estos 5 y preguntá: "¿Querés elegir un diario o amplío uno de estos? Decime número o id."`
            )
            return
          }

          // 2) Eligió un diario
          if (pickedSource) {
            chosenSourceRef.current = pickedSource
            const list = listForSource(pickedSource)
            const topN = activeMode === "podcast" ? 7 : 5
            injectSystemText(`DIARIO ELEGIDO: ${pickedSource}\nTITULARES DISPONIBLES:\n${formatList(list, 12) || "(sin titulares)"}`)

            requestResponse(
              activeMode === "podcast"
                ? `Sin saludar. Leé ${topN} titulares de ${pickedSource} (por importancia) como monólogo breve y al final: "¿Cuál querés que amplíe? Decime número o id."`
                : `Sin saludar. Leé ${topN} titulares de ${pickedSource} (por importancia) y al final: "¿Cuál querés que amplíe? Decime número o id."`
            )
            return
          }

          // 3) Refresh manual (si lo pedís)
          const wantsRefresh =
            /actualiz(a|á)|refresc(a|á)|recarg(a|á)|descarg(a|á)\s+de\s+nuevo|nuevas\s+noticias/i.test(norm(transcript))

          if (wantsRefresh) {
            try {
              await fetch("/api/news/ingest", { method: "POST" })
            } catch {}

            try {
              const r = await fetch("/api/news?limit=30", { cache: "no-store" })
              const d = await r.json()
              headlinesCacheRef.current = (d?.news || []).sort(byImportanceDesc)
              headlinesReadyRef.current = true
            } catch {}

            requestResponse(
              `Sin saludar. Decí si hay novedades y volvé a preguntar:\n` +
              `"¿De qué diarios querés los principales titulares hoy? La Nación, Clarín, Ámbito, Cronista, Infobae, Página 12."`
            )
            return
          }

          // 4) Selección por número o id (para ampliar)
          const numMatch = transcript.match(/\b(?:la|el)\s+(\d{1,2})\b/i)
          const idMatch = transcript.match(/\bid\s*[:#]?\s*(\d+)\b/i)

          let pickedId: number | null = null

          if (idMatch) {
            pickedId = Number(idMatch[1])
          } else if (numMatch) {
            const idx = Number(numMatch[1]) - 1
            const listBase = chosenSourceRef.current ? listForSource(chosenSourceRef.current) : (headlinesCacheRef.current || [])
            if (idx >= 0 && idx < listBase.length) pickedId = listBase[idx].id
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
              activeMode === "podcast"
                ? `Modo podcast: contá la nota casi completa con hilo conductor, sin inventar, 60-120s. Al final: "¿Amplío otro titular o cambiamos de diario?"`
                : `Modo conversación: ampliá 30-60s, directo, sin inventar. Al final: "¿Amplío otro titular o cambiamos de diario?"`
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
        {/* Mode pill (lo dejo como estaba) */}
        <div className="flex gap-2 mb-10">
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

        {/* Status + transcript toggle */}
        <div className="text-center mb-4">
          {isListening && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-[#00f0ff] mb-2">Escuchando…</p>
            </div>
          )}

          {isProcessing && (
            <div className="animate-fade-in">
              <p className="text-2xl font-light text-[#ff00aa]">Conectando…</p>
              <p className="text-sm text-white/30 mt-2">Cargando VOYCE</p>
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

          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setShowTranscript((v) => !v)}
              className="px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm text-white/70"
            >
              {showTranscript ? "Ocultar transcripción" : "Ver transcripción"}
            </button>
          </div>
        </div>

        {/* Transcript drawer */}
        <div
          className={`w-full max-w-2xl transition-all duration-300 overflow-hidden ${
            showTranscript ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="mt-2 p-4 bg-white/5 border border-white/10 rounded-2xl text-left">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white/80">Transcripción</p>
              <button
                onClick={() => setCurrentText("")}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Limpiar
              </button>
            </div>

            {currentText ? (
              <p className="text-sm text-white/70 whitespace-pre-wrap">{currentText}</p>
            ) : (
              <p className="text-sm text-white/40">Todavía no hay texto para mostrar.</p>
            )}
          </div>
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
