import { flagFor } from "../lib/flags";

// Versión React de components/TeamBadge.astro -- los islands client:only no
// pueden leer archivos en el navegador, así que reciben el mapa team->crest_url
// (loadCrestMap(), lib/data.ts) como prop desde su página .astro padre.
interface Props {
  team: string;
  crests?: Record<string, string>;
  className?: string;
}

export default function TeamBadge({ team, crests, className }: Props) {
  const crestUrl = crests?.[team];
  if (crestUrl) {
    return <img src={crestUrl} alt="" className={className} loading="lazy" width={20} height={20} />;
  }
  return (
    <span className={className} aria-hidden="true">
      {flagFor(team)}
    </span>
  );
}
