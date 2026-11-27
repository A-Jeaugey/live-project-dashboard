// « Depuis ta dernière visite » : mémorisé dans le navigateur de chacun, jamais sur le serveur.
// Une visite est une session : recharger la page dans la demi-heure ne remet pas le repère à zéro.

const ANCHOR = "visite-reperes";
const LAST_SEEN = "visite-derniere";
const SESSION_GAP = 30 * 60_000;
const TOO_OLD = 21 * 86_400_000;

let anchor: number | null | undefined;

function read(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // stockage indisponible (navigation privée, etc.) : on s'en passe
  }
}

/** Instant de la visite précédente, ou null si c'est la première (ou qu'elle est trop ancienne). */
export function previousVisit(): number | null {
  if (anchor !== undefined) return anchor;

  const now = Date.now();
  const lastSeen = read(LAST_SEEN);
  const stored = read(ANCHOR);
  anchor = lastSeen !== null && now - lastSeen > SESSION_GAP ? lastSeen : stored;
  if (anchor !== null && now - anchor > TOO_OLD) anchor = null;
  if (anchor !== null) write(ANCHOR, anchor);

  const seen = () => write(LAST_SEEN, Date.now());
  seen();
  window.addEventListener("pagehide", seen);
  document.addEventListener("visibilitychange", seen);
  return anchor;
}
