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
  console.log("[v0] Login API called")
  
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    console.log("[v0] Login attempt for email:", email)

    if (!email || !password) {
      return NextResponse.json(
        { error: "missing_fields", message: "Email y contraseña son requeridos" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "invalid_credentials", message: "Email o contraseña incorrectos" },
        { status: 401 }
      );
    }

    const passwordHash = await hashPassword(password);

    // Si hay DATABASE_URL, usar Neon
    if (process.env.DATABASE_URL) {
      console.log("[v0] Using Neon database")
      const sql = neon(process.env.DATABASE_URL);

      // Buscar usuario
      const userResult = await sql`
        SELECT id, email, password_hash, name, role, is_active, trial_ends_at
        FROM users WHERE email = ${email} LIMIT 1
      `;

      console.log("[v0] User found:", userResult.length > 0)

      if (userResult.length === 0) {
        return NextResponse.json(
          { error: "invalid_credentials", message: "Email o contraseña incorrectos" },
          { status: 401 }
        );
      }

      const user = userResult[0];

      if (user.is_active === false) {
        return NextResponse.json(
          { error: "user_inactive", message: "Tu cuenta ha sido desactivada" },
          { status: 403 }
        );
      }

      if (passwordHash !== user.password_hash) {
        console.log("[v0] Password mismatch")
        return NextResponse.json(
          { error: "invalid_credentials", message: "Email o contraseña incorrectos" },
          { status: 401 }
        );
      }

      // Actualizar último login
      await sql`UPDATE users SET last_login_at = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE id = ${user.id}`;

      // MODO BETA: Siempre dar acceso
      const subscriptionStatus = { 
        status: "beta", 
        canAccess: true, 
        message: "Acceso BETA gratuito"
      };

      const token = createToken(user.id, user.email);

      console.log("[v0] Login successful for user:", user.id)

      return NextResponse.json({
        ok: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        subscription: subscriptionStatus,
      });
    }

    console.log("[v0] No DATABASE_URL, using demo mode")
    
    // Modo demo sin DB - BETA: siempre dar acceso
    const mockUser = { id: Date.now(), email, name: email.split("@")[0], role: "user" };
    const token = createToken(mockUser.id, email);

    return NextResponse.json({
      ok: true,
      token,
      user: mockUser,
      subscription: { status: "beta", canAccess: true, message: "Acceso BETA gratuito" },
    });

  } catch (error) {
    console.error("[v0] Login error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
