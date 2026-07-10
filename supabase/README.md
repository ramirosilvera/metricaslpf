# Supabase — schema como código

El proyecto Supabase (schema `metricas_mundial`) es la base canónica que
alimenta al asistente de IA (function-calling desde el Cloudflare Worker). Este
directorio versiona **todo** su esquema para que sea reproducible de cero y no
viva solo en la base en vivo.

## Archivos (`migrations/`, se aplican en orden alfabético)

- **`0001_schema_tables_rls.sql`** — el schema, las 12 tablas (con sus PK/UNIQUE
  e identidades), RLS activo, la política de lectura pública y los grants
  (`anon`/`authenticated` = solo SELECT; `service_role` = escritura, que es lo
  que usa el ETL).
- **`0002_rpcs.sql`** — las 10 funciones de solo lectura (`get_*`) que el
  asistente puede invocar, con sus `grant execute`. Son `STABLE`, con
  `search_path` fijo y parámetros whitelisteados: nunca reciben SQL crudo.

Todos los statements son **idempotentes** (`create ... if not exists`,
`create or replace`, `drop policy if exists`): correrlos de nuevo es inofensivo.

## Cómo se aplican

Automático por CI: `.github/workflows/apply-supabase-migrations.yml` corre en
cada push que toca `supabase/migrations/**`. Necesita el secret
**`SUPABASE_DB_URL`** (Project Settings → Database → Connection string → URI, con
la contraseña). Sin ese secret el workflow se saltea con un aviso.

Manual (si hiciera falta):

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_schema_tables_rls.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_rpcs.sql
```

## Datos

Estos archivos crean **estructura**, no datos. Las filas las carga el pipeline
de ETL (`etl/sync_supabase.py`, invocado por `update-data.yml`) con la
`service_role` key. Para reconstruir todo de cero: aplicar las migraciones y
después correr el pipeline.
