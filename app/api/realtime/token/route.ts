import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });
    }
    
    // Config base de la sesión Realtime (voz + reglas)
    const sessionConfig = {
      session: {
        type: "realtime",
        model: "gpt-realtime",
        audio: {
          output: { voice: "marin" }, // podés cambiar luego
        },
      },
    };

    // GA: endpoint recomendado para ephemeral keys
    const resp = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: "token_mint_failed", detail: text }, { status: 500 });
    }

    // Devuelve { value: "ek_..." , expires_at: ... }
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: "internal_error", detail: e?.message ?? String(e) }, { status: 500 });
  }
}
