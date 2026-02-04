import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

const TRIAL_DAYS = 7;

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "voyce_salt_2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function createToken(userId: number, email: string): string {
  const payload = JSON.stringify({ id: userId, email, ts: Date.now() });
  return btoa(unescape(encodeURIComponent(payload)));
}

export async function POST(request: Request) {
  console.log("[v0] Register API called")
  
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const name = String(body?.name || "").trim();
    
    console.log("[v0] Register attempt for email:", email)

    // Validaciones
    if (!email || !password) {
      return NextResponse.json(
        { error: "missing_fields", message: "Email y contraseña son requeridos" },
        { status: 400 }
      );
    }

    if (!email.includes("@") || email.length < 6) {
      return NextResponse.json(
        { error: "invalid_email", message: "Email inválido" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "weak_password", message: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    // Si hay DATABASE_URL, usar Neon
    if (process.env.DATABASE_URL) {
      console.log("[v0] Using Neon database for registration")
      const sql = neon(process.env.DATABASE_URL);

      // Verificar si el email ya existe
      const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
      console.log("[v0] Email exists check:", existing.length > 0)
      
      if (existing.length > 0) {
        return NextResponse.json(
          { error: "email_exists", message: "Este email ya está registrado" },
          { status: 409 }
        );
      }

      // Crear usuario
      console.log("[v0] Creating new user...")
      const userResult = await sql`
        INSERT INTO users (email, password_hash, name, role, trial_started_at, trial_ends_at)
        VALUES (${email}, ${passwordHash}, ${name || email.split("@")[0]}, 'user', ${trialStartedAt.toISOString()}, ${trialEndsAt.toISOString()})
        RETURNING id, email, name, role
      `;
      const user = userResult[0];
      console.log("[v0] User created with id:", user.id)

      // Crear suscripción en trial
      await sql`
        INSERT INTO subscriptions (user_id, status, plan_id, plan_name, price_cents, currency, current_period_start, current_period_end)
        VALUES (${user.id}, 'beta', 'beta', 'Beta gratuito', 0, 'USD', ${trialStartedAt.toISOString()}, ${trialEndsAt.toISOString()})
      `;

      // Crear preferencias por defecto
      await sql`
        INSERT INTO user_preferences (user_id) VALUES (${user.id})
      `;

      const token = createToken(user.id, user.email);

      console.log("[v0] Registration successful")
      return NextResponse.json({
        ok: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        subscription: { status: "beta", canAccess: true, message: "Acceso BETA gratuito" },
      });
    }

    console.log("[v0] No DATABASE_URL, using demo mode")
    
    // Modo demo sin DB - BETA
    const mockUser = { id: Date.now(), email, name: name || email.split("@")[0], role: "user" };
    const token = createToken(mockUser.id, email);

    return NextResponse.json({
      ok: true,
      token,
      user: mockUser,
      subscription: { status: "beta", canAccess: true, message: "Acceso BETA gratuito" },
    });

  } catch (error) {
    console.error("[v0] Register error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
