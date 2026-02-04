"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function PaymentSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    // Actualizar estado de suscripcion del usuario
    const stored = localStorage.getItem("voyce_user")
    if (stored) {
      try {
        const userData = JSON.parse(stored)
        userData.subscription = {
          status: "active",
          canAccess: true,
        }
        localStorage.setItem("voyce_user", JSON.stringify(userData))
      } catch {}
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#ff00aa] flex items-center justify-center">
          <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-4">Pago exitoso!</h1>
        <p className="text-white/60 mb-8">
          Tu suscripcion a VOYCE Pro esta activa. Ya podes disfrutar de todas las funcionalidades sin limites.
        </p>

        <button
          onClick={() => router.push("/dashboard")}
          className="w-full py-4 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-xl text-white font-semibold hover:shadow-[0_0_30px_rgba(0,240,255,0.3)] transition-all"
        >
          Ir al Dashboard
        </button>
      </div>
    </div>
  )
}
