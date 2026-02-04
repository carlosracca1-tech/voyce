"use client"

import { useRouter } from "next/navigation"

export default function PaymentFailurePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#ff00aa]/20 border-2 border-[#ff00aa] flex items-center justify-center">
          <svg className="w-12 h-12 text-[#ff00aa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-4">Pago no completado</h1>
        <p className="text-white/60 mb-8">
          Hubo un problema con tu pago. No se realizo ningun cargo. Podes intentar de nuevo o elegir otro metodo de pago.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => router.push("/pricing")}
            className="w-full py-4 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-xl text-white font-semibold hover:shadow-[0_0_30px_rgba(0,240,255,0.3)] transition-all"
          >
            Intentar de nuevo
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full py-4 border border-white/20 rounded-xl text-white/70 hover:bg-white/5 transition-all"
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
