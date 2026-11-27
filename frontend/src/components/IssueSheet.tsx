import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useIssueDetail } from "../lib/api";
import { ago, countdown, duration, list, slug } from "../lib/format";
import { useModel } from "../lib/model";
import type { ColumnKey } from "../lib/types";
import { COLUMN_NAMES, FLAG_TEXT } from "../lib/voice";
import { Agent, Domain, OutLink, Segments, Tag } from "./bits";

const COLUMN_COLOR: Record<ColumnKey, string> = {
  idea: "var(--dim)",
  todo: "var(--fg)",
  doing: "var(--go)",
  done: "var(--go)",
};

// Le rendu Markdown est lourd : il n'est chargé qu'à l'ouverture d'une tâche.
const LazyMd = lazy(() => import("./Md"));

function Md({ children }: { children: string }) {
  return (
    <Suspense fallback={<p className="m text-faint">LECTURE…</p>}>
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
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <code className="m select-all break-all text-fg">{name}</code>
      <button type="button" className="quiet text-go" onClick={() => void copy()}>
        {copied ? "copié ✓" : "copier"}
      </button>
    </span>
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
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={issue ? issue.title : `Tâche ${iid}`}
        className="drawer outline-none"
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line2 bg-panel px-6 py-3.5">
          <span className="m text-[13px] text-fg">#{iid}</span>
          {issue && (
            <Tag color={COLUMN_COLOR[issue.column]} solid={issue.column === "doing"}>
              {issue.column === "done" ? "✓ fait" : COLUMN_NAMES[issue.column]}
            </Tag>
          )}
          <span className="flex-1" />
          {issue && (
            <a href={issue.web_url} target="_blank" rel="noreferrer" className="c text-[12px]">
              GitLab ↗
            </a>
          )}
          <button type="button" className="quiet" onClick={() => close.current()}>
            fermer <kbd>Échap</kbd>
          </button>
        </div>

        {!issue ? (
          <p className="px-6 py-8 text-dim">
            {detail.isError ? "Cette tâche n'existe pas, ou n'existe plus, dans GitLab." : "Lecture de la tâche…"}
          </p>
        ) : (
          <div className="space-y-9 px-6 pt-7 pb-14">
            <div>
              <h2 className="x text-[clamp(24px,3.2vw,34px)] leading-[0.98] normal-case">{issue.title}</h2>
              {issue.flags.map((flag) => (
                <p key={flag} className="m mt-3 text-warn">
                  ⚠ {FLAG_TEXT[flag]}
                </p>
              ))}
              {issue.stale_days !== null && (
                <p className="m mt-3 text-warn">⚠ sans nouvelles depuis {issue.stale_days} jours</p>
              )}
            </div>

            <dl className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-x-4 border-t border-line2">
              <dt className="c border-b border-line py-3 text-faint">Responsable</dt>
              <dd className="flex flex-wrap items-center gap-3 border-b border-line py-3">
                {issue.assignees.length > 0 ? (
                  issue.assignees.map((username) => (
                    <span key={username} className="flex items-center gap-2">
                      <Agent username={username} size={26} />
                      {m.first(username)}
                    </span>
                  ))
                ) : (
                  <span className="text-dim">personne pour l'instant</span>
                )}
              </dd>

              <dt className="c border-b border-line py-3 text-faint">Domaine</dt>
              <dd className="flex flex-wrap gap-3 border-b border-line py-3">
                {issue.domains.length > 0 ? (
                  issue.domains.map((d) => <Domain key={d} name={d} />)
                ) : (
                  <span className="text-dim">aucun</span>
                )}
              </dd>

              <dt className="c border-b border-line py-3 text-faint">Échéance</dt>
              <dd className="border-b border-line py-3">
                {deadline ? (
                  <>
                    {deadline.title} <span className="m ml-2 text-faint">{countdown(deadline)}</span>
                  </>
                ) : issue.milestone ? (
                  issue.milestone.title
                ) : (
                  <span className="text-dim">aucune</span>
                )}
              </dd>

              {issue.tasks && issue.tasks.total > 0 && (
                <>
                  <dt className="c border-b border-line py-3 text-faint">Cases</dt>
                  <dd className="flex items-center gap-3 border-b border-line py-3">
                    <span className="w-40">
                      <Segments done={issue.tasks.done} total={issue.tasks.total} />
                    </span>
                    <span className="m text-dim">
                      {issue.tasks.done}/{issue.tasks.total}
                    </span>
                  </dd>
                </>
              )}

              {issue.column !== "done" && (
                <>
                  <dt className="c border-b border-line py-3 text-faint">Branche</dt>
                  <dd className="border-b border-line py-3">
                    <BranchName name={`feat/${issue.iid}-${slug(issue.title)}`} />
                  </dd>
                </>
              )}
            </dl>

            {mrs.length > 0 && (
              <section>
                <h3 className="c mb-3 text-faint">Merge requests</h3>
                <ul className="list-none space-y-3 p-0">
                  {mrs.map((mr) => (
                    <li key={mr.iid}>
                      <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                        {mr.title}
                      </OutLink>
                      <div className={`m mt-1 ${mr.overdue ? "text-alarm" : "text-faint"}`}>
                        {mr.draft
                          ? "brouillon"
                          : mr.waiting_review
                            ? `relecture attendue depuis ${duration(mr.waiting_hours ?? 0)}${
                                mr.reviewers.length ? ` · ${list(mr.reviewers.map(m.first))}` : ""
                              }`
                            : `approuvée par ${list(mr.approved_by.map(m.first))}`}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="c mb-3 text-faint">Description</h3>
              {detail.data ? (
                detail.data.description.trim() ? (
                  <Md>{detail.data.description}</Md>
                ) : (
                  <p className="text-dim">Pas de description.</p>
                )
              ) : (
                <p className="text-dim">{detail.isError ? "Description indisponible pour l'instant." : "Lecture…"}</p>
              )}
            </section>

            {detail.data && (
              <section>
                <h3 className="c mb-4 text-faint">
                  {detail.data.notes.length === 0 ? "Aucun commentaire" : `Commentaires · ${detail.data.notes.length}`}
                </h3>
                <ul className="list-none space-y-5 p-0">
                  {detail.data.notes.map((note) => (
                    <li key={note.id} className="flex gap-3">
                      <Agent username={note.author} size={28} />
                      <div className="min-w-0 flex-1">
                        <div>
                          <span className="font-semibold">{m.member(note.author)?.first_name ?? note.author_name}</span>
                          <span className="m ml-2 text-faint">{ago(note.created_at, m.now)}</span>
                        </div>
                        <Md>{note.body}</Md>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-6">
                  <a href={issue.web_url} target="_blank" rel="noreferrer" className="c text-[12px]">
                    Répondre dans GitLab ↗
                  </a>
                </p>
              </section>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
