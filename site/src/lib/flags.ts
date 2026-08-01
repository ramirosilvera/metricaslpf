// Ícono por club -- no hay assets de imagen en el proyecto (100% estático,
// sin build de recursos gráficos ni CDN externo), así que se usa un emoji fijo
// en vez de un escudo real. Hubo un diccionario de banderas por país acá de la
// era Mundial 2026 (selecciones); no tiene sentido para clubes de la LPF y se
// sacó -- mantenía ~50 entradas que nunca iban a matchear un nombre de club.
export function flagFor(_team: string): string {
  return "⚽";
}
