import { useMemo, useState } from "react";
import type { GoalEventRow } from "../lib/data";
import { flagFor } from "../lib/flags";
import TeamBadge from "./TeamBadge";
import ShareCardButton from "./ShareCardButton";

// Tabla de goleadores, filtrable por torneo -- antes goleadores.astro sumaba
// TODO (Apertura + Clausura + playoffs) en una sola tabla, mezclando torneos
// distintos de la misma temporada en un número que no correspondía a ninguno
// de los dos. Se recalcula acá (cliente) a partir de goal_events.json, que sí
// trae el `stage` de cada gol -- goal_scorer_ranking.json (el agregado del
// ETL) ya viene sumado sin esa dimensión, por eso el filtro no puede vivir en
// la página estática y pasa a ser un island.

interface Props {
  goalEvents: GoalEventRow[];
  crests?: Record<string, string>;
}

type Tournament = "ALL" | "Apertura" | "Clausura";

// Los playoffs de un torneo comparten stage con prefijo del propio torneo
// (ej. "apertura---quarterfinals") -- cuentan PARA ese torneo, no aparte.
function tournamentOf(stage: string): "Apertura" | "Clausura" | "Otro" {
  if (stage.startsWith("torneo-apertura") || stage.startsWith("apertura")) return "Apertura";
  if (stage.startsWith("torneo-clausura") || stage.startsWith("clausura")) return "Clausura";
  return "Otro";
}

const TOURNAMENT_LABEL: Record<Tournament, string> = {
  ALL: "🏆 Todo el año (Apertura + Clausura)",
  Apertura: "Apertura",
  Clausura: "Clausura",
};

