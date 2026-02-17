import { NextResponse } from "next/server"
import { buildSystem } from '@/lib/voyce/instructions'

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const voice = String(searchParams.get("voice") ?? "marin")
    const speed = Number(searchParams.get("speed") ?? 1)
    const modeParam = String(searchParams.get("mode") ?? "news").toLowerCase()
    const presetParam = String(searchParams.get("preset") ?? "radio_pro")
    const mode = modeParam === "podcast" ? "podcast" : "news"
    const preset = (presetParam === "radio_canchero" || presetParam === "podcast_story") ? presetParam : "radio_pro"

    const instructions = buildSystem(mode as any, preset as any)

    return NextResponse.json({
      ok: true,
      debugVoice: voice,
      debugSpeed: speed,
      debugMode: mode,
      debugPreset: preset,
      debugInstructions: instructions.slice(0, 2000),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
