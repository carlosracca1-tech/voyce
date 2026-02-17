import { NextResponse } from "next/server"
import { buildSystem } from '@/lib/voyce/instructions'

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const ALLOWED_VOICES = new Set([
  "marin",
  "alloy",
  "shimmer",
  "verse",
  "echo",
  "sage",
  "coral",
  "ash",
  "cedar",
  "ballad",
])

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function parseVoice(v: string | null) {
  const voice = String(v ?? "marin").toLowerCase()
  return ALLOWED_VOICES.has(voice) ? voice : "marin"
}

function parseSpeed(v: string | null) {
  const n = Number(v)
  // rango razonable para realtime (lo podés ajustar)
  if (!Number.isFinite(n)) return 1.0
  return clamp(n, 0.25, 1.5)
}

export async function GET(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 })

    const { searchParams } = new URL(req.url)

    const voice = parseVoice(searchParams.get("voice"))
    const speed = parseSpeed(searchParams.get("speed"))
    const modeParam = String(searchParams.get("mode") ?? "news").toLowerCase()
    const presetParam = String(searchParams.get("preset") ?? "radio_pro")

    const mode = modeParam === "podcast" ? "podcast" : "news"
    const preset = (presetParam === "radio_canchero" || presetParam === "podcast_story") ? presetParam : "radio_pro"

    // Build the VOYCE system instructions to include at session creation
    const instructions = buildSystem(mode as any, preset as any)

    // ✅ Realtime: voz/velocidad e instrucciones se setean en session.audio.output.voice/speed
    const sessionConfig = {
      session: {
        type: "realtime",
        model: "gpt-realtime",
        instructions,
        audio: {
          output: { voice, speed },
        },
      },
    }

    const resp = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    })

    if (!resp.ok) {
      const detail = await resp.text()
      return NextResponse.json({ error: "token_mint_failed", detail }, { status: 500 })
    }

    const data = await resp.json()
    return NextResponse.json({ ...data, debugVoice: voice, debugSpeed: speed, debugMode: mode, debugPreset: preset, debugInstructions: instructions.slice(0, 800) })
  } catch (e: any) {
    return NextResponse.json({ error: "internal_error", detail: e?.message ?? String(e) }, { status: 500 })
  }
}
