import { ago, countdown, duration } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import type { Issue } from "../lib/types";
import { Agent, Domain, Tag, useOpenIssue } from "./bits";

/** Une tâche du tableau. Le cadre change selon la colonne : pointillé pour une idée, éteint une fois faite. */
export function IssueCard({ issue }: { issue: Issue }) {
  const open = useOpenIssue();
  const { fresh } = useLive();
  const m = useModel();
  const deadline = m.deadline(issue.milestone?.deadline_key);
  const done = issue.column === "done";
  const idea = issue.column === "idea";
  const mrs = issue.merge_requests.flatMap((iid) => m.mr(iid) ?? []);

  return (
    <button
      type="button"
      className={`card ${fresh.has(issue.iid) ? "fresh" : ""}`}
      data-kind={issue.column}
      onClick={() => open(issue.iid)}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="m block text-faint">#{issue.iid}</span>
          <span className="mt-1 block leading-snug font-medium">{issue.title}</span>
        </span>
        {issue.assignees.length > 0 && (
          <span className="flex shrink-0 -space-x-1.5">
            {issue.assignees.map((username) => (
              <Agent key={username} username={username} size={26} />
            ))}
          </span>
        )}
      </span>

      <span className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
          {issue.domains.length > 0 ? (
            issue.domains.map((d) => <Domain key={d} name={d} />)
          ) : (
            <span className="m text-faint">sans domaine</span>
          )}
        </span>
        {deadline && !done && (
          <span className="m shrink-0 text-faint" title={deadline.title}>
            {deadline.night !== null ? `N${deadline.night} · ` : ""}
            {countdown(deadline)}
          </span>
        )}
        {idea && issue.author && <span className="m text-faint">{m.first(issue.author)}</span>}
      </span>

      {!done &&
        mrs.map((mr) => (
          <span key={mr.iid} className={`m mt-2 block ${mr.overdue ? "text-alarm" : "text-dim"}`}>
            !{mr.iid} ·{" "}
            {mr.draft
              ? "brouillon"
              : mr.waiting_review
                ? `relecture attendue · ${duration(mr.waiting_hours ?? 0)}`
                : "relue, prête à fusionner"}
          </span>
        ))}
      {issue.stale_days !== null && (
        <span className="m mt-2 block text-warn">{issue.stale_days} J SANS NOUVELLES</span>
      )}
      {issue.flags.includes("needs_triage") && (
        <span className="mt-2.5 block">
          <Tag color="var(--warn)">à trier</Tag>
        </span>
      )}
      {issue.flags.includes("doing_unassigned") && <span className="m mt-2 block text-warn">PERSONNE DESSUS</span>}
      {done && issue.closed_at && <span className="m mt-2 block text-go">✓ FAIT · {ago(issue.closed_at, m.now)}</span>}
    </button>
  );
}
