-- Borra por completo el schema `metricas_mundial` (Métricas LPF, el sitio
-- de fútbol que Matiz reemplazó). Decisión explícita del dueño del
-- proyecto: no conservar nada del contenido anterior. Ejecutado ya contra
-- el proyecto real (14 tablas, ~35.500 filas) el 2026-08-31.
--
-- Irreversible: no hay backup de estos datos (decisión del dueño, ver
-- README.md raíz). Esta migración documenta la acción, no la repite --
-- `drop schema if exists ... cascade` es seguro de re-ejecutar (no-op si
-- el schema ya no existe).
drop schema if exists metricas_mundial cascade;

alter role authenticator set pgrst.db_schemas = 'public, armario';
notify pgrst, 'reload config';
