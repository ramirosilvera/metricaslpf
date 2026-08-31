import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Prenda } from "../lib/types";

export default function Placard() {
  const [prendas, setPrendas] = useState<Prenda[] | null>(null);
  const [sesion, setSesion] = useState<"cargando" | "sin_sesion" | "ok">("cargando");
  const base = (import.meta.env.BASE_URL as string) || "/";

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setSesion("sin_sesion");
        return;
      }
      setSesion("ok");
      const { data: rows } = await supabase
        .from("prendas")
        .select("*")
        .order("created_at", { ascending: false });
      setPrendas((rows as Prenda[] | null) ?? []);
    });
  }, []);

  if (sesion === "cargando") return null;

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

  if (prendas === null) return <p>Cargando tu placard...</p>;

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
