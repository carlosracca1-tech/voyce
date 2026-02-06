import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

// --- helpers: HOY Argentina (UTC-3 fijo) ---
function getARDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)

  const y = Number(parts.find((p) => p.type === "year")?.value)
  const m = Number(parts.find((p) => p.type === "month")?.value)
  const d = Number(parts.find((p) => p.type === "day")?.value)
  return { y, m, d }
}

function arDayRangeUTC(now = new Date()) {
  // Inicio del día AR (00:00 AR) = 03:00 UTC
  const { y, m, d } = getARDateParts(now)
  const startUTC = new Date(Date.UTC(y, m - 1, d, 3, 0, 0))
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000)
  return { startUTC, endUTC }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50)

    // Si no hay DATABASE_URL, devolver noticias demo
    if (!process.env.DATABASE_URL) {
      const demoNews = [
        {
          id: 1,
          source: "Clarín",
          title: "Argentina lidera la innovación tecnológica en Latinoamérica",
          summary: "Un nuevo informe destaca el crecimiento del ecosistema startup argentino.",
          category: "tecnologia",
          published_at: new Date().toISOString(),
          importance_score: 20,
        },
        {
          id: 2,
          source: "La Nación",
          title: "El dólar se mantiene estable en la jornada de hoy",
          summary: "Los mercados financieros muestran señales de recuperación.",
          category: "economia",
          published_at: new Date().toISOString(),
          importance_score: 80,
        },
        {
          id: 3,
          source: "Infobae",
          title: "River y Boca se enfrentarán el próximo domingo",
          summary: "El superclásico del fútbol argentino promete emociones.",
          category: "deportes",
          published_at: new Date().toISOString(),
          importance_score: -50,
        },
        {
          id: 4,
          source: "Ámbito",
          title: "Nuevas medidas económicas para impulsar el crecimiento",
          summary: "El gobierno anunció un paquete de incentivos para PyMEs.",
          category: "economia",
          published_at: new Date().toISOString(),
          importance_score: 75,
        },
        {
          id: 5,
          source: "TN",
          title: "Pronóstico del clima: se esperan lluvias para el fin de semana",
          summary: "El servicio meteorológico emitió un alerta amarilla.",
          category: "general",
          published_at: new Date().toISOString(),
          importance_score: 0,
        },
      ]

      const filtered = category ? demoNews.filter((n) => n.category === category) : demoNews

      // ✅ orden editorial en demo
      filtered.sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))

      return NextResponse.json({
        ok: true,
        news: filtered.slice(0, limit),
        total: filtered.length,
        isDemo: true,
      })
    }

    const sql = neon(process.env.DATABASE_URL)
    const { startUTC, endUTC } = arDayRangeUTC()

    // HOY Argentina:
    // - Preferimos published_at dentro del rango
    // - Si published_at es null, usamos fetched_at como fallback
    // ✅ Además: priorizamos por importance_score para evitar “relleno”
    const dayWhere = sql`
      (
        (
          published_at IS NOT NULL
          AND published_at >= ${startUTC.toISOString()}
          AND published_at <  ${endUTC.toISOString()}
        )
        OR
        (
          published_at IS NULL
          AND fetched_at >= ${startUTC.toISOString()}
          AND fetched_at <  ${endUTC.toISOString()}
        )
      )
      AND importance_score > 5
    `

    let news
    if (category) {
      news = await sql`
        SELECT id, source, title, summary, category, link, published_at, fetched_at, importance_score
        FROM news_articles
        WHERE ${dayWhere}
          AND category = ${category}
        ORDER BY importance_score DESC, published_at DESC NULLS LAST, fetched_at DESC
        LIMIT ${limit}
      `
    } else {
      news = await sql`
        SELECT id, source, title, summary, category, link, published_at, fetched_at, importance_score
        FROM news_articles
        WHERE ${dayWhere}
        ORDER BY importance_score DESC, published_at DESC NULLS LAST, fetched_at DESC
        LIMIT ${limit}
      `
    }

    return NextResponse.json({
      ok: true,
      news,
      total: news.length,
      isDemo: false,
      day: { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() },
    })
  } catch (error) {
    console.error("News fetch error:", error)
    return NextResponse.json({ error: "internal_error", message: "Error al obtener noticias" }, { status: 500 })
  }
}
