import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ColumnKey, Deadline, Issue, Me, Member, MergeRequest, Snapshot } from "./types";

/** L'instantané de GitLab, indexé, avec les quelques raccourcis dont tous les écrans ont besoin. */
export interface Model {
  snap: Snapshot;
  me: Me;
  /** Rafraîchi toutes les 20 secondes, pour les durées relatives. */
  now: number;
  issue: (iid: number) => Issue | undefined;
  mr: (iid: number) => MergeRequest | undefined;
  member: (username: string) => Member | undefined;
  /** Prénom d'usage, ou l'identifiant si la personne est inconnue. */
  first: (username: string | null) => string;
  /** Auteur d'un événement : prénom d'un membre, sinon son nom GitLab (robot d'un token, ancien membre). */
  who: (event: { actor: string | null; actor_name: string | null }) => string;
  domainColor: (name: string) => string;
  deadline: (key: string | null | undefined) => Deadline | undefined;
  /** Prochaine échéance non passée. */
  nextDeadline: Deadline | undefined;
  /** Échéances qui comptent comme une « nuit », dans l'ordre. */
  nights: Deadline[];
  /** Issues fermées assez récemment pour figurer dans « Fait ». */
  isRecentlyDone: (issue: Issue) => boolean;
  inColumn: (column: ColumnKey) => Issue[];
}

const ModelContext = createContext<Model | null>(null);

export function useModel(): Model {
  const model = useContext(ModelContext);
  if (!model) throw new Error("useModel doit être appelé sous <ModelProvider>");
  return model;
}

export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

export function ModelProvider({ snap, me, children }: { snap: Snapshot; me: Me; children: ReactNode }) {
  const now = useNow(20_000);

  const model = useMemo<Model>(() => {
    const issues = new Map(snap.issues.map((i) => [i.iid, i]));
    const mrs = new Map(snap.merge_requests.map((m) => [m.iid, m]));
    const members = new Map(snap.members.map((m) => [m.username, m]));
    const colors = new Map(snap.domains.map((d) => [d.name, d.color]));
    const deadlines = new Map(snap.deadlines.map((d) => [d.key, d]));
    const windowMs = snap.settings.done_window_days * 86_400_000;

    const isRecentlyDone = (issue: Issue) =>
      issue.column === "done" && issue.closed_at !== null && now - Date.parse(issue.closed_at) <= windowMs;

    return {
      snap,
      me,
      now,
      issue: (iid) => issues.get(iid),
      mr: (iid) => mrs.get(iid),
      member: (username) => members.get(username),
      first: (username) => (username ? (members.get(username)?.first_name ?? username) : "Quelqu'un"),
      who: ({ actor, actor_name }) =>
        (actor ? members.get(actor)?.first_name : undefined) ?? actor_name ?? actor ?? "Quelqu'un",
      domainColor: (name) => colors.get(name) ?? "#8a8578",
      deadline: (key) => (key ? deadlines.get(key) : undefined),
      nextDeadline: snap.deadlines.filter((d) => !d.past).sort((a, b) => a.days_left - b.days_left)[0],
      nights: snap.deadlines.filter((d) => d.night !== null).sort((a, b) => (a.night ?? 0) - (b.night ?? 0)),
      isRecentlyDone,
      inColumn: (column) =>
        snap.issues.filter((i) => i.column === column && (column !== "done" || isRecentlyDone(i))),
    };
  }, [snap, me, now]);

  return <ModelContext.Provider value={model}>{children}</ModelContext.Provider>;
}
