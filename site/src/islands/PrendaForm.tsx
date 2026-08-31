import { useRef, useState } from "react";
import { SUPABASE_CONFIGURADO, supabase } from "../lib/supabase";
import { hexToHsl, hslToHex } from "../lib/color";
import { procesarFoto } from "../lib/photo";
import type { Categoria, Estacion, Estilo, Ocasion, Textura } from "../lib/types";
import ConfigWarning from "./ConfigWarning";

const CATEGORIAS: Categoria[] = [
  "pantalon",
  "remera",
  "buzo",
  "sweater",
  "camisa",
  "calzado",
  "campera",
  "accesorio",
];
const TEXTURAS: Textura[] = ["algodon", "seda", "cuero_liso", "lino", "lana", "pana", "corderoy", "tejido_grueso"];
const ESTILOS: Estilo[] = ["casual", "formal", "deportivo", "urbano", "clasico"];
const OCASIONES: Ocasion[] = ["casual", "laburo", "formal"];
const ESTACIONES: Estacion[] = ["verano", "invierno", "entretiempo"];

export default function PrendaForm() {
  const [categoria, setCategoria] = useState<Categoria>("remera");
  const [colorHex, setColorHex] = useState("#3366CC");
  const [textura, setTextura] = useState<Textura | "">("");
  const [estilo, setEstilo] = useState<Estilo | "">("");
  const [ocasion, setOcasion] = useState<Ocasion | "">("");
  const [estacion, setEstacion] = useState<Estacion | "">("");
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [estado, setEstado] = useState<"idle" | "guardando" | "error">("idle");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!SUPABASE_CONFIGURADO) return <ConfigWarning />;

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
          ocasion: ocasion || null,
          estacion: estacion || null,
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
      setError(err instanceof Error ? err.message : "Error de conexión con Matiz.");
      setEstado("error");
    }
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <label className="field-label">
        <span>Categoría</span>
        <select className="field" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p style={{ margin: "0 0 0.4rem" }}>Color</p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} aria-label="Color de la prenda" />
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
          <SelectOpcional label="Estilo" value={estilo} onChange={setEstilo} opciones={ESTILOS} />
          <SelectOpcional label="Ocasión" value={ocasion} onChange={setOcasion} opciones={OCASIONES} />
          <SelectOpcional label="Estación" value={estacion} onChange={setEstacion} opciones={ESTACIONES} />
        </div>
      </details>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={estado === "guardando"}>
        {estado === "guardando" ? "Guardando..." : "Guardar y ver combinaciones"}
      </button>
    </form>
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
