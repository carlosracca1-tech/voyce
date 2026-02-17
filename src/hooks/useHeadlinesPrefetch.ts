"use client"

import { useEffect, useRef } from "react"
import { byImportanceDesc } from "@/lib/voyce/headlines"

export function useHeadlinesPrefetch(limit = 30) {
  const headlinesCacheRef = useRef<any[]>([])
  const headlinesReadyRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const r = await fetch(`/api/news?limit=${limit}`, { cache: "no-store" })
        const d = await r.json()
        if (cancelled) return
        headlinesCacheRef.current = (d?.news || []).sort(byImportanceDesc)
        headlinesReadyRef.current = true
      } catch {
        if (cancelled) return
        headlinesCacheRef.current = []
        headlinesReadyRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [limit])

  return { headlinesCacheRef, headlinesReadyRef }
}
