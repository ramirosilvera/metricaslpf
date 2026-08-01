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
  intro: "Soy tu copiloto de datos de la Liga Profesional Argentina. Puedo traer los números y ayudarte a interpretarlos.",
  placeholder: "¿Qué querés saber de la LPF?",
  chips: [
    "¿Cómo está la tabla de posiciones?",
    "¿Quién es el goleador del campeonato?",
    "¿Qué equipo remata más por partido?",
  ],
};

// Detecta la página actual por el pathname (el componente es client:only, así que
// window está disponible) y adapta bienvenida, placeholder y chips. Ninguna de
// estas variantes dispara una llamada a Gemini: sólo preparan texto local. La
// API se llama recién cuando el usuario toca un chip o escribe y envía.
function contextFor(pathname: string): ChatContext {
  const p = (pathname || "").toLowerCase();

  if (p.includes("/clubes")) {
    return {
      intro: "Estás viendo el perfil de los clubes. Puedo leer su tabla, su plantel y su rendimiento reciente con vos.",
      placeholder: "¿Qué querés saber de este club?",
      chips: [
        "¿Cómo le fue a River en los últimos partidos?",
        "¿Qué equipo tiene el plantel más joven?",
        "¿Cómo evolucionó la posesión de un equipo partido a partido?",
      ],
    };
  }

  if (p.includes("/comparar")) {
    return {
      intro: "Estás comparando clubes. Puedo cruzar sus números tácticos (remates, posesión, pases, faltas) y decirte qué patrón sugieren.",
      placeholder: "¿Qué querés comparar?",
      chips: [
        "¿En qué se diferencian Boca y River en remates y posesión?",
        "¿Qué equipo comete más faltas por partido?",
        "¿Qué mide la posesión-proxy al comparar dos equipos?",
      ],
    };
  }

  if (p.includes("/jugadores")) {
    return {
      intro: "Estás viendo a los jugadores. Puedo rankearlos por métrica (goles, xG, pases, tackles) y normalizar por posición para que la comparación sea justa.",
      placeholder: "¿Qué querés saber de los jugadores?",
      chips: [
        "¿Quién lidera en goles esperados (xG) por 90?",
        "¿Quién lidera en tackles por posición?",
        "¿Qué significa el índice GLOBAL de un jugador?",
      ],
    };
  }

  if (p.includes("/goleadores")) {
    return {
      intro: "Estás viendo a los goleadores. Puedo traer el ranking real y ponerlo en contexto.",
      placeholder: "¿Qué querés saber de los goleadores?",
      chips: [
        "¿Quién es el goleador del campeonato?",
        "¿Cuántos goles lleva mi equipo y quién los hizo?",
        "¿Quién lidera en asistencias?",
      ],
    };
  }

  if (p.includes("/analisis")) {
    return {
      intro: "Estás en el análisis avanzado. Puedo leer los líderes tácticos y de temporada y explicar qué patrón muestran.",
      placeholder: "¿Qué querés que interprete?",
      chips: [
        "¿Qué equipo tiene el estilo más ofensivo?",
        "¿Rematar más siempre es mejor?",
        "¿Qué equipo lidera en remates a puerta por partido?",
      ],
    };
  }

  if (p.includes("/partidos")) {
    return {
      intro: "Estás viendo los partidos. Puedo traer el resultado, la estadística de un partido puntual o el historial de un equipo.",
      placeholder: "¿Qué partido querés que revise?",
      chips: [
        "¿Cómo le fue de local a un equipo en su último partido?",
        "¿Quién ganó más partidos como visitante?",
        "¿Cómo se reparten los goles de un partido entre ambos equipos?",
      ],
    };
  }

  if (p.includes("/prediccion")) {
    return {
      intro: "Estás en el predictor de partidos. Puedo traerte los números recientes de cada equipo para que los tengas en cuenta.",
      placeholder: "¿Qué querés saber antes de predecir?",
      chips: [
        "¿Cómo vienen de racha los dos equipos?",
        "¿Quién metió más goles en los últimos partidos?",
        "¿Qué tan confiable es esta predicción?",
      ],
    };
  }

  if (p.includes("/explorador")) {
    return {
      intro: "Estás en el explorador de datos. Puedo ayudarte a entender qué hay disponible y cómo leerlo.",
      placeholder: "¿Qué datos querés explorar?",
      chips: [
        "¿Qué tablas hay disponibles para consultar?",
        "¿Los datos de jugadores son por partido o por temporada?",
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
        "¿Por qué no hay estadística física ni por partido de cada jugador?",
        "¿Qué diferencia hay entre los datos de ESPN y los de FotMob?",
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
        <div className="chat-panel" role="dialog" aria-label="Asistente de Métricas LPF">
          <div className="chat-panel-header">
            <strong>Asistente · Métricas LPF</strong>
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
