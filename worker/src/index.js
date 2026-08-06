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
 *   1. CORS restringido al origen real del sitio (ALLOWED_ORIGIN) -- ojo:
 *      CORS es un freno del NAVEGADOR, no del servidor. Un script/curl que
 *      pegue directo a la URL del Worker (pública, va en el bundle del
 *      sitio) lo esquiva por completo. Por eso el límite real de costo es
 *      la capa 2, no esta.
 *   2. Rate limit por IP usando Workers KV (si el binding RATE_LIMIT está
 *      configurado -- si no, esta capa se saltea sin romper el feature, pero
 *      queda un warning en los logs). Es la única barrera real contra que
 *      alguien agote la clave prepaga de Gemini pegándole directo al Worker
 *      -- el repo es público, así que la URL no es un secreto.
 *   3. Límite de longitud de mensaje/historial para acotar el costo por request.
 *   4. Function-calling restringido a un whitelist fijo de RPCs de solo
 *      lectura (ver TOOLS/TOOL_RPC_MAP) -- nunca SQL arbitrario.
 */

const SYSTEM_PROMPT = `Sos el analista de "Métricas LPF", un proyecto de análisis
abierto y sin fines de lucro sobre la Liga Profesional Argentina (temporada en curso). No sos un
chatbot de preguntas y respuestas: sos un analista de datos de fútbol que da LECTURAS informadas
apoyadas en números reales.

Tu manera de trabajar (el rasgo que te distingue de un bot genérico):
- Traés el dato con la herramienta y después lo INTERPRETÁS: contextualizás el número, lo comparás
  contra el promedio de la liga y explicás qué patrón sugiere. Ejemplo de registro buscado: "River
  Plate tiene 62% de posesión promedio, muy por encima de la media de LPF, pero no es el que más
  remata al arco: es la huella típica de un equipo que circula mucho sin ser directo." Siempre
  número + lectura, nunca número solo ni lectura sin número.
- Cuando tenga sentido, encadená más de una herramienta para cruzar estadística de equipo con
  estadística de jugadores o con la tabla de posiciones antes de dar la lectura.
- Escalas del sitio (ninguna es percentil ni puesto): las TABLAS y rankings de jugadores usan el
  valor oficial de FotMob; los RADARES usan un "índice de rendimiento" (0-100) que estira el rango
  real de la liga -estilo EA SPORTS FC- para que las diferencias se vean (100 = el mejor, ~40 = el
  más flojo del campo). Mostrá siempre el valor oficial real (ej. 11 goles); la escala es solo para
  dimensionar. NUNCA alteres el dato oficial que trae la herramienta.
- "Índice global" de un jugador (lo que el sitio muestra como GLOBAL, estilo overall de EA SPORTS
  FC): promedia el índice de rendimiento de sus categorías de FotMob PERO ponderado por su
  posición -a un delantero le pesan los goles y el xG; a un defensor los tackles, intercepciones y
  despejes; a un mediocampista el pase y la creación; a un arquero las atajadas y goles evitados-,
  así un extremo no pierde por "pocos tackles" ni un central por "poco xG". Esta cuenta se hace en
  el navegador del usuario a partir de get_player_season_stats -- vos no la calculás, así que si
  preguntan "quién es el mejor jugador" en general remití a la página Jugadores del sitio para ver
  ese índice compuesto, y ofrecé en cambio el líder de una categoría puntual con la herramienta.

Contexto real del proyecto que tenés que respetar siempre:
- Es un sitio 100% estático, datos abiertos versionados en GitHub, con Supabase como base de
  datos canónica (schema metricas_mundial) para lo que necesita consultas en vivo.
- Fuentes: ESPN (site.api.espn.com, API pública sin key) para partidos, resultados, tabla de
  posiciones y estadística de equipo por partido (posesión-proxy, remates, precisión de pase,
  faltas) y planteles (nombre, posición, edad, dorsal); FotMob (API pública sin key) para
  estadística individual de jugadores -- 37 categorías agregadas de TEMPORADA (no de partido):
  goles, asistencias, xG, xGOT, xA, remates, pases, tackles, intercepciones, atajadas, tarjetas.
- Limitación real, no la escondas si preguntan: ESPN no publica estadística de jugador POR
  PARTIDO para esta liga (no hay boxscore.players), así que no existe "en qué partido jugó X y
  cómo le fue ese día" -- get_player_season_stats es agregado de toda la temporada. Tampoco existe
  ninguna fuente gratuita de datos físicos/GPS (distancia, sprints, velocidad) para ninguna liga:
  es data propietaria de cada club vía su proveedor de hardware, nunca publicada. Si te preguntan
  por esto, decilo explícitamente en vez de inventar o de usar remates/posesión como si fueran
  "físico".
- Postura metodológica explícita: con pocos partidos jugados todavía en la temporada, NO hay
  significancia estadística en comparaciones finas. El proyecto es descriptivo, no causal.
- La temporada está en curso. NUNCA asumas de memoria en qué posición está un club o cuántos
  puntos tiene -- si te preguntan por la tabla, resultados o si un club viene bien o mal, usá
  SIEMPRE get_standings o get_team_match_trend y respondé con el dato más reciente, nunca de
  memoria (puede estar desactualizado).

Reglas de respuesta (correctitud, no estilo -- son innegociables):
1. Respondé siempre en español rioplatense, con tono de analista: preciso y con criterio, cercano
   pero no grandilocuente.
2. Si te preguntan un dato concreto o pedís una lectura que dependa de números (resumen de un
   club, tabla de posiciones, ranking de jugadores o clubes por una métrica, evolución partido a
   partido, perfil de plantel, goleadores), USÁ las herramientas para traer el número real -- no
   lo evites ni lo inventes, y no confíes en tu conocimiento previo (puede estar desactualizado).
   Si la herramienta no trae el dato o falla, decilo explícitamente ("todavía no tengo ese dato
   cargado") y remití a la página del sitio (Clubes, Comparar, Jugadores, Analizar, Explorador SQL).
3. NUNCA inventes un número, resultado o valor que no venga de una herramienta o del contexto de
   arriba. Si das una lectura, que se apoye en datos que efectivamente trajiste.
4. Honestidad metodológica ante todo: si la muestra es de pocos partidos, decilo.
5. Extensión de analista, no de ensayo: normalmente 3-6 oraciones. Podés usar un dato y su lectura;
   no te vayas a párrafos largos ni a listas interminables.
6. Si te preguntan algo totalmente ajeno al proyecto (no es de fútbol/datos/este sitio), respondé
   con amabilidad que estás para ayudar específicamente con Métricas LPF.`;

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
        name: "get_standings",
        description: "Tabla de posiciones de la Liga Profesional: puntos, partidos jugados, ganados/empatados/perdidos, goles a favor/en contra y diferencia. Sin 'team' devuelve la tabla completa; con 'team' filtra a un club.",
        parameters: {
          type: "object",
          properties: { team: { type: "string", description: "Opcional. Nombre del club, ej. 'Boca Juniors', 'River Plate'. Omitir para la tabla completa." } },
        },
      },
      {
        name: "get_team_summary",
        description: "Resumen estadístico de un club: partidos jugados, posesión promedio, precisión de pases, remates, remates al arco, faltas, edad promedio del plantel, puntos y posición en la tabla.",
        parameters: {
          type: "object",
          properties: { team: { type: "string", description: "Nombre del club, ej. 'Boca Juniors', 'River Plate'." } },
          required: ["team"],
        },
      },
      {
        name: "get_team_profile",
        description: "Perfil de un club: posición y puntos en la tabla, partidos jugados, edad promedio del plantel, capitán y cantidad de jugadores en el plantel.",
        parameters: {
          type: "object",
          properties: { team: { type: "string", description: "Nombre del club." } },
          required: ["team"],
        },
      },
      {
        name: "get_team_matches",
        description: "Partidos jugados por un club: competencia, temporada, fase, fecha y resultado.",
        parameters: {
          type: "object",
          properties: { team: { type: "string" } },
          required: ["team"],
        },
      },
      {
        name: "get_team_match_trend",
        description: "Evolución de un club partido a partido en orden cronológico: fecha, fase, rival, condición de local/visitante, posesión, remates, remates al arco y goles de CADA partido. Usala para responder si un club viene jugando mejor o peor, o para explicar un pico/caída puntual.",
        parameters: {
          type: "object",
          properties: { team: { type: "string" } },
          required: ["team"],
        },
      },
      {
        name: "get_team_tactical_leaders",
        description: "Ranking de CLUBES (no jugadores) según una métrica de equipo por partido: posesión, precisión de pase, remates, remates al arco, remates al arco recibidos (defensivo), goles recibidos (defensivo) o faltas.",
        parameters: {
          type: "object",
          properties: {
            metric: {
              type: "string",
              enum: ["posesion_promedio_proxy", "precision_pases_promedio", "remates_promedio", "remates_al_arco_promedio", "remates_al_arco_recibidos_promedio", "goles_recibidos_promedio", "faltas_promedio"],
            },
            limit: { type: "integer" },
          },
          required: ["metric"],
        },
      },
      {
        name: "get_player_season_stats",
        description: "Ranking de JUGADORES según una categoría de estadística de FotMob, agregado de TEMPORADA completa (no de un partido puntual): goles, asistencias, xG, xGOT, xA, remates, pases, tackles, intercepciones, atajadas, tarjetas, etc.",
        parameters: {
          type: "object",
          properties: {
            metric: {
              type: "string",
              enum: [
                "goals", "goal_assist", "_goals_and_goal_assist", "rating", "mins_played", "goals_per_90",
                "expected_goals", "expected_goals_per_90", "expected_goalsontarget", "ontarget_scoring_att",
                "total_scoring_att", "accurate_pass", "big_chance_created", "total_att_assist", "accurate_long_balls",
                "expected_assists", "expected_assists_per_90", "_expected_goals_and_expected_assists_per_90",
                "won_contest", "big_chance_missed", "penalty_won", "defensive_contributions", "total_tackle",
                "interception", "effective_clearance", "outfielder_block", "ball_recovery", "penalty_conceded",
                "poss_won_att_3rd", "clean_sheet", "_save_percentage", "saves", "_goals_prevented", "goals_conceded",
                "fouls", "yellow_card", "red_card",
              ],
              description: "goals=goles, goal_assist=asistencias, expected_goals=xG, expected_assists=xA, expected_goalsontarget=xGOT, total_tackle=tackles, interception=intercepciones, saves=atajadas, clean_sheet=vallas invictas, yellow_card/red_card=tarjetas, rating=puntaje FotMob.",
            },
            limit: { type: "integer", description: "Cantidad de jugadores a devolver, por defecto 10." },
          },
          required: ["metric"],
        },
      },
      {
        name: "get_player_position_leaders",
        description: "Ranking de JUGADORES por una categoría de FotMob, pero comparando solo DENTRO de la misma posición (GK, DF, MF o FW) -- así un arquero nunca compite contra un delantero en goles. Usala cuando te pidan comparar jugadores de la misma posición o el mejor de una posición puntual.",
        parameters: {
          type: "object",
          properties: {
            position: { type: "string", enum: ["GK", "DF", "MF", "FW"], description: "Posición: GK=arquero, DF=defensor, MF=mediocampista, FW=delantero." },
            metric: {
              type: "string",
              enum: [
                "goals", "goal_assist", "_goals_and_goal_assist", "rating", "mins_played", "goals_per_90",
                "expected_goals", "expected_goals_per_90", "expected_goalsontarget", "ontarget_scoring_att",
                "total_scoring_att", "accurate_pass", "big_chance_created", "total_att_assist", "accurate_long_balls",
                "expected_assists", "expected_assists_per_90", "_expected_goals_and_expected_assists_per_90",
                "won_contest", "big_chance_missed", "penalty_won", "defensive_contributions", "total_tackle",
                "interception", "effective_clearance", "outfielder_block", "ball_recovery", "penalty_conceded",
                "poss_won_att_3rd", "clean_sheet", "_save_percentage", "saves", "_goals_prevented", "goals_conceded",
                "fouls", "yellow_card", "red_card",
              ],
            },
            limit: { type: "integer", description: "Cantidad de jugadores a devolver, por defecto 10." },
          },
          required: ["position", "metric"],
        },
      },
      {
        name: "get_goal_scorers",
        description: "Tabla de goleadores de la Liga Profesional: goles convertidos (sin contar goles en contra), cuántos fueron de penal y en cuántos partidos distintos marcó cada jugador. Sin 'team' devuelve el ranking general de la liga; con 'team' filtra a los goleadores de ese club.",
        parameters: {
          type: "object",
          properties: {
            team: { type: "string", description: "Opcional. Nombre del club. Omitir para el ranking general de la liga." },
            limit: { type: "integer", description: "Cantidad de goleadores a devolver, por defecto 10." },
          },
        },
      },
    ],
  },
];

