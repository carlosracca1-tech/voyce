export interface UserData {
  id: number
  email: string
  name: string
  token: string
  subscription?: { status: string; canAccess: boolean; daysLeft?: number }
}

export type Mode = "conversacion" | "podcast"
export type VoicePreset = "radio_pro" | "radio_canchero" | "podcast_story"
