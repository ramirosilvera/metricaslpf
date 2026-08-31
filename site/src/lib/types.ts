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
  | "tejido_grueso";

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
