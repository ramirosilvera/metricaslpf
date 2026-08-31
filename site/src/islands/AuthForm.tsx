import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function AuthForm() {
  const [modo, setModo] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [estado, setEstado] = useState<"idle" | "cargando" | "error" | "ok">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEstado("cargando");
    setError("");
    const { error: err } =
      modo === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (err) {
      setEstado("error");
      setError(err.message);
      return;
    }
    setEstado("ok");
    const base = (import.meta.env.BASE_URL as string) || "/";
    window.location.href = base;
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className={modo === "login" ? "btn btn-primary" : "btn btn-secondary"}
          onClick={() => setModo("login")}
        >
          Entrar
        </button>
        <button
          type="button"
          className={modo === "signup" ? "btn btn-primary" : "btn btn-secondary"}
          onClick={() => setModo("signup")}
        >
          Crear cuenta
        </button>
      </div>
      <label>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: "block", width: "100%", padding: "0.6rem", marginTop: "0.25rem" }}
        />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: "block", width: "100%", padding: "0.6rem", marginTop: "0.25rem" }}
        />
      </label>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={estado === "cargando"}>
        {estado === "cargando" ? "Un momento..." : modo === "login" ? "Entrar" : "Crear cuenta"}
      </button>
    </form>
  );
}
