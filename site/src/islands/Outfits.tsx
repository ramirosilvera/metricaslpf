import { useEffect, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { nombreColor } from "../lib/color";
import type { Prenda } from "../lib/types";
import ConfigWarning from "./ConfigWarning";
import Maniqui from "./Maniqui";

interface OutfitConPrendas {
  id: string;
  nombre: string | null;
  prendas: Prenda[];
}

/** Forma real de la fila que devuelve el select embebido -- supabase-js no
 *  puede inferir la cardinalidad prenda_id -> prendas sin tipos generados,
 *  así que se tipa a mano en vez de dejar que infiera `any[]`. */
interface OutfitRow {
  id: string;
  nombre: string | null;
  outfit_prendas: { prenda_id: string; created_at: string; prendas: Prenda | null }[] | null;
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
        // Un solo select embebido en vez de un loop secuencial (antes: 1 + 2N
        // round-trips para N outfits) -- Supabase resuelve el join server-side.
        const { data: outfitRows, error: err } = await supabase
          .from("outfits")
          .select("id, nombre, outfit_prendas(prenda_id, created_at, prendas(*))")
          .order("created_at", { ascending: false });
        if (err) {
          setError(err.message);
          return;
        }
        // supabase-js no puede inferir la cardinalidad del embed sin tipos
        // generados de la DB y lo tipa como any[]; se castea vía unknown
        // porque la forma real (a-uno) la conocemos por el schema (FK
        // outfit_prendas.prenda_id -> prendas.id).
        const conPrendas: OutfitConPrendas[] = ((outfitRows as unknown as OutfitRow[] | null) ?? []).map((o) => {
          // orden estable por el created_at de la fila de unión, no el
          // orden de retorno del join (no garantizado por Postgres).
          const filas = [...(o.outfit_prendas ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
          return {
            id: o.id,
            nombre: o.nombre,
            prendas: filas.map((f) => f.prendas).filter((p): p is Prenda => p !== null),
          };
        });
        // guarda de UI: un outfit puede quedar sin prendas si se borran (la
        // cascada de outfit_prendas vacía el array, pero el registro de
        // outfits en sí sobrevive) -- el trigger de la migración 0011 los
        // borra a nivel DB, esto es cinturón y tiradores para no mostrar una
        // card vacía si por lo que sea todavía no corrió.
        setOutfits(conPrendas.filter((o) => o.prendas.length > 0));
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
        <p style={{ fontSize: "0.9rem" }}>
          Para guardar uno: elegí una prenda de tu placard, mirá sus combinaciones, tocá las que te gusten y usá el
          botón <strong>"Guardar outfit"</strong> que aparece abajo.
        </p>
        <a className="btn btn-primary" href={base}>
          Ir al placard
        </a>
      </div>
    );
  }

  return (
    <div className="grid-prendas">
      {outfits.map((o) => (
        <div key={o.id} className="card outfit-card">
          <Maniqui prendas={o.prendas} />
          <div style={{ minWidth: 0, textAlign: "center" }}>
            <strong style={{ textTransform: "capitalize" }}>
              {o.nombre ?? o.prendas.map((p) => p.categoria).join(" + ")}
            </strong>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
              {o.prendas.map((p) => `${p.categoria} ${nombreColor(p.color_h, p.color_s, p.color_l)}`).join(" + ")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
