import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Matiz: faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY -- ver README.md.",
  );
}

// Todas las tablas de Matiz viven en el schema `armario` (no `public`) --
// hay que exponerlo en Project Settings -> API -> Exposed schemas del lado
// de Supabase (ver supabase/README.md), si no toda query devuelve error.
export const supabase = createClient(url ?? "", anonKey ?? "", {
  db: { schema: "armario" },
});
