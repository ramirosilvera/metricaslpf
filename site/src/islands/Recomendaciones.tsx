import { useEffect, useMemo, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { nombreColor } from "../lib/color";
import { CATEGORIA_LABEL, CATEGORIAS_COMPLEMENTARIAS, descripcionPrenda, type Estilo, type Prenda } from "../lib/types";
import { ESTILO_LABEL, recomendar } from "../lib/recommend";
import ConfigWarning from "./ConfigWarning";
import PrendaIcon from "./PrendaIcon";

const NIVEL_LABEL: Record<string, string> = {
  excelente: "Excelente",
  muy_bueno: "Muy bueno",
  con_cuidado: "Con cuidado",
};

const ESTILOS_FILTRO: Estilo[] = ["formal", "clasico", "urbano", "casual", "deportivo"];

export default function Recomendaciones() {
  const [placard, setPlacard] = useState<Prenda[] | null>(null);
  const [base, setBase] = useState<Prenda | null>(null);
  const [modo, setModo] = useState<"rapido" | "explicame">("rapido");
  const [filtroEstilo, setFiltroEstilo] = useState<Estilo | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [error, setError] = useState("");
  const [errorGuardado, setErrorGuardado] = useState("");
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
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
        setError(e instanceof Error ? e.message : "Error de conexión con Mi ropa.");
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

  function toggleSeleccion(id: string) {
    if (guardando) return; // evita que una selección en vuelo se pierda o se desincronice del insert
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setGuardado(false);
    setErrorGuardado("");
  }

  async function guardarOutfit() {
    if (!base || seleccionadas.size === 0) return;
    setGuardando(true);
    setErrorGuardado("");
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

      const filas = [base.id, ...seleccionadas].map((prenda_id) => ({ outfit_id: outfit.id, prenda_id }));
      const { error: joinErr } = await supabase.from("outfit_prendas").insert(filas);
      if (joinErr) {
        // el outfit ya se creó pero la unión con las prendas falló (p.ej. si
        // justo en el medio se borró una prenda seleccionada) -- se
        // deshace, así no queda un outfit vacío e inaccesible en la cuenta.
        await supabase.from("outfits").delete().eq("id", outfit.id);
        throw new Error(joinErr.message);
      }

      setGuardado(true);
      setSeleccionadas(new Set());
      setTimeout(() => setGuardado(false), 3500);
    } catch (e) {
      setErrorGuardado(e instanceof Error ? e.message : "No se pudo guardar el outfit.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarPrenda() {
    if (!base) return;
    setConfirmandoBorrado(false);
    setEliminando(true);
    setErrorEliminar("");
    try {
      // se borra la fila primero: es el registro autoritativo. Si se
      // borrara la foto antes y el delete de la fila fallara después,
      // quedaría una prenda viva con la foto ya destruida -- irrecuperable.
      // Al revés, en el peor caso queda un archivo huérfano en un bucket
      // privado (barrible después). .select("id") además deja ver si la
      // fila realmente existía y era nuestra (RLS filtra en silencio, sin
      // error, si no lo era -- p.ej. un doble tap).
      const { data: borradas, error: delErr } = await supabase
        .from("prendas")
        .delete()
        .eq("id", base.id)
        .select("id");
      if (delErr) throw new Error(delErr.message);
      if (borradas && borradas.length > 0 && base.foto_path) {
        await supabase.storage.from("armario-fotos").remove([base.foto_path]);
      }
      // replace, no href: que la URL de una prenda ya borrada no quede en
      // el historial (evita reaparecer vía bfcache al volver atrás).
      window.location.replace(base_url);
    } catch (e) {
      setErrorEliminar(e instanceof Error ? e.message : "No se pudo eliminar la prenda.");
      setEliminando(false);
    }
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
          Todavía no tenés nada para combinar con tu {CATEGORIA_LABEL[base.categoria]}. Cargá una prenda de categoría{" "}
          <strong>{CATEGORIA_LABEL[faltante]}</strong> para ver las primeras combinaciones.
        </p>
        <a className="btn btn-primary" href={`${base_url}prenda/nueva/`}>
          + Cargar prenda
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingBottom: seleccionadas.size > 0 || guardado ? "4.5rem" : 0 }}>
      <div className="vestidor-hero">
        <span className="vestidor-hero-icon">
          <PrendaIcon
            categoria={base.categoria}
            color={base.color_hex}
            textura={base.textura ?? undefined}
            estacion={base.estacion}
            suelaContraste={base.suela_contraste}
            posicionAccesorio={base.posicion_accesorio}
            requiereCuello={base.requiere_cuello}
            conCapucha={base.con_capucha}
            patron={base.patron}
            color2={base.color2_hex}
            corteCalzado={base.corte_calzado}
          />
        </span>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: "1.1rem" }}>
            {descripcionPrenda(base)} · {nombreColor(base.color_h, base.color_s, base.color_l)}
          </strong>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Tocá las combinaciones que te gusten para armar un outfit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmandoBorrado(true)}
          disabled={eliminando || guardando}
          aria-label="Eliminar esta prenda del placard"
          title="Eliminar esta prenda del placard"
          className="btn-icon-danger"
        >
          {eliminando ? "…" : "🗑"}
        </button>
      </div>
      {errorEliminar && <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>{errorEliminar}</p>}

      {confirmandoBorrado && (
        <div className="confirm-overlay" onClick={() => setConfirmandoBorrado(false)}>
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>
              ¿Eliminar esta prenda del placard? También va a desaparecer de los outfits guardados que la incluyan.
              No se puede deshacer.
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmandoBorrado(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={eliminarPrenda}>
                Eliminar prenda
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.4rem" }}>
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

      {/* Pedido explícito: que el estilo (oficina/urbana/clásica/casual/
          deportiva) quede diferenciado también acá, no solo en el
          catálogo. Filtra por el estilo cargado en cada prenda candidata --
          si la mayoría no tiene estilo cargado, el filtro simplemente no
          encuentra nada para esa sección en vez de inventar un valor. */}
      <div className="filtro-chips" role="group" aria-label="Filtrar recomendaciones por estilo">
        <button
          type="button"
          className={`chip${filtroEstilo === null ? " chip-activo" : ""}`}
          onClick={() => setFiltroEstilo(null)}
        >
          Todos los estilos
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

      {filtroEstilo &&
        candidatasPorCategoria.every(({ prendas }) => !prendas.some((p) => p.estilo === filtroEstilo)) && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
            No tenés nada con estilo "{ESTILO_LABEL[filtroEstilo]}" para combinar con esta prenda todavía.
          </p>
        )}

      {candidatasPorCategoria.map(({ categoria, prendas }) => {
        const candidatas = filtroEstilo ? prendas.filter((p) => p.estilo === filtroEstilo) : prendas;
        const recs = recomendar(base, candidatas, placard);
        // En "Rápido" mostramos solo la mejor -- pero nunca escondemos una
        // que el usuario ya seleccionó (si no, queda en el contador sin
        // forma de verla ni de sacarla).
        const visibles = modo === "rapido" ? recs.filter((r, i) => i === 0 || seleccionadas.has(r.prenda.id)) : recs;
        if (visibles.length === 0) return null;
        return (
          <section key={categoria}>
            <h3 style={{ textTransform: "capitalize", fontSize: "1rem" }}>{CATEGORIA_LABEL[categoria]}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {visibles.map(({ prenda, score, tecnicaRescate }) => {
                const activo = seleccionadas.has(prenda.id);
                return (
                  <button
                    key={prenda.id}
                    type="button"
                    onClick={() => toggleSeleccion(prenda.id)}
                    disabled={guardando}
                    aria-pressed={activo}
                    aria-label={`${descripcionPrenda(prenda)} ${nombreColor(prenda.color_h, prenda.color_s, prenda.color_l)}, ${NIVEL_LABEL[score.nivel]}${activo ? ", seleccionada" : ""}`}
                    className={`card recomendacion-card${activo ? " seleccionada" : ""}`}
                  >
                    <span className="recomendacion-icon" aria-hidden="true">
                      <PrendaIcon
                        categoria={prenda.categoria}
                        color={prenda.color_hex}
                        textura={prenda.textura ?? undefined}
                        estacion={prenda.estacion}
                        suelaContraste={prenda.suela_contraste}
                        posicionAccesorio={prenda.posicion_accesorio}
                        requiereCuello={prenda.requiere_cuello}
                        conCapucha={prenda.con_capucha}
                        patron={prenda.patron}
                        color2={prenda.color2_hex}
                        corteCalzado={prenda.corte_calzado}
                      />
                    </span>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <span style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.2rem" }}>
                        {descripcionPrenda(prenda)} · {nombreColor(prenda.color_h, prenda.color_s, prenda.color_l)}
                      </span>
                      <span className={`nivel-badge nivel-${score.nivel}`}>
                        {NIVEL_LABEL[score.nivel]}
                        {score.tag === "combinacion_audaz" && " · audaz"}
                        {score.tag === "tono_sobre_tono" && " · tono sobre tono"}
                      </span>
                      {prenda.estilo && (
                        <span className="registro-badge" style={{ marginLeft: "0.35rem" }}>
                          {ESTILO_LABEL[prenda.estilo]}
                        </span>
                      )}
                      {modo === "explicame" && (
                        <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                          {score.explicacion}
                        </p>
                      )}
                      {tecnicaRescate && (
                        <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>💡 {tecnicaRescate}</p>
                      )}
                    </div>
                    <span className="recomendacion-check" aria-hidden="true">
                      {activo ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {(seleccionadas.size > 0 || guardando || guardado || errorGuardado) && (
        <div className="save-bar">
          {guardado ? (
            <span>✓ Outfit guardado — <a href={`${base_url}outfits/`}>verlo</a></span>
          ) : errorGuardado ? (
            <span style={{ color: "#ffb3ab" }}>{errorGuardado}</span>
          ) : (
            <span>
              Tu {CATEGORIA_LABEL[base.categoria]} + {seleccionadas.size} más
            </span>
          )}
          {!guardado && seleccionadas.size > 0 && (
            <button className="btn btn-primary" onClick={guardarOutfit} disabled={guardando || eliminando}>
              {guardando ? "Guardando..." : "Guardar outfit"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
