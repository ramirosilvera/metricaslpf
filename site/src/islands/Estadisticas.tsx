import { useEffect, useMemo, useState } from "react";
import { nombreColor } from "../lib/color";
import {
  analizarFoda,
  contarPorCategoria,
  contarPorColor,
  contarPorEstacion,
  contarPorEstilo,
  type AnalisisFoda,
  type ConteoCategoria,
  type ConteoColor,
  type ConteoEstacion,
  type ConteoEstilo,
} from "../lib/estadisticas";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import type { Prenda } from "../lib/types";
import ConfigWarning from "./ConfigWarning";

/** Fila de gráfico de barras horizontal. `color` es opcional -- sin él,
 *  un solo hue fijo (--accent, magnitud secuencial, sin leyenda: "a single
 *  series needs no legend box"). Con él (GraficoFoda, más abajo), cada
 *  fila es una categoría distinta (identidad, no magnitud) -- ahí el color
 *  SIEMPRE va acompañado del label de texto que ya trae el componente, así
 *  que la identidad nunca depende solo del color. Valor en la punta de la
 *  barra en los dos casos. */
export function BarraMagnitud({
  label,
  cantidad,
  max,
  color,
}: {
  label: string;
  cantidad: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? (cantidad / max) * 100 : 0;
  return (
    <div className="barra-fila">
      <span className="barra-label">{label}</span>
      <div className="barra-pista">
        <div className="barra-relleno" style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
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

/** Mismo componente que GraficoEstilos de arriba (misma forma de dato:
 *  label+cantidad), separado nomás porque la key es `estacion`, no
 *  `estilo` -- pedido explícito del usuario, revisando si la sección de
 *  Estadísticas necesitaba ajuste después de diferenciar los abrigos de
 *  entretiempo/invierno: contarPorEstacion ya existía (lo usa el filtro de
 *  Placard) pero nunca se había conectado acá. Solo cuenta prendas con
 *  `estacion` cargada -- un buzo (que a partir de esta ronda nunca la
 *  lleva, ver recommend.ts) no aparece en ningún conteo de acá, mismo
 *  criterio que ya documenta contarPorEstacion. */
export function GraficoEstaciones({ datos }: { datos: ConteoEstacion[] }) {
  const max = Math.max(1, ...datos.map((d) => d.cantidad));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {datos.map((d) => (
        <BarraMagnitud key={d.estacion} label={d.label} cantidad={d.cantidad} max={max} />
      ))}
    </div>
  );
}

type CuadranteFoda = "fortalezas" | "debilidades" | "oportunidades" | "amenazas";

// Colores dedicados de la matriz FODA (--foda-*, definidos en global.css),
// distintos de los --ok/--warn/--danger que ya usa el resto de la app para
// severidad de estado -- acá son identidad categórica (4 cuadrantes fijos,
// nunca reordenados), no una escala de gravedad. Paleta validada con el
// script de la skill de dataviz (validate_palette.js): las 4 pasan piso de
// lightness/croma, separación CVD y contraste contra el fondo -- el par
// oportunidades/debilidades queda en la banda 6-8 de ΔE para daltonismo
// (legal solo con encoding secundario), por eso cada barra y cada celda de
// la tabla SIEMPRE llevan el nombre del cuadrante como texto al lado del
// color, nunca color solo.
const FODA_LABEL: Record<CuadranteFoda, string> = {
  fortalezas: "Fortalezas",
  debilidades: "Debilidades",
  oportunidades: "Oportunidades",
  amenazas: "Amenazas",
};
const FODA_COLOR: Record<CuadranteFoda, string> = {
  fortalezas: "var(--foda-fortalezas)",
  debilidades: "var(--foda-debilidades)",
  oportunidades: "var(--foda-oportunidades)",
  amenazas: "var(--foda-amenazas)",
};
// Orden fijo, no por cantidad -- mismo criterio que GraficoEstaciones: es
// la matriz FODA estándar (positivo antes que negativo, interno antes que
// externo), un orden que se lee siempre igual pesa más que ordenar por
// magnitud acá.
const ORDEN_FODA: CuadranteFoda[] = ["fortalezas", "debilidades", "oportunidades", "amenazas"];

/** El "gráfico" de la matriz FODA -- un vistazo rápido de cuántos hallazgos
 *  hay en cada cuadrante, mismo componente de barra que el resto de la
 *  página (BarraMagnitud), coloreado por cuadrante. La lectura detallada
 *  (el texto de cada hallazgo) vive en TablaFoda, más abajo -- este gráfico
 *  es el resumen ejecutivo, no un reemplazo de la tabla. */
export function GraficoFoda({ analisis }: { analisis: AnalisisFoda }) {
  const datos = ORDEN_FODA.map((cuadrante) => ({ cuadrante, cantidad: analisis[cuadrante].length }));
  const max = Math.max(1, ...datos.map((d) => d.cantidad));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {datos.map((d) => (
        <BarraMagnitud
          key={d.cuadrante}
          label={FODA_LABEL[d.cuadrante]}
          cantidad={d.cantidad}
          max={max}
          color={FODA_COLOR[d.cuadrante]}
        />
      ))}
    </div>
  );
}

function CeldaFoda({ cuadrante, items }: { cuadrante: CuadranteFoda; items: string[] }) {
  const color = FODA_COLOR[cuadrante];
  return (
    <td className="foda-celda" style={{ borderLeft: `4px solid ${color}`, background: `color-mix(in srgb, ${color} 8%, var(--surface))` }}>
      <strong style={{ display: "block", marginBottom: "0.5rem", color }}>{FODA_LABEL[cuadrante]}</strong>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>Sin hallazgos en esta categoría por ahora.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {items.map((item, i) => (
            <li key={i} style={{ fontSize: "0.85rem" }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </td>
  );
}

/** La "tabla" de la matriz FODA -- formato ejecutivo clásico: filas
 *  interno/externo, columnas positivo/negativo, cruzando en los 4
 *  cuadrantes de la metodología (fortalezas = interno+positivo,
 *  debilidades = interno+negativo, oportunidades = externo+positivo,
 *  amenazas = externo+negativo). Ver analizarFoda en estadisticas.ts para
 *  qué alimenta cada cuadrante. */
export function TablaFoda({ analisis }: { analisis: AnalisisFoda }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="foda-tabla">
        <thead>
          <tr>
            <th></th>
            <th>Positivo</th>
            <th>Negativo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Interno</th>
            <CeldaFoda cuadrante="fortalezas" items={analisis.fortalezas} />
            <CeldaFoda cuadrante="debilidades" items={analisis.debilidades} />
          </tr>
          <tr>
            <th>Externo</th>
            <CeldaFoda cuadrante="oportunidades" items={analisis.oportunidades} />
            <CeldaFoda cuadrante="amenazas" items={analisis.amenazas} />
          </tr>
        </tbody>
      </table>
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
  const porEstacion = useMemo(() => contarPorEstacion(placard ?? []), [placard]);
  const porColor = useMemo(() => contarPorColor(placard ?? []), [placard]);
  const analisis = useMemo(() => analizarFoda(placard ?? []), [placard]);

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
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Prendas por estación</h2>
        <div className="card">
          <GraficoEstaciones datos={porEstacion} />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Colores en tu placard</h2>
        <div className="card">
          <ChipsColores datos={porColor} />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.25rem" }}>Diagnóstico FODA</h2>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Resumen ejecutivo: {analisis.fortalezas.length} fortaleza{analisis.fortalezas.length === 1 ? "" : "s"} y{" "}
          {analisis.debilidades.length} debilidad{analisis.debilidades.length === 1 ? "" : "es"} internas -- {analisis.oportunidades.length}{" "}
          oportunidad{analisis.oportunidades.length === 1 ? "" : "es"} y {analisis.amenazas.length} amenaza
          {analisis.amenazas.length === 1 ? "" : "s"} del catálogo/entorno.
        </p>
        <div className="card" style={{ marginBottom: "0.75rem" }}>
          <GraficoFoda analisis={analisis} />
        </div>
        <div className="card">
          <TablaFoda analisis={analisis} />
        </div>
      </section>
    </div>
  );
}
