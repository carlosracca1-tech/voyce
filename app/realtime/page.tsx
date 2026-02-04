"use client";

import { useEffect, useRef, useState } from "react";

type NewsItem = {
  id: number;
  source: string;
  title: string;
  summary?: string;
  category?: string;
  link?: string;
  published_at?: string;
};

export default function RealtimePage() {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [headlines, setHeadlines] = useState<NewsItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Guardamos el "último item de audio" para truncar si interrumpís (más adelante lo refinamos)
  const lastAssistantItemIdRef = useRef<string | null>(null);

  async function fetchHeadlines() {
    const res = await fetch("/api/news?limit=12");
    const data = await res.json();
    if (data?.ok) setHeadlines(data.news || []);
  }

  function sendEvent(evt: any) {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify(evt));
  }

  function injectSystemText(text: string) {
    sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text }],
      },
    });
  }

  function requestResponse(instructions?: string) {
    sendEvent({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions,
      },
    });
  }

  async function connect() {
    setStatus("connecting");

    try {
      await fetchHeadlines();

      // 1) Pedimos ephemeral token al backend
      const tokenResp = await fetch("/api/realtime/token");
      const tokenData = await tokenResp.json();
      const EPHEMERAL_KEY = tokenData?.value;
      if (!EPHEMERAL_KEY) throw new Error("No ephemeral key returned");

      // 2) WebRTC peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // audio remoto (lo que “habla” la IA)
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      remoteAudioRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // mic local
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(ms.getTracks()[0]);

      // data channel para eventos Realtime (mensajes, estado, etc.)
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        // Config de sesión: estilo + reglas de “titulares primero”
        // (Esto hace que sea súper conversacional y guiado)
        sendEvent({
          type: "session.update",
          session: {
            type: "realtime",
            // Turn detection del server para latencia baja (sin apretar “enviar”)
            turn_detection: { type: "server_vad" },
            // Pedimos transcripción para poder ver qué entendió (útil para debug)
            input_audio_transcription: { model: "gpt-4o-mini-transcribe" },

            instructions:
              "Sos VOYCE, locutor argentino. Conversación súper natural, rápida, sin discursos largos. " +
              "Regla: primero das titulares del día (5 a 7) basándote SOLO en el listado que te pasamos. " +
              "Luego preguntás: '¿Cuál querés que amplíe?' y esperás. " +
              "Cuando el usuario elige una, profundizás usando SOLO el artículo completo que te vamos a inyectar. " +
              "Si el usuario interrumpe, frenás y retomás escuchando.",
          },
        });

        // Inyectamos titulares como “base” del día
        const top = (headlines || []).slice(0, 10);
        const formatted = top
          .map((h, i) => `${i + 1}) [id:${h.id}] ${h.title} — ${h.source}`)
          .join("\n");

        injectSystemText(
          `TITULARES DISPONIBLES HOY (usá SOLO esto para listar titulares):\n${formatted}\n\n` +
            "Cuando el usuario elija un número o un id, pedinos el artículo completo."
        );

        // Disparamos primer respuesta: saludo + titulares + pregunta
        requestResponse(
          "Saludá y leé 5 a 7 titulares del listado. Mantenelo bien de radio. Terminá preguntando cuál ampliar."
        );
      };

      dc.onmessage = async (msg) => {
        try {
          const evt = JSON.parse(msg.data);

          // Guardamos item_id del audio del asistente si aparece (para truncar luego)
          // (Depende del event shape; lo refinamos cuando veas logs)
          if (evt?.type === "conversation.item.created" && evt?.item?.role === "assistant") {
            lastAssistantItemIdRef.current = evt?.item?.id ?? null;
          }

          // Cuando el user habla y se genera transcripción, podemos detectar si eligió un titular
          // Hay distintos eventos; el más común: "conversation.item.input_audio_transcription.completed"
          const transcript =
            evt?.type?.includes("transcription") && evt?.transcript ? String(evt.transcript) : null;

          if (transcript) {
            // Intento simple: si dice "la 3" o "id 123"
            const numMatch = transcript.match(/\b(?:la|el)\s+(\d{1,2})\b/i);
            const idMatch = transcript.match(/\bid\s*[:#]?\s*(\d+)\b/i);

            let pickedId: number | null = null;

            if (idMatch) {
              pickedId = Number(idMatch[1]);
            } else if (numMatch) {
              const idx = Number(numMatch[1]) - 1;
              if (idx >= 0 && idx < headlines.length) pickedId = headlines[idx].id;
            }

            if (pickedId) {
              setSelectedId(pickedId);

              // Traemos artículo completo desde tu DB y lo inyectamos
              const aRes = await fetch(`/api/news/article?id=${pickedId}`);
              const aData = await aRes.json();

              if (aData?.ok?.article) {
                const a = aData.article;

                injectSystemText(
                  `ARTÍCULO SELECCIONADO (usá SOLO esta info para ampliar; no inventes):\n` +
                    `Título: ${a.title}\nFuente: ${a.source}\nCategoría: ${a.category}\nFecha: ${a.published_at}\nLink: ${a.link}\n\n` +
                    `Resumen: ${a.summary ?? ""}\n\n` +
                    `Contenido:\n${a.content ?? ""}\n`
                );

                requestResponse(
                  "Ampliá esta noticia como locutor: 30-60 segundos, claro, con datos. " +
                    "Luego abrí conversación: '¿Querés que te cuente impacto, contexto, o qué puede pasar después?'"
                );
              }
            }
          }
        } catch {
          // ignore
        }
      };

      // 3) SDP handshake con OpenAI (GA: /v1/realtime/calls)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResp.ok) {
        const text = await sdpResp.text();
        throw new Error(text || "SDP exchange failed");
      }

      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setStatus("live");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  function interrupt() {
    // Esto corta la respuesta en curso (interrupción manual)
    // (El event existe en Realtime; si hace falta ajustamos el nombre exacto según logs)
    sendEvent({ type: "response.cancel" });

    // Opcional: truncar audio que ya llegó pero no se reprodujo (pro nivel)
    // sendEvent({ type: "conversation.item.truncate", item_id: lastAssistantItemIdRef.current, ... })
  }

  function disconnect() {
    try {
      dcRef.current?.close();
      pcRef.current?.close();
    } catch {}
    dcRef.current = null;
    pcRef.current = null;
    setStatus("idle");
  }

  useEffect(() => {
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>VOYCE Realtime (prueba de latencia + interrupción)</h1>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        {status !== "live" ? (
          <button onClick={connect} style={{ padding: "10px 14px", borderRadius: 10 }}>
            🎙️ Conectar y hablar
          </button>
        ) : (
          <button onClick={disconnect} style={{ padding: "10px 14px", borderRadius: 10 }}>
            ⛔ Cortar
          </button>
        )}

        <button onClick={interrupt} disabled={status !== "live"} style={{ padding: "10px 14px", borderRadius: 10 }}>
          ✋ Interrumpir a VOYCE
        </button>
      </div>

      <p style={{ marginTop: 12 }}>
        Estado: <b>{status}</b>
        {selectedId ? (
          <>
            {" "}
            | Artículo seleccionado: <b>{selectedId}</b>
          </>
        ) : null}
      </p>

      <div style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Titulares disponibles (para que elijas)</h2>
        <ol>
          {headlines.slice(0, 10).map((h) => (
            <li key={h.id}>
              <b>{h.title}</b> — {h.source} <span style={{ opacity: 0.6 }}>(id:{h.id})</span>
            </li>
          ))}
        </ol>
      </div>

      <p style={{ marginTop: 18, opacity: 0.75 }}>
        Tip: decí “la 3” o “id 123” después de que lea titulares.
      </p>
    </div>
  );
}
