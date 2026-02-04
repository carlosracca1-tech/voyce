import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "id_required" }, { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 500 });
    }

    const sql = neon(process.env.DATABASE_URL);

    const rows = await sql`
      SELECT id, source, title, summary, content, category, link, published_at, fetched_at
      FROM news_articles
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!rows?.length) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, article: rows[0] });
  } catch (error) {
    console.error("News article fetch error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
