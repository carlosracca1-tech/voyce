import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { text } = await request.json()

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    // Limitar texto a 500 chars para respuesta ultra rapida
    const shortText = text.substring(0, 500)

    // Si hay API key de OpenAI, usar TTS
    if (process.env.OPENAI_API_KEY) {
      // Timeout de 5 segundos - si tarda mas, usar browser TTS
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      
      try {
        const response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: shortText,
            voice: "alloy", // Voz mas rapida
            response_format: "mp3",
            speed: 1.15
          }),
          signal: controller.signal
        })
        
        clearTimeout(timeout)

        if (!response.ok) {
          throw new Error("OpenAI TTS failed")
        }

        const audioBuffer = await response.arrayBuffer()
        
        return new NextResponse(audioBuffer, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": audioBuffer.byteLength.toString(),
          },
        })
      } catch (e) {
        clearTimeout(timeout)
        if ((e as Error).name === 'AbortError') {
          console.log("TTS timeout, using browser fallback")
        }
        throw e
      }
    }

    // Fallback: devolver indicador para usar Web Speech API
    return NextResponse.json({ useBrowserTTS: true })

  } catch (error) {
    console.error("TTS error:", error)
    return NextResponse.json({ useBrowserTTS: true })
  }
}
