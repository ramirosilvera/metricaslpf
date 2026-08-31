import { useEffect, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import type { Prenda } from "../lib/types";
import ConfigWarning from "./ConfigWarning";

export default function Placard() {
  const [prendas, setPrendas] = useState<Prenda[] | null>(null);
  const [sesion, setSesion] = useState<"cargando" | "sin_sesion" | "ok" | "error">("cargando");
  const [error, setError] = useState("");
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

  return (
    <div className="grid-prendas">
      {prendas.map((p) => (
        <a
          key={p.id}
          href={`${base}combinar/?prenda=${p.id}`}
          className="card"
          style={{ textDecoration: "none", color: "var(--text)", display: "flex", flexDirection: "column", gap: "0.4rem" }}
        >
          <span className="swatch" style={{ background: p.color_hex }} />
          <strong style={{ fontSize: "0.85rem", textTransform: "capitalize" }}>{p.categoria}</strong>
        </a>
      ))}
    </div>
  );
}
