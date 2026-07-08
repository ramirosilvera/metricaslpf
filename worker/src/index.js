/**
 * Proxy serverless (Cloudflare Worker) para el asistente de IA del sitio.
 *
 * Por qué existe este Worker en vez de llamar a Gemini directo desde el
 * navegador: el sitio es 100% estático (GitHub Pages) y la clave de la API
 * de Gemini es paga (prepaga). Si esa clave viajara en el JS que se sirve al
 * navegador, cualquier visitante podría extraerla con "ver código fuente" y
 * gastar el prepago -- no hay forma de evitarlo en un sitio puramente
 * estático. Este Worker es la pieza mínima de backend que hace falta para
 * que la clave viva solo del lado del servidor (variable secreta de
 * Cloudflare, nunca en el bundle del sitio) sin dejar de ser gratis: el free
 * tier de Cloudflare Workers alcanza de sobra para el tráfico de un
 * proyecto como este.
 *
 * Seguridad en capas (ninguna es perfecta sola, juntas alcanzan para este caso):
 *   1. CORS restringido al origen real del sitio (ALLOWED_ORIGIN).
 *   2. Rate limit por IP usando Workers KV (si el binding RATE_LIMIT está
 *      configurado -- si no, esta capa se saltea sin romper el feature).
 *   3. Límite de longitud de mensaje/historial para acotar el costo por request.
 */

const SYSTEM_PROMPT = `Sos el asistente de "Métricas Mundial 2026" (metricasmundial2026), un
proyecto de análisis abierto y sin fines de lucro sobre el Mundial 2026, con foco en poner a
prueba (no confirmar) la hipótesis de que la Selección Argentina tiene una desventaja física
frente a otras selecciones.

Contexto real del proyecto que tenés que respetar siempre:
- Es un sitio 100% estático, datos abiertos versionados en GitHub, sin base de datos tradicional.
- Fuentes: StatsBomb Open Data (contexto táctico: posesión-proxy, pases, remates -- Mundiales 2018
  y 2022, semilla inicial con los partidos de Argentina) y FIFA Training Centre (métricas físicas
  reales por jugador: distancia, zonas de velocidad, sprints, velocidad punta -- Mundial 2026 en
  curso, cobertura parcial y creciente).
- Postura metodológica explícita: con 4 a 7 partidos por selección y por torneo, NO hay
  significancia estadística. El proyecto es descriptivo, no causal. La distancia recorrida sola NO
  mide "estado físico" -- los equipos que dominan el balón corren menos, no más, porque no
  persiguen. Por eso el sitio separa siempre "contexto táctico" de "resultado físico".
- Argentina llegó invicta a la fase de grupos del Mundial 2026 (Grupo J): 3-0 a Argelia, 2-0 a
  Austria, 3-1 a Jordania.

Reglas de respuesta:
1. Respondé siempre en español rioplatense, con tono cercano pero preciso, no grandilocuente.
2. NUNCA inventes un número específico (km recorridos, cantidad de sprints, edad de un jugador,
   etc.) que no tengas certeza que es real. Si te preguntan un dato puntual, explicá qué gráfico o
   página del sitio lo tiene (Selecciones, Comparar, Jugadores, Explorador SQL, Metodología) en vez
   de arriesgar un número.
3. Si te preguntan si "Argentina corre menos", no des un veredicto categórico -- explicá los sesgos
   (posesión, estado del marcador, tamaño de muestra) y remití a la sección de Metodología.
4. Sé breve (2-4 oraciones típicamente), como un buen asistente de producto, no un ensayo.
5. Si te preguntan algo totalmente ajeno al proyecto (no es de fútbol/datos/este sitio), respondé
   con amabilidad que estás para ayudar específicamente con Métricas Mundial 2026.`;

const MAX_MESSAGE_LENGTH = 600;
const MAX_HISTORY_TURNS = 6;
const DEFAULT_RATE_LIMIT_PER_HOUR = 15;

function corsHeaders(origin, allowedOrigin) {
  const allowed = origin === allowedOrigin ? origin : allowedOrigin;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

async function checkRateLimit(env, ip) {
  if (!env.RATE_LIMIT) return { ok: true }; // KV no configurado -- se saltea, no rompe el feature

  const limit = Number(env.RATE_LIMIT_PER_HOUR) || DEFAULT_RATE_LIMIT_PER_HOUR;
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const key = `rl:${ip}:${hourBucket}`;

  const current = Number((await env.RATE_LIMIT.get(key)) || "0");
  if (current >= limit) return { ok: false, limit };

  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 3700 });
  return { ok: true };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const headers = corsHeaders(origin, allowedOrigin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, headers);
    }

    const message = String(body?.message ?? "").slice(0, MAX_MESSAGE_LENGTH);
    if (!message.trim()) {
      return json({ error: "empty_message" }, 400, headers);
    }

    const history = Array.isArray(body?.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rl = await checkRateLimit(env, ip);
    if (!rl.ok) {
      return json(
        { error: "rate_limited", message: `Límite de ${rl.limit} mensajes por hora alcanzado. Probá de nuevo más tarde.` },
        429,
        headers,
      );
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "not_configured", message: "El asistente todavía no está configurado (falta GEMINI_API_KEY)." }, 503, headers);
    }

    const model = env.GEMINI_MODEL || "gemini-flash-latest";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

    const contents = [
      ...history.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: String(turn.text ?? "").slice(0, MAX_MESSAGE_LENGTH) }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    let geminiResponse;
    try {
      geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 512,
            // Los modelos "2.5" razonan puertas adentro antes de responder y
            // ese razonamiento cuenta contra maxOutputTokens -- sin esto, la
            // respuesta visible se cortaba a mitad de frase porque el
            // presupuesto se gastaba en el pensamiento interno, no en el texto.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });
    } catch (err) {
      return json({ error: "upstream_unreachable" }, 502, headers);
    }

    if (!geminiResponse.ok) {
      const status = geminiResponse.status === 429 ? 429 : 502;
      // Se loguea el detalle completo (visible en Cloudflare -> Workers -> Logs
      // en vivo) para poder diagnosticar sin exponer la clave en la respuesta al cliente.
      const errorBody = await geminiResponse.text();
      console.error("Gemini upstream error", geminiResponse.status, errorBody);
      let reason;
      try {
        reason = JSON.parse(errorBody)?.error?.status;
      } catch {
        /* cuerpo no era JSON */
      }
      return json({ error: "upstream_error", status: geminiResponse.status, reason }, status, headers);
    }

    const data = await geminiResponse.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ??
      "No pude generar una respuesta en este momento. Probá reformular la pregunta.";

    return json({ reply }, 200, headers);
  },
};
