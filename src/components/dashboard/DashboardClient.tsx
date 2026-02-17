"use client"

import { useState } from "react"
import Header from "./Header"
import Orb from "./Orb"
import TranscriptDrawer from "./TranscriptDrawer"

import { useVoyceAuthAndSettings } from "@/hooks/useVoyceAuthAndSettings"
import { useHeadlinesPrefetch } from "@/hooks/useHeadlinesPrefetch"
import { useVoyceRealtime } from "@/hooks/useVoyceRealtime"
import { useAudioLevel } from "@/hooks/useAudioLevel"

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-white" aria-hidden="true">
      <path
        d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={muted ? 0.55 : 1}
      />
      <path
        d="M19 11a7 7 0 0 1-14 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={muted ? 0.55 : 1}
      />
      <path
        d="M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={muted ? 0.55 : 1}
      />
      <path
        d="M8 21h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={muted ? 0.55 : 1}
      />
      {muted && (
        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

export default function DashboardClient() {
  const { user, setUser, activeMode, setActiveMode, voicePreset, voiceSpeed, router } = useVoyceAuthAndSettings()

  const { headlinesCacheRef, headlinesReadyRef } = useHeadlinesPrefetch(30)

  const realtime = useVoyceRealtime({
    activeMode,
    voicePreset,
    voiceSpeed,
    headlinesCacheRef,
    headlinesReadyRef,
  })

  const audioLevel = useAudioLevel(realtime.isListening, realtime.isSpeaking)
  const [showTranscript, setShowTranscript] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem("voyce_user")
    localStorage.removeItem("voyce_settings")
    setUser(null)
    router.push("/")
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // “Live”: recién ahí aparece mute + transcripción
  const isLive = realtime.isListening || realtime.isSpeaking || realtime.isProcessing

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white relative">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00f0ff]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#ff00aa]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#8b5cf6]/5 rounded-full blur-3xl" />
      </div>

      <Header user={user} onLogout={handleLogout} />

      {/* ✅ STAGE: altura fija para que la orbe NO se mueva */}
      <main className="relative z-10 px-6">
        <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
          {/* Mode pill (no mueve nada) */}
          <div className="absolute top-10 left-1/2 -translate-x-1/2 flex gap-2">
            {[
              { id: "conversacion" as const, label: "Conversación" },
              { id: "podcast" as const, label: "Podcast" },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setActiveMode(mode.id)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  activeMode === mode.id
                    ? "bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] text-white shadow-[0_0_30px_rgba(0,240,255,0.3)]"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* ✅ ORBE siempre centrada */}
          <div className="flex items-center justify-center">
            <Orb
              isListening={realtime.isListening}
              isSpeaking={realtime.isSpeaking}
              isProcessing={realtime.isProcessing}
              audioLevel={audioLevel}
              onToggle={realtime.toggleListening}
            />
          </div>

          {/* ✅ BLOQUE INFERIOR “anclado” (no empuja la orbe) */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-8 w-full max-w-3xl px-6">
            {/* Mute + botón transcripción */}
            {isLive && (
              <div className="flex flex-col items-center gap-5">
                {/* 🔵 MUTE grande */}
                <button
                  onClick={realtime.toggleMute}
                  aria-label={realtime.isMuted ? "Activar micrófono" : "Mutear micrófono"}
                  title={realtime.isMuted ? "Mic en mute" : "Mic activo"}
                  className={`w-20 h-20 rounded-full border transition-all duration-300 flex items-center justify-center
                    ${realtime.isMuted
                      ? "bg-[#ff00aa]/15 border-[#ff00aa]/40 shadow-[0_0_45px_rgba(255,0,170,0.25)]"
                      : "bg-white/5 border-white/15 hover:bg-white/10 shadow-[0_0_45px_rgba(0,240,255,0.16)]"
                    }
                  `}
                >
                  <MicIcon muted={realtime.isMuted} />
                </button>

                {/* 🔹 Botón transcripción (distinto al mute) */}
                <button
                  onClick={() => setShowTranscript((v) => !v)}
                  className="px-6 py-2 rounded-full border border-white/10 text-white/45 hover:text-white/70 hover:border-white/20 transition-all text-sm"
                >
                  {showTranscript ? "Ocultar transcripción" : "Ver transcripción"}
                </button>
              </div>
            )}

            {/* Drawer (más abajo, sin mover nada) */}
            {isLive && showTranscript && (
              <div className="mt-6">
                <TranscriptDrawer show={showTranscript} text={realtime.currentText} onClear={() => realtime.setCurrentText("")} />
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx global>{`
        @keyframes pulse {
          0%,100% { transform: scale(1); opacity: .9; }
          50% { transform: scale(1.08); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
