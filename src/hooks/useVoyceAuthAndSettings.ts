"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import type { Mode, UserData, VoicePreset } from "@/lib/voyce/types"
import { normalizeMode, normalizePreset, normalizeSpeed } from "@/lib/voyce/normalize"

export function useVoyceAuthAndSettings() {
  const router = useRouter()

  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  // ✅ Settings (desde DB)
  const [activeMode, setActiveMode] = useState<Mode>("conversacion")
  const [voicePreset, setVoicePreset] = useState<VoicePreset>("radio_pro")
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.15)
  const [autoListen, setAutoListen] = useState<boolean>(true)

  const logout = useCallback(() => {
    localStorage.removeItem("voyce_user")
    localStorage.removeItem("voyce_settings")
    setUser(null)
    router.push("/")
  }, [router])

  useEffect(() => {
    const stored = localStorage.getItem("voyce_user")
    if (!stored) {
      setLoading(false)
      router.push("/")
      return
    }

    try {
      const userData: UserData = JSON.parse(stored)
      setUser(userData)

      ;(async () => {
        try {
          const res = await fetch(`/api/user/settings?userId=${userData.id}`, { cache: "no-store" })
          const data = await res.json()

          if (data?.ok && data?.settings) {
            setActiveMode(normalizeMode(data.settings.preferred_mode))
            setVoiceSpeed(normalizeSpeed(data.settings.voice_speed))
            setVoicePreset(normalizePreset(data.settings.voice_preset))
            setAutoListen(Boolean(data.settings.auto_listen ?? true))
            setLoading(false)
            return
          }
        } catch {
          // ignore → fallback local
        }

        const raw = localStorage.getItem("voyce_settings")
        if (raw) {
          try {
            const s = JSON.parse(raw)
            setActiveMode(normalizeMode(s.preferredMode))
            setVoiceSpeed(normalizeSpeed(s.voiceSpeed))
            setVoicePreset(normalizePreset(s.voicePreset))
            setAutoListen(Boolean(s.autoListen ?? true))
          } catch {}
        }

        setLoading(false)
      })()
    } catch {
      setLoading(false)
      router.push("/")
    }
  }, [router])

  return {
    // auth
    user,
    setUser,
    loading,
    logout,

    // settings
    activeMode,
    setActiveMode,
    voicePreset,
    setVoicePreset,
    voiceSpeed,
    setVoiceSpeed,
    autoListen,
    setAutoListen,

    // nav
    router,
  }
}
