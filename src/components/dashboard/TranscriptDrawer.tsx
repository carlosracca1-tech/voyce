"use client"

export default function TranscriptDrawer({
  open,
  text,
  onClose,
  onClear,
}: {
  open: boolean
  text: string
  onClose: () => void
  onClear: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[60] px-4 pb-4">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#0f0f16]/80 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <p className="text-sm font-semibold text-white/80">Transcripción</p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClear}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Limpiar
            </button>
            <button
              onClick={onClose}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="px-6 py-5 max-h-[35vh] overflow-y-auto">
          {text ? (
            <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
              {text}
            </p>
          ) : (
            <p className="text-sm text-white/40">
              Todavía no hay texto para mostrar.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
