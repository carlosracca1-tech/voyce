import { norm } from "./normalize"

export function guessSourceFromTranscript(t: string) {
  const x = norm(t)

  if (/(la\s*nacion|nacion)/.test(x)) return "La Nación"
  if (/(clarin)/.test(x)) return "Clarín"
  if (/(ambito)/.test(x)) return "Ámbito"
  if (/(cronista|el\s*cronista)/.test(x)) return "El Cronista"
  if (/(infobae)/.test(x)) return "Infobae"
  if (/(pagina\s*12|pagina12)/.test(x)) return "Página 12"

  return null
}

export function wantsTopWithoutSource(t: string) {
  const x = norm(t)
  return /(principales|top|mas\s*importantes|lo\s*mas\s*importante|titulares\s*principales)/.test(x)
}

export function wantsChangeSource(t: string) {
  const x = norm(t)
  return /(otro\s*diario|cambiar\s*diario|cambiemos\s*de\s*diario|ninguno|no\s*me\s*gusta)/.test(x)
}

export function wantsRefresh(t: string) {
  const x = norm(t)
  return /actualiz(a|á)|refresc(a|á)|recarg(a|á)|descarg(a|á)\s+de\s+nuevo|nuevas\s+noticias/i.test(x)
}

export function extractPick(transcript: string) {
  const numMatch = transcript.match(/\b(?:la|el)\s+(\d{1,2})\b/i)
  const idMatch = transcript.match(/\bid\s*[:#]?\s*(\d+)\b/i)

  const pickedId = idMatch ? Number(idMatch[1]) : null
  const pickedIndex = !pickedId && numMatch ? Number(numMatch[1]) - 1 : null

  return { pickedId, pickedIndex }
}
