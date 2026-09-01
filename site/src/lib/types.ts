export type Categoria =
  | "pantalon"
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
  | "acolchado";

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

export type NivelCompatibilidad = "excelente" | "muy_bueno" | "con_cuidado";

export interface Recomendacion {
  prenda: Prenda;
  nivel: NivelCompatibilidad;
  tag?: "tono_sobre_tono" | "combinacion_audaz";
  explicacion: string;
  tecnicaRescate?: string;
}

/** Categorías que se sugieren como complemento de cada categoría base. */
export const CATEGORIAS_COMPLEMENTARIAS: Record<Categoria, Categoria[]> = {
  pantalon: ["remera", "buzo", "sweater", "camisa", "campera", "calzado", "accesorio"],
  remera: ["pantalon", "campera", "calzado", "accesorio"],
  buzo: ["pantalon", "calzado", "accesorio"],
  sweater: ["pantalon", "calzado", "accesorio"],
  camisa: ["pantalon", "campera", "calzado", "accesorio"],
  calzado: ["pantalon", "remera", "buzo", "sweater", "camisa", "campera"],
  campera: ["pantalon", "remera", "camisa", "calzado", "accesorio"],
  accesorio: ["pantalon", "remera", "buzo", "sweater", "camisa", "campera", "calzado"],
};
