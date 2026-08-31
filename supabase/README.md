# Supabase — schema como código

El proyecto Supabase (schema `armario`) es la base de Matiz: usuarios, placard
personal y outfits guardados. Este directorio versiona **todo** su esquema para
que sea reproducible de cero y no viva solo en la base en vivo.

## Archivos (`migrations/`, se aplican en orden alfabético)

- **`0006_armario_schema.sql`** — schema `armario`, tablas `prendas` /
  `outfits` / `outfit_prendas`, RLS por dueño (`auth.uid() = user_id`),
  índices, y la policy de Storage para el bucket `armario-fotos`.

Todos los statements son **idempotentes** (`create ... if not exists`,
`drop policy if exists` + `create policy`): correrlos de nuevo es inofensivo.

Las migraciones `0001` a `0005` (schema `metricas_mundial`, del sitio de
estadísticas de fútbol que este proyecto reemplazó) fueron eliminadas del repo
a pedido explícito del usuario. **Esas tablas pueden seguir existiendo en el
proyecto de Supabase en vivo** — este repo ya no tiene el schema-as-code para
administrarlas; si hay que borrarlas del lado de la base, es una acción manual
en el dashboard de Supabase.

## Pasos manuales pendientes (no automatizables por SQL/CI)

1. **Crear el bucket de Storage** `armario-fotos` (privado) desde el dashboard
   de Supabase o la Storage API — no existe un `create bucket` en SQL puro.
2. **Exponer el schema `armario`** en Project Settings → API → Exposed schemas
   — sin esto, `supabase-js` no puede leerlo aunque el schema y las policies
   existan.
3. Si se reutiliza el mismo proyecto de Supabase que usaba Métricas LPF:
   confirmar que la `SUPABASE_SERVICE_ROLE_KEY` cargada en secrets sigue
   siendo válida y que las Redirect URLs de Auth (Project Settings → Auth →
   URL Configuration) apuntan al dominio/base real de Matiz.

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
