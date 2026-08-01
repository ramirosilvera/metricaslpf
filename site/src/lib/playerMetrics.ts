// Config compartida de las métricas por jugador (FotMob, agregado de TEMPORADA
// -- ver etl/fetch_fotmob_lpf.py) que alimentan tanto la ficha de scout
// (PlayerScoutCard) como el ranking por índice global (PlayerGlobalIndexRanking).
// Un solo lugar -> etiquetas y unidades consistentes. Las claves ("goals",
// "total_tackle", etc.) son el nombre de métrica tal cual lo publica FotMob --
// no se traducen ni se inventan, sólo se les pone una etiqueta legible acá.

export interface PlayerMetricDef {
  label: string;
  suffix: string;
  group: "ataque" | "creación" | "defensa" | "portería" | "disciplina" | "general";
}

export const PLAYER_METRIC_LABELS: Record<string, PlayerMetricDef> = {
  goals: { label: "Goles", suffix: "", group: "ataque" },
  goal_assist: { label: "Asistencias", suffix: "", group: "creación" },
  _goals_and_goal_assist: { label: "Goles + asistencias", suffix: "", group: "ataque" },
  rating: { label: "Puntaje FotMob", suffix: "", group: "general" },
  mins_played: { label: "Minutos jugados", suffix: "", group: "general" },
  goals_per_90: { label: "Goles cada 90'", suffix: "", group: "ataque" },
  expected_goals: { label: "Goles esperados (xG)", suffix: "", group: "ataque" },
  expected_goals_per_90: { label: "xG cada 90'", suffix: "", group: "ataque" },
  expected_goalsontarget: { label: "xG al arco (xGOT)", suffix: "", group: "ataque" },
  ontarget_scoring_att: { label: "Remates al arco cada 90'", suffix: "", group: "ataque" },
  total_scoring_att: { label: "Remates cada 90'", suffix: "", group: "ataque" },
  // Es VOLUMEN de pases completados cada 90' (no un % de precisión) -- por
  // eso el grupo es "general" y no "creación": mide participación, no
  // creación de juego (ver auditoría de criterio del índice GLOBAL).
  accurate_pass: { label: "Volumen de pases precisos cada 90'", suffix: "", group: "general" },
  big_chance_created: { label: "Ocasiones claras creadas", suffix: "", group: "creación" },
  total_att_assist: { label: "Ocasiones creadas", suffix: "", group: "creación" },
  accurate_long_balls: { label: "Pases largos precisos cada 90'", suffix: "", group: "creación" },
  expected_assists: { label: "Asistencias esperadas (xA)", suffix: "", group: "creación" },
  expected_assists_per_90: { label: "xA cada 90'", suffix: "", group: "creación" },
  _expected_goals_and_expected_assists_per_90: { label: "xG + xA cada 90'", suffix: "", group: "ataque" },
  won_contest: { label: "Gambetas exitosas cada 90'", suffix: "", group: "ataque" },
  big_chance_missed: { label: "Ocasiones claras falladas", suffix: "", group: "ataque" },
  penalty_won: { label: "Penales generados", suffix: "", group: "ataque" },
  defensive_contributions: { label: "Acciones defensivas cada 90'", suffix: "", group: "defensa" },
  total_tackle: { label: "Tackles cada 90'", suffix: "", group: "defensa" },
  interception: { label: "Intercepciones cada 90'", suffix: "", group: "defensa" },
  effective_clearance: { label: "Despejes cada 90'", suffix: "", group: "defensa" },
  outfielder_block: { label: "Bloqueos cada 90'", suffix: "", group: "defensa" },
  ball_recovery: { label: "Recuperaciones cada 90'", suffix: "", group: "defensa" },
  penalty_conceded: { label: "Penales cometidos", suffix: "", group: "defensa" },
  poss_won_att_3rd: { label: "Recuperaciones en último tercio cada 90'", suffix: "", group: "defensa" },
  clean_sheet: { label: "Vallas invictas", suffix: "", group: "portería" },
  _save_percentage: { label: "Atajadas efectivas", suffix: "%", group: "portería" },
  saves: { label: "Atajadas cada 90'", suffix: "", group: "portería" },
  _goals_prevented: { label: "Goles evitados", suffix: "", group: "portería" },
  goals_conceded: { label: "Goles recibidos cada 90'", suffix: "", group: "portería" },
  fouls: { label: "Faltas cometidas cada 90'", suffix: "", group: "disciplina" },
  yellow_card: { label: "Tarjetas amarillas", suffix: "", group: "disciplina" },
  red_card: { label: "Tarjetas rojas", suffix: "", group: "disciplina" },
  // --- derivadas en el ETL a partir de los totales crudos de FotMob (que
  // sólo listan a quien tiene >=1 -- ver etl/build_derived_metrics.py) para
  // que puedan puntuar en el índice GLOBAL sin premiar minutos jugados.
  goal_assist_per_90: { label: "Asistencias cada 90'", suffix: "", group: "creación" },
  big_chance_created_per_90: { label: "Ocasiones claras creadas cada 90'", suffix: "", group: "creación" },
  total_att_assist_per_90: { label: "Ocasiones creadas cada 90'", suffix: "", group: "creación" },
  yellow_card_per_90: { label: "Tarjetas amarillas cada 90'", suffix: "", group: "disciplina" },
  clean_sheet_ratio: { label: "Vallas invictas por partido", suffix: "", group: "portería" },
  _goals_prevented_per_90: { label: "Goles evitados cada 90'", suffix: "", group: "portería" },
  matches_played: { label: "Partidos jugados", suffix: "", group: "general" },
};

export const PLAYER_RADAR_ORDER = Object.keys(PLAYER_METRIC_LABELS);
