// Bandera (emoji) por selección -- no hay assets de imagen en el proyecto
// (100% estático, sin build de recursos gráficos), así que el emoji regional
// da identidad visual "deportiva" sin depender de ningún CDN externo.
const FLAGS: Record<string, string> = {
  Argentina: "🇦🇷", Algeria: "🇩🇿", Austria: "🇦🇹", Jordan: "🇯🇴",
  Mexico: "🇲🇽", "South Africa": "🇿🇦", "South Korea": "🇰🇷", Czechia: "🇨🇿",
  Canada: "🇨🇦", "Bosnia and Herzegovina": "🇧🇦", Qatar: "🇶🇦", Switzerland: "🇨🇭",
  Haiti: "🇭🇹", Scotland: "🏴", Brazil: "🇧🇷", Morocco: "🇲🇦",
  "United States": "🇺🇸", Paraguay: "🇵🇾", Australia: "🇦🇺", Turkey: "🇹🇷",
  "Ivory Coast": "🇨🇮", Ecuador: "🇪🇨", Germany: "🇩🇪", Curacao: "🇨🇼",
  Netherlands: "🇳🇱", Japan: "🇯🇵", Sweden: "🇸🇪", Tunisia: "🇹🇳",
  Iran: "🇮🇷", "New Zealand": "🇳🇿", Belgium: "🇧🇪", Egypt: "🇪🇬",
  "Saudi Arabia": "🇸🇦", Uruguay: "🇺🇾", Spain: "🇪🇸", "Cape Verde": "🇨🇻",
  "Cabo Verde": "🇨🇻", France: "🇫🇷", Senegal: "🇸🇳", Iraq: "🇮🇶", Norway: "🇳🇴",
  Ghana: "🇬🇭", England: "🏴", Croatia: "🇭🇷", Portugal: "🇵🇹",
  "DR Congo": "🇨🇩", Uzbekistan: "🇺🇿", Colombia: "🇨🇴", Panama: "🇵🇦",
  Nigeria: "🇳🇬", Iceland: "🇮🇸", Poland: "🇵🇱",
};

export function flagFor(team: string): string {
  return FLAGS[team] ?? "⚽";
}
