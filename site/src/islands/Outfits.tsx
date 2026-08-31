import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Prenda } from "../lib/types";

interface OutfitConPrendas {
  id: string;
  nombre: string | null;
  prendas: Prenda[];
}

export default function Outfits() {
  const [outfits, setOutfits] = useState<OutfitConPrendas[] | null>(null);
  const base = (import.meta.env.BASE_URL as string) || "/";

  useEffect(() => {
    async function cargar() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setOutfits([]);
        return;
      }
      const { data: outfitRows } = await supabase.from("outfits").select("id, nombre").order("created_at", { ascending: false });
      const conPrendas: OutfitConPrendas[] = [];
      for (const o of outfitRows ?? []) {
        const { data: joinRows } = await supabase
          .from("outfit_prendas")
          .select("prenda_id")
          .eq("outfit_id", o.id);
        const ids = (joinRows ?? []).map((r) => r.prenda_id as string);
        const { data: prendas } = ids.length
          ? await supabase.from("prendas").select("*").in("id", ids)
          : { data: [] as Prenda[] };
        conPrendas.push({ id: o.id, nombre: o.nombre, prendas: (prendas as Prenda[] | null) ?? [] });
      }
      setOutfits(conPrendas);
    }
    cargar();
  }, []);

  if (outfits === null) return <p>Cargando...</p>;

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
