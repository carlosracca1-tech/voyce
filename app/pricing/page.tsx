"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

const CheckIcon = () => (
  <svg className="w-5 h-5 text-[#00f0ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const plans = [
  {
    id: "monthly",
    name: "Mensual",
    price: 2.99,
    priceARS: 4499,
    period: "mes",
    popular: true,
  },
  {
    id: "yearly",
    name: "Anual",
    price: 29.99,
    priceARS: 44990,
    period: "año",
    popular: false,
    savings: "Ahorra 17%",
  },
]

const features = [
  "Acceso ilimitado al asistente de radio IA",
  "Modo Podcast con guiones automaticos",
  "Busqueda RAG de noticias en tiempo real",
  "Briefings diarios personalizados",
  "Generacion de contenido para redes",
  "Soporte prioritario 24/7",
  "Sin limite de consultas",
]

export default function PricingPage() {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState("monthly")
  const [isLoading, setIsLoading] = useState(false)
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD")
  const [showTrialModal, setShowTrialModal] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [user, setUser] = useState<{ subscription?: { status: string } } | null>(null)

  useEffect(() => {
    // Detectar si el usuario esta en Argentina
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone.includes("Buenos_Aires") || timezone.includes("Argentina")) {
      setCurrency("ARS")
    }
    
    // Cargar datos del usuario
    const stored = localStorage.getItem("voyce_user")
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        // ignore
      }
    }
  }, [])
  
  const hasNeverSubscribed = !user?.subscription || user.subscription.status === "none"

  const handleSubscribe = async () => {
    setIsLoading(true)

    try {
      const res = await fetch("/api/payments/create-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan, currency }),
      })

      const data = await res.json()

      if (data.init_point) {
        // Redirigir a MercadoPago
        window.location.href = data.init_point
      } else if (data.error) {
        alert(data.message || "Error al procesar el pago")
      }
    } catch {
      alert("Error de conexion. Intenta de nuevo.")
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleStartTrial = async () => {
    if (!acceptedTerms) return
    
    setIsLoading(true)
    try {
      // Activar trial en el backend
      const stored = localStorage.getItem("voyce_user")
      if (stored) {
        const userData = JSON.parse(stored)
        
        // Actualizar suscripcion a trial
        const updatedUser = {
          ...userData,
          subscription: {
            status: "trial",
            canAccess: true,
            daysLeft: 7,
            trialStarted: new Date().toISOString(),
            willChargeAfterTrial: true,
            planAfterTrial: "monthly",
            priceAfterTrial: 2.99
          }
        }
        
        localStorage.setItem("voyce_user", JSON.stringify(updatedUser))
        setShowTrialModal(false)
        router.push("/dashboard")
      }
    } catch {
      alert("Error al activar el trial")
    } finally {
      setIsLoading(false)
    }
  }

  const selectedPlanData = plans.find(p => p.id === selectedPlan)

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <ArrowLeftIcon />
          </button>
          <h1 className="text-xl font-semibold">Planes y precios</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Desbloquea todo el poder de{" "}
            <span className="bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] bg-clip-text text-transparent">
              VOYCE
            </span>
          </h2>
          <p className="text-white/60 max-w-xl mx-auto">
            Accede a todas las funcionalidades de tu asistente de radio con IA. 
            Cancela cuando quieras, sin compromisos.
          </p>
        </div>

        {/* Currency Toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-white/5 rounded-xl p-1">
            <button
              onClick={() => setCurrency("USD")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currency === "USD" ? "bg-white/10 text-white" : "text-white/50"
              }`}
            >
              USD
            </button>
            <button
              onClick={() => setCurrency("ARS")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currency === "ARS" ? "bg-white/10 text-white" : "text-white/50"
              }`}
            >
              ARS
            </button>
          </div>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`relative p-6 rounded-2xl border text-left transition-all ${
                selectedPlan === plan.id
                  ? "border-[#00f0ff] bg-[#00f0ff]/5 shadow-[0_0_30px_rgba(0,240,255,0.1)]"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-full text-xs font-semibold">
                  Mas popular
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  {plan.savings && (
                    <span className="text-xs text-[#00f0ff]">{plan.savings}</span>
                  )}
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedPlan === plan.id 
                    ? "border-[#00f0ff] bg-[#00f0ff]" 
                    : "border-white/30"
                }`}>
                  {selectedPlan === plan.id && (
                    <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">
                  {currency === "USD" ? `$${plan.price}` : `$${plan.priceARS.toLocaleString()}`}
                </span>
                <span className="text-white/50">/{plan.period}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Features */}
        <div className="p-6 bg-white/5 border border-white/10 rounded-2xl mb-8">
          <h3 className="font-semibold mb-4">Incluido en todos los planes:</h3>
          <ul className="space-y-3">
            {features.map((feature, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-white/80">
                <CheckIcon />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <button
          onClick={handleSubscribe}
          disabled={isLoading}
          className="w-full py-4 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-xl text-white font-semibold text-lg hover:shadow-[0_0_30px_rgba(0,240,255,0.3)] transition-all disabled:opacity-50"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Procesando...
            </span>
          ) : (
            <>
              Suscribirme a {selectedPlanData?.name} - {" "}
              {currency === "USD" 
                ? `$${selectedPlanData?.price} USD` 
                : `$${selectedPlanData?.priceARS.toLocaleString()} ARS`}
            </>
          )}
        </button>

        <p className="text-center text-xs text-white/40 mt-4">
          Pago seguro procesado por MercadoPago. Cancela cuando quieras.
        </p>
        
        {/* Trial Option */}
        {hasNeverSubscribed && (
          <div className="mt-8 text-center">
            <div className="inline-block p-4 bg-gradient-to-r from-[#00f0ff]/10 to-[#ff00aa]/10 border border-[#00f0ff]/20 rounded-xl">
              <p className="text-sm text-white/80 mb-3">
                Primera vez? Proba gratis por 7 dias
              </p>
              <button
                onClick={() => setShowTrialModal(true)}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-sm font-medium transition-all"
              >
                Empezar prueba gratuita
              </button>
            </div>
          </div>
        )}
      </main>
      
      {/* Trial Modal */}
      {showTrialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#12121a] border border-white/10 rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-2">Prueba gratuita de 7 dias</h3>
            <p className="text-white/60 text-sm mb-6">
              Accede a todas las funcionalidades de VOYCE durante una semana completa.
            </p>
            
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-6">
              <h4 className="font-medium mb-2">Condiciones del trial:</h4>
              <ul className="text-sm text-white/70 space-y-2">
                <li>- 7 dias de acceso completo y gratuito</li>
                <li>- Al finalizar el trial, se cobrara automaticamente <strong className="text-white">$2.99 USD/mes</strong></li>
                <li>- Podes cancelar en cualquier momento antes de que termine el trial</li>
                <li>- Sin compromiso, cancela cuando quieras</li>
              </ul>
            </div>
            
            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-white/30 bg-white/5 text-[#00f0ff] focus:ring-[#00f0ff]"
              />
              <span className="text-sm text-white/70">
                Acepto las condiciones del trial y autorizo el cobro de <strong className="text-white">$2.99 USD/mes</strong> al finalizar los 7 dias de prueba gratuita.
              </span>
            </label>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowTrialModal(false)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleStartTrial}
                disabled={!acceptedTerms || isLoading}
                className="flex-1 py-3 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
              >
                {isLoading ? "Activando..." : "Empezar trial"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
