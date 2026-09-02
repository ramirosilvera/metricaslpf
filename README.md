# Mi ropa

**Tu estilista que te explica por qué combina.**

*(este repositorio se llamaba "Matiz"; el nombre de la app cambió a "Mi
ropa" a pedido explícito del dueño del proyecto -- ver el historial de
commits para el detalle del rebrand.)*

Mi ropa es un asistente de vestimenta: cargás una prenda que ya tenés (foto o
color) y te devuelve las mejores combinaciones posibles para completar el
outfit — explicando *por qué* funcionan, no solo mostrando el resultado. Si
querés arriesgar una combinación poco convencional, Mi ropa te muestra cómo
"rescatarla" en vez de simplemente desaconsejarla.

No es un buscador que filtra. Es un estilista que enseña.

## Cómo funciona

El motor de recomendación compara colores en espacio HSL (matiz, saturación,
luminosidad) contra un árbol de reglas determinístico — sin machine learning:

- **Matiz (hue) cercano + saturación baja** → combinación segura.
- **Mismo matiz repetido (tono sobre tono)** → combinación seguísima.
- **Matiz opuesto con buen contraste de luminosidad** → combinación audaz,
  pero funciona.
- **Dos colores no neutros con luminosidad casi idéntica** → se "funden" en
  una mancha — la app avisa y sugiere una técnica de rescate concreta (puente
  neutro, repetir el color en un accesorio, o separar por textura).

Los detalles completos del árbol de reglas están en
`site/src/lib/recommend.ts`, con sus tests en `site/src/lib/recommend.test.ts`.

## Stack

- **Frontend**: Astro + TypeScript + islas de React, mobile-first.
- **Hosting**: GitHub Pages, desplegado por GitHub Actions (`deploy.yml`).
- **Backend**: sin servidor propio — Supabase Auth + Postgres (RLS) +
  Storage, todo accedido directo desde el browser. Ver `supabase/README.md`
  para el schema (`armario`).
- Sin servicios pagos: la extracción de color de foto es 100% client-side
  (canvas del browser), sin APIs externas.

## Desarrollo local

```bash
cd site
npm install
npm run dev       # http://localhost:4321/miropa/
npm test          # tests del motor de recomendación (vitest)
npm run build     # build de producción a site/dist/
```

Variables de entorno necesarias (`.env` en `site/`, no se commitea):

```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
```

## Estado del proyecto

Funcional en producción: Supabase configurado (schema `armario` expuesto,
bucket de Storage creado), variables de GitHub Actions cargadas, deploy en
verde, guardado y edición de outfits ya wireados de punta a punta. Ver
`supabase/README.md` para el detalle de la config de Supabase -- incluye un
apunte importante sobre variables vs. secrets de GitHub Actions, y sobre el
secret que falta para que las migraciones se apliquen solas en cada push.

---

*Este repositorio reemplazó a "Métricas LPF" (estadísticas de la Liga
Profesional Argentina) a pedido explícito del dueño del proyecto. No quedó
tag de respaldo del contenido anterior — solo vive, si acaso, en el historial
de commits de este mismo repo. Las tablas de esa era en Supabase
(`metricas_mundial`) también se borraron por completo, a pedido explícito.*
