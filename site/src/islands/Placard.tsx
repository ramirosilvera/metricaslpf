import { useEffect, useMemo, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { nombreColor } from "../lib/color";
import { ESTILO_LABEL } from "../lib/recommend";
import { coincideBusqueda, contarPorColor, TODAS_LAS_CATEGORIAS } from "../lib/estadisticas";
import { CATEGORIA_LABEL, type Estilo, type Prenda } from "../lib/types";
import ConfigWarning from "./ConfigWarning";
import PrendaIcon from "./PrendaIcon";

const ESTILOS_FILTRO: Estilo[] = ["formal", "clasico", "urbano", "casual", "deportivo"];

/** Parte interactiva del placard (buscador, filtros, secciones por
 *  categoría) separada del fetch a Supabase -- así se puede montar y
 *  probar visualmente con datos de prueba reales, sin necesitar una
 *  sesión real. El default export de abajo es el único que sabe de
 *  Supabase; esto solo recibe `prendas` ya cargadas. */
export function Contenido({ prendas, base }: { prendas: Prenda[]; base: string }) {
  const [filtroEstilo, setFiltroEstilo] = useState<Estilo | null>(null);
  const [filtroColor, setFiltroColor] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  // Colores disponibles para filtrar: siempre los del placard COMPLETO (sin
  // aplicar todavía el resto de filtros/búsqueda), igual que ESTILOS_FILTRO
  // ya es una lista fija -- así los chips no se reordenan ni desaparecen
  // mientras el usuario está tocando otro filtro.
  const coloresDisponibles = useMemo(() => contarPorColor(prendas), [prendas]);

  const visibles = useMemo(
    () =>
      prendas.filter((p) => {
        if (filtroEstilo && p.estilo !== filtroEstilo) return false;
        if (filtroColor && nombreColor(p.color_h, p.color_s, p.color_l) !== filtroColor) return false;
        return coincideBusqueda(p, busqueda);
      }),
    [prendas, filtroEstilo, filtroColor, busqueda],
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

  const hayFiltrosActivos = filtroEstilo !== null || filtroColor !== null || busqueda.trim() !== "";

  function limpiarFiltros() {
    setFiltroEstilo(null);
    setFiltroColor(null);
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
        <span>👗</span>
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
                    <strong style={{ fontSize: "0.85rem", textTransform: "capitalize" }}>{CATEGORIA_LABEL[p.categoria]}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {nombreColor(p.color_h, p.color_s, p.color_l)}
                    </span>
                    {p.estilo && <span className="registro-badge" style={{ marginTop: "0.3rem" }}>{ESTILO_LABEL[p.estilo]}</span>}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
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

  return <Contenido prendas={prendas} base={base} />;
}
