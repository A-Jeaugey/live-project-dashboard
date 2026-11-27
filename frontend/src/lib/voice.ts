// Les textes calculés de l'interface : des phrases courtes, qui disent ce qui presse.
// Tout est calculé à partir de l'instantané, sans aucune IA.

import { duration, list, plural } from "./format";
import type { Model } from "./model";
import type { Activity, Attention, ColumnKey } from "./types";

export const COLUMN_NAMES: Record<ColumnKey, string> = {
  idea: "Idées",
  todo: "À faire",
  doing: "En cours",
  done: "Fait",
};

/** Le résumé en tête d'accueil : une à trois phrases, les plus urgentes d'abord. */
export function briefing(m: Model): string {
  const { snap } = m;
  if (snap.issues.length === 0) {
    return "Aucune tâche dans GitLab pour l'instant. Tout reste à créer.";
  }

  const remarks: string[] = [];

  const next = m.nextDeadline;
  if (next?.milestone && next.days_left <= 14) {
    const left = next.milestone.total - next.milestone.closed;
    remarks.push(
      left > 0
        ? `Encore ${left} ${plural(left, "tâche", "tâches")} à rendre d'ici ${next.days_left} ${plural(next.days_left, "jour", "jours")}.`
        : "Tout est rendu pour la prochaine échéance.",
    );
  }

  const late = snap.attention.find((a) => a.kind === "mr_waiting" && a.hours >= snap.settings.review_hours);
  if (late?.kind === "mr_waiting") {
    const who = late.reviewers.length ? ` ${list(late.reviewers.map(m.first))} est attendu.` : "";
    remarks.push(`La !${late.mr} attend une relecture depuis ${duration(late.hours)}.${who}`);
  }

  const asleep = snap.attention.find((a) => a.kind === "issue_stale");
  if (asleep?.kind === "issue_stale") {
    remarks.push(`#${asleep.issue} n'a pas bougé depuis ${asleep.days} jours.`);
  }

  const idle = snap.attention.flatMap((a) => (a.kind === "member_idle" ? [m.first(a.member)] : []));
  if (idle.length > 0 && remarks.length < 3) {
    remarks.push(`${list(idle)} ${idle.length > 1 ? "n'ont" : "n'a"} rien en cours.`);
  }

  if (remarks.length === 0) return "Rien à signaler.";
  return remarks.slice(0, 3).join(" ");
}

/** La valeur affichée en tête d'une alerte : une durée, ou un mot. */
export function alertKey(a: Attention): string {
  switch (a.kind) {
    case "mr_waiting":
      return duration(a.hours);
    case "issue_stale":
      return `${a.days} j`;
    case "member_idle":
      return "libre";
    case "needs_triage":
      return "tri";
    case "inconsistent":
      return "à revoir";
    case "pipeline_failed":
      return "cassé";
  }
}

export const FLAG_TEXT = {
  needs_triage: "ni colonne ni domaine dans GitLab",
  multiple_columns: "plusieurs labels de colonne à la fois",
  doing_unassigned: "en cours, mais personne n'est dessus",
  todo_assigned: "à faire, mais déjà assignée à quelqu'un",
} as const;

/** Verbe du journal : « Théo [a fermé] #8 … ». */
export function activityVerb(a: Activity): string {
  switch (a.kind) {
    case "issue_opened":
      return "a ouvert";
    case "issue_closed":
      return "a fermé";
    case "issue_reopened":
      return "a rouvert";
    case "mr_opened":
      return "a ouvert la merge request";
    case "mr_merged":
      return "a fusionné";
    case "mr_closed":
      return "a fermé la merge request";
    case "mr_approved":
      return "a approuvé";
    case "commented":
      return "a commenté";
    case "pushed":
      return a.detail ? `a poussé ${a.detail} sur` : "a poussé sur";
    case "joined":
      return "a rejoint le projet";
    case "other":
      return a.detail ?? "a fait quelque chose sur";
  }
}

export const EMPTY = {
  board: "Aucune tâche ici.",
  mine: "Rien en cours pour toi.",
  attention: "Rien à signaler.",
  news: "Rien de neuf depuis ton dernier passage.",
  reviews: "Aucune relecture en attente.",
  pipelines: "Aucun pipeline pour l'instant.",
} as const;
