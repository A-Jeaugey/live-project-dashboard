import { Link } from "react-router";
import { IssueLink, OutLink, PageTitle, Photo, Section } from "../components/bits";
import { ago, countdown, duration, plural } from "../lib/format";
import { useModel } from "../lib/model";

/** L'équipe, présentée comme une feuille d'appel : qui est « présent » au tableau, et sur quoi. */
export function Team() {
  const m = useModel();
  const { snap, now } = m;

  const rows = snap.members.map((member) => {
    const mine = (username: string[]) => username.includes(member.username);
    return {
      member,
      doing: snap.issues.filter((i) => i.column === "doing" && mine(i.assignees)),
      reviews: snap.merge_requests.filter(
        (mr) => mr.waiting_review && mine(mr.reviewers) && !mine(mr.approved_by),
      ),
      authored: snap.merge_requests.filter((mr) => mr.author === member.username),
      done: snap.issues.filter((i) => m.isRecentlyDone(i) && mine(i.assignees)).length,
      lastSeen: snap.activity.find((a) => a.actor === member.username)?.at ?? null,
    };
  });

  const present = rows.filter((r) => r.doing.length > 0).length;
  const asleep = snap.issues
    .filter((i) => i.stale_days !== null)
    .sort((a, b) => (b.stale_days ?? 0) - (a.stale_days ?? 0));
  const free = snap.issues.filter((i) => i.column === "todo" && i.assignees.length === 0);

  return (
    <div className="space-y-10 px-5 py-7 md:px-10 md:py-10">
      <PageTitle title="Feuille d'appel">
        {present} {plural(present, "présent", "présents")} sur {rows.length}
      </PageTitle>

      <ul className="m-0 list-none space-y-4 p-0 md:hidden">
        {rows.map(({ member, doing, reviews, done, lastSeen }) => (
          <li key={member.username} className="border-[1.5px] border-ink p-4">
            <div className="flex items-center gap-3">
              <Photo username={member.username} size={44} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="font-semibold">{member.first_name}</div>
                <div className="mono text-[11.5px] text-faint">
                  {lastSeen ? `vu ${ago(lastSeen, now)}` : "pas d'activité récente"} · {done} rendu
                </div>
              </div>
              {doing.length > 0 ? (
                <span className="ticks" aria-label="présent">
                  <span className="tick" data-state="done" style={{ width: 20, height: 20 }} />
                </span>
              ) : (
                <span className="hand hand-pen tilt text-[1.4rem]">absent</span>
              )}
            </div>
            <ul className="m-0 mt-3 list-none space-y-2 border-t border-rule p-0 pt-3">
              {doing.map((issue) => (
                <li key={issue.iid}>
                  <IssueLink issue={issue} />
                  {issue.stale_days !== null && (
                    <span className="hand hand-pen block text-[1.2rem]">{issue.stale_days} j. sans nouvelles</span>
                  )}
                </li>
              ))}
              {doing.length === 0 && <li className="text-soft">rien en cours</li>}
              {reviews.map((mr) => (
                <li key={mr.iid} className="text-[14px]">
                  <span className={mr.overdue ? "text-pen" : "text-soft"}>à relire · {duration(mr.waiting_hours ?? 0)} · </span>
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
        <table className="form-table">
          <thead>
            <tr>
              <th scope="col" className="label w-[190px]">
                Élève
              </th>
              <th scope="col" className="label w-[112px]">
                Présent
              </th>
              <th scope="col" className="label">
                En cours
              </th>
              <th scope="col" className="label w-[230px]">
                À relire
              </th>
              <th scope="col" className="label w-[124px] whitespace-nowrap">
                Rendu · {snap.settings.done_window_days} j
              </th>
              <th scope="col" className="label w-[124px]">
                Vu
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, doing, reviews, authored, done, lastSeen }) => (
              <tr key={member.username}>
                <th scope="row" className="font-normal">
                  <span className="flex items-center gap-3">
                    <Photo username={member.username} size={40} />
                    <span className="leading-tight">
                      <span className="block font-semibold">{member.first_name}</span>
                      <span className="mono text-[11.5px] text-faint">{member.username}</span>
                    </span>
                  </span>
                </th>
                <td>
                  {doing.length > 0 ? (
                    <span className="ticks" aria-label="présent">
                      <span className="tick" data-state="done" style={{ width: 20, height: 20 }} />
                    </span>
                  ) : (
                    <span className="hand hand-pen tilt text-[1.4rem]">absent</span>
                  )}
                </td>
                <td>
                  {doing.length > 0 ? (
                    <ul className="m-0 list-none space-y-1.5 p-0">
                      {doing.map((issue) => (
                        <li key={issue.iid}>
                          <IssueLink issue={issue} />
                          {issue.stale_days !== null && (
                            <span className="hand hand-pen ml-3 text-[1.2rem]">{issue.stale_days} j. sans nouvelles</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-soft">
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
                    <div className="mt-1.5 text-[13px] text-soft">
                      {authored.map((mr) => (
                        <span key={mr.iid} className="mr-3">
                          <span className="mono">!{mr.iid}</span>{" "}
                          {mr.draft ? "en brouillon" : mr.waiting_review ? "en relecture" : "approuvée"}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {reviews.length > 0 ? (
                    <ul className="m-0 list-none space-y-1.5 p-0 text-[14px]">
                      {reviews.map((mr) => (
                        <li key={mr.iid}>
                          <OutLink href={mr.web_url} refText={`!${mr.iid}`} className="font-normal">
                            de {m.first(mr.author)}
                          </OutLink>
                          <span className={`ml-2 ${mr.overdue ? "hand hand-pen text-[1.2rem]" : "mono text-faint"}`}>
                            {duration(mr.waiting_hours ?? 0)}
                            {mr.overdue && " !"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="mono">{done}</td>
                <td className="mono text-[12.5px] text-soft">{lastSeen ? ago(lastSeen, now) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-2">
        <Section numeral="I" title="Tâches qui dorment" aside={`sans activité depuis ${snap.settings.stale_days} jours ou plus`}>
          <ul className="ruled">
            {asleep.length === 0 ? (
              <li>
                <span className="gutter" />
                <span className="body text-soft">Aucune. Tout ce qui est en cours bouge.</span>
              </li>
            ) : (
              asleep.map((issue) => (
                <li key={issue.iid}>
                  <span className="gutter">
                    <span className="hand hand-pen tilt">{issue.stale_days} j</span>
                  </span>
                  <div className="body">
                    <div className="min-w-0 flex-1">
                      <IssueLink issue={issue} />
                      <div className="text-[13px] text-soft">
                        chez {issue.assignees.map(m.first).join(", ") || "personne"}
                      </div>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Section>

        <Section numeral="II" title="À prendre" aside={`${free.length} sans personne`}>
          <ul className="ruled">
            {free.length === 0 ? (
              <li>
                <span className="gutter" />
                <span className="body text-soft">Rien à prendre : tout ce qui est décidé a quelqu'un.</span>
              </li>
            ) : (
              free.slice(0, 6).map((issue) => {
                const deadline = m.deadline(issue.milestone?.deadline_key);
                return (
                  <li key={issue.iid}>
                    <span className="gutter">
                      {deadline && <span className="mono text-[12px] text-faint">{countdown(deadline)}</span>}
                    </span>
                    <div className="body">
                      <IssueLink issue={issue} />
                    </div>
                  </li>
                );
              })
            )}
          </ul>
          {free.length > 6 && (
            <p className="mt-3 text-right">
              <Link to="/tableau">les {free.length} au tableau</Link>
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
