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
}

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

function getAuthToken() {
  const stored = localStorage.getItem("voyce_user")
  if (!stored) return ""
  try {
    const u = JSON.parse(stored)
    return (u?.token || "").toString()
  } catch {
    return ""
  }
}

function normalizeSettings(input: any): UserSettings {
  const voiceSpeedRaw = Number(input?.voiceSpeed ?? input?.voice_speed ?? 1)
  const voiceSpeed =
    Number.isFinite(voiceSpeedRaw) && voiceSpeedRaw >= 0.5 && voiceSpeedRaw <= 2 ? voiceSpeedRaw : 1

  const pmRaw = (input?.preferredMode ?? input?.preferred_mode ?? "conversacion").toString().toLowerCase()
  const preferredMode: UserSettings["preferredMode"] = pmRaw === "podcast" ? "podcast" : "conversacion"

  const autoListen = Boolean(input?.autoListen ?? input?.auto_listen ?? true)
  const darkMode = Boolean(input?.darkMode ?? input?.dark_mode ?? true)

  return { voiceSpeed, preferredMode, autoListen, darkMode }
}

export default function SettingsPage() {
  const router = useRouter()

  const [settings, setSettings] = useState<UserSettings>({
    voiceSpeed: 1,
    preferredMode: "conversacion",
    autoListen: true,
    darkMode: true,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

 useEffect(() => {
  const user = getUser()
  if (!user?.id) return

  fetch(`/api/user/settings?userId=${user.id}`, { cache: "no-store" })
    .then(r => r.json())
    .then(d => {
      if (d?.ok && d?.settings) {
        setSettings({
          voiceSpeed: Number(d.settings.voice_speed ?? 1),
          preferredMode:
            d.settings.preferred_mode === "podcast" ? "podcast" : "chat",
          autoListen: Boolean(d.settings.auto_listen),
          darkMode: Boolean(d.settings.dark_mode),
        })
      }
    })
}, [])

  const handleSave = async () => {
  const user = getUser()
  if (!user?.id) return

  setIsSaving(true)

  await fetch("/api/user/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...settings,
      userId: user.id,
    }),
  })

  setMessage("Ajustes guardados")
  setTimeout(() => {
    setIsSaving(false)
    setMessage(null)
  }, 2000)
}
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
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

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-2">Velocidad de voz: {settings.voiceSpeed}x</label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={settings.voiceSpeed}
                  onChange={(e) => setSettings({ ...settings, voiceSpeed: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#00f0ff]"
                />
                <div className="flex justify-between text-xs text-white/40 mt-1">
                  <span>Lento</span>
                  <span>Normal</span>
                  <span>Rápido</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">Escucha automática</p>
                  <p className="text-sm text-white/40">Continuar escuchando después de cada respuesta</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, autoListen: !settings.autoListen })}
                  className={`w-12 h-6 rounded-full transition-all ${
                    settings.autoListen ? "bg-[#00f0ff]" : "bg-white/20"
                  }`}
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
                    settings.preferredMode === mode.id
                      ? "border-[#00f0ff] bg-[#00f0ff]/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <p className="font-medium text-sm">{mode.label}</p>
                  <p className="text-xs text-white/40 mt-1">{mode.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
            <h2 className="text-lg font-semibold mb-4">Acerca de VOYCE</h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/60">Versión</span>
                <span>1.0.0-beta</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Estado</span>
                <span className="text-[#00f0ff]">Beta pública</span>
              </div>
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
