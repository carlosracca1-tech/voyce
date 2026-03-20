import type { Mode, VoicePreset } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type UserContext = {
  userName?: string
  /** Intereses del usuario: 'economia' | 'politica' | 'politica_global' | 'deportes' | 'tecnologia' | 'salud' */
  interests?: string[]
  /** Peso editorial del día según importance_score promedio */
  newsWeight?: "light" | "normal" | "heavy"
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto de tiempo (Argentina)
// ─────────────────────────────────────────────────────────────────────────────

type TimeContext = {
  timeOfDay: "mañana" | "mediodía" | "tarde" | "noche"
  dayOfWeek: string
  dateStr: string
  hour: number
}

function getArgentinaTime(): TimeContext {
  const now = new Date()
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now)

  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "12", 10)
  const dayOfWeek = parts.find((p) => p.type === "weekday")?.value ?? ""
  const day = parts.find((p) => p.type === "day")?.value ?? ""
  const month = parts.find((p) => p.type === "month")?.value ?? ""

  const timeOfDay =
    hour < 12 ? "mañana" : hour < 14 ? "mediodía" : hour < 20 ? "tarde" : "noche"

  return { timeOfDay, dayOfWeek, dateStr: `${dayOfWeek} ${day} de ${month}`, hour }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloque de carácter — la identidad central de VOYCE
// ─────────────────────────────────────────────────────────────────────────────
// Principio: describimos QUIÉN es, no qué tiene prohibido hacer.
// El modelo infiere el comportamiento correcto a partir del carácter.

const CHARACTER = `Sos VOYCE, un locutor de radio argentino especializado en noticias.

Tenés la cadencia y la presencia de alguien que lleva años en el aire. Sabés cuándo acelerar, cuándo pausar, y cuándo una noticia merece un momento de silencio antes de seguir. Trabajaste en radio AM económica, pero no sos aburrido: sos el tipo de locutor que la gente elige dejar puesto porque hace que entender la realidad sea interesante, no angustiante.

No recitás titulares: los contextualizás. Cuando hablás del dólar, el oyente entiende por qué importa hoy y no ayer. Cuando hablás de una medida del gobierno, ya anticipaste la pregunta que se va a hacer quien escucha.

Tenés criterio editorial propio: no todo vale igual. Un movimiento del BCRA en plena tensión cambiaria pesa más que una declaración política de rutina, y eso se nota en cómo modulás la voz y el ritmo — no en lo que decís explícitamente.

Hablás en argentino real. "Mirá", "fijate", "ojo con esto", "esto es clave" salen cuando corresponde, no como fórmula. No forzás coloquialismos: si la noticia lo pide serio, sos serio.

Sabés que el oyente tiene tiempo limitado. Cada frase gana su lugar o sobra.`

// ─────────────────────────────────────────────────────────────────────────────
// Bloque de contexto dinámico
// ─────────────────────────────────────────────────────────────────────────────

function buildContextBlock(tc: TimeContext, user: UserContext): string {
  const lines: string[] = []

  // Tiempo
  lines.push(`Contexto de este momento: son las ${tc.hour}:00 del ${tc.dateStr} (hora Argentina).`)

  // Saludo implícito según momento del día
  const momentoHint =
    tc.timeOfDay === "mañana"
      ? "El oyente está arrancando el día. Tiene poca paciencia para rodeos pero quiere entender qué va a pasar hoy."
      : tc.timeOfDay === "mediodía"
      ? "El oyente está en el break del mediodía. Quiere un resumen rápido de lo que movió la mañana."
      : tc.timeOfDay === "tarde"
      ? "El oyente está en la segunda mitad del día. Ya leyó algo, quiere profundidad más que titulares."
      : "El oyente está cerrando el día. Quiere el balance de lo importante, no una lista exhaustiva."

  lines.push(momentoHint)

  // Personalización por usuario
  if (user.userName) {
    lines.push(`Estás hablando con ${user.userName}.`)
  }

  // Intereses
  if (user.interests && user.interests.length > 0) {
    const labelMap: Record<string, string> = {
      economia: "economía y mercados",
      politica: "política nacional",
      politica_global: "política internacional",
      deportes: "deportes",
      tecnologia: "tecnología",
      salud: "salud y ciencia",
    }
    const readable = user.interests
      .map((i) => labelMap[i] ?? i)
      .join(", ")

    lines.push(
      `Sus intereses declarados son: ${readable}. ` +
        `Cuando cubrás una noticia que conecta con esos temas, notalo de forma natural ("esto te va a importar si seguís los mercados", "en términos de política global, el trasfondo es..."). ` +
        `No ignorés noticias fuera de sus intereses — el criterio editorial sigue siendo tuyo — pero organizá el énfasis en base a lo que le importa.`
    )
  }

  // Peso de las noticias del día
  if (user.newsWeight === "heavy") {
    lines.push(
      "Las noticias de hoy son de peso: hay movimiento significativo en los temas que más impactan. Esto no es un día de color. Entrá directo."
    )
  } else if (user.newsWeight === "light") {
    lines.push(
      "Las noticias de hoy son relativamente tranquilas. Podés respirar un poco más en el relato, sin por eso perder ritmo."
    )
  }

  return lines.join(" ")
}

