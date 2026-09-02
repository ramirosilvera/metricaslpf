import { useEffect, useRef, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { hexToHsl, hslToHex } from "../lib/color";
import { procesarFoto } from "../lib/photo";
import { CATALOGO_PRENDAS, type PresetPrenda } from "../lib/catalogo";
import { ESTILO_LABEL } from "../lib/recommend";
import { CATEGORIA_LABEL, type Categoria, type Estacion, type Estilo, type Ocasion, type Textura } from "../lib/types";
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
  "denim",
  "acolchado",
  "poliester",
  "viscosa",
];
const ESTILOS: Estilo[] = ["casual", "formal", "deportivo", "urbano", "clasico"];
const OCASIONES: Ocasion[] = ["casual", "laburo", "formal"];
const ESTACIONES: Estacion[] = ["verano", "invierno", "entretiempo"];

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
            {categoria === "calzado" && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input type="checkbox" checked={suelaContraste} onChange={(e) => setSuelaContraste(e.target.checked)} />
                <span>Suela blanca / de contraste (en vez de una zapatilla toda del mismo color)</span>
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
