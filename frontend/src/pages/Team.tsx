import { Link } from "react-router";
import { Agent, IssueLink, OutLink, PageHead, Pane } from "../components/bits";
import { ago, countdown, duration, plural } from "../lib/format";
import { useModel } from "../lib/model";
import { roomOf } from "../lib/rooms";

/** L'équipe : qui est en poste, dans quelle salle, sur quoi. */
export function Team() {
  const m = useModel();
  const { snap, now } = m;
  const domains = snap.domains.map((d) => d.name);

  const rows = snap.members.map((member) => {
    const mine = (usernames: string[]) => usernames.includes(member.username);
    const doing = snap.issues.filter((i) => i.column === "doing" && mine(i.assignees));
    const where = doing[0]?.domains.find((d) => domains.includes(d));
    return {
      member,
      doing,
      room: doing.length === 0 ? null : where ? roomOf(where) : "Sans salle",
      reviews: snap.merge_requests.filter((mr) => mr.waiting_review && mine(mr.reviewers) && !mine(mr.approved_by)),
      authored: snap.merge_requests.filter((mr) => mr.author === member.username),
      done: snap.issues.filter((i) => m.isRecentlyDone(i) && mine(i.assignees)).length,
      lastSeen: snap.activity.find((a) => a.actor === member.username)?.at ?? null,
    };
  });

  const posted = rows.filter((r) => r.doing.length > 0).length;
  const loose = rows.length - posted;
  const asleep = snap.issues
    .filter((i) => i.stale_days !== null)
    .sort((a, b) => (b.stale_days ?? 0) - (a.stale_days ?? 0));
  const free = snap.issues.filter((i) => i.column === "todo" && i.assignees.length === 0);

  return (
    <div className="space-y-10 py-8 md:py-10">
      <PageHead title="Équipe" kicker="03 · QUI EST OÙ, ET SUR QUOI">
        {String(posted).padStart(2, "0")} EN POSTE
        {loose > 0 && (
          <>
            {" · "}
            <span className="text-warn">{String(loose).padStart(2, "0")} DANS LE COULOIR</span>
          </>
        )}
      </PageHead>

      {/* Téléphone : une fiche par membre. */}
      <ul className="list-none space-y-3 p-0 md:hidden">
        {rows.map(({ member, doing, room, reviews, done, lastSeen }) => (
          <li key={member.username} className="border border-line2 p-4">
            <div className="flex items-center gap-3">
              <Agent username={member.username} size={40} />
              <div className="min-w-0 flex-1">
                <div className="x text-[17px] normal-case">{member.first_name}</div>
                <div className={`c mt-1 text-[12px] ${room ? "text-go" : "text-warn"}`}>{room ?? "Dans le couloir"}</div>
              </div>
              <div className="m text-right text-faint">
                {done} rendu
                <br />
                {lastSeen ? ago(lastSeen, now) : "—"}
              </div>
            </div>
            <ul className="mt-3 list-none space-y-2 border-t border-line p-0 pt-3">
              {doing.map((issue) => (
                <li key={issue.iid}>
                  <IssueLink issue={issue} />
                  {issue.stale_days !== null && <span className="m block text-warn">{issue.stale_days} j sans nouvelles</span>}
                </li>
              ))}
              {doing.length === 0 && <li className="text-dim">rien en cours</li>}
              {reviews.map((mr) => (
                <li key={mr.iid}>
                  <span className={`m ${mr.overdue ? "text-alarm" : "text-faint"}`}>
                    À RELIRE · {duration(mr.waiting_hours ?? 0)} ·{" "}
                  </span>
                  <OutLink href={mr.web_url} refText={`!${mr.iid}`} className="font-normal">
                    de {m.first(mr.author)}
                  </OutLink>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <table className="grid-table">
          <thead>
            <tr>
              <th scope="col" className="c w-[210px]">
                Membre
              </th>
              <th scope="col" className="c w-[170px]">
                Salle
              </th>
              <th scope="col" className="c">
                En cours
              </th>
              <th scope="col" className="c w-[210px]">
                À relire
              </th>
              <th scope="col" className="c w-[110px] whitespace-nowrap">
                Rendu · {snap.settings.done_window_days} j
              </th>
              <th scope="col" className="c w-[110px]">
                Vu
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, doing, room, reviews, authored, done, lastSeen }) => (
              <tr key={member.username}>
                <th scope="row" className="font-normal">
                  <span className="flex items-center gap-3">
                    <Agent username={member.username} size={36} />
                    <span>
                      <span className="x block text-[16px] normal-case">{member.first_name}</span>
                      <span className="m mt-1 block text-faint">{member.username}</span>
                    </span>
                  </span>
                </th>
                <td>
                  <span className={`c ${room ? "text-go" : "text-warn"}`}>{room ?? "Dans le couloir"}</span>
                </td>
                <td>
                  {doing.length > 0 ? (
                    <ul className="list-none space-y-1.5 p-0">
                      {doing.map((issue) => (
                        <li key={issue.iid}>
                          <IssueLink issue={issue} />
                          {issue.stale_days !== null && (
                            <span className="m ml-3 text-warn">{issue.stale_days} J SANS NOUVELLES</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-dim">
                      rien en cours
                      {free.length > 0 && (
                        <>
                          {" · "}
                          <Link to="/tableau">
                            {free.length} {plural(free.length, "tâche", "tâches")} à prendre
                          </Link>
                        </>
                      )}
                    </span>
                  )}
                  {authored.length > 0 && (
                    <div className="m mt-2 text-faint">
                      {authored.map((mr) => (
                        <span key={mr.iid} className="mr-4">
                          !{mr.iid} {mr.draft ? "brouillon" : mr.waiting_review ? "en relecture" : "approuvée"}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {reviews.length > 0 ? (
                    <ul className="list-none space-y-1.5 p-0">
                      {reviews.map((mr) => (
                        <li key={mr.iid}>
                          <OutLink href={mr.web_url} refText={`!${mr.iid}`} className="font-normal">
                            de {m.first(mr.author)}
                          </OutLink>
                          <span className={`m ml-2 ${mr.overdue ? "text-alarm" : "text-faint"}`}>
                            {duration(mr.waiting_hours ?? 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="m text-[13px] text-fg">{String(done).padStart(2, "0")}</td>
                <td className="m text-dim">{lastSeen ? ago(lastSeen, now) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <Pane n="01" title="Tâches qui dorment" meta={`sans activité depuis ${snap.settings.stale_days} j ou plus`}>
          {asleep.length > 0 && <div className="hazard" aria-hidden="true" />}
          <ul className="rows">
            {asleep.length === 0 ? (
              <li>
                <span className="k m text-go">RAS</span>
                <span className="text-dim">Tout ce qui est en cours bouge.</span>
              </li>
            ) : (
              asleep.map((issue) => (
                <li key={issue.iid}>
                  <span className="k x text-[19px] leading-none text-warn">{issue.stale_days} j</span>
                  <div className="min-w-0">
                    <IssueLink issue={issue} />
                    <div className="m mt-1 text-faint">chez {issue.assignees.map(m.first).join(", ") || "personne"}</div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Pane>

        <Pane n="02" title="À prendre" meta={`${String(free.length).padStart(2, "0")} sans personne`}>
          <ul className="rows">
            {free.length === 0 ? (
              <li>
                <span className="k m text-faint">—</span>
                <span className="text-dim">Tout ce qui est décidé a quelqu'un.</span>
              </li>
            ) : (
              free.slice(0, 6).map((issue) => {
                const deadline = m.deadline(issue.milestone?.deadline_key);
                return (
                  <li key={issue.iid}>
                    <span className="k m text-faint">{deadline ? countdown(deadline) : "—"}</span>
                    <IssueLink issue={issue} />
                  </li>
                );
              })
            )}
          </ul>
          {free.length > 6 && (
            <p className="mt-3 text-right">
              <Link to="/tableau" className="c text-[12px]">
                Les {free.length} au tableau →
              </Link>
            </p>
          )}
        </Pane>
      </div>
    </div>
  );
}
