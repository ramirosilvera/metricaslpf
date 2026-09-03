export type Categoria =
  | "pantalon"
  | "bermuda"
  | "short_deportivo"
  | "remera"
  | "buzo"
  | "sweater"
  | "camisa"
  | "calzado"
  | "campera"
  | "accesorio"
  | "saco";

export type Textura =
  | "algodon"
  | "seda"
  | "cuero_liso"
  | "lino"
  | "lana"
  | "pana"
  | "corderoy"
  | "tejido_grueso"
  | "frisado"
  | "denim"
  | "acolchado"
  | "poliester"
  | "viscosa";

export type Estilo = "casual" | "formal" | "deportivo" | "urbano" | "clasico";
export type Ocasion = "casual" | "laburo" | "formal";
export type Estacion = "verano" | "invierno" | "entretiempo";

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface Prenda {
  id: string;
  user_id: string;
  categoria: Categoria;
  color_hex: string;
  color_h: number;
  color_s: number;
  color_l: number;
  textura: Textura | null;
  estilo: Estilo | null;
  /** Estilos ADICIONALES en los que esta prenda también funciona, más allá
   *  del `estilo` principal -- pedido explícito del usuario: "algunas
   *  prendas pueden funcionar para más de un estilo" (ej. un sweater
   *  mostaza tan válido para oficina/clásico como para un fin de semana
   *  casual). `estilo` sigue siendo el único que define el registro del
   *  outfit completo (ver registroOutfit en recommend.ts, sin cambios) --
   *  esto solo amplía CONTRA qué otras prendas combina sin choque de
   *  registro. Vacío por defecto: no se inventa versatilidad que el
   *  usuario no cargó. */
  estilos_secundarios: Estilo[];
  ocasion: Ocasion | null;
  estacion: Estacion | null;
  foto_path: string | null;
  /** Detalle real de la prenda (no una regla automática por categoría): la
   *  típica zapatilla con la suela de goma en blanco/crema en vez del color
   *  de la zapatilla en sí. Por defecto false -- una zapatilla o zapato
   *  puede perfectamente ser monocromático de verdad. Solo aplica visualmente
   *  a calzado (Maniqui.tsx la ignora para el resto de las categorías). */
  suela_contraste: boolean;
  /** Detalle real de la prenda, mismo criterio que suela_contraste: una
   *  corbata (hoy la única prenda del catálogo con esto en true) necesita
   *  una camisa con cuello debajo -- combinarla con un buzo, remera o
   *  sweater no es una cuestión de color, es que físicamente no hay dónde
   *  apoyarla. Por defecto false: un cinturón o una bufanda no tienen esta
   *  restricción. */
  requiere_cuello: boolean;
  /** Dónde se usa la prenda en el cuerpo -- solo tiene sentido en
   *  categoria="accesorio" (el resto la ignora). Un cinturón va en la
   *  cintura; una corbata o una bufanda van al cuello, aunque solo la
   *  corbata requiere_cuello para combinar. Sin este dato, PrendaIcon y
   *  Maniqui no tenían forma de saber si dibujar el accesorio como tira de
   *  cintura o como algo que cuelga del cuello -- terminaban dibujando
   *  cinturón, corbata y bufanda con el mismo ícono. Default 'cintura'
   *  preserva el dibujo original (el único que existía antes de esta
   *  columna). */
  posicion_accesorio: "cuello" | "cintura";
  /** Detalle real de la prenda, solo tiene sentido en categoria="buzo" (el
   *  resto la ignora) -- pedido explícito del usuario, revisado como
   *  modista/ingeniero textil: no todos los buzos son hoodie. Antes de esta
   *  columna, TorsoCuerpo (Maniqui.tsx) le dibujaba capucha a CUALQUIER
   *  buzo sin excepción -- un buzo crewneck real (sin capucha) se mostraba
   *  con una que no tiene. Default true: preserva el dibujo de todos los
   *  buzos ya cargados (el catálogo hasta ahora era 100% hoodie), y solo
   *  las prendas puntuales sin capucha (verificadas contra el placard real)
   *  pasan a false explícitamente. El peso/grosor de la tela (liviano vs.
   *  pesado/frisado) es un dato de TEXTURA (ver Textura arriba, valor
   *  "frisado"), no de estación -- pedido explícito del usuario: "tampoco
   *  los llamaría de invierno o de entretiempo" a diferencia de sweater/
   *  campera, que sí se tagean por estación (ver catalogo.ts). */
  con_capucha: boolean;
  created_at: string;
  updated_at: string;
}

/** Texto visible por categoría -- la UI mostraba `p.categoria` crudo con
 *  text-transform:capitalize en varios lugares (Placard, Outfits, Probar,
 *  Recomendaciones), algo que funcionaba solo de casualidad porque todas
 *  las categorías eran una sola palabra sin guion bajo. short_deportivo
 *  rompe ese supuesto -- capitalize no saca el "_", así que se vería
 *  literalmente "Short_deportivo" en tarjetas y leyendas reales. El resto
 *  de las categorías quedan con el mismo string crudo que ya tenían (para
 *  no cambiar nada de lo que ya se veía bien) -- el único valor que cambia
 *  de verdad es short_deportivo, reemplazando el guion bajo por un espacio. */
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  pantalon: "pantalon",
  bermuda: "bermuda",
  short_deportivo: "short deportivo",
  remera: "remera",
  buzo: "buzo",
  sweater: "sweater",
  camisa: "camisa",
  calzado: "calzado",
  campera: "campera",
  accesorio: "accesorio",
  saco: "saco",
};

