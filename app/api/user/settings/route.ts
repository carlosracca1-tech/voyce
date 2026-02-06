import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

export const runtime = "nodejs"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = Number(searchParams.get("userId"))

    if (!userId) {
      return NextResponse.json({ ok: false, error: "missing_userId" }, { status: 400 })
    }

    const rows = await sql`
      select user_id, voice_speed, preferred_mode, auto_listen, dark_mode
      from user_settings
      where user_id = ${userId}
      limit 1
    `

    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        settings: {
          user_id: userId,
          voice_speed: 1,
          preferred_mode: "conversacion",
          auto_listen: true,
          dark_mode: true,
        },
      })
    }

    return NextResponse.json({ ok: true, settings: rows[0] })
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

    await sql`
      insert into user_settings (user_id, voice_speed, preferred_mode, auto_listen, dark_mode, updated_at)
      values (
        ${userId},
        ${body.voiceSpeed ?? 1},
        ${body.preferredMode ?? "conversacion"},
        ${body.autoListen ?? true},
        ${body.darkMode ?? true},
        now()
      )
      on conflict (user_id)
      do update set
        voice_speed = excluded.voice_speed,
        preferred_mode = excluded.preferred_mode,
        auto_listen = excluded.auto_listen,
        dark_mode = excluded.dark_mode,
        updated_at = now()
    `

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 })
  }
}
