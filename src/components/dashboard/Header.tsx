"use client"

import type { UserData } from "@/lib/voyce/types"
import { useMemo, useRef, useState } from "react"
import { useClickOutside } from "@/hooks/useClickOutside"
import { useRouter } from "next/navigation"

export default function Header({ user, onLogout }: { user: UserData; onLogout: () => void }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useClickOutside(menuOpen, menuRef, () => setMenuOpen(false))

  const subscriptionBadge = useMemo(() => {
    const s = user?.subscription
    const status = (s?.status || "beta").toLowerCase()

    let label = "BETA - Acceso gratuito"
    if (status === "active") label = "PRO - Activo"
    else if (status === "trial") {
      const dl = typeof s?.daysLeft === "number" ? s.daysLeft : undefined
      label = dl != null ? `TRIAL - ${dl} días` : "TRIAL - Activo"
    } else if (status === "none") label = "Sin suscripción"

    const classes =
      status === "active"
        ? "from-[#00f0ff]/20 to-[#00f0ff]/10"
        : status === "trial"
          ? "from-[#ff00aa]/20 to-[#8b5cf6]/15"
          : status === "none"
            ? "from-white/10 to-white/5"
            : "from-[#00f0ff]/20 to-[#ff00aa]/20"

    return { label, classes }
  }, [user])

  return (
    <header className="relative z-50 flex items-center justify-between p-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <svg className="w-10 h-10" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="28" stroke="url(#logoGrad)" strokeWidth="2" />
            <path
              d="M20 22L30 38L40 22"
              stroke="url(#logoGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="30" cy="18" r="4" fill="url(#logoGrad)" />
            <defs>
              <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f0ff" />
                <stop offset="50%" stopColor="#ff00aa" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-2xl font-bold bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] bg-clip-text text-transparent">
            VOYCE
          </span>
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#ff00aa] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 60 60" fill="none">
              <path
                d="M20 22L30 38L40 22"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="30" cy="18" r="4" fill="currentColor" />
            </svg>
          </div>
          <span className="text-sm font-medium">{user.name || user.email.split("@")[0]}</span>
          <svg
            className={`w-4 h-4 transition-transform ${menuOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
            <div className="p-4 border-b border-white/10">
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-white/40">{user.email}</p>

              <div className={`mt-2 px-2 py-1 bg-gradient-to-r ${subscriptionBadge.classes} rounded-full inline-flex items-center gap-2`}>
                <span className="text-xs font-medium">{subscriptionBadge.label}</span>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    router.push("/pricing")
                  }}
                  className="text-xs text-[#00f0ff] hover:text-[#ff00aa] transition-colors"
                >
                  Ver plan
                </button>
              </div>
            </div>

            <div className="p-2">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push("/pricing")
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all"
              >
                <span>Mi suscripción</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push("/profile")
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all"
              >
                <span>Mi Perfil</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push("/settings")
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5 hover:text-white transition-all"
              >
                <span>Ajustes</span>
              </button>

              <div className="my-2 border-t border-white/10" />

              <button
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#ff00aa] hover:bg-[#ff00aa]/10 transition-all"
              >
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
