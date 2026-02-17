import { NextResponse } from "next/server"
import { guessSourceFromTranscript, wantsTopWithoutSource } from '@/lib/voyce/intents'
import { presetToVoice } from '@/lib/voyce/voice'

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
const todayAR = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date())

const BASE_RULES = `
Sos VOYCE, locutor argentino. Fecha (Argentina): ${todayAR}.
Vas directo al grano: sin saludos, sin cháchara, sin opiniones personales.
Usá SOLO titulares de HOY que vienen de la DB. NO inventes.
SIEMPRE nombrá la fuente al citar un titular (ej: "1. Titular — La Nación").
Frases cortas y enfocadas en datos relevantes. Nada de emojis.
No preguntes ni converses: evitá comentarios tipo "bien, ¿y vos?" o respuestas coloquiales.
Prioridad temática por impacto: economía > energía/mercados > política (impacto económico) > resto.
Si el usuario pide información que NO está en la DB: decí exactamente "No lo tengo en los titulares de hoy. Voy a buscar en internet y vuelvo con información 100% actualizada (2026)." y finalizá la respuesta breve. Luego el sistema podrá realizar la búsqueda externa si está habilitada.
`.trim()

const STYLE_RADIO_PRO = `
Estilo: formal, masculino y atrapante. Voz grave y segura; ritmo que mantiene la atención.
Sé directo y extremadamente claro: frases cortas, precisión en datos y enfoque en lo relevante.
Conectores permitidos: "Clave", "El punto es", "Qué mirar", "Vamos con esto".
`.trim()

const STYLE_RADIO_CANCHERO = `
Estilo: cercano pero controlado; masculino y con presencia. Menos humor, más concreción.
Conectores permitidos: "Che, mirá", "Dato", "Ojo con esto", "Para llevar".
`.trim()

