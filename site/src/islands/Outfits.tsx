import { useEffect, useMemo, useRef, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { nombreColor } from "../lib/color";
import { CATALOGO_CON_HSL, presetAPrendaSintetica } from "../lib/catalogo";
import { compartirOImagen, generarImagenOutfit } from "../lib/compartir";
import {
  advertenciasDeRegistro,
  armarOutfitsParaComprar,
  armarOutfitsSugeridos,
  diffPrendasEdicion,
  ESTILO_LABEL,
  registroOutfit,
  tanda,
  type OutfitParaComprar,
  type OutfitSugerido,
} from "../lib/recommend";
import { CATEGORIA_LABEL, type Estilo, type Prenda } from "../lib/types";
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
  return prendas.map((p) => `${CATEGORIA_LABEL[p.categoria]} ${nombreColor(p.color_h, p.color_s, p.color_l)}`).join(" + ");
}

/** Pedido explícito del usuario: que la app diga a qué registro (Formal,
 *  Clásico, Urbano, Casual...) corresponde el outfit, no solo que evite
 *  combinaciones raras en silencio. Sin pantalón con `estilo` cargado en
 *  el outfit no hay de dónde sacar el registro -- no se muestra nada en
 *  vez de inventar un valor. */
function RegistroBadge({ prendas }: { prendas: Prenda[] }) {
  const registro = registroOutfit(prendas);
  if (!registro) return null;
  const avisos = advertenciasDeRegistro(prendas);
  return (
    <div style={{ margin: "0.3rem 0 0" }}>
      <span className="registro-badge">{registro}</span>
      {avisos.length > 0 && (
        <p style={{ margin: "0.3rem 0 0", fontSize: "0.7rem", color: "var(--text-muted)" }}>
          ⚠ {avisos.join(", ")} -- combina en color, pero se nota el salto de registro.
        </p>
      )}
    </div>
  );
}

/** Cuántas tarjetas se muestran a la vez en "Ideas para comprar" -- fijo a
 *  propósito: el pool real (armarOutfitsParaComprar) puede tener muchas más
 *  variantes, pero mostrarlas todas satura la pantalla. El botón "otras
 *  opciones" rota por el pool (ver `tanda` en recommend.ts) en tandas de
 *  este tamaño, en vez de ir agregando tarjetas nuevas. */
const VISIBLES_POR_SECCION = 2;

/** Pedido explícito del usuario: "que me dé 3 opciones" al elegir una
 *  ocasión en "Vestite hoy" -- constante propia (no VISIBLES_POR_SECCION)
 *  porque es un número distinto, no una coincidencia. */
const VISIBLES_SUGERIDOS = 3;

const ESTILOS_FILTRO: Estilo[] = ["formal", "clasico", "urbano", "casual", "deportivo"];

/** Parte interactiva de la pantalla de Outfits -- separada del fetch a
 *  Supabase (igual que Contenido en Placard.tsx) para poder montarla y
 *  probarla con datos de prueba reales, sin necesitar una sesión real. El
 *  default export de abajo es el único que sabe de Supabase para la carga
 *  inicial; esto recibe `outfitsIniciales`/`placard` ya cargados y
 *  mantiene su propia copia de `outfits` porque guardar/editar/eliminar
 *  mutan la lista localmente sin recargar todo. */
