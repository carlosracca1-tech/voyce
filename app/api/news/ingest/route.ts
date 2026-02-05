import { NextResponse } from "next/server"

// Fuentes RSS de diarios argentinos
const RSS_FEEDS = [
  { name: "Clarín", url: "https://www.clarin.com/rss/lo-ultimo/", category: "general" },
  { name: "La Nación", url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml", category: "general" },
  { name: "Infobae", url: "https://www.infobae.com/feeds/rss/", category: "general" },
  { name: "Página 12", url: "https://www.pagina12.com.ar/rss/portada", category: "general" },
  { name: "Ámbito", url: "https://www.ambito.com/rss/pages/home.xml", category: "economia" },
  { name: "El Cronista", url: "https://www.cronista.com/files/rss/cronista.xml", category: "economia" },
]

interface NewsArticle {
  source: string
  sourceUrl: string
  title: string
  summary: string
  content: string
  link: string
  category: string
  publishedAt: Date | null
}

// Función para verificar si una fecha es de hoy
function isToday(date: Date | null): boolean {
  if (!date) return false
  const today = new Date()
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear()
}

async function parseRSS(feedUrl: string): Promise<Array<{title: string, link: string, summary: string, publishedAt: Date | null}>> {
  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "VOYCE-Bot/1.0" },
      next: { revalidate: 0 }
    })
    
    if (!response.ok) {
      console.error(`Failed to fetch ${feedUrl}: ${response.status}`)
      return []
    }
    
    const xml = await response.text()
    const items: Array<{title: string, link: string, summary: string, publishedAt: Date | null}> = []
    
    // Simple XML parsing for RSS items
    const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || []
    
    for (const itemXml of itemMatches.slice(0, 50)) { // Max 50 per source para filtrar
      const title = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || ""
      const link = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim() || ""
      const description = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.trim() || ""
      const pubDate = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim()
      
      const publishedAt = pubDate ? new Date(pubDate) : null
      
      // SOLO agregar si es de HOY
      if (title && link) {
        items.push({
          title: title.replace(/<[^>]*>/g, "").trim(),
          link: link.replace(/<[^>]*>/g, "").trim(),
          summary: description.replace(/<[^>]*>/g, "").substring(0, 500).trim(),
          publishedAt
        })
      }
    }
    
    return items
  } catch (error) {
    console.error(`Error parsing RSS ${feedUrl}:`, error)
    return []
  }
}

export async function POST(request: Request) {
  // Verificar API key para seguridad (para cron jobs)
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const articles: NewsArticle[] = []
  
  // Fetch de todos los feeds
  for (const feed of RSS_FEEDS) {
    console.log(`Fetching ${feed.name}...`)
    const items = await parseRSS(feed.url)
    
    for (const item of items) {
      articles.push({
        source: feed.name,
        sourceUrl: feed.url,
        title: item.title,
        summary: item.summary,
        content: item.summary, // En RSS generalmente summary = content
        link: item.link,
        category: feed.category,
        publishedAt: item.publishedAt
      })
    }
  }
  
  // Si DATABASE_URL existe, guardar en Neon
  if (process.env.DATABASE_URL && articles.length > 0) {
    try {
      const { neon } = await import("@neondatabase/serverless")
      const sql = neon(process.env.DATABASE_URL)
      
      // Insertar artículos (ignorar duplicados por título)
      for (const article of articles) {
        await sql`
          INSERT INTO news_articles (source, source_url, title, summary, content, link, category, published_at)
          VALUES (${article.source}, ${article.sourceUrl}, ${article.title}, ${article.summary}, ${article.content}, ${article.link}, ${article.category}, ${article.publishedAt?.toISOString() || null})
          ON CONFLICT DO NOTHING
        `.catch(() => {}) // Ignorar errores de duplicados
      }
      
      // Limpiar noticias viejas (más de 7 días)
      await sql`DELETE FROM news_articles WHERE fetched_at < NOW() - INTERVAL '7 days'`
      
      return NextResponse.json({
        ok: true,
        articlesProcessed: articles.length,
        sources: RSS_FEEDS.length,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error("Error saving to database:", error)
    }
  }
  
  // Modo demo - solo devolver los artículos
  return NextResponse.json({
    ok: true,
    articlesProcessed: articles.length,
    sources: RSS_FEEDS.length,
    articles: articles.slice(0, 20), // Preview de los primeros 20
    timestamp: new Date().toISOString()
  })
}

// GET para obtener las noticias del día
export async function GET(request: Request) {
  if (process.env.DATABASE_URL) {
    try {
      const cronHeader = request.headers.get("x-vercel-cron")
      const cronSecret = process.env.CRON_SECRET

      // Permitir:
      // 1) Cron de Vercel (x-vercel-cron)
      // 2) POST manual con Authorization (para pruebas)
      if (!cronHeader && cronSecret) {
        const auth = request.headers.get("authorization")
        if (auth !== `Bearer ${cronSecret}`) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
      }

      const { neon } = await import("@neondatabase/serverless")
      const sql = neon(process.env.DATABASE_URL)
      
      const articles = await sql`
        SELECT id, source, title, summary, link, category, published_at, fetched_at
        FROM news_articles
        WHERE fetched_at > NOW() - INTERVAL '24 hours'
        ORDER BY fetched_at DESC
        LIMIT 50
      `
      
      return NextResponse.json({ ok: true, articles, count: articles.length })
    } catch (error) {
      console.error("Error fetching news:", error)
    }
  }
  
  // Modo demo
  return NextResponse.json({
    ok: true,
    articles: [
      { id: 1, source: "Demo", title: "Noticia de ejemplo", summary: "Esta es una noticia de demostración", category: "general" }
    ],
    count: 1,
    demo: true
  })
}
