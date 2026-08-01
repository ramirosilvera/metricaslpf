// Gate de muestra mínima para el índice GLOBAL de jugadores.
// ---------------------------------------------------------------------------
// FotMob sólo publica tasas "cada 90'" completas (sin huecos) para jugadores
// con >=11 partidos disputados -- es el propio corte de sus leaderboards, no
// una elección nuestra (ver etl/build_derived_metrics.py). Por debajo de eso
// las tasas se calculan sobre muy poca muestra y un par de eventos (una
// racha de goles, un par de tarjetas) mueven el índice de forma artificial:
// el caso reportado (un delantero con 416' valorado alto por errar dos
// ocasiones claras y ver una amarilla) es exactamente esto.
//
// El torneo de la Liga Profesional no tiene el mismo largo todos los años
// (Apertura/Clausura + playoffs, no una liga de 38 fechas) -- por eso el
// umbral de partidos coincide con el corte real de FotMob en vez de un
// número de fecha fijo, y el de minutos es una fracción razonable de un
// partido completo x 11 (600' ~ 6.7 partidos completos).
export const MIN_MATCHES_QUALIFIED = 11;
export const MIN_MINUTES_RANKED = 600;
export const MIN_MINUTES_SHOWN = 270;

export type SampleTier = "ranked" | "small_sample" | "insufficient";

/**
 * "ranked": entra al ranking GLOBAL y a los podios/comparadores.
 * "small_sample": tiene GLOBAL (se puede mostrar en su ficha con aviso), pero
 *   se excluye de rankings y "lidera con índice...".
 * "insufficient": no se calcula GLOBAL -- se muestran sólo las métricas
 *   crudas que tenga cargadas.
 */
export function sampleTier(matchesPlayed: number | null | undefined, minsPlayed: number | null | undefined): SampleTier {
  if (matchesPlayed == null || matchesPlayed < MIN_MATCHES_QUALIFIED || minsPlayed == null || minsPlayed < MIN_MINUTES_SHOWN) {
    return "insufficient";
  }
  return minsPlayed < MIN_MINUTES_RANKED ? "small_sample" : "ranked";
}
