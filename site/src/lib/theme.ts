import { useEffect, useState } from "react";

// Canvas (lo que usa ECharts por defecto) no resuelve custom properties CSS
// de forma confiable -- hay que leerlas con getComputedStyle y pasar hex
// resueltos a las opciones de los charts.
const TOKEN_NAMES = [
  "--surface-1",
  "--page-plane",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--gridline",
  "--baseline",
  "--series-1",
  "--series-2",
  "--series-3",
  "--series-4",
  "--series-5",
  "--series-6",
  "--series-7",
  "--series-8",
  "--status-good",
  "--status-warning",
  "--status-serious",
  "--status-critical",
] as const;

export type ThemeTokens = Record<(typeof TOKEN_NAMES)[number], string>;

function readTokens(): ThemeTokens {
  if (typeof window === "undefined") {
    // fallback modo claro para SSR
    return {
      "--surface-1": "#fcfcfb",
      "--page-plane": "#f9f9f7",
      "--text-primary": "#0b0b0b",
      "--text-secondary": "#52514e",
      "--text-muted": "#898781",
      "--gridline": "#e1e0d9",
      "--baseline": "#c3c2b7",
      "--series-1": "#2a78d6",
      "--series-2": "#1baf7a",
      "--series-3": "#eda100",
      "--series-4": "#008300",
      "--series-5": "#4a3aa7",
      "--series-6": "#e34948",
      "--series-7": "#e87ba4",
      "--series-8": "#eb6834",
      "--status-good": "#0ca30c",
      "--status-warning": "#fab219",
      "--status-serious": "#ec835a",
      "--status-critical": "#d03b3b",
    };
  }
  const style = getComputedStyle(document.documentElement);
  const out = {} as ThemeTokens;
  for (const name of TOKEN_NAMES) {
    out[name] = style.getPropertyValue(name).trim();
  }
  return out;
}

export function useChartTokens(): ThemeTokens {
  const [tokens, setTokens] = useState<ThemeTokens>(readTokens);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTokens(readTokens());
    mq.addEventListener("change", update);
    update();
    return () => mq.removeEventListener("change", update);
  }, []);

  return tokens;
}
