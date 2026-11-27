import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Agent, Domain, IssueLink, PageHead, Pane, Segments, Tag } from "../components/bits";
import { countdown, dayMonth, longDate, plural } from "../lib/format";
import { useModel, type Model } from "../lib/model";
import { roomOf } from "../lib/rooms";
import type { ColumnKey, Deadline, Issue } from "../lib/types";
import { COLUMN_NAMES } from "../lib/voice";
import { SetupNote } from "./Today";

const REMAINING_ORDER: ColumnKey[] = ["doing", "todo", "idea"];
const two = (n: number) => String(n).padStart(2, "0");

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
    <div className="space-y-10">
      <header>
        <div className="m text-go">
          {deadline.night !== null ? `NUIT ${two(deadline.night)} · ` : ""}
          SEMAINE DU {longDate(deadline.week_of).replace(/^\S+ /, "").toUpperCase()}
        </div>
        <h2 className="x mt-3 text-[clamp(26px,3.4vw,44px)] leading-[0.95] normal-case">{deadline.title}</h2>
        {ms ? (
          <>
            <div className="mt-6">
              <div className="mb-2 flex items-baseline gap-3">
                <span className="c text-dim">Avancement</span>
                <span className="leader" aria-hidden="true" />
                <span className="m text-fg">
                  {ms.total === 0 ? "aucune tâche" : `${ms.closed} rendues · ${ms.doing} en cours · ${ms.todo} à faire`}
                </span>
              </div>
              <Segments done={ms.closed} doing={ms.doing} total={ms.total} />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <button type="button" className="btn" onClick={() => void copy()}>
                {copied ? "Copié ✓" : "Copier le bilan"}
              </button>
              <a href={ms.web_url} target="_blank" rel="noreferrer" className="c text-[12px]">
                Jalon dans GitLab ↗
              </a>
            </div>
          </>
        ) : (
          <p className="mt-5 text-dim">
            {deadline.past
              ? "Échéance passée, sans jalon dans GitLab."
              : "Aucun jalon GitLab ne correspond encore à cette échéance : les tâches ne peuvent pas y être rattachées."}
          </p>
        )}
      </header>

      {!ms && !deadline.past && <SetupNote />}

      {ms && (
        <>
          <Pane n="01" title="Ce qu'il reste" meta={`${two(remaining.length)} ${plural(remaining.length, "tâche", "tâches")}`}>
            <ul className="rows" style={{ "--gutter": "86px" } as React.CSSProperties}>
              {remaining.length === 0 ? (
                <li>
                  <span className="k m text-go">RAS</span>
                  <span className="text-dim">
                    {ms.total === 0 ? "Rien n'est encore rattaché à ce jalon." : "Plus rien. Tout est rendu."}
                  </span>
                </li>
              ) : (
                remaining.map((issue) => (
                  <li key={issue.iid}>
                    <span className="k">
                      <Tag color={issue.column === "doing" ? "var(--go)" : "var(--dim)"}>{COLUMN_NAMES[issue.column]}</Tag>
                    </span>
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <IssueLink issue={issue} />
                        <div className="mt-1 flex flex-wrap items-center gap-x-3">
                          {issue.domains.map((d) => (
                            <Domain key={d} name={d} />
                          ))}
                          {issue.stale_days !== null && (
                            <span className="m text-warn">{issue.stale_days} j sans nouvelles</span>
                          )}
                        </div>
                      </div>
                      <span className="flex -space-x-1.5">
                        {issue.assignees.map((username) => (
                          <Agent key={username} username={username} size={26} />
                        ))}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </Pane>

          {byDomain.length > 0 && (
            <Pane n="02" title="Par salle">
              <ul className="rows" style={{ "--gutter": "150px" } as React.CSSProperties}>
                {byDomain.map((d) => (
                  <li key={d.name} className="items-center">
                    <span className="k">
                      <span className="c block text-fg">{roomOf(d.name)}</span>
                      <Domain name={d.name} />
                    </span>
                    <span className="flex items-center gap-4">
                      <span className="flex-1">
                        <Segments done={d.done} doing={d.doing} total={d.total} />
                      </span>
                      <span className={`m ${d.done === 0 ? "text-warn" : "text-dim"}`}>
                        {d.done}/{d.total}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Pane>
          )}

          <Pane n={byDomain.length > 0 ? "03" : "02"} title="Qui a rendu quoi">
            <table className="grid-table border-t border-line2">
              <thead>
                <tr>
                  <th scope="col" className="c pt-3">
                    Membre
                  </th>
                  <th scope="col" className="c w-[100px] pt-3">
                    Rendues
                  </th>
                  <th scope="col" className="c w-[100px] pt-3">
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
                          <Agent username={member.username} size={26} />
                          {member.first_name}
                        </span>
                      </th>
                      <td className="m text-[13px]">{two(mine.filter((i) => i.column === "done").length)}</td>
                      <td className="m text-[13px]">{two(mine.filter((i) => i.column === "doing").length)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Pane>
        </>
      )}
    </div>
  );
}

/** Les échéances du calendrier officiel : cinq nuits à passer. */
export function Deadlines() {
  const m = useModel();
  const [params, setParams] = useSearchParams();
  const detail = useRef<HTMLDivElement>(null);

  const all = [...m.snap.deadlines].sort((a, b) => a.week_of.localeCompare(b.week_of));
  const next = m.nextDeadline;
  const selected = m.deadline(params.get("e")) ?? next ?? all[all.length - 1];
  const left = all.filter((d) => !d.past).length;

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
    <div className="space-y-10 py-8 md:py-10">
      <PageHead title="Échéances" kicker="04 · LE CALENDRIER OFFICIEL">
        {two(left)} À VENIR
      </PageHead>

      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ol className="list-none self-start border-t border-line2 p-0">
          {all.map((d) => {
            const isNext = d.key === next?.key;
            const isSelected = d.key === selected?.key;
            return (
              <li key={d.key} className={`border-b border-line ${isSelected ? "brk bg-raised" : ""}`}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => select(d.key)}
                  className="grid w-full grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-4 border-0 bg-transparent px-3 py-5 text-left"
                >
                  <span className={`x text-[38px] ${d.past ? "text-faint" : isNext ? "text-alarm" : "text-fg"}`}>
                    {d.night !== null ? two(d.night) : "00"}
                  </span>
                  <span className="min-w-0">
                    <span className={`x block text-[19px] leading-[1] normal-case ${d.past ? "text-faint line-through" : ""}`}>
                      {d.title}
                    </span>
                    <span className="m mt-2 block text-faint">
                      SEMAINE DU {dayMonth(d.week_of).toUpperCase()}
                      {d.night === null && " · AVANT LA PREMIÈRE NUIT"}
                    </span>
                    <span className="mt-3 flex items-center gap-3">
                      {d.milestone ? (
                        d.milestone.total > 0 ? (
                          <>
                            <span className="w-44 max-w-full">
                              <Segments done={d.milestone.closed} doing={d.milestone.doing} total={d.milestone.total} />
                            </span>
                            <span className="m text-dim">
                              {d.milestone.closed}/{d.milestone.total}
                            </span>
                          </>
                        ) : (
                          <span className="m text-faint">JALON CRÉÉ, ENCORE VIDE</span>
                        )
                      ) : d.past ? null : (
                        <span className="m text-warn">JALON À CRÉER DANS GITLAB</span>
                      )}
                    </span>
                  </span>
                  <span className="pr-1 text-right">
                    {d.past ? (
                      <Tag color="var(--faint)">passée</Tag>
                    ) : (
                      <span className={`x text-[24px] whitespace-nowrap ${isNext ? "text-alarm" : "text-dim"}`}>
                        {countdown(d)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div ref={detail} className="scroll-mt-20">
          {selected && <Detail key={selected.key} deadline={selected} />}
        </div>
      </div>
    </div>
  );
}
