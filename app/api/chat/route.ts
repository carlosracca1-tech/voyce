import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// -----------------------------
// Types
// -----------------------------
type VoicePreset = "radio_pro" | "radio_canchero" | "podcast_story"
type TalkMode = "news" | "podcast" // news = conversacional

// -----------------------------
// Helpers: Auth (best-effort)
// -----------------------------
function tryGetUserIdFromBearer(authHeader: string | null): number | null {
  if (!authHeader?.startsWith("Bearer ")) return null
  const token = authHeader.slice("Bearer ".length).trim()

  // Try JWT payload decode (base64url) -> { id: number }
  try {
    const parts = token.split(".")
    if (parts.length >= 2) {
      const payloadB64 = parts[1]
      const json = Buffer.from(payloadB64, "base64url").toString("utf8")
      const payload = JSON.parse(json)
      const id = Number(payload?.id)
      return Number.isFinite(id) ? id : null
    }
  } catch {
    // ignore
  }

  // Try plain base64 JSON (legacy)
  try {
    const json = Buffer.from(token, "base64").toString("utf8")
    const payload = JSON.parse(json)
    const id = Number(payload?.id)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

// -----------------------------
// Sources + parsing
// -----------------------------
const SOURCE_ALIASES: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: "La Nación", patterns: [/la\s*naci[oó]n/i, /\bnacion\b/i] },
  { canonical: "Clarín", patterns: [/\bclar[ií]n\b/i, /\bclarin\b/i] },
  { canonical: "Ámbito", patterns: [/\b[aá]mbito\b/i, /\bambito\b/i] },
  { canonical: "El Cronista", patterns: [/\bcronista\b/i, /\bel\s*cronista\b/i] },
  { canonical: "Infobae", patterns: [/\binfobae\b/i] },
  { canonical: "Página 12", patterns: [/p[aá]gina\s*12/i, /\bp[áa]gina\s*12\b/i, /\bp12\b/i] },
]

function wantsTopMixed(text: string) {
  return /(principales|top|m[aá]s importantes|titulares|resumen|lo mejor)/i.test(text)
}

function wantsChangeSource(text: string) {
  return /(ninguno|no me gusta|otro diario|cambi(á|a) de diario|cambiar diario|probemos otro)/i.test(text)
}

function parseSourcesFromText(text: string): string[] | null {
  const found = new Set<string>()
  for (const s of SOURCE_ALIASES) {
    if (s.patterns.some((p) => p.test(text))) found.add(s.canonical)
  }
  return found.size ? Array.from(found) : null
}

function parseHeadlineChoice(text: string): number | null {
  // “la 2”, “2”, “titular 3”, “opcion 1”
  const m = text.trim().match(/(?:la|el|titular|opci[oó]n)?\s*(\d{1,2})\b/i)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n < 1 || n > 20) return null
  return n
}

// -----------------------------
// NEW: Mode + Voice preset commands
// -----------------------------
function parseModeCommand(text: string): TalkMode | null {
  if (/\bmodo\s*podcast\b/i.test(text)) return "podcast"
  if (/\bmodo\s*(conversaci[oó]n|conversacional)\b/i.test(text)) return "news"
  return null
}

function parseVoicePresetCommand(text: string): VoicePreset | null {
  // “voz pro / estilo pro / modo serio”
  if (/\b(voz|estilo)\s*(pro|serio|premium)\b/i.test(text) || /\bmodo\s*(serio|premium)\b/i.test(text)) return "radio_pro"
  if (/\b(voz|estilo)\s*(canchero|amigable)\b/i.test(text) || /\bmodo\s*canchero\b/i.test(text)) return "radio_canchero"
  if (/\b(voz|estilo)\s*(story|narrativo|historia)\b/i.test(text) || /\bmodo\s*(narrativo|story)\b/i.test(text)) return "podcast_story"
  return null
}

function isJustSettingsCommand(text: string) {
  // si el usuario solo está ajustando modo/voz, evitamos hacer headlines inmediatamente (opcional)
  return /^\s*(modo\s+\w+|voz\s+\w+|estilo\s+\w+)\s*$/i.test(text.trim())
}

// -----------------------------
// DB helpers: conversation_state
// -----------------------------
async function getConversationState(sql: any, conversationId: number) {
  const rows = await sql`select state from conversation_state where conversation_id = ${conversationId} limit 1`
  return (rows?.[0]?.state ?? {}) as any
}

