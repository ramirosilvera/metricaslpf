-- Expone el schema `armario` en la API REST de PostgREST.
--
-- Sin esto, supabase-js devuelve error en TODA query contra `armario`
-- aunque el schema, las tablas y las policies de RLS estén perfectas --
-- "Exposed schemas" es un setting aparte (a nivel de rol `authenticator`,
-- no del schema en sí). Se descubrió este gap real en producción: la
-- migración 0006 creó el schema bien, pero quedó sin exponer.
--
-- Idempotente: fija el valor completo de pgrst.db_schemas (no lo acumula),
-- así que correrla de nuevo es inofensivo -- pero OJO: si en el futuro se
-- agrega otro schema nuevo a la API, hay que sumarlo acá también, no solo
-- en una migración nueva aislada, o esta migración lo pisaría al reaplicarse.
alter role authenticator set pgrst.db_schemas = 'public, metricas_mundial, armario';
notify pgrst, 'reload config';