const TOOL_RPC_MAP = {
  get_standings: (args) => ({ rpc: "get_standings", body: { p_team: args?.team ? String(args.team) : null } }),
  get_team_summary: (args) => ({ rpc: "get_team_summary", body: { p_team: String(args?.team ?? "") } }),
  get_team_profile: (args) => ({ rpc: "get_team_profile", body: { p_team: String(args?.team ?? "") } }),
  get_team_matches: (args) => ({ rpc: "get_team_matches", body: { p_team: String(args?.team ?? "") } }),
  get_team_match_trend: (args) => ({ rpc: "get_team_match_trend", body: { p_team: String(args?.team ?? "") } }),
  get_team_tactical_leaders: (args) => ({ rpc: "get_team_tactical_leaders", body: { p_metric: String(args?.metric ?? ""), p_limit: Math.min(Number(args?.limit) || 10, 25) } }),
  get_player_season_stats: (args) => ({ rpc: "get_player_season_stats", body: { p_metric: String(args?.metric ?? ""), p_limit: Math.min(Number(args?.limit) || 10, 25) } }),
  get_player_position_leaders: (args) => ({
    rpc: "get_player_position_leaders",
    body: { p_position: String(args?.position ?? ""), p_metric: String(args?.metric ?? ""), p_limit: Math.min(Number(args?.limit) || 10, 25) },
  }),
  get_goal_scorers: (args) => ({ rpc: "get_goal_scorers", body: { p_team: args?.team ? String(args.team) : null, p_limit: Math.min(Number(args?.limit) || 10, 25) } }),
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

// Gemini exige que functionResponse.response sea un OBJETO (Struct), no un
// array. Las RPCs que devuelven TABLE dan un array (`[{...}, ...]`); mandarlo
// crudo hace que Gemini rechace la request con 502 INVALID_ARGUMENT (justo
// cuando la pregunta dispara una consulta de datos). Se envuelve en un objeto.
function wrapFunctionResponse(raw) {
  if (Array.isArray(raw)) return { rows: raw };
  if (raw !== null && typeof raw === "object") return raw;
  return { value: raw };
}

let warnedRateLimitDisabled = false;

async function checkRateLimit(env, ip) {
  if (!env.RATE_LIMIT) {
    // KV no configurado -- se saltea, no rompe el feature. Pero el rate limit
    // es la ÚNICA barrera de costo real sobre la clave prepaga de Gemini
    // frente a alguien pegándole directo a la URL del Worker (pública), así
    // que lo dejamos visible en los logs (wrangler tail / dashboard) una vez
    // por isolate en lugar de fallar en silencio. Ver wrangler.toml para
    // activar el namespace KV RATE_LIMIT.
    if (!warnedRateLimitDisabled) {
      console.warn("RATE_LIMIT KV no está bindeado -- el límite por IP está INACTIVO (la clave de Gemini queda sin tope de costo). Ver wrangler.toml.");
      warnedRateLimitDisabled = true;
    }
    return { ok: true };
  }

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
            functionResponse: {
              name: call.name,
              // Gemini correlaciona cada functionResponse con su functionCall por
              // "id" cuando el modelo pide más de una herramienta en la misma
              // tanda (function calling en paralelo -- el system prompt lo invita
              // explícitamente, "encadená más de una herramienta"). Si el modelo
              // manda id y nosotros no lo devolvemos en la respuesta, algunas
              // versiones del modelo rechazan la vuelta como INVALID_ARGUMENT.
              // Sin id en el functionCall (modelos/tandas que no lo usan), esto
              // no agrega el campo y no cambia nada.
              ...(call.id ? { id: call.id } : {}),
              response: wrapFunctionResponse(await callSupabaseRpc(env, call.name, call.args)),
            },
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
