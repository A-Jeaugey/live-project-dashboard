import type { Deadline } from "./types";

/** Part du temps déjà écoulée depuis l'échéance précédente, en jours et en fraction. */
export function elapsedBefore(next: Deadline, deadlines: Deadline[]) {
  const previous = deadlines
    .filter((d) => d.target_date < next.target_date)
    .sort((a, b) => b.target_date.localeCompare(a.target_date))[0];
  // Sans échéance précédente, on mesure sur trente jours (ou plus s'il en reste davantage).
  const span = Math.max(1, previous ? next.days_left - previous.days_left : Math.max(next.days_left, 30));
  const days = Math.min(span, Math.max(0, span - next.days_left));
  return { days, span, share: days / span };
}

export interface Verdict {
  text: string;
  /** Variable CSS de la couleur associée. */
  color: string;
  /** Avance (négatif) ou retard (positif) des tâches sur le temps, en points. */
  gap: number;
}

/**
 * Compare la part du temps écoulée à la part des tâches rendues.
 * Seuils : plus de 8 points d'écart = un peu en retard, plus de 25 = en retard.
 */
export function verdict(timeShare: number, done: number | null, hasMilestone: boolean): Verdict {
  if (done === null) {
    return { text: hasMilestone ? "Jalon vide" : "Pas de jalon", color: "var(--amber)", gap: 0 };
  }
  const gap = Math.round((timeShare - done) * 100);
  if (done >= 1) return { text: "Tout est rendu", color: "var(--green)", gap };
  if (gap > 25) return { text: "En retard", color: "var(--red)", gap };
  if (gap > 8) return { text: "Un peu en retard", color: "var(--amber)", gap };
  if (gap < -8) return { text: "En avance", color: "var(--green)", gap };
  return { text: "Dans les temps", color: "var(--green)", gap };
}