const STYLE_PODCAST_STORY = `
Estilo: narrativo y envolvente, narrador masculino y formal; estructurado para atrapar al oyente.
Evitá listas largas; priorizá un hilo claro y datos comprobables.
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
  return `¿Qué diarios querés escuchar hoy? Elegí uno o varios: La Nación, Clarín, Ámbito, El Cronista, Infobae, Página 12. O decí "principales" para un TOP 5 mezclado.`
}

function formatHeadlinesIntro(sources: string[] | null) {
  if (!sources?.length) return `A continuación, los 5 titulares más importantes de hoy (mezcla de fuentes):`
  if (sources.length === 1) return `A continuación, los principales titulares de **${sources[0]}** hoy, ordenados por importancia:`
  return `A continuación, los principales titulares de hoy de: **${sources.join(", ")}**, ordenados por importancia:`
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

    // --- Helpers: sanitize + send JSON response ---
    function sanitizeAssistantText(s: string, allowGreeting = false) {
      if (!s) return s
      if (allowGreeting) return s
      // Remove leading greetings like "hola", "hola hola", "buenos días" etc.
      const cleaned = s.replace(/^(\s*(hola|buenos\s*d[ií]as|buenas\s*tardes|buenas\s*noches)\b[\s,!.\-–—]*)+/i, "").trim()
      return cleaned || s
    }

    function sendJsonResponse(text: string, convId: number | null, opts?: { voicePreset?: VoicePreset; mode?: TalkMode }) {
      // allow greeting for first-response (no conversation id)
      const allowGreeting = convId == null
      const out = sanitizeAssistantText(text, allowGreeting)
      return NextResponse.json({
        response: out,
        conversationId: convId ?? null,
        voicePreset: opts?.voicePreset ?? "radio_pro",
        mode: opts?.mode ?? "news",
        ttsVoice: presetToVoice(opts?.voicePreset ?? "radio_pro"),
        useServerTTS: Boolean(process.env.OPENAI_API_KEY),
      })
    }

    // --- DB ---
    let sql: any = null
    if (process.env.DATABASE_URL) {
      const { neon } = await import("@neondatabase/serverless")
      sql = neon(process.env.DATABASE_URL)
    }

    // Sin DB: devolvemos solo la pregunta base
    if (!sql) {
      const greeting = `Hola. Soy VOYCE, locutor de noticias. ${askSourceQuestion()}`
      return sendJsonResponse(greeting, conversationId ?? null)
    }

    // --- Conversación (si hay userId) ---
    const userId = tryGetUserIdFromBearer(request.headers.get("authorization"))
    let savedConversationId = conversationId

    // --- Instrumentación: logueo de interacción de usuario (no bloqueante)
    try {
      const detectedSources = parseSourcesFromText(message) || []
      const guessedSource = detectedSources[0] ?? (typeof guessSourceFromTranscript === 'function' ? guessSourceFromTranscript(message) : null) ?? null
      const detectedTopic = typeof wantsTopWithoutSource === 'function' && wantsTopWithoutSource(message) ? 'headlines' : null

      if (sql && userId) {
        ;(async () => {
          try {
            await sql`
              INSERT INTO user_interactions (user_id, type, source, topic, message)
              VALUES (${userId}, 'user_message', ${guessedSource}, ${detectedTopic}, ${message})
            `

            await sql`
              INSERT INTO user_preferences (user_id, last_interaction_at)
              VALUES (${userId}, now())
              ON CONFLICT (user_id) DO UPDATE SET last_interaction_at = now()
            `
          } catch (e) {
            console.error('Failed to log user interaction:', e)
          }
        })()
      }
    } catch (e) {
      console.error('Interaction instrumentation error:', e)
    }

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
        const sanitized = sanitizeAssistantText(response, savedConversationId == null)
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${sanitized})`
        await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
      }

      return sendJsonResponse(response, savedConversationId, { voicePreset: finalVoice, mode: finalMode })
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

      const response = savedConversationId == null ? `Hola. Soy VOYCE, locutor de noticias. ${askSourceQuestion()}` : askSourceQuestion()

      if (savedConversationId && userId) {
        const sanitized = sanitizeAssistantText(response, savedConversationId == null)
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${sanitized})`
        await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
      }

      return sendJsonResponse(response, savedConversationId, { voicePreset: finalVoice, mode: finalMode })
    }

    // B) ¿Eligió diarios o pidió “principales”?
    const explicitSources = parseSourcesFromText(message)
    const topMixed = wantsTopMixed(message) && !explicitSources?.length

    // Si no eligió diarios y no pidió “principales” y no hay sources en estado → preguntar
    if (!explicitSources?.length && !topMixed && !state?.sources) {
      const response = savedConversationId == null ? `Hola. Soy VOYCE, locutor de noticias. ${askSourceQuestion()}` : askSourceQuestion()

      if (savedConversationId && userId) {
        const sanitized = sanitizeAssistantText(response, savedConversationId == null)
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${sanitized})`
        await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
      }

      return sendJsonResponse(response, savedConversationId, { voicePreset: finalVoice, mode: finalMode })
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
        return sendJsonResponse(response, savedConversationId, { voicePreset: finalVoice, mode: finalMode })
      }

      const article = await getArticleForPodcast(sql, picked.id)

      const content =
        article?.content_status === "ok" && article?.content_full
          ? String(article.content_full)
          : String(article?.summary || picked.summary || "")

      const system = buildSystem(finalMode, finalVoice)
      if (process.env.NODE_ENV === 'development') console.debug('Chat: system prompt (article):', system.slice(0, 600))

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
        const sanitized = sanitizeAssistantText(response, savedConversationId == null)
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${sanitized})`
        await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
      }

      return sendJsonResponse(response, savedConversationId, { voicePreset: finalVoice, mode: finalMode })
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

    // Si estamos en MODO PODCAST y hay una fuente seleccionada (o topMixed), generamos
    // un monólogo tipo podcast que cubra los titulares en vez de la lista breve.
    const userAskedSpecificSource = Boolean(explicitSources?.length || (state?.sources && state.sources.length))
    if (finalMode === "podcast" && (userAskedSpecificSource || topMixed)) {
      const system = buildSystem(finalMode, finalVoice)
        if (process.env.NODE_ENV === 'development') console.debug('Chat: system prompt (podcast):', system.slice(0, 600))

      let response = ""
      if (process.env.OPENAI_API_KEY) {
        const { generateText } = await import("ai")
        const { openai } = await import("@ai-sdk/openai")

        const combined = headlines
          .slice(0, 7)
          .map((h, i) => `${i + 1}. ${h.title} — ${h.source}\n${String(h.summary || "")}`)
          .join("\n\n")

        const prompt = `Generá un monólogo estilo podcast (voz masculina, formal y atrapante) sobre estos titulares:\n\n${combined}\n\nComenzá nombrando las fuentes y contá las noticias con hilo conductor, priorizando los datos más relevantes. Cerrá con UNA pregunta para seguir.`

        const result = await generateText({
          model: openai("gpt-4o-mini"),
          system,
          prompt,
          maxTokens: 900,
        })

        response = result.text
      } else {
        // Fallback demo monólogo
        response = headlines
          .slice(0, 5)
          .map((h, i) => `${i + 1}. ${h.title} — ${h.source}\n${h.summary || ""}`)
          .join("\n\n")
        response = `Monólogo (demo):\n\n${response}\n\n¿Desea que profundice alguna de estas notas?`
      }

      if (savedConversationId && userId) {
        const sanitized = sanitizeAssistantText(response, savedConversationId == null)
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
        await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${sanitized})`
        await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
      }

      return sendJsonResponse(response, savedConversationId, { voicePreset: finalVoice, mode: finalMode })
    }

    const intro = formatHeadlinesIntro(topMixed ? null : sources)
    const list = formatHeadlinesList(headlines, 5)

    const response =
      `${intro}\n\n${list}\n\n` +
      `¿Cuál desea que amplíe? ` +
      `Si no desea ninguno, diga "otro diario" para cambiar. ` +
      `\n\n(Actual: modo ${describeMode(finalMode)} · voz ${describeVoice(finalVoice)})`

    if (savedConversationId && userId) {
      await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'user', ${message})`
      await sql`insert into messages (conversation_id, role, content) values (${savedConversationId}, 'assistant', ${response})`
      await sql`update conversations set updated_at = now() where id = ${savedConversationId}`
    }

    return sendJsonResponse(response, savedConversationId, { voicePreset: finalVoice, mode: finalMode })
  } catch (error) {
    console.error("Chat error:", error)
    return NextResponse.json({ error: "Error procesando tu mensaje" }, { status: 500 })
  }
}
