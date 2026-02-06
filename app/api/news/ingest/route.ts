import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

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

function htmlToText(html: string) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|article|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()

  return cleaned.slice(0, 20000)
}

async function fetchHtmlWithTimeout(url: string, timeoutMs = 12000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "VOYCE-Bot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    })

    clearTimeout(t)
    return res
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

async function parseRSS(feedUrl: string): Promise<Array<{ title: string; link: string; summary: string; publishedAt: Date | null }>> {
  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "VOYCE-Bot/1.0" },
      next: { revalidate: 0 },
    })

    if (!response.ok) {
      console.error(`Failed to fetch ${feedUrl}: ${response.status}`)
      return []
    }

    const xml = await response.text()
    const items: Array<{ title: string; link: string; summary: string; publishedAt: Date | null }> = []

    const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || []

    for (const itemXml of itemMatches.slice(0, 50)) {
      const title = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || ""

      const link =
        itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim() ||
        itemXml.match(/<guid[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/i)?.[1]?.trim() ||
        ""

      const description = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.trim() || ""
      const pubDate = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim()

      const publishedAt = pubDate ? new Date(pubDate) : null

      if (title && link) {
        items.push({
          title: title.replace(/<[^>]*>/g, "").trim(),
          link: link.replace(/<[^>]*>/g, "").trim(),
          summary: description.replace(/<[^>]*>/g, "").substring(0, 700).trim(),
          publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
        })
      }
    }

    return items
  } catch (error) {
    console.error(`Error parsing RSS ${feedUrl}:`, error)
    return []
  }
}

async function enrichPendingArticles(limit = 10) {
  if (!process.env.DATABASE_URL) {
    return { processed: 0, ok: 0, blocked: 0, error: 0 }
  }

  const { neon } = await import("@neondatabase/serverless")
  const sql = neon(process.env.DATABASE_URL)

  const pending = await sql`
    SELECT id, link
    FROM news_articles
    WHERE content_status = 'pending'
    ORDER BY fetched_at DESC
    LIMIT ${limit}
  `

  let ok = 0,
    blocked = 0,
    error = 0

  for (const row of pending) {
    const id = row.id as number
    const link = row.link as string

    try {
      const res = await fetchHtmlWithTimeout(link, 12000)

      if (res.status === 401 || res.status === 403) {
        await sql`
          UPDATE news_articles
          SET content_status='blocked',
              content_error=${`HTTP ${res.status}`},
              content_fetched_at=NOW()
          WHERE id=${id}
        `
        blocked++
        continue
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const html = await res.text()
      const text = htmlToText(html)

      await sql`
        UPDATE news_articles
        SET content_full=${text},
            content_status='ok',
            content_error=NULL,
            content_fetched_at=NOW()
        WHERE id=${id}
      `
      ok++
    } catch (e: any) {
      await sql`
        UPDATE news_articles
        SET content_status='error',
            content_error=${String(e?.message ?? "unknown")},
            content_fetched_at=NOW()
        WHERE id=${id}
      `
      error++
    }
  }

  return { processed: pending.length, ok, blocked, error }
}

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET

  // Vercel Cron
  const vercelCron = request.headers.get("x-vercel-cron")
  if (vercelCron) return true

  // Manual
  if (cronSecret) {
    const auth = request.headers.get("authorization")
    if (auth === `Bearer ${cronSecret}`) return true
  }

  return false
}

function calculateImportance(title: string, category: string, source: string) {
  const t = (title || "").toLowerCase()
  let score = 0

  // Economía / macro
  if (/(dólar|dolar|inflación|inflacion|fmi|tasas|deuda|reservas|cepo|banco central|bcra|pbi|riesgo país|riesgo pais)/.test(t)) score += 60

  // Política / medidas
  if (/(gobierno|congreso|ley|decreto|regulación|regulacion|elecciones|presidente|ministerio|gabinete|justicia|corte)/.test(t)) score += 45

  // Energía / minería / infraestructura
  if (/(vaca muerta|ypf|petróleo|petroleo|gas|energía|energia|litio|miner(a|ía)|oleoducto|gasoducto)/.test(t)) score += 40

  // Mercados / empresas
  if (/(bonos|acciones|merval|wall street|mercados|dólar blue|dolar blue|brecha|licitación|licitacion|subasta)/.test(t)) score += 35

  // Penalizaciones: deportes / farándula / color
  if (/(pumas|rugby|fútbol|futbol|boca|river|messi|tenis|selección|seleccion|mundial|gran premio|nba)/.test(t)) score -= 80
  if (/(show|farándula|farandula|famosos|celebridad|streamer|reality|espectáculos|espectaculos)/.test(t)) score -= 70

  // Categoría RSS
  if (category === "economia") score += 15

  // Fuentes económicas un poquito arriba
  if (/cronista|ámbito|ambito/i.test(source)) score += 5

  return score
}

// POST = ingest RSS
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const articles: NewsArticle[] = []

  for (const feed of RSS_FEEDS) {
    const items = await parseRSS(feed.url)

    for (const item of items) {
      articles.push({
        source: feed.name,
        sourceUrl: feed.url,
        title: item.title,
        summary: item.summary,
        content: item.summary,
        link: item.link,
        category: feed.category,
        publishedAt: item.publishedAt,
      })
    }
  }

  if (process.env.DATABASE_URL && articles.length > 0) {
    try {
      const { neon } = await import("@neondatabase/serverless")
      const sql = neon(process.env.DATABASE_URL)

      for (const article of articles) {
        const importance = calculateImportance(article.title, article.category, article.source)

        await sql`
          INSERT INTO news_articles (
            source, source_url, title, summary, content, link, category, published_at,
            content_status, importance_score
          )
          VALUES (
            ${article.source}, ${article.sourceUrl}, ${article.title}, ${article.summary},
            ${article.content}, ${article.link}, ${article.category},
            ${article.publishedAt?.toISOString() || null},
            'pending',
            ${importance}
          )
          ON CONFLICT DO NOTHING
        `.catch(() => {})
      }

      await sql`DELETE FROM news_articles WHERE fetched_at < NOW() - INTERVAL '7 days'`

      return NextResponse.json({
        ok: true,
        mode: "ingest",
        articlesProcessed: articles.length,
        sources: RSS_FEEDS.length,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error("Error saving to database:", error)
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "ingest",
    articlesProcessed: articles.length,
    sources: RSS_FEEDS.length,
    articles: articles.slice(0, 20),
    timestamp: new Date().toISOString(),
  })
}

// GET = enrich (mode=enrich)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("mode")

  if (mode === "enrich") {
    if (!isAuthorizedCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limit = Number(searchParams.get("limit") || "10")
    const safeLimit = Math.min(Math.max(limit, 1), 30)

    const result = await enrichPendingArticles(safeLimit)
    return NextResponse.json({
      mode: "enrich",
      ...result,
      timestamp: new Date().toISOString(),
    })
  }

  // (opcional) status rápido
  return NextResponse.json({
    ok: true,
    mode: "status",
    message: "Use POST /api/news/ingest to ingest and GET /api/news/ingest?mode=enrich to enrich pending articles.",
    timestamp: new Date().toISOString(),
  })
}
