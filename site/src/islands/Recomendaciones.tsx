import { useEffect, useMemo, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { CATEGORIAS_COMPLEMENTARIAS, type Prenda } from "../lib/types";
import { recomendar } from "../lib/recommend";
import ConfigWarning from "./ConfigWarning";

const NIVEL_LABEL: Record<string, string> = {
  excelente: "Excelente",
  muy_bueno: "Muy bueno",
  con_cuidado: "Con cuidado",
};

export default function Recomendaciones() {
  const [placard, setPlacard] = useState<Prenda[] | null>(null);
  const [base, setBase] = useState<Prenda | null>(null);
  const [modo, setModo] = useState<"rapido" | "explicame">("rapido");
  const [sinSesion, setSinSesion] = useState(false);
  const [error, setError] = useState("");
  const base_url = (import.meta.env.BASE_URL as string) || "/";

  const prendaId = useMemo(
    () => (SUPABASE_CONFIGURADO ? new URLSearchParams(window.location.search).get("prenda") : null),
    [],
  );

  useEffect(() => {
    if (!SUPABASE_CONFIGURADO) return;
    async function cargar() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setSinSesion(true);
          return;
        }
        const { data: rows, error: err } = await supabase.from("prendas").select("*");
        if (err) {
          setError(err.message);
          return;
        }
        const todas = (rows as Prenda[] | null) ?? [];
        setPlacard(todas);
        setBase(todas.find((p) => p.id === prendaId) ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de conexión con Matiz.");
      }
    }
    cargar();
  }, [prendaId]);

  if (!SUPABASE_CONFIGURADO) return <ConfigWarning />;

  if (sinSesion) {
    return (
      <div className="empty-state">
        <p>Iniciá sesión para ver tus combinaciones.</p>
        <a className="btn btn-primary" href={`${base_url}login/`}>
          Entrar
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <p>No se pudieron cargar las combinaciones.</p>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{error}</p>
      </div>
    );
  }

  if (placard === null) return <p style={{ color: "var(--text-muted)" }}>Cargando...</p>;

  if (!base) {
    return (
      <div className="empty-state">
        <p>No encontré esa prenda en tu placard.</p>
        <a className="btn btn-primary" href={`${base_url}`}>
          Volver al placard
        </a>
      </div>
    );
  }

  const categoriasCandidatas = CATEGORIAS_COMPLEMENTARIAS[base.categoria];
  const candidatasPorCategoria = categoriasCandidatas
    .map((cat) => ({
      categoria: cat,
      prendas: placard.filter((p) => p.categoria === cat),
    }))
    .filter((g) => g.prendas.length > 0);

  if (candidatasPorCategoria.length === 0) {
    const faltante = categoriasCandidatas[0];
    return (
      <div className="empty-state">
        <p>
          Todavía no tenés nada para combinar con tu {base.categoria}. Cargá una prenda de categoría{" "}
          <strong>{faltante}</strong> para ver las primeras combinaciones.
        </p>
        <a className="btn btn-primary" href={`${base_url}prenda/nueva/`}>
          + Cargar prenda
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span className="swatch" style={{ background: base.color_hex }} />
        <div>
          <strong style={{ textTransform: "capitalize" }}>{base.categoria}</strong>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>Combinaciones para esta prenda</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
          <button
            className={modo === "rapido" ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setModo("rapido")}
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
          >
            Rápido
          </button>
          <button
            className={modo === "explicame" ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setModo("explicame")}
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
          >
            Explicame
          </button>
        </div>
      </div>

      {candidatasPorCategoria.map(({ categoria, prendas }) => {
        const recs = recomendar(base, prendas, placard);
        const visibles = modo === "rapido" ? recs.slice(0, 1) : recs;
        return (
          <section key={categoria}>
            <h3 style={{ textTransform: "capitalize", fontSize: "1rem" }}>{categoria}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {visibles.map(({ prenda, score, tecnicaRescate }) => (
                <div key={prenda.id} className="card" style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  <span className="swatch" style={{ background: prenda.color_hex }} />
                  <div style={{ flex: 1 }}>
                    <span className={`nivel-badge nivel-${score.nivel}`}>
                      {NIVEL_LABEL[score.nivel]}
                      {score.tag === "combinacion_audaz" && " · audaz"}
                      {score.tag === "tono_sobre_tono" && " · tono sobre tono"}
                    </span>
                    {modo === "explicame" && (
                      <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        {score.explicacion}
                      </p>
                    )}
                    {tecnicaRescate && (
                      <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>💡 {tecnicaRescate}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
