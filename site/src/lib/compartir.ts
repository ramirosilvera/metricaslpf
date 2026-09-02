/**
 * Genera una imagen (PNG) de un outfit para compartir -- pedido explícito
 * del usuario: "compartir como imagen y por WhatsApp", con foco en que sea
 * "visual, claro, y que se entienda qué se está compartiendo". Todo
 * client-side (canvas), sin subir nada a ningún lado ni depender de un
 * servicio de terceros -- mismo criterio que procesarFoto() en photo.ts,
 * ya establecido en esta app.
 *
 * La estrategia: el maniquí YA está renderizado como <svg> en el DOM (cada
 * outfit-card lo dibuja con Maniqui.tsx) -- en vez de re-renderizarlo
 * aparte, se serializa ESE svg real (XMLSerializer -> data URI -> Image) y
 * se pega en un canvas más grande, junto con el encabezado de marca y el
 * texto del outfit (el mismo texto que la propia tarjeta ya le muestra al
 * usuario, no uno inventado para la imagen).
 */

const ANCHO = 1080;
const COLOR_FONDO = "#fbf7f2";
const COLOR_MARCA = "#c8763f";
const COLOR_TITULO = "#2b241d";
const COLOR_TEXTO_MUTED = "#6b6259";

export interface DatosOutfitParaCompartir {
  titulo: string;
  leyenda: string;
  registro: string | null;
}

/** Parte pura (sin canvas/DOM) y por lo tanto testeable: corta un texto en
 *  líneas que entran en `anchoMax`, midiendo con la función de medida que
 *  le pasen (en un canvas real, ctx.measureText(t).width). Separado de
 *  generarImagenOutfit() a propósito para poder testear el algoritmo de
 *  wrap sin necesitar un canvas real (vitest corre en Node, sin DOM). */
