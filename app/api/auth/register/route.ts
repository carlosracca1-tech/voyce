import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import { hashPassword, createToken } from "@/lib/auth"

const TRIAL_DAYS = 7

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body?.email || "").trim().toLowerCase()
    const password = String(body?.password || "")
    const name = String(body?.name || "").trim()

    if (!email || !password) {
      return NextResponse.json(
        { error: "missing_fields", message: "Email y contraseña son requeridos" },
        { status: 400 }
      )
    }

    if (!email.includes("@") || email.length < 6) {
      return NextResponse.json(
        { error: "invalid_email", message: "Email inválido" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "weak_password", message: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      )
    }

    const passwordHash = await hashPassword(password)
    const trialStartedAt = new Date()
    const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

    // ── Con base de datos ──────────────────────────────────────────────────
    if (process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL)

      const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`

      if (existing.length > 0) {
        return NextResponse.json(
          { error: "email_exists", message: "Este email ya está registrado" },
          { status: 409 }
        )
      }

      const userResult = await sql`
        INSERT INTO users (email, password_hash, name, role, trial_started_at, trial_ends_at)
        VALUES (
          ${email},
          ${passwordHash},
          ${name || email.split("@")[0]},
          'user',
          ${trialStartedAt.toISOString()},
          ${trialEndsAt.toISOString()}
        )
        RETURNING id, email, name, role
      `
      const user = userResult[0]

      // Suscripción y preferencias en background (no bloqueamos el response)
      Promise.all([
        sql`
          INSERT INTO subscriptions (user_id, status, plan_id, plan_name, price_cents, currency, current_period_start, current_period_end)
          VALUES (
            ${user.id}, 'beta', 'beta', 'Beta gratuito', 0, 'USD',
            ${trialStartedAt.toISOString()}, ${trialEndsAt.toISOString()}
          )
        `,
        sql`INSERT INTO user_preferences (user_id) VALUES (${user.id})`,
      ]).catch(() => {})

      const token = createToken(user.id, user.email)

      return NextResponse.json({
        ok: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        subscription: { status: "beta", canAccess: true, message: "Acceso BETA gratuito" },
      })
    }

    // ── Modo demo sin DB ───────────────────────────────────────────────────
    const mockUser = { id: Date.now(), email, name: name || email.split("@")[0], role: "user" }
    const token = createToken(mockUser.id, email)

    return NextResponse.json({
      ok: true,
      token,
      user: mockUser,
      subscription: { status: "beta", canAccess: true, message: "Acceso BETA gratuito" },
    })
  } catch (error) {
    console.error("[voyce] Register error:", error)
    return NextResponse.json(
      { error: "internal_error", message: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
