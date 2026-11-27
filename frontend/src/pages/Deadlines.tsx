import { useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router";
import { ColumnGlyph } from "../components/cards";
import { Agent, Bar, Domain, IssueLink, MiniRing, PageHead, Pill, Rings, Tile } from "../components/bits";
import { countdown, dayMonth, longDate, plural } from "../lib/format";
import { useModel, type Model } from "../lib/model";
import { elapsedBefore, verdict } from "../lib/progress";
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
    for (const { name, all } of domains) lines.push(`- ${name} : ${all.filter((i) => i.column === "done").length} sur ${all.length}`);
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
      return { name: d.name, total: all.length, done: all.filter((i) => i.column === "done").length, doing: all.filter((i) => i.column === "doing").length };
    })
    .filter((d) => d.total > 0);
  const ms = deadline.milestone;
  const time = elapsedBefore(deadline, snap.deadlines);
  const done = ms && ms.total > 0 ? ms.closed / ms.total : null;
  const v = verdict(time.share, done, ms !== null);

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
    <div className="bento">
      <Tile hero className="col-span-12">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-6">
          {!deadline.past && (
            <Rings
              time={time.share}
              done={done ?? 0}
              doing={ms && ms.total > 0 ? ms.doing / ms.total : 0}
              size={140}
              label={`${Math.round(time.share * 100)} % du temps écoulé`}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-muted">
              {deadline.night !== null && `Nuit ${deadline.night} · `}semaine du {longDate(deadline.week_of).replace(/^\S+ /, "")}
            </div>
            <h2 className="title mt-1.5 text-[28px]">{deadline.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {deadline.past ? <Pill>Passée</Pill> : <Pill color={v.color}>{v.text}</Pill>}
              {ms && ms.total > 0 && (
                <span className="text-[13px] text-muted">
                  {ms.closed} rendues · {ms.doing} en cours · {ms.todo} à faire
                </span>
              )}
            </div>
            {ms && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => void copy()}>
                  {copied ? "Copié ✓" : "Copier le bilan"}
                </button>
                <a href={ms.web_url} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  Jalon dans GitLab ↗
                </a>
              </div>
            )}
          </div>
          {!deadline.past && <div className="big hidden text-[64px] sm:block">{countdown(deadline)}</div>}
        </div>
        {!ms && (
          <p className="mt-5 text-muted">
            {deadline.past ? "Échéance passée, sans jalon dans GitLab." : "Aucun jalon GitLab ne correspond encore à cette échéance : les tâches ne peuvent pas y être rattachées."}
          </p>
        )}
      </Tile>

      {!ms && !deadline.past && <SetupNote />}

      {ms && (
        <>
          <Tile title="Ce qu'il reste" meta={`${remaining.length} ${plural(remaining.length, "tâche", "tâches")}`} className="col-span-12 lg:col-span-7">
            <ul className="rows">
              {remaining.length === 0 ? (
                <li className="text-muted">{ms.total === 0 ? "Rien n'est encore rattaché à ce jalon." : "Plus rien. Tout est rendu."}</li>
              ) : (
                remaining.map((issue) => (
                  <li key={issue.iid}>
                    <ColumnGlyph column={issue.column} />
                    <span className="ellipsis flex-1">
                      <IssueLink issue={issue} />
                    </span>
                    {issue.stale_days !== null && <Pill color="var(--amber)">{issue.stale_days} j</Pill>}
                    <span className="flex -space-x-1.5">
                      {issue.assignees.map((username) => (
                        <Agent key={username} username={username} size={24} />
                      ))}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </Tile>

          <Tile title="Par domaine" className="col-span-12 md:col-span-6 lg:col-span-5">
            {byDomain.length === 0 ? (
              <p className="text-muted">Aucune tâche classée par domaine.</p>
            ) : (
              <ul className="rows">
                {byDomain.map((d) => (
                  <li key={d.name}>
                    <span className="w-[96px] flex-none">
                      <Domain name={d.name} />
                    </span>
                    <span className="flex-1">
                      <Bar done={d.done} doing={d.doing} total={d.total} color={m.domainColor(d.name)} />
                    </span>
                    <span className={`mono w-10 text-right ${d.done === 0 ? "text-amber" : "text-muted"}`}>
                      {d.done}/{d.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tile>

          <Tile title="Qui a rendu quoi" className="col-span-12">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {snap.members.map((member) => {
                const mine = issues.filter((i) => i.assignees.includes(member.username));
                const mineDone = mine.filter((i) => i.column === "done").length;
                const mineDoing = mine.filter((i) => i.column === "doing").length;
                return (
                  <div key={member.username} className="chiptile flex items-center gap-3">
                    <Agent username={member.username} size={34} />
                    <div className="min-w-0">
                      <div className="font-semibold">{member.first_name}</div>
                      <div className="text-[12.5px] leading-snug text-muted">
                        <span className="text-fg">{mineDone}</span> rendue{mineDone > 1 ? "s" : ""}
                        <br />
                        {mineDoing} en cours
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Tile>
        </>
      )}
    </div>
  );
}

/** Les échéances du calendrier officiel. */
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
    <div className="space-y-5">
      <PageHead title="Échéances">
        <span>
          {left} {plural(left, "échéance à venir", "échéances à venir")}
        </span>
      </PageHead>

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="grid gap-2">
          {all.map((d) => {
            const isSelected = d.key === selected?.key;
            const isNext = d.key === next?.key;
            return (
              <button
                key={d.key}
                type="button"
                aria-pressed={isSelected}
                onClick={() => select(d.key)}
                className={`tile flex items-center gap-4 border-0 px-4 py-3.5 text-left transition-colors ${
                  isSelected ? "bg-tile3" : "hover:bg-tile2"
                } ${d.past ? "opacity-60" : ""}`}
              >
                <div className="w-[74px] flex-none">
                  <div className={`big text-[24px] tracking-[-0.04em] ${isNext ? "text-lime" : ""}`}>{d.past ? "✓" : countdown(d)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="ellipsis font-semibold">{d.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-muted">semaine du {dayMonth(d.week_of)}</div>
                </div>
                {d.milestone && d.milestone.total > 0 ? (
                  <span className="flex items-center gap-2">
                    <span className="mono text-[11.5px] text-muted">
                      {d.milestone.closed}/{d.milestone.total}
                    </span>
                    <MiniRing done={d.milestone.closed} total={d.milestone.total} size={26} />
                  </span>
                ) : !d.past && !d.milestone ? (
                  <span className="dot" title="Jalon à créer dans GitLab" style={{ "--c": "var(--amber)" } as CSSProperties} />
                ) : null}
              </button>
            );
          })}
        </div>

        <div ref={detail} className="scroll-mt-4">
          {selected && <Detail key={selected.key} deadline={selected} />}
        </div>
      </div>
    </div>
  );
}
