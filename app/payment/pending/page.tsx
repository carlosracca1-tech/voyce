"use client"

import { useRouter } from "next/navigation"

export default function PaymentPendingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Pending Icon */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#f59e0b]/20 border-2 border-[#f59e0b] flex items-center justify-center">
          <svg className="w-12 h-12 text-[#f59e0b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-4">Pago pendiente</h1>
        <p className="text-white/60 mb-8">
          Tu pago esta siendo procesado. Esto puede tomar unos minutos. Te notificaremos cuando se complete.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full py-4 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-xl text-white font-semibold hover:shadow-[0_0_30px_rgba(0,240,255,0.3)] transition-all"
          >
            Ir al Dashboard
          </button>
          <p className="text-xs text-white/40">
            Si el pago se confirma, tu suscripcion se activara automaticamente.
          </p>
        </div>
      </div>
    </div>
  )
}
