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

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET

  // ✅ Vercel Cron
  const vercelCron = request.headers.get("x-vercel-cron")
  if (vercelCron) return true

  // ✅ Manual (curl / tools)
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

// ---------- CRON LOGGING (tabla cron_runs) ----------
async function cronLogStart(job: string) {
  if (!process.env.DATABASE_URL) return undefined

  const { neon } = await import("@neondatabase/serverless")
  const sql = neon(process.env.DATABASE_URL)

  const rows = await sql`
    insert into cron_runs (job, meta)
    values (${job}, '{}'::jsonb)
    returning id
  `

  return rows[0]?.id as number | undefined
}

async function cronLogFinish(id: number | undefined, ok: boolean, details?: string, meta?: any) {
  if (!id || !process.env.DATABASE_URL) return

  const { neon } = await import("@neondatabase/serverless")
  const sql = neon(process.env.DATABASE_URL)

  await sql`
    update cron_runs
    set finished_at = now(),
        ok = ${ok},
        details = ${details ?? null},
        meta = ${meta ? JSON.stringify(meta) : null}::jsonb
    where id = ${id}
  `
}

// ---------- INGEST core ----------
async function doIngest() {
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

  if (!process.env.DATABASE_URL) {
    return { ok: true, mode: "ingest", articlesProcessed: articles.length, inserted: 0, sources: RSS_FEEDS.length }
  }

  const { neon } = await import("@neondatabase/serverless")
  const sql = neon(process.env.DATABASE_URL)

  let inserted = 0

  for (const article of articles) {
    const importance = calculateImportance(article.title, article.category, article.source)

    const r = await sql`
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
      ON CONFLICT (link) DO NOTHING
      RETURNING id
    `.catch(() => [])

    if (Array.isArray(r) && r.length > 0) inserted++
  }

  await sql`DELETE FROM news_articles WHERE fetched_at < NOW() - INTERVAL '7 days'`

  return {
    ok: true,
    mode: "ingest",
    articlesProcessed: articles.length,
    inserted,
    sources: RSS_FEEDS.length,
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

// ---------------------- POST = ingest manual (Bearer CRON_SECRET) ----------------------
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const runId = await cronLogStart("news_ingest:post")

  try {
    const result = await doIngest()
    await cronLogFinish(runId, true, "ok", result)
    return NextResponse.json({ ...result, timestamp: new Date().toISOString() })
  } catch (e: any) {
    await cronLogFinish(runId, false, e?.message ?? "error")
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 })
  }
}

// ---------------------- GET = cron ingest + enrich on-demand + status ----------------------
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("mode")

  // ✅ Ingest por GET: lo corre Vercel Cron (x-vercel-cron) o manual (Bearer CRON_SECRET)
  // Solo cuando NO hay mode
  if (!mode && isAuthorizedCron(request)) {
    const runId = await cronLogStart("news_ingest:cron")

    try {
      const result = await doIngest()
      await cronLogFinish(runId, true, "ok", result)
      return NextResponse.json({ ...result, timestamp: new Date().toISOString() })
    } catch (e: any) {
      await cronLogFinish(runId, false, e?.message ?? "error")
      return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 })
    }
  }

  // ✅ Enrich on-demand: requiere autorización (x-vercel-cron o Bearer CRON_SECRET)
  // (Si después querés que esto sea por login de usuario, lo ajustamos)
  if (mode === "enrich") {
    if (!isAuthorizedCron(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const limit = Number(searchParams.get("limit") || "10")
    const safeLimit = Math.min(Math.max(limit, 1), 30)

    const runId = await cronLogStart("news_enrich:on_demand")

    try {
      const result = await enrichPendingArticles(safeLimit)
      await cronLogFinish(runId, true, "ok", result)
      return NextResponse.json({
        ok: true,
        mode: "enrich",
        ...result,
        timestamp: new Date().toISOString(),
      })
    } catch (e: any) {
      await cronLogFinish(runId, false, e?.message ?? "error")
      return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 })
    }
  }

  // ✅ Status
  return NextResponse.json({
    ok: true,
    mode: "status",
    message:
      "Vercel Cron triggers ingest via GET + x-vercel-cron header. Manual ingest: POST (Bearer) or GET (Bearer). Enrich: GET ?mode=enrich (Bearer).",
    timestamp: new Date().toISOString(),
  })
}
