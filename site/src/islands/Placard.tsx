import { useEffect, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { nombreColor } from "../lib/color";
import { ESTILO_LABEL } from "../lib/recommend";
import type { Estilo, Prenda } from "../lib/types";
import ConfigWarning from "./ConfigWarning";
import PrendaIcon from "./PrendaIcon";

const ESTILOS_FILTRO: Estilo[] = ["formal", "clasico", "urbano", "casual", "deportivo"];

export default function Placard() {
  const [prendas, setPrendas] = useState<Prenda[] | null>(null);
  const [sesion, setSesion] = useState<"cargando" | "sin_sesion" | "ok" | "error">("cargando");
  const [error, setError] = useState("");
  const [filtroEstilo, setFiltroEstilo] = useState<Estilo | null>(null);
  const base = (import.meta.env.BASE_URL as string) || "/";

  useEffect(() => {
    if (!SUPABASE_CONFIGURADO) return;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session) {
          setSesion("sin_sesion");
          return;
        }
        setSesion("ok");
        const { data: rows, error: err } = await supabase
          .from("prendas")
          .select("*")
          .order("created_at", { ascending: false });
        if (err) {
          setError(err.message);
          return;
        }
        setPrendas((rows as Prenda[] | null) ?? []);
      })
      .catch((e: Error) => {
        setSesion("error");
        setError(e.message);
      });
  }, []);

  if (!SUPABASE_CONFIGURADO) return <ConfigWarning />;

  if (sesion === "cargando") return <p style={{ color: "var(--text-muted)" }}>Cargando tu placard...</p>;

  if (sesion === "error") {
    return (
      <div className="empty-state">
        <p>No se pudo conectar con Matiz.</p>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{error}</p>
      </div>
    );
  }

  if (sesion === "sin_sesion") {
    return (
      <div className="empty-state">
        <p>Todavía no iniciaste sesión.</p>
        <a className="btn btn-primary" href={`${base}login/`}>
          Entrar
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <p>No se pudo cargar tu placard.</p>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{error}</p>
      </div>
    );
  }

  if (prendas === null) return <p style={{ color: "var(--text-muted)" }}>Cargando tu placard...</p>;

  if (prendas.length === 0) {
    return (
      <div className="empty-state">
        <p>Tu placard está vacío. Cargá tu primera prenda para arrancar.</p>
        <a className="btn btn-primary" href={`${base}prenda/nueva/`}>
          + Cargar prenda
        </a>
      </div>
    );
  }

  const visibles = filtroEstilo ? prendas.filter((p) => p.estilo === filtroEstilo) : prendas;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <a href={`${base}probar/`} className="card probar-banner">
        <span>👗</span>
        <div>
          <strong>¿Te vas a comprar algo?</strong>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Probá una prenda antes de comprarla, sin cargarla al placard.
          </p>
        </div>
      </a>

      {/* Pedido explícito: que la diferenciación por estilo (oficina/
          urbana/clásica/casual/deportiva) quede clara "en toda la app" --
          el placard es la pantalla más visitada (el guardarropa completo)
          y antes no tenía ni badge ni filtro. */}
      <div className="filtro-chips" role="group" aria-label="Filtrar tu placard por estilo">
        <button
          type="button"
          className={`chip${filtroEstilo === null ? " chip-activo" : ""}`}
          onClick={() => setFiltroEstilo(null)}
        >
          Todos
        </button>
        {ESTILOS_FILTRO.map((e) => (
          <button
            key={e}
            type="button"
            className={`chip${filtroEstilo === e ? " chip-activo" : ""}`}
            onClick={() => setFiltroEstilo((prev) => (prev === e ? null : e))}
          >
            {ESTILO_LABEL[e]}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          No tenés prendas con estilo "{filtroEstilo && ESTILO_LABEL[filtroEstilo]}" todavía.
        </p>
      ) : (
        <div className="grid-prendas">
          {visibles.map((p) => (
            <a key={p.id} href={`${base}combinar/?prenda=${p.id}`} className="card prenda-card">
              <span className="prenda-card-icon">
                <PrendaIcon
                  categoria={p.categoria}
                  color={p.color_hex}
                  suelaContraste={p.suela_contraste}
                  posicionAccesorio={p.posicion_accesorio}
                  requiereCuello={p.requiere_cuello}
                />
              </span>
              <strong style={{ fontSize: "0.85rem", textTransform: "capitalize" }}>{p.categoria}</strong>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {nombreColor(p.color_h, p.color_s, p.color_l)}
              </span>
              {p.estilo && <span className="registro-badge" style={{ marginTop: "0.3rem" }}>{ESTILO_LABEL[p.estilo]}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
