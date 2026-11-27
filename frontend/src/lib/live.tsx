import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Activity, Issue, Snapshot, StreamEvent } from "./types";

interface Live {
  /** Le flux temps réel est-il ouvert ? */
  connected: boolean;
  /** Issues qui viennent de changer : elles reçoivent un coup de surligneur. */
  fresh: ReadonlySet<number>;
  /** Événements arrivés pendant que la page est ouverte, affichés quelques secondes. */
  news: readonly Activity[];
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

/**
 * Écoute /api/stream. À chaque nouvelle version annoncée par le serveur, l'instantané est relu :
 * le navigateur n'applique jamais lui-même un changement, il redemande l'état à jour.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [news, setNews] = useState<readonly Activity[]>([]);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
      if (event.type === "changed" && event.activity.length > 0) {
        const incoming = event.activity.slice(0, NEWS_SHOWN);
        const ids = new Set(incoming.map((a) => a.id));
        setNews((current) => [...incoming, ...current.filter((a) => !ids.has(a.id))].slice(0, NEWS_SHOWN));
        setTimeout(() => setNews((current) => current.filter((a) => !ids.has(a.id))), NEWS_DURATION);
      }

      const before = queryClient.getQueryData<Snapshot>(["snapshot"]);
      if (before && before.version === event.version) return;

      await queryClient.invalidateQueries({ queryKey: ["snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["issue"] });

      const after = queryClient.getQueryData<Snapshot>(["snapshot"]);
      if (!before || !after) return;
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
