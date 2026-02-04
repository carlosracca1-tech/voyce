import { NextResponse } from "next/server"

function getUserIdFromToken(token: string): number | null {
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(token))))
    return payload.id || null
  } catch {
    return null
  }
}

// Obtener noticias del dia para contexto
async function getTodayNews(sql: ReturnType<typeof import("@neondatabase/serverless").neon>): Promise<string> {
  try {
    // Obtener noticias de las ultimas 48 horas para cubrir diferencias de zona horaria
    const articles = await sql`
      SELECT source, title, summary, category
      FROM news_articles
      WHERE fetched_at >= CURRENT_DATE - INTERVAL '1 day'
      ORDER BY fetched_at DESC
      LIMIT 15
    `
    
    if (articles.length === 0) return ""
    
    // Formato simple para que la IA responda rapido
    let context = "NOTICIAS DE HOY:\n"
    for (const article of articles) {
      context += `- ${article.title} (${article.source})\n`
    }
    return context
  } catch {
    return ""
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const token = authHeader?.replace("Bearer ", "")
    const userId = token ? getUserIdFromToken(token) : null

    const body = await request.json()
    const { message, mode, conversationId } = body

    if (!message) {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 })
    }

    let response: string
    let savedConversationId = conversationId
    let newsContext = ""
    let sql: ReturnType<typeof import("@neondatabase/serverless").neon> | null = null

    // Conectar a DB si esta disponible
    if (process.env.DATABASE_URL) {
      const { neon } = await import("@neondatabase/serverless")
      sql = neon(process.env.DATABASE_URL)
      
      // Obtener noticias del dia para todos los modos
      newsContext = await getTodayNews(sql)
      console.log("[v0] News context loaded:", newsContext ? `${newsContext.length} chars` : "empty")
    } else {
      console.log("[v0] No DATABASE_URL available")
    }

    // Usar AI SDK si hay API key
    if (process.env.OPENAI_API_KEY) {
      try {
        const { generateText } = await import("ai")
        const { openai } = await import("@ai-sdk/openai")
        
        // Detectar si es un saludo para dar titulares
        const isGreeting = /^(hola|buenos dias|buenas tardes|buenas noches|hey|que tal|como estas|buen dia|holi)/i.test(message.trim())
        
        const greetingPrompt = isGreeting && newsContext ? `
El usuario te saludo. Respondele con un saludo amigable y INMEDIATAMENTE dale los TITULARES MAS IMPORTANTES del dia, estilo noticiero de radio. Formato:

"Hola! Soy VOYCE, tu asistente de radio. Estos son los titulares mas importantes de hoy:

1. [TITULO NOTICIA 1] - segun [FUENTE]
2. [TITULO NOTICIA 2] - segun [FUENTE]  
3. [TITULO NOTICIA 3] - segun [FUENTE]
4. [TITULO NOTICIA 4] - segun [FUENTE]
5. [TITULO NOTICIA 5] - segun [FUENTE]

Sobre cual queres que te cuente mas?"

Usa SOLO las noticias de abajo, NO inventes. Maximo 5-7 titulares, muy concisos.
` : ""

        const systemPrompts: Record<string, string> = {
          news: `Eres locutor de radio. Responde MUY BREVE (maximo 2-3 oraciones).
${greetingPrompt}
SOLO usa noticias de abajo. NO inventes. Cita la fuente.
${newsContext}`,
          podcast: `Eres locutor de radio argentino. Responde BREVE.
${greetingPrompt}
Da titulares rapidos, cita el diario. Maximo 3-4 titulares.
${newsContext}`,
          assistant: `Eres VOYCE, asistente de radio argentino. Responde BREVE y RAPIDO (maximo 2-3 oraciones).
${greetingPrompt}
${newsContext ? "Noticias del dia:\n" + newsContext : ""}
Se conciso y directo.`
        }

        const result = await generateText({
          model: openai("gpt-4o-mini"),
          system: systemPrompts[mode] || systemPrompts.assistant,
          prompt: message,
          maxTokens: 150, // Limitar respuesta para que sea rapida
        })

        response = result.text
      } catch (aiError) {
        console.error("AI SDK error:", aiError)
        response = generateDemoResponse(message, mode, newsContext)
      }
    } else {
      response = generateDemoResponse(message, mode, newsContext)
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700))
    }

    // Guardar en DB si hay conexion y usuario autenticado
    if (sql && userId) {
      try {
        if (!savedConversationId) {
          const convResult = await sql`
            INSERT INTO conversations (user_id, mode, title)
            VALUES (${userId}, ${mode || 'assistant'}, ${message.substring(0, 100)})
            RETURNING id
          `
          savedConversationId = convResult[0].id
        }

        await sql`INSERT INTO messages (conversation_id, role, content) VALUES (${savedConversationId}, 'user', ${message})`
        await sql`INSERT INTO messages (conversation_id, role, content) VALUES (${savedConversationId}, 'assistant', ${response})`
        await sql`UPDATE conversations SET updated_at = NOW() WHERE id = ${savedConversationId}`
        await sql`
          INSERT INTO usage_stats (user_id, date, queries_count)
          VALUES (${userId}, CURRENT_DATE, 1)
          ON CONFLICT (user_id, date) DO UPDATE SET queries_count = usage_stats.queries_count + 1
        `
      } catch (dbError) {
        console.error("DB error saving message:", dbError)
      }
    }

    return NextResponse.json({ response, conversationId: savedConversationId })

  } catch (error) {
    console.error("Chat error:", error)
    return NextResponse.json({ error: "Error procesando tu mensaje" }, { status: 500 })
  }
}

