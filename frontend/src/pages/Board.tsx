import { useEffect, type CSSProperties } from "react";
import { useSearchParams } from "react-router";
import { Gommette, PageTitle, Photo } from "../components/bits";
import { IdeaCard, TaskCard } from "../components/cards";
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
    <div className="space-y-8 px-5 py-7 md:px-10 md:py-10">
      <PageTitle title="Tableau">
        {open.length} {plural(open.length, "tâche ouverte", "tâches ouvertes")} · {free} à prendre
      </PageTitle>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          className="chip"
          aria-pressed={who === me.username}
          onClick={() => toggle("qui", me.username)}
        >
          Mes tâches <kbd>M</kbd>
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
              <Photo username={member.username} size={32} />
            </button>
          ))}
        </div>

        <div role="group" aria-label="Filtrer par domaine" className="flex flex-wrap gap-2">
          {snap.domains.map((d) => (
            <button
              key={d.name}
              type="button"
              className="chip"
              aria-pressed={domain === d.name}
              onClick={() => toggle("dom", d.name)}
            >
              <Gommette name={d.name} />
            </button>
          ))}
        </div>

        <select
          className="select"
          aria-label="Filtrer par échéance"
          value={deadline ?? ""}
          onChange={(event) => toggle("ech", event.target.value)}
        >
          <option value="">Toutes les échéances</option>
          {m.nights.map((d) => (
            <option key={d.key} value={d.key}>
              Nuit {d.night} · {d.short_title}
            </option>
          ))}
        </select>

        {filtered && (
          <button
            type="button"
            className="quiet"
            onClick={() => setParams({}, { replace: true, preventScrollReset: true })}
          >
            tout afficher
          </button>
        )}
      </div>

      {/* Téléphone : une colonne à la fois. */}
      <div role="tablist" aria-label="Colonnes" className="grid grid-cols-4 border-[1.5px] border-ink md:hidden">
        {columns.map(({ key, issues }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={shown === key}
            onClick={() => toggle("col", key === "todo" ? null : key)}
            className={`min-h-[48px] border-0 text-[13px] leading-tight ${
              shown === key ? "bg-ink font-semibold text-paper" : "bg-transparent text-soft"
            }`}
          >
            {COLUMN_NAMES[key]}
            <span className="mono block opacity-70">{issues.length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-x-7 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
        {columns.map(({ key, issues }, index) => (
          <section
            key={key}
            aria-label={COLUMN_NAMES[key]}
            className={shown === key ? "" : "hidden md:block"}
            style={{ "--i": index } as CSSProperties}
          >
            <header className="mb-4 hidden items-baseline justify-between border-b-[1.5px] border-ink pb-1 md:flex">
              <h2 className="display text-[30px]">{COLUMN_NAMES[key]}</h2>
              <span className="mono text-faint">
                {issues.length}
                {key === "done" && ` · ${snap.settings.done_window_days} j`}
              </span>
            </header>
            <div className={key === "idea" ? "space-y-4 px-1" : "space-y-3.5"}>
              {issues.map((issue) =>
                key === "idea" ? <IdeaCard key={issue.iid} issue={issue} /> : <TaskCard key={issue.iid} issue={issue} />,
              )}
              {issues.length === 0 && (
                <p className="hand py-3 text-[1.3rem] text-faint">
                  {filtered
                    ? "rien avec ces filtres"
                    : key === "done"
                      ? `rien de fini depuis ${snap.settings.done_window_days} jours`
                      : key === "doing"
                        ? "personne n'a rien pris"
                        : "rien ici"}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
