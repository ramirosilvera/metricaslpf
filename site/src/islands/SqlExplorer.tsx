import { useEffect, useRef, useState } from "react";
// Bundleado localmente (no CDN externo): Vite copia estos assets al build
// y `?url` resuelve la URL final servida por el propio sitio. Evita
// depender en runtime de jsDelivr y es lo único verificable end-to-end en
// un entorno con salida de red restringida.
import duckdbWasmMvp from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbWorkerMvp from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbWasmEh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbWorkerEh from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

const PARQUET_TABLES: { table: string; file: string }[] = [
  { table: "matches", file: "matches.parquet" },
  { table: "team_match_stats_tactical", file: "team_match_stats_tactical.parquet" },
  { table: "player_match_appearances", file: "player_match_appearances.parquet" },
  { table: "physical_match_stats", file: "physical_match_stats.parquet" },
  { table: "physical_player_match_stats", file: "physical_player_match_stats.parquet" },
  { table: "squads", file: "squads.parquet" },
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
  const [loadedTables, setLoadedTables] = useState<string[]>([]);
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

        const loaded: string[] = [];
        const loadErrors: string[] = [];

        for (const { table, file } of PARQUET_TABLES) {
          try {
            const resp = await fetch(`${base}data-parquet/${file}`);
            if (!resp.ok) continue; // tabla todavia no publicada (ej. physical_match_stats antes del primer scrape)
            const buf = new Uint8Array(await resp.arrayBuffer());
            if (buf.length === 0) continue;
            await db.registerFileBuffer(file, buf);
            await conn.query(`CREATE VIEW ${table} AS SELECT * FROM parquet_scan('${file}')`);
            loaded.push(table);
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
        Tablas disponibles: {loadedTables.length ? loadedTables.join(", ") : "ninguna todavía"}. Corre 100% en tu
        navegador, sin backend — DuckDB-WASM lee los Parquet publicados en este sitio.
      </p>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={8}
        style={{
          width: "100%",
          fontFamily: "ui-monospace, monospace",
          fontSize: "0.85rem",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          background: "var(--surface-1)",
          color: "var(--text-primary)",
        }}
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
        <div style={{ overflowX: "auto" }}>
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
