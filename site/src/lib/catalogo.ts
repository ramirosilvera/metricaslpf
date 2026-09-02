import type { Categoria, Estacion, Estilo, Ocasion, Prenda, Textura } from "./types";
import { hexToHsl } from "./color";

export interface PresetPrenda {
  id: string;
  nombre: string;
  categoria: Categoria;
  colorHex: string;
  textura?: Textura;
  estilo?: Estilo;
  /** Ver Prenda.estilos_secundarios en types.ts. Se omite (== []) salvo en
   *  las pocas prendas donde de verdad funcionan en más de un registro. */
  estilosSecundarios?: Estilo[];
  ocasion?: Ocasion;
  estacion?: Estacion;
  /** Ver Prenda.suela_contraste en types.ts. Solo tiene sentido en calzado;
   *  se omite (== false) en el resto de las categorías. */
  suelaContraste?: boolean;
  /** Ver Prenda.requiere_cuello en types.ts. Solo tiene sentido en
   *  accesorios tipo corbata; se omite (== false) en el resto. */
  requiereCuello?: boolean;
  /** Ver Prenda.posicion_accesorio en types.ts. Solo tiene sentido en
   *  categoria="accesorio"; se omite (== "cintura", cinturón) en el resto. */
  posicionAccesorio?: "cuello" | "cintura";
}

/**
 * Catálogo fijo de prendas comunes, para agregar al placard con un toque en
 * vez de configurar categoría+color+tags a mano cada vez. Curado a
 * propósito, no generado -- criterios:
 *
 * - Cubre casual, ropa de oficina, urbana, clásica y deportiva (pedido
 *   explícito -- el catálogo original no tenía NINGUNA prenda con estilo
 *   "deportivo"), en las 10 categorías que soporta el placard (incluye
 *   bermuda y short_deportivo, agregadas después junto con pantalon como
 *   las tres categorías de "piernas"). Ver CatalogoPicker.tsx para cómo se
 *   agrupa/filtra esto en la UI.
 * - Colores reales y de uso común, no una paleta arcoíris -- para cada
 *   prenda, los 2-4 colores que de verdad se usan más (ej. camisa: blanca/
 *   celeste/negra, no "camisa violeta").
 * - `estilo`/`ocasion` se completan solo cuando son inequívocos para esa
 *   prenda (una camisa de oficina es "laburo" sin duda; un buzo, sea cual
 *   sea su color, es casual sin ambigüedad real -- por eso las 3 entradas
 *   de buzo sí llevan ocasion:"casual").
 * - `estacion` se deja vacía en la mayoría de las categorías: es la
 *   dimensión más dependiente del clima real de cada usuario (una remera
 *   blanca sirve en verano Y en entretiempo) -- forzar una estación ahí
 *   haría más daño que bien. EXCEPCIÓN, pedido explícito del usuario: los
 *   abrigos (buzo/sweater/campera) sí se tagean -- a diferencia de una
 *   remera, el nivel de abrigo real de la prenda determina sin ambigüedad
 *   si es de entretiempo o de invierno (un buzo de algodón no protege
 *   igual que una campera de pluma, sea cual sea el clima del usuario).
 *   Acolchado (pluma) y paño grueso -> invierno; el resto de los abrigos
 *   (lana fina, tejido grueso liviano, denim, nylon sin relleno) ->
 *   entretiempo -- ninguno queda sin tagear.
 * - `textura` solo cuando el nombre de la prenda ya la implica sin
 *   ambigüedad (zapatos de cuero -> cuero_liso, jean -> denim, campera de
 *   pluma -> acolchado, prenda con estilo "deportivo" -> poliester, pedido
 *   explícito del usuario). Las zapatillas y las camperas "genéricas"
 *   (negra, verde militar) quedan sin textura a propósito: el material
 *   varía demasiado (cuero, lona, nylon...) para asumir uno sin inventar un
 *   dato que no es real -- el calzado deportivo tampoco lleva "poliester"
 *   por el mismo motivo (suela de goma, entresuela de espuma: la prenda
 *   real no es "de tela").
 */
