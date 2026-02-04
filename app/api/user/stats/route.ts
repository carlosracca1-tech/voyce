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
      
      // Stats totales
      const totalResult = await sql`
        SELECT 
          COALESCE(SUM(queries_count), 0) as total_queries,
          COALESCE(SUM(tokens_used), 0) as total_tokens,
          COALESCE(SUM(audio_minutes), 0) as total_audio_minutes
        FROM usage_stats WHERE user_id = ${userId}
      `;

      // Stats de hoy
      const todayResult = await sql`
        SELECT 
          COALESCE(queries_count, 0) as queries_today,
          COALESCE(tokens_used, 0) as tokens_today
        FROM usage_stats 
        WHERE user_id = ${userId} AND date = CURRENT_DATE
      `;

      // Stats ultimos 7 dias
      const weekResult = await sql`
        SELECT date, queries_count, tokens_used
        FROM usage_stats 
        WHERE user_id = ${userId} AND date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY date ASC
      `;

      // Total conversaciones
      const convsResult = await sql`
        SELECT COUNT(*) as total_conversations
        FROM conversations WHERE user_id = ${userId}
      `;

      return NextResponse.json({
        total: totalResult[0],
        today: todayResult[0] || { queries_today: 0, tokens_today: 0 },
        weekHistory: weekResult,
        totalConversations: convsResult[0]?.total_conversations || 0,
      });
    }

    // Modo demo
    return NextResponse.json({
      total: { total_queries: 15, total_tokens: 5000, total_audio_minutes: 12 },
      today: { queries_today: 3, tokens_today: 800 },
      weekHistory: [
        { date: new Date(Date.now() - 6*24*60*60*1000).toISOString().split('T')[0], queries_count: 2, tokens_used: 500 },
        { date: new Date(Date.now() - 5*24*60*60*1000).toISOString().split('T')[0], queries_count: 3, tokens_used: 750 },
        { date: new Date(Date.now() - 4*24*60*60*1000).toISOString().split('T')[0], queries_count: 1, tokens_used: 300 },
        { date: new Date(Date.now() - 3*24*60*60*1000).toISOString().split('T')[0], queries_count: 4, tokens_used: 1200 },
        { date: new Date(Date.now() - 2*24*60*60*1000).toISOString().split('T')[0], queries_count: 2, tokens_used: 650 },
        { date: new Date(Date.now() - 1*24*60*60*1000).toISOString().split('T')[0], queries_count: 0, tokens_used: 0 },
        { date: new Date().toISOString().split('T')[0], queries_count: 3, tokens_used: 800 },
      ],
      totalConversations: 5,
    });

  } catch (error) {
    console.error("Get stats error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
