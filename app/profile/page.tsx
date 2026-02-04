"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface UserData {
  id: number
  email: string
  name: string
  token: string
  subscription?: {
    status: string
    canAccess: boolean
    daysLeft?: number
    trialEndsAt?: string
  }
}

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

const UserIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const SaveIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
)

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [formData, setFormData] = useState({ name: "", email: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("voyce_user")
    if (stored) {
      try {
        const userData = JSON.parse(stored)
        setUser(userData)
        setFormData({ name: userData.name || "", email: userData.email || "" })
      } catch {
        router.push("/")
      }
    } else {
      router.push("/")
    }
  }, [router])

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setMessage({ type: "error", text: "El nombre es requerido" })
      return
    }

    setIsSaving(true)
    setMessage(null)

    try {
      // Actualizar en backend
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user?.token}`
        },
        body: JSON.stringify({ name: formData.name.trim() })
      })
      
      if (res.ok) {
        const data = await res.json()
        const updatedUser = { ...user, name: data.user?.name || formData.name.trim() }
        localStorage.setItem("voyce_user", JSON.stringify(updatedUser))
        setUser(updatedUser as UserData)
        setMessage({ type: "success", text: "Perfil actualizado correctamente" })
      } else {
        // Fallback a local
        const updatedUser = { ...user, name: formData.name.trim() }
        localStorage.setItem("voyce_user", JSON.stringify(updatedUser))
        setUser(updatedUser as UserData)
        setMessage({ type: "success", text: "Perfil actualizado localmente" })
      }
    } catch {
      // Fallback a local
      const updatedUser = { ...user, name: formData.name.trim() }
      localStorage.setItem("voyce_user", JSON.stringify(updatedUser))
      setUser(updatedUser as UserData)
      setMessage({ type: "success", text: "Perfil actualizado localmente" })
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleLogout = () => {
    localStorage.removeItem("voyce_user")
    localStorage.removeItem("voyce_settings")
    router.push("/")
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <ArrowLeftIcon />
          </button>
          <h1 className="text-xl font-semibold">Mi Perfil</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#ff00aa] p-1 mb-4">
            <div className="w-full h-full rounded-full bg-[#0a0a0f] flex items-center justify-center">
              <UserIcon />
            </div>
          </div>
          <div className="px-3 py-1 bg-[#00f0ff]/20 border border-[#00f0ff]/30 rounded-full inline-block">
            <span className="text-xs font-medium text-[#00f0ff]">BETA - Acceso gratuito</span>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm text-white/60 mb-2">Nombre</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#00f0ff] transition-colors"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              disabled
              className="w-full py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-white/50 cursor-not-allowed"
            />
            <p className="text-xs text-white/40 mt-1">El email no se puede cambiar</p>
          </div>

          {message && (
            <div className={`p-4 rounded-xl border ${
              message.type === "success" 
                ? "border-[#00f0ff]/30 bg-[#00f0ff]/10 text-[#00f0ff]"
                : "border-[#ff00aa]/30 bg-[#ff00aa]/10 text-[#ff00aa]"
            }`}>
              {message.text}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-4 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-xl text-white font-semibold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <SaveIcon />
                Guardar cambios
              </>
            )}
          </button>
        </div>

        {/* Subscription Info */}
        <div className="mt-12 p-6 bg-white/5 border border-white/10 rounded-2xl">
          <h2 className="text-lg font-semibold mb-4">Tu suscripcion</h2>
          
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-white/60">Estado</span>
              <span className="text-[#00f0ff]">Beta publica</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Acceso</span>
              <span className="text-[#00f0ff]">Completo y gratuito</span>
            </div>
          </div>

          <p className="mt-4 text-xs text-white/40">
            Durante el periodo beta, todas las funciones estan disponibles sin costo.
          </p>
        </div>
        
        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full mt-6 py-4 border border-[#ff00aa]/50 rounded-xl text-[#ff00aa] font-medium hover:bg-[#ff00aa]/10 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Cerrar sesion
        </button>
      </main>
    </div>
  )
}
