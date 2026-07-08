import { useEffect, useRef, useState } from "react";

// URL del Worker (Cloudflare) que hace de proxy hacia Gemini. Se inyecta en
// build time como variable pública -- ver astro.config y deploy.yml. Si no
// está configurada (todavía no se hizo el setup manual de Cloudflare), el
// componente no renderiza nada: el sitio sigue funcionando 100% sin el chat.
const CHAT_API_URL = import.meta.env.PUBLIC_CHAT_API_URL as string | undefined;

interface Turn {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "¿Argentina corre menos que otras selecciones?",
  "¿Qué significa 'alta intensidad'?",
  "¿De dónde salen estos datos?",
];

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  if (!CHAT_API_URL) return null;

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;

    const nextTurns: Turn[] = [...turns, { role: "user", text: message }];
    setTurns(nextTurns);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(CHAT_API_URL as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: turns.slice(-6) }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(data?.message || "Límite de mensajes alcanzado. Probá de nuevo en un rato.");
        } else if (res.status === 503) {
          setError("El asistente todavía no está configurado.");
        } else {
          // Se muestra el código de diagnóstico para poder reportar el problema
          // sin necesidad de abrir las herramientas de desarrollador del navegador.
          const detail = [data?.error, data?.status, data?.reason].filter(Boolean).join(" ");
          setError(`No se pudo obtener respuesta. Probá de nuevo.${detail ? ` (${detail})` : ""}`);
        }
        return;
      }

      setTurns([...nextTurns, { role: "assistant", text: data.reply }]);
    } catch {
      setError("No se pudo conectar con el asistente. Revisá tu conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Asistente de Métricas Mundial 2026">
          <div className="chat-panel-header">
            <strong>Asistente · Métricas Mundial 2026</strong>
            <button
              type="button"
              className="chat-close"
              onClick={() => setOpen(false)}
              aria-label="Cerrar asistente"
            >
              ✕
            </button>
          </div>

          <div className="chat-messages" ref={scrollRef}>
            {turns.length === 0 && (
              <div className="chat-empty">
                <p>
                  Preguntame sobre las métricas del sitio: posesión, distancia, alta intensidad, o
                  cómo interpretar un gráfico. No invento números que no estén en los datos.
                </p>
                <div className="chat-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} className={`chat-message chat-message-${t.role}`}>
                {t.text}
              </div>
            ))}

            {loading && <div className="chat-message chat-message-assistant chat-typing">Pensando…</div>}
          </div>

          {error && <p className="chat-error">{error}</p>}

          <form
            className="chat-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribí tu pregunta…"
              maxLength={600}
              disabled={loading}
              aria-label="Mensaje para el asistente"
            />
            <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
              Enviar
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="chat-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Cerrar asistente" : "Abrir asistente"}
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
