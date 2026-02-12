import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

export const runtime = "nodejs"

const sql = neon(process.env.DATABASE_URL!)

type VoicePreset = "radio_pro" | "radio_canchero" | "podcast_story"
type PreferredMode = "conversacion" | "podcast"

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function normalizePreferredMode(x: any): PreferredMode {
  const v = String(x ?? "").toLowerCase()
  return v === "podcast" ? "podcast" : "conversacion"
}

function normalizeVoicePreset(x: any): VoicePreset {
  const v = String(x ?? "").toLowerCase()
  if (v === "radio_canchero") return "radio_canchero"
  if (v === "podcast_story") return "podcast_story"
  return "radio_pro"
}

// Realtime speed recomendado: 0.25 - 1.5
function normalizeSpeed(x: any): number {
  const n = Number(x)
  if (!Number.isFinite(n)) return 1.15
  return clamp(n, 0.25, 1.5)
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = Number(searchParams.get("userId"))

    if (!userId) {
      return NextResponse.json({ ok: false, error: "missing_userId" }, { status: 400 })
    }

    const rows = await sql`
      select user_id, voice_speed, preferred_mode, auto_listen, dark_mode, voice_preset
      from user_settings
      where user_id = ${userId}
      limit 1
    `

    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        settings: {
          user_id: userId,
          voice_speed: 1.15,
          preferred_mode: "conversacion",
          auto_listen: true,
          dark_mode: true,
          voice_preset: "radio_pro",
        },
      })
    }

    // aseguramos defaults si algo vino null
    const s = rows[0] as any
    return NextResponse.json({
      ok: true,
      settings: {
        user_id: userId,
        voice_speed: Number(s.voice_speed ?? 1.15),
        preferred_mode: normalizePreferredMode(s.preferred_mode),
        auto_listen: Boolean(s.auto_listen ?? true),
        dark_mode: Boolean(s.dark_mode ?? true),
        voice_preset: normalizeVoicePreset(s.voice_preset),
      },
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const userId = Number(body.userId)

    if (!userId) {
      return NextResponse.json({ ok: false, error: "missing_userId" }, { status: 400 })
    }

    const voiceSpeed = normalizeSpeed(body.voiceSpeed ?? body.voice_speed)
    const preferredMode = normalizePreferredMode(body.preferredMode ?? body.preferred_mode)
    const autoListen = Boolean(body.autoListen ?? body.auto_listen ?? true)
    const darkMode = Boolean(body.darkMode ?? body.dark_mode ?? true)
    const voicePreset = normalizeVoicePreset(body.voicePreset ?? body.voice_preset)

    await sql`
      insert into user_settings (
        user_id, voice_speed, preferred_mode, auto_listen, dark_mode, voice_preset, updated_at
      )
      values (
        ${userId},
        ${voiceSpeed},
        ${preferredMode},
        ${autoListen},
        ${darkMode},
        ${voicePreset},
        now()
      )
      on conflict (user_id)
      do update set
        voice_speed = excluded.voice_speed,
        preferred_mode = excluded.preferred_mode,
        auto_listen = excluded.auto_listen,
        dark_mode = excluded.dark_mode,
        voice_preset = excluded.voice_preset,
        updated_at = now()
    `

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 })
  }
}

