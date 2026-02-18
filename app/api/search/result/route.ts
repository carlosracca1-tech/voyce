import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = String(searchParams.get('id') ?? '')
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

    if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: 'DATABASE_URL missing' }, { status: 500 })
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)

    const rows = await sql`select id, query, status, result from background_searches where id = ${id} limit 1`
    if (!rows || !rows[0]) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    return NextResponse.json({ ok: true, search: rows[0] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
