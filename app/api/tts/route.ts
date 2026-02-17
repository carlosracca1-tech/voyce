import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type PreferredMode = "conversacion" | "podcast"
type VoicePreset = "radio_pro" | "radio_canchero" | "podcast_story"

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function mapOpenAIVoice(preset?: VoicePreset) {
  // Forcing a consistent masculine default voice to match assistant instructions.
  // Use 'marin' as the male default voice; adjust if you prefer another OpenAI voice.
  if (preset === "radio_canchero") return "marin"
  if (preset === "podcast_story") return "marin"
  return "marin" // radio_pro default
}

function normalizeMode(x: any): PreferredMode {
  const v = String(x ?? "").toLowerCase()
  return v === "podcast" ? "podcast" : "conversacion"
}

function normalizeSpeed(x: any): number | null {
  const n = Number(x)
  if (!Number.isFinite(n)) return null
  return clamp(n, 0.5, 2)
}

// Combina tu slider con un ajuste mínimo por modo para que “podcast” sea más escuchable
function finalSpeed(preferredMode: PreferredMode, userSpeed: number | null) {
  const base = preferredMode === "podcast" ? 1.02 : 1.15
  // si el usuario configuró slider, lo respetamos (y no forzamos base)
  if (userSpeed !== null) return userSpeed
  return base
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const text = String(body?.text ?? "")

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    // Limitar texto para respuesta ultra rápida
    const shortText = text.substring(0, 700)

    const preferredMode = normalizeMode(body?.preferredMode ?? body?.preferred_mode)
    const voicePreset = (String(body?.voicePreset ?? body?.voice_preset ?? "radio_pro") as VoicePreset)
    const userSpeed = normalizeSpeed(body?.voiceSpeed ?? body?.voice_speed)
    const speed = finalSpeed(preferredMode, userSpeed)

    // Si hay API key de OpenAI, usar TTS
    if (process.env.OPENAI_API_KEY) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      try {
        const response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: shortText,
            voice: mapOpenAIVoice(voicePreset),
            response_format: "mp3",
            speed,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (!response.ok) throw new Error("OpenAI TTS failed")

        const audioBuffer = await response.arrayBuffer()

        return new NextResponse(audioBuffer, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": audioBuffer.byteLength.toString(),
          },
        })
      } catch (e) {
        clearTimeout(timeout)
        return NextResponse.json({ useBrowserTTS: true })
      }
    }

    return NextResponse.json({ useBrowserTTS: true })
  } catch (error) {
    console.error("TTS error:", error)
    return NextResponse.json({ useBrowserTTS: true })
  }
}
