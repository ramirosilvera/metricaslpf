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
  | "accesorio";

export type Textura =
  | "algodon"
  | "seda"
  | "cuero_liso"
  | "lino"
  | "lana"
  | "pana"
  | "corderoy"
  | "tejido_grueso"
  | "denim"
  | "acolchado"
  | "poliester";

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
 *  que arman sus candidatas a partir de este mapa). */
export const CATEGORIAS_COMPLEMENTARIAS: Record<Categoria, Categoria[]> = {
  pantalon: ["remera", "buzo", "sweater", "camisa", "campera", "calzado", "accesorio"],
  bermuda: ["remera", "buzo", "sweater", "camisa", "campera", "calzado", "accesorio"],
  short_deportivo: ["remera", "buzo", "sweater", "camisa", "campera", "calzado", "accesorio"],
  remera: ["pantalon", "bermuda", "short_deportivo", "campera", "calzado", "accesorio"],
  buzo: ["pantalon", "bermuda", "short_deportivo", "calzado", "accesorio"],
  sweater: ["pantalon", "bermuda", "short_deportivo", "calzado", "accesorio"],
  camisa: ["pantalon", "bermuda", "short_deportivo", "campera", "calzado", "accesorio"],
  calzado: ["pantalon", "bermuda", "short_deportivo", "remera", "buzo", "sweater", "camisa", "campera"],
  campera: ["pantalon", "bermuda", "short_deportivo", "remera", "camisa", "calzado", "accesorio"],
  accesorio: ["pantalon", "bermuda", "short_deportivo", "remera", "buzo", "sweater", "camisa", "campera", "calzado"],
};
