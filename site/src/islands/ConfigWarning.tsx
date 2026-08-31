export default function ConfigWarning() {
  return (
    <div className="empty-state">
      <p>
        Matiz no está conectado a Supabase todavía (faltan las variables <code>PUBLIC_SUPABASE_URL</code> /{" "}
        <code>PUBLIC_SUPABASE_ANON_KEY</code> en el build). Ver README.md.
      </p>
    </div>
  );
}
