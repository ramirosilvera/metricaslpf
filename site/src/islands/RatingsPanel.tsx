import type { RatingsData } from "../lib/ratings";
import { ovrOf, RATINGS_SCALE_LABEL } from "../lib/ratings";

// Panel "carta EA SPORTS FC": un número GLOBAL grande por selección/jugador
// (promedio de los índices) y el desglose factor por factor. Para dos entidades
// resalta el que gana cada factor con su color. Acompaña al radar en pantalla y
// se replica en el exportable (shareChart.ts) para que se comparta igual.
export default function RatingsPanel({ data }: { data: RatingsData }) {
  const { entities, factors } = data;
  if (entities.length === 0 || factors.length === 0) return null;
  const ovrs = entities.map((_, i) => ovrOf(data, i));
  const dual = entities.length > 1;

  return (
    <div className="ratings-panel" role="table" aria-label="Índice de rendimiento por factor">
      <div className="ratings-ovr-row">
        {entities.map((e, i) => (
          <div className="ratings-ovr" key={i}>
            <span className="ratings-ovr-num" style={{ color: e.color }}>
              {ovrs[i]}
            </span>
            <span className="ratings-ovr-meta">
              <span className="ratings-ovr-kicker">GLOBAL</span>
              <span className="ratings-ovr-name" style={{ borderColor: e.color }}>
                {e.name}
              </span>
            </span>
          </div>
        ))}
      </div>

      <ul className="ratings-factors">
        {factors.map((f, fi) => {
          const best = dual ? Math.max(...f.values.filter((v) => Number.isFinite(v))) : null;
          return (
            <li className="ratings-factor" key={fi}>
              <span className="ratings-factor-label">{f.label}</span>
              <span className="ratings-factor-vals">
                {f.values.map((v, i) => {
                  const isBest = dual && best != null && v === best;
                  return (
                    <span className="ratings-cell" key={i}>
                      <span className="ratings-bar" aria-hidden="true">
                        <span
                          className="ratings-bar-fill"
                          style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: entities[i].color }}
                        />
                      </span>
                      <span
                        className={`ratings-val${isBest ? " is-best" : ""}`}
                        style={isBest ? { color: entities[i].color } : undefined}
                      >
                        {Number.isFinite(v) ? v : "—"}
                      </span>
                    </span>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="ratings-scale">{data.scaleLabel ?? RATINGS_SCALE_LABEL}</p>
    </div>
  );
}
