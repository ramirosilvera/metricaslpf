import { useEffect, useMemo, useState } from "react";
import { nombreColor } from "../lib/color";
import {
  analizarPlacard,
  contarPorCategoria,
  contarPorColor,
  contarPorEstilo,
  type ConteoCategoria,
  type ConteoColor,
  type ConteoEstilo,
} from "../lib/estadisticas";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import type { Prenda } from "../lib/types";
import ConfigWarning from "./ConfigWarning";

/** Fila de gráfico de barras horizontal, un solo hue (--accent, magnitud
 *  secuencial) -- no lleva leyenda porque es una única serie (color-formula.md:
 *  "a single series needs no legend box"). Valor en la punta de la barra. */
export function BarraMagnitud({ label, cantidad, max }: { label: string; cantidad: number; max: number }) {
  const pct = max > 0 ? (cantidad / max) * 100 : 0;
  return (
    <div className="barra-fila">
      <span className="barra-label">{label}</span>
      <div className="barra-pista">
        <div className="barra-relleno" style={{ width: `${pct}%` }} />
      </div>
      <span className="barra-valor">{cantidad}</span>
    </div>
  );
}

export function GraficoCategorias({ datos }: { datos: ConteoCategoria[] }) {
  const max = Math.max(1, ...datos.map((d) => d.cantidad));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {datos.map((d) => (
        <BarraMagnitud key={d.categoria} label={d.label} cantidad={d.cantidad} max={max} />
      ))}
    </div>
  );
}

export function GraficoEstilos({ datos }: { datos: ConteoEstilo[] }) {
  const max = Math.max(1, ...datos.map((d) => d.cantidad));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {datos.map((d) => (
        <BarraMagnitud key={d.estilo} label={d.label} cantidad={d.cantidad} max={max} />
      ))}
    </div>
  );
}

export function ChipsColores({ datos }: { datos: ConteoColor[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
      {datos.map((d) => (
        <span key={d.nombre} className="color-chip">
          <span className="color-chip-swatch" style={{ background: d.hex }} />
          {d.nombre} · {d.cantidad}
        </span>
      ))}
    </div>
  );
}

export default function Estadisticas() {
  const [placard, setPlacard] = useState<Prenda[] | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [error, setError] = useState("");
  const base = (import.meta.env.BASE_URL as string) || "/";

  useEffect(() => {
    if (!SUPABASE_CONFIGURADO) return;
    async function cargar() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setSinSesion(true);
          return;
        }
        const { data, error: err } = await supabase.from("prendas").select("*");
        if (err) {
          setError(err.message);
          return;
        }
        setPlacard((data as Prenda[] | null) ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de conexión con Mi ropa.");
      }
    }
    cargar();
  }, []);

  const porCategoria = useMemo(() => contarPorCategoria(placard ?? []), [placard]);
  const porEstilo = useMemo(() => contarPorEstilo(placard ?? []), [placard]);
  const porColor = useMemo(() => contarPorColor(placard ?? []), [placard]);
  const analisis = useMemo(() => analizarPlacard(placard ?? []), [placard]);

  if (!SUPABASE_CONFIGURADO) return <ConfigWarning />;

  if (sinSesion) {
    return (
      <div className="empty-state">
        <p>Iniciá sesión para ver las estadísticas de tu placard.</p>
        <a className="btn btn-primary" href={`${base}login/`}>
          Entrar
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <p>No se pudieron cargar las estadísticas.</p>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{error}</p>
      </div>
    );
  }

  if (placard === null) return <p style={{ color: "var(--text-muted)" }}>Cargando...</p>;

  if (placard.length === 0) {
    return (
      <div className="empty-state">
        <p>Todavía no cargaste ninguna prenda.</p>
        <p style={{ fontSize: "0.9rem" }}>Cargá tu placard para ver indicadores reales acá.</p>
        <a className="btn btn-primary" href={`${base}prenda/nueva/`}>
          Cargar una prenda
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="stat-tile">
          <span className="stat-tile-valor">{analisis.totalPrendas}</span>
          <span className="stat-tile-label">Prendas en total</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-valor">{analisis.variedadColores}</span>
          <span className="stat-tile-label">Colores distintos</span>
        </div>
      </div>

      <section>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Prendas por categoría</h2>
        <div className="card">
          <GraficoCategorias datos={porCategoria} />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Prendas por estilo</h2>
        <div className="card">
          <GraficoEstilos datos={porEstilo} />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Colores en tu placard</h2>
        <div className="card">
          <ChipsColores datos={porColor} />
        </div>
      </section>

      {(analisis.fortalezas.length > 0 || analisis.oportunidades.length > 0) && (
        <section>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Fortalezas y oportunidades de mejora</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {analisis.fortalezas.map((f, i) => (
              <p key={`f-${i}`} className="callout-ok" style={{ margin: 0 }}>
                ✓ {f}
              </p>
            ))}
            {analisis.oportunidades.map((o, i) => (
              <p key={`o-${i}`} className="callout-warn" style={{ margin: 0 }}>
                ⚠ {o}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
