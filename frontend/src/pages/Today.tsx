import type { CSSProperties } from "react";
import { Link } from "react-router";
import { Agent, IssueLink, MiniRing, OutLink, Pill, Rings, Tile } from "../components/bits";
import { ago, countdown, dayMonth, duration, list, plural, stamp } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import { elapsedBefore, verdict } from "../lib/progress";
import type { Activity, Attention, Deadline } from "../lib/types";
import { previousVisit } from "../lib/visit";
import { activityVerb, briefing, EMPTY, FLAG_TEXT } from "../lib/voice";

/** La tuile vedette : l'échéance, le temps qui reste, et la course entre le temps et les tâches. */
function DeadlineHero({ next }: { next: Deadline | undefined }) {
  const m = useModel();

  if (!next) {
    return (
      <Tile hero className="col-span-12 lg:col-span-5 lg:row-span-2">
        <div className="text-muted">Calendrier</div>
        <h1 className="title mt-2 text-[30px]">Plus aucune échéance</h1>
        <p className="mt-3 text-muted">Toutes les dates du calendrier sont passées.</p>
      </Tile>
    );
  }

  const ms = next.milestone;
  const time = elapsedBefore(next, m.snap.deadlines);
  const done = ms && ms.total > 0 ? ms.closed / ms.total : null;
  const doing = ms && ms.total > 0 ? ms.doing / ms.total : 0;
  const v = verdict(time.share, done, ms !== null);
  const label = countdown(next);
  const numeric = /^J-\d+$/.test(label);

  return (
    <Tile hero className="col-span-12 flex flex-col lg:col-span-5 lg:row-span-2">
      <div className="text-[13px] text-muted">
        {next.night !== null && `Nuit ${next.night} sur ${m.nights.length} · `}semaine du {dayMonth(next.week_of)}
      </div>
      <h1 className="title mt-2 max-w-[16ch] text-[clamp(26px,2.6vw,32px)]">{next.title}</h1>
      <div className="mt-4">
        <Pill color={v.color}>{v.text}</Pill>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-6 py-8">
        <Rings
          time={time.share}
          done={done ?? 0}
          doing={doing}
          size={236}
          label={`${Math.round(time.share * 100)} % du temps écoulé, ${ms ? `${ms.closed} tâches rendues sur ${ms.total}` : "pas de jalon"}`}
        />
        <div className="min-w-0">
          {numeric ? (
            <div className="big text-[clamp(88px,8.6vw,128px)]">{label.slice(2)}</div>
          ) : (
            <div className="big text-[44px]">{label}</div>
          )}
          <div className="mt-2.5 text-muted">{numeric ? plural(next.days_left, "jour restant", "jours restants") : "jusqu'à l'échéance"}</div>
          <dl className="mt-5 grid grid-cols-[auto_auto] gap-x-4 gap-y-2 text-[13px]">
            <dt className="flex items-center gap-2 text-muted">
              <span className="dot" style={{ "--c": "var(--fg)" } as CSSProperties} />
              Temps écoulé
            </dt>
            <dd className="mono m-0 text-[13px] font-semibold">{Math.round(time.share * 100)} %</dd>
            <dt className="flex items-center gap-2 text-muted">
              <span className="dot" style={{ "--c": "var(--lime)" } as CSSProperties} />
              Tâches rendues
            </dt>
            <dd className="mono m-0 text-[13px] font-semibold">{ms && ms.total > 0 ? `${ms.closed}/${ms.total}` : "—"}</dd>
          </dl>
        </div>
      </div>

      <p className="border-t border-line pt-4 text-[13.5px] leading-snug text-muted">
        {briefing(m)}{" "}
        <Link to={`/echeances?e=${next.key}`} className="whitespace-nowrap text-fg hover:text-lime">
          Voir ce qu'il reste →
        </Link>
      </p>
    </Tile>
  );
}

