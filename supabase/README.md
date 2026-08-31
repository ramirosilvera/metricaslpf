# Supabase — schema como código

El proyecto Supabase (schema `armario`) es la base de Matiz: usuarios, placard
personal y outfits guardados. Este directorio versiona **todo** su esquema para
que sea reproducible de cero y no viva solo en la base en vivo.

## Archivos (`migrations/`, se aplican en orden alfabético)

- **`0006_armario_schema.sql`** — schema `armario`, tablas `prendas` /
  `outfits` / `outfit_prendas`, RLS por dueño (`auth.uid() = user_id`),
  índices, y la policy de Storage para el bucket `armario-fotos`.
- **`0007_expose_armario_schema.sql`** — expone `armario` en la API de
  PostgREST (`pgrst.db_schemas`). Sin esto, `supabase-js` devuelve error
  aunque el schema/tablas/policies existan bien -- es justo lo que pasó en
  este proyecto: quedó sin exponer hasta esta migración.
- **`0008_drop_metricas_mundial.sql`** — borra por completo el schema
  `metricas_mundial` (14 tablas, ~35.500 filas del sitio de fútbol
  anterior). Decisión explícita e irreversible del dueño del proyecto, ya
  ejecutada contra el proyecto real.

Todos los statements son **idempotentes** (`create ... if not exists`,
`drop policy if exists` + `create policy`, `drop schema if exists`):
correrlos de nuevo es inofensivo.

Las migraciones `0001` a `0005` (schema `metricas_mundial`) fueron
eliminadas del repo a pedido explícito del usuario, y el schema en sí ya se
borró de la base real vía `0008` -- no queda nada de Métricas LPF ni en el
repo ni en Supabase.

## Estado (confirmado en el proyecto real `arzzwzuuoysqhgnaprha`)

- ✅ Bucket de Storage `armario-fotos` (privado) -- creado.
- ✅ Schema `armario` expuesto en la API -- aplicado vía `0007_expose_armario_schema.sql`.
- ✅ Schema `metricas_mundial` borrado por completo -- aplicado vía `0008_drop_metricas_mundial.sql`.
- ⬜ Confirmar que las Redirect URLs de Auth (Project Settings → Auth → URL
  Configuration) apuntan al dominio/base real de Matiz
  (`https://ramirosilvera.github.io/metricaslpf/`) -- si el login funciona
  desde el mismo dominio no hace falta tocar nada acá, pero si en algún
  momento aparece un error de "redirect not allowed" al confirmar email o
  hacer login, es este setting.

## GitHub: variable vs. secret (fuente de un bug real que ya pasó acá)

`site/.github/workflows/deploy.yml` lee `PUBLIC_SUPABASE_URL` y
`PUBLIC_SUPABASE_ANON_KEY` con `${{ vars.X }}`, que **solo** lee la pestaña
**Variables** de Settings → Secrets and variables → Actions -- es una pestaña
distinta de **Secrets**, aunque viven en la misma página y es fácil
confundirlas. Si se cargan como Secret, `vars.X` queda vacío, el build
compila "bien" (sin error) pero el sitio queda sin poder hablar con
Supabase -- exactamente lo que pasó la primera vez. El workflow ahora corta
con un `::error::` explícito ANTES de compilar si esto vuelve a pasar, en vez
de fallar en silencio.

## Cómo se aplican

Automático por CI: `.github/workflows/apply-supabase-migrations.yml` corre en
cada push que toca `supabase/migrations/**`. Necesita el secret
**`SUPABASE_DB_URL`** (Project Settings → Database → Connection string → URI,
con la contraseña). Sin ese secret el workflow se saltea con un aviso.

Manual (si hiciera falta):

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0006_armario_schema.sql
```

## Datos

Este archivo crea **estructura**, no datos. Las filas las crea cada usuario
desde la app (`site/src/lib/supabase.ts`, corriendo en el browser con RLS).
No hay pipeline de ETL para Matiz — no hace falta, cada usuario carga su
propio placard.
