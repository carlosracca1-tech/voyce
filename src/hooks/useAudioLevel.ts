"use client"

import { useEffect, useState } from "react"

export function useAudioLevel(isListening: boolean, isSpeaking: boolean) {
  const [audioLevel, setAudioLevel] = useState(0)

  useEffect(() => {
    if (isListening || isSpeaking) {
      const interval = setInterval(() => setAudioLevel(Math.random() * 100), 100)
      return () => clearInterval(interval)
    } else {
      setAudioLevel(0)
    }
  }, [isListening, isSpeaking])

  return audioLevel
}