async function setConversationStateMerge(sql: any, conversationId: number, patch: any) {
  const nextState = JSON.stringify(patch)
  await sql`
    insert into conversation_state (conversation_id, state)
    values (${conversationId}, ${nextState}::jsonb)
    on conflict (conversation_id) do update
      set state = (conversation_state.state || ${nextState}::jsonb),
          updated_at = now()
  `
}

// -----------------------------
// News queries
// -----------------------------
async function getHeadlines(sql: any, sources: string[] | null, limit = 7) {
  // últimas 48h para cubrir cortes / diferencias de publicación
  const rows = sources?.length
    ? await sql`
        select id, source, title, summary, category, importance_score, fetched_at
        from news_articles
        where fetched_at >= current_date - interval '1 day'
          and source = any(${sources}::text[])
        order by coalesce(importance_score, 0) desc, fetched_at desc
        limit ${limit}
      `
    : await sql`
        select id, source, title, summary, category, importance_score, fetched_at
        from news_articles
        where fetched_at >= current_date - interval '1 day'
        order by coalesce(importance_score, 0) desc, fetched_at desc
        limit ${limit}
      `
  return rows as Array<{
    id: number
    source: string
    title: string
    summary: string | null
    category: string | null
    importance_score: number | null
    fetched_at: string
  }>
}

async function getArticleForPodcast(sql: any, id: number) {
  const rows = await sql`
    select id, source, title, summary, content_full, content_status, link
    from news_articles
    where id = ${id}
    limit 1
  `
  return rows?.[0] as any
}

// -----------------------------
// Voice Prompting
// -----------------------------
const BASE_RULES = `
Sos VOYCE, locutor argentino premium: claro, confiable y fácil de escuchar en auto.
Reglas:
- SIEMPRE decís el diario/fuente al citar un titular o dato.
- No inventes: si falta info, decí "no tengo el dato exacto" o "no lo veo en la nota".
- Nada de emojis.
- Frases cortas. Natural, humano.
- Prioridad temática por impacto: economía > energía/mercados > política (impacto económico) > resto.
`.trim()

const STYLE_RADIO_PRO = `
Estilo: profesional, sobrio, eficiente. Cero relleno.
Conectores permitidos: "Clave", "El punto es", "Qué mirar", "Vamos con esto".
`.trim()

const STYLE_RADIO_CANCHERO = `
Estilo: cercano y argentino, pero prolijo. Una pizca de humor si suma.
Conectores permitidos: "Che, mirá", "Dato", "Ojo con esto", "Para llevar".
`.trim()

const STYLE_PODCAST_STORY = `
Estilo: narrativo, con hilo conductor, sin listas largas.
Conectores permitidos: "Arranquemos por el principio", "Contexto", "Qué significa", "Cierre".
`.trim()

function buildSystem(mode: TalkMode, voicePreset: VoicePreset) {
  const style =
    voicePreset === "radio_canchero"
      ? STYLE_RADIO_CANCHERO
      : voicePreset === "podcast_story"
        ? STYLE_PODCAST_STORY
        : STYLE_RADIO_PRO

  if (mode === "podcast") {
    return `
${BASE_RULES}
${style}

MODO PODCAST:
- Contá la nota con hilo conductor, casi de punta a punta.
- Estructura obligatoria: (1) Qué pasó, (2) Contexto, (3) Por qué importa, (4) Qué mirar después.
- Evitá enumerar listas largas. Narrativo, claro.
- Cerrá con UNA pregunta: "¿Seguimos con otro titular o cambiamos de diario/tema?"
`.trim()
  }

  return `
${BASE_RULES}
${style}

MODO CONVERSACIONAL:
- Resumí primero en 2-3 frases.
- Luego agregá 2 datos de contexto como máximo.
- Cerrá SIEMPRE con una pregunta concreta para seguir.
- Si el usuario pide “modo podcast”, pasá a MODO PODCAST.
`.trim()
}

// -----------------------------
// UX text
// -----------------------------
function askSourceQuestion() {
  return `¿De qué diarios querés escuchar los principales titulares de hoy?
Podés elegir uno o varios: La Nación, Clarín, Ámbito, El Cronista, Infobae, Página 12.
Si preferís, decime “principales” y te leo un top 5 mezclado diciendo de qué diario es cada uno.
¿Qué elegís?`
}

