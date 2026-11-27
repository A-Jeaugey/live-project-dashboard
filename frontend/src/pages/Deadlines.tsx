import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Circled, Gommette, IssueLink, PageTitle, Photo, Section, Stamp, Ticks } from "../components/bits";
import { countdown, dayMonth, dayNumber, longDate, monthShort, plural, weekdayShort } from "../lib/format";
import { useModel, type Model } from "../lib/model";
import type { ColumnKey, Deadline, Issue } from "../lib/types";
import { COLUMN_NAMES } from "../lib/voice";
import { SetupNote } from "./Today";

const REMAINING_ORDER: ColumnKey[] = ["doing", "todo", "idea"];

/** Le bilan d'une échéance en Markdown, prêt à coller dans le rapport, les diapositives ou Discord. */
function report(m: Model, d: Deadline, issues: Issue[]): string {
  const lines = [`## ${d.title} — semaine du ${dayMonth(d.week_of)} (${countdown(d)})`, ""];
  const ms = d.milestone;
  if (ms) {
    lines.push(
      `Avancement : ${ms.closed} sur ${ms.total} ${plural(ms.total, "tâche fermée", "tâches fermées")}, ${ms.doing} en cours, ${ms.todo} à faire.`,
      "",
    );
  }
  const domains = m.snap.domains
    .map((dom) => ({ name: dom.name, all: issues.filter((i) => i.domains.includes(dom.name)) }))
    .filter((x) => x.all.length > 0);
  if (domains.length > 0) {
    lines.push("### Par domaine");
    for (const { name, all } of domains) {
      lines.push(`- ${name} : ${all.filter((i) => i.column === "done").length} sur ${all.length}`);
    }
    lines.push("");
  }
  lines.push("### Par personne");
  for (const member of m.snap.members) {
    const mine = issues.filter((i) => i.assignees.includes(member.username));
    const done = mine.filter((i) => i.column === "done").length;
    const doing = mine.filter((i) => i.column === "doing").length;
    lines.push(`- ${member.first_name} : ${done} ${plural(done, "fermée", "fermées")}, ${doing} en cours`);
  }
  const open = issues.filter((i) => i.column !== "done");
  if (open.length > 0) {
    lines.push("", "### Reste à faire");
    for (const issue of open) {
      const who = issue.assignees.map(m.first).join(", ");
      lines.push(`- #${issue.iid} ${issue.title} (${COLUMN_NAMES[issue.column].toLowerCase()}${who ? `, ${who}` : ""})`);
    }
  }
  return lines.join("\n");
}

