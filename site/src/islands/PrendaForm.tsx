import { useEffect, useRef, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { hexToHsl, hslToHex } from "../lib/color";
import { procesarFoto } from "../lib/photo";
import { CATALOGO_PRENDAS, type PresetPrenda } from "../lib/catalogo";
import { ESTILO_LABEL } from "../lib/recommend";
import { CATEGORIA_LABEL, type Calce, type Categoria, type CorteCalzado, type Estacion, type Estilo, type Ocasion, type Patron, type Textura } from "../lib/types";
import CatalogoPicker from "./CatalogoPicker";
import ConfigWarning from "./ConfigWarning";

const CATEGORIAS: Categoria[] = [
  "pantalon",
  "bermuda",
  "short_deportivo",
  "remera",
  "buzo",
  "sweater",
  "camisa",
  "calzado",
  "campera",
  "saco",
  "accesorio",
];
// "poliester" y "viscosa" faltaban acá -- se podían cargar vía catálogo
// (preset) pero no a mano: un hueco real encontrado al agregar "viscosa"
// para diferenciar sweaters de entretiempo/invierno (pedido explícito del
// usuario, revisión textil de esta ronda).
const TEXTURAS: Textura[] = [
  "algodon",
  "seda",
  "cuero_liso",
  "lino",
  "lana",
  "pana",
  "corderoy",
  "tejido_grueso",
  "frisado",
  "denim",
  "acolchado",
  "poliester",
  "viscosa",
  "impermeable",
  "tricot",
];
const ESTILOS: Estilo[] = ["casual", "formal", "deportivo", "urbano", "clasico"];
const OCASIONES: Ocasion[] = ["casual", "laburo", "formal"];
const ESTACIONES: Estacion[] = ["verano", "invierno", "entretiempo"];
const CALCES: Calce[] = ["ajustado", "regular", "holgado"];
// Ver Calce en types.ts: calzado/accesorio quedan afuera a propósito -- no
// tienen un calce real que compita en volumen contra el resto del outfit.
const CATEGORIAS_CON_CALCE: Categoria[] = [
  "pantalon",
  "bermuda",
  "short_deportivo",
  "remera",
  "buzo",
  "sweater",
  "camisa",
  "campera",
  "saco",
];

/** Prefill que dejan "Probar antes de comprar" y las sugerencias "para
 *  comprar" de Outfits al decidir cargar la prenda de verdad. `presetId`
 *  es opcional: cuando la sugerencia viene de un preset conocido del
 *  catálogo (Outfits), se precarga textura/estilo/ocasión también, no solo
 *  categoría+color -- si no está (el flujo viejo de "Probar", con un color
 *  libre elegido a mano), esos campos quedan vacíos como siempre.
 *  Solo LEE -- no muta sessionStorage acá (eso pasa en un useEffect, no en
 *  fase de render, para no perder el valor con un render descartado). */
function leerPrefillDePrueba(): { categoria: Categoria; colorHex: string; presetId?: string } | null {
  try {
    const raw = sessionStorage.getItem("mi_ropa_prueba_prefill");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function PrendaForm() {
  const prefill = useState(() => leerPrefillDePrueba())[0];
  const presetDePrefill = prefill?.presetId ? CATALOGO_PRENDAS.find((p) => p.id === prefill.presetId) : undefined;
  const [categoria, setCategoria] = useState<Categoria>(presetDePrefill?.categoria ?? prefill?.categoria ?? "remera");
  const [colorHex, setColorHex] = useState(presetDePrefill?.colorHex ?? prefill?.colorHex ?? "#3366CC");
  const [textura, setTextura] = useState<Textura | "">(presetDePrefill?.textura ?? "");
  const [estilo, setEstilo] = useState<Estilo | "">(presetDePrefill?.estilo ?? "");
  const [estilosSecundarios, setEstilosSecundarios] = useState<Estilo[]>(presetDePrefill?.estilosSecundarios ?? []);
  const [ocasion, setOcasion] = useState<Ocasion | "">(presetDePrefill?.ocasion ?? "");
  const [estacion, setEstacion] = useState<Estacion | "">(presetDePrefill?.estacion ?? "");
  const [suelaContraste, setSuelaContraste] = useState(presetDePrefill?.suelaContraste ?? false);
  const [requiereCuello, setRequiereCuello] = useState(presetDePrefill?.requiereCuello ?? false);
  const [posicionAccesorio, setPosicionAccesorio] = useState<"cuello" | "cintura">(
    presetDePrefill?.posicionAccesorio ?? "cintura",
  );
  const [conCapucha, setConCapucha] = useState(presetDePrefill?.conCapucha ?? true);
  // patron/color2 (camisas a rayas/cuadros) -- solo se cargan eligiendo un
  // preset del catálogo, no hay UI manual para armar un estampado propio
  // (requeriría elegir 2 colores + tipo de trama, fuera del alcance de este
  // pedido: "incorpora al catálogo camisas rayadas"). Sin este estado, un
  // preset a rayas elegido acá se guardaba en el placard como si fuera liso
  // -- se perdía el color2/patron en el insert de abajo.
  const [patron, setPatron] = useState<Patron>(presetDePrefill?.patron ?? "liso");
  const [color2Hex, setColor2Hex] = useState<string | undefined>(presetDePrefill?.colorHex2);
  // corte_calzado -- select manual agregado en la auditoría de sastrería
  // (Consejo, ronda siguiente): hasta esta ronda solo se cargaba eligiendo
  // un preset del catálogo (no había <select> en el bloque
  // categoria==="calzado" de más abajo, a diferencia de posicion_accesorio/
  // con_capucha, que sí lo tienen). Hallazgo real, verificado por
  // ejecución: TODO calzado cargado a mano (por foto, sin pasar por el
  // catálogo) quedaba "zapatilla_urbana" (el default) para siempre --
  // recommend.ts ahora lee corte_calzado como señal de cuero (ver
  // calzadoDeCuero), así que sin este select, un zapato de vestir o un
  // mocasín cargado por foto apagaba la coordinación de cuero entera (daba
  // "excelente" con un cinturón que claramente no combina).
  const [corteCalzado, setCorteCalzado] = useState<CorteCalzado>(presetDePrefill?.corteCalzado ?? "zapatilla_urbana");
  // calce -- auditoría de sastrería (Consejo, ronda de auditoría del
  // motor): tercer eje real de un conjunto (después de color y registro),
  // el único que no tenía ningún dato. Ver Calce en types.ts y
  // chocanEnVolumen en recommend.ts.
  const [calce, setCalce] = useState<Calce>(presetDePrefill?.calce ?? "regular");
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [estado, setEstado] = useState<"idle" | "guardando" | "error">("idle");
  const [error, setError] = useState("");
  const [presetActivoId, setPresetActivoId] = useState<string | null>(presetDePrefill?.id ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!prefill) return;
    try {
      sessionStorage.removeItem("mi_ropa_prueba_prefill");
    } catch {
      // no-op: si el storage está bloqueado, tampoco pudo haber escrito el prefill
    }
  }, [prefill]);

  if (!SUPABASE_CONFIGURADO) return <ConfigWarning />;

  function aplicarPreset(p: PresetPrenda) {
    setPresetActivoId(p.id);
    setCategoria(p.categoria);
    setColorHex(p.colorHex);
    setTextura(p.textura ?? "");
    setEstilo(p.estilo ?? "");
    setEstilosSecundarios(p.estilosSecundarios ?? []);
    setOcasion(p.ocasion ?? "");
    setEstacion(p.estacion ?? "");
    setSuelaContraste(p.suelaContraste ?? false);
    setRequiereCuello(p.requiereCuello ?? false);
    setPosicionAccesorio(p.posicionAccesorio ?? "cintura");
    setConCapucha(p.conCapucha ?? true);
    setPatron(p.patron ?? "liso");
    setColor2Hex(p.colorHex2);
    setCorteCalzado(p.corteCalzado ?? "zapatilla_urbana");
    setFotoBlob(null);
    setFotoPreview(null);
  }

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { color, blob } = await procesarFoto(file);
      setColorHex(hslToHex(color.h, color.s, color.l));
      setFotoBlob(blob);
      setFotoPreview(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la foto. Probá con otra o elegí el color a mano.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEstado("guardando");
    setError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setError("Iniciá sesión primero.");
        setEstado("error");
        return;
      }

      const hsl = hexToHsl(colorHex);
      const hsl2 = categoria === "camisa" && color2Hex ? hexToHsl(color2Hex) : null;
      const { data: inserted, error: insertErr } = await supabase
        .from("prendas")
        .insert({
          user_id: userId,
          categoria,
          color_hex: colorHex,
          color_h: hsl.h,
          color_s: hsl.s,
          color_l: hsl.l,
          textura: textura || null,
          estilo: estilo || null,
          estilos_secundarios: estilosSecundarios,
          ocasion: ocasion || null,
          estacion: estacion || null,
          suela_contraste: categoria === "calzado" ? suelaContraste : false,
          requiere_cuello: categoria === "accesorio" ? requiereCuello : false,
          posicion_accesorio: categoria === "accesorio" ? posicionAccesorio : "cintura",
          con_capucha: categoria === "buzo" ? conCapucha : true,
          patron: categoria === "camisa" ? patron : "liso",
          color2_hex: categoria === "camisa" ? (color2Hex ?? null) : null,
          color2_h: hsl2?.h ?? null,
          color2_s: hsl2?.s ?? null,
          color2_l: hsl2?.l ?? null,
          corte_calzado: categoria === "calzado" ? corteCalzado : "zapatilla_urbana",
          calce: CATEGORIAS_CON_CALCE.includes(categoria) ? calce : "regular",
        })
        .select()
        .single();

      if (insertErr || !inserted) {
        setError(insertErr?.message ?? "No se pudo guardar la prenda.");
        setEstado("error");
        return;
      }

      if (fotoBlob) {
        const path = `${userId}/${inserted.id}.webp`;
        const { error: uploadErr } = await supabase.storage
          .from("armario-fotos")
          .upload(path, fotoBlob, { contentType: "image/webp", upsert: true });
        if (!uploadErr) {
          await supabase.from("prendas").update({ foto_path: path }).eq("id", inserted.id);
        }
      }

      const base = (import.meta.env.BASE_URL as string) || "/";
      window.location.href = `${base}combinar/?prenda=${inserted.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión con Mi ropa.");
      setEstado("error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="card">
        <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>
          Elegí de la librería
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
          Tocá una para cargarla directo -- después la podés ajustar antes de guardar.
        </p>
        <CatalogoPicker activo={(p) => presetActivoId === p.id} onElegir={aplicarPreset} />
      </div>

      <form onSubmit={onSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <p className="eyebrow" style={{ margin: 0 }}>
          {presetActivoId ? "Ajustá y guardá" : prefill ? "La que probaste antes de comprar" : "O cargala manual"}
        </p>
        <label className="field-label">
          <span>Categoría</span>
          <select
            className="field"
            value={categoria}
            onChange={(e) => {
              setCategoria(e.target.value as Categoria);
              setPresetActivoId(null);
            }}
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p style={{ margin: "0 0 0.4rem" }}>Color</p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <input
              type="color"
              value={colorHex}
              onChange={(e) => {
                setColorHex(e.target.value);
                setPresetActivoId(null);
              }}
              aria-label="Color de la prenda"
            />
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              📷 Foto
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFoto} />
            {fotoPreview && (
              <img src={fotoPreview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
            )}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            El color se extrae solo de la foto -- si no queda bien, ajustalo a mano con el selector.
          </p>
        </div>

        <details>
          <summary>Tags opcionales (textura, estilo, ocasión, estación)</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.6rem" }}>
            <SelectOpcional label="Textura" value={textura} onChange={setTextura} opciones={TEXTURAS} />
            <SelectOpcional
              label="Estilo"
              value={estilo}
              onChange={(v) => {
                setEstilo(v);
                setEstilosSecundarios((prev) => prev.filter((x) => x !== v));
              }}
              opciones={ESTILOS}
            />
            <div>
              <span style={{ display: "block", marginBottom: "0.3rem" }}>
                También funciona para (opcional, además del estilo principal)
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                {ESTILOS.filter((e) => e !== estilo).map((e) => (
                  <label key={e} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <input
                      type="checkbox"
                      checked={estilosSecundarios.includes(e)}
                      onChange={(ev) =>
                        setEstilosSecundarios((prev) => (ev.target.checked ? [...prev, e] : prev.filter((x) => x !== e)))
                      }
                    />
                    <span>{ESTILO_LABEL[e]}</span>
                  </label>
                ))}
              </div>
            </div>
            <SelectOpcional label="Ocasión" value={ocasion} onChange={setOcasion} opciones={OCASIONES} />
            <SelectOpcional label="Estación" value={estacion} onChange={setEstacion} opciones={ESTACIONES} />
            {CATEGORIAS_CON_CALCE.includes(categoria) && (
              <label className="field-label">
                <span>Calce</span>
                <select className="field" value={calce} onChange={(e) => setCalce(e.target.value as Calce)}>
                  <option value="ajustado">Ajustado</option>
                  <option value="regular">Regular</option>
                  <option value="holgado">Holgado</option>
                </select>
              </label>
            )}
            {categoria === "calzado" && (
              <>
                <label className="field-label">
                  <span>Corte del calzado</span>
                  <select
                    className="field"
                    value={corteCalzado}
                    onChange={(e) => setCorteCalzado(e.target.value as CorteCalzado)}
                  >
                    <option value="zapatilla_urbana">Zapatilla urbana (3 rayas, de calle)</option>
                    <option value="zapatilla_running">Zapatilla running (técnica, deportiva)</option>
                    <option value="zapato_vestir">Zapato de vestir (con cordones)</option>
                    <option value="mocasin">Mocasín (sin cordones)</option>
                    <option value="zapatilla_lona">Zapatilla de lona</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input type="checkbox" checked={suelaContraste} onChange={(e) => setSuelaContraste(e.target.checked)} />
                  <span>Suela blanca / de contraste (en vez de una zapatilla toda del mismo color)</span>
                </label>
              </>
            )}
            {categoria === "buzo" && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input type="checkbox" checked={conCapucha} onChange={(e) => setConCapucha(e.target.checked)} />
                <span>Con capucha (destildá si es crewneck, sin capucha)</span>
              </label>
            )}
            {categoria === "accesorio" && (
              <>
                <label className="field-label">
                  <span>Dónde se usa</span>
                  <select
                    className="field"
                    value={posicionAccesorio}
                    onChange={(e) => setPosicionAccesorio(e.target.value as "cuello" | "cintura")}
                  >
                    <option value="cintura">Cintura (cinturón)</option>
                    <option value="cuello">Cuello (corbata, bufanda)</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={requiereCuello}
                    onChange={(e) => {
                      setRequiereCuello(e.target.checked);
                      if (e.target.checked) setPosicionAccesorio("cuello");
                    }}
                  />
                  <span>Es una corbata (necesita una camisa con cuello debajo)</span>
                </label>
              </>
            )}
          </div>
        </details>

        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={estado === "guardando"}>
          {estado === "guardando" ? "Guardando..." : "Guardar y ver combinaciones"}
        </button>
      </form>
    </div>
  );
}

function SelectOpcional<T extends string>({
  label,
  value,
  onChange,
  opciones,
}: {
  label: string;
  value: T | "";
  onChange: (v: T | "") => void;
  opciones: T[];
}) {
  return (
    <label className="field-label">
      <span>{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value as T | "")}>
        <option value="">(sin especificar)</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
