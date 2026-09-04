import { useEffect, useMemo, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { nombreColor } from "../lib/color";
import { ESTILO_LABEL, estilosDe } from "../lib/recommend";
import { coincideBusqueda, contarPorColor, contarPorEstacion, TODAS_LAS_CATEGORIAS } from "../lib/estadisticas";
import { CATEGORIA_LABEL, descripcionPrenda, ESTACION_LABEL, type Estacion, type Estilo, type Prenda } from "../lib/types";
import ConfigWarning from "./ConfigWarning";
import PrendaIcon from "./PrendaIcon";

const ESTILOS_FILTRO: Estilo[] = ["formal", "oficina", "clasico", "urbano", "casual", "deportivo"];

/** Parte interactiva del placard (buscador, filtros, secciones por
 *  categoría) separada del fetch a Supabase -- así se puede montar y
 *  probar visualmente con datos de prueba reales, sin necesitar una
 *  sesión real. El default export de abajo es el único que sabe de
 *  Supabase; esto solo recibe `prendas` ya cargadas. */
export function Contenido({
  prendas,
  base,
  onToggleNecesitaCambio,
  onEditarEstilos,
}: {
  prendas: Prenda[];
  base: string;
  /** Pedido explícito del usuario: "que se pueda agregar la opción de que
   *  una prenda necesita cambio". No existe ninguna pantalla de "editar
   *  prenda" en la app (PrendaForm solo crea) -- para que esto sirva de
   *  verdad con el placard que el usuario YA tiene cargado (no solo con
   *  prendas nuevas), el toggle vive acá mismo, directo sobre la tarjeta.
   *  Opcional: el snapshot de datos de prueba (ver el comentario de
   *  Contenido) puede montarse sin esta prop, sin botón de toggle. */
  onToggleNecesitaCambio?: (p: Prenda) => void;
  /** Pedido explícito del usuario: "quiero que se puedan visualizar y
   *  editar los estilos de las prendas de mi placard" -- mismo criterio
   *  que onToggleNecesitaCambio: no hay pantalla de "editar prenda", así
   *  que la edición vive inline en la tarjeta (ver EditorEstilos). Opcional
   *  por el mismo motivo (datos de prueba sin Supabase). */
  onEditarEstilos?: (p: Prenda, cambios: { estilo: Estilo | null; estilos_secundarios: Estilo[] }) => void;
}) {
  const [filtroEstilo, setFiltroEstilo] = useState<Estilo | null>(null);
  const [filtroColor, setFiltroColor] = useState<string | null>(null);
  const [filtroEstacion, setFiltroEstacion] = useState<Estacion | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // id de la prenda cuyo editor de estilos está abierto -- uno a la vez
  // (mismo criterio que confirmandoBorradoId en Outfits.tsx), para no tener
  // varios formularios de edición abiertos compitiendo por atención.
  const [editandoEstiloId, setEditandoEstiloId] = useState<string | null>(null);

  // Colores disponibles para filtrar: siempre los del placard COMPLETO (sin
  // aplicar todavía el resto de filtros/búsqueda), igual que ESTILOS_FILTRO
  // ya es una lista fija -- así los chips no se reordenan ni desaparecen
  // mientras el usuario está tocando otro filtro.
  const coloresDisponibles = useMemo(() => contarPorColor(prendas), [prendas]);

  // Pedido explícito del usuario: filtro real de "mostrame solo mis
  // abrigos de invierno". `estacion` solo está cargada hoy en buzo/
  // sweater/campera (el resto de las categorías la deja sin cargar a
  // propósito, ver catalogo.ts) -- filtrar por estación de hecho ya
  // funciona como "mostrame solo mis abrigos de esa estación" sin
  // necesitar un filtro de categoría aparte. Solo se muestran los chips
  // con al menos 1 prenda (mismo criterio que los colores): no tiene
  // sentido ofrecer un chip que siempre da "sin resultados".
  const estacionesDisponibles = useMemo(() => contarPorEstacion(prendas).filter((e) => e.cantidad > 0), [prendas]);

  const visibles = useMemo(
    () =>
      prendas.filter((p) => {
        if (filtroEstilo && !estilosDe(p).includes(filtroEstilo)) return false;
        if (filtroColor && nombreColor(p.color_h, p.color_s, p.color_l) !== filtroColor) return false;
        if (filtroEstacion && p.estacion !== filtroEstacion) return false;
        return coincideBusqueda(p, busqueda);
      }),
    [prendas, filtroEstilo, filtroColor, filtroEstacion, busqueda],
  );

  // Secciones por categoría, en el mismo orden fijo que el resto de la app
  // (TODAS_LAS_CATEGORIAS) -- no por cantidad, para que una sección no
  // "salte" de lugar solo porque cargaste una prenda más. Sin prendas
  // visibles para esa categoría, la sección ni se muestra.
  const secciones = useMemo(
    () =>
      TODAS_LAS_CATEGORIAS.map((categoria) => ({
        categoria,
        prendas: visibles.filter((p) => p.categoria === categoria),
      })).filter((s) => s.prendas.length > 0),
    [visibles],
  );

  const hayFiltrosActivos = filtroEstilo !== null || filtroColor !== null || filtroEstacion !== null || busqueda.trim() !== "";

  function limpiarFiltros() {
    setFiltroEstilo(null);
    setFiltroColor(null);
    setFiltroEstacion(null);
    setBusqueda("");
  }

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <a href={`${base}probar/`} className="card probar-banner">
        <span>👕</span>
        <div>
          <strong>¿Te vas a comprar algo?</strong>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Probá una prenda antes de comprarla, sin cargarla al placard.
          </p>
        </div>
      </a>

      <input
        type="search"
        className="field"
        placeholder="Buscar por categoría, color o estilo..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        aria-label="Buscar en tu placard"
      />

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

      {coloresDisponibles.length > 1 && (
        <div className="filtro-chips" role="group" aria-label="Filtrar tu placard por color" style={{ marginTop: "-0.35rem" }}>
          <button
            type="button"
            className={`chip${filtroColor === null ? " chip-activo" : ""}`}
            onClick={() => setFiltroColor(null)}
          >
            Todos los colores
          </button>
          {coloresDisponibles.map((c) => (
            <button
              key={c.nombre}
              type="button"
              className={`chip${filtroColor === c.nombre ? " chip-activo" : ""}`}
              onClick={() => setFiltroColor((prev) => (prev === c.nombre ? null : c.nombre))}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
            >
              <span className="color-chip-swatch" style={{ background: c.hex }} />
              {c.nombre} ({c.cantidad})
            </button>
          ))}
        </div>
      )}

      {/* Solo aparece si hay al menos una prenda con estación cargada --
          hoy eso es buzo/sweater/campera (ver catalogo.ts): filtrar por
          estación ya funciona como "mostrame solo mis abrigos de esa
          estación" sin un filtro de categoría aparte. */}
      {estacionesDisponibles.length > 0 && (
        <div className="filtro-chips" role="group" aria-label="Filtrar tu placard por estación" style={{ marginTop: "-0.35rem" }}>
          <button
            type="button"
            className={`chip${filtroEstacion === null ? " chip-activo" : ""}`}
            onClick={() => setFiltroEstacion(null)}
          >
            Todas las estaciones
          </button>
          {estacionesDisponibles.map((e) => (
            <button
              key={e.estacion}
              type="button"
              className={`chip${filtroEstacion === e.estacion ? " chip-activo" : ""}`}
              onClick={() => setFiltroEstacion((prev) => (prev === e.estacion ? null : e.estacion))}
            >
              {e.label} ({e.cantidad})
            </button>
          ))}
        </div>
      )}

      {secciones.length === 0 ? (
        <div className="empty-state">
          <p>No encontramos prendas con estos filtros.</p>
          {hayFiltrosActivos && (
            <button type="button" className="btn btn-secondary" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {secciones.map(({ categoria, prendas: prendasSeccion }) => (
            <section key={categoria}>
              <p className="catalogo-seccion-titulo">
                {CATEGORIA_LABEL[categoria]} <span className="catalogo-seccion-count">({prendasSeccion.length})</span>
              </p>
              <div className="grid-prendas">
                {prendasSeccion.map((p) => (
                  // Reporte real del usuario ("visualizar y editar los
                  // estilos"): agregar un editor con <select>+checkboxes
                  // exigía separar la tarjeta (antes un <a> único, todo
                  // clickeable) en un link de navegación + controles
                  // propios -- meter un <select> dentro de un <a> es frágil
                  // en mobile (foco/scroll raros al abrir el desplegable),
                  // a diferencia de un solo botón con preventDefault (lo
                  // que sí alcanzaba para necesita-cambio). Ver
                  // .prenda-card/.prenda-card-link en global.css.
                  <div key={p.id} className="card prenda-card">
                    <a href={`${base}combinar/?prenda=${p.id}`} className="prenda-card-link">
                      <span className="prenda-card-icon">
                        <PrendaIcon
                          categoria={p.categoria}
                          color={p.color_hex}
                          textura={p.textura ?? undefined}
                          estacion={p.estacion}
                          suelaContraste={p.suela_contraste}
                          posicionAccesorio={p.posicion_accesorio}
                          requiereCuello={p.requiere_cuello}
                          conCapucha={p.con_capucha}
                          patron={p.patron}
                          color2={p.color2_hex}
                          corteCalzado={p.corte_calzado}
                        />
                      </span>
                      <strong style={{ fontSize: "0.85rem" }}>{descripcionPrenda(p)}</strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {nombreColor(p.color_h, p.color_s, p.color_l)}
                      </span>
                    </a>
                    {(p.estilo || p.estilos_secundarios.length > 0 || p.estacion) && (
                      <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.3rem" }}>
                        {p.estilo && <span className="registro-badge">{ESTILO_LABEL[p.estilo]}</span>}
                        {/* Reporte real: estilos_secundarios se guardaba desde
                            PrendaForm ("también funciona para") pero no se
                            mostraba en NINGÚN lado de la app -- acá es donde
                            el usuario de verdad puede verlo. Estilo punteado/
                            muted (ver .registro-badge-secundario) para que se
                            note la diferencia con el estilo principal. */}
                        {p.estilos_secundarios.map((e) => (
                          <span key={e} className="registro-badge registro-badge-secundario">
                            + {ESTILO_LABEL[e]}
                          </span>
                        ))}
                        {p.estacion && <span className="registro-badge">{ESTACION_LABEL[p.estacion]}</span>}
                      </span>
                    )}
                    {onEditarEstilos &&
                      (editandoEstiloId === p.id ? (
                        <EditorEstilos
                          p={p}
                          onGuardar={(cambios) => {
                            onEditarEstilos(p, cambios);
                            setEditandoEstiloId(null);
                          }}
                          onCancelar={() => setEditandoEstiloId(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.7rem", padding: "0.25rem 0.6rem" }}
                          onClick={() => setEditandoEstiloId(p.id)}
                        >
                          ✏️ Editar estilos
                        </button>
                      ))}
                    {onToggleNecesitaCambio && (
                      <button
                        type="button"
                        className={`necesita-cambio-toggle${p.necesita_cambio ? " activo" : ""}`}
                        onClick={() => onToggleNecesitaCambio(p)}
                      >
                        {p.necesita_cambio ? "🔧 Necesita cambio" : "Marcar que necesita cambio"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Editor inline de estilo/estilos_secundarios de UNA prenda -- pedido
 *  explícito del usuario: "quiero que se puedan visualizar y editar los
 *  estilos de las prendas de mi placard". Mismo par de campos y mismo
 *  criterio que PrendaForm (elegir el principal saca automáticamente ese
 *  valor de "también funciona para"), reimplementado acá en vez de
 *  reusarse porque PrendaForm no exporta sus piezas internas (SelectOpcional
 *  no está exportado) y el flujo es de guardar-de-una (no hay paso de
 *  "cargar foto"/preset). */
function EditorEstilos({
  p,
  onGuardar,
  onCancelar,
}: {
  p: Prenda;
  onGuardar: (cambios: { estilo: Estilo | null; estilos_secundarios: Estilo[] }) => void;
  onCancelar: () => void;
}) {
  const [estilo, setEstilo] = useState<Estilo | "">(p.estilo ?? "");
  const [secundarios, setSecundarios] = useState<Estilo[]>(p.estilos_secundarios);

  return (
    <div style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <label className="field-label" style={{ fontSize: "0.75rem" }}>
        <span>Estilo principal</span>
        <select
          className="field"
          value={estilo}
          onChange={(e) => {
            const v = e.target.value as Estilo | "";
            setEstilo(v);
            setSecundarios((prev) => prev.filter((x) => x !== v));
          }}
        >
          <option value="">(sin especificar)</option>
          {ESTILOS_FILTRO.map((e) => (
            <option key={e} value={e}>
              {ESTILO_LABEL[e]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.3rem" }}>También funciona para</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {ESTILOS_FILTRO.filter((e) => e !== estilo).map((e) => (
            <label key={e} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem" }}>
              <input
                type="checkbox"
                checked={secundarios.includes(e)}
                onChange={(ev) =>
                  setSecundarios((prev) => (ev.target.checked ? [...prev, e] : prev.filter((x) => x !== e)))
                }
              />
              <span>{ESTILO_LABEL[e]}</span>
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: "0.75rem", padding: "0.35rem 0.6rem", flex: 1 }}
          onClick={() => onGuardar({ estilo: estilo || null, estilos_secundarios: secundarios })}
        >
          Guardar
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: "0.75rem", padding: "0.35rem 0.6rem", flex: 1 }}
          onClick={onCancelar}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

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
        <p>No se pudo conectar con Mi ropa.</p>
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

  // Optimista: actualiza el estado local antes de esperar la respuesta de
  // Supabase -- el peor caso (el update falla) es que el toggle vuelva a
  // su valor anterior en el próximo refresco de la pantalla, no distinto
  // de cualquier otro fallo de red silencioso de esta pantalla.
  async function toggleNecesitaCambio(p: Prenda) {
    const nuevoValor = !p.necesita_cambio;
    setPrendas((prev) => prev?.map((x) => (x.id === p.id ? { ...x, necesita_cambio: nuevoValor } : x)) ?? prev);
    await supabase.from("prendas").update({ necesita_cambio: nuevoValor }).eq("id", p.id);
  }

  async function editarEstilos(p: Prenda, cambios: { estilo: Estilo | null; estilos_secundarios: Estilo[] }) {
    setPrendas((prev) => prev?.map((x) => (x.id === p.id ? { ...x, ...cambios } : x)) ?? prev);
    await supabase.from("prendas").update(cambios).eq("id", p.id);
  }

  return (
    <Contenido
      prendas={prendas}
      base={base}
      onToggleNecesitaCambio={toggleNecesitaCambio}
      onEditarEstilos={editarEstilos}
    />
  );
}
