import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// El sitio (Mi ropa) se sirve desde https://<usuario>.github.io/miropa/ --
// el path "/miropa/" tiene que coincidir siempre con el nombre real del
// repo en GitHub (el rename de repo quedaba fuera del alcance de las
// herramientas de Claude Code -- lo hizo el dueño del proyecto a mano en
// GitHub Settings). Si el repo se vuelve a renombrar, hay que actualizar
// `base` acá para que coincida, o los assets rompen.
export default defineConfig({
  site: "https://ramirosilvera.github.io",
  base: "/miropa/",
  integrations: [react()],
});