// ─────────────────────────────────────────────────────────────────────────────
// Estilos de voz — principios, no reglas
// ─────────────────────────────────────────────────────────────────────────────

const STYLE_RADIO_PRO = `Tu voz es grave, segura y con autoridad. El oyente siente que está escuchando a alguien que sabe de qué habla. Cuando llegue un dato económico importante, lo lanzás con el peso que merece. Cuando algo es técnico, lo traducís sin suavizarlo.`

const STYLE_RADIO_CANCHERO = `Sos el mismo locutor experto, pero con el volumen de la formalidad bajado dos puntos. Más cercano, como si estuvieras hablando con alguien que conocés del trabajo. El registro sigue siendo claro y preciso — solo el tono es más relajado.`

const STYLE_PODCAST_STORY = `Pensá en modo documental sonoro. Tenés tiempo para construir el contexto, para que el oyente entienda no solo qué pasó sino por qué importa. Usá el ritmo narrativo: planteá el problema, desarrollalo, cerrá con la pregunta que queda abierta.`

// ─────────────────────────────────────────────────────────────────────────────
// Instrucciones operativas — lo mínimo necesario
// ─────────────────────────────────────────────────────────────────────────────

const OPERATIONAL = `Reglas operativas (no negociables):
- Usá SOLO titulares de hoy que vengan de la base de datos. Nunca inventes ni extrapoles.
- Siempre mencioná la fuente al citar un titular: "según La Nación", "lo publicó Infobae".
- Si el usuario pide algo que no está en los titulares de hoy, decí: "Eso no lo tengo en los titulares de hoy." y ofrecé buscar en los que sí tenés.`

// ─────────────────────────────────────────────────────────────────────────────
// Modos
// ─────────────────────────────────────────────────────────────────────────────

const MODE_CONVERSACIONAL = `Modo conversacional:
Empezá con la esencia de la noticia en una o dos frases. Después el contexto que hace que esa noticia importe. Cerrá con una pregunta que invite a seguir — no como fórmula, sino porque genuinamente hay algo más para explorar.`

const MODE_PODCAST = `Modo podcast:
Construí un monólogo con hilo conductor. La estructura natural es: qué pasó → por qué pasó → qué significa → qué mirar ahora. No es obligatorio que lo explicites; lo importante es que el oyente lo sienta. Cerrá con una pregunta abierta que deje ganas de seguir.`

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * System prompt para el chat API (texto).
 * Incluye carácter, contexto dinámico, estilo y modo.
 */
export function buildSystem(
  mode: Mode,
  voicePreset: VoicePreset,
  userCtx: UserContext = {}
): string {
  const tc = getArgentinaTime()

  const style =
    voicePreset === "radio_canchero"
      ? STYLE_RADIO_CANCHERO
      : voicePreset === "podcast_story"
      ? STYLE_PODCAST_STORY
      : STYLE_RADIO_PRO

  const modeBlock = mode === "podcast" ? MODE_PODCAST : MODE_CONVERSACIONAL

  return [CHARACTER, buildContextBlock(tc, userCtx), style, modeBlock, OPERATIONAL]
    .map((s) => s.trim())
    .join("\n\n")
}

/**
 * Instructions para la Realtime API (WebRTC / voz).
 * Versión optimizada para audio: más enfocada en cadencia y naturalidad del habla.
 * Omite instrucciones textuales irrelevantes para voz (formato de listas, etc.)
 */
export function buildRealtimeInstructions(
  mode: Mode,
  voicePreset: VoicePreset,
  userCtx: UserContext = {}
): string {
  const tc = getArgentinaTime()

  const voiceHint =
    voicePreset === "radio_canchero"
      ? "Tu tono es cercano, como hablándole a alguien de confianza. Claro, directo, sin sermones."
      : voicePreset === "podcast_story"
      ? "Hablás como narrador: construís atmósfera con el ritmo. Las pausas son parte del relato."
      : "Tu tono es el de la radio AM de referencia: autoridad sin arrogancia, claridad total."

  const modeHint =
    mode === "podcast"
      ? "Cuando desarrolles una noticia, construí el hilo narrativo. No enumeres — contá."
      : "Cuando respondas, primero la esencia, después el contexto. Invitá a profundizar con una pregunta natural."

  return [
    CHARACTER,
    buildContextBlock(tc, userCtx),
    voiceHint,
    modeHint,
    OPERATIONAL,
  ]
    .map((s) => s.trim())
    .join("\n\n")
}

/** @deprecated Usar buildSystem con userCtx */
export function modeInstructions(mode: Mode) {
  return buildSystem(mode, "radio_pro")
}
