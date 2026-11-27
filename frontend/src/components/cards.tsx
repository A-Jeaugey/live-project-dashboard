import { ago, countdown, duration } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import type { Issue } from "../lib/types";
import { Gommette, Photo, Stamp, useOpenIssue } from "./bits";

/** Une idée : un post-it. */
export function IdeaCard({ issue }: { issue: Issue }) {
  const open = useOpenIssue();
  const { fresh } = useLive();
  const m = useModel();
  return (
    <button
      type="button"
      className={`postit ${fresh.has(issue.iid) ? "fresh" : ""}`}
      onClick={() => open(issue.iid)}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="mono text-faint">#{issue.iid}</span>
        <span className="flex gap-3">
          {issue.domains.map((d) => (
            <Gommette key={d} name={d} />
          ))}
        </span>
      </span>
      <span className="mt-1.5 block leading-snug font-medium">{issue.title}</span>
      <span className="mt-1.5 flex items-end justify-between gap-3 text-[12.5px] text-soft">
        <span>{issue.author ? m.first(issue.author) : ""}</span>
        {issue.flags.includes("needs_triage") && <span className="hand hand-pen text-[1.25rem]">à trier ?</span>}
      </span>
    </button>
  );
}

/** Une tâche décidée : une fiche bristol, titre au-dessus de la ligne rouge, détails sur les lignes. */
export function TaskCard({ issue }: { issue: Issue }) {
  const open = useOpenIssue();
  const { fresh } = useLive();
  const m = useModel();
  const deadline = m.deadline(issue.milestone?.deadline_key);
  const done = issue.column === "done";
  const mrs = issue.merge_requests.flatMap((iid) => m.mr(iid) ?? []);

  return (
    <button
      type="button"
      className={`fiche ${fresh.has(issue.iid) ? "fresh" : ""}`}
      onClick={() => open(issue.iid)}
    >
      <span className="fiche-head flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="mono block text-faint">#{issue.iid}</span>
          <span className={`mt-0.5 block leading-snug font-medium ${done ? "text-soft" : ""}`}>{issue.title}</span>
        </span>
        {issue.assignees.length > 0 && (
          <span className="flex shrink-0 -space-x-2 pt-0.5">
            {issue.assignees.map((username) => (
              <Photo key={username} username={username} size={32} />
            ))}
          </span>
        )}
      </span>

      <span className="fiche-lines block text-[13px]">
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 gap-3 overflow-hidden">
            {issue.domains.length > 0 ? (
              issue.domains.map((d) => <Gommette key={d} name={d} />)
            ) : (
              <span className="text-faint">sans domaine</span>
            )}
          </span>
          {deadline && !done && (
            <span className="mono shrink-0 text-faint" title={deadline.title}>
              {deadline.night ? `nuit ${deadline.night}` : deadline.short_title} · {countdown(deadline.days_left)}
            </span>
          )}
        </span>
        {!done &&
          mrs.map((mr) => (
            <span key={mr.iid} className={`block ${mr.overdue ? "text-pen" : "text-soft"}`}>
              <span className="mono">!{mr.iid}</span>{" "}
              {mr.draft
                ? "en brouillon"
                : mr.waiting_review
                  ? `attend une relecture · ${duration(mr.waiting_hours ?? 0)}`
                  : "relue, prête à fusionner"}
            </span>
          ))}
        {issue.stale_days !== null && (
          <span className="hand hand-pen block text-[1.25rem] leading-[27px]">{issue.stale_days} j. sans nouvelles</span>
        )}
        {issue.flags.includes("doing_unassigned") && (
          <span className="hand hand-pen block text-[1.25rem] leading-[27px]">personne dessus ?</span>
        )}
        {done && issue.closed_at && <span className="block text-soft">fermée {ago(issue.closed_at, m.now)}</span>}
      </span>

      {done && (
        <span className="absolute right-3 bottom-2">
          <Stamp color="var(--ok)" tilt={-9}>
            fait
          </Stamp>
        </span>
      )}
    </button>
  );
}
