"use client"

import { useEffect, useRef, useState } from "react"
import type { Mode, VoicePreset } from "@/lib/voyce/types"
import { presetToVoice, safeSpeed } from "@/lib/voyce/voice"
import { buildRealtimeInstructions } from "@/lib/voyce/instructions"
import { byImportanceDesc, formatList, listForSource } from "@/lib/voyce/headlines"
import { guessSourceFromTranscript, wantsChangeSource, wantsTopWithoutSource, wantsRefresh, extractPick } from "@/lib/voyce/intents"

function waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 4000) {
  if (pc.iceGatheringState === "complete") return Promise.resolve()
  return new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, timeoutMs)
    const onChange = () => {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(t)
        pc.removeEventListener("icegatheringstatechange", onChange)
        resolve()
      }
    }
    pc.addEventListener("icegatheringstatechange", onChange)
  })
}

type UseVoyceRealtimeArgs = {
  activeMode: Mode
  voicePreset: VoicePreset
  voiceSpeed: number
  headlinesCacheRef: React.MutableRefObject<any[]>
  headlinesReadyRef: React.MutableRefObject<boolean>
}

export function useVoyceRealtime({
  activeMode,
  voicePreset,
  voiceSpeed,
  headlinesCacheRef,
  headlinesReadyRef,
}: UseVoyceRealtimeArgs) {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentText, setCurrentText] = useState("")
  const [userTranscript, setUserTranscript] = useState("")

  // ✅ Mute state (sin cortar WebRTC)
  const [isMuted, setIsMuted] = useState(false)
  const [debugLog, setDebugLog] = useState<Array<{ t: number; label: string; [k: string]: unknown }>>([])
  const [micLevel, setMicLevel] = useState(0)

  const pushDebug = (label: string, data?: Record<string, unknown>) => {
    const entry = { t: Date.now(), label, ...(data ?? {}) }
    setDebugLog((prev) => [...prev.slice(-49), entry])
  }

  // Fallback: Web Speech API para mostrar transcripción cuando la API de OpenAI no la envía
  const isListeningRef = useRef(isListening)
  isListeningRef.current = isListening
  useEffect(() => {
    if (!isListening) return
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionAPI) return

    const rec = new SpeechRecognitionAPI()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = "es-AR"

    rec.onresult = (e: any) => {
      let text = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res?.isFinal) text += res[0]?.transcript ?? ""
      }
      if (text.trim()) setUserTranscript((prev) => (prev ? prev + " " + text : text))
    }

    rec.onend = () => {
      if (isListeningRef.current) try { rec.start() } catch {}
    }
    rec.start()

    return () => {
      try { rec.abort() } catch {}
    }
  }, [isListening])

  // Mic level para debug: muestra que el mic está captando
  useEffect(() => {
    if (!isListening || !micStreamRef.current) {
      setMicLevel(0)
      return
    }
    const stream = micStreamRef.current
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
    const ctx = new AudioCtx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)

    let rafId: number
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const sum = data.reduce((a, b) => a + b, 0)
      const avg = sum / data.length
      setMicLevel(Math.min(100, Math.round(avg * 2)))
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      ctx.close()
      setMicLevel(0)
    }
  }, [isListening])

  // Realtime refs
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const remoteAudioElRef = useRef<HTMLAudioElement | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  // ✅ Tracks para reemplazar (mic real / silencio)
  const micTrackRef = useRef<MediaStreamTrack | null>(null)
  const silentTrackRef = useRef<MediaStreamTrack | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Guards
  const connectingRef = useRef(false)

  // flujo diario elegido
  const chosenSourceRef = useRef<string | null>(null)

  const sendEvent = (evt: any) => {
    const dc = dcRef.current
    if (!dc || dc.readyState !== "open") return
    dc.send(JSON.stringify(evt))
  }

  const injectSystemText = (text: string) => {
    sendEvent({
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text }] },
    })
  }

  const requestResponse = (instructions?: string) => {
    setIsSpeaking(true)
    const payload: Record<string, unknown> = { type: "response.create" }
    if (instructions?.trim()) payload.response = { instructions }
    sendEvent(payload)
  }

  const ensureMic = async () => {
    if (micStreamRef.current) return micStreamRef.current
    micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    micTrackRef.current = micStreamRef.current.getAudioTracks()?.[0] ?? null
    return micStreamRef.current
  }

  // ✅ Track de “silencio real” para que server_vad no se dispare con ambiente
  const getSilentTrack = () => {
    if (silentTrackRef.current) return silentTrackRef.current

    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
    const ctx = new AudioCtx()
    audioCtxRef.current = ctx

    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.value = 0 // SILENCIO

    const dest = ctx.createMediaStreamDestination()
    oscillator.connect(gain)
    gain.connect(dest)
    oscillator.start()

    const silent = dest.stream.getAudioTracks()[0]
    silentTrackRef.current = silent
    return silent
  }

  // ✅ Reemplaza el track que se envía al server sin cerrar nada
  const applyMicTrack = async (muted: boolean) => {
    const pc = pcRef.current
    if (!pc) return

    let nextTrack: MediaStreamTrack | null = null

    if (muted) {
      nextTrack = getSilentTrack()
    } else {
      if (!micTrackRef.current) {
        await ensureMic()
      }
      nextTrack = micTrackRef.current
    }

    // Reemplazar en el sender de audio (si no hay track, igual intentamos)
    const senders = pc.getSenders()
    for (const s of senders) {
      const kind = s.track?.kind
      if (kind === "audio" || kind == null) {
        try {
          await s.replaceTrack(nextTrack)
        } catch {
          // ignore
        }
      }
    }
  }

  const toggleMute = async () => {
    const next = !isMuted
    setIsMuted(next)
    await applyMicTrack(next)
  }

  const formattedHeadlines = () => formatList([...(headlinesCacheRef.current || [])].sort(byImportanceDesc), 30)

  const connectRealtime = async () => {
    if (connectingRef.current) return
    if (isListening && dcRef.current?.readyState === "open") return

    connectingRef.current = true
    setIsProcessing(true)
    setCurrentText("")
    setIsSpeaking(false)
    pushDebug("connect start")

    try {
      const voice = presetToVoice(voicePreset)
      const speed = safeSpeed(voiceSpeed)

      const tokenResp = await fetch(
        `/api/realtime/token?voice=${encodeURIComponent(voice)}&speed=${encodeURIComponent(String(
          speed
        ))}&mode=${encodeURIComponent(activeMode)}&preset=${encodeURIComponent(voicePreset)}`,
        { cache: "no-store" }
      )
      const tokenData = await tokenResp.json()
      const EPHEMERAL_KEY = tokenData?.value ?? tokenData?.client_secret?.value
      if (!EPHEMERAL_KEY) throw new Error("No ephemeral key returned from /api/realtime/token")

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] })
      pcRef.current = pc

      pc.oniceconnectionstatechange = () => console.log("[webrtc] ice", pc.iceConnectionState)
      pc.onconnectionstatechange = () => console.log("[webrtc] pc", pc.connectionState)

      const audioEl = document.createElement("audio")
      audioEl.autoplay = true
      audioEl.setAttribute("playsinline", "true")
      document.body.appendChild(audioEl)
      remoteAudioElRef.current = audioEl

      pc.ontrack = (e) => {
        pushDebug("ontrack", { kind: e.track.kind, streamsLen: e.streams?.length ?? 0 })
        const remoteStream = e.streams?.[0] ?? new MediaStream([e.track])
        if (!remoteStream || remoteStream.getAudioTracks().length === 0) return
        audioEl.autoplay = true
        audioEl.muted = false
        audioEl.srcObject = remoteStream
        audioEl.play()
          .then(() => pushDebug("audio playing"))
          .catch((err) => pushDebug("audio play blocked", { err: String(err) }))
      }

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = micStream
      micTrackRef.current = micStream.getAudioTracks()[0] ?? null
      for (const track of micStream.getAudioTracks()) pc.addTrack(track, micStream)

      const dc = pc.createDataChannel("oai-events")
      dcRef.current = dc

      dc.onopen = async () => {
        pushDebug("dc open")
        setIsListening(true)
        setIsProcessing(false)
        connectingRef.current = false
        chosenSourceRef.current = null

        // Send a detailed system prompt so the realtime model speaks as VOYCE
        const instructionsText = buildRealtimeInstructions(activeMode as any, (voicePreset as any) || "radio_pro")
        if (process.env.NODE_ENV === 'development') console.debug('Realtime: sending system instructions:', instructionsText.slice(0,600))

        const sessionPayload = {
          type: "realtime",
          turn_detection: { type: "server_vad" },
          instructions: instructionsText,
          input_audio_transcription: { model: "whisper-1" },
          audio: {
            input: { transcription: { model: "whisper-1", language: "es" } },
            output: { voice, speed },
          },
        }

        sendEvent({
          type: "session.update",
          session: sessionPayload,
        })

        // ✅ Si ya estaba muteado, aplicamos silencio sin cortar la sesión
        if (isMuted) {
          await applyMicTrack(true)
        }

        const allFormatted = formattedHeadlines()
        if (!allFormatted) {
          injectSystemText(`NO HAY TITULARES CARGADOS EN DB PARA HOY.`)
          requestResponse(`Decí directo: "Todavía no tengo titulares cargados para hoy. ¿Querés que intente actualizar ahora?"`)
          return
        }

        const sources = ["La Nación", "Clarín", "Ámbito", "El Cronista", "Infobae", "Página 12"]
        const perSourceBlocks = sources
          .map((s) => {
            const list = listForSource(headlinesCacheRef.current || [], s)
            const block = formatList(list, 12)
            return `\n=== ${s.toUpperCase()} ===\n${block || "(sin titulares)"}`
          })
          .join("\n")

        injectSystemText(
          `TITULARES HOY (Argentina) - ORDENADOS POR IMPORTANCIA.\n` +
            `Lista completa (top 30):\n${allFormatted}\n\n` +
            `Listas por diario:\n${perSourceBlocks}\n`
        )

        requestResponse(
          `Sin saludar. Preguntá textual:\n` +
            `"¿De qué diarios querés los principales titulares hoy? La Nación, Clarín, Ámbito, Cronista, Infobae, Página 12."\n` +
            `Si responde "principales" sin elegir diario: leé TOP 5 (con diario) y preguntá si elige un diario o un titular.\n`
        )
      }

      dc.onmessage = async (msg) => {
        try {
          const evt = JSON.parse(msg.data)
          const evtType = evt?.type ?? ""

          if (evtType.includes("input_audio_buffer")) {
            pushDebug("VAD/buffer", { type: evtType })
          }
          if (evtType.includes("transcription") || evtType.includes("input_audio_transcription")) {
            pushDebug("evt transcription", { type: evtType, hasTranscript: !!evt?.transcript, hasDelta: !!evt?.delta })
          }
          if (evtType === "session.updated") {
            pushDebug("session.updated", { hasInputTranscription: !!(evt?.session?.input_audio_transcription || evt?.session?.audio?.input?.transcription) })
          }
          if (evtType === "error" || evt?.error) {
            pushDebug("API error", { type: evtType, error: evt?.error })
          }

          if (evtType.includes("response.completed") || evtType.includes("response.done")) {
            setIsSpeaking(false)
          }

          const transcriptFromItem = evt?.item?.content?.find?.((c: any) => c.type === "input_audio")?.transcript
          const transcript =
            (evt?.transcript && typeof evt.transcript === "string" && evt.transcript.trim()) ||
            (transcriptFromItem && typeof transcriptFromItem === "string" && transcriptFromItem.trim())
              ? (evt?.transcript?.trim?.() || transcriptFromItem?.trim?.())
              : ""

          const delta = evt?.delta && typeof evt.delta === "string" ? evt.delta.trim() : ""

          if (evt?.type?.includes("input_audio_transcription") || (evt?.type === "conversation.item.created" && evt?.item?.role === "user" && transcriptFromItem)) {
            const text = transcript || delta
            if (text) {
              pushDebug("YO (mic):", { text })
              if (evt?.type?.includes(".completed") || transcript) setUserTranscript(text)
              else if (delta) setUserTranscript((prev) => prev + delta)
              setCurrentText(text)
            }
          }
          if (evt?.type?.includes("audio_transcript") && transcript && !evt?.type?.includes("input_audio")) {
            pushDebug("IA:", { text: transcript })
            setCurrentText(transcript)
          }
          if (transcript && !evt?.type?.includes("input_audio_transcription")) setCurrentText(transcript)
          if (!transcript) return

          if (wantsChangeSource(transcript)) {
            chosenSourceRef.current = null
            requestResponse(
              `Sin saludar. Volvé a preguntar:\n` +
                `"¿De qué diarios querés los principales titulares hoy? La Nación, Clarín, Ámbito, Cronista, Infobae, Página 12."`
            )
            return
          }

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

          if (pickedSource) {
            chosenSourceRef.current = pickedSource
            const list = listForSource(headlinesCacheRef.current || [], pickedSource)
            const topN = activeMode === "podcast" ? 7 : 5
            injectSystemText(
              `DIARIO ELEGIDO: ${pickedSource}\nTITULARES DISPONIBLES:\n${formatList(list, 12) || "(sin titulares)"}`
            )

            requestResponse(
              activeMode === "podcast"
                ? `Sin saludar. Leé ${topN} titulares de ${pickedSource} (por importancia) como monólogo breve y al final: "¿Cuál querés que amplíe? Decime número o id."`
                : `Sin saludar. Leé ${topN} titulares de ${pickedSource} (por importancia) y al final: "¿Cuál querés que amplíe? Decime número o id."`
            )
            return
          }

          if (wantsRefresh(transcript)) {
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

          const { pickedId, pickedIndex } = extractPick(transcript)

          let finalId: number | null = pickedId
          if (!finalId && pickedIndex != null) {
            const listBase = chosenSourceRef.current
              ? listForSource(headlinesCacheRef.current || [], chosenSourceRef.current)
              : headlinesCacheRef.current || []
            if (pickedIndex >= 0 && pickedIndex < listBase.length) finalId = Number(listBase[pickedIndex]?.id ?? 0) || null
          }
          if (!finalId) return

          const aRes = await fetch(`/api/news/article?id=${finalId}`, { cache: "no-store" })
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
      await waitForIceGatheringComplete(pc)

      const localSdp = pc.localDescription?.sdp
      if (!localSdp) throw new Error("Missing local SDP")

      const sdpResp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: localSdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      })

      if (!sdpResp.ok) throw new Error(await sdpResp.text())

      const answerSdp = await sdpResp.text()
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp })
    } catch (e) {
      pushDebug("connect error", { err: String(e) })
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
    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {}
    micStreamRef.current = null
    micTrackRef.current = null
    const audioEl = remoteAudioElRef.current
    if (audioEl) {
      audioEl.srcObject = null
      if (audioEl.parentNode) audioEl.parentNode.removeChild(audioEl)
    }
    remoteAudioElRef.current = null
    dcRef.current = null
    pcRef.current = null

    // limpieza mute/silence
    try {
      silentTrackRef.current?.stop()
    } catch {}
    silentTrackRef.current = null

    try {
      audioCtxRef.current?.close()
    } catch {}
    audioCtxRef.current = null

    setIsMuted(false)
    setIsListening(false)
    setIsSpeaking(false)
    setCurrentText("")
    setUserTranscript("")
  }

  const toggleListening = () => {
    if (isListening) {
      disconnectRealtime()
      return
    }
    connectRealtime()
  }

  return {
    isListening,
    isProcessing,
    isSpeaking,
    currentText,
    setCurrentText,
    userTranscript,
    toggleListening,
    disconnectRealtime,

    isMuted,
    toggleMute,
    debugLog,
    micLevel,
  }
}