function generateDemoResponse(message: string, mode: string, newsContext: string): string {
  const lowerMessage = message.toLowerCase().trim()
  
  // Detectar saludo
  const isGreeting = /^(hola|buenos dias|buenas tardes|buenas noches|hey|que tal|como estas|buen dia|holi)/i.test(lowerMessage)
  
  // Si es un saludo y hay noticias, dar los titulares
  if (isGreeting && newsContext) {
    // Parsear las noticias del contexto y formatear como titulares
    const lines = newsContext.split('\n').filter(l => l.includes('[') && l.includes(']'))
    const headlines = lines.slice(0, 5).map((line, i) => {
      const match = line.match(/\[([^\]]+)\]\s*(.+)/)
      if (match) {
        return `${i + 1}. ${match[2].trim()} - segun ${match[1]}`
      }
      return null
    }).filter(Boolean).join('\n')
    
    return `Hola! Soy VOYCE, tu asistente de radio. Estos son los titulares mas importantes de hoy:\n\n${headlines || 'No tengo noticias cargadas todavia.'}\n\nSobre cual queres que te cuente mas?`
  }
  
  // Si es un saludo sin noticias
  if (isGreeting) {
    return `Hola! Soy VOYCE, tu asistente de radio con IA. Todavia no tengo las noticias del dia cargadas, pero puedo ayudarte con:\n\n- Crear guiones para radio\n- Armar estructura de podcasts\n- Ideas para programas\n\nEn que te puedo ayudar?`
  }
  
  // Si hay noticias y pregunta por ellas
  if (newsContext && (lowerMessage.includes("noticia") || lowerMessage.includes("actualidad") || lowerMessage.includes("hoy"))) {
    const lines = newsContext.split('\n').filter(l => l.includes('[') && l.includes(']'))
    const headlines = lines.slice(0, 5).map((line, i) => {
      const match = line.match(/\[([^\]]+)\]\s*(.+)/)
      if (match) {
        return `${i + 1}. ${match[2].trim()} - ${match[1]}`
      }
      return null
    }).filter(Boolean).join('\n')
    
    return `Estas son las noticias mas importantes:\n\n${headlines}\n\nQueres que profundice en alguna?`
  }
  
  // Respuestas demo inteligentes basadas en keywords
  if (lowerMessage.includes("noticia") || lowerMessage.includes("actualidad")) {
    return `Todavia no tengo noticias cargadas. El cron job de las 7am Argentina las actualiza automaticamente desde:\n\n- Clarin\n- La Nacion\n- Infobae\n- Pagina 12\n- Ambito\n- El Cronista\n\nPodes ejecutar manualmente /api/news/ingest para cargarlas ahora.`
  }
  
  if (lowerMessage.includes("guion") || lowerMessage.includes("programa")) {
    return `Te ayudo a crear un guion! Para un programa sobre "${message}", te sugiero:\n\n**APERTURA (30 seg)**\n"Buenos dias oyentes, hoy vamos a hablar de..."\n\n**DESARROLLO (3-5 min)**\n- Punto 1: Contexto\n- Punto 2: Datos clave\n- Punto 3: Opiniones/testimonios\n\n**CIERRE (30 seg)**\n"Y eso fue todo por hoy, los esperamos mañana..."\n\nQueres que lo desarrolle mas?`
  }
  
  if (lowerMessage.includes("podcast") || lowerMessage.includes("episodio")) {
    return `Para tu episodio sobre "${message}":\n\n**Duracion sugerida:** 20-30 minutos\n**Estructura:**\n1. Intro con gancho (2 min)\n2. Presentacion del tema (3 min)\n3. Desarrollo principal (15 min)\n4. Conclusiones y CTA (3 min)\n\nQueres que escriba el guion completo?`
  }

  const defaultResponses = [
    `Como asistente de radio, te puedo ayudar con "${message}". Contame mas sobre que necesitas: un guion, investigacion, o ideas para tu programa?`,
    `Entiendo que queres saber sobre "${message}". En modo completo podria buscar noticias actuales y darte info verificada. Por ahora te ayudo con lo que necesites para tu produccion!`,
    `"${message}" es un tema interesante para radio. Te sugiero abordarlo con datos concretos y testimonios. Queres que te arme una estructura?`
  ]
  
  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)]
}
