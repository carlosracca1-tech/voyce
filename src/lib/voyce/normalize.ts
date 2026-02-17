import type { Mode, VoicePreset } from "./types"

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

export function normalizeMode(x: any): Mode {
  const v = String(x ?? "").toLowerCase()
  return v === "podcast" ? "podcast" : "conversacion"
}

export function normalizePreset(x: any): VoicePreset {
  const v = String(x ?? "").toLowerCase()
  if (v === "radio_canchero") return "radio_canchero"
  if (v === "podcast_story") return "podcast_story"
  return "radio_pro"
}

export function normalizeSpeed(x: any): number {
  const n = Number(x)
  if (!Number.isFinite(n)) return 1.15
  return clamp(n, 0.25, 1.5)
}

export function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}
