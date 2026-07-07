import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// El sitio se sirve desde https://<usuario>.github.io/metricasmundial2026/
// -> base debe coincidir con el nombre del repo para que los assets resuelvan bien.
export default defineConfig({
  site: "https://ramirosilvera.github.io",
  base: "/metricasmundial2026/",
  integrations: [react()],
  vite: {
    optimizeDeps: {
      exclude: ["@duckdb/duckdb-wasm"],
    },
    worker: {
      format: "es",
    },
  },
});
