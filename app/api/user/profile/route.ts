import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

function getUserIdFromToken(token: string): number | null {
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(token))));
    return payload.id || null;
  } catch {
    return null;
  }
}

// GET - Obtener perfil del usuario
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const userId = getUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    if (process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      
      // Obtener usuario
      const userResult = await sql`
        SELECT id, email, name, role, trial_ends_at, created_at, last_login_at, login_count
        FROM users WHERE id = ${userId}
      `;

      if (userResult.length === 0) {
        return NextResponse.json({ error: "user_not_found" }, { status: 404 });
      }

      const user = userResult[0];

      // Obtener preferencias
      const prefsResult = await sql`
        SELECT preferred_mode, voice_enabled, voice_speed, language, theme, notifications_enabled
        FROM user_preferences WHERE user_id = ${userId}
      `;
      const preferences = prefsResult[0] || {};

      // Obtener suscripcion
      const subResult = await sql`
        SELECT status, plan_name, price_cents, currency, current_period_end
        FROM subscriptions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
      `;
      const subscription = subResult[0] || { status: "none" };

      // Obtener stats de uso
      const statsResult = await sql`
        SELECT SUM(queries_count) as total_queries, SUM(tokens_used) as total_tokens
        FROM usage_stats WHERE user_id = ${userId}
      `;
      const stats = statsResult[0] || { total_queries: 0, total_tokens: 0 };

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          trialEndsAt: user.trial_ends_at,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at,
          loginCount: user.login_count,
        },
        preferences,
        subscription,
        stats,
      });
    }

    // Modo demo
    return NextResponse.json({
      user: { id: userId, email: "demo@voyce.app", name: "Usuario Demo", role: "user" },
      preferences: { preferred_mode: "assistant", voice_enabled: true, language: "es" },
      subscription: { status: "trial", plan_name: "Trial", daysLeft: 7 },
      stats: { total_queries: 0, total_tokens: 0 },
    });

  } catch (error) {
    console.error("Get profile error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// PUT - Actualizar perfil del usuario
export async function PUT(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const userId = getUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    const body = await request.json();
    const { name, preferences } = body;

    if (process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      
      // Actualizar nombre si viene
      if (name !== undefined) {
        await sql`UPDATE users SET name = ${name} WHERE id = ${userId}`;
      }

      // Actualizar preferencias si vienen
      if (preferences) {
        await sql`
          INSERT INTO user_preferences (user_id, preferred_mode, voice_enabled, voice_speed, language, theme, notifications_enabled, updated_at)
          VALUES (
            ${userId}, 
            ${preferences.preferred_mode || 'assistant'}, 
            ${preferences.voice_enabled ?? true}, 
            ${preferences.voice_speed || 1.0}, 
            ${preferences.language || 'es'}, 
            ${preferences.theme || 'dark'},
            ${preferences.notifications_enabled ?? true},
            NOW()
          )
          ON CONFLICT (user_id) DO UPDATE SET
            preferred_mode = EXCLUDED.preferred_mode,
            voice_enabled = EXCLUDED.voice_enabled,
            voice_speed = EXCLUDED.voice_speed,
            language = EXCLUDED.language,
            theme = EXCLUDED.theme,
            notifications_enabled = EXCLUDED.notifications_enabled,
            updated_at = NOW()
        `;
      }

      return NextResponse.json({ ok: true, message: "Perfil actualizado" });
    }

    // Modo demo
    return NextResponse.json({ ok: true, message: "Perfil actualizado (modo demo)" });

  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