export function envolverTexto(texto: string, anchoMax: number, medir: (t: string) => number): string[] {
  const palabras = texto.split(" ").filter(Boolean);
  if (palabras.length === 0) return [];

  const lineas: string[] = [];
  let actual = palabras[0];
  for (const palabra of palabras.slice(1)) {
    const candidata = `${actual} ${palabra}`;
    if (medir(candidata) <= anchoMax) {
      actual = candidata;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  lineas.push(actual);
  return lineas;
}

/** Dibuja el isotipo de la marca (la misma percha del favicon, ver
 *  site/public/*.png) directo en canvas -- mismas coordenadas que ese
 *  diseño (viewBox 0..100), para no depender de cargar un PNG aparte de
 *  forma asincrónica. */
function dibujarIsotipo(ctx: CanvasRenderingContext2D, x: number, y: number, escala: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(escala, escala);

  ctx.fillStyle = COLOR_MARCA;
  ctx.beginPath();
  ctx.arc(50, 50, 47, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = COLOR_FONDO;
  ctx.lineWidth = 6.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.arc(50, 22.5, 5.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(50, 28);
  ctx.lineTo(50, 35);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(50, 35);
  ctx.lineTo(16, 62);
  ctx.quadraticCurveTo(13, 64.3, 16.5, 65.3);
  ctx.lineTo(83.5, 65.3);
  ctx.quadraticCurveTo(87, 64.3, 84, 62);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/** Serializa un <svg> del DOM (el maniquí ya renderizado) a un HTMLImageElement
 *  cargado, vía data URI -- no hay recursos externos referenciados adentro
 *  (todo gradientes/patrones inline), así que no hay riesgo de "tainted
 *  canvas" por CORS. */
function svgAImagen(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clon = svg.cloneNode(true) as SVGSVGElement;
  // el <svg> en la tarjeta no trae width/height explícitos (los toma del
  // CSS, 100% del contenedor) -- sin eso, algunos navegadores rasterizan
  // el <img> con un tamaño por defecto chico/incorrecto.
  clon.setAttribute("width", "600");
  clon.setAttribute("height", "1300");
  const xml = new XMLSerializer().serializeToString(clon);
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo rasterizar el maniquí"));
    img.src = dataUri;
  });
}

const AREA_TOP = 150;
const AREA_ALTO_MANIQUI = 860;
const ANCHO_TEXTO = ANCHO - 140;
const ALTO_LINEA_TITULO = 56;
const ALTO_LINEA_LEYENDA = 42;
const ALTO_PILL = 56;
const ALTO_FOOTER = 76;

/** Dibuja el bloque de texto (título + leyenda + badge de registro) a
 *  partir de `yInicial`, y devuelve el `y` final -- se usa DOS veces: una
 *  con un canvas descartable solo para medir cuánto ocupa el texto (así se
 *  sabe el alto real que necesita el canvas final antes de crearlo), y otra
 *  para dibujarlo de verdad. Un outfit con pocas prendas ("Remera + Jean")
 *  y uno con muchas ("Sweater + Pantalón de vestir + Calzado + Cinturón +
 *  Bufanda") ocupan un alto de texto MUY distinto -- un alto de canvas fijo
 *  hacía que los outfits largos se superpusieran con el pie de página
 *  ("Armado con Mi ropa"), confirmado renderizando un caso real largo. */
function dibujarBloqueTexto(ctx: CanvasRenderingContext2D, datos: DatosOutfitParaCompartir, yInicial: number): number {
  let y = yInicial;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = COLOR_TITULO;
  ctx.font = "700 46px system-ui, -apple-system, sans-serif";
  for (const linea of envolverTexto(datos.titulo, ANCHO_TEXTO, (t) => ctx.measureText(t).width)) {
    ctx.fillText(linea, ANCHO / 2, y);
    y += ALTO_LINEA_TITULO;
  }

  y += 18;
  ctx.fillStyle = COLOR_TEXTO_MUTED;
  ctx.font = "400 32px system-ui, -apple-system, sans-serif";
  for (const linea of envolverTexto(datos.leyenda, ANCHO_TEXTO, (t) => ctx.measureText(t).width)) {
    ctx.fillText(linea, ANCHO / 2, y);
    y += ALTO_LINEA_LEYENDA;
  }

  if (datos.registro) {
    y += 26;
    ctx.font = "700 28px system-ui, -apple-system, sans-serif";
    const textoAncho = ctx.measureText(datos.registro).width;
    const padX = 28;
    const pillAncho = textoAncho + padX * 2;
    const pillX = (ANCHO - pillAncho) / 2;
    const pillY = y - ALTO_PILL / 2;
    ctx.fillStyle = "#f0ded0";
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillAncho, ALTO_PILL, ALTO_PILL / 2);
    ctx.fill();
    ctx.fillStyle = COLOR_MARCA;
    ctx.textBaseline = "middle";
    ctx.fillText(datos.registro, ANCHO / 2, y + 2);
    ctx.textBaseline = "alphabetic";
    y += ALTO_PILL / 2;
  }

  return y;
}

/**
 * Arma la imagen completa (encabezado de marca + maniquí + texto del
 * outfit) y devuelve el PNG como Blob, listo para descargar o compartir.
 * El alto del canvas se calcula en base al texto real del outfit (ver
 * dibujarBloqueTexto), no un valor fijo -- así un outfit con muchas
 * prendas no se corta ni se pisa con el pie de página.
 */
export async function generarImagenOutfit(
  svgManiqui: SVGSVGElement,
  datos: DatosOutfitParaCompartir,
): Promise<Blob> {
  const yTextoInicial = AREA_TOP + AREA_ALTO_MANIQUI + 70;

  // canvas descartable de 1x1 solo para medir texto (measureText no
  // depende del tamaño del canvas, solo de la fuente ya seteada en el ctx).
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) throw new Error("No se pudo obtener contexto 2D de canvas");
  const yTextoFinal = dibujarBloqueTexto(medidor, datos, yTextoInicial);
  const alto = Math.round(yTextoFinal + ALTO_FOOTER);

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener contexto 2D de canvas");

  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, ANCHO, alto);

  // encabezado de marca -- para que quien lo reciba por WhatsApp entienda
  // de entrada que es una combinación armada con la app, no una foto suelta.
  dibujarIsotipo(ctx, 56, 40, 0.52);
  ctx.fillStyle = COLOR_MARCA;
  ctx.font = "700 34px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("MI ROPA", 130, 68);

  // maniquí -- centrado, respetando el aspect ratio real del viewBox
  // "0 0 120 260" de Maniqui.tsx (120:260) en vez de estirarlo.
  const img = await svgAImagen(svgManiqui);
  const relacion = 120 / 260;
  const wManiqui = AREA_ALTO_MANIQUI * relacion;
  const xManiqui = (ANCHO - wManiqui) / 2;
  ctx.drawImage(img, xManiqui, AREA_TOP, wManiqui, AREA_ALTO_MANIQUI);

  // texto del outfit -- el mismo que ya ve el usuario en la tarjeta
  // (leyenda()/RegistroBadge en Outfits.tsx), no un texto inventado para
  // la imagen -- así lo que se comparte coincide con lo que se ve en la app.
  dibujarBloqueTexto(ctx, datos, yTextoInicial);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLOR_TEXTO_MUTED;
  ctx.font = "400 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("Armado con Mi ropa", ANCHO / 2, alto - 36);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el PNG"))), "image/png");
  });
}

/**
 * Comparte (o descarga, como fallback) el blob de imagen ya generado.
 *
 * WhatsApp NO tiene una API web pública para adjuntar un archivo por URL --
 * el link wa.me solo precarga TEXTO, nunca un archivo (confirmado
 * investigando la documentación real de WhatsApp antes de armar esto: no
 * existe un parámetro de adjunto en wa.me). La única forma real y legítima
 * de compartir una IMAGEN a WhatsApp desde una página web es el share
 * sheet nativo del sistema operativo (Web Share API con `files`), donde
 * WhatsApp aparece como una app más entre las opciones -- eso es lo que se
 * usa acá. En navegadores/dispositivos sin esa API (la mayoría de
 * desktop), se descarga el PNG en vez de fingir un botón de WhatsApp que
 * en realidad no podría adjuntar nada.
 */
export async function compartirOImagen(blob: Blob, nombreArchivo: string, tituloCompartir: string): Promise<"compartido" | "descargado" | "cancelado"> {
  const file = new File([blob], nombreArchivo, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: tituloCompartir });
      return "compartido";
    } catch (err) {
      // AbortError: el usuario cerró el share sheet sin elegir nada -- no
      // es un error real de la app, no hay que mostrar nada.
      if (err instanceof Error && err.name === "AbortError") return "cancelado";
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "descargado";
}
