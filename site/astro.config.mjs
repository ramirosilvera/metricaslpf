import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// El sitio (Mi ropa, antes "Matiz") se sirve desde
// https://<usuario>.github.io/metricaslpf/ -- el path "/metricaslpf/" quedó
// de cuando este repo era Métricas LPF. Renombrar el repo de GitHub sigue
// fuera del alcance de las herramientas disponibles en las sesiones de
// Claude Code (no hay endpoint de rename/update de repo en el MCP de
// GitHub, confirmado de nuevo al intentar este mismo rebrand); si alguien
// lo renombra a mano en GitHub, hay que actualizar `base` acá para que
// coincida, o los assets rompen.
export default defineConfig({
  site: "https://ramirosilvera.github.io",
  base: "/metricaslpf/",
  integrations: [react()],
});
