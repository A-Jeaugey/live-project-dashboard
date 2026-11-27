import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Activity, ColumnKey, Issue, Snapshot, StreamEvent } from "./types";

/**
 * Un petit mot affiché quelques secondes. Soit un événement du journal GitLab, soit un changement de
 * colonne constaté entre deux instantanés : prendre une tâche ne laisse aucune trace dans le journal
 * de GitLab, alors que c'est le changement qu'on a le plus envie de voir passer.
 */
export type LiveNote =
  | { id: string; kind: "activity"; activity: Activity }
  | { id: string; kind: "move"; iid: number; title: string; column: ColumnKey; by: string | null };

interface Live {
  /** Le flux temps réel est-il ouvert ? */
  connected: boolean;
  /** Issues qui viennent de changer : elles reçoivent un coup de surligneur. */
  fresh: ReadonlySet<number>;
  /** Ce qui vient de se passer pendant que la page est ouverte. */
  news: readonly LiveNote[];
}

const NEWS_SHOWN = 3;
const NEWS_DURATION = 8000;

const LiveContext = createContext<Live>({ connected: false, fresh: new Set(), news: [] });

export const useLive = () => useContext(LiveContext);

const signature = (i: Issue) => [i.column, i.title, i.assignees.join(","), i.domains.join(","), i.updated_at].join("|");

function changedIssues(before: Snapshot, after: Snapshot): Set<number> {
  const old = new Map(before.issues.map((i) => [i.iid, signature(i)]));
  const changed = new Set<number>();
  for (const issue of after.issues) {
    if (old.get(issue.iid) !== signature(issue)) changed.add(issue.iid);
  }
  return changed;
}

/** Changements de colonne entre deux instantanés. Ouvertures et fermetures sont déjà dans le journal. */
function moves(before: Snapshot, after: Snapshot): LiveNote[] {
  const old = new Map(before.issues.map((i) => [i.iid, i]));
  const notes: LiveNote[] = [];
  for (const issue of after.issues) {
    const previous = old.get(issue.iid);
    if (!previous || previous.column === issue.column) continue;
    if (issue.column === "done" || previous.column === "done") continue;
    const newcomer = issue.assignees.find((username) => !previous.assignees.includes(username));
    notes.push({
      id: `move-${issue.iid}-${after.version}`,
      kind: "move",
      iid: issue.iid,
      title: issue.title,
      column: issue.column,
      by: issue.column === "doing" ? (newcomer ?? null) : null,
    });
  }
  return notes;
}

/**
 * Écoute /api/stream. À chaque nouvelle version annoncée par le serveur, l'instantané est relu :
 * le navigateur n'applique jamais lui-même un changement, il redemande l'état à jour.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [news, setNews] = useState<readonly LiveNote[]>([]);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = (incoming: LiveNote[]) => {
      if (incoming.length === 0) return;
      const ids = new Set(incoming.map((note) => note.id));
      setNews((current) => [...incoming, ...current.filter((note) => !ids.has(note.id))].slice(0, NEWS_SHOWN));
      setTimeout(() => setNews((current) => current.filter((note) => !ids.has(note.id))), NEWS_DURATION);
    };

    const source = new EventSource("/api/stream");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = async (message) => {
      let event: StreamEvent;
      try {
        event = JSON.parse(message.data) as StreamEvent;
      } catch {
        return;
      }
      if (event.type === "changed") {
        show(event.activity.map((activity) => ({ id: `activity-${activity.id}`, kind: "activity", activity })));
      }

      const before = queryClient.getQueryData<Snapshot>(["snapshot"]);
      if (before && before.version === event.version) return;

      await queryClient.invalidateQueries({ queryKey: ["snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["issue"] });

      const after = queryClient.getQueryData<Snapshot>(["snapshot"]);
      if (!before || !after) return;
      show(moves(before, after));
      const changed = changedIssues(before, after);
      if (changed.size === 0) return;
      setFresh(changed);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setFresh(new Set()), 3000);
    };
    return () => {
      source.close();
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, [queryClient]);

  return <LiveContext.Provider value={{ connected, fresh, news }}>{children}</LiveContext.Provider>;
}
