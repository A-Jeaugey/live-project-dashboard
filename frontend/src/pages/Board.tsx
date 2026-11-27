import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Agent, Domain, PageHead } from "../components/bits";
import { IssueCard } from "../components/cards";
import { useModel } from "../lib/model";
import type { ColumnKey, Issue } from "../lib/types";
import { COLUMN_NAMES } from "../lib/voice";

const ORDER: ColumnKey[] = ["idea", "todo", "doing", "done"];
const FAR = Number.MAX_SAFE_INTEGER;

/** Les mêmes signes que sur le plan de l'étage. */
const GLYPH: Record<ColumnKey, ReactNode> = {
  idea: <span className="inline-block h-[11px] w-[11px] rounded-full border-[1.5px] border-dim" />,
  todo: <span className="inline-block h-[11px] w-[11px] border-[1.5px] border-fg" />,
  doing: <span className="inline-block h-[11px] w-[11px] bg-go" />,
  done: <span className="text-go">✓</span>,
};

export function Board() {
  const m = useModel();
  const { snap, me } = m;
  const [params, setParams] = useSearchParams();

  const who = params.get("qui");
  const domain = params.get("dom");
  const deadline = params.get("ech");
  const shown = (ORDER.find((c) => c === params.get("col")) ?? "todo") satisfies ColumnKey;
  const filtered = Boolean(who || domain || deadline);

  /** Pose un filtre dans l'URL ; le reposer à l'identique l'enlève. */
  const toggle = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null || value === "" || next.get(key) === value) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key.toLowerCase() === "m") toggle("qui", me.username);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const matches = (issue: Issue) =>
    (!who || issue.assignees.includes(who)) &&
    (!domain || issue.domains.includes(domain)) &&
    (!deadline || issue.milestone?.deadline_key === deadline);

  const urgency = (issue: Issue) => m.deadline(issue.milestone?.deadline_key)?.days_left ?? FAR;
  const sorters: Record<ColumnKey, (a: Issue, b: Issue) => number> = {
    idea: (a, b) =>
      Number(b.flags.includes("needs_triage")) - Number(a.flags.includes("needs_triage")) ||
      Date.parse(b.created_at) - Date.parse(a.created_at),
    todo: (a, b) => urgency(a) - urgency(b) || a.iid - b.iid,
    doing: (a, b) => (b.stale_days ?? 0) - (a.stale_days ?? 0) || urgency(a) - urgency(b) || a.iid - b.iid,
    done: (a, b) => Date.parse(b.closed_at ?? b.updated_at) - Date.parse(a.closed_at ?? a.updated_at),
  };

  const columns = ORDER.map((key) => ({ key, issues: m.inColumn(key).filter(matches).sort(sorters[key]) }));
  const open = snap.issues.filter((i) => i.column !== "done");
  const free = open.filter((i) => i.column === "todo" && i.assignees.length === 0).length;

  return (
    <div className="space-y-8 py-8 md:py-10">
      <PageHead title="Tableau" kicker="02 · TOUTES LES TÂCHES, LUES DANS GITLAB">
        {String(open.length).padStart(2, "0")} OUVERTES · <span className="text-go">{String(free).padStart(2, "0")} À PRENDRE</span>
      </PageHead>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" className="chip" aria-pressed={who === me.username} onClick={() => toggle("qui", me.username)}>
          MES TÂCHES <kbd>M</kbd>
        </button>

        <div role="group" aria-label="Filtrer par personne" className="flex items-center gap-1">
          {snap.members.map((member) => (
            <button
              key={member.username}
              type="button"
              className="who"
              aria-label={member.first_name}
              aria-pressed={who === member.username}
              data-dimmed={who !== null && who !== member.username}
              onClick={() => toggle("qui", member.username)}
            >
              <Agent username={member.username} size={30} />
            </button>
          ))}
        </div>

        <div role="group" aria-label="Filtrer par domaine" className="flex flex-wrap gap-1.5">
          {snap.domains.map((d) => (
            <button
              key={d.name}
              type="button"
              className="chip"
              aria-pressed={domain === d.name}
              onClick={() => toggle("dom", d.name)}
            >
              <Domain name={d.name} />
            </button>
          ))}
        </div>

        <select
          className="select"
          aria-label="Filtrer par échéance"
          value={deadline ?? ""}
          onChange={(event) => toggle("ech", event.target.value)}
        >
          <option value="">TOUTES LES ÉCHÉANCES</option>
          {m.nights.map((d) => (
            <option key={d.key} value={d.key}>
              NUIT {d.night} · {d.short_title}
            </option>
          ))}
        </select>

        {filtered && (
          <button type="button" className="quiet" onClick={() => setParams({}, { replace: true, preventScrollReset: true })}>
            tout afficher ×
          </button>
        )}
      </div>

      {/* Téléphone : une colonne à la fois. */}
      <div role="tablist" aria-label="Colonnes" className="grid grid-cols-4 border border-line2 md:hidden">
        {columns.map(({ key, issues }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={shown === key}
            onClick={() => toggle("col", key === "todo" ? null : key)}
            className={`min-h-[52px] border-0 ${shown === key ? "bg-go text-bg" : "bg-transparent text-dim"}`}
          >
            <span className="c block text-[12px]">{COLUMN_NAMES[key]}</span>
            <span className="m block">{String(issues.length).padStart(2, "0")}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
        {columns.map(({ key, issues }) => (
          <section key={key} aria-label={COLUMN_NAMES[key]} className={shown === key ? "" : "hidden md:block"}>
            <header className="pane-h hidden border-b border-line2 md:flex">
              <span className="self-center leading-none">{GLYPH[key]}</span>
              <h2 className="c text-fg">{COLUMN_NAMES[key]}</h2>
              <span className="leader" aria-hidden="true" />
              <span className="m text-faint">
                {String(issues.length).padStart(2, "0")}
                {key === "done" && ` · ${snap.settings.done_window_days} J`}
              </span>
            </header>
            <div className="space-y-2.5 md:pt-3">
              {issues.map((issue) => (
                <IssueCard key={issue.iid} issue={issue} />
              ))}
              {issues.length === 0 && (
                <p className="m py-4 text-faint">
                  {filtered
                    ? "RIEN AVEC CES FILTRES"
                    : key === "done"
                      ? `RIEN DE FINI DEPUIS ${snap.settings.done_window_days} J`
                      : key === "doing"
                        ? "PERSONNE N'A RIEN PRIS"
                        : "VIDE"}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
