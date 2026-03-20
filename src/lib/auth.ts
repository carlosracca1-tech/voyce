/**
 * auth.ts — Helpers de autenticación para VOYCE
 *
 * Contraseñas: PBKDF2-SHA512 (100k iteraciones, salt aleatorio por usuario)
 *   Formato almacenado: "pbkdf2:sha512:100000:<saltHex>:<hashHex>"
 *   Retrocompatible con hashes SHA-256 legacy (migración automática)
 *
 * Tokens: JWT firmado con HS256 (jsonwebtoken)
 *   Variable de entorno requerida: JWT_SECRET
 */

import crypto from "crypto"
import jwt from "jsonwebtoken"

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEYLEN = 64
const PBKDF2_DIGEST = "sha512"

export const JWT_SECRET = process.env.JWT_SECRET ?? "voyce_dev_secret_CHANGE_IN_PRODUCTION"
export const TOKEN_EXPIRES_IN = "30d"

if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  console.error("[voyce/auth] ⚠️  JWT_SECRET no configurado en producción. Configura esta variable de entorno.")
}

// ─────────────────────────────────────────────
// Hash de contraseñas (PBKDF2)
// ─────────────────────────────────────────────

/** Genera un hash PBKDF2 seguro para almacenar en DB */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex")
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, key) => {
      if (err) return reject(err)
      resolve(`pbkdf2:${PBKDF2_DIGEST}:${PBKDF2_ITERATIONS}:${salt}:${key.toString("hex")}`)
    })
  })
}

/**
 * Verifica una contraseña contra su hash almacenado.
 * Soporta:
 *   - Hashes PBKDF2 modernos: "pbkdf2:sha512:100000:salt:hash"
 *   - Hashes SHA-256 legacy: hexstring sin prefijo (migración automática)
 */
export async function verifyPassword(password: string, storedHash: string): Promise<{ valid: boolean; needsMigration: boolean }> {
  if (storedHash.startsWith("pbkdf2:")) {
    // Formato moderno
    const parts = storedHash.split(":")
    if (parts.length !== 5) return { valid: false, needsMigration: false }

    const [, digest, iterStr, salt, expected] = parts
    const iterations = parseInt(iterStr, 10)

    const valid = await new Promise<boolean>((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, PBKDF2_KEYLEN, digest, (err, key) => {
        if (err) return reject(err)
        resolve(key.toString("hex") === expected)
      })
    })

    return { valid, needsMigration: false }
  }

  // Formato legacy: SHA-256 con salt fijo
  const encoder = new TextEncoder()
  const data = encoder.encode(password + "voyce_salt_2024")
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const legacyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

  const valid = legacyHash === storedHash
  return { valid, needsMigration: valid } // si es válido con el hash viejo, hay que migrar
}

// ─────────────────────────────────────────────
// Tokens JWT
// ─────────────────────────────────────────────

/** Genera un JWT firmado para el usuario */
export function createToken(userId: number, email: string): string {
  return jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN })
}

/** Verifica y decodifica un JWT. Devuelve el userId o null si es inválido/expirado */
export function verifyToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: number; email: string }
    const id = Number(payload?.id)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

/** Extrae el userId del header Authorization: Bearer <token> */
export function getUserIdFromRequest(request: Request): number | null {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  const token = authHeader.slice("Bearer ".length).trim()
  return verifyToken(token)
}
