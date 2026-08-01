// Fallback cuando no hay escudo real cargado para un club. El escudo real
// (crest_url, hotlink al CDN de ESPN -- ver lib/data.ts:loadCrestMap) se
// renderiza con components/TeamBadge.astro o islands/TeamBadge.tsx en la
// mayoría de los casos; este emoji sólo se usa ahí como fallback y acá
// directamente en los pocos lugares que necesitan una string plana (tooltips
// de gráficos con formatter de HTML crudo, tarjetas para compartir en canvas)
// en vez de un <img>. Hubo un diccionario de banderas por país acá de la era
// Mundial 2026 (selecciones); no tiene sentido para clubes de la LPF y se
// sacó -- mantenía ~50 entradas que nunca iban a matchear un nombre de club.
export function flagFor(_team: string): string {
  return "⚽";
}

/** Escapa texto para insertarlo de forma segura dentro de HTML crudo (texto o
 *  atributo). Los tooltips de ECharts renderizan el string que devuelve
 *  `formatter` como HTML real (no JSX, que escapa solo) -- y ese string suele
 *  interpolar nombre de jugador/club, que viene de FotMob/ESPN, no de un
 *  formulario. Hoy no hay forma de que un usuario meta ahí HTML/JS propio
 *  (son planteles curados, no texto libre), pero escapar es gratis y cierra
 *  el patrón "dato externo -> sink de HTML" de una vez en todos los tooltips
 *  en vez de confiar en que la fuente nunca traiga un nombre raro. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Como flagFor, pero para contextos de HTML crudo (formatter de tooltip de
 *  ECharts) donde no se puede montar un componente React -- <img> si hay
 *  escudo real, si no el mismo fallback de flagFor. */
export function flagOrCrestHtml(team: string, crests?: Record<string, string>): string {
  const url = crests?.[team];
  if (url && /^https:\/\//i.test(url)) {
    return `<img src="${escapeHtml(url)}" alt="" style="width:1em;height:1em;object-fit:contain;vertical-align:-0.15em;border-radius:2px" />`;
  }
  return flagFor(team);
}
