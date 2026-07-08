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
 * Function-calling: el asistente puede consultar datos reales en Supabase
 * (schema metricas_mundial) a través de un set fijo de funciones RPC
 * whitelisted -- Gemini NUNCA ejecuta SQL libre. El Worker usa la clave
 * "anon" de Supabase (pública, protegida por RLS de solo lectura), la misma
 * que usaría el propio navegador -- no la service_role key, que solo usa el
 * pipeline de ETL para escribir datos.
 *
 * Seguridad en capas (ninguna es perfecta sola, juntas alcanzan para este caso):
 *   1. CORS restringido al origen real del sitio (ALLOWED_ORIGIN).
 *   2. Rate limit por IP usando Workers KV (si el binding RATE_LIMIT está
 *      configurado -- si no, esta capa se saltea sin romper el feature).
 *   3. Límite de longitud de mensaje/historial para acotar el costo por request.
 *   4. Function-calling restringido a un whitelist fijo de RPCs de solo
 *      lectura (ver TOOLS/TOOL_RPC_MAP) -- nunca SQL arbitrario.
 */

const SYSTEM_PROMPT = `Sos el asistente de "Métricas Mundial 2026" (metricasmundial2026), un
proyecto de análisis abierto y sin fines de lucro sobre el Mundial 2026, con foco en poner a
prueba (no confirmar) la hipótesis de que la Selección Argentina tiene una desventaja física
frente a otras selecciones.

Contexto real del proyecto que tenés que respetar siempre:
- Es un sitio 100% estático, datos abiertos versionados en GitHub, con Supabase como base de
  datos canónica (schema metricas_mundial) para lo que necesita consultas en vivo.
- Fuentes: StatsBomb Open Data (contexto táctico 2018/2022: posesión-proxy, pases, remates,
  semilla inicial con los partidos de Argentina), FIFA Training Centre (métricas físicas Y
  tácticas reales por jugador del Mundial 2026 en curso: distancia, zonas de velocidad, sprints,
  velocidad punta, pases, presión, tackles, intercepciones -- cobertura parcial y creciente) y
  Transfermarkt (edad y valor de mercado del plantel actual).
- Postura metodológica explícita: con pocos partidos por selección y por torneo, NO hay
  significancia estadística. El proyecto es descriptivo, no causal. La distancia recorrida sola NO
  mide "estado físico" -- los equipos que dominan el balón corren menos, no más, porque no
  persiguen. Por eso el sitio separa siempre "contexto táctico" de "resultado físico".
- Argentina llegó invicta a la fase de grupos del Mundial 2026 (Grupo J): 3-0 a Argelia, 2-0 a
  Austria, 3-1 a Jordania.

Reglas de respuesta:
1. Respondé siempre en español rioplatense, con tono cercano pero preciso, no grandilocuente.
2. Si tenés herramientas disponibles y te preguntan un dato concreto (resumen de una selección,
   partidos jugados, ranking de jugadores o selecciones por una métrica física/táctica/de plantel),
   USALAS para responder con el número real -- no lo evites ni lo inventes. Si la herramienta no
   trae el dato pedido o falla, decilo explícitamente ("todavía no tengo ese dato cargado") y
   remití a la página correspondiente del sitio (Selecciones, Comparar, Jugadores, Explorador SQL).
3. NUNCA inventes un número específico que no venga de una herramienta o del contexto de arriba.
4. Si te preguntan si "Argentina corre menos", no des un veredicto categórico -- explicá los sesgos
   (posesión, estado del marcador, tamaño de muestra) y remití a la sección de Metodología.
5. Sé breve (2-4 oraciones típicamente), como un buen asistente de producto, no un ensayo.
6. Si te preguntan algo totalmente ajeno al proyecto (no es de fútbol/datos/este sitio), respondé
   con amabilidad que estás para ayudar específicamente con Métricas Mundial 2026.`;

const MAX_MESSAGE_LENGTH = 600;
const MAX_HISTORY_TURNS = 6;
const DEFAULT_RATE_LIMIT_PER_HOUR = 15;
const MAX_TOOL_ROUNDS = 3;
const SUPABASE_SCHEMA = "metricas_mundial";