/** Etiqueta más específica que CATEGORIA_LABEL para una prenda puntual --
 *  pedido explícito del usuario: "estaría bueno que las prendas den más
 *  información y al menos aclare pantalón de Jean" (reportando que un jean
 *  cargado en el placard se veía, en toda la app, solo como "pantalon"
 *  genérico). Deriva el nombre de categoria+textura(+estilo/con_capucha) ya
 *  cargados -- no un campo nuevo a mano: así nunca queda desactualizado
 *  respecto de la prenda real, y una prenda agregada por foto (sin pasar
 *  por el catálogo) también se beneficia en cuanto tenga textura cargada.
 *  Solo cubre combinaciones donde categoria+textura(+lo que haga falta)
 *  identifican la prenda SIN AMBIGÜEDAD contra el resto del catálogo real
 *  (ej. campera+lana se deja afuera a propósito: puede ser un tapado de
 *  paño o una campera-sweater, dos prendas reales distintas con la misma
 *  textura -- no hay forma de saber cuál sin inventar). Cuando no hay un
 *  patrón inequívoco, cae en CATEGORIA_LABEL capitalizado, el mismo texto
 *  genérico que ya se mostraba. */
export function descripcionPrenda(p: Prenda): string {
  if ((p.categoria === "pantalon" || p.categoria === "bermuda") && p.textura) {
    const esPantalon = p.categoria === "pantalon";
    if (p.textura === "denim") return esPantalon ? "Jean" : "Bermuda de jean";
    if (p.textura === "lana") return esPantalon ? "Pantalón de vestir" : "Bermuda de vestir";
    if (p.textura === "poliester") return esPantalon ? "Pantalón deportivo" : "Bermuda deportiva";
    if (p.textura === "algodon" && esPantalon) return p.estilo === "clasico" ? "Pantalón chino" : "Jogger";
  }
  if (p.categoria === "buzo") return p.con_capucha ? "Buzo con capucha" : "Buzo sin capucha";
  if (p.categoria === "sweater" && p.textura && p.textura !== "lana") return "Sweater liviano";
  if (p.categoria === "campera") {
    if (p.textura === "denim") return "Campera de jean";
    if (p.textura === "acolchado") return "Campera de pluma";
  }
  const generico = CATEGORIA_LABEL[p.categoria];
  return generico.charAt(0).toUpperCase() + generico.slice(1);
}

/** Texto visible por estación, mismo criterio que ESTILO_LABEL en
 *  recommend.ts (capitalizado, no el valor crudo del enum) -- pedido
 *  explícito del usuario: un filtro real de "mostrame solo mis abrigos de
 *  invierno" en Placard. */
export const ESTACION_LABEL: Record<Estacion, string> = {
  verano: "Verano",
  invierno: "Invierno",
  entretiempo: "Entretiempo",
};

export type NivelCompatibilidad = "excelente" | "muy_bueno" | "con_cuidado";

export interface Recomendacion {
  prenda: Prenda;
  nivel: NivelCompatibilidad;
  tag?: "tono_sobre_tono" | "combinacion_audaz";
  explicacion: string;
  tecnicaRescate?: string;
}

/** Categorías que se sugieren como complemento de cada categoría base.
 *  bermuda/short_deportivo son, como pantalon, prendas "de piernas" -- se
 *  agregan con la misma lista de complementos que pantalon (en su propia
 *  entrada) y se suman a la lista de todas las categorías de torso/calzado/
 *  accesorio que ya incluían a pantalon, para no dejarlas fuera de la
 *  pantalla "Combinar" ni de "Probar antes de comprar" (las dos pantallas
 *  que arman sus candidatas a partir de este mapa).
 *
 *  saco -- pedido explícito del usuario ("un traje azul marino"), revisado
 *  como modista: a diferencia de campera (que sí combina con bermuda/short_
 *  deportivo/remera -- una campera urbana con un jean o hasta con un short
 *  deportivo es un combo real de calle), un saco de traje NUNCA combina con
 *  ropa deportiva/de entrecasa real -- por eso su propia entrada, y las
 *  entradas donde aparece, son más angostas que las de campera: solo
 *  pantalón (de vestir), camisa, calzado y accesorio. No aparece en
 *  bermuda/short_deportivo/remera/buzo/sweater (mismo criterio que ya
 *  excluye a campera de buzo/sweater: no se combinan dos capas de afuera
 *  del torso a la vez) ni dentro de la propia entrada de campera (son
 *  capas mutuamente excluyentes, un saco de traje no se usa arriba ni
 *  abajo de una campera). */
export const CATEGORIAS_COMPLEMENTARIAS: Record<Categoria, Categoria[]> = {
  pantalon: ["remera", "buzo", "sweater", "camisa", "campera", "saco", "calzado", "accesorio"],
  bermuda: ["remera", "buzo", "sweater", "camisa", "campera", "calzado", "accesorio"],
  short_deportivo: ["remera", "buzo", "sweater", "camisa", "campera", "calzado", "accesorio"],
  remera: ["pantalon", "bermuda", "short_deportivo", "campera", "calzado", "accesorio"],
  buzo: ["pantalon", "bermuda", "short_deportivo", "calzado", "accesorio"],
  sweater: ["pantalon", "bermuda", "short_deportivo", "calzado", "accesorio"],
  camisa: ["pantalon", "bermuda", "short_deportivo", "campera", "saco", "calzado", "accesorio"],
  calzado: ["pantalon", "bermuda", "short_deportivo", "remera", "buzo", "sweater", "camisa", "campera", "saco"],
  campera: ["pantalon", "bermuda", "short_deportivo", "remera", "camisa", "calzado", "accesorio"],
  accesorio: ["pantalon", "bermuda", "short_deportivo", "remera", "buzo", "sweater", "camisa", "campera", "saco", "calzado"],
  saco: ["pantalon", "camisa", "calzado", "accesorio"],
};
