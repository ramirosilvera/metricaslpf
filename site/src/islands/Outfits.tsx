import { useEffect, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import type { Prenda } from "../lib/types";
import ConfigWarning from "./ConfigWarning";

interface OutfitConPrendas {
  id: string;
  nombre: string | null;
  prendas: Prenda[];
}

export default function Outfits() {
  const [outfits, setOutfits] = useState<OutfitConPrendas[] | null>(null);
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
        const { data: outfitRows, error: err } = await supabase
          .from("outfits")
          .select("id, nombre")
          .order("created_at", { ascending: false });
        if (err) {
          setError(err.message);
          return;
        }
        const conPrendas: OutfitConPrendas[] = [];
        for (const o of outfitRows ?? []) {
          const { data: joinRows } = await supabase.from("outfit_prendas").select("prenda_id").eq("outfit_id", o.id);
          const ids = (joinRows ?? []).map((r) => r.prenda_id as string);
          const { data: prendas } = ids.length
            ? await supabase.from("prendas").select("*").in("id", ids)
            : { data: [] as Prenda[] };
          conPrendas.push({ id: o.id, nombre: o.nombre, prendas: (prendas as Prenda[] | null) ?? [] });
        }
        setOutfits(conPrendas);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de conexión con Matiz.");
      }
    }
    cargar();
  }, []);

  if (!SUPABASE_CONFIGURADO) return <ConfigWarning />;

  if (sinSesion) {
    return (
      <div className="empty-state">
        <p>Iniciá sesión para ver tus outfits guardados.</p>
        <a className="btn btn-primary" href={`${base}login/`}>
          Entrar
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <p>No se pudieron cargar tus outfits.</p>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{error}</p>
      </div>
    );
  }

  if (outfits === null) return <p style={{ color: "var(--text-muted)" }}>Cargando...</p>;

  if (outfits.length === 0) {
    return (
      <div className="empty-state">
        <p>Todavía no guardaste ningún outfit.</p>
        <a className="btn btn-primary" href={base}>
          Ir al placard
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {outfits.map((o) => (
        <div key={o.id} className="card" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {o.prendas.map((p) => (
            <span key={p.id} className="swatch" style={{ background: p.color_hex }} />
          ))}
          <strong>{o.nombre ?? "Outfit sin nombre"}</strong>
        </div>
      ))}
    </div>
  );
}
