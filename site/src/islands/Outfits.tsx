import { useEffect, useMemo, useRef, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { nombreColor } from "../lib/color";
import { CATALOGO_CON_HSL, presetAPrendaSintetica } from "../lib/catalogo";
import { compartirOImagen, generarImagenOutfit } from "../lib/compartir";
import {
  advertenciasDeRegistro,
  armarOutfitsParaComprar,
  armarOutfitsSugeridos,
  candidatosDeContraste,
  diffPrendasEdicion,
  estacionActual,
  ESTILO_LABEL,
  mejorCompraParaSubirNota,
  outfitEsCoherenteParaEstilo,
  outfitSirveParaEstilo,
  puntuarOutfit,
  registroOutfit,
  semillaDelDia,
  sugerenciaDeAncla,
  sugerenciaDeVariedad,
  tanda,
  type OutfitParaComprar,
  type OutfitSugerido,
} from "../lib/recommend";
import { CATEGORIA_LABEL, descripcionPrenda, type Estacion, type Estilo, type Prenda } from "../lib/types";
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
  return prendas.map((p) => `${descripcionPrenda(p)} ${nombreColor(p.color_h, p.color_s, p.color_l)}`).join(" + ");
}

/** Pedido explícito del usuario: "quiero un sistema de valoración por
 *  puntos... este outfit es un nueve de diez por esto y por esto". Reusa
 *  las mismas clases `.nivel-*` que ya pintan Recomendaciones.tsx/
 *  Probar.tsx (verde/naranja/amarillo) -- mismo vocabulario visual de
 *  "qué tan bien combina" en toda la app, no una paleta nueva para esta
 *  sola pantalla. 9-10 -> excelente, 7-8 -> muy_bueno, <=6 -> con_cuidado
 *  (los mismos cortes que ya usa PUNTOS_POR_NIVEL en recommend.ts para
 *  construir el promedio, así que un outfit "todo excelente" siempre cae
 *  en verde y uno con un solo muy_bueno de por medio, en naranja). */
function nivelDePuntaje(puntaje: number): "excelente" | "muy_bueno" | "con_cuidado" {
  if (puntaje >= 9) return "excelente";
  if (puntaje >= 7) return "muy_bueno";
  return "con_cuidado";
}

function PuntajeBadge({
  prendas,
  precomputado,
}: {
  prendas: Prenda[];
  /** OutfitSugerido/OutfitParaComprar ya traen puntaje/explicacionPuntaje
   *  calculados en recommend.ts (el mismo valor que ordena el pool) -- se
   *  pasan acá en vez de recalcular con puntuarOutfit(prendas) para no
   *  arriesgar que la UI muestre un número distinto del que decidió el
   *  orden. Solo se recalcula acá (prop `prendas`) para los outfits YA
   *  GUARDADOS, que no pasan por armarOutfitsSugeridos y por lo tanto
   *  nunca tuvieron un puntaje calculado de entrada. */
  precomputado?: { puntaje: number; explicacion: string };
}) {
  const calculado = useMemo(() => (precomputado ? null : puntuarOutfit(prendas)), [precomputado, prendas]);
  const { puntaje, explicacion } = precomputado ?? calculado!;
  return (
    <div style={{ margin: "0.3rem 0 0" }}>
      <span className={`nivel-badge nivel-${nivelDePuntaje(puntaje)}`}>{puntaje}/10</span>
      <p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>{explicacion}</p>
    </div>
  );
}

