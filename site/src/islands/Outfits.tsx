import { useEffect, useMemo, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { nombreColor } from "../lib/color";
import { CATALOGO_CON_HSL, presetAPrendaSintetica } from "../lib/catalogo";
import {
  armarOutfitsParaComprar,
  armarOutfitsSugeridos,
  diffPrendasEdicion,
  tanda,
  type OutfitParaComprar,
  type OutfitSugerido,
} from "../lib/recommend";
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

function leyenda(prendas: Prenda[]): string {
  return prendas.map((p) => `${p.categoria} ${nombreColor(p.color_h, p.color_s, p.color_l)}`).join(" + ");
}

/** Cuántas tarjetas se muestran a la vez en "Te recomendamos" / "Ideas para
 *  comprar" -- fijo a propósito: el pool real (armarOutfitsSugeridos /
 *  armarOutfitsParaComprar) puede tener muchas más variantes, pero mostrarlas
 *  todas satura la pantalla. El botón "otras opciones" rota por el pool
 *  (ver `tanda` en recommend.ts) en tandas de este tamaño, en vez de ir
 *  agregando tarjetas nuevas. */
const VISIBLES_POR_SECCION = 2;

export default function Outfits() {
  const [outfits, setOutfits] = useState<OutfitConPrendas[] | null>(null);
  const [placard, setPlacard] = useState<Prenda[] | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [error, setError] = useState("");
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<Record<string, string>>({});
  const [offsetSugeridos, setOffsetSugeridos] = useState(0);
  const [offsetParaComprar, setOffsetParaComprar] = useState(0);
  const [confirmandoBorradoId, setConfirmandoBorradoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [errorEliminar, setErrorEliminar] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<OutfitConPrendas | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [prendasEdicion, setPrendasEdicion] = useState<Set<string>>(new Set());
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState("");
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
        const [{ data: outfitRows, error: errOutfits }, { data: prendaRows, error: errPrendas }] = await Promise.all([
          supabase.from("outfits").select("id, nombre, outfit_prendas(prenda_id, created_at, prendas(*))").order("created_at", { ascending: false }),
          supabase.from("prendas").select("*"),
        ]);
        if (errOutfits) {
          setError(errOutfits.message);
          return;
        }
        if (errPrendas) {
          setError(errPrendas.message);
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
        setPlacard((prendaRows as Prenda[] | null) ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de conexión con Matiz.");
      }
    }
    cargar();
  }, []);

  // sets de ids de prendas de cada outfit YA guardado -- para no sugerir
  // como "recomendado" algo que el usuario ya guardó tal cual.
  const clavesGuardadas = useMemo(
    () => new Set((outfits ?? []).map((o) => o.prendas.map((p) => p.id).sort().join("-"))),
    [outfits],
  );

  const poolSugeridos: OutfitSugerido[] = useMemo(() => {
    if (!placard) return [];
    return armarOutfitsSugeridos(placard).filter((s) => !clavesGuardadas.has(s.id));
  }, [placard, clavesGuardadas]);

  const poolParaComprar: OutfitParaComprar[] = useMemo(() => {
    if (!placard) return [];
    return armarOutfitsParaComprar(placard, CATALOGO_CON_HSL);
  }, [placard]);

  const sugeridos = useMemo(
    () => tanda(poolSugeridos, offsetSugeridos, VISIBLES_POR_SECCION),
    [poolSugeridos, offsetSugeridos],
  );
  const paraComprar = useMemo(
    () => tanda(poolParaComprar, offsetParaComprar, VISIBLES_POR_SECCION),
    [poolParaComprar, offsetParaComprar],
  );

  async function guardarSugerido(sugerido: OutfitSugerido) {
    setGuardando(sugerido.id);
    setErrorGuardar((prev) => ({ ...prev, [sugerido.id]: "" }));
    let outfitCreado: { id: string } | null = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Iniciá sesión de nuevo para guardar el outfit.");

      const { data: outfit, error: outfitErr } = await supabase
        .from("outfits")
        .insert({ user_id: userId, nombre: null })
        .select()
        .single();
      if (outfitErr || !outfit) throw new Error(outfitErr?.message ?? "No se pudo crear el outfit.");
      outfitCreado = outfit;

      const filas = sugerido.prendas.map((p) => ({ outfit_id: outfit.id, prenda_id: p.id }));
      const { error: joinErr } = await supabase.from("outfit_prendas").insert(filas);
      if (joinErr) {
        await supabase.from("outfits").delete().eq("id", outfit.id);
        throw new Error(joinErr.message);
      }

      setGuardadas((prev) => new Set(prev).add(sugerido.id));
      setOutfits((prev) => [{ id: outfit.id, nombre: null, prendas: sugerido.prendas }, ...(prev ?? [])]);
    } catch (e) {
      setErrorGuardar((prev) => ({ ...prev, [sugerido.id]: e instanceof Error ? e.message : "No se pudo guardar." }));
    } finally {
      setGuardando(null);
    }
  }

  function cargarSugerencia(sugerida: OutfitParaComprar["sugerida"]) {
    try {
      sessionStorage.setItem(
        "matiz_prueba_prefill",
        JSON.stringify({ categoria: sugerida.categoria, colorHex: sugerida.colorHex, presetId: sugerida.id }),
      );
    } catch {
      // Storage bloqueado -- se navega igual, el form de prenda nueva
      // simplemente arranca en blanco en vez de precargado.
    }
    window.location.href = `${base}prenda/nueva/`;
  }

  async function eliminarOutfit(id: string) {
    setConfirmandoBorradoId(null);
    setEliminandoId(id);
    setErrorEliminar((prev) => ({ ...prev, [id]: "" }));
    try {
      const { error: err } = await supabase.from("outfits").delete().eq("id", id);
      if (err) throw new Error(err.message);
      setOutfits((prev) => (prev ?? []).filter((o) => o.id !== id));
    } catch (e) {
      setErrorEliminar((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : "No se pudo eliminar el outfit." }));
    } finally {
      setEliminandoId(null);
    }
  }

  function abrirEdicion(outfit: OutfitConPrendas) {
    setEditando(outfit);
    setNombreEdicion(outfit.nombre ?? "");
    setPrendasEdicion(new Set(outfit.prendas.map((p) => p.id)));
    setErrorEdicion("");
  }

  function togglePrendaEdicion(id: string) {
    setPrendasEdicion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function guardarEdicion() {
    if (!editando || prendasEdicion.size === 0) return;
    setGuardandoEdicion(true);
    setErrorEdicion("");
    try {
      const actuales = new Set(editando.prendas.map((p) => p.id));
      const { aAgregar, aQuitar } = diffPrendasEdicion(actuales, prendasEdicion);
      const nombreNuevo = nombreEdicion.trim() || null;

      // Orden agregar-antes-que-quitar: ver el comentario de
      // diffPrendasEdicion en recommend.ts para el motivo real (no es
      // estético) -- el trigger de la migración 0011 borra el outfit entero
      // si outfit_prendas queda en cero para él en algún punto intermedio.
      if (aAgregar.length > 0) {
        const filas = aAgregar.map((prenda_id) => ({ outfit_id: editando.id, prenda_id }));
        const { error: err } = await supabase.from("outfit_prendas").insert(filas);
        if (err) throw new Error(err.message);
      }
      if (aQuitar.length > 0) {
        const { error: err } = await supabase
          .from("outfit_prendas")
          .delete()
          .eq("outfit_id", editando.id)
          .in("prenda_id", aQuitar);
        if (err) throw new Error(err.message);
      }
      if (nombreNuevo !== editando.nombre) {
        const { error: err } = await supabase.from("outfits").update({ nombre: nombreNuevo }).eq("id", editando.id);
        if (err) throw new Error(err.message);
      }

      const prendasFinal = (placard ?? []).filter((p) => prendasEdicion.has(p.id));
      setOutfits((prev) =>
        (prev ?? []).map((o) => (o.id === editando.id ? { ...o, nombre: nombreNuevo, prendas: prendasFinal } : o)),
      );
      setEditando(null);
    } catch (e) {
      setErrorEdicion(e instanceof Error ? e.message : "No se pudieron guardar los cambios.");
    } finally {
      setGuardandoEdicion(false);
    }
  }

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

  if (outfits === null || placard === null) return <p style={{ color: "var(--text-muted)" }}>Cargando...</p>;

  const sinNada = outfits.length === 0 && sugeridos.length === 0 && paraComprar.length === 0;

  if (sinNada) {
    return (
      <div className="empty-state">
        <p>Todavía no guardaste ningún outfit.</p>
        <p style={{ fontSize: "0.9rem" }}>
          Para guardar uno: elegí una prenda de tu placard, mirá sus combinaciones, tocá las que te gusten y usá el
          botón <strong>"Guardar outfit"</strong> que aparece abajo. Cargá algún pantalón para que Matiz también te
          arme sugerencias solo.
        </p>
        <a className="btn btn-primary" href={base}>
          Ir al placard
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      {outfits.length > 0 && (
        <section>
          <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
            Tus outfits guardados
          </p>
          <div className="grid-prendas outfits-grid">
            {outfits.map((o) => (
              <div key={o.id} className="card outfit-card">
                <Maniqui prendas={o.prendas} />
                <div style={{ minWidth: 0, textAlign: "center" }}>
                  <strong style={{ textTransform: "capitalize" }}>
                    {o.nombre ?? o.prendas.map((p) => p.categoria).join(" + ")}
                  </strong>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                    {leyenda(o.prendas)}
                  </p>
                </div>
                {errorEliminar[o.id] && (
                  <p style={{ color: "var(--danger)", fontSize: "0.75rem", margin: 0 }}>{errorEliminar[o.id]}</p>
                )}
                <div style={{ display: "flex", gap: "0.4rem", width: "100%" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem", flex: 1 }}
                    onClick={() => abrirEdicion(o)}
                    disabled={eliminandoId === o.id}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem", flex: 1 }}
                    onClick={() => setConfirmandoBorradoId(o.id)}
                    disabled={eliminandoId === o.id}
                  >
                    {eliminandoId === o.id ? "…" : "🗑️ Eliminar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sugeridos.length > 0 && (
        <section>
          <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>
            Te recomendamos
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
            Armados solos con lo que ya tenés en tu placard.
          </p>
          <div className="grid-prendas outfits-grid">
            {sugeridos.map((s) => {
              const yaGuardado = guardadas.has(s.id);
              return (
                <div key={s.id} className="card outfit-card">
                  <Maniqui prendas={s.prendas} />
                  <div style={{ minWidth: 0, textAlign: "center" }}>
                    <strong style={{ textTransform: "capitalize" }}>{s.prendas.map((p) => p.categoria).join(" + ")}</strong>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                      {leyenda(s.prendas)}
                    </p>
                  </div>
                  {errorGuardar[s.id] && (
                    <p style={{ color: "var(--danger)", fontSize: "0.75rem", margin: 0 }}>{errorGuardar[s.id]}</p>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", width: "100%" }}
                    onClick={() => guardarSugerido(s)}
                    disabled={guardando === s.id || yaGuardado}
                  >
                    {yaGuardado ? "✓ Guardado" : guardando === s.id ? "Guardando..." : "Guardar outfit"}
                  </button>
                </div>
              );
            })}
          </div>
          {poolSugeridos.length > VISIBLES_POR_SECCION && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", marginTop: "0.6rem" }}
              onClick={() => setOffsetSugeridos((prev) => prev + VISIBLES_POR_SECCION)}
            >
              🔄 Ver otras opciones
            </button>
          )}
        </section>
      )}

      {paraComprar.length > 0 && (
        <section>
          <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>
            Ideas para comprar
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
            Combinan con lo que ya tenés. La prenda con el contorno punteado es la que todavía no tenés.
          </p>
          <div className="grid-prendas outfits-grid">
            {paraComprar.map((s) => (
              <div key={s.id} className="card outfit-card">
                <Maniqui prendas={[...s.prendasPropias, presetAPrendaSintetica(s.sugerida)]} />
                <div style={{ minWidth: 0, textAlign: "center" }}>
                  <strong style={{ textTransform: "capitalize" }}>{s.sugerida.nombre}</strong>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                    con {leyenda(s.prendasPropias)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", width: "100%" }}
                  onClick={() => cargarSugerencia(s.sugerida)}
                >
                  + Ya la compré, cargarla
                </button>
              </div>
            ))}
          </div>
          {poolParaComprar.length > VISIBLES_POR_SECCION && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", marginTop: "0.6rem" }}
              onClick={() => setOffsetParaComprar((prev) => prev + VISIBLES_POR_SECCION)}
            >
              🔄 Ver otras opciones
            </button>
          )}
        </section>
      )}

      {confirmandoBorradoId && (
        <div className="confirm-overlay" onClick={() => setConfirmandoBorradoId(null)}>
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>¿Eliminar este outfit? Las prendas siguen en tu placard -- solo se borra la combinación guardada. No se puede deshacer.</p>
            <div className="confirm-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmandoBorradoId(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => eliminarOutfit(confirmandoBorradoId)}>
                Eliminar outfit
              </button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <div className="confirm-overlay" onClick={() => !guardandoEdicion && setEditando(null)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            style={{ maxHeight: "80vh", overflowY: "auto", textAlign: "left" }}
            onClick={(e) => e.stopPropagation()}
          >
            <strong>Editar outfit</strong>
            <label className="field-label">
              <span>Nombre (opcional)</span>
              <input
                className="field"
                type="text"
                value={nombreEdicion}
                onChange={(e) => setNombreEdicion(e.target.value)}
                placeholder={editando.prendas.map((p) => p.categoria).join(" + ")}
              />
            </label>
            <div>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Prendas del outfit -- tildá o destildá para agregar o sacar.
              </p>
              {Array.from(new Set((placard ?? []).map((p) => p.categoria))).map((categoria) => {
                const prendasCategoria = (placard ?? []).filter((p) => p.categoria === categoria);
                return (
                  <div key={categoria} style={{ marginBottom: "0.7rem" }}>
                    <p style={{ margin: "0 0 0.3rem", fontSize: "0.8rem", textTransform: "capitalize", fontWeight: 600 }}>
                      {categoria}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {prendasCategoria.map((p) => (
                        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
                          <input type="checkbox" checked={prendasEdicion.has(p.id)} onChange={() => togglePrendaEdicion(p.id)} />
                          <span style={{ textTransform: "capitalize" }}>{nombreColor(p.color_h, p.color_s, p.color_l)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {prendasEdicion.size === 0 && (
              <p style={{ color: "var(--danger)", fontSize: "0.8rem", margin: 0 }}>Un outfit necesita al menos una prenda.</p>
            )}
            {errorEdicion && <p style={{ color: "var(--danger)", fontSize: "0.8rem", margin: 0 }}>{errorEdicion}</p>}
            <div className="confirm-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)} disabled={guardandoEdicion}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={guardarEdicion}
                disabled={guardandoEdicion || prendasEdicion.size === 0}
              >
                {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
