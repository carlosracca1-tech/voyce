import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const ALLOWED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
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
  if (!Number.isFinite(n)) return 1.15
  return clamp(n, 0.25, 1.5)
}

export async function GET(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const voice = parseVoice(searchParams.get("voice"))
    const speed = parseSpeed(searchParams.get("speed"))

    // ✅ Importante: NO metemos "warm engaging" ni cosas raras acá.
    // La personalidad la controlamos desde el Dashboard con session.update + system injection.
    const sessionConfig = {
      session: {
        type: "realtime",
        model: "gpt-realtime",
        modalities: ["audio", "text"],
        voice,
        speed,

        // compat con tu formato anterior
        audio: {
          output: { voice },
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
      const text = await resp.text()
      return NextResponse.json({ error: "token_mint_failed", detail: text }, { status: 500 })
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: "internal_error", detail: e?.message ?? String(e) }, { status: 500 })
  }
}