// Whitelist fijo de funciones que el modelo puede invocar -- ninguna acepta
// SQL, todas son RPCs de Postgres con parámetros tipados y validados del
// lado del servidor (ver worker/README.md / migraciones de Supabase).
const TOOLS = [
  {
    function_declarations: [
      {
        name: "get_team_summary",
        description:
          "Resumen estadístico de una selección: partidos jugados, posesión promedio, precisión de pases, remates, distancia física promedio, alta intensidad, sprints, velocidad punta, edad promedio del plantel y valor de mercado total.",
        parameters: {
          type: "object",
          properties: { team: { type: "string", description: "Nombre de la selección en inglés, ej. 'Argentina', 'France', 'Brazil'." } },
          required: ["team"],
        },
      },
      {
        name: "get_team_matches",
        description: "Partidos jugados por una selección: competencia, temporada, fase, fecha y resultado.",
        parameters: {
          type: "object",
          properties: { team: { type: "string" } },
          required: ["team"],
        },
      },
      {
        name: "get_player_ranking",
        description: "Ranking de jugadores según una métrica física o de plantel.",
        parameters: {
          type: "object",
          properties: {
            metric: {
              type: "string",
              enum: ["minutos_jugados", "distancia_total_km", "distancia_promedio_km", "alta_intensidad_promedio_m", "sprints_promedio", "velocidad_punta_kmh", "edad", "valor_mercado_eur"],
            },
            limit: { type: "integer", description: "Cantidad de jugadores a devolver, por defecto 10." },
          },
          required: ["metric"],
        },
      },
      {
        name: "get_physical_leaders",
        description: "Ranking de SELECCIONES (no jugadores) según una métrica física agregada por equipo.",
        parameters: {
          type: "object",
          properties: {
            metric: { type: "string", enum: ["distancia_promedio_km", "sprints_promedio", "velocidad_punta_kmh", "alta_intensidad_promedio_m"] },
            limit: { type: "integer" },
          },
          required: ["metric"],
        },
      },
      {
        name: "get_tactical_leaders",
        description: "Ranking de jugadores según una métrica táctica del Mundial 2026 (pases, progresiones, tackles, intercepciones, presión, recuperaciones, goles).",
        parameters: {
          type: "object",
          properties: {
            metric: { type: "string", enum: ["pases_completados", "precision_pases", "progresiones", "tackles_ganados", "intercepciones", "presion_directa", "recuperaciones", "goles"] },
            limit: { type: "integer" },
          },
          required: ["metric"],
        },
      },
    ],
  },
];

const TOOL_RPC_MAP = {
  get_team_summary: (args) => ({ rpc: "get_team_summary", body: { p_team: String(args?.team ?? "") } }),
  get_team_matches: (args) => ({ rpc: "get_team_matches", body: { p_team: String(args?.team ?? "") } }),
  get_player_ranking: (args) => ({ rpc: "get_player_ranking", body: { p_metric: String(args?.metric ?? ""), p_limit: Math.min(Number(args?.limit) || 10, 25) } }),
  get_physical_leaders: (args) => ({ rpc: "get_physical_leaders", body: { p_metric: String(args?.metric ?? ""), p_limit: Math.min(Number(args?.limit) || 10, 25) } }),
  get_tactical_leaders: (args) => ({ rpc: "get_tactical_leaders", body: { p_metric: String(args?.metric ?? ""), p_limit: Math.min(Number(args?.limit) || 10, 25) } }),
};

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

async function callSupabaseRpc(env, toolName, args) {
  const mapper = TOOL_RPC_MAP[toolName];
  if (!mapper) return { error: `herramienta desconocida: ${toolName}` };
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { error: "Supabase no está configurado todavía" };

  const { rpc, body } = mapper(args);
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${rpc}`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        "Content-Profile": SUPABASE_SCHEMA,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error("Supabase RPC error", rpc, resp.status, detail);
      return { error: `no se pudo consultar ${rpc} (${resp.status})` };
    }
    return await resp.json();
  } catch (err) {
    console.error("Supabase RPC unreachable", rpc, String(err));
    return { error: `${rpc} no disponible en este momento` };
  }
}

async function callGemini(env, contents, tools) {
  const model = env.GEMINI_MODEL || "gemini-flash-latest";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const resp = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      ...(tools ? { tools } : {}),
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 512,
        // Los modelos "2.5" razonan puertas adentro antes de responder y ese
        // razonamiento cuenta contra maxOutputTokens -- sin esto, la
        // respuesta visible se cortaba a mitad de frase porque el
        // presupuesto se gastaba en el pensamiento interno, no en el texto.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!resp.ok) {
    const errorBody = await resp.text();
    console.error("Gemini upstream error", resp.status, errorBody);
    let reason;
    try {
      reason = JSON.parse(errorBody)?.error?.status;
    } catch {
      /* cuerpo no era JSON */
    }
    const err = new Error("upstream_error");
    err.status = resp.status === 429 ? 429 : 502;
    err.reason = reason;
    throw err;
  }

  return resp.json();
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

    // Sin Supabase configurado, se sigue respondiendo (texto grounded por el
    // system prompt) pero sin la capacidad de consultar datos reales.
    const tools = env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? TOOLS : undefined;

    const contents = [
      ...history.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: String(turn.text ?? "").slice(0, MAX_MESSAGE_LENGTH) }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    let data;
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        data = await callGemini(env, contents, tools);
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
        if (functionCalls.length === 0) break;

        contents.push({ role: "model", parts: parts });
        const responses = await Promise.all(
          functionCalls.map(async (call) => ({
            functionResponse: { name: call.name, response: await callSupabaseRpc(env, call.name, call.args) },
          })),
        );
        contents.push({ role: "function", parts: responses });
      }
    } catch (err) {
      if (err.status) return json({ error: "upstream_error", status: err.status, reason: err.reason }, err.status, headers);
      return json({ error: "upstream_unreachable" }, 502, headers);
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.filter((p) => p.text)
        .map((p) => p.text)
        .join("") || "No pude generar una respuesta en este momento. Probá reformular la pregunta.";

    return json({ reply }, 200, headers);
  },
};
