import type { VoicePreset } from "./types"
import { normalizeSpeed } from "./normalize"

// ✅ preset -> voice realtime
export function presetToVoice(preset: VoicePreset) {
  if (preset === "radio_canchero") return "verse"
  if (preset === "podcast_story") return "shimmer"
  return "marin" // radio_pro
}

export function safeSpeed(speed: any) {
  return normalizeSpeed(speed)
}