/** Pedido explícito del usuario: que la app diga a qué registro (Formal,
 *  Clásico, Urbano, Casual...) corresponde el outfit, no solo que evite
 *  combinaciones raras en silencio. Sin pantalón con `estilo` cargado en
 *  el outfit no hay de dónde sacar el registro -- no se muestra nada en
 *  vez de inventar un valor.
 *
 *  `estiloTab`: reporte real del usuario ("en las categorías de clásicos a
 *  veces aparecen opciones formales"), verificado por ejecución -- el
 *  badge usaba registroOutfit(), que solo mira el estilo PRINCIPAL del
 *  pantalón, mientras que el filtro de pestaña (outfitSirveParaEstilo)
 *  matchea también por estilo SECUNDARIO a propósito (un pantalón
 *  estilo="formal" con secundario="clasico" sirve para las dos pestañas,
 *  intencional). Resultado: elegís la pestaña "Clásico", el outfit
 *  califica de verdad (por el secundario), pero el badge mostraba
 *  "Formal" -- técnicamente cierto sobre esa prenda, pero contradice la
 *  pestaña que el usuario mismo eligió. Cuando se conoce la pestaña
 *  activa (no "todos"), se muestra ESE estilo en el badge en vez de
 *  recalcularlo -- ya se sabe, por construcción (el outfit pasó el
 *  filtro), que el outfit sirve genuinamente para esa pestaña. Sin
 *  pestaña activa (vista "Todos", o pantallas sin selector de estilo como
 *  "Ideas para comprar"), sigue mostrando el registro real vía
 *  registroOutfit(), sin cambios. */
