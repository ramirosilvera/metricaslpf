// Config compartida de las métricas por jugador (física + táctica) que alimentan
// tanto la ficha de scout (PlayerScoutCard) como el ranking por índice global
// (PlayerGlobalIndexRanking). Un solo lugar -> etiquetas y unidades consistentes.

export interface PlayerMetricDef {
  label: string;
  suffix: string;
  group: "físico" | "táctico";
}

export const PLAYER_METRIC_LABELS: Record<string, PlayerMetricDef> = {
  distancia_promedio_km: { label: "Distancia / partido", suffix: " km", group: "físico" },
  alta_intensidad_promedio_m: { label: "Alta intensidad / partido", suffix: " m", group: "físico" },
  sprints_promedio: { label: "Sprints / partido", suffix: "", group: "físico" },
  velocidad_punta_kmh: { label: "Velocidad punta", suffix: " km/h", group: "físico" },
  pases_completados_promedio: { label: "Pases completados / partido", suffix: "", group: "táctico" },
  precision_pases_promedio: { label: "Precisión de pase", suffix: "%", group: "táctico" },
  progresiones_promedio: { label: "Progresiones de balón / partido", suffix: "", group: "táctico" },
  tackles_ganados_promedio: { label: "Tackles ganados / partido", suffix: "", group: "táctico" },
  intercepciones_promedio: { label: "Intercepciones / partido", suffix: "", group: "táctico" },
  presion_directa_promedio: { label: "Presiones directas / partido", suffix: "", group: "táctico" },
  recuperaciones_promedio: { label: "Recuperaciones de posesión / partido", suffix: "", group: "táctico" },
};

export const PLAYER_RADAR_ORDER = Object.keys(PLAYER_METRIC_LABELS);
