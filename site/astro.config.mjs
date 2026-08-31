import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// El sitio (Matiz) se sirve desde https://<usuario>.github.io/metricaslpf/ --
// el path "/metricaslpf/" quedó de cuando este repo era Métricas LPF. No se
// pudo renombrar el repo desde esta sesión (fuera del alcance de las
// herramientas disponibles); si se renombra el repo en GitHub más adelante,
// hay que actualizar `base` acá para que coincida, o los assets rompen.
export default defineConfig({
  site: "https://ramirosilvera.github.io",
  base: "/metricaslpf/",
  integrations: [react()],
});
