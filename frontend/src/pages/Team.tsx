import type { CSSProperties } from "react";
import { Link } from "react-router";
import { Agent, IssueLink, OutLink, PageHead, Pill, Tile } from "../components/bits";
import { ago, countdown, duration, plural } from "../lib/format";
import { useModel } from "../lib/model";

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="chiptile flex-1">
      <div className="big text-[26px] tracking-[-0.04em]" style={{ color: value > 0 ? color : undefined }}>
        {value}
      </div>
      <div className="mt-1 text-[12px] text-muted">{label}</div>
    </div>
  );
}

/** L'équipe : une tuile par membre, puis ce qui dort et ce qui attend quelqu'un. */
export function Team() {
  const m = useModel();
  const { snap, now } = m;

  const rows = snap.members.map((member) => {
    const mine = (usernames: string[]) => usernames.includes(member.username);
    return {
      member,
      doing: snap.issues.filter((i) => i.column === "doing" && mine(i.assignees)),
      reviews: snap.merge_requests.filter((mr) => mr.waiting_review && mine(mr.reviewers) && !mine(mr.approved_by)),
      authored: snap.merge_requests.filter((mr) => mr.author === member.username),
      done: snap.issues.filter((i) => m.isRecentlyDone(i) && mine(i.assignees)).length,
      lastSeen: snap.activity.find((a) => a.actor === member.username)?.at ?? null,
    };
  });

  const busy = rows.filter((r) => r.doing.length > 0).length;
  const asleep = snap.issues.filter((i) => i.stale_days !== null).sort((a, b) => (b.stale_days ?? 0) - (a.stale_days ?? 0));
  const free = snap.issues.filter((i) => i.column === "todo" && i.assignees.length === 0);

  return (
    <div className="space-y-5">
      <PageHead title="Équipe">
        <span>
          {busy} sur {rows.length} ont une tâche
          {rows.length - busy > 0 && <span className="text-amber"> · {rows.length - busy} sans tâche</span>}
        </span>
      </PageHead>

      <div className="bento">
        {rows.map(({ member, doing, reviews, authored, done, lastSeen }) => (
          <Tile key={member.username} className="col-span-12 flex flex-col md:col-span-6 xl:col-span-4">
            <div className="flex items-center gap-3">
              <Agent username={member.username} size={44} />
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold tracking-[-0.02em]">{member.first_name}</div>
                <div className="mono text-faint">{member.username}</div>
              </div>
              {doing.length > 0 ? <Pill color="var(--blue)">Sur une tâche</Pill> : <Pill color="var(--amber)">Sans tâche</Pill>}
            </div>

            <div className="mt-4 flex gap-2">
              <Stat value={doing.length} label="en cours" color="var(--blue)" />
              <Stat value={done} label={`rendues · ${snap.settings.done_window_days} j`} color="var(--green)" />
              <Stat value={reviews.length} label="à relire" color="var(--red)" />
            </div>

            <ul className="rows top mt-3 flex-1">
              {doing.map((issue) => (
                <li key={issue.iid}>
                  <div className="min-w-0">
                    <IssueLink issue={issue} />
                    {issue.stale_days !== null && <div className="mt-0.5 text-[12.5px] text-amber">{issue.stale_days} jours sans activité</div>}
                  </div>
                </li>
              ))}
              {doing.length === 0 && (
                <li className="text-muted">
                  Rien en cours
                  {free.length > 0 && (
                    <>
                      {"\u00a0·\u00a0"}
                      <Link to="/tableau" className="text-fg hover:text-lime">
                        {free.length} {plural(free.length, "tâche", "tâches")} à prendre
                      </Link>
                    </>
                  )}
                </li>
              )}
              {reviews.map((mr) => (
                <li key={`r${mr.iid}`}>
                  <span className="dot mt-1.5" style={{ "--c": mr.overdue ? "var(--red)" : "var(--muted)" } as CSSProperties} />
                  <div className="min-w-0">
                    <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                      relire la merge request de {m.first(mr.author)}
                    </OutLink>
                    <div className={`mt-0.5 text-[12.5px] ${mr.overdue ? "text-red" : "text-muted"}`}>attend depuis {duration(mr.waiting_hours ?? 0)}</div>
                  </div>
                </li>
              ))}
              {authored.map((mr) => (
                <li key={`a${mr.iid}`} className="text-[13px] text-muted">
                  <span className="ref">!{mr.iid}</span>
                  {mr.draft ? "brouillon" : mr.waiting_review ? "en relecture" : "approuvée"}
                </li>
              ))}
            </ul>

            <div className="mt-3 text-[12.5px] text-faint">{lastSeen ? `Dernière activité ${ago(lastSeen, now)}` : "Pas d'activité récente"}</div>
          </Tile>
        ))}

        <Tile title="Tâches qui dorment" meta={`${snap.settings.stale_days} j ou plus sans activité`} className="col-span-12 md:col-span-6 xl:col-span-4">
          <ul className="rows top">
            {asleep.length === 0 ? (
              <li className="text-muted">Tout ce qui est en cours bouge.</li>
            ) : (
              asleep.map((issue) => (
                <li key={issue.iid}>
                  <span className="big w-[52px] flex-none text-[22px] text-amber">{issue.stale_days} j</span>
                  <div className="min-w-0">
                    <IssueLink issue={issue} />
                    <div className="mt-0.5 text-[12.5px] text-muted">chez {issue.assignees.map(m.first).join(", ") || "personne"}</div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Tile>

        <Tile title="À prendre" meta={`${free.length} sans personne`} className="col-span-12 md:col-span-6 xl:col-span-8">
          <ul className="rows">
            {free.length === 0 ? (
              <li className="text-muted">Tout ce qui est décidé a quelqu'un.</li>
            ) : (
              free.slice(0, 6).map((issue) => {
                const deadline = m.deadline(issue.milestone?.deadline_key);
                return (
                  <li key={issue.iid}>
                    <span className="ellipsis flex-1">
                      <IssueLink issue={issue} />
                    </span>
                    {deadline && <span className="mono text-faint">{countdown(deadline)}</span>}
                  </li>
                );
              })
            )}
          </ul>
        </Tile>
      </div>
    </div>
  );
}
