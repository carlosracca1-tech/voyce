import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)

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
        },
        {
          id: 2,
          source: "La Nación",
          title: "El dólar se mantiene estable en la jornada de hoy",
          summary: "Los mercados financieros muestran señales de recuperación.",
          category: "economia",
          published_at: new Date().toISOString(),
        },
        {
          id: 3,
          source: "Infobae",
          title: "River y Boca se enfrentarán el próximo domingo",
          summary: "El superclásico del fútbol argentino promete emociones.",
          category: "deportes",
          published_at: new Date().toISOString(),
        },
        {
          id: 4,
          source: "Ámbito",
          title: "Nuevas medidas económicas para impulsar el crecimiento",
          summary: "El gobierno anunció un paquete de incentivos para PyMEs.",
          category: "economia",
          published_at: new Date().toISOString(),
        },
        {
          id: 5,
          source: "TN",
          title: "Pronóstico del clima: se esperan lluvias para el fin de semana",
          summary: "El servicio meteorológico emitió un alerta amarilla.",
          category: "general",
          published_at: new Date().toISOString(),
        },
      ]

      const filtered = category
        ? demoNews.filter((n) => n.category === category)
        : demoNews

      return NextResponse.json({
        ok: true,
        news: filtered.slice(0, limit),
        total: filtered.length,
        isDemo: true,
      })
    }

    const sql = neon(process.env.DATABASE_URL)

    // Obtener noticias de hoy
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let news
    if (category) {
      news = await sql`
        SELECT id, source, title, summary, category, link, published_at
        FROM news_articles
        WHERE fetched_at >= ${today.toISOString()}
        AND category = ${category}
        ORDER BY published_at DESC
        LIMIT ${limit}
      `
    } else {
      news = await sql`
        SELECT id, source, title, summary, category, link, published_at
        FROM news_articles
        WHERE fetched_at >= ${today.toISOString()}
        ORDER BY published_at DESC
        LIMIT ${limit}
      `
    }

    return NextResponse.json({
      ok: true,
      news,
      total: news.length,
      isDemo: false,
    })
  } catch (error) {
    console.error("News fetch error:", error)
    return NextResponse.json(
      { error: "internal_error", message: "Error al obtener noticias" },
      { status: 500 }
    )
  }
}