export function Contenido({
  outfitsIniciales,
  placard,
  base,
}: {
  outfitsIniciales: OutfitConPrendas[];
  placard: Prenda[];
  base: string;
}) {
  const [outfits, setOutfits] = useState<OutfitConPrendas[]>(outfitsIniciales);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<Record<string, string>>({});
  const [offsetSugeridos, setOffsetSugeridos] = useState(0);
  const [offsetParaComprar, setOffsetParaComprar] = useState(0);
  const [confirmandoBorradoId, setConfirmandoBorradoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [errorEliminar, setErrorEliminar] = useState<Record<string, string>>({});
  const [filtroEstilo, setFiltroEstilo] = useState<Estilo | null>(null);
  // Pedido explícito del usuario: "entro a la sección y le digo hoy me
  // necesito vestir formal" -- null significa "todavía no eligió", nunca un
  // estilo por defecto (ver elegirEstiloSugerido más abajo: no se muestra
  // NINGUNA sugerencia hasta que el usuario elija una ocasión a propósito).
  const [estiloSugerido, setEstiloSugerido] = useState<Estilo | "todos" | null>(null);
  const [editando, setEditando] = useState<OutfitConPrendas | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [prendasEdicion, setPrendasEdicion] = useState<Set<string>>(new Set());
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState("");
  const [compartiendoId, setCompartiendoId] = useState<string | null>(null);
  const [errorCompartir, setErrorCompartir] = useState<Record<string, string>>({});
  // un <div> por outfit guardado, para poder tomar su <svg> ya renderizado
  // (el maniquí) al momento de compartir -- ver compartirOutfit() más abajo.
  const maniquiRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // sets de ids de prendas de cada outfit YA guardado -- para no sugerir
  // como "recomendado" algo que el usuario ya guardó tal cual.
  const clavesGuardadas = useMemo(
    () => new Set(outfits.map((o) => o.prendas.map((p) => p.id).sort().join("-"))),
    [outfits],
  );

  // Pedido explícito: diferenciar/filtrar por estilo también en los
  // outfits guardados, no solo en el catálogo. registroOutfit ya calcula
  // el registro del outfit (a partir del estilo del pantalón) para
  // RegistroBadge -- se reusa acá para filtrar en vez de duplicar la
  // lógica de "cuál es el estilo de este outfit".
  const outfitsFiltrados = useMemo(
    () => (filtroEstilo ? outfits.filter((o) => registroOutfit(o.prendas) === ESTILO_LABEL[filtroEstilo]) : outfits),
    [outfits, filtroEstilo],
  );

  const poolSugeridos: OutfitSugerido[] = useMemo(
    () => armarOutfitsSugeridos(placard).filter((s) => !clavesGuardadas.has(s.id)),
    [placard, clavesGuardadas],
  );

  const poolParaComprar: OutfitParaComprar[] = useMemo(
    () => armarOutfitsParaComprar(placard, CATALOGO_CON_HSL),
    [placard],
  );

  // Pool de "Vestite hoy" acotado a la ocasión elegida -- null (nada
  // elegido todavía) da un pool vacío a propósito, para no mostrar ninguna
  // tarjeta hasta que el usuario elija. "todos" es una elección explícita
  // más (no un valor por defecto silencioso): el usuario la tocó a
  // propósito, igual que cualquier otro chip.
  const poolSugeridosPorEstilo = useMemo(() => {
    if (estiloSugerido === null) return [];
    if (estiloSugerido === "todos") return poolSugeridos;
    return poolSugeridos.filter((s) => registroOutfit(s.prendas) === ESTILO_LABEL[estiloSugerido]);
  }, [poolSugeridos, estiloSugerido]);

  function elegirEstiloSugerido(valor: Estilo | "todos") {
    setEstiloSugerido((prev) => (prev === valor ? null : valor));
    setOffsetSugeridos(0);
  }

  const sugeridos = useMemo(
    () => tanda(poolSugeridosPorEstilo, offsetSugeridos, VISIBLES_SUGERIDOS),
    [poolSugeridosPorEstilo, offsetSugeridos],
  );
  const paraComprar = useMemo(
    () => tanda(poolParaComprar, offsetParaComprar, VISIBLES_POR_SECCION),
    [poolParaComprar, offsetParaComprar],
  );

  async function guardarSugerido(sugerido: OutfitSugerido) {
    setGuardando(sugerido.id);
    setErrorGuardar((prev) => ({ ...prev, [sugerido.id]: "" }));
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

      const filas = sugerido.prendas.map((p) => ({ outfit_id: outfit.id, prenda_id: p.id }));
      const { error: joinErr } = await supabase.from("outfit_prendas").insert(filas);
      if (joinErr) {
        await supabase.from("outfits").delete().eq("id", outfit.id);
        throw new Error(joinErr.message);
      }

      setGuardadas((prev) => new Set(prev).add(sugerido.id));
      setOutfits((prev) => [{ id: outfit.id, nombre: null, prendas: sugerido.prendas }, ...prev]);
    } catch (e) {
      setErrorGuardar((prev) => ({ ...prev, [sugerido.id]: e instanceof Error ? e.message : "No se pudo guardar." }));
    } finally {
      setGuardando(null);
    }
  }

  function cargarSugerencia(sugerida: OutfitParaComprar["sugerida"]) {
    try {
      sessionStorage.setItem(
        "mi_ropa_prueba_prefill",
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
      setOutfits((prev) => prev.filter((o) => o.id !== id));
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

  /** Pedido explícito del usuario: compartir un outfit guardado como
   *  imagen, "visual, claro, que se entienda qué se está compartiendo",
   *  por WhatsApp. Arma el PNG a partir del maniquí YA renderizado en la
   *  tarjeta (mismo mecanismo que procesarFoto() ya usa para fotos, ver
   *  compartir.ts) y del mismo texto que la tarjeta ya le muestra al
   *  usuario (título + leyenda + registro) -- lo que se comparte coincide
   *  con lo que se ve en la app, no es un resumen aparte. */
  async function compartirOutfit(o: OutfitConPrendas) {
    const contenedor = maniquiRefs.current[o.id];
    const svg = contenedor?.querySelector("svg");
    if (!svg) return;

    setCompartiendoId(o.id);
    setErrorCompartir((prev) => ({ ...prev, [o.id]: "" }));
    try {
      const titulo = o.nombre ?? o.prendas.map((p) => CATEGORIA_LABEL[p.categoria]).join(" + ");
      const blob = await generarImagenOutfit(svg, {
        titulo,
        leyenda: leyenda(o.prendas),
        registro: registroOutfit(o.prendas),
      });
      await compartirOImagen(blob, `mi-ropa-${o.id}.png`, titulo);
    } catch (e) {
      setErrorCompartir((prev) => ({ ...prev, [o.id]: e instanceof Error ? e.message : "No se pudo generar la imagen." }));
    } finally {
      setCompartiendoId(null);
    }
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

      const prendasFinal = placard.filter((p) => prendasEdicion.has(p.id));
      setOutfits((prev) =>
        prev.map((o) => (o.id === editando.id ? { ...o, nombre: nombreNuevo, prendas: prendasFinal } : o)),
      );
      setEditando(null);
    } catch (e) {
      setErrorEdicion(e instanceof Error ? e.message : "No se pudieron guardar los cambios.");
    } finally {
      setGuardandoEdicion(false);
    }
  }

  // Los pools completos (no las tandas visibles, que dependen de qué
  // ocasión esté elegida ahora) -- si no, elegir una ocasión sin
  // combinaciones dejaría este chequeo en falso positivo y escondería los
  // outfits guardados o "ideas para comprar" que sí existen.
  const sinNada = outfits.length === 0 && poolSugeridos.length === 0 && poolParaComprar.length === 0;

  if (sinNada) {
    return (
      <div className="empty-state">
        <p>Todavía no guardaste ningún outfit.</p>
        <p style={{ fontSize: "0.9rem" }}>
          Para guardar uno: elegí una prenda de tu placard, mirá sus combinaciones, tocá las que te gusten y usá el
          botón <strong>"Guardar outfit"</strong> que aparece abajo. Cargá algún pantalón para que Mi ropa también te
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
      <section>
        <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>
          Vestite hoy
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
          Elegí para qué ocasión te querés vestir y te armamos {VISIBLES_SUGERIDOS} opciones con lo que ya tenés --
          nunca se quedan fijas, "otras opciones" siempre te da combinaciones distintas.
        </p>
        <div className="filtro-chips" role="group" aria-label="Elegí la ocasión de hoy">
          <button
            type="button"
            className={`chip${estiloSugerido === "todos" ? " chip-activo" : ""}`}
            onClick={() => elegirEstiloSugerido("todos")}
          >
            Todos
          </button>
          {ESTILOS_FILTRO.map((e) => (
            <button
              key={e}
              type="button"
              className={`chip${estiloSugerido === e ? " chip-activo" : ""}`}
              onClick={() => elegirEstiloSugerido(e)}
            >
              {ESTILO_LABEL[e]}
            </button>
          ))}
        </div>

        {estiloSugerido === null ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Elegí una ocasión de arriba para ver tus opciones.
          </p>
        ) : poolSugeridosPorEstilo.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            {estiloSugerido === "todos"
              ? "Todavía no armamos ninguna combinación con lo que tenés cargado -- cargá algún pantalón, bermuda o short: es la prenda ancla que arma el resto del outfit."
              : `No armamos ningún look ${ESTILO_LABEL[estiloSugerido]} todavía con lo que tenés cargado. Mirá "Ideas para comprar" más abajo, o probá otra ocasión.`}
          </p>
        ) : (
          <>
            <div className="grid-prendas outfits-grid">
              {sugeridos.map((s) => {
                const yaGuardado = guardadas.has(s.id);
                return (
                  <div key={s.id} className="card outfit-card">
                    <Maniqui prendas={s.prendas} />
                    <div style={{ minWidth: 0, textAlign: "center" }}>
                      <strong style={{ textTransform: "capitalize" }}>{s.prendas.map((p) => CATEGORIA_LABEL[p.categoria]).join(" + ")}</strong>
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                        {leyenda(s.prendas)}
                      </p>
                      <RegistroBadge prendas={s.prendas} />
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
            {poolSugeridosPorEstilo.length > VISIBLES_SUGERIDOS && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", marginTop: "0.6rem" }}
                onClick={() => setOffsetSugeridos((prev) => prev + VISIBLES_SUGERIDOS)}
              >
                🔄 Otras opciones
              </button>
            )}
          </>
        )}
      </section>

      {outfits.length > 0 && (
        <section>
          <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
            Tus outfits guardados
          </p>
          <div className="filtro-chips" role="group" aria-label="Filtrar outfits guardados por estilo">
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
          {outfitsFiltrados.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No tenés outfits guardados con estilo "{filtroEstilo && ESTILO_LABEL[filtroEstilo]}" todavía.
            </p>
          ) : (
          <div className="grid-prendas outfits-grid">
            {outfitsFiltrados.map((o) => (
              <div key={o.id} className="card outfit-card">
                <div ref={(el) => { maniquiRefs.current[o.id] = el; }}>
                  <Maniqui prendas={o.prendas} />
                </div>
                <div style={{ minWidth: 0, textAlign: "center" }}>
                  <strong style={{ textTransform: "capitalize" }}>
                    {o.nombre ?? o.prendas.map((p) => CATEGORIA_LABEL[p.categoria]).join(" + ")}
                  </strong>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                    {leyenda(o.prendas)}
                  </p>
                  <RegistroBadge prendas={o.prendas} />
                </div>
                {errorEliminar[o.id] && (
                  <p style={{ color: "var(--danger)", fontSize: "0.75rem", margin: 0 }}>{errorEliminar[o.id]}</p>
                )}
                {errorCompartir[o.id] && (
                  <p style={{ color: "var(--danger)", fontSize: "0.75rem", margin: 0 }}>{errorCompartir[o.id]}</p>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem", width: "100%" }}
                  onClick={() => compartirOutfit(o)}
                  disabled={compartiendoId === o.id}
                >
                  {compartiendoId === o.id ? "Armando la imagen…" : "📤 Compartir"}
                </button>
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
            {paraComprar.map((s) => {
              const prendasOutfit = [...s.prendasPropias, presetAPrendaSintetica(s.sugerida)];
              return (
              <div key={s.id} className="card outfit-card">
                <Maniqui prendas={prendasOutfit} />
                <div style={{ minWidth: 0, textAlign: "center" }}>
                  <strong style={{ textTransform: "capitalize" }}>{s.sugerida.nombre}</strong>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                    con {leyenda(s.prendasPropias)}
                  </p>
                  <RegistroBadge prendas={prendasOutfit} />
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
              );
            })}
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
                placeholder={editando.prendas.map((p) => CATEGORIA_LABEL[p.categoria]).join(" + ")}
              />
            </label>
            <div>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Prendas del outfit -- tildá o destildá para agregar o sacar.
              </p>
              {Array.from(new Set(placard.map((p) => p.categoria))).map((categoria) => {
                const prendasCategoria = placard.filter((p) => p.categoria === categoria);
                return (
                  <div key={categoria} style={{ marginBottom: "0.7rem" }}>
                    <p style={{ margin: "0 0 0.3rem", fontSize: "0.8rem", textTransform: "capitalize", fontWeight: 600 }}>
                      {CATEGORIA_LABEL[categoria]}
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

export default function Outfits() {
  const [outfits, setOutfits] = useState<OutfitConPrendas[] | null>(null);
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
        setError(e instanceof Error ? e.message : "Error de conexión con Mi ropa.");
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

  if (outfits === null || placard === null) return <p style={{ color: "var(--text-muted)" }}>Cargando...</p>;

  return <Contenido outfitsIniciales={outfits} placard={placard} base={base} />;
}
