import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import { hashPassword, verifyPassword, createToken } from "@/lib/auth"

const TRIAL_DAYS = 7

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body?.email || "").trim().toLowerCase()
    const password = String(body?.password || "")

    if (!email || !password) {
      return NextResponse.json(
        { error: "missing_fields", message: "Email y contraseña son requeridos" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "invalid_credentials", message: "Email o contraseña incorrectos" },
        { status: 401 }
      )
    }

    // ── Con base de datos ──────────────────────────────────────────────────
    if (process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL)

      const userResult = await sql`
        SELECT id, email, password_hash, name, role, is_active, trial_ends_at
        FROM users WHERE email = ${email} LIMIT 1
      `

      if (userResult.length === 0) {
        return NextResponse.json(
          { error: "invalid_credentials", message: "Email o contraseña incorrectos" },
          { status: 401 }
        )
      }

      const user = userResult[0]

      if (user.is_active === false) {
        return NextResponse.json(
          { error: "user_inactive", message: "Tu cuenta ha sido desactivada" },
          { status: 403 }
        )
      }

      const { valid, needsMigration } = await verifyPassword(password, String(user.password_hash))

      if (!valid) {
        return NextResponse.json(
          { error: "invalid_credentials", message: "Email o contraseña incorrectos" },
          { status: 401 }
        )
      }

      // Migración automática: si el hash era SHA-256 legacy, lo reemplazamos con PBKDF2
      if (needsMigration) {
        const newHash = await hashPassword(password)
        sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`.catch(() => {})
      }

      // Actualizar último login
      sql`
        UPDATE users
        SET last_login_at = NOW(), login_count = COALESCE(login_count, 0) + 1
        WHERE id = ${user.id}
      `.catch(() => {})

      const token = createToken(user.id, user.email)

      return NextResponse.json({
        ok: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        subscription: { status: "beta", canAccess: true, message: "Acceso BETA gratuito" },
      })
    }

    // ── Modo demo sin DB ───────────────────────────────────────────────────
    const mockUser = { id: Date.now(), email, name: email.split("@")[0], role: "user" }
    const token = createToken(mockUser.id, email)

    return NextResponse.json({
      ok: true,
      token,
      user: mockUser,
      subscription: { status: "beta", canAccess: true, message: "Acceso BETA gratuito" },
    })
  } catch (error) {
    console.error("[voyce] Login error:", error)
    return NextResponse.json(
      { error: "internal_error", message: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