function formatHeadlinesIntro(sources: string[] | null) {
  if (!sources?.length) return `Dale. Te leo los 5 titulares más importantes de hoy (mezclando fuentes) y te digo de qué diario es cada uno:`
  if (sources.length === 1) return `Perfecto. Te leo los principales titulares de **${sources[0]}** de hoy, ordenados por importancia:`
  return `Perfecto. Te leo los principales titulares de hoy de: **${sources.join(", ")}**, ordenados por importancia:`
}

function formatHeadlinesList(headlines: any[], max = 5) {
  const slice = headlines.slice(0, max)
  return slice.map((h, i) => `${i + 1}. ${h.title} — ${h.source}`).join("\n")
}

function describeMode(mode: TalkMode) {
  return mode === "podcast" ? "podcast" : "conversación"
}

function describeVoice(preset: VoicePreset) {
  if (preset === "radio_canchero") return "canchera"
  if (preset === "podcast_story") return "narrativa"
  return "pro"
}

// -----------------------------
// Route
// -----------------------------
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const message = String(body?.message ?? "").trim()
    const conversationId = (body?.conversationId ?? null) as number | null

    // mode viene del front, pero nosotros lo controlamos también por estado y por comando
    const requestedMode = (body?.mode ?? null) as TalkMode | null

    if (!message) return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 })

    // --- DB ---
    let sql: any = null
    if (process.env.DATABASE_URL) {
      const { neon } = await import("@neondatabase/serverless")
      sql = neon(process.env.DATABASE_URL)
    }

    // Sin DB: devolvemos solo la pregunta base
    if (!sql) {
      return NextResponse.json({
        response: askSourceQuestion(),
        conversationId: conversationId ?? null,
      })
    }

    // --- Conversación (si hay userId) ---
    const userId = tryGetUserIdFromBearer(request.headers.get("authorization"))
    let savedConversationId = conversationId

    if (userId && !savedConversationId) {
  const convResult = await sql`
    insert into conversations (user_id, mode, title)
    values (${userId}, ${requestedMode || "news"}, ${message.substring(0, 100)})
    returning id
  `
  savedConversationId = convResult[0].id

  // ✅ defaults por usuario (si existen)
  const s = await sql`
    select talk_mode, voice_preset
    from user_settings
    where user_id = ${userId}
    limit 1
  `

  const talkMode = (s?.[0]?.talk_mode === "podcast" ? "podcast" : "news")
  const voicePreset =
    s?.[0]?.voice_preset === "radio_canchero" ? "radio_canchero" :
    s?.[0]?.voice_preset === "podcast_story" ? "podcast_story" :
    "radio_pro"

  // Guardar en estado de conversación
  await setConversationStateMerge(sql, savedConversationId, { mode: talkMode, voicePreset })
}

    // --- Estado ---
    const state = savedConversationId ? await getConversationState(sql, savedConversationId) : {}
    const stateMode = (state?.mode as TalkMode | undefined) ?? "news"
    const stateVoice = (state?.voicePreset as VoicePreset | undefined) ?? "radio_pro"

    // 1) Aplicar comandos de modo/voz desde texto
    const cmdMode = parseModeCommand(message)
    const cmdVoice = parseVoicePresetCommand(message)

    // 2) Resolver modo final: comando > requestedMode > state
    const finalMode: TalkMode = (cmdMode ?? requestedMode ?? stateMode) as TalkMode
    const finalVoice: VoicePreset = (cmdVoice ?? stateVoice) as VoicePreset

    // Persistir cambios si podemos
    if (savedConversationId && (cmdMode || requestedMode || cmdVoice)) {
      await setConversationStateMerge(sql, savedConversationId, {
        ...(cmdMode || requestedMode ? { mode: finalMode } : {}),
        ...(cmdVoice ? { voicePreset: finalVoice } : {}),
      })
    }

    // ✅ Si hay userId y cambió por comando, guardarlo por usuario
    if (userId && (cmdMode || cmdVoice)) {
      await sql`
        insert into user_settings (user_id, talk_mode, voice_preset)
        values (${userId}, ${finalMode}, ${finalVoice})
        on conflict (user_id) do update
          set talk_mode = excluded.talk_mode,
              voice_preset = excluded.voice_preset,
              updated_at = now()
      `
    }


    // Si el usuario solo pidió ajustes (ej “voz canchero”), respondemos confirmación y seguimos con pregunta de diarios
    if (isJustSettingsCommand(message)) {
      const response =
        `Listo. Te dejo en modo **${describeMode(finalMode)}** y voz **${describeVoice(finalVoice)}**.\n\n` +
        askSourceQuestion()

      if (savedConversationId && userId) {
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${response})`
        await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
      }

      return NextResponse.json({ response, conversationId: savedConversationId })
    }

    // -----------------------------
    // Flow (diarios -> titulares -> elección -> relato)
    // -----------------------------

    // A) Cambiar diario si no le gusta
    if (wantsChangeSource(message)) {
      if (savedConversationId) {
        await setConversationStateMerge(sql, savedConversationId, {
          sources: null,
          lastHeadlines: null,
        })
      }

      const response = askSourceQuestion()

      if (savedConversationId && userId) {
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${response})`
        await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
      }

      return NextResponse.json({ response, conversationId: savedConversationId })
    }

    // B) ¿Eligió diarios o pidió “principales”?
    const explicitSources = parseSourcesFromText(message)
    const topMixed = wantsTopMixed(message) && !explicitSources?.length

    // Si no eligió diarios y no pidió “principales” y no hay sources en estado → preguntar
    if (!explicitSources?.length && !topMixed && !state?.sources) {
      const response = askSourceQuestion()

      if (savedConversationId && userId) {
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${response})`
        await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
      }

      return NextResponse.json({ response, conversationId: savedConversationId })
    }

    // Fuentes = explícitas o las del estado (o null para mixed)
    const sources: string[] | null =
      explicitSources?.length ? explicitSources : (state?.sources?.length ? state.sources : null)

    // C) Si eligió “la 2 / la 3 …” => profundizar con IA
    const choice = parseHeadlineChoice(message)
    if (choice && state?.lastHeadlines?.length) {
      const picked = state.lastHeadlines[choice - 1]
      if (!picked?.id) {
        const response = `No llegué a agarrar ese titular. ¿Me decís el número exacto del 1 al ${state.lastHeadlines.length}?`
        return NextResponse.json({ response, conversationId: savedConversationId })
      }

      const article = await getArticleForPodcast(sql, picked.id)

      const content =
        article?.content_status === "ok" && article?.content_full
          ? String(article.content_full)
          : String(article?.summary || picked.summary || "")

      const system = buildSystem(finalMode, finalVoice)

      let response = ""
      if (process.env.OPENAI_API_KEY) {
        const { generateText } = await import("ai")
        const { openai } = await import("@ai-sdk/openai")

        const result = await generateText({
          model: openai("gpt-4o-mini"),
          system,
          prompt: `Nota elegida: "${article?.title || picked.title}" (${article?.source || picked.source}).
Contenido disponible:
${content}
`,
          maxTokens: finalMode === "podcast" ? 650 : 260,
        })

        response = result.text
      } else {
        response =
          `Titular: ${picked.title} — ${picked.source}\n\n` +
          `Resumen: ${picked.summary || "Sin resumen."}\n\n` +
          (finalMode === "podcast"
            ? "¿Seguimos con otro titular o cambiamos de diario/tema?"
            : "¿Querés más detalle o pasamos al siguiente?")
      }

      if (savedConversationId && userId) {
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${response})`
        await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
      }

      return NextResponse.json({ response, conversationId: savedConversationId })
    }

    // D) Listar titulares por importancia
    const headlines = await getHeadlines(sql, topMixed ? null : sources, 7)

    // Guardar estado para que “la 2” funcione en el siguiente mensaje
    if (savedConversationId) {
      await setConversationStateMerge(sql, savedConversationId, {
        sources: topMixed ? null : sources,
        lastHeadlines: headlines.map((h) => ({
          id: h.id,
          title: h.title,
          source: h.source,
          summary: h.summary,
        })),
      })
    }

    const intro = formatHeadlinesIntro(topMixed ? null : sources)
    const list = formatHeadlinesList(headlines, 5)

    const response =
      `${intro}\n\n${list}\n\n` +
      `¿Cuál querés que te cuente? ` +
      `Si no te gusta ninguno, decime “otro diario” y cambiamos. ` +
      `\n\n(Actual: modo ${describeMode(finalMode)} · voz ${describeVoice(finalVoice)})`

    if (savedConversationId && userId) {
      await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
      await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${response})`
      await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
    }

    return NextResponse.json({ response, conversationId: savedConversationId })
  } catch (error) {
    console.error("Chat error:", error)
    return NextResponse.json({ error: "Error procesando tu mensaje" }, { status: 500 })
  }
}