export default function GoalScorerRanking({ goalEvents, crests }: Props) {
  const available = useMemo(() => {
    const set = new Set(goalEvents.map((g) => tournamentOf(g.stage)));
    const out: Tournament[] = ["ALL"];
    if (set.has("Apertura")) out.push("Apertura");
    if (set.has("Clausura")) out.push("Clausura");
    return out;
  }, [goalEvents]);

  const [tournament, setTournament] = useState<Tournament>("ALL");
  const effTournament = available.includes(tournament) ? tournament : "ALL";

  const filtered = useMemo(
    () => (effTournament === "ALL" ? goalEvents : goalEvents.filter((g) => tournamentOf(g.stage) === effTournament)),
    [goalEvents, effTournament],
  );

  const { sorted, posByGoals, ownGoals } = useMemo(() => {
    const scoringByKey = new Map<string, { team: string; player_name: string; goles: number; penales: number; matches: Set<number> }>();
    for (const g of filtered) {
      if (g.own_goal) continue;
      const key = `${g.team}|${g.player_name}`;
      let e = scoringByKey.get(key);
      if (!e) {
        e = { team: g.team, player_name: g.player_name, goles: 0, penales: 0, matches: new Set() };
        scoringByKey.set(key, e);
      }
      e.goles++;
      if (g.penalty) e.penales++;
      e.matches.add(g.match_id);
    }
    const sorted = [...scoringByKey.values()]
      .map((e) => ({ team: e.team, player_name: e.player_name, goles: e.goles, penales: e.penales, partidos_con_gol: e.matches.size }))
      .sort((a, b) => b.goles - a.goles || b.partidos_con_gol - a.partidos_con_gol || a.player_name.localeCompare(b.player_name));

    const posByGoals = new Map<number, number>();
    sorted.forEach((r, i) => {
      if (!posByGoals.has(r.goles)) posByGoals.set(r.goles, i + 1);
    });

    const ownGoalsByKey = new Map<string, { equipo_beneficiado: string; player_name: string; goles_en_contra: number }>();
    for (const g of filtered) {
      if (!g.own_goal) continue;
      const key = `${g.team}|${g.player_name}`;
      let e = ownGoalsByKey.get(key);
      if (!e) {
        e = { equipo_beneficiado: g.team, player_name: g.player_name, goles_en_contra: 0 };
        ownGoalsByKey.set(key, e);
      }
      e.goles_en_contra++;
    }

    return { sorted, posByGoals, ownGoals: [...ownGoalsByKey.values()] };
  }, [filtered]);

  const multi = sorted.filter((r) => r.goles >= 2);
  const single = sorted.filter((r) => r.goles < 2);

  const totalGoals = filtered.length;
  const penaltyGoals = filtered.filter((g) => g.penalty).length;
  const ownGoalCount = filtered.filter((g) => g.own_goal).length;

  const topScorer = sorted[0] ?? null;
  const topScorerStats = topScorer
    ? [
        { label: "Goles", value: String(topScorer.goles) },
        { label: "Penales", value: String(topScorer.penales) },
        { label: "Partidos con gol", value: String(topScorer.partidos_con_gol) },
      ]
    : [];
  const tournamentTxt = effTournament === "ALL" ? "de la Liga Profesional" : `del ${effTournament} de la Liga Profesional`;
  const topScorerShareText = topScorer
    ? `${topScorer.player_name} (${topScorer.team}) lidera la tabla de goleadores ${tournamentTxt} con ${topScorer.goles} goles en ${topScorer.partidos_con_gol} partidos.`
    : undefined;

  if (goalEvents.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay goles cargados.</p>;
  }

  return (
    <div>
      <div className="controls-row" style={{ marginBottom: "1rem" }}>
        <select value={effTournament} onChange={(e) => setTournament(e.target.value as Tournament)} aria-label="Torneo">
          {available.map((t) => (
            <option key={t} value={t}>
              {TOURNAMENT_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {topScorer && (
        <div className="hero-actions" style={{ marginBottom: "1.5rem" }}>
          <ShareCardButton
            title={topScorer.player_name}
            subtitle={`${flagFor(topScorer.team)} ${topScorer.team} · Goleador ${effTournament === "ALL" ? "de la Liga Profesional" : `· ${effTournament}`}`}
            flag={flagFor(topScorer.team)}
            stats={topScorerStats}
            tagline="Máximo goleador del torneo"
            shareText={topScorerShareText}
            filenameBase={`${topScorer.player_name}-goleador-${effTournament}`}
          />
        </div>
      )}

      <div className="stat-tiles" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-tile">
          <div className="value">{totalGoals}</div>
          <div className="label">goles {effTournament === "ALL" ? "en la temporada" : `en el ${effTournament}`}</div>
        </div>
        <div className="stat-tile">
          <div className="value">{sorted.length}</div>
          <div className="label">goleadores distintos</div>
        </div>
        <div className="stat-tile">
          <div className="value">{penaltyGoals}</div>
          <div className="label">goles de penal</div>
        </div>
        <div className="stat-tile">
          <div className="value">{ownGoalCount}</div>
          <div className="label">goles en contra</div>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table>
            <caption>
              Jugadores con dos o más goles ({multi.length} de {sorted.length})
            </caption>
            <thead>
              <tr>
                <th>#</th>
                <th>Jugador</th>
                <th>Club</th>
                <th>Goles</th>
                <th>Penales</th>
                <th>Partidos con gol</th>
              </tr>
            </thead>
            <tbody>
              {multi.map((r) => (
                <tr key={`${r.team}|${r.player_name}`}>
                  <td className="match-score">{posByGoals.get(r.goles)}</td>
                  <td>{r.player_name}</td>
                  <td>
                    <TeamBadge team={r.team} crests={crests} className="team-flag" /> {r.team}
                  </td>
                  <td className="match-score">{r.goles}</td>
                  <td>{r.penales > 0 ? r.penales : "—"}</td>
                  <td>{r.partidos_con_gol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {single.length > 0 && (
          <details className="scorers-more">
            <summary>Ver los {single.length} jugadores con un gol</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jugador</th>
                    <th>Club</th>
                    <th>Goles</th>
                    <th>Penales</th>
                    <th>Partidos con gol</th>
                  </tr>
                </thead>
                <tbody>
                  {single.map((r) => (
                    <tr key={`${r.team}|${r.player_name}`}>
                      <td className="match-score">{posByGoals.get(r.goles)}</td>
                      <td>{r.player_name}</td>
                      <td>
                        <TeamBadge team={r.team} crests={crests} className="team-flag" /> {r.team}
                      </td>
                      <td className="match-score">{r.goles}</td>
                      <td>{r.penales > 0 ? r.penales : "—"}</td>
                      <td>{r.partidos_con_gol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      {ownGoals.length > 0 && (
        <section className="section">
          <div className="callout warning">
            <h3>Goles en contra ({ownGoals.length})</h3>
            <p>No suman en la tabla de goleadores — se acreditan al club beneficiado, no al jugador.</p>
            <ul className="own-goal-list">
              {ownGoals.map((o) => (
                <li key={`${o.equipo_beneficiado}|${o.player_name}`}>
                  {o.player_name}
                  {o.goles_en_contra > 1 ? ` (×${o.goles_en_contra})` : ""} — benefició a{" "}
                  <TeamBadge team={o.equipo_beneficiado} crests={crests} className="team-flag" /> {o.equipo_beneficiado}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
