import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Agent, Domain, PageHead } from "../components/bits";
import { ColumnGlyph, IssueCard } from "../components/cards";
import { plural } from "../lib/format";
import { useModel } from "../lib/model";
import type { ColumnKey, Issue } from "../lib/types";
import { COLUMN_NAMES } from "../lib/voice";

const ORDER: ColumnKey[] = ["idea", "todo", "doing", "done"];
const FAR = Number.MAX_SAFE_INTEGER;

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
    <div className="space-y-5">
      <PageHead title="Tableau">
        <span>
          {open.length} {plural(open.length, "tâche ouverte", "tâches ouvertes")} · <span className="text-lime">{free} à prendre</span>
        </span>
      </PageHead>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="chip" aria-pressed={who === me.username} onClick={() => toggle("qui", me.username)}>
          Mes tâches <kbd>M</kbd>
        </button>
        <div role="group" aria-label="Filtrer par personne" className="flex items-center gap-1 rounded-full bg-tile px-1.5 py-1">
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
              <Agent username={member.username} size={24} />
            </button>
          ))}
        </div>
        {snap.domains.map((d) => (
          <button key={d.name} type="button" className="chip" aria-pressed={domain === d.name} onClick={() => toggle("dom", d.name)}>
            <Domain name={d.name} />
          </button>
        ))}
        <select className="select" aria-label="Filtrer par échéance" value={deadline ?? ""} onChange={(event) => toggle("ech", event.target.value)}>
          <option value="">Toutes les échéances</option>
          {m.nights.map((d) => (
            <option key={d.key} value={d.key}>
              {d.short_title}
            </option>
          ))}
        </select>
        {filtered && (
          <button type="button" className="quiet ml-1" onClick={() => setParams({}, { replace: true, preventScrollReset: true })}>
            Tout afficher ×
          </button>
        )}
      </div>

      {/* Téléphone : une colonne à la fois. */}
      <div role="tablist" aria-label="Colonnes" className="seg md:hidden">
        {columns.map(({ key, issues }) => (
          <a
            key={key}
            role="tab"
            href={`?col=${key}`}
            aria-selected={shown === key}
            aria-current={shown === key ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              toggle("col", key === "todo" ? null : key);
            }}
          >
            {COLUMN_NAMES[key]} <span className="mono ml-1.5 opacity-60">{issues.length}</span>
          </a>
        ))}
      </div>

      <div className="grid items-start gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        {columns.map(({ key, issues }) => (
          <section key={key} aria-label={COLUMN_NAMES[key]} className={`tile p-3.5 ${shown === key ? "" : "hidden md:block"}`}>
            <header className="flex items-center gap-2.5 px-1.5 pt-1 pb-3">
              <ColumnGlyph column={key} />
              <h2 className="text-[14px] font-semibold">{COLUMN_NAMES[key]}</h2>
              <span className="mono ml-auto text-faint">
                {issues.length}
                {key === "done" && ` · ${snap.settings.done_window_days} j`}
              </span>
            </header>
            <div className="space-y-2">
              {issues.map((issue) => (
                <IssueCard key={issue.iid} issue={issue} />
              ))}
              {issues.length === 0 && (
                <p className="px-1.5 py-3 text-[13px] text-faint">
                  {filtered
                    ? "Rien avec ces filtres."
                    : key === "done"
                      ? `Rien de fini depuis ${snap.settings.done_window_days} jours.`
                      : key === "doing"
                        ? "Personne n'a rien pris."
                        : "Vide."}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
