import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Lista completa de feeds — misma que en ingest/route.ts
const RSS_FEEDS = [
  { name: "Clarín",      url: "https://www.clarin.com/rss/lo-ultimo/",    section: "general"    },
  { name: "Clarín",      url: "https://www.clarin.com/rss/politica/",     section: "politica"   },
  { name: "Clarín",      url: "https://www.clarin.com/rss/economia/",     section: "economia"   },
  { name: "Clarín",      url: "https://www.clarin.com/rss/deportes/",     section: "deportes"   },
  { name: "Clarín",      url: "https://www.clarin.com/rss/mundo/",        section: "mundo"      },
  { name: "Clarín",      url: "https://www.clarin.com/rss/tecnologia/",   section: "tecnologia" },
  { name: "La Nación",   url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml",                     section: "general"  },
  { name: "La Nación",   url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/politica/?outputType=xml",   section: "politica" },
  { name: "La Nación",   url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/economia/?outputType=xml",   section: "economia" },
  { name: "La Nación",   url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/deportes/?outputType=xml",   section: "deportes" },
  { name: "La Nación",   url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/el-mundo/?outputType=xml",   section: "mundo"    },
  { name: "La Nación",   url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/tecnologia/?outputType=xml", section: "tecnologia" },
  { name: "Infobae",     url: "https://www.infobae.com/feeds/rss/",          section: "general"    },
  { name: "Infobae",     url: "https://www.infobae.com/feeds/rss/politica/", section: "politica"   },
  { name: "Infobae",     url: "https://www.infobae.com/feeds/rss/economia/", section: "economia"   },
  { name: "Infobae",     url: "https://www.infobae.com/feeds/rss/deportes/", section: "deportes"   },
  { name: "Infobae",     url: "https://www.infobae.com/feeds/rss/america/",  section: "mundo"      },
  { name: "Infobae",     url: "https://www.infobae.com/feeds/rss/tecno/",    section: "tecnologia" },
  { name: "Infobae",     url: "https://www.infobae.com/feeds/rss/salud/",    section: "salud"      },
  { name: "Ámbito",      url: "https://www.ambito.com/rss/pages/home.xml",      section: "general"  },
  { name: "Ámbito",      url: "https://www.ambito.com/rss/pages/economia.xml",  section: "economia" },
  { name: "Ámbito",      url: "https://www.ambito.com/rss/pages/finanzas.xml",  section: "economia" },
  { name: "Ámbito",      url: "https://www.ambito.com/rss/pages/politica.xml",  section: "politica" },
  { name: "Ámbito",      url: "https://www.ambito.com/rss/pages/negocios.xml",  section: "economia" },
  { name: "El Cronista", url: "https://www.cronista.com/files/rss/cronista.xml",          section: "general"  },
  { name: "El Cronista", url: "https://www.cronista.com/files/rss/finanzas-mercados.xml", section: "economia" },
  { name: "El Cronista", url: "https://www.cronista.com/files/rss/economiapolitica.xml",  section: "politica" },
  { name: "Página 12",   url: "https://www.pagina12.com.ar/rss/portada",               section: "general"  },
  { name: "Página 12",   url: "https://www.pagina12.com.ar/rss/secciones/el-pais",     section: "politica" },
  { name: "Página 12",   url: "https://www.pagina12.com.ar/rss/secciones/economia",    section: "economia" },
  { name: "Página 12",   url: "https://www.pagina12.com.ar/rss/secciones/el-mundo",    section: "mundo"    },
  { name: "iProfesional", url: "https://www.iprofesional.com/rss/",          section: "general"    },
  { name: "iProfesional", url: "https://www.iprofesional.com/rss/finanzas",  section: "economia"   },
  { name: "iProfesional", url: "https://www.iprofesional.com/rss/tecnologia",section: "tecnologia" },
  { name: "iProfesional", url: "https://www.iprofesional.com/rss/negocios",  section: "economia"   },
  { name: "Perfil",      url: "https://www.perfil.com/rss/",          section: "general"  },
  { name: "Perfil",      url: "https://www.perfil.com/rss/economia",  section: "economia" },
  { name: "Perfil",      url: "https://www.perfil.com/rss/politica",  section: "politica" },
  { name: "TN",          url: "https://tn.com.ar/rss/",               section: "general"  },
  { name: "TN",          url: "https://tn.com.ar/rss/economia",       section: "economia" },
  { name: "TN",          url: "https://tn.com.ar/rss/politica",       section: "politica" },
  { name: "TN",          url: "https://tn.com.ar/rss/deportes",       section: "deportes" },
  { name: "Télam",       url: "https://www.telam.com.ar/rss/",            section: "general"  },
  { name: "Télam",       url: "https://www.telam.com.ar/rss/economia.xml",section: "economia" },
  { name: "Télam",       url: "https://www.telam.com.ar/rss/politica.xml",section: "politica" },
  { name: "El Destape",  url: "https://www.eldestapeweb.com/rss",      section: "general"  },
  { name: "MDZ",         url: "https://www.mdzol.com/rss/",            section: "general"  },
  { name: "MDZ",         url: "https://www.mdzol.com/rss/economia",    section: "economia" },
]

async function probeFeed(feed: { name: string; url: string; section: string }) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  const start = Date.now()

  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "VOYCE-Bot/1.0", Accept: "application/rss+xml, application/xml, text/xml, */*" },
    })
    clearTimeout(t)

    const ms = Date.now() - start

    if (!res.ok) {
      return { ...feed, ok: false, status: res.status, items: 0, ms, error: `HTTP ${res.status}` }
    }

    const xml = await res.text()
    const items = (xml.match(/<item[^>]*>/gi) ?? []).length

    return { ...feed, ok: items > 0, status: res.status, items, ms, error: items === 0 ? "empty feed" : null }
  } catch (e: any) {
    clearTimeout(t)
    const ms = Date.now() - start
    const error = e?.name === "AbortError" ? "timeout" : String(e?.message ?? "error")
    return { ...feed, ok: false, status: 0, items: 0, ms, error }
  }
}

export async function GET(req: Request) {
  // Requiere Bearer CRON_SECRET o header x-vercel-cron para no exponer el endpoint públicamente
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  const isVercelCron = !!req.headers.get("x-vercel-cron")
  const isAuthorized = isVercelCron || !cronSecret || auth === `Bearer ${cronSecret}`

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const results = await Promise.all(RSS_FEEDS.map(probeFeed))

  const ok = results.filter((r) => r.ok)
  const dead = results.filter((r) => !r.ok)

  // Agrupar por nombre de fuente
  const bySource: Record<string, { ok: number; dead: number; totalItems: number }> = {}
  for (const r of results) {
    if (!bySource[r.name]) bySource[r.name] = { ok: 0, dead: 0, totalItems: 0 }
    if (r.ok) {
      bySource[r.name].ok++
      bySource[r.name].totalItems += r.items
    } else {
      bySource[r.name].dead++
    }
  }

  const totalItems = ok.reduce((s, r) => s + r.items, 0)
  const estimatedDailyUnique = Math.round(totalItems * 8 * 0.6) // 8 runs/día, 40% overlap

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    summary: {
      totalFeeds: results.length,
      feedsOk: ok.length,
      feedsDead: dead.length,
      itemsRightNow: totalItems,
      estimatedUniqueDailyArticles: estimatedDailyUnique,
    },
    bySource,
    feedsOk: ok.map((r) => ({ name: r.name, section: r.section, items: r.items, ms: r.ms, url: r.url })),
    feedsDead: dead.map((r) => ({ name: r.name, section: r.section, error: r.error, status: r.status, url: r.url })),
  })
}
