import { useEffect, useRef, useState } from "react";
// Bundleado localmente (no CDN externo): Vite copia estos assets al build
// y `?url` resuelve la URL final servida por el propio sitio. Evita
// depender en runtime de jsDelivr y es lo único verificable end-to-end en
// un entorno con salida de red restringida.
import duckdbWasmMvp from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbWorkerMvp from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbWasmEh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbWorkerEh from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

// Espejo COMPLETO del warehouse publicado (ver etl/build_aggregates.py::
// _publish_parquet_for_explorer) -- listar acá sólo un subconjunto hacía que
// el explorador escondiera la tabla más grande y más citada del sitio
// (player_season_stats, 13.7k filas, la base de todo el rediseño de
// categorías de jugador) mientras anunciaba dos tablas con 0 filas
// (player_match_appearances, tactical_player_match_stats) como si tuvieran
// datos. physical_match_stats / physical_player_match_stats no están acá a
// propósito: NO existen para la Liga Profesional (no hay fuente gratuita de
// datos físicos/GPS, ver metodología) -- ni siquiera se publican como
// parquet vacío, así que no hay archivo que registrar.
const PARQUET_TABLES: { table: string; file: string }[] = [
  { table: "matches", file: "matches.parquet" },
  { table: "team_match_stats_tactical", file: "team_match_stats_tactical.parquet" },
  { table: "player_match_appearances", file: "player_match_appearances.parquet" },
  { table: "tactical_player_match_stats", file: "tactical_player_match_stats.parquet" },
  { table: "squads", file: "squads.parquet" },
  { table: "derived_team_metrics", file: "derived_team_metrics.parquet" },
  { table: "derived_team_style", file: "derived_team_style.parquet" },
  { table: "derived_player_metrics", file: "derived_player_metrics.parquet" },
  { table: "player_season_stats", file: "player_season_stats.parquet" },
  { table: "goal_events", file: "goal_events.parquet" },
  { table: "standings", file: "standings.parquet" },
  { table: "team_profile", file: "team_profile.parquet" },
];

const DEFAULT_QUERY = `select team, season, count(*) as partidos,
       round(avg(possession_share_proxy) * 100, 1) as posesion_promedio_pct
from team_match_stats_tactical t
join matches m using (match_id)
group by team, season
order by posesion_promedio_pct desc
limit 20;`;

type Status = "loading" | "ready" | "error";

export default function SqlExplorer() {
  const dbRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [loadedTables, setLoadedTables] = useState<{ table: string; rows: number }[]>([]);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [columns, setColumns] = useState<string[]>([]);
  const [result, setResult] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const base = import.meta.env.BASE_URL;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const duckdb = await import("@duckdb/duckdb-wasm");
        const MANUAL_BUNDLES: any = {
          mvp: { mainModule: duckdbWasmMvp, mainWorker: duckdbWorkerMvp },
          eh: { mainModule: duckdbWasmEh, mainWorker: duckdbWorkerEh },
        };
        const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

        const worker = new Worker(bundle.mainWorker!);
        const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
        const db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

        const conn = await db.connect();
        // DuckDB-WASM carga el soporte de Parquet como extensión autoloadable
        // (no viene estático en el bundle "eh"/"mvp") -- necesita poder pegarle
        // a extensions.duckdb.org una vez. Si tu red bloquea ese dominio, el
        // resto de esta función va a fallar con un error claro más abajo.
        try {
          await conn.query(`INSTALL parquet; LOAD parquet;`);
        } catch (extErr: any) {
          throw new Error(
            `No se pudo cargar la extensión Parquet de DuckDB (requiere acceso a extensions.duckdb.org): ${extErr?.message ?? extErr}`,
          );
        }

        const loaded: { table: string; rows: number }[] = [];
        const loadErrors: string[] = [];

        for (const { table, file } of PARQUET_TABLES) {
          try {
            const resp = await fetch(`${base}data-parquet/${file}`);
            if (!resp.ok) continue; // tabla todavia no publicada (esta fuente no corrió/no tiene datos todavía)
            const buf = new Uint8Array(await resp.arrayBuffer());
            if (buf.length === 0) continue;
            await db.registerFileBuffer(file, buf);
            await conn.query(`CREATE VIEW ${table} AS SELECT * FROM parquet_scan('${file}')`);
            // Un parquet válido con 0 filas igual pesa bytes (headers/footer del
            // formato) -- el chequeo de arriba no lo detecta. Sin este conteo,
            // una tabla vacía (ej. el boxscore por partido que ESPN nunca
            // publica para esta liga) aparecía en "Tablas disponibles" exactamente
            // igual que una con datos reales.
            const countRes = await conn.query(`SELECT count(*) AS n FROM ${table}`);
            const rows = Number(countRes.toArray()[0]?.toJSON()?.n ?? 0);
            loaded.push({ table, rows });
          } catch (tableErr: any) {
            loadErrors.push(`${table}: ${tableErr?.message ?? tableErr}`);
          }
        }

        if (cancelled) return;
        dbRef.current = db;
        connRef.current = conn;
        setLoadedTables(loaded);
        if (loaded.length === 0 && loadErrors.length > 0) {
          setError(`No se pudo registrar ninguna tabla:\n${loadErrors.join("\n")}`);
        }
        setStatus("ready");
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? String(err));
          setStatus("error");
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runQuery() {
    if (!connRef.current) return;
    setRunning(true);
    setError(null);
    try {
      const res = await connRef.current.query(query);
      const rows = res.toArray().map((r: any) => r.toJSON());
      setColumns(res.schema.fields.map((f: any) => f.name));
      setResult(rows.slice(0, 200));
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  }

  if (status === "loading") {
    return <p>Cargando motor SQL en el navegador (DuckDB-WASM)…</p>;
  }

  if (status === "error") {
    return (
      <div className="callout warning">
        <h3>No se pudo inicializar el explorador</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
        Tablas disponibles:{" "}
        {loadedTables.length ? (
          loadedTables.map((t, i) => (
            <span key={t.table}>
              {i > 0 && ", "}
              <code>{t.table}</code>{" "}
              {t.rows > 0 ? (
                `(${t.rows.toLocaleString("es-AR")} filas)`
              ) : (
                <span style={{ fontStyle: "italic" }}>(0 filas -- fuente sin ese dato para esta liga, ver /fuentes/)</span>
              )}
            </span>
          ))
        ) : (
          "ninguna todavía"
        )}
        . Corre 100% en tu navegador, sin backend — DuckDB-WASM lee los Parquet publicados en este sitio.
      </p>
      <textarea
        className="sql-editor"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={8}
        aria-label="Editor de consultas SQL"
      />
      <div style={{ margin: "0.75rem 0" }}>
        <button
          onClick={runQuery}
          disabled={running}
          style={{
            background: "var(--series-1)",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "0.5rem 1rem",
            fontSize: "0.9rem",
            minHeight: 44,
            cursor: "pointer",
          }}
        >
          {running ? "Ejecutando…" : "Ejecutar consulta"}
        </button>
      </div>
      {error && (
        <div className="callout warning">
          <p>{error}</p>
        </div>
      )}
      {result.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{String(row[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