function RegistroBadge({ prendas, estiloTab }: { prendas: Prenda[]; estiloTab?: Estilo }) {
  const registro = estiloTab ? ESTILO_LABEL[estiloTab] : registroOutfit(prendas);
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

/** Una tarjeta de "Vestite hoy" -- extraída para no duplicar el markup
 *  entre la opción principal y la de contraste (ver candidatosDeContraste
 *  en recommend.ts). `etiquetaGrupo` es el rótulo fijo ("Mejor opción" /
 *  "Otra combinación"), no el registro (Formal/Casual/...) que ya muestra
 *  RegistroBadge -- son dos datos distintos y se muestran los dos. */
function TarjetaSugerido({
  s,
  etiquetaGrupo,
  estiloTab,
  guardadas,
  guardando,
  errorGuardar,
  onGuardar,
}: {
  s: OutfitSugerido;
  etiquetaGrupo: string;
  estiloTab?: Estilo;
  guardadas: Set<string>;
  guardando: string | null;
  errorGuardar: Record<string, string>;
  onGuardar: (s: OutfitSugerido) => void;
}) {
  const yaGuardado = guardadas.has(s.id);
  return (
    <div className="card outfit-card">
      <p className="eyebrow" style={{ margin: "0 0 0.3rem", textAlign: "center" }}>
        {etiquetaGrupo}
      </p>
      <Maniqui prendas={s.prendas} />
      <div style={{ minWidth: 0, textAlign: "center" }}>
        <strong>{s.prendas.map((p) => descripcionPrenda(p)).join(" + ")}</strong>
        <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {leyenda(s.prendas)}
        </p>
        <PuntajeBadge prendas={s.prendas} precomputado={{ puntaje: s.puntaje, explicacion: s.explicacionPuntaje }} />
        <RegistroBadge prendas={s.prendas} estiloTab={estiloTab} />
      </div>
      {errorGuardar[s.id] && <p style={{ color: "var(--danger)", fontSize: "0.75rem", margin: 0 }}>{errorGuardar[s.id]}</p>}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", width: "100%" }}
        onClick={() => onGuardar(s)}
        disabled={guardando === s.id || yaGuardado}
      >
        {yaGuardado ? "✓ Guardado" : guardando === s.id ? "Guardando..." : "Guardar outfit"}
      </button>
    </div>
  );
}

/** Cuántas tarjetas se muestran a la vez en "Ideas para comprar" -- fijo a
 *  propósito: el pool real (armarOutfitsParaComprar) puede tener muchas más
 *  variantes, pero mostrarlas todas satura la pantalla. El botón "otras
 *  opciones" rota por el pool (ver `tanda` en recommend.ts) en tandas de
 *  este tamaño, en vez de ir agregando tarjetas nuevas. */
const VISIBLES_POR_SECCION = 2;

/** Pedido explícito del usuario: no rotar entre variantes que a veces
 *  coinciden en la misma capa -- siempre 2 opciones fijas al elegir una
 *  ocasión en "Vestite hoy": la principal (mejor puntaje) y la que más
 *  contrasta en color contra ella (matiz, luminosidad y saturación --
 *  no dos variantes parecidas). Ver candidatosDeContraste en recommend.ts. */
const OPCIONES_A_LA_VEZ = 1;

const ESTILOS_FILTRO: Estilo[] = ["formal", "oficina", "clasico", "urbano", "casual", "deportivo"];

// Pedido explícito del usuario, con captura real ("bermuda con sweater,
// ambos beige"): antes "Vestite hoy" solo usaba la fecha REAL de hoy para
// ORDENAR (nunca para filtrar) qué abrigo mostrar primero -- un bermuda
// podía terminar armado con un sweater igual, porque ninguna regla los
// bloqueaba entre sí. Ahora el clima es una pregunta explícita (no la
// fecha del calendario) que además FILTRA de verdad -- ver el comentario
// largo de armarOutfitsSugeridos en recommend.ts. "Frío/Calor" en vez de
// "Invierno/Verano" a propósito: es la pregunta que haría cualquier
// persona real ("¿hace frío hoy?"), no el nombre técnico de la estación.
const CLIMA_LABEL: Record<Estacion, string> = {
  invierno: "Frío",
  entretiempo: "Entretiempo",
  verano: "Calor",
};
const CLIMAS_FILTRO: Estacion[] = ["invierno", "entretiempo", "verano"];

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
  // Pedido explícito del usuario: "quiero que en cada sección me
  // preguntes si hace frío, entretiempo o calor" -- mismo criterio de
  // "sin default silencioso" que estiloSugerido arriba: null hasta que el
  // usuario responda a propósito, ver poolSugeridos más abajo (con
  // cualquiera de los dos en null, el pool queda vacío).
  const [climaSugerido, setClimaSugerido] = useState<Estacion | null>(null);
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
  // outfits guardados, no solo en el catálogo. outfitSirveParaEstilo (no
  // registroOutfit, que solo da el estilo PRINCIPAL para el badge) chequea
  // todos los estilos del pantalón -- un pantalón "clasico" con "casual"
  // como estilo secundario aparece en los dos filtros, no solo el
  // principal.
  const outfitsFiltrados = useMemo(
    () => (filtroEstilo ? outfits.filter((o) => outfitSirveParaEstilo(o.prendas, filtroEstilo)) : outfits),
    [outfits, filtroEstilo],
  );

  // climaSugerido en null -> pool vacío a propósito, mismo criterio que
  // estiloSugerido más abajo: no se arma NADA hasta que el usuario
  // responda las dos preguntas (ocasión + clima). armarOutfitsSugeridos ya
  // filtra de verdad según el clima elegido (no solo ordena) -- ver el
  // comentario largo en recommend.ts.
  const poolSugeridos: OutfitSugerido[] = useMemo(() => {
    if (climaSugerido === null) return [];
    return armarOutfitsSugeridos(placard, climaSugerido).filter((s) => !clavesGuardadas.has(s.id));
  }, [placard, clavesGuardadas, climaSugerido]);

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
    return poolSugeridos.filter((s) => outfitSirveParaEstilo(s.prendas, estiloSugerido));
  }, [poolSugeridos, estiloSugerido]);

  // Pedido explícito del usuario, con reporte real: "en el estilo formal
  // le pone el buzo con capucha... no entiendo por qué esa pésima
  // elección hace el motor". poolSugeridosPorEstilo (arriba) es LAXO a
  // propósito -- solo mira el pantalón; mejorCompra más abajo lo sigue
  // necesitando así para encontrar una base real aunque tenga una
  // democión (es la excusa de por qué la nota no es más alta). Este otro
  // pool, con outfitEsCoherenteParaEstilo (que además exige cero
  // advertencias de registro), es el que de verdad se MUESTRA como
  // opción lista para usar en las tarjetas de abajo.
  const poolCoherentePorEstilo = useMemo(() => {
    if (estiloSugerido === null) return [];
    if (estiloSugerido === "todos") return poolSugeridos.filter((s) => advertenciasDeRegistro(s.prendas).length === 0);
    return poolSugeridos.filter((s) => outfitEsCoherenteParaEstilo(s.prendas, estiloSugerido));
  }, [poolSugeridos, estiloSugerido]);

  function elegirEstiloSugerido(valor: Estilo | "todos") {
    setEstiloSugerido((prev) => (prev === valor ? null : valor));
    setOffsetSugeridos(0);
  }

  function elegirClimaSugerido(valor: Estacion) {
    setClimaSugerido((prev) => (prev === valor ? null : valor));
    setOffsetSugeridos(0);
  }

  // Pedido explícito del usuario: "la idea es poder usar toda la ropa de
  // mi placar... con la menor cantidad de búsqueda de nuevas opciones" --
  // sin semillaDelDia, offsetSugeridos arrancaba siempre en 0 y "la mejor
  // opción" quedaba fija en el MISMO combo cada vez que se abre la
  // pantalla (el primero del pool ordenado por puntaje), sin importar
  // cuántas otras prendas empatadas en el mismo puntaje máximo tenía el
  // placard. semillaDelDia rota el punto de partida DENTRO de ese empate
  // usando el día de hoy -- nunca baja de calidad (todo ese nivel
  // comparte el mismo puntaje máximo), pero un día distinto ya arranca en
  // un combo distinto sin tocar nada. "otras opciones" (offsetSugeridos)
  // sigue sumando desde ahí exactamente igual que antes.
  const opcionPrincipal = tanda(poolCoherentePorEstilo, semillaDelDia(poolCoherentePorEstilo) + offsetSugeridos, OPCIONES_A_LA_VEZ)[0];
  // Pedido explícito del usuario, reporte real: "toco el botón de otras
  // opciones y la otra combinación no cambia". Verificado por ejecución:
  // elegirContraste (un solo resultado) quedaba dominado por
  // pantalón+calzado+accesorio -- el mismo outlier de esas categorías
  // ganaba el primer puesto sin importar qué principal se le comparara,
  // así que la rotación diaria (que sobre todo mueve el torso) casi
  // nunca cambiaba la segunda tarjeta. candidatosDeContraste devuelve el
  // ranking COMPLETO, e indexarlo con el mismo offsetSugeridos que ya
  // mueve "otras opciones" garantiza que cada click cambie las dos
  // tarjetas, no solo la principal.
  const candidatosContraste = useMemo(
    () => (opcionPrincipal ? candidatosDeContraste(opcionPrincipal, poolCoherentePorEstilo) : []),
    [opcionPrincipal, poolCoherentePorEstilo],
  );
  const opcionContraste = tanda(candidatosContraste, offsetSugeridos, OPCIONES_A_LA_VEZ)[0];
  const hayMasOpciones = poolCoherentePorEstilo.length > 1;

  // Pedido explícito del usuario: en el estilo elegido hoy, avisar si hay
  // poca variedad (de tipo de prenda o de color) con una sugerencia
  // concreta del catálogo -- ver sugerenciaDeVariedad en recommend.ts. Solo
  // tiene sentido con un estilo puntual elegido (no con "todos", que junta
  // todos los registros -- ahí "poca variedad" no significa nada
  // accionable) y solo cuando hay opciones para mostrar (si el pool ya
  // está vacío, el mensaje de "no armamos ningún look" de más abajo ya
  // cubre ese caso).
  const sugerenciaVariedad = useMemo(() => {
    if (!estiloSugerido || estiloSugerido === "todos" || poolSugeridosPorEstilo.length === 0) return null;
    return sugerenciaDeVariedad(estiloSugerido, placard);
  }, [estiloSugerido, poolSugeridosPorEstilo, placard]);

  // Pedido explícito del usuario: "che, mirá, la mejor valoración de tu
  // outfit urbano es de seis de diez, te recomiendo comprar estas prendas
  // para subir tu valoración a nueve puntos" -- independiente de POR QUÉ
  // la nota no es más alta. Auditoría de Consejo sobre el sistema de
  // puntaje: la primera versión de esto solo probaba la sugerencia de
  // sugerenciaVariedad (un hueco de TIPO o de COLOR) -- verificado por
  // ejecución que el caso más común en la práctica nunca pasaba por ahí:
  // variedad y color ya están bien, pero el calzado o el accesorio que el
  // usuario YA tiene puesto hoy son los que frenan la nota, y
  // sugerenciaVariedad no mira eso (mejorCompraParaSubirNota sí, vía
  // mejorasDeReemplazo -- ver su comentario largo en recommend.ts). Toma
  // el mejor outfit REAL disponible (poolSugeridosPorEstilo, laxo -- ya
  // ordenado por puntaje) como base, no las tarjetas mostradas
  // (poolCoherentePorEstilo): a propósito, para que la sugerencia de
  // compra siga funcionando aunque NINGUNA combinación quede coherente
  // para mostrar todavía -- es exactamente el caso donde más falta hace
  // ("no tengo nada prolijo, decime qué comprar para arreglarlo").
  const mejorCompra = useMemo(() => {
    if (!estiloSugerido || estiloSugerido === "todos") return null;
    const base = poolSugeridosPorEstilo[0];
    if (!base) return null;
    const compra = mejorCompraParaSubirNota(estiloSugerido, base, placard, CATALOGO_CON_HSL);
    return compra ? { compra, actual: base.puntaje } : null;
  }, [estiloSugerido, poolSugeridosPorEstilo, placard]);

  // Unifica las dos fuentes de "sumá esto" en UNA sola tarjeta -- mostrar
  // dos a la vez (una por variedad, otra por puntaje) sería ruido si
  // apuntan a la misma prenda, y confuso si apuntan a prendas distintas.
  // mejorCompra manda cuando existe (sube la nota de verdad, la señal más
  // fuerte); si además coincide con lo que ya sugería sugerenciaVariedad,
  // se reusa su texto (explica el motivo puntual, no solo "sumá esto").
  // Sin mejorCompra pero con sugerenciaVariedad, se muestra esa igual --
  // sin el marco de puntaje, porque ahí no hay una mejora de nota
  // comprobada que mostrar.
  const tarjetaSugerencia = useMemo(() => {
    if (mejorCompra) {
      const mismaSugerencia = sugerenciaVariedad?.sugerida.id === mejorCompra.compra.sugerida.id;
      const nombreCat = CATEGORIA_LABEL[mejorCompra.compra.categoriaSugerida].toLowerCase();
      return {
        mensaje: mismaSugerencia
          ? sugerenciaVariedad!.mensaje
          : `Sumá "${mejorCompra.compra.sugerida.nombre}" (${nombreCat}) a tu outfit de ${ESTILO_LABEL[estiloSugerido as Estilo]}.`,
        sugerida: mejorCompra.compra.sugerida,
        actual: mejorCompra.actual,
        conSugerencia: mejorCompra.compra.puntaje,
      };
    }
    if (sugerenciaVariedad) {
      return { mensaje: sugerenciaVariedad.mensaje, sugerida: sugerenciaVariedad.sugerida, actual: undefined, conSugerencia: undefined };
    }
    return null;
  }, [mejorCompra, sugerenciaVariedad, estiloSugerido]);

  // Pedido explícito del usuario: cuando el pool queda vacío para el
  // estilo elegido, la razón casi siempre es que falta la prenda ANCLA
  // (sin pantalón/bermuda/short de ese registro no arma nada, aunque haya
  // de sobra sweaters, camisas o calzado de ese mismo estilo) -- avisarlo
  // con una sugerencia concreta de qué comprar, en vez de solo decir "no
  // armamos nada". Ver sugerenciaDeAncla en recommend.ts.
  const sugerenciaAncla = useMemo(() => {
    // climaSugerido === null: el pool está vacío porque todavía no
    // respondió esa pregunta, no porque falte una prenda ancla -- sin este
    // chequeo, la sugerencia de compra aparecía ANTES de que el usuario
    // llegara a elegir el clima, lo cual no tiene sentido (más abajo se
    // muestra el mensaje de "elegí el clima", no este).
    if (!estiloSugerido || estiloSugerido === "todos" || climaSugerido === null || poolSugeridosPorEstilo.length > 0) return null;
    return sugerenciaDeAncla(estiloSugerido, placard);
  }, [estiloSugerido, climaSugerido, poolSugeridosPorEstilo, placard]);

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
      const titulo = o.nombre ?? o.prendas.map((p) => descripcionPrenda(p)).join(" + ");
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

  // Bug real reportado por el usuario, con captura: la pantalla entera se
  // reemplazaba por "Todavía no guardaste ningún outfit... cargá algún
  // pantalón", pidiéndole GUARDAR un outfit a mano, aunque su placard real
  // ya tenía de sobra para que "Vestite hoy" arme sugerencias solo. Causa:
  // este chequeo usaba `poolSugeridos`, que desde la ronda del clima
  // arranca vacío hasta que el usuario responde ocasión Y clima (ver más
  // arriba) -- en una visita recién entrada a la pantalla, esas dos
  // preguntas todavía no se respondieron, así que `poolSugeridos` daba
  // `[]` SIEMPRE, sin importar cuántas prendas hubiera cargadas. Si además
  // el placard ya cubre todas las categorías (nada que sugerir comprar,
  // poolParaComprar también en cero) y todavía no guardó ningún outfit a
  // mano, las tres condiciones daban vacío a la vez -- exactamente el caso
  // real reportado. `hayAlgoQueSugerir` recalcula el pool SIN depender de
  // esas dos respuestas (con la estación real de hoy, solo para esta
  // pregunta de "¿hay algo que mostrar en esta pantalla?") -- Vestite hoy
  // sigue pidiendo la respuesta real para RENDERIZAR sus tarjetas, pero
  // ya no hace falta responderla para que la pantalla deje de verse vacía.
  const hayAlgoQueSugerir = useMemo(() => armarOutfitsSugeridos(placard, estacionActual()).length > 0, [placard]);
  const sinNada = outfits.length === 0 && !hayAlgoQueSugerir && poolParaComprar.length === 0;

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
          Elegí para qué ocasión te querés vestir y si hace frío, entretiempo o calor, y te armamos tu mejor opción
          con lo que ya tenés más otra combinación que contrasta de verdad en color -- distinto pantalón, calzado o
          torso, no solo una variante parecida -- "otras opciones" te da otro par distinto.
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

        {/* Pedido explícito del usuario: "quiero que en cada sección me
            preguntes si hace frío, entretiempo o calor" -- solo aparece
            después de elegir la ocasión (mismo criterio de "una pregunta a
            la vez" que ya usa esta sección), y filtra de verdad qué
            combinaciones tienen sentido real (ver armarOutfitsSugeridos en
            recommend.ts): un bermuda no arma nada con frío, y ni un
            pantalón largo combina con abrigo si elegís "Calor". */}
        {estiloSugerido !== null && (
          <div className="filtro-chips" role="group" aria-label="¿Hace frío, entretiempo o calor?" style={{ marginTop: "-0.35rem" }}>
            {CLIMAS_FILTRO.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip${climaSugerido === c ? " chip-activo" : ""}`}
                onClick={() => elegirClimaSugerido(c)}
              >
                {CLIMA_LABEL[c]}
              </button>
            ))}
          </div>
        )}

        {estiloSugerido === null ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Elegí una ocasión de arriba para ver tus opciones.
          </p>
        ) : climaSugerido === null ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            ¿Hace frío, entretiempo o calor? Elegí arriba para armar opciones que de verdad tengan sentido con el
            clima de hoy.
          </p>
        ) : poolSugeridosPorEstilo.length === 0 ? (
          <>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {estiloSugerido === "todos"
                ? "Todavía no armamos ninguna combinación con lo que tenés cargado -- cargá algún pantalón, bermuda o short: es la prenda ancla que arma el resto del outfit."
                : `No armamos ningún look ${ESTILO_LABEL[estiloSugerido]} todavía con lo que tenés cargado.${sugerenciaAncla ? "" : ` Mirá "Ideas para comprar" más abajo, o probá otra ocasión.`}`}
            </p>
            {sugerenciaAncla && (
              <div className="card" style={{ marginTop: "0.6rem", display: "flex", gap: "0.6rem", alignItems: "center" }}>
                <span style={{ fontSize: "1.2rem" }}>💡</span>
                <p style={{ margin: 0, fontSize: "0.85rem", flex: 1 }}>{sugerenciaAncla.mensaje}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", whiteSpace: "nowrap" }}
                  onClick={() => cargarSugerencia(sugerenciaAncla.sugerida)}
                >
                  + Cargar
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid-prendas outfits-grid">
              {opcionPrincipal ? (
                <TarjetaSugerido
                  s={opcionPrincipal}
                  etiquetaGrupo="Mejor opción"
                  estiloTab={estiloSugerido !== "todos" ? (estiloSugerido ?? undefined) : undefined}
                  guardadas={guardadas}
                  guardando={guardando}
                  errorGuardar={errorGuardar}
                  onGuardar={guardarSugerido}
                />
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Todavía no armamos ningún look para esta ocasión con lo que tenés cargado.
                </p>
              )}
              {opcionContraste ? (
                <TarjetaSugerido
                  s={opcionContraste}
                  etiquetaGrupo="Otra combinación"
                  estiloTab={estiloSugerido !== "todos" ? (estiloSugerido ?? undefined) : undefined}
                  guardadas={guardadas}
                  guardando={guardando}
                  errorGuardar={errorGuardar}
                  onGuardar={guardarSugerido}
                />
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Todavía no armamos una segunda opción con contraste real de color para esta ocasión con lo que
                  tenés cargado.
                </p>
              )}
            </div>
            {hayMasOpciones && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", marginTop: "0.6rem" }}
                onClick={() => setOffsetSugeridos((prev) => prev + 1)}
              >
                🔄 Otras opciones
              </button>
            )}
            {tarjetaSugerencia && (
              <div className="card" style={{ marginTop: "0.6rem", display: "flex", gap: "0.6rem", alignItems: "center" }}>
                <span style={{ fontSize: "1.2rem" }}>💡</span>
                <p style={{ margin: 0, fontSize: "0.85rem", flex: 1 }}>
                  {tarjetaSugerencia.actual !== undefined && (
                    <>
                      Tu mejor outfit hoy es un <strong>{tarjetaSugerencia.actual}/10</strong>.{" "}
                    </>
                  )}
                  {tarjetaSugerencia.mensaje}
                  {tarjetaSugerencia.conSugerencia !== undefined && (
                    <> Subiría a <strong>{tarjetaSugerencia.conSugerencia}/10</strong>.</>
                  )}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", whiteSpace: "nowrap" }}
                  onClick={() => cargarSugerencia(tarjetaSugerencia.sugerida)}
                >
                  + Cargar
                </button>
              </div>
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
                  <strong style={o.nombre ? { textTransform: "capitalize" } : undefined}>
                    {o.nombre ?? o.prendas.map((p) => descripcionPrenda(p)).join(" + ")}
                  </strong>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {leyenda(o.prendas)}
                  </p>
                  <PuntajeBadge prendas={o.prendas} />
                  <RegistroBadge prendas={o.prendas} estiloTab={filtroEstilo ?? undefined} />
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
                  <strong>{s.sugerida.nombre}</strong>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    con {leyenda(s.prendasPropias)}
                  </p>
                  <PuntajeBadge prendas={prendasOutfit} precomputado={{ puntaje: s.puntaje, explicacion: s.explicacionPuntaje }} />
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
                placeholder={editando.prendas.map((p) => descripcionPrenda(p)).join(" + ")}
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