export const CATALOGO_PRENDAS: PresetPrenda[] = [
  // --- Remeras ---
  // #F5F5F5 (gris/blanco neutro, s=0) en vez de #F5F5F0 -- pedido explícito
  // del usuario: el tono anterior tenía una saturación de 20% (matiz
  // amarillento apenas perceptible), suficiente para que nombreColor()
  // (color.ts) lo clasificara como "Blanco roto" en vez de "Blanco" (el
  // umbral es s<=15). Mismo criterio para camisa-blanca más abajo.
  { id: "remera-blanca", nombre: "Remera blanca", categoria: "remera", colorHex: "#F5F5F5", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-negra", nombre: "Remera negra", categoria: "remera", colorHex: "#1A1A1A", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-gris", nombre: "Remera gris", categoria: "remera", colorHex: "#8C8C8C", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-azul-marino", nombre: "Remera azul marino", categoria: "remera", colorHex: "#1F2A44", textura: "algodon", estilo: "casual", ocasion: "casual" },
  // mismo beige (#D8C7A1) que ya usan pantalon-beige/jogger-beige/campera-
  // pluma-beige/bermuda-beige -- reusa el mismo tono en vez de inventar un
  // beige levemente distinto, mismo criterio que ya documenta el archivo
  // para mantener consistente la paleta entre categorías.
  { id: "remera-beige", nombre: "Remera beige", categoria: "remera", colorHex: "#D8C7A1", textura: "algodon", estilo: "casual", ocasion: "casual" },
  // rojo y rosa -- pedido explícito del usuario: "más variedad de colores
  // según usos y costumbres de la moda". El catálogo no tenía NINGÚN rojo
  // ni rosa en ninguna categoría, un vacío real (el rojo cereza es color de
  // acento confirmado por búsqueda web para la temporada actual; rosa es
  // básico habitual en remeras unisex). Al cargar estos dos hex reales se
  // encontraron y corrigieron dos casos más de nombreColor() mal
  // clasificado (ver color.ts/color.test.ts): un rosa pastel con h>=345
  // caía en "Rojo", y un mostaza (ver sweater-mostaza más abajo) caía en
  // "Naranja".
  { id: "remera-roja", nombre: "Remera roja", categoria: "remera", colorHex: "#B93A32", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-rosa", nombre: "Remera rosa", categoria: "remera", colorHex: "#E4A6B4", textura: "algodon", estilo: "casual", ocasion: "casual" },

  // --- Remeras deportivas (agregadas en la ampliación del catálogo: el
  // estilo "deportivo" no tenía NINGUNA prenda cargada en todo el catálogo
  // hasta acá, un vacío real, no una omisión menor). Pedido explícito del
  // usuario: textura "poliester" por defecto en toda prenda deportiva --
  // antes quedaban sin textura porque el enum no tenía un valor para tela
  // técnica sintética; ahora sí (mismo criterio para pantalón/short/campera
  // rompeviento deportivos más abajo). Zapatillas running quedan afuera a
  // propósito: son calzado, no una prenda de tela -- "poliéster" describiría
  // mal una zapatilla real (suela de goma, entresuela de espuma).
  { id: "remera-deportiva-negra", nombre: "Remera deportiva negra", categoria: "remera", colorHex: "#1A1A1A", textura: "poliester", estilo: "deportivo", ocasion: "casual" },
  { id: "remera-deportiva-gris", nombre: "Remera deportiva gris", categoria: "remera", colorHex: "#8C8C8C", textura: "poliester", estilo: "deportivo", ocasion: "casual" },

  // --- Camisas (oficina) ---
  // #F5F5F5 -- ver el comentario de remera-blanca más arriba. #FAFAF7
  // (s=23) también clasificaba como "Blanco roto" en vez de "Blanco".
  { id: "camisa-blanca", nombre: "Camisa blanca", categoria: "camisa", colorHex: "#F5F5F5", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  { id: "camisa-celeste", nombre: "Camisa celeste", categoria: "camisa", colorHex: "#B7D2EC", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  // "urbano" a propósito, no un descuido: una camisa negra lee más
  // "urban professional" que clásica, a diferencia de blanca/celeste/gris.
  // colorHex #1A1A1A -- mismo negro que las otras 16+ prendas "negro/negra"
  // del catálogo (remera-negra, buzo-negro, campera-negra, etc.). Antes
  // usaba #232323 (l=14), un dato inconsistente sin ninguna razón
  // documentada: nombreColor() lo leía "Gris oscuro" en vez de "Negro" --
  // exactamente el bug que reportó el usuario ("una cosa es un gris
  // oscuro y otra un negro").
  { id: "camisa-negra", nombre: "Camisa negra", categoria: "camisa", colorHex: "#1A1A1A", textura: "algodon", estilo: "urbano", ocasion: "laburo" },
  { id: "camisa-gris", nombre: "Camisa gris", categoria: "camisa", colorHex: "#9A9A94", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  { id: "camisa-cuadros", nombre: "Camisa a cuadros", categoria: "camisa", colorHex: "#4A5A3C", textura: "algodon", estilo: "urbano", ocasion: "casual" },
  // mismo beige que el resto del catálogo (ver remera-beige) -- clasico/
  // laburo, mismo registro que blanca/celeste/gris: una camisa beige es
  // tan de oficina como esas, no informal como la de cuadros.
  { id: "camisa-beige", nombre: "Camisa beige", categoria: "camisa", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "laburo" },

  // --- Pantalones ---
  { id: "jean-azul", nombre: "Jean azul", categoria: "pantalon", colorHex: "#3B5998", textura: "denim", estilo: "casual", ocasion: "casual" },
  // colorHex #1A1A1A -- ver el comentario de camisa-negra más arriba:
  // mismo negro estándar del catálogo, corrigiendo el mismo #232323
  // inconsistente que hacía que nombreColor() leyera "Gris oscuro".
  // estilo secundario "urbano" -- un jean negro es tan de calle/streetwear
  // (con campera y zapatillas urbanas) como de casual de todos los días;
  // sin esto el catálogo no tenía NINGÚN pantalón/jean/jogger "urbano" y
  // "Vestite hoy" nunca podía sugerir una prenda ancla para ese registro
  // (reporte real del usuario: la sección Urbano no armaba nada).
  { id: "jean-negro", nombre: "Jean negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "denim", estilo: "casual", estilosSecundarios: ["urbano"], ocasion: "casual" },
  { id: "pantalon-vestir-negro", nombre: "Pantalón de vestir negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "lana", estilo: "formal", ocasion: "laburo" },
  { id: "pantalon-vestir-gris", nombre: "Pantalón de vestir gris", categoria: "pantalon", colorHex: "#6E6E6E", textura: "lana", estilo: "formal", ocasion: "laburo" },
  { id: "pantalon-vestir-azul", nombre: "Pantalón de vestir azul marino", categoria: "pantalon", colorHex: "#1F2A44", textura: "lana", estilo: "formal", ocasion: "laburo" },
  // distinto de pantalon-beige de acá abajo (el chino, algodón/clasico) --
  // mismo beige del resto del catálogo, pero de vestir: lana/formal, igual
  // criterio que negro/gris/azul marino de arriba. No es una entrada
  // duplicada -- un chino y un pantalón de vestir son prendas distintas
  // aunque compartan color.
  { id: "pantalon-vestir-beige", nombre: "Pantalón de vestir beige", categoria: "pantalon", colorHex: "#D8C7A1", textura: "lana", estilo: "formal", ocasion: "laburo" },
  { id: "pantalon-beige", nombre: "Pantalón chino beige", categoria: "pantalon", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  // joggers -- casual como el jean (no "clasico" como el chino: no van a
  // la oficina), textura "algodon" sin ambigüedad porque el usuario la dio
  // así directamente. Colores reusados del resto del catálogo (negro
  // estándar, el mismo beige del chino, el gris de siempre) por la misma
  // razón de consistencia de paleta que ya documenta el resto del archivo.
  // mismo criterio que jean-negro de arriba -- un jogger negro es una
  // pieza urbana/streetwear tan estándar como casual.
  { id: "jogger-negro", nombre: "Jogger negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "algodon", estilo: "casual", estilosSecundarios: ["urbano"], ocasion: "casual" },
  { id: "jogger-beige", nombre: "Jogger beige", categoria: "pantalon", colorHex: "#D8C7A1", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "jogger-gris", nombre: "Jogger gris", categoria: "pantalon", colorHex: "#8C8C8C", textura: "algodon", estilo: "casual", ocasion: "casual" },
  // pantalón deportivo (entrenamiento) -- distinto del jogger de arriba:
  // mismo corte ancho, pero tela técnica sintética (poliéster), no algodón
  // (mismo criterio que la remera deportiva de arriba).
  { id: "pantalon-deportivo-negro", nombre: "Pantalón deportivo negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "poliester", estilo: "deportivo", ocasion: "casual" },
  // verde oscuro real (no el verde militar/oliva de campera-verde-militar
  // más abajo, que es otro tono): un verde bosque/botella, el típico de un
  // pantalón de entrenamiento, no un verde caqui desaturado.
  { id: "pantalon-deportivo-verde-oscuro", nombre: "Pantalón deportivo verde oscuro", categoria: "pantalon", colorHex: "#2F5233", textura: "poliester", estilo: "deportivo", ocasion: "casual" },

  // --- Bermudas (chino/algodón, hasta la rodilla) --- agregadas a pedido
  // explícito del usuario: el catálogo no tenía ninguna prenda de piernas
  // más corta que un pantalón largo. Mismo criterio de textura/estilo que
  // el pantalón chino de arriba -- de hecho es la misma prenda en versión
  // corta, así que reusa su mismo estilo ("clasico") y textura
  // ("algodon"). El beige/caqui es a propósito el color más asociado a
  // "bermuda" en el uso real, no una elección arbitraria.
  { id: "bermuda-beige", nombre: "Bermuda beige", categoria: "bermuda", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "casual" },
  { id: "bermuda-azul-marino", nombre: "Bermuda azul marino", categoria: "bermuda", colorHex: "#1F2A44", textura: "algodon", estilo: "clasico", ocasion: "casual" },
  // variante denim -- tan real como el jean largo de arriba, mismo criterio
  // de textura/estilo ("casual", no "clasico": un jean corto lee más
  // informal que un chino corto, igual que el jean largo vs. el pantalón
  // de vestir).
  { id: "bermuda-jean", nombre: "Bermuda de jean", categoria: "bermuda", colorHex: "#3B5998", textura: "denim", estilo: "casual", ocasion: "casual" },
  { id: "bermuda-gris", nombre: "Bermuda gris", categoria: "bermuda", colorHex: "#8C8C8C", textura: "algodon", estilo: "clasico", ocasion: "casual" },

  // --- Shorts deportivos (tela técnica, hasta medio muslo) --- distintos
  // de la bermuda de arriba, no una variante del mismo dibujo: son mucho
  // más cortos (Maniqui.tsx los dibuja hasta la mitad del muslo, la
  // bermuda hasta la rodilla) y de tela sintética (poliéster), no chino/
  // denim -- mismo criterio que la remera y el pantalón deportivos de arriba.
  { id: "short-deportivo-negro", nombre: "Short deportivo negro", categoria: "short_deportivo", colorHex: "#1A1A1A", textura: "poliester", estilo: "deportivo", ocasion: "casual" },
  { id: "short-deportivo-gris", nombre: "Short deportivo gris", categoria: "short_deportivo", colorHex: "#8C8C8C", textura: "poliester", estilo: "deportivo", ocasion: "casual" },
  { id: "short-deportivo-azul", nombre: "Short deportivo azul", categoria: "short_deportivo", colorHex: "#3366CC", textura: "poliester", estilo: "deportivo", ocasion: "casual" },

  // --- Buzos ---
  // estacion "entretiempo" en los 6 -- un buzo de tejido grueso liviano es
  // la capa que se usa solo (otoño/primavera) o debajo de una campera de
  // pluma en pleno invierno, pero nunca ES la protección de invierno por
  // sí solo (ver el criterio de abrigos al principio del archivo).
  { id: "buzo-gris", nombre: "Buzo gris", categoria: "buzo", colorHex: "#8C8C8C", textura: "tejido_grueso", estilo: "casual", ocasion: "casual", estacion: "entretiempo" },
  { id: "buzo-negro", nombre: "Buzo negro", categoria: "buzo", colorHex: "#1A1A1A", textura: "tejido_grueso", estilo: "casual", ocasion: "casual", estacion: "entretiempo" },
  { id: "buzo-azul-marino", nombre: "Buzo azul marino", categoria: "buzo", colorHex: "#1F2A44", textura: "tejido_grueso", estilo: "casual", ocasion: "casual", estacion: "entretiempo" },
  // mismo celeste que camisa-celeste (#B7D2EC) -- ver el criterio de
  // paleta consistente que ya documenta el archivo. "buzo" en esta app ya
  // ES un hoodie: TorsoCuerpo (Maniqui.tsx) le dibuja capucha a CUALQUIER
  // prenda categoria="buzo" sin excepción, así que no hace falta una
  // categoría nueva para "tipo hoodie" -- ya es lo que esta categoría
  // siempre fue.
  { id: "buzo-celeste", nombre: "Buzo celeste", categoria: "buzo", colorHex: "#B7D2EC", textura: "tejido_grueso", estilo: "casual", ocasion: "casual", estacion: "entretiempo" },
  // mismo beige (#D8C7A1) que ya usan pantalon-beige/bermuda-beige/etc. --
  // ver el comentario de remera-beige más arriba. estilo/ocasion/textura
  // igual que el resto de los buzos (casual/casual/tejido_grueso): el
  // color no cambia el registro de la prenda.
  { id: "buzo-beige", nombre: "Buzo beige", categoria: "buzo", colorHex: "#D8C7A1", textura: "tejido_grueso", estilo: "casual", ocasion: "casual", estacion: "entretiempo" },
  // verde botella -- color de tendencia confirmado por búsqueda web para
  // la temporada actual ("lo llevamos en camel, verde botella o negro").
  // Matiz bien distinto del verde militar/oliva (h=140, un verde bosque/
  // botella real) y del verde deportivo del pantalón (h=127 pero mucho más
  // desaturado) -- no una variante redundante.
  { id: "buzo-verde", nombre: "Buzo verde botella", categoria: "buzo", colorHex: "#1E5631", textura: "tejido_grueso", estilo: "casual", ocasion: "casual", estacion: "entretiempo" },

  // --- Sweaters (oficina/vestir) ---
  // estacion "entretiempo" en los 6 -- lana fina de pullover, la capa que
  // se lleva sola en otoño/primavera o debajo del tapado/campera de pluma
  // en pleno invierno (mismo criterio que los buzos de arriba: ninguno de
  // los dos ES la protección de invierno por sí solo).
  { id: "sweater-gris", nombre: "Sweater gris", categoria: "sweater", colorHex: "#8C8C8C", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "entretiempo" },
  { id: "sweater-azul-marino", nombre: "Sweater azul marino", categoria: "sweater", colorHex: "#1F2A44", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "entretiempo" },
  { id: "sweater-bordo", nombre: "Sweater bordo", categoria: "sweater", colorHex: "#6B2737", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "entretiempo" },
  // colorHex #1A1A1A -- ver el comentario de camisa-negra más arriba: el
  // reporte real del usuario que motivó esta corrección era justo este
  // sweater ("tengo un suéter negro que dice gris oscuro").
  { id: "sweater-negro", nombre: "Sweater negro", categoria: "sweater", colorHex: "#1A1A1A", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "entretiempo" },
  // mismo beige que el resto del catálogo -- clasico/laburo, mismo
  // registro que el resto de los sweaters (gris/marino/bordo/negro): un
  // sweater beige es tan de oficina como esos.
  { id: "sweater-beige", nombre: "Sweater beige", categoria: "sweater", colorHex: "#D8C7A1", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "entretiempo" },
  // mostaza -- color evergreen de sweater de oficina/entretiempo, tan
  // estándar como bordó/azul marino/gris de acá arriba. Este hex real
  // (h=40, s=62, l=47) fue justamente el que encontró el bug de
  // nombreColor() clasificándolo como "Naranja" -- ver color.ts.
  // Estilo secundario "casual" a propósito -- el mismo sweater mostaza que
  // se usa con pantalón de vestir para la oficina funciona igual de bien
  // sobre un jean para un finde (ejemplo real que dio el usuario al pedir
  // soporte multi-estilo). "clasico" sigue siendo el principal: define el
  // registro del outfit cuando esta prenda es el ancla.
  {
    id: "sweater-mostaza",
    nombre: "Sweater mostaza",
    categoria: "sweater",
    colorHex: "#C3922E",
    textura: "lana",
    estilo: "clasico",
    estilosSecundarios: ["casual"],
    ocasion: "laburo",
    estacion: "entretiempo",
  },

  // --- Calzado ---
  // Las zapatillas negras y marrones aparecen dos veces a propósito -- una
  // versión monocromática de verdad (suela a tono, tan real como la de
  // suela blanca) y otra con la suela de goma en blanco/crema, que es el
  // otro look real y común. Ninguna de las dos es "la correcta": conviven
  // como dos prendas distintas (`suelaContraste`, ver types.ts) para que el
  // catálogo no le imponga una sola variante a todas las zapatillas del
  // mismo color -- eso fue justamente el error de una revisión anterior.
  { id: "zapatillas-blancas", nombre: "Zapatillas blancas", categoria: "calzado", colorHex: "#F5F5F0", estilo: "urbano", ocasion: "casual" },
  { id: "zapatillas-negras", nombre: "Zapatillas negras", categoria: "calzado", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual" },
  { id: "zapatillas-negras-suela-blanca", nombre: "Zapatillas negras (suela blanca)", categoria: "calzado", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual", suelaContraste: true },
  { id: "zapatillas-grises", nombre: "Zapatillas grises", categoria: "calzado", colorHex: "#8C8C8C", estilo: "urbano", ocasion: "casual" },
  // sin textura a propósito, mismo criterio que las demás -- una etiqueta
  // real de composición de zapatilla ("capellada 85% sintético / 15%
  // cuero, forro 100% textil sintético") no es "cuero" para nada del
  // motor: la mayoría es sintético, y ninguna Textura del enum describe
  // "sintético" sin inventar un dato que la prenda real no tiene.
  { id: "zapatillas-azul-marino", nombre: "Zapatillas azul marino", categoria: "calzado", colorHex: "#1F2A44", estilo: "urbano", ocasion: "casual" },
  // marrón de gamuza/lona (mate), distinto del marrón de cuero lustroso de
  // los zapatos de vestir un par de líneas más abajo -- son materiales que
  // se ven distintos en la vida real, no el mismo color reusado sin razón.
  { id: "zapatillas-marrones", nombre: "Zapatillas marrones", categoria: "calzado", colorHex: "#6F4E37", estilo: "urbano", ocasion: "casual" },
  { id: "zapatillas-marrones-suela-blanca", nombre: "Zapatillas marrones (suela blanca)", categoria: "calzado", colorHex: "#6F4E37", estilo: "urbano", ocasion: "casual", suelaContraste: true },
  { id: "zapatos-cuero-negro", nombre: "Zapatos de cuero negros", categoria: "calzado", colorHex: "#1C1210", textura: "cuero_liso", estilo: "formal", ocasion: "laburo" },
  { id: "zapatos-cuero-marron", nombre: "Zapatos de cuero marrones", categoria: "calzado", colorHex: "#5C3A21", textura: "cuero_liso", estilo: "formal", ocasion: "laburo" },
  // zapatillas de running -- distintas de las "zapatillas" urbanas de
  // arriba (mismo criterio de siempre: el estilo importa más que el color
  // acá, es la sección que estaba vacía en el catálogo).
  { id: "zapatillas-running-blancas", nombre: "Zapatillas running blancas", categoria: "calzado", colorHex: "#F5F5F0", estilo: "deportivo", ocasion: "casual" },
  { id: "zapatillas-running-negras", nombre: "Zapatillas running negras", categoria: "calzado", colorHex: "#1A1A1A", estilo: "deportivo", ocasion: "casual" },

  // --- Camperas ---
  // "entretiempo" en negra/jean/verde militar/piloto -- ninguna lleva
  // relleno (bomber/utility/denim/nylon liviano sin forro): cortan viento
  // pero no abrigan como una pluma o un paño de invierno real.
  { id: "campera-negra", nombre: "Campera negra", categoria: "campera", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual", estacion: "entretiempo" },
  { id: "campera-jean", nombre: "Campera de jean", categoria: "campera", colorHex: "#5B7FA6", textura: "denim", estilo: "casual", ocasion: "casual", estacion: "entretiempo" },
  { id: "campera-verde-militar", nombre: "Campera verde militar", categoria: "campera", colorHex: "#5A5F3D", estilo: "urbano", ocasion: "casual", estacion: "entretiempo" },
  // piloto -- no es un rompeviento deportivo (más abajo) ni una campera de
  // vestir: es la campera de lluvia liviana/impermeable de uso diario
  // (nylon/microfibra), verificado por búsqueda web. Sin textura a
  // propósito: es nylon/microfibra impermeable, no la misma tela técnica de
  // punto/poliéster que sí lleva el rompeviento de acá abajo -- ninguna
  // Textura del enum describe "nylon impermeable" sin inventar un dato que
  // la prenda real no tiene. "urbano", no "deportivo": se usa a diario en
  // la calle, no para entrenar (mismo criterio que campera-negra, no
  // camisa-negra) -- por eso tampoco entra en el "poliéster por defecto"
  // que sí aplica a las prendas con estilo "deportivo".
  { id: "campera-piloto-negra", nombre: "Campera piloto negra", categoria: "campera", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual", estacion: "entretiempo" },
  // sweater con cierre -- de punto/lana, no un buzo ni un sweater sin
  // cierre (esos ya están en sus propias categorías): es una prenda de
  // punto que se usa COMO campera, así que va en categoria="campera" con
  // textura "lana" (verificado por búsqueda web: "campera de lana con
  // cierre"), mismo estilo/ocasion que el resto de los sweaters de vestir
  // (clasico/laburo) -- es la misma idea de prenda, solo con cierre en vez
  // de cuello redondo/pullover. Lana fina de punto, no paño grueso -> mismo
  // criterio "entretiempo" que los sweaters de arriba, no invierno.
  { id: "campera-sweater-azul-marino", nombre: "Campera sweater azul marino", categoria: "campera", colorHex: "#1F2A44", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "entretiempo" },
  // pluma/puffer (tipo Uniqlo, ajustada al cuerpo) -- colores reusados de
  // otras categorías, ver criterio de "Accesorios" más abajo. "invierno":
  // acolchado/relleno real, es la protección real contra el frío, a
  // diferencia de todas las camperas de arriba (ver el criterio de abrigos
  // al principio del archivo).
  { id: "campera-pluma-negra", nombre: "Campera de pluma negra", categoria: "campera", colorHex: "#1A1A1A", textura: "acolchado", estilo: "casual", ocasion: "casual", estacion: "invierno" },
  { id: "campera-pluma-azul-marino", nombre: "Campera de pluma azul marino", categoria: "campera", colorHex: "#1F2A44", textura: "acolchado", estilo: "casual", ocasion: "casual", estacion: "invierno" },
  { id: "campera-pluma-beige", nombre: "Campera de pluma beige", categoria: "campera", colorHex: "#D8C7A1", textura: "acolchado", estilo: "casual", ocasion: "casual", estacion: "invierno" },
  // pluma oversize (tipo campera retro estilo Nuptse: mucho más grande y
  // abrigada que la de arriba, silueta voluminosa en vez de ajustada al
  // cuerpo) -- pedido explícito del usuario, distinguiéndola de la
  // Uniqlo-type de arriba. La diferencia real es de silueta/volumen, no de
  // material (misma tela acolchada/pluma) -- por eso también es "invierno",
  // igual que las tres de arriba -- y se distingue por nombre, mismo patrón
  // que ya usa "(suela blanca)" en las zapatillas. "urbano" en vez de
  // "casual": el volumen exagerado es un statement de calle, no una
  // campera básica.
  { id: "campera-pluma-negra-oversize", nombre: "Campera de pluma negra (oversize)", categoria: "campera", colorHex: "#1A1A1A", textura: "acolchado", estilo: "urbano", ocasion: "casual", estacion: "invierno" },
  // rompeviento -- deportivo, distinto de la campera de jean/pluma de
  // arriba (esas son casual/urbano, no para entrenar). Poliéster por
  // defecto, mismo criterio que el resto de las prendas "deportivo".
  // "entretiempo": corta viento/llovizna pero no tiene relleno térmico --
  // no protege del frío real de invierno.
  { id: "campera-rompeviento-negra", nombre: "Campera rompeviento negra", categoria: "campera", colorHex: "#1A1A1A", textura: "poliester", estilo: "deportivo", ocasion: "casual", estacion: "entretiempo" },
  { id: "campera-rompeviento-azul", nombre: "Campera rompeviento azul", categoria: "campera", colorHex: "#3366CC", textura: "poliester", estilo: "deportivo", ocasion: "casual", estacion: "entretiempo" },
  // tapado/sobretodo de paño -- pedido explícito del usuario ("agregá
  // prendas si es necesario" al diferenciar abrigos de invierno):
  // revisando el catálogo, TODAS las prendas de invierno real (acolchado)
  // eran casual/urbano -- un look clásico/formal de invierno no tenía
  // ninguna campera propia, solo le quedaba combinar con una pluma
  // deportiva-casual, algo que no pasa en la vida real (un tapado de paño
  // es la prenda de abrigo estándar sobre un traje o pantalón de vestir,
  // no una campera de pluma). Gris carbón -- combina con el pantalón/
  // sweater gris ya existentes y no repite el negro/azul marino que ya
  // domina el resto de camperas clásicas. Textura "lana": el paño de
  // tapado es lana tejida apretada, la aproximación más cercana que tiene
  // el enum sin inventar una textura "paño" que no existe.
  { id: "tapado-pano-gris", nombre: "Tapado de paño gris", categoria: "campera", colorHex: "#4A4A4A", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "invierno" },

  // --- Accesorios ---
  // Reusa hex ya presentes en otras categorías (azul marino, bordo) a
  // propósito, no por pereza: mantiene la consistencia cross-categoría del
  // catálogo (una corbata azul marino combina con las prendas azul marino
  // ya cargadas, no con un azul ligeramente distinto).
  { id: "cinturon-negro", nombre: "Cinturón negro de cuero", categoria: "accesorio", colorHex: "#1A1A1A", textura: "cuero_liso", estilo: "clasico" },
  { id: "cinturon-marron", nombre: "Cinturón marrón de cuero", categoria: "accesorio", colorHex: "#5C3A21", textura: "cuero_liso", estilo: "clasico" },
  { id: "corbata-azul-marino", nombre: "Corbata azul marino", categoria: "accesorio", colorHex: "#1F2A44", textura: "seda", estilo: "formal", ocasion: "laburo", requiereCuello: true, posicionAccesorio: "cuello" },
  { id: "corbata-bordo", nombre: "Corbata bordo", categoria: "accesorio", colorHex: "#6B2737", textura: "seda", estilo: "formal", ocasion: "laburo", requiereCuello: true, posicionAccesorio: "cuello" },
  // roja -- la corbata de vestir más clásica que existe ("power tie"), un
  // vacío real en un catálogo que hasta ahora solo tenía azul marino/bordó.
  { id: "corbata-roja", nombre: "Corbata roja", categoria: "accesorio", colorHex: "#A6332B", textura: "seda", estilo: "formal", ocasion: "laburo", requiereCuello: true, posicionAccesorio: "cuello" },
  { id: "bufanda-gris", nombre: "Bufanda gris", categoria: "accesorio", colorHex: "#8C8C8C", textura: "lana", estilo: "casual", ocasion: "casual", posicionAccesorio: "cuello" },
  // roja -- mismo hex que remera-roja de arriba, mismo criterio de paleta
  // consistente que ya documenta el archivo (una bufanda roja combina con
  // la remera roja ya cargada, no con un rojo ligeramente distinto). Color
  // de acento típico de bufanda de invierno.
  { id: "bufanda-roja", nombre: "Bufanda roja", categoria: "accesorio", colorHex: "#B93A32", textura: "lana", estilo: "casual", ocasion: "casual", posicionAccesorio: "cuello" },
];

/** Deriva h/s/l de cada preset una sola vez (no en cada render). */
export const CATALOGO_CON_HSL = CATALOGO_PRENDAS.map((p) => ({
  ...p,
  hsl: hexToHsl(p.colorHex),
}));

/** Convierte un preset del catálogo en una Prenda sintética -- misma forma
 *  que una fila real de Supabase, para poder pasarla a Maniqui/recomendar()
 *  sin que les importe que no está guardada. Se usa para mostrar "esto es
 *  lo que te sugerimos comprar" en Outfits (armarOutfitsParaComprar en
 *  recommend.ts). El id lleva el prefijo "sugerida-" a propósito: es lo que
 *  Outfits.tsx usa para marcar visualmente esa prenda como "no la tenés
 *  todavía" en el maniquí, y para no intentar guardarla como si fuera una
 *  prenda real del usuario. */
export function presetAPrendaSintetica(preset: PresetPrenda & { hsl: { h: number; s: number; l: number } }): Prenda {
  return {
    id: `sugerida-${preset.id}`,
    user_id: "",
    categoria: preset.categoria,
    color_hex: preset.colorHex,
    color_h: preset.hsl.h,
    color_s: preset.hsl.s,
    color_l: preset.hsl.l,
    textura: preset.textura ?? null,
    estilo: preset.estilo ?? null,
    estilos_secundarios: preset.estilosSecundarios ?? [],
    ocasion: preset.ocasion ?? null,
    estacion: preset.estacion ?? null,
    foto_path: null,
    suela_contraste: preset.suelaContraste ?? false,
    requiere_cuello: preset.requiereCuello ?? false,
    posicion_accesorio: preset.posicionAccesorio ?? "cintura",
    created_at: "",
    updated_at: "",
  };
}
