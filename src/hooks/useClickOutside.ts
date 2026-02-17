import { useEffect } from "react"

export function useClickOutside(
  enabled: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void
) {
  useEffect(() => {
    if (!enabled) return

    const handle = (event: MouseEvent) => {
      setTimeout(() => {
        const el = ref.current
        if (el && !el.contains(event.target as Node)) onOutside()
      }, 0)
    }

    document.addEventListener("click", handle)
    return () => document.removeEventListener("click", handle)
  }, [enabled, ref, onOutside])
}
