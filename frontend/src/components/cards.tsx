import type { CSSProperties } from "react";
import { ago, countdown, duration } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import type { Issue } from "../lib/types";
import { Agent, Domain, Pill, useOpenIssue } from "./bits";

/** Une tâche du tableau. */
export function IssueCard({ issue }: { issue: Issue }) {
  const open = useOpenIssue();
  const { fresh } = useLive();
  const m = useModel();
  const deadline = m.deadline(issue.milestone?.deadline_key);
  const done = issue.column === "done";
  const mrs = done ? [] : issue.merge_requests.flatMap((iid) => m.mr(iid) ?? []);

  return (
    <button type="button" className={`card ${fresh.has(issue.iid) ? "fresh" : ""}`} data-kind={issue.column} onClick={() => open(issue.iid)}>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="ref">#{issue.iid}</span>
          <span className={`mt-1 block leading-snug font-medium ${done ? "text-muted" : ""}`}>{issue.title}</span>
        </span>
        {issue.assignees.length > 0 && (
          <span className="flex shrink-0 -space-x-1.5">
            {issue.assignees.map((username) => (
              <Agent key={username} username={username} size={24} />
            ))}
          </span>
        )}
      </span>

      <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {issue.domains.map((d) => (
          <Domain key={d} name={d} />
        ))}
        {issue.domains.length === 0 && <span className="text-[12.5px] text-faint">sans domaine</span>}
        {deadline && !done && (
          <span className="mono ml-auto text-[11.5px] text-faint" title={deadline.title}>
            {countdown(deadline)}
          </span>
        )}
        {done && issue.closed_at && <span className="ml-auto text-[12px] text-faint">{ago(issue.closed_at, m.now)}</span>}
      </span>

      {(mrs.length > 0 || issue.stale_days !== null || issue.flags.length > 0) && (
        <span className="mt-3 flex flex-wrap gap-1.5">
          {mrs.map((mr) => (
            <Pill key={mr.iid} color={mr.overdue ? "var(--red)" : mr.waiting_review ? "var(--blue)" : "var(--green)"}>
              !{mr.iid} · {mr.draft ? "brouillon" : mr.waiting_review ? `relecture ${duration(mr.waiting_hours ?? 0)}` : "relue"}
            </Pill>
          ))}
          {issue.stale_days !== null && <Pill color="var(--amber)">{issue.stale_days} j sans activité</Pill>}
          {issue.flags.includes("needs_triage") && <Pill color="var(--amber)">à trier</Pill>}
          {issue.flags.includes("doing_unassigned") && <Pill color="var(--amber)">personne dessus</Pill>}
          {issue.flags.includes("multiple_columns") && <Pill color="var(--amber)">deux colonnes</Pill>}
        </span>
      )}
    </button>
  );
}

/** Pastille ronde de colonne, reprise en tête de colonne et dans le détail. */
export function ColumnGlyph({ column, size = 12 }: { column: Issue["column"]; size?: number }) {
  const style = { width: size, height: size } as CSSProperties;
  if (column === "idea") return <span className="inline-block flex-none rounded-full border-[1.5px] border-dashed border-muted" style={style} />;
  if (column === "todo") return <span className="inline-block flex-none rounded-full border-[1.5px] border-muted" style={style} />;
  if (column === "doing")
    return (
      <span
        className="inline-block flex-none rounded-full border-[1.5px] border-blue"
        style={{ ...style, background: "conic-gradient(var(--blue) 0 50%, transparent 50% 100%)" }}
      />
    );
  return <span className="inline-block flex-none rounded-full bg-green" style={style} />;
}
