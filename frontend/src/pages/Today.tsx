import { Link } from "react-router";
import { Agent, Domain, IssueLink, OutLink, Pane, Segments, Tag } from "../components/bits";
import { ago, countdown, dayMonth, duration, list, plural, stamp } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import type { Activity, Attention, Deadline, Snapshot } from "../lib/types";
import { previousVisit } from "../lib/visit";
import { activityVerb, alertKey, briefing, EMPTY, FLAG_TEXT } from "../lib/voice";

/** Le compte à rebours, en très gros : c'est la première chose qu'on doit lire. */
function Countdown({ next }: { next: Deadline | undefined }) {
  const m = useModel();

  if (!next) {
    return (
      <div>
        <div className="m text-go">CALENDRIER</div>
        <h1 className="x mt-4 text-[clamp(40px,5vw,64px)]">Plus aucune échéance</h1>
        <p className="mt-4 text-dim">Toutes les dates du calendrier sont passées.</p>
      </div>
    );
  }

  const label = countdown(next);

  return (
    <div>
      <div className="m text-go">
        {next.night !== null && `NUIT ${String(next.night).padStart(2, "0")}/${String(m.nights.length).padStart(2, "0")} · `}
        SEMAINE DU {dayMonth(next.week_of).toUpperCase()}
      </div>
      <div
        className={`x mt-3 whitespace-nowrap text-fg ${label.length > 6 ? "text-[clamp(34px,4.2vw,58px)]" : "text-[clamp(92px,9.4vw,136px)]"}`}
      >
        {label}
      </div>
      <h1 className="x mt-5 text-[clamp(20px,1.9vw,27px)] leading-[0.95] text-fg normal-case">{next.title}</h1>

      <p className="mt-6 max-w-[46ch] text-[15.5px] leading-snug text-dim">{briefing(m)}</p>
      <p className="mt-4">
        <Link to={`/echeances?e=${next.key}`} className="c text-[12px]">
          Voir ce qu'il reste →
        </Link>
      </p>
    </div>
  );
}

/** Part du temps déjà écoulée entre l'échéance précédente et celle-ci, et les jours correspondants. */
function elapsedBefore(next: Deadline, deadlines: Snapshot["deadlines"]) {
  const previous = deadlines
    .filter((d) => d.target_date < next.target_date)
    .sort((a, b) => b.target_date.localeCompare(a.target_date))[0];
  // Sans échéance précédente, on mesure sur trente jours (ou plus s'il en reste davantage).
  const span = Math.max(1, previous ? next.days_left - previous.days_left : Math.max(next.days_left, 30));
  const days = Math.min(span, Math.max(0, span - next.days_left));
  return { days, span, share: days / span };
}

/**
 * La seule question qui compte avant une échéance : avance-t-on aussi vite que le temps passe ?
 * Deux barres de même longueur, l'une sous l'autre, et un verdict.
 */
function Race({ next }: { next: Deadline }) {
  const { snap } = useModel();
  const time = elapsedBefore(next, snap.deadlines);
  const ms = next.milestone;
  const done = ms && ms.total > 0 ? ms.closed / ms.total : null;
  const gap = done === null ? 0 : Math.round((time.share - done) * 100);

  const verdict =
    done === null
      ? { text: ms ? "Aucune tâche dans ce jalon" : "Pas de jalon dans GitLab", color: "var(--warn)" }
      : gap > 25
        ? { text: "En retard", color: "var(--alarm)" }
        : gap > 8
          ? { text: "Un peu en retard", color: "var(--warn)" }
          : gap < -8
            ? { text: "En avance", color: "var(--go)" }
            : { text: "Dans les temps", color: "var(--go)" };

  return (
    <section className="brk border border-line2 p-5 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="c text-fg">Temps contre tâches</h2>
        <span className="x text-[clamp(18px,2vw,26px)] normal-case" style={{ color: verdict.color }}>
          {verdict.text}
        </span>
      </header>

      <div className="mt-5 grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[64px_minmax(0,1fr)_190px]">
        <span className="c text-dim">Temps</span>
        <span
          className="track"
          role="img"
          aria-label={`${Math.round(time.share * 100)} % du temps écoulé`}
          style={{ "--fill": `${time.share * 100}%` } as React.CSSProperties}
        />
        <span className="m col-start-2 text-dim sm:col-start-3 sm:text-right">
          <span className="text-fg">{Math.round(time.share * 100)} %</span> · {time.days} j sur {time.span}
        </span>

        <span className="c text-dim">Tâches</span>
        {ms && ms.total > 0 ? (
          <span className="race-segs">
            <Segments done={ms.closed} doing={ms.doing} total={ms.total} />
          </span>
        ) : (
          <span className="track" style={{ "--fill": "0%" } as React.CSSProperties} />
        )}
        <span className="m col-start-2 text-dim sm:col-start-3 sm:text-right">
          {ms && ms.total > 0 ? (
            <>
              <span className="text-fg">{Math.round((done ?? 0) * 100)} %</span> · {ms.closed} sur {ms.total}
            </>
          ) : (
            "rien à mesurer"
          )}
        </span>
      </div>
    </section>
  );
}

