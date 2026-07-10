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

interface ChatContext {
  /** Frase de bienvenida en tono copiloto: qué puede hacer acá. */
  intro: string;
  /** Placeholder del input, orientado a la página actual. */
  placeholder: string;
  /** Chips sugeridos: al tocarlos se envían como si el usuario los tipeara. */
  chips: string[];
}

// Preguntas de arranque genéricas (fallback). Interpretativas, no triviales:
// buscan que el copiloto traiga un dato y lo lea, no un simple sí/no.
const DEFAULT_CONTEXT: ChatContext = {
  intro: "Soy tu copiloto de datos del Mundial 2026. Puedo traer los números y ayudarte a interpretarlos.",
  placeholder: "¿Qué querés saber del torneo?",
  chips: [
    "¿Argentina corre menos que el resto?",
    "¿Quién es el goleador del torneo?",
    "¿Qué selección tiene el plantel más joven?",
  ],
};

// Detecta la página actual por el pathname (el componente es client:only, así que
// window está disponible) y adapta bienvenida, placeholder y chips. Ninguna de
// estas variantes dispara una llamada a Gemini: sólo preparan texto local. La
// API se llama recién cuando el usuario toca un chip o escribe y envía.
function contextFor(pathname: string): ChatContext {
  const p = (pathname || "").toLowerCase();

  if (p.includes("/selecciones")) {
    return {
      intro: "Estás viendo el físico y el perfil de las selecciones. Puedo leer estos rankings con vos.",
      placeholder: "¿Qué querés saber de estas selecciones?",
      chips: [
        "¿Qué selección corre más y cuál menos?",
        "¿Argentina corre menos que el promedio del torneo?",
        "¿Qué selección tiene el plantel más joven?",
      ],
    };
  }

  if (p.includes("/comparar")) {
    return {
      intro: "Estás comparando selecciones. Puedo cruzar sus números físicos y tácticos y decirte qué patrón sugieren.",
      placeholder: "¿Qué querés comparar?",
      chips: [
        "¿En qué se diferencian físicamente Argentina y Francia?",
        "¿Correr menos significa estar peor físicamente?",
        "¿Qué mide la alta intensidad al comparar dos selecciones?",
      ],
    };
  }

  if (p.includes("/jugadores")) {
    return {
      intro: "Estás viendo a los jugadores. Puedo rankearlos por métrica y normalizar por posición para que la comparación sea justa.",
      placeholder: "¿Qué querés saber de los jugadores?",
      chips: [
        "¿Quién es el jugador que más corre del torneo?",
        "¿Quién lidera en alta intensidad por posición?",
        "¿Qué significa 'alta intensidad'?",
      ],
    };
  }

  if (p.includes("/goleadores")) {
    return {
      intro: "Estás viendo a los goleadores. Puedo traer el ranking real y ponerlo en contexto.",
      placeholder: "¿Qué querés saber de los goleadores?",
      chips: [
        "¿Quién es el goleador del torneo?",
        "¿Cuántos goles lleva Argentina y quién los hizo?",
        "¿Quién es el goleador más joven?",
      ],
    };
  }

  if (p.includes("/analisis")) {
    return {
      intro: "Estás en el análisis avanzado. Puedo leer los líderes físicos y tácticos y explicar qué patrón muestran.",
      placeholder: "¿Qué querés que interprete?",
      chips: [
        "¿Qué selección tiene la huella física de un equipo que domina el balón?",
        "¿Correr más siempre es mejor?",
        "¿Qué selección lidera en alta intensidad?",
      ],
    };
  }

  if (p.includes("/explorador")) {
    return {
      intro: "Estás en el explorador de datos. Puedo ayudarte a entender qué hay disponible y cómo leerlo.",
      placeholder: "¿Qué datos querés explorar?",
      chips: [
        "¿Qué métricas físicas hay cargadas por selección?",
        "¿Qué selección corre más y cuál menos?",
        "¿De dónde salen estos datos?",
      ],
    };
  }

  if (p.includes("/metodologia") || p.includes("/fuentes")) {
    return {
      intro: "Estás viendo cómo se construyó el proyecto. Puedo explicarte las fuentes y los límites de los datos.",
      placeholder: "¿Qué querés saber de los datos?",
      chips: [
        "¿De dónde salen estos datos?",
        "¿Por qué la distancia recorrida no mide el estado físico?",
        "¿Se puede sacar una conclusión con tan pocos partidos?",
      ],
    };
  }

  return DEFAULT_CONTEXT;
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  // El contexto se calcula una sola vez al montar (el pathname no cambia sin
  // recargar en este sitio estático). Es texto local: cero costo de API.
  const [context] = useState<ChatContext>(() =>
    contextFor(typeof window !== "undefined" ? window.location.pathname : ""),
  );
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  // El ítem "IA" del menú principal (Base.astro) emite este evento global para
  // abrir el asistente sin acoplar el markup del header con este island.
  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener("mm26:open-chat", openChat);
    return () => window.removeEventListener("mm26:open-chat", openChat);
  }, []);

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

          <div className="chat-messages" ref={scrollRef} role="log" aria-live="polite" aria-label="Mensajes del asistente">
            {turns.length === 0 && (
              <div className="chat-empty">
                <p>{context.intro}</p>
                <p className="chat-suggestions-label">Empezá por acá:</p>
                <div className="chat-suggestions">
                  {context.chips.map((s) => (
                    <button key={s} type="button" className="chat-chip" onClick={() => send(s)}>
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
              placeholder={context.placeholder}
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