function Detail({ deadline }: { deadline: Deadline }) {
  const m = useModel();
  const { snap } = m;
  const [copied, setCopied] = useState(false);

  const issues = snap.issues.filter((i) => i.milestone?.deadline_key === deadline.key);
  const remaining = issues
    .filter((i) => i.column !== "done")
    .sort((a, b) => REMAINING_ORDER.indexOf(a.column) - REMAINING_ORDER.indexOf(b.column) || a.iid - b.iid);
  const byDomain = snap.domains
    .map((d) => {
      const all = issues.filter((i) => i.domains.includes(d.name));
      return {
        name: d.name,
        total: all.length,
        done: all.filter((i) => i.column === "done").length,
        doing: all.filter((i) => i.column === "doing").length,
      };
    })
    .filter((d) => d.total > 0);
  const ms = deadline.milestone;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report(m, deadline, issues));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers refusé par le navigateur : rien à faire de plus
    }
  };

  return (
    <div className="space-y-9">
      <header>
        <div className="label">
          {deadline.night !== null ? `Nuit ${deadline.night} · ` : ""}semaine du {longDate(deadline.week_of).replace(/^\S+ /, "")}
        </div>
        <h2 className="display mt-2 text-[40px]">{deadline.title}</h2>
        {ms ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Ticks done={ms.closed} doing={ms.doing} total={ms.total} />
              <span>
                {ms.total === 0
                  ? "aucune tâche dans ce jalon"
                  : `${ms.closed} ${plural(ms.closed, "rendue", "rendues")} · ${ms.doing} en cours · ${ms.todo} à faire`}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <button type="button" className="btn" onClick={() => void copy()}>
                Copier le bilan
              </button>
              {copied && <span className="hand hand-biro text-[1.35rem]">copié, prêt à coller</span>}
              <a href={ms.web_url} target="_blank" rel="noreferrer">
                ouvrir le jalon dans GitLab ↗
              </a>
            </div>
          </>
        ) : (
          <p className="mt-4 text-soft">
            {deadline.past
              ? "Échéance passée, sans jalon dans GitLab."
              : "Aucun jalon GitLab ne correspond encore à cette échéance : les tâches ne peuvent pas y être rattachées."}
          </p>
        )}
      </header>

      {!ms && !deadline.past && <SetupNote />}

      {ms && (
        <>
          <Section numeral="I" title="Ce qu'il reste" aside={`${remaining.length} ${plural(remaining.length, "tâche", "tâches")}`}>
            <ul className="ruled">
              {remaining.length === 0 ? (
                <li>
                  <span className="gutter" />
                  <span className="body text-soft">
                    {ms.total === 0 ? "Rien n'est encore rattaché à ce jalon." : "Plus rien. Tout est rendu."}
                  </span>
                </li>
              ) : (
                remaining.map((issue) => (
                  <li key={issue.iid}>
                    <span className="gutter">
                      <span className={`hand ${issue.column === "doing" ? "hand-biro" : "text-soft"}`}>
                        {COLUMN_NAMES[issue.column].toLowerCase()}
                      </span>
                    </span>
                    <div className="body">
                      <div className="min-w-0 flex-1 basis-60">
                        <IssueLink issue={issue} />
                        <div className="flex flex-wrap items-center gap-x-3 text-[13px] text-soft">
                          {issue.domains.map((d) => (
                            <Gommette key={d} name={d} />
                          ))}
                          {issue.stale_days !== null && (
                            <span className="text-pen">sans nouvelles depuis {issue.stale_days} jours</span>
                          )}
                        </div>
                      </div>
                      <span className="flex -space-x-2">
                        {issue.assignees.map((username) => (
                          <Photo key={username} username={username} size={30} />
                        ))}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </Section>

          {byDomain.length > 0 && (
            <Section numeral="II" title="Par domaine">
              <ul className="m-0 grid list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 p-0">
                {byDomain.map((d) => (
                  <li key={d.name} className="contents">
                    <Gommette name={d.name} />
                    <Ticks done={d.done} doing={d.doing} total={d.total} />
                    <span className={`mono ${d.done === 0 ? "text-pen" : "text-soft"}`}>
                      {d.done} / {d.total}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section numeral={byDomain.length > 0 ? "III" : "II"} title="Qui a rendu quoi">
            <table className="form-table">
              <thead>
                <tr>
                  <th scope="col" className="label">
                    Élève
                  </th>
                  <th scope="col" className="label w-[110px]">
                    Rendues
                  </th>
                  <th scope="col" className="label w-[110px]">
                    En cours
                  </th>
                </tr>
              </thead>
              <tbody>
                {snap.members.map((member) => {
                  const mine = issues.filter((i) => i.assignees.includes(member.username));
                  return (
                    <tr key={member.username}>
                      <th scope="row" className="font-normal">
                        <span className="flex items-center gap-3">
                          <Photo username={member.username} size={28} />
                          {member.first_name}
                        </span>
                      </th>
                      <td className="mono">{mine.filter((i) => i.column === "done").length}</td>
                      <td className="mono">{mine.filter((i) => i.column === "doing").length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </div>
  );
}

/** Les échéances, présentées comme un cahier de textes : une date, un devoir à rendre. */
export function Deadlines() {
  const m = useModel();
  const [params, setParams] = useSearchParams();

  const all = [...m.snap.deadlines].sort((a, b) => a.week_of.localeCompare(b.week_of));
  const next = m.nextDeadline;
  const selected = m.deadline(params.get("e")) ?? next ?? all[all.length - 1];
  const left = all.filter((d) => !d.past).length;

  const detail = useRef<HTMLDivElement>(null);

  const select = (key: string) => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set("e", key);
        return updated;
      },
      { replace: true, preventScrollReset: true },
    );
    // Sur une seule colonne, le détail est sous la liste : on y descend.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  return (
    <div className="space-y-9 px-5 py-7 md:px-10 md:py-10">
      <PageTitle title="Cahier de textes">
        {left} {plural(left, "échéance", "échéances")} à venir
      </PageTitle>

      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <ol className="m-0 list-none self-start border-t border-rule p-0">
          {all.map((d) => {
            const isNext = d.key === next?.key;
            const isSelected = d.key === selected?.key;
            return (
              <li
                key={d.key}
                className="border-b border-rule"
                style={isSelected ? { background: "color-mix(in srgb, var(--hl) 22%, transparent)" } : undefined}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => select(d.key)}
                  className="grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 border-0 bg-transparent px-2 py-4 text-left"
                >
                  <span className="text-center leading-none">
                    <span className="label block">{weekdayShort(d.week_of)}</span>
                    <span className="display my-1 block text-[44px]">{dayNumber(d.week_of)}</span>
                    <span className="label block">{monthShort(d.week_of)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className={`hand text-[1.25rem] ${isNext ? "hand-pen" : "text-soft"}`}>
                      {d.night !== null ? `nuit ${d.night}` : "avant la première nuit"}
                    </span>
                    <span className={`display block text-[27px] ${d.past ? "text-soft line-through decoration-1" : ""}`}>
                      {d.title}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-soft">
                      {d.milestone ? (
                        d.milestone.total > 0 ? (
                          <>
                            <Ticks done={d.milestone.closed} doing={d.milestone.doing} total={d.milestone.total} />
                            <span className="mono">
                              {d.milestone.closed} / {d.milestone.total}
                            </span>
                          </>
                        ) : (
                          "jalon créé, encore vide"
                        )
                      ) : d.past ? null : (
                        <span className="hand hand-pen text-[1.2rem]">jalon à créer dans GitLab</span>
                      )}
                    </span>
                  </span>
                  <span className="pr-2">
                    {d.past ? (
                      <Stamp color="var(--ok)" tilt={-8}>
                        passée
                      </Stamp>
                    ) : isNext ? (
                      <span className="hand hand-pen text-[34px]" style={{ transform: "rotate(-4deg)" }}>
                        <Circled>{countdown(d)}</Circled>
                      </span>
                    ) : (
                      <span className="mono text-[15px] text-soft">{countdown(d)}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div ref={detail} className="scroll-mt-4">
          {selected && <Detail key={selected.key} deadline={selected} />}
        </div>
      </div>
    </div>
  );
}