/** Qui fait quoi, en cinq lignes. */
function Roster() {
  const m = useModel();
  const { fresh } = useLive();
  const { snap } = m;
  const free = snap.issues.filter((i) => i.column === "todo" && i.assignees.length === 0).length;
  const idle = snap.members.filter(
    (mb) => !snap.issues.some((i) => i.column === "doing" && i.assignees.includes(mb.username)),
  ).length;

  return (
    <Pane
      title="Qui fait quoi"
      meta={idle > 0 ? <span className="text-warn">{String(idle).padStart(2, "0")} sans tâche</span> : "tout le monde est occupé"}
    >
      <ul className="rows" style={{ "--gutter": "150px" } as React.CSSProperties}>
        {snap.members.map((member) => {
          const doing = snap.issues.filter((i) => i.column === "doing" && i.assignees.includes(member.username));
          return (
            <li key={member.username} className={`items-center ${doing.some((i) => fresh.has(i.iid)) ? "fresh" : ""}`}>
              <span className="k flex items-center gap-3">
                <Agent username={member.username} size={30} />
                <span className="x text-[15px] normal-case">{member.first_name}</span>
              </span>
              <div className="min-w-0">
                {doing.length === 0 ? (
                  <span className="text-warn">
                    rien en cours
                    {free > 0 && (
                      <>
                        {" · "}
                        <Link to="/tableau">
                          {free} {plural(free, "tâche", "tâches")} à prendre
                        </Link>
                      </>
                    )}
                  </span>
                ) : (
                  doing.map((issue) => {
                    const late = issue.merge_requests.flatMap((iid) => m.mr(iid) ?? []).find((mr) => mr.overdue);
                    return (
                      <div key={issue.iid} className="flex flex-wrap items-baseline gap-x-4">
                        <IssueLink issue={issue} />
                        {issue.stale_days !== null && (
                          <span className="m text-warn">{issue.stale_days} J SANS NOUVELLES</span>
                        )}
                        {late && (
                          <span className="m text-alarm">
                            !{late.iid} ATTEND UNE RELECTURE · {duration(late.waiting_hours ?? 0).toUpperCase()}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Pane>
  );
}

/** Ce qui dépend de la personne connectée. */
function Mine() {
  const m = useModel();
  const { fresh } = useLive();
  const { snap, me } = m;

  const doing = snap.issues.filter((i) => i.column === "doing" && i.assignees.includes(me.username));
  const toReview = snap.merge_requests.filter(
    (mr) => mr.waiting_review && mr.reviewers.includes(me.username) && !mr.approved_by.includes(me.username),
  );
  const waitingOnOthers = snap.merge_requests.filter((mr) => mr.waiting_review && mr.author === me.username);
  const free = snap.issues.filter((i) => i.column === "todo" && i.assignees.length === 0).length;
  const count = doing.length + toReview.length + waitingOnOthers.length;

  return (
    <Pane n="01" title="À toi" meta={String(count).padStart(2, "0")}>
      <ul className="rows" style={{ "--gutter": "86px" } as React.CSSProperties}>
        {count === 0 && (
          <li>
            <span className="k m text-faint">—</span>
            <span className="text-dim">
              {EMPTY.mine}{" "}
              {free > 0 && (
                <Link to="/tableau">
                  {free} {plural(free, "tâche attend", "tâches attendent")} quelqu'un.
                </Link>
              )}
            </span>
          </li>
        )}
        {doing.map((issue) => {
          const deadline = m.deadline(issue.milestone?.deadline_key);
          return (
            <li key={`i${issue.iid}`} className={fresh.has(issue.iid) ? "fresh" : ""}>
              <span className="k">
                <Tag color="var(--go)">en cours</Tag>
              </span>
              <div className="min-w-0">
                <IssueLink issue={issue} />
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {issue.domains.map((d) => (
                    <Domain key={d} name={d} />
                  ))}
                  {deadline && <span className="m text-faint">{countdown(deadline)}</span>}
                  {issue.stale_days !== null && <span className="m text-warn">{issue.stale_days} j sans nouvelles</span>}
                </div>
              </div>
            </li>
          );
        })}
        {toReview.map((mr) => (
          <li key={`r${mr.iid}`}>
            <span className="k">
              <Tag color="var(--alarm)">à relire</Tag>
            </span>
            <div className="min-w-0">
              <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                {mr.title}
              </OutLink>
              <div className="m mt-1 text-faint">
                {m.first(mr.author)} attend depuis {duration(mr.waiting_hours ?? 0)}
              </div>
            </div>
          </li>
        ))}
        {waitingOnOthers.map((mr) => (
          <li key={`w${mr.iid}`}>
            <span className="k">
              <Tag color={mr.overdue ? "var(--warn)" : "var(--dim)"}>en attente</Tag>
            </span>
            <div className="min-w-0">
              <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                {mr.title}
              </OutLink>
              <div className="m mt-1 text-faint">
                {mr.reviewers.length > 0 ? `relecture : ${list(mr.reviewers.map(m.first))}` : "aucun relecteur désigné"} ·{" "}
                {duration(mr.waiting_hours ?? 0)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Pane>
  );
}

function AlertRow({ item }: { item: Attention }) {
  const m = useModel();
  const urgent = item.kind === "mr_waiting" || item.kind === "pipeline_failed";
  const key = (
    <span className={`k x text-[19px] leading-none ${urgent ? "text-alarm" : "text-warn"}`}>{alertKey(item)}</span>
  );

  switch (item.kind) {
    case "mr_waiting": {
      const mr = m.mr(item.mr);
      return (
        <li>
          {key}
          <div className="min-w-0">
            <OutLink href={mr?.web_url} refText={`!${item.mr}`}>
              {mr?.title ?? "Merge request"}
            </OutLink>
            <div className="m mt-1 text-faint">
              {item.reviewers.length > 0
                ? `relecture attendue de ${list(item.reviewers.map(m.first))}`
                : "aucun relecteur désigné"}{" "}
              · par {m.first(item.author)}
            </div>
          </div>
        </li>
      );
    }
    case "issue_stale":
    case "needs_triage":
    case "inconsistent": {
      const issue = m.issue(item.issue);
      if (!issue) return null;
      const why =
        item.kind === "issue_stale"
          ? `en cours chez ${list(item.assignees.map(m.first)) || "personne"}, sans nouvelles`
          : item.kind === "needs_triage"
            ? FLAG_TEXT.needs_triage
            : FLAG_TEXT[item.flag];
      return (
        <li>
          {key}
          <div className="min-w-0">
            <IssueLink issue={issue} />
            <div className="m mt-1 text-faint">{why}</div>
          </div>
        </li>
      );
    }
    case "member_idle":
      return (
        <li>
          {key}
          <div className="flex min-w-0 items-start gap-3">
            <Agent username={item.member} size={26} />
            <div className="min-w-0">
              <span className="font-medium">{m.first(item.member)} n'a rien en cours</span>
              <div className="m mt-1 text-faint">
                {item.available_todo > 0 ? (
                  <Link to="/tableau">
                    {item.available_todo} {plural(item.available_todo, "tâche attend", "tâches attendent")} quelqu'un
                  </Link>
                ) : (
                  "et il n'y a rien à prendre"
                )}
              </div>
            </div>
          </div>
        </li>
      );
    case "pipeline_failed":
      return (
        <li>
          {key}
          <OutLink href={item.web_url}>
            Le pipeline de <span className="m">{item.ref}</span> a échoué
          </OutLink>
        </li>
      );
  }
}

/** Une ligne du journal. */
export function ActivityRow({ item }: { item: Activity }) {
  const m = useModel();
  const target = item.target;
  const issue = target?.type === "issue" && target.iid !== null ? m.issue(target.iid) : undefined;
  const sigil = target?.type === "merge_request" ? "!" : "#";

  return (
    <li>
      <span className="k m text-faint">{stamp(item.at, m.now)}</span>
      <div className="min-w-0">
        <span className="text-dim">
          <strong className="font-semibold text-fg">{m.who(item)}</strong> {activityVerb(item)}{" "}
        </span>
        {issue ? (
          <IssueLink issue={issue} className="font-normal" />
        ) : target?.title ? (
          <OutLink
            href={target.web_url}
            refText={target.iid !== null ? `${sigil}${target.iid}` : undefined}
            className="font-normal"
          >
            {target.type === "branch" ? <span className="m">{target.title}</span> : target.title}
          </OutLink>
        ) : null}
      </div>
    </li>
  );
}

export function PlayableCard() {
  const { snap, now } = useModel();
  const p = snap.playable;
  if (p.source === "none") return <p className="text-dim">Le dépôt est encore vide.</p>;

  const why =
    p.fallback_reason === "no_pipeline"
      ? "Pas de CI : le dernier commit fait foi."
      : p.fallback_reason === "no_successful_pipeline"
        ? "Aucun pipeline réussi : dernier commit affiché."
        : p.fallback_reason === "no_tag"
          ? "Aucun tag de version : dernier commit affiché."
          : null;

  return (
    <div className="border-t border-line2 pt-3">
      <OutLink href={p.web_url} refText={p.tag ?? p.short_sha ?? undefined}>
        {p.title}
      </OutLink>
      <div className="m mt-1 text-faint">
        {p.author_name}
        {p.committed_at && ` · ${ago(p.committed_at, now)}`}
        {p.source === "pipeline" && " · pipeline réussi"}
      </div>
      {why && <div className="m mt-2 text-warn">{why}</div>}
    </div>
  );
}

export function SetupNote() {
  const { snap } = useModel();
  const { missing_labels, missing_milestones } = snap.setup;
  if (missing_labels.length + missing_milestones.length === 0) return null;
  return (
    <div className="brk border border-line2 p-5" style={{ "--bc": "var(--warn)" } as React.CSSProperties}>
      <div className="c mb-3 text-warn">Mise en place</div>
      {missing_labels.length > 0 && (
        <p>
          {missing_labels.length} {plural(missing_labels.length, "label manque", "labels manquent")} dans GitLab :{" "}
          <span className="m text-dim">{missing_labels.join(" · ")}</span>
        </p>
      )}
      {missing_milestones.length > 0 && (
        <p className={missing_labels.length > 0 ? "mt-2" : ""}>
          {missing_milestones.length} {plural(missing_milestones.length, "jalon", "jalons")} à créer :{" "}
          <span className="text-dim">{missing_milestones.join(" · ")}</span>
        </p>
      )}
      <p className="m mt-3 text-faint">L'outil proposera de les créer en phase 2.</p>
    </div>
  );
}

export function Today() {
  const m = useModel();
  const { snap, now } = m;
  const next = m.nextDeadline;

  const alerts = snap.issues.length === 0 ? snap.attention.filter((a) => a.kind !== "member_idle") : snap.attention;
  const since = previousVisit();
  const news = (since === null ? snap.activity : snap.activity.filter((a) => Date.parse(a.at) > since)).slice(0, 7);

  return (
    <div className="space-y-12 py-8 md:py-10">
      <section className="grid items-start gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,350px)_minmax(0,1fr)]">
        <Countdown next={next} />
        <div className="min-w-0 space-y-9">
          {next && <Race next={next} />}
          <Roster />
        </div>
      </section>

      {snap.issues.length === 0 && <SetupNote />}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-3">
        <Mine />

        <Pane
          n="02"
          title="Alertes"
          meta={
            alerts.length > 0 ? (
              <span className="text-warn">{String(alerts.length).padStart(2, "0")}</span>
            ) : (
              "00"
            )
          }
        >
          {alerts.length > 0 && <div className="hazard" aria-hidden="true" />}
          <ul className="rows">
            {alerts.length === 0 ? (
              <li>
                <span className="k m text-go">RAS</span>
                <span className="text-dim">{EMPTY.attention}</span>
              </li>
            ) : (
              alerts.map((item, index) => <AlertRow key={index} item={item} />)
            )}
          </ul>
        </Pane>

        <Pane n="03" title="Journal" meta={since === null ? "derniers événements" : `depuis ${ago(since, now)}`}>
          <ul className="rows">
            {news.length === 0 ? (
              <li>
                <span className="k m text-faint">—</span>
                <span className="text-dim">{EMPTY.news}</span>
              </li>
            ) : (
              news.map((item) => <ActivityRow key={item.id} item={item} />)
            )}
          </ul>
          <p className="mt-3 text-right">
            <Link to="/projet" className="c text-[12px]">
              Tout le journal →
            </Link>
          </p>
        </Pane>
      </div>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-3">
        <Pane n="04" title="Version jouable">
          <PlayableCard />
        </Pane>
        {snap.issues.length > 0 && (
          <div className="lg:col-span-2">
            <SetupNote />
          </div>
        )}
      </div>
    </div>
  );
}