/** Qui fait quoi : une ligne par membre, avec ce qui cloche écrit sur la ligne. */
function Team() {
  const m = useModel();
  const { fresh } = useLive();
  const { snap } = m;
  const free = snap.issues.filter((i) => i.column === "todo" && i.assignees.length === 0).length;
  const busy = snap.members.filter((mb) => snap.issues.some((i) => i.column === "doing" && i.assignees.includes(mb.username))).length;

  return (
    <Tile title="Équipe" meta={`${busy} sur ${snap.members.length} ont une tâche`} className="col-span-12 lg:col-span-7">
      <ul className="rows">
        {snap.members.map((member) => {
          const doing = snap.issues.filter((i) => i.column === "doing" && i.assignees.includes(member.username));
          const first = doing[0];
          const mrs = first ? first.merge_requests.flatMap((iid) => m.mr(iid) ?? []) : [];
          const late = mrs.find((mr) => mr.overdue);
          const reviewing = mrs.find((mr) => mr.waiting_review);
          const task = first ? (
            <>
              <IssueLink issue={first} className="font-normal" />
              {doing.length > 1 && <span className="ml-2 text-faint">+{doing.length - 1}</span>}
            </>
          ) : (
            <span className="text-muted">Rien en cours</span>
          );
          return (
            <li key={member.username} className={`flex-wrap sm:flex-nowrap ${first && fresh.has(first.iid) ? "fresh rounded-xl" : ""}`}>
              <Agent username={member.username} size={30} />
              <span className="flex-1 font-semibold sm:w-[66px] sm:flex-none">{member.first_name}</span>
              <span className="ellipsis order-last basis-full pl-[42px] sm:order-none sm:flex-1 sm:basis-auto sm:pl-0">{task}</span>
              {!first ? (
                free > 0 ? (
                  <Link to="/tableau" className="pill" style={{ "--pc": "var(--muted)" } as CSSProperties}>
                    {free} {plural(free, "tâche libre", "tâches libres")}
                  </Link>
                ) : null
              ) : first.stale_days !== null ? (
                <Pill color="var(--amber)">{first.stale_days} j sans activité</Pill>
              ) : late ? (
                <Pill color="var(--red)">Relecture · {duration(late.waiting_hours ?? 0)}</Pill>
              ) : reviewing ? (
                <Pill color="var(--blue)">En relecture</Pill>
              ) : (
                <Pill color="var(--blue)">En cours</Pill>
              )}
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

/** Ce qui dépend de la personne connectée. */
function Mine() {
  const m = useModel();
  const { snap, me } = m;
  const doing = snap.issues.filter((i) => i.column === "doing" && i.assignees.includes(me.username));
  const toReview = snap.merge_requests.filter(
    (mr) => mr.waiting_review && mr.reviewers.includes(me.username) && !mr.approved_by.includes(me.username),
  );
  const waiting = snap.merge_requests.filter((mr) => mr.waiting_review && mr.author === me.username);
  const count = doing.length + toReview.length + waiting.length;

  return (
    <Tile title="À toi" meta={count} className="col-span-12 md:col-span-6 lg:col-span-3">
      <ul className="rows top">
        {count === 0 && <li className="text-muted">{EMPTY.mine}</li>}
        {doing.map((issue) => (
          <li key={`i${issue.iid}`}>
            <span className="dot mt-1.5" style={{ "--c": "var(--blue)" } as CSSProperties} />
            <div className="min-w-0">
              <IssueLink issue={issue} />
              <div className="mt-0.5 text-[12.5px] text-muted">en cours{issue.stale_days !== null && ` · ${issue.stale_days} j sans activité`}</div>
            </div>
          </li>
        ))}
        {toReview.map((mr) => (
          <li key={`r${mr.iid}`}>
            <span className="dot mt-1.5" style={{ "--c": "var(--red)" } as CSSProperties} />
            <div className="min-w-0">
              <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                {mr.title}
              </OutLink>
              <div className="mt-0.5 text-[12.5px] text-muted">
                à relire · {m.first(mr.author)} attend depuis {duration(mr.waiting_hours ?? 0)}
              </div>
            </div>
          </li>
        ))}
        {waiting.map((mr) => (
          <li key={`w${mr.iid}`}>
            <span className="dot mt-1.5" style={{ "--c": mr.overdue ? "var(--amber)" : "var(--muted)" } as CSSProperties} />
            <div className="min-w-0">
              <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                {mr.title}
              </OutLink>
              <div className="mt-0.5 text-[12.5px] text-muted">
                {mr.reviewers.length > 0 ? `relecture : ${list(mr.reviewers.map(m.first))}` : "aucun relecteur"} · {duration(mr.waiting_hours ?? 0)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

function AlertRow({ item }: { item: Attention }) {
  const m = useModel();
  const color = item.kind === "mr_waiting" || item.kind === "pipeline_failed" ? "var(--red)" : "var(--amber)";
  const dot = <span className="dot mt-1.5" style={{ "--c": color } as CSSProperties} />;

  switch (item.kind) {
    case "mr_waiting": {
      const mr = m.mr(item.mr);
      return (
        <li>
          {dot}
          <div className="min-w-0">
            <OutLink href={mr?.web_url} refText={`!${item.mr}`}>
              attend une relecture
            </OutLink>
            <div className="mt-0.5 text-[12.5px] text-muted">
              depuis {duration(item.hours)}
              {item.reviewers.length > 0 && ` · ${list(item.reviewers.map(m.first))}`}
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
          ? `${item.days} jours sans activité · ${list(item.assignees.map(m.first)) || "personne"}`
          : item.kind === "needs_triage"
            ? FLAG_TEXT.needs_triage
            : FLAG_TEXT[item.flag];
      return (
        <li>
          {dot}
          <div className="min-w-0">
            <IssueLink issue={issue} />
            <div className="mt-0.5 text-[12.5px] text-muted">{why}</div>
          </div>
        </li>
      );
    }
    case "member_idle":
      return (
        <li>
          {dot}
          <div className="min-w-0">
            <span className="font-medium">{m.first(item.member)} n'a rien en cours</span>
            <div className="mt-0.5 text-[12.5px] text-muted">
              {item.available_todo > 0 ? `${item.available_todo} ${plural(item.available_todo, "tâche attend", "tâches attendent")} quelqu'un` : "rien à prendre"}
            </div>
          </div>
        </li>
      );
    case "pipeline_failed":
      return (
        <li>
          {dot}
          <OutLink href={item.web_url}>
            Pipeline de <span className="mono">{item.ref}</span> en échec
          </OutLink>
        </li>
      );
  }
}

function Alerts() {
  const { snap } = useModel();
  const alerts = snap.issues.length === 0 ? snap.attention.filter((a) => a.kind !== "member_idle") : snap.attention;
  return (
    <Tile title="À surveiller" meta={alerts.length} className="col-span-12 md:col-span-6 lg:col-span-4">
      <ul className="rows top">
        {alerts.length === 0 ? (
          <li className="text-muted">{EMPTY.attention}</li>
        ) : (
          alerts.map((item, index) => <AlertRow key={index} item={item} />)
        )}
      </ul>
    </Tile>
  );
}

/** Les échéances suivantes, en petites tuiles. */
function Upcoming({ next }: { next: Deadline | undefined }) {
  const m = useModel();
  const after = m.nights.filter((d) => !d.past && d.key !== next?.key).slice(0, 3);
  return (
    <Tile title="À venir" meta={<Link to="/echeances" className="hover:text-fg">Tout le calendrier →</Link>} className="col-span-12 md:col-span-6 lg:col-span-4">
      {after.length === 0 ? (
        <p className="text-muted">Plus rien après celle-ci.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {after.map((d) => (
            <Link key={d.key} to={`/echeances?e=${d.key}`} className="chiptile transition-colors hover:bg-tile3">
              <div className="big text-[24px] tracking-[-0.04em]">{countdown(d)}</div>
              <div className="mt-1.5 text-[12.5px] leading-tight text-muted">{d.short_title}</div>
              <div className="mt-3 flex items-center gap-2">
                {d.milestone && d.milestone.total > 0 ? (
                  <>
                    <MiniRing done={d.milestone.closed} total={d.milestone.total} size={20} />
                    <span className="mono text-[11.5px] text-muted">
                      {d.milestone.closed}/{d.milestone.total}
                    </span>
                  </>
                ) : (
                  <span className="text-[11.5px] text-faint">{d.milestone ? "jalon vide" : "sans jalon"}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Tile>
  );
}

/** Une ligne du journal. En version compacte, tout tient sur une ligne. */
export function ActivityRow({ item, compact = false }: { item: Activity; compact?: boolean }) {
  const m = useModel();
  const target = item.target;
  const issue = target?.type === "issue" && target.iid !== null ? m.issue(target.iid) : undefined;
  const sigil = target?.type === "merge_request" ? "!" : "#";

  return (
    <li>
      <span className={`mono flex-none self-start pt-0.5 text-faint ${compact ? "w-[46px]" : "w-[84px]"}`}>
        {compact ? stamp(item.at, m.now).replace(/^hier .*/, "hier") : stamp(item.at, m.now)}
      </span>
      <div className={`min-w-0 flex-1 ${compact ? "flex items-baseline gap-1.5" : ""}`}>
        <span className={compact ? "flex-none" : ""}>
          <span className="font-semibold">{m.who(item)}</span> <span className="text-muted">{activityVerb(item)}</span>{" "}
        </span>
        {issue ? (
          <IssueLink issue={issue} className={`font-normal ${compact ? "ellipsis block min-w-0" : ""}`} />
        ) : target?.title ? (
          <OutLink
            href={target.web_url}
            refText={target.iid !== null ? `${sigil}${target.iid}` : undefined}
            className={`font-normal ${compact ? "ellipsis block min-w-0" : ""}`}
          >
            {target.type === "branch" ? <span className="mono">{target.title}</span> : target.title}
          </OutLink>
        ) : null}
      </div>
    </li>
  );
}

function Journal() {
  const { snap, now } = useModel();
  const since = previousVisit();
  const news = (since === null ? snap.activity : snap.activity.filter((a) => Date.parse(a.at) > since)).slice(0, 5);
  return (
    <Tile title="Activité" meta={since === null ? "derniers événements" : `depuis ${ago(since, now)}`} className="col-span-12 md:col-span-6 lg:col-span-4">
      <ul className="rows top">
        {news.length === 0 ? <li className="text-muted">{EMPTY.news}</li> : news.map((item) => <ActivityRow key={item.id} item={item} compact />)}
      </ul>
      <Link to="/projet" className="mt-2 inline-block text-[13px] text-muted hover:text-fg">
        Tout le journal →
      </Link>
    </Tile>
  );
}

export function PlayableCard() {
  const { snap, now } = useModel();
  const p = snap.playable;
  if (p.source === "none") return <p className="text-muted">Le dépôt est encore vide.</p>;

  const why =
    p.fallback_reason === "no_pipeline"
      ? "Pas de CI : dernier commit affiché."
      : p.fallback_reason === "no_successful_pipeline"
        ? "Aucun pipeline réussi : dernier commit affiché."
        : p.fallback_reason === "no_tag"
          ? "Aucun tag de version : dernier commit affiché."
          : null;

  return (
    <div>
      <OutLink href={p.web_url}>{p.title}</OutLink>
      <div className="mt-1 text-[12.5px] text-muted">
        <span className="mono">{p.tag ?? p.short_sha}</span> · {p.author_name}
        {p.committed_at && ` · ${ago(p.committed_at, now)}`}
        {p.source === "pipeline" && " · pipeline réussi"}
      </div>
      {why && <div className="mt-3 text-[12.5px] text-amber">{why}</div>}
    </div>
  );
}

export function SetupNote({ className = "col-span-12" }: { className?: string }) {
  const { snap } = useModel();
  const { missing_labels, missing_milestones } = snap.setup;
  if (missing_labels.length + missing_milestones.length === 0) return null;
  return (
    <Tile title="Mise en place" meta="à faire dans GitLab" className={className}>
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        {missing_labels.length > 0 && (
          <div className="min-w-0">
            <div className="text-[12.5px] text-muted">
              {missing_labels.length} {plural(missing_labels.length, "label manquant", "labels manquants")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missing_labels.map((label) => (
                <Pill key={label}>{label}</Pill>
              ))}
            </div>
          </div>
        )}
        {missing_milestones.length > 0 && (
          <div className="min-w-0">
            <div className="text-[12.5px] text-muted">
              {missing_milestones.length} {plural(missing_milestones.length, "jalon à créer", "jalons à créer")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missing_milestones.map((title) => (
                <Pill key={title} color="var(--amber)">
                  {title}
                </Pill>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="mt-4 text-[12.5px] text-faint">L'outil proposera de les créer en phase 2.</p>
    </Tile>
  );
}

export function Today() {
  const m = useModel();
  const next = m.nextDeadline;
  const empty = m.snap.issues.length === 0;

  return (
    <div className="bento">
      <DeadlineHero next={next} />
      <Team />
      <Mine />
      <Alerts />
      {empty && <SetupNote />}
      <Upcoming next={next} />
      <Journal />
      <Tile title="Version jouable" meta={m.snap.project.default_branch} className="col-span-12 md:col-span-6 lg:col-span-4">
        <PlayableCard />
      </Tile>
      {!empty && <SetupNote />}
    </div>
  );
}

