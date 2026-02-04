import { NextResponse } from "next/server"

const PLANS = {
  monthly: {
    id: "monthly",
    title: "VOYCE Pro - Mensual",
    priceUSD: 3.99,
    priceARS: 3990,
  },
  yearly: {
    id: "yearly", 
    title: "VOYCE Pro - Anual",
    priceUSD: 39.99,
    priceARS: 39990,
  },
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { planId, currency = "USD" } = body

    const plan = PLANS[planId as keyof typeof PLANS]
    if (!plan) {
      return NextResponse.json({ error: "invalid_plan", message: "Plan no valido" }, { status: 400 })
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN

    if (!accessToken) {
      // Modo demo sin MercadoPago
      return NextResponse.json({
        demo: true,
        message: "MercadoPago no configurado. Agrega MERCADOPAGO_ACCESS_TOKEN en las variables de entorno.",
        init_point: null,
      })
    }

    const price = currency === "ARS" ? plan.priceARS : plan.priceUSD
    const currencyId = currency === "ARS" ? "ARS" : "USD"

    // Crear preferencia en MercadoPago
    const preference = {
      items: [
        {
          id: plan.id,
          title: plan.title,
          quantity: 1,
          currency_id: currencyId,
          unit_price: price,
        },
      ],
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL || "https://voyce.app"}/payment/success`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL || "https://voyce.app"}/payment/failure`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL || "https://voyce.app"}/payment/pending`,
      },
      auto_return: "approved",
      statement_descriptor: "VOYCE",
      external_reference: `voyce_${planId}_${Date.now()}`,
    }

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preference),
    })

    const mpData = await mpResponse.json()

    if (!mpResponse.ok) {
      console.error("MercadoPago error:", mpData)
      return NextResponse.json({ error: "mp_error", message: "Error con MercadoPago" }, { status: 500 })
    }

    return NextResponse.json({
      id: mpData.id,
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
    })

  } catch (error) {
    console.error("Payment error:", error)
    return NextResponse.json({ error: "internal_error", message: "Error del servidor" }, { status: 500 })
  }
}
