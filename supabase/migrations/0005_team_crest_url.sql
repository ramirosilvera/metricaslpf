-- =============================================================================
-- Escudo de club — URL de imagen (hotlink al CDN de ESPN, mismo proveedor que
-- el resto de team_profile) en vez del emoji de bandera de país que quedó de
-- la era Mundial 2026. Nullable: si ESPN no trae el campo para algún club,
-- el sitio cae al fallback de emoji, nunca se inventa una URL.
-- =============================================================================
alter table metricas_mundial.team_profile add column if not exists crest_url text;
