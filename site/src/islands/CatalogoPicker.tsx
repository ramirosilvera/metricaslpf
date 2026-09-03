import { useMemo, useState } from "react";
import { CATALOGO_PRENDAS, type PresetPrenda } from "../lib/catalogo";
import type { Estilo } from "../lib/types";
import PrendaIcon from "./PrendaIcon";

/** Mismo orden que FORMALIDAD_ESTILO en recommend.ts (de más a menos
 *  formal) -- pedido explícito del usuario: "que quede claramente
 *  diferenciado ropa de oficina, urbana, clásica, etc." en el catálogo, no
 *  solo en la lógica de combinación. El texto de "Formal" incluye
 *  "(oficina)" acá -- en el encabezado de sección, más descriptivo que se
 *  puede permitir -- porque es la palabra que usó el usuario, pero el
 *  ESTILO_LABEL compacto de recommend.ts (el que se usa en el badge chico
 *  de Outfits) se deja como estaba para no romper esa etiqueta ya
 *  establecida. */
const SECCIONES: { estilo: Estilo; titulo: string }[] = [
  { estilo: "formal", titulo: "Formal (oficina)" },
  { estilo: "clasico", titulo: "Clásico" },
  { estilo: "urbano", titulo: "Urbano" },
  { estilo: "casual", titulo: "Casual" },
  { estilo: "deportivo", titulo: "Deportivo" },
];

/** Buscador + filtro por estilo + catálogo agrupado en secciones -- un solo
 *  componente compartido por PrendaForm.tsx ("+Prenda") y Probar.tsx
 *  ("Probar antes de comprar"), que antes tenían cada uno su propia copia
 *  del `.map` sobre CATALOGO_PRENDAS sin buscador/filtro/secciones. Se
 *  extrae acá en vez de duplicar la lógica dos veces -- ya pasó en esta
 *  sesión que dos copias del mismo grid catálogo se desincronizaron (los
 *  íconos de accesorio no se actualizaban en los dos lugares a la vez). El
 *  `activo`/`onElegir` quedan como props porque cada pantalla define
 *  "seleccionado" distinto (por id de preset en un caso, por
 *  categoría+color en el otro). */
export default function CatalogoPicker({
  activo,
  onElegir,
  maxHeight = 340,
}: {
  activo: (p: PresetPrenda) => boolean;
  onElegir: (p: PresetPrenda) => void;
  maxHeight?: number;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstilo, setFiltroEstilo] = useState<Estilo | null>(null);

  const filtrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return CATALOGO_PRENDAS.filter((p) => {
      if (filtroEstilo && p.estilo !== filtroEstilo) return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !p.categoria.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [busqueda, filtroEstilo]);

  // Agrupado por estilo -- todas las prendas del catálogo lo tienen cargado
  // hoy, pero si en el futuro se agrega una sin estilo, cae en "Otros" en
  // vez de desaparecer en silencio del resultado filtrado.
  const grupos = useMemo(() => {
    const porEstilo = new Map<Estilo | "otros", PresetPrenda[]>();
    for (const p of filtrado) {
      const key: Estilo | "otros" = p.estilo ?? "otros";
      const arr = porEstilo.get(key) ?? [];
      arr.push(p);
      porEstilo.set(key, arr);
    }
    return porEstilo;
  }, [filtrado]);

  function tarjeta(p: PresetPrenda) {
    return (
      <button key={p.id} type="button" className={`catalogo-card${activo(p) ? " activo" : ""}`} onClick={() => onElegir(p)}>
        <span className="catalogo-icon">
          <PrendaIcon
            categoria={p.categoria}
            color={p.colorHex}
            textura={p.textura}
            suelaContraste={p.suelaContraste}
            posicionAccesorio={p.posicionAccesorio}
            requiereCuello={p.requiereCuello}
            conCapucha={p.conCapucha}
            patron={p.patron}
            color2={p.colorHex2}
            corteCalzado={p.corteCalzado}
          />
        </span>
        <span className="catalogo-nombre">{p.nombre}</span>
      </button>
    );
  }

  return (
    <div>
      <input
        type="search"
        className="field"
        placeholder="Buscar en el catálogo (ej. camisa, running)..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        aria-label="Buscar prenda en el catálogo"
        style={{ marginBottom: "0.6rem" }}
      />
      <div className="filtro-chips" role="group" aria-label="Filtrar catálogo por estilo">
        <button
          type="button"
          className={`chip${filtroEstilo === null ? " chip-activo" : ""}`}
          onClick={() => setFiltroEstilo(null)}
        >
          Todos
        </button>
        {SECCIONES.map(({ estilo, titulo }) => (
          <button
            key={estilo}
            type="button"
            className={`chip${filtroEstilo === estilo ? " chip-activo" : ""}`}
            onClick={() => setFiltroEstilo((prev) => (prev === estilo ? null : estilo))}
          >
            {titulo}
          </button>
        ))}
      </div>

      {filtrado.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0.75rem 0 0" }}>
          Nada coincide con {busqueda ? `"${busqueda}"` : "ese filtro"}.
        </p>
      ) : (
        <div className="catalogo-secciones" style={{ maxHeight }}>
          {SECCIONES.filter(({ estilo }) => grupos.has(estilo)).map(({ estilo, titulo }) => (
            <div key={estilo}>
              <p className="catalogo-seccion-titulo">
                {titulo} <span className="catalogo-seccion-count">({grupos.get(estilo)!.length})</span>
              </p>
              <div className="catalogo-grid">{grupos.get(estilo)!.map(tarjeta)}</div>
            </div>
          ))}
          {grupos.has("otros") && (
            <div>
              <p className="catalogo-seccion-titulo">
                Otros <span className="catalogo-seccion-count">({grupos.get("otros")!.length})</span>
              </p>
              <div className="catalogo-grid">{grupos.get("otros")!.map(tarjeta)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
