import { useEffect, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { CATALOGO_PRENDAS, type PresetPrenda } from "../lib/catalogo";
import { hexToHsl, nombreColor } from "../lib/color";
import { CATEGORIAS_COMPLEMENTARIAS, type Categoria, type Prenda } from "../lib/types";
import { recomendar } from "../lib/recommend";
import ConfigWarning from "./ConfigWarning";
import PrendaIcon from "./PrendaIcon";

const NIVEL_LABEL: Record<string, string> = {
  excelente: "Excelente",
  muy_bueno: "Muy bueno",
  con_cuidado: "Con cuidado",
};

const CATEGORIAS: Categoria[] = ["pantalon", "remera", "buzo", "sweater", "camisa", "calzado", "campera", "accesorio"];

export default function Probar() {
  const [placard, setPlacard] = useState<Prenda[] | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [error, setError] = useState("");
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [colorHex, setColorHex] = useState("#3366CC");
  const base = (import.meta.env.BASE_URL as string) || "/";

  useEffect(() => {
    if (!SUPABASE_CONFIGURADO) return;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session) {
          setSinSesion(true);
          return;
        }
        const { data: rows, error: err } = await supabase.from("prendas").select("*");
        if (err) {
          setError(err.message);
          return;
        }
        setPlacard((rows as Prenda[] | null) ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!SUPABASE_CONFIGURADO) return <ConfigWarning />;

  if (sinSesion) {
    return (
      <div className="empty-state">
        <p>Iniciá sesión para probar prendas contra tu placard.</p>
        <a className="btn btn-primary" href={`${base}login/`}>
          Entrar
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <p>No se pudo conectar con Matiz.</p>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{error}</p>
      </div>
    );
  }

  if (placard === null) return <p style={{ color: "var(--text-muted)" }}>Cargando tu placard...</p>;

  function elegirPreset(p: PresetPrenda) {
    setCategoria(p.categoria);
    setColorHex(p.colorHex);
  }

  function cargarAlPlacard() {
    if (!categoria) return;
    try {
      sessionStorage.setItem("matiz_prueba_prefill", JSON.stringify({ categoria, colorHex }));
    } catch {
      // Storage bloqueado (webview, modo privado estricto, etc.) -- se
      // navega igual, solo que sin precarga; nunca dejar el botón
      // "Me la compro" sin efecto visible.
    }
    window.location.href = `${base}prenda/nueva/`;
  }

  const hsl = categoria ? hexToHsl(colorHex) : null;
  const pruebaBase: Prenda | null =
    categoria && hsl
      ? {
          id: "__prueba__",
          user_id: "",
          categoria,
          color_hex: colorHex,
          color_h: hsl.h,
          color_s: hsl.s,
          color_l: hsl.l,
          textura: null,
          estilo: null,
          ocasion: null,
          estacion: null,
          foto_path: null,
          suela_contraste: false,
          created_at: "",
          updated_at: "",
        }
      : null;

  const candidatasPorCategoria = pruebaBase
    ? CATEGORIAS_COMPLEMENTARIAS[pruebaBase.categoria]
        .map((cat) => ({ categoria: cat, prendas: placard.filter((p) => p.categoria === cat) }))
        .filter((g) => g.prendas.length > 0)
    : [];

  // Veredicto: la pregunta real de esta pantalla es "¿me la compro?", no
  // "acá tenés una lista" -- se resume antes del detalle categoría por
  // categoría.
  const todasLasRecs = pruebaBase
    ? candidatasPorCategoria.flatMap(({ prendas }) => recomendar(pruebaBase, prendas, placard))
    : [];
  const buenas = todasLasRecs.filter((r) => r.score.nivel !== "con_cuidado").length;
  const veredicto =
    todasLasRecs.length === 0
      ? null
      : buenas === todasLasRecs.length
        ? { texto: `Combina bien con las ${todasLasRecs.length} prendas que tenés para compararla.`, tono: "ok" as const }
        : buenas === 0
          ? { texto: `Con las ${todasLasRecs.length} prendas comparadas, ninguna combina fácil -- revisá abajo.`, tono: "cuidado" as const }
          : { texto: `Combina bien con ${buenas} de ${todasLasRecs.length} prendas.`, tono: "ok" as const };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="card">
        <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>
          Probar antes de comprar
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
          Elegí categoría y color de lo que estás pensando comprar. No se guarda en tu placard hasta que vos quieras.
        </p>

        <div className="catalogo-grid" style={{ maxHeight: 220 }}>
          {CATALOGO_PRENDAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`catalogo-card${categoria === p.categoria && colorHex === p.colorHex ? " activo" : ""}`}
              onClick={() => elegirPreset(p)}
            >
              <span className="catalogo-icon">
                <PrendaIcon categoria={p.categoria} color={p.colorHex} />
              </span>
              <span className="catalogo-nombre">{p.nombre}</span>
            </button>
          ))}
        </div>

        <p style={{ margin: "0.75rem 0 0.4rem", fontSize: "0.85rem" }}>O elegí un color propio:</p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {CATEGORIAS.map((c) => (
            <button
              key={c}
              type="button"
              className={categoria === c ? "btn btn-primary" : "btn btn-secondary"}
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", textTransform: "capitalize" }}
              onClick={() => setCategoria(c)}
            >
              {c}
            </button>
          ))}
        </div>
        {categoria && (
          <div style={{ marginTop: "0.6rem" }}>
            <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} aria-label="Color a probar" />
          </div>
        )}
      </div>

      {pruebaBase && (
        <>
          <div className="vestidor-hero">
            <span className="vestidor-hero-icon">
              <PrendaIcon categoria={pruebaBase.categoria} color={pruebaBase.color_hex} />
            </span>
            <div style={{ flex: 1 }}>
              <strong style={{ textTransform: "capitalize" }}>
                {pruebaBase.categoria} · {nombreColor(pruebaBase.color_h, pruebaBase.color_s, pruebaBase.color_l)}
              </strong>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                {veredicto ? veredicto.texto : "Así combina con lo que ya tenés"}
              </p>
            </div>
            <button className="btn btn-primary" style={{ fontSize: "0.8rem", padding: "0.5rem 0.9rem" }} onClick={cargarAlPlacard}>
              Me la compro
            </button>
          </div>

          {candidatasPorCategoria.length === 0 ? (
            <div className="empty-state">
              <p>
                {placard.length === 0
                  ? "Todavía no cargaste nada en tu placard para comparar."
                  : "Todavía no tenés nada en tu placard que combine con esta categoría."}
              </p>
              <a className="btn btn-primary" href={`${base}prenda/nueva/`}>
                + Cargar prenda
              </a>
            </div>
          ) : (
            candidatasPorCategoria.map(({ categoria: cat, prendas }) => {
              const recs = recomendar(pruebaBase, prendas, placard);
              return (
                <section key={cat}>
                  <h3 style={{ textTransform: "capitalize", fontSize: "1rem" }}>{cat}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {recs.map(({ prenda, score, tecnicaRescate }) => (
                      <div key={prenda.id} className="card" style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        <span className="recomendacion-icon">
                          <PrendaIcon categoria={prenda.categoria} color={prenda.color_hex} />
                        </span>
                        <div style={{ flex: 1 }}>
                          <span style={{ display: "block", fontSize: "0.8rem", textTransform: "capitalize", marginBottom: "0.2rem" }}>
                            {prenda.categoria} · {nombreColor(prenda.color_h, prenda.color_s, prenda.color_l)}
                          </span>
                          <span className={`nivel-badge nivel-${score.nivel}`}>
                            {NIVEL_LABEL[score.nivel]}
                            {score.tag === "combinacion_audaz" && " · audaz"}
                            {score.tag === "tono_sobre_tono" && " · tono sobre tono"}
                          </span>
                          <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                            {score.explicacion}
                          </p>
                          {tecnicaRescate && <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>💡 {tecnicaRescate}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
