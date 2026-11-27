import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useIssueDetail } from "../lib/api";
import { ago, countdown, duration, list, slug } from "../lib/format";
import { useModel } from "../lib/model";
import type { ColumnKey } from "../lib/types";
import { COLUMN_NAMES, FLAG_TEXT } from "../lib/voice";
import { Agent, Bar, Domain, OutLink, Pill } from "./bits";
import { ColumnGlyph } from "./cards";

const COLUMN_COLOR: Record<ColumnKey, string> = {
  idea: "var(--muted)",
  todo: "var(--muted)",
  doing: "var(--blue)",
  done: "var(--green)",
};

// Le rendu Markdown est lourd : il n'est chargé qu'à l'ouverture d'une tâche.
const LazyMd = lazy(() => import("./Md"));

function Md({ children }: { children: string }) {
  return (
    <Suspense fallback={<p className="text-faint">Lecture…</p>}>
      <LazyMd>{children}</LazyMd>
    </Suspense>
  );
}

function BranchName({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // presse-papiers refusé : le nom reste sélectionnable à la main
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="flex w-full items-center gap-3 rounded-xl border-0 bg-tile2 px-3 py-2.5 text-left hover:bg-tile3"
      title="Copier le nom de branche"
    >
      <code className="mono min-w-0 flex-1 break-all text-fg">{name}</code>
      <span className="flex-none text-[12.5px] text-muted">{copied ? "Copié ✓" : "Copier"}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-2.5">
      <dt className="w-[104px] flex-none text-[13px] text-muted">{label}</dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-center gap-2.5">{children}</dd>
    </div>
  );
}

/** Détail d'une tâche, ouvert par le paramètre d'URL `t` depuis n'importe quel écran. */
export function IssueSheet() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("t");
  const iid = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;

  const m = useModel();
  const detail = useIssueDetail(iid);
  const panel = useRef<HTMLElement>(null);
  const close = useRef(() => {});
  close.current = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("t");
        return next;
      },
      { preventScrollReset: true },
    );

  useEffect(() => {
    if (iid === null) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [iid]);

  if (iid === null) return null;

  const issue = detail.data ?? m.issue(iid);
  const deadline = issue ? m.deadline(issue.milestone?.deadline_key) : undefined;
  const mrs = issue ? issue.merge_requests.flatMap((id) => m.mr(id) ?? []) : [];

  return (
    <>
      <div className="backdrop" onClick={() => close.current()} />
      <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={issue ? issue.title : `Tâche ${iid}`} className="drawer outline-none">
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-tile px-6 pt-5 pb-3">
          {issue && (
            <Pill color={COLUMN_COLOR[issue.column]}>
              <ColumnGlyph column={issue.column} size={10} />
              {COLUMN_NAMES[issue.column]}
            </Pill>
          )}
          <span className="mono text-faint">#{iid}</span>
          <span className="flex-1" />
          {issue && (
            <a href={issue.web_url} target="_blank" rel="noreferrer" className="chip">
              GitLab ↗
            </a>
          )}
          <button type="button" className="chip" onClick={() => close.current()} aria-label="Fermer">
            ✕
          </button>
        </div>

        {!issue ? (
          <p className="px-6 py-8 text-muted">
            {detail.isError ? "Cette tâche n'existe pas, ou n'existe plus, dans GitLab." : "Lecture de la tâche…"}
          </p>
        ) : (
          <div className="space-y-7 px-6 pt-2 pb-10">
            <div>
              <h2 className="title text-[26px]">{issue.title}</h2>
              {(issue.flags.length > 0 || issue.stale_days !== null) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {issue.flags.map((flag) => (
                    <Pill key={flag} color="var(--amber)">
                      {FLAG_TEXT[flag]}
                    </Pill>
                  ))}
                  {issue.stale_days !== null && <Pill color="var(--amber)">{issue.stale_days} jours sans activité</Pill>}
                </div>
              )}
            </div>

            <dl className="rounded-2xl bg-tile2/60 px-4 py-1.5">
              <Field label="Responsable">
                {issue.assignees.length > 0 ? (
                  issue.assignees.map((username) => (
                    <span key={username} className="flex items-center gap-2">
                      <Agent username={username} size={24} />
                      {m.first(username)}
                    </span>
                  ))
                ) : (
                  <span className="text-muted">Personne pour l'instant</span>
                )}
              </Field>
              <Field label="Domaine">
                {issue.domains.length > 0 ? issue.domains.map((d) => <Domain key={d} name={d} />) : <span className="text-muted">Aucun</span>}
              </Field>
              <Field label="Échéance">
                {deadline ? (
                  <>
                    {deadline.title}
                    <span className="mono text-faint">{countdown(deadline)}</span>
                  </>
                ) : issue.milestone ? (
                  issue.milestone.title
                ) : (
                  <span className="text-muted">Aucune</span>
                )}
              </Field>
              {issue.tasks && issue.tasks.total > 0 && (
                <Field label="Cases">
                  <span className="w-36">
                    <Bar done={issue.tasks.done} total={issue.tasks.total} />
                  </span>
                  <span className="mono text-muted">
                    {issue.tasks.done}/{issue.tasks.total}
                  </span>
                </Field>
              )}
            </dl>

            {issue.column !== "done" && (
              <section>
                <h3 className="mb-2 text-[13px] font-medium text-muted">Nom de branche</h3>
                <BranchName name={`feat/${issue.iid}-${slug(issue.title)}`} />
              </section>
            )}

            {mrs.length > 0 && (
              <section>
                <h3 className="mb-2 text-[13px] font-medium text-muted">Merge requests</h3>
                <ul className="rows top">
                  {mrs.map((mr) => (
                    <li key={mr.iid}>
                      <div className="min-w-0 flex-1">
                        <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                          {mr.title}
                        </OutLink>
                        <div className={`mt-0.5 text-[12.5px] ${mr.overdue ? "text-red" : "text-muted"}`}>
                          {mr.draft
                            ? "Brouillon"
                            : mr.waiting_review
                              ? `Relecture attendue depuis ${duration(mr.waiting_hours ?? 0)}${mr.reviewers.length ? ` · ${list(mr.reviewers.map(m.first))}` : ""}`
                              : `Approuvée par ${list(mr.approved_by.map(m.first))}`}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-[13px] font-medium text-muted">Description</h3>
              {detail.data ? (
                detail.data.description.trim() ? (
                  <Md>{detail.data.description}</Md>
                ) : (
                  <p className="text-faint">Pas de description.</p>
                )
              ) : (
                <p className="text-faint">{detail.isError ? "Description indisponible pour l'instant." : "Lecture…"}</p>
              )}
            </section>

            {detail.data && (
              <section>
                <h3 className="mb-3 text-[13px] font-medium text-muted">
                  {detail.data.notes.length === 0 ? "Aucun commentaire" : `Commentaires · ${detail.data.notes.length}`}
                </h3>
                <ul className="m-0 list-none space-y-3 p-0">
                  {detail.data.notes.map((note) => (
                    <li key={note.id} className="flex gap-3">
                      <Agent username={note.author} size={28} />
                      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-tile2 px-3.5 py-2.5">
                        <div className="text-[13px]">
                          <span className="font-semibold">{m.member(note.author)?.first_name ?? note.author_name}</span>
                          <span className="ml-2 text-faint">{ago(note.created_at, m.now)}</span>
                        </div>
                        <Md>{note.body}</Md>
                      </div>
                    </li>
                  ))}
                </ul>
                <a href={issue.web_url} target="_blank" rel="noreferrer" className="btn btn-ghost mt-4">
                  Répondre dans GitLab ↗
                </a>
              </section>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
