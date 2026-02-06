import React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"] })
const geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "VOYCE - Tu Radio Inteligente",
  description: "Hablá con tu asistente de radio potenciado por inteligencia artificial",
  icons: {
    // 🧠 Favicon pestaña (Chrome, Safari, Edge)
    icon: [
      { url: "/voyce-logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // 🍎 iOS / Add to Home Screen
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={`${geist.className} antialiased bg-[#0a0a0f] text-white`}>
        {children}
      </body>
    </html>
  )
}
