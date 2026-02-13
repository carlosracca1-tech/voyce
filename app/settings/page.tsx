"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

const getUser = () => {
  const raw = localStorage.getItem("voyce_user")
  return raw ? JSON.parse(raw) : null
}

interface UserSettings {
  voiceSpeed: number
  preferredMode: "conversacion" | "podcast"
  autoListen: boolean
  darkMode: boolean
  voicePreset?: "radio_pro" | "radio_canchero" | "podcast_story"
}

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

function normalizeSettings(input: any): UserSettings {
  const voiceSpeedRaw = Number(input?.voiceSpeed ?? input?.voice_speed ?? 1)
  const voiceSpeed =
    Number.isFinite(voiceSpeedRaw) && voiceSpeedRaw >= 0.5 && voiceSpeedRaw <= 2 ? voiceSpeedRaw : 1

  const pmRaw = (input?.preferredMode ?? input?.preferred_mode ?? "conversacion").toString().toLowerCase()
  const preferredMode: UserSettings["preferredMode"] = pmRaw === "podcast" ? "podcast" : "conversacion"

  const autoListen = Boolean(input?.autoListen ?? input?.auto_listen ?? true)
  const darkMode = Boolean(input?.darkMode ?? input?.dark_mode ?? true)

  const vpRaw = (input?.voicePreset ?? input?.voice_preset ?? "radio_pro").toString().toLowerCase()
  const voicePreset: UserSettings["voicePreset"] =
    vpRaw === "radio_canchero" ? "radio_canchero" : vpRaw === "podcast_story" ? "podcast_story" : "radio_pro"

  return { voiceSpeed, preferredMode, autoListen, darkMode, voicePreset }
}

export default function SettingsPage() {
  const router = useRouter()

  const [settings, setSettings] = useState<UserSettings>({
    voiceSpeed: 1,
    preferredMode: "conversacion",
    autoListen: true,
    darkMode: true,
    voicePreset: "radio_pro",
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const user = getUser()
    if (!user?.id) return

    fetch(`/api/user/settings?userId=${user.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.settings) {
          const normalized = normalizeSettings(d.settings)
          setSettings(normalized)

          // ✅ fallback local
          localStorage.setItem("voyce_settings", JSON.stringify(normalized))
        }
      })
      .catch(() => {
        // fallback local si falla
        const raw = localStorage.getItem("voyce_settings")
        if (!raw) return
        try {
          setSettings(normalizeSettings(JSON.parse(raw)))
        } catch {}
      })
  }, [])

  const handleSave = async () => {
    const user = getUser()
    if (!user?.id) return

    setIsSaving(true)

    const payload = {
      userId: user.id,
      voiceSpeed: settings.voiceSpeed,
      preferredMode: settings.preferredMode,
      autoListen: settings.autoListen,
      darkMode: settings.darkMode,
      voicePreset: settings.voicePreset ?? "radio_pro",
    }

    try {
      await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      // ✅ persist local + avisar al dashboard sin reload
      localStorage.setItem("voyce_settings", JSON.stringify(payload))
      window.dispatchEvent(new Event("voyce:settings-updated"))

      setMessage("Ajustes guardados")
    } catch {
      setMessage("No se pudieron guardar. Reintentá.")
    } finally {
      setTimeout(() => {
        setIsSaving(false)
        setMessage(null)
      }, 2000)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => router.push("/dashboard")} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <ArrowLeftIcon />
          </button>
          <h1 className="text-xl font-semibold">Ajustes</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8 p-4 bg-gradient-to-r from-[#00f0ff]/10 to-[#ff00aa]/10 border border-[#00f0ff]/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="px-2 py-0.5 bg-[#00f0ff] rounded text-xs font-bold text-black">BETA</div>
            <span className="font-medium">Modo prueba activo</span>
          </div>
          <p className="text-sm text-white/60">
            Estás usando VOYCE en modo beta. Todas las funciones están disponibles gratuitamente mientras probamos la aplicación.
          </p>
        </div>

        <div className="space-y-6">
          <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
            <h2 className="text-lg font-semibold mb-4">Configuración de voz</h2>

            {/* ✅ Preset de voz (ya lo tenías visualmente en screenshot, acá lo dejamos en settings) */}
            <div className="mb-6">
              <p className="text-sm text-white/60 mb-2">Estilo de voz</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "radio_pro" as const, label: "Radio Pro", desc: "Claro y directo" },
                  { id: "radio_canchero" as const, label: "Canchero", desc: "Más ágil" },
                  { id: "podcast_story" as const, label: "Story", desc: "Narrativo" },
                ].map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSettings({ ...settings, voicePreset: v.id })}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      settings.voicePreset === v.id ? "border-[#00f0ff] bg-[#00f0ff]/10" : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <p className="font-medium text-sm">{v.label}</p>
                    <p className="text-xs text-white/40 mt-1">{v.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-2">Velocidad de voz: {settings.voiceSpeed.toFixed(2)}x</label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.05"
                  value={settings.voiceSpeed}
                  onChange={(e) => setSettings({ ...settings, voiceSpeed: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#00f0ff]"
                />
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">Escucha automática</p>
                  <p className="text-sm text-white/40">Continuar escuchando después de cada respuesta</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, autoListen: !settings.autoListen })}
                  className={`w-12 h-6 rounded-full transition-all ${settings.autoListen ? "bg-[#00f0ff]" : "bg-white/20"}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      settings.autoListen ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
            <h2 className="text-lg font-semibold mb-4">Modo preferido</h2>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "conversacion" as const, label: "Conversación", desc: "Ida y vuelta con VOYCE" },
                { id: "podcast" as const, label: "Podcast", desc: "Lectura corrida estilo radio" },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setSettings({ ...settings, preferredMode: mode.id })}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    settings.preferredMode === mode.id ? "border-[#00f0ff] bg-[#00f0ff]/10" : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <p className="font-medium text-sm">{mode.label}</p>
                  <p className="text-xs text-white/40 mt-1">{mode.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {message && (
            <div className="p-4 rounded-xl border border-[#00f0ff]/30 bg-[#00f0ff]/10 text-[#00f0ff] text-center">
              {message}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-4 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-xl text-white font-semibold hover:shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all disabled:opacity-50"
          >
            {isSaving ? "Guardando..." : "Guardar ajustes"}
          </button>
        </div>
      </main>
    </div>
  )
}
