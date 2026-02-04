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

// GET - Obtener conversaciones del usuario
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
      const conversations = await sql`
        SELECT id, title, mode, created_at, updated_at
        FROM conversations
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
        LIMIT 50
      `;
      return NextResponse.json({ conversations });
    }

    // Modo demo
    return NextResponse.json({ conversations: [] });

  } catch (error) {
    console.error("Get conversations error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// POST - Crear nueva conversación
export async function POST(request: Request) {
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
    const mode = body.mode || "assistant";
    const title = body.title || "Nueva conversación";

    if (process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      const result = await sql`
        INSERT INTO conversations (user_id, mode, title)
        VALUES (${userId}, ${mode}, ${title})
        RETURNING id, title, mode, created_at
      `;
      return NextResponse.json({ conversation: result[0] });
    }

    // Modo demo
    return NextResponse.json({ 
      conversation: { id: Date.now(), title, mode, created_at: new Date().toISOString() } 
    });

  } catch (error) {
    console.error("Create conversation error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
