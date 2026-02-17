import { norm } from "./normalize"

export function byImportanceDesc(a: any, b: any) {
  const sa = typeof a?.importance_score === "number" ? a.importance_score : 0
  const sb = typeof b?.importance_score === "number" ? b.importance_score : 0
  return sb - sa
}

export function formatList(list: any[], max = 10) {
  const slice = (list || []).slice(0, max)
  if (!slice.length) return ""
  return slice
    .map((h: any, i: number) => {
      const score = typeof h.importance_score === "number" ? h.importance_score : null
      return `${i + 1}) [id:${h.id}] ${h.title} — ${h.source}${score != null ? ` (score:${score})` : ""}`
    })
    .join("\n")
}

export function listForSource(all: any[], sourceName: string) {
  const nsource = norm(sourceName)
  const filtered = (all || []).filter((h) => norm(String(h?.source ?? "")).includes(nsource))
  return filtered.sort(byImportanceDesc)
}
