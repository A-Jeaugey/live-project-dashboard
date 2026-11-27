import { Link } from "react-router";
import { Agent, Domain, IssueLink, OutLink, Pane, Segments, Tag } from "../components/bits";
import { Plan } from "../components/Plan";
import { ago, countdown, dayMonth, duration, list, plural, stamp } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import type { Activity, Attention, Deadline } from "../lib/types";
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
  const ms = next.milestone;

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

      <div className="mt-6">
        <div className="mb-2 flex items-baseline gap-3">
          <span className="c text-dim">Sortie de secours</span>
          <span className="leader" aria-hidden="true" />
          <span className="m text-fg">
            {ms ? (ms.total > 0 ? `${ms.closed}/${ms.total} verrous ouverts` : "aucune tâche") : "pas de jalon"}
          </span>
        </div>
        {ms ? (
          <Segments done={ms.closed} doing={ms.doing} total={ms.total} />
        ) : (
          <p className="m text-warn">Aucun jalon GitLab pour cette échéance.</p>
        )}
      </div>

      <p className="mt-6 max-w-[46ch] text-[15.5px] leading-snug text-dim">{briefing(m)}</p>
      <p className="mt-4">
        <Link to={`/echeances?e=${next.key}`} className="c text-[12px]">
          Voir ce qu'il reste →
        </Link>
      </p>
    </div>
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
              <span className="font-medium">{m.first(item.member)} est dans le couloir</span>
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

/** Une ligne de la main courante. */
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
      <p className="m mt-3 text-faint">Le poste proposera de les créer en phase 2.</p>
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
        <div className="min-w-0">
          <div className="brk overflow-x-auto p-1.5">
            <div className="min-w-[820px]">
              <Plan next={next} />
            </div>
          </div>
          <p className="m mt-2 text-faint lg:hidden">FAIRE GLISSER POUR VOIR TOUT L'ÉTAGE →</p>
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

        <Pane n="03" title="Main courante" meta={since === null ? "derniers événements" : `depuis ${ago(since, now)}`}>
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
              Toute la main courante →
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
