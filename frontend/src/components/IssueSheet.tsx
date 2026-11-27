import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useIssueDetail } from "../lib/api";
import { ago, countdown, duration, list, slug } from "../lib/format";
import { useModel } from "../lib/model";
import type { ColumnKey } from "../lib/types";
import { COLUMN_NAMES, FLAG_TEXT } from "../lib/voice";
import { Gommette, OutLink, Photo, Stamp } from "./bits";

const STAMP_COLOR: Record<ColumnKey, string> = {
  idea: "var(--ink-soft)",
  todo: "var(--ink)",
  doing: "var(--biro)",
  done: "var(--ok)",
};

// Le rendu Markdown est lourd : il n'est chargé qu'à l'ouverture d'une tâche.
const LazyMd = lazy(() => import("./Md"));

function Md({ children }: { children: string }) {
  return (
    <Suspense fallback={<p className="text-soft">Lecture…</p>}>
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
      <code className="mono select-all break-all">{name}</code>
      <button type="button" className="quiet" onClick={() => void copy()}>
        copier
      </button>
      {copied && <span className="hand hand-biro text-[1.2rem]">copié</span>}
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
        className="panel outline-none"
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-raised px-6 py-3">
          <span className="mono text-faint">#{iid}</span>
          {issue && <Stamp color={STAMP_COLOR[issue.column]}>{COLUMN_NAMES[issue.column]}</Stamp>}
          <span className="flex-1" />
          {issue && (
            <a href={issue.web_url} target="_blank" rel="noreferrer">
              ouvrir dans GitLab ↗
            </a>
          )}
          <button type="button" className="quiet" onClick={() => close.current()}>
            fermer <kbd>Échap</kbd>
          </button>
        </div>

        {!issue ? (
          <p className="px-6 py-8 text-soft">
            {detail.isError ? "Cette tâche n'existe pas, ou n'existe plus, dans GitLab." : "Lecture de la tâche…"}
          </p>
        ) : (
          <div className="space-y-8 px-6 pt-6 pb-12">
            <div>
              <h2 className="display text-[38px]">{issue.title}</h2>
              {issue.flags.map((flag) => (
                <p key={flag} className="hand hand-pen mt-2 text-[1.35rem]">
                  {FLAG_TEXT[flag]}
                </p>
              ))}
              {issue.stale_days !== null && (
                <p className="hand hand-pen mt-2 text-[1.35rem]">sans nouvelles depuis {issue.stale_days} jours</p>
              )}
            </div>

            <dl className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-4 gap-y-3.5">
              <dt className="label">Responsable</dt>
              <dd className="m-0 flex flex-wrap items-center gap-3">
                {issue.assignees.length > 0 ? (
                  issue.assignees.map((username) => (
                    <span key={username} className="flex items-center gap-2">
                      <Photo username={username} size={30} />
                      {m.first(username)}
                    </span>
                  ))
                ) : (
                  <span className="text-soft">personne pour l'instant</span>
                )}
              </dd>

              <dt className="label">Domaine</dt>
              <dd className="m-0 flex flex-wrap gap-3">
                {issue.domains.length > 0 ? (
                  issue.domains.map((d) => <Gommette key={d} name={d} />)
                ) : (
                  <span className="text-soft">aucun</span>
                )}
              </dd>

              <dt className="label">Échéance</dt>
              <dd className="m-0">
                {deadline ? (
                  <>
                    {deadline.night !== null && `Nuit ${deadline.night} · `}
                    {deadline.title} <span className="mono text-faint">· {countdown(deadline.days_left)}</span>
                  </>
                ) : issue.milestone ? (
                  issue.milestone.title
                ) : (
                  <span className="text-soft">aucune</span>
                )}
              </dd>

              {issue.tasks && issue.tasks.total > 0 && (
                <>
                  <dt className="label">Cases</dt>
                  <dd className="m-0">
                    {issue.tasks.done} cochées sur {issue.tasks.total}
                  </dd>
                </>
              )}

              {issue.column !== "done" && (
                <>
                  <dt className="label">Branche</dt>
                  <dd className="m-0">
                    <BranchName name={`feat/${issue.iid}-${slug(issue.title)}`} />
                  </dd>
                </>
              )}
            </dl>

            {mrs.length > 0 && (
              <section>
                <h3 className="label mb-2">Merge requests</h3>
                <ul className="m-0 list-none space-y-2 p-0">
                  {mrs.map((mr) => (
                    <li key={mr.iid}>
                      <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                        {mr.title}
                      </OutLink>
                      <div className={`text-[13px] ${mr.overdue ? "text-pen" : "text-soft"}`}>
                        {mr.draft
                          ? "en brouillon"
                          : mr.waiting_review
                            ? `attend une relecture depuis ${duration(mr.waiting_hours ?? 0)}${
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
              <h3 className="label mb-2">Description</h3>
              {detail.data ? (
                detail.data.description.trim() ? (
                  <Md>{detail.data.description}</Md>
                ) : (
                  <p className="text-soft">Pas de description.</p>
                )
              ) : (
                <p className="text-soft">{detail.isError ? "Description indisponible pour l'instant." : "Lecture…"}</p>
              )}
            </section>

            {detail.data && (
              <section>
                <h3 className="label mb-3">
                  {detail.data.notes.length === 0 ? "Aucun commentaire" : `Commentaires · ${detail.data.notes.length}`}
                </h3>
                <ul className="m-0 list-none space-y-5 p-0">
                  {detail.data.notes.map((note) => (
                    <li key={note.id} className="flex gap-3">
                      <Photo username={note.author} size={32} />
                      <div className="min-w-0 flex-1">
                        <div>
                          <span className="font-semibold">{m.member(note.author)?.first_name ?? note.author_name}</span>{" "}
                          <span className="mono text-faint">· {ago(note.created_at, m.now)}</span>
                        </div>
                        <Md>{note.body}</Md>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-5">
                  <a href={issue.web_url} target="_blank" rel="noreferrer">
                    répondre dans GitLab ↗
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
