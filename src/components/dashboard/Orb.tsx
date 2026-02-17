"use client"

export default function Orb({
  isListening,
  isSpeaking,
  isProcessing,
  audioLevel,
  onToggle,
}: {
  isListening: boolean
  isSpeaking: boolean
  isProcessing: boolean
  audioLevel: number
  onToggle: () => void
}) {
  return (
    <div className="relative mb-8 w-56 h-56 md:w-64 md:h-64 group">
      <div className="absolute inset-0">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute w-full h-full animate-spin"
            style={{ animationDuration: `${12 + i * 3}s`, animationDirection: i % 2 === 0 ? "normal" : "reverse" }}
          >
            <div
              className={`absolute w-2 h-2 rounded-full transition-all duration-500 ${
                isListening
                  ? "bg-[#00f0ff] shadow-[0_0_20px_#00f0ff]"
                  : isSpeaking
                    ? "bg-[#ff00aa] shadow-[0_0_20px_#ff00aa]"
                    : "bg-[#00f0ff]/60 shadow-[0_0_10px_#00f0ff]"
              }`}
              style={{
                top: "50%",
                left: "50%",
                transform: `rotate(${i * 45}deg) translateX(${100 + i * 8}px) translateY(-50%)`,
                opacity: isListening || isSpeaking ? 1 : 0.6,
              }}
            />
          </div>
        ))}
      </div>

      <button
        onClick={onToggle}
        disabled={isProcessing}
        className={`absolute inset-6 rounded-full transition-all duration-500 transform hover:scale-110 active:scale-95 ${
          isProcessing ? "cursor-wait" : "cursor-pointer"
        }`}
        style={{
          background: isListening
            ? "radial-gradient(circle at 30% 30%, #00f0ff 0%, #0080ff 30%, #ff00aa 70%, #8b5cf6 100%)"
            : isSpeaking
              ? "radial-gradient(circle at 30% 30%, #ff00aa 0%, #8b5cf6 50%, #4c1d95 100%)"
              : "radial-gradient(circle at 30% 30%, #1a1a2e 0%, #0f0f1a 50%, #0a0a12 100%)",
          boxShadow: isListening
            ? "0 0 80px rgba(0, 240, 255, 0.6), 0 0 120px rgba(255, 0, 170, 0.4)"
            : isSpeaking
              ? "0 0 80px rgba(255, 0, 170, 0.5), 0 0 120px rgba(139, 92, 246, 0.3)"
              : "0 0 50px rgba(0, 240, 255, 0.25), 0 0 100px rgba(255, 0, 170, 0.1)",
          border: "1px solid rgba(0, 240, 255, 0.2)",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {isProcessing ? (
            <div className="w-12 h-12 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <div className={`relative transition-all duration-300 ${isListening || isSpeaking ? "scale-110" : "scale-100"}`}>
              <div
                className="w-16 h-16 md:w-20 md:h-20 rounded-full"
                style={{
                  boxShadow: isListening
                    ? "0 0 40px #00f0ff"
                    : isSpeaking
                      ? "0 0 40px #ff00aa"
                      : "0 0 30px rgba(0,240,255,0.4), 0 0 60px rgba(255,0,170,0.2)",
                  animation: isListening || isSpeaking ? "pulse 1s ease-in-out infinite" : "none",
                  background: isListening
                    ? "linear-gradient(135deg,#00f0ff,#0080ff)"
                    : isSpeaking
                      ? "linear-gradient(135deg,#ff00aa,#8b5cf6)"
                      : "linear-gradient(135deg,rgba(0,240,255,.5),rgba(255,0,170,.5))",
                }}
              />
              {(isListening || isSpeaking) && (
                <div className="absolute inset-0 flex items-center justify-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-white rounded-full animate-pulse"
                      style={{
                        height: `${12 + Math.sin(Date.now() / 200 + i) * 8 + audioLevel / 10}px`,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: "0.5s",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </button>
    </div>
  )
}
