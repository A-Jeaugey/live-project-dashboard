import { Link } from "react-router";
import { Circled, Gommette, IssueLink, OutLink, Photo, Section, Stamp, Ticks } from "../components/bits";
import { ago, countdown, dayMonth, duration, list, plural, shortDate, stamp } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import type { Activity, Attention, Deadline } from "../lib/types";
import { previousVisit } from "../lib/visit";
import { activityVerb, appreciation, EMPTY, FLAG_TEXT, marginNote } from "../lib/voice";

/** En-tête de copie : qui, quelle épreuve, et dans la case de la note, le temps qu'il reste. */
function Cartouche({ next }: { next: Deadline | undefined }) {
  const { me, nights, now } = useModel();
  const lastName = me.name.replace(me.first_name, "").trim() || me.username;

  return (
    <div className="cartouche">
      <dl className="identity m-0 space-y-2.5 p-5">
        {[
          ["Nom", lastName],
          ["Prénom", me.first_name],
          ["Projet", "5 Nights at EPITA"],
          ["Date", shortDate(now)],
        ].map(([label, value]) => (
          <div key={label} className="field">
            <dt className="label pb-1">{label}</dt>
            <dd className="hand hand-biro text-[1.4rem]">{value}</dd>
          </div>
        ))}
      </dl>

      {next ? (
        <>
          <div className="p-5 md:p-7">
            <div className="label">
              {next.night ? `Nuit ${next.night} sur ${nights.length} · ` : "Prochaine échéance · "}
              semaine du {dayMonth(next.week_of)}
            </div>
            <h1 className="display mt-2 text-[44px] md:text-[62px]">
              <span className="ruler">{next.title}</span>
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              {next.milestone ? (
                <>
                  <Ticks done={next.milestone.closed} doing={next.milestone.doing} total={next.milestone.total} />
                  <span>
                    {next.milestone.total === 0
                      ? "aucune tâche dans ce jalon"
                      : `${next.milestone.closed} ${plural(next.milestone.closed, "tâche rendue", "tâches rendues")} sur ${next.milestone.total}`}
                  </span>
                </>
              ) : (
                <span className="hand hand-pen">pas encore de jalon dans GitLab</span>
              )}
              <Link to={`/echeances?e=${next.key}`}>voir ce qu'il reste</Link>
            </div>
          </div>
          <div className="grade flex items-center justify-between gap-4 px-5 py-3 sm:flex-col sm:justify-center sm:gap-2 sm:p-4 sm:text-center">
            <span className="label sm:self-start">Reste</span>
            <span
              className={`hand hand-pen ${countdown(next).length > 6 ? "text-[28px] md:text-[32px]" : "text-[46px] sm:text-[58px] md:text-[66px]"}`}
              style={{ transform: "rotate(-4deg)" }}
            >
              <Circled>{countdown(next)}</Circled>
            </span>
            <span className="mono max-w-[9rem] text-right text-[11.5px] text-faint sm:max-w-none sm:text-center">
              jusqu'au lundi {dayMonth(next.target_date)}
            </span>
          </div>
        </>
      ) : (
        <div className="col-span-2 p-7">
          <div className="label">Calendrier</div>
          <h1 className="display mt-2 text-[44px] md:text-[62px]">Plus aucune échéance</h1>
          <p className="mt-3 text-soft">Toutes les dates du calendrier sont passées.</p>
        </div>
      )}
    </div>
  );
}

function Frise({ next }: { next: Deadline | undefined }) {
  const { nights } = useModel();
  if (nights.length === 0) return null;
  return (
    <ol className="frise" style={{ "--n": nights.length } as React.CSSProperties} aria-label="Les échéances du projet">
      {nights.map((d) => {
        const current = d.key === next?.key;
        return (
          <li key={d.key}>
            <Link to={`/echeances?e=${d.key}`} className="block text-ink no-underline hover:no-underline">
              <span className={`hand text-[1.3rem] ${current ? "hand-pen" : "text-soft"}`}>nuit {d.night}</span>
              <span className="block leading-tight font-semibold">
                {current ? <span className="marker">{d.title}</span> : d.title}
              </span>
              <span className="mono mt-1 block text-faint">
                {shortDate(d.week_of)} · {countdown(d)}
              </span>
            </Link>
            {d.past && (
              <span className="absolute top-4 right-4">
                <Stamp color="var(--ok)" tilt={-8}>
                  passée
                </Stamp>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** I. Ce qui dépend de la personne connectée. */
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

  if (doing.length + toReview.length + waitingOnOthers.length === 0) {
    return (
      <ul className="ruled">
        <li>
          <span className="gutter" />
          <span className="body">
            <span className="text-soft">
              {EMPTY.mine}{" "}
              {free > 0 && (
                <Link to="/tableau">
                  {free} {plural(free, "tâche attend", "tâches attendent")} quelqu'un au tableau.
                </Link>
              )}
            </span>
          </span>
        </li>
      </ul>
    );
  }

  return (
    <ul className="ruled">
      {doing.map((issue) => {
        const deadline = m.deadline(issue.milestone?.deadline_key);
        return (
          <li key={`i${issue.iid}`} className={fresh.has(issue.iid) ? "fresh" : ""}>
            <span className="gutter">
              <span className="hand hand-biro">en cours</span>
            </span>
            <div className="body">
              <div className="min-w-0 flex-1 basis-64">
                <IssueLink issue={issue} />
                <div className="flex flex-wrap items-center gap-x-3 text-[13px] text-soft">
                  {issue.domains.map((d) => (
                    <Gommette key={d} name={d} />
                  ))}
                  {deadline && (
                    <span>
                      {deadline.short_title} · {countdown(deadline)}
                    </span>
                  )}
                  {issue.stale_days !== null && (
                    <span className="text-pen">sans nouvelles depuis {issue.stale_days} jours</span>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
      {toReview.map((mr) => (
        <li key={`r${mr.iid}`}>
          <span className="gutter">
            <span className="hand hand-pen">à relire</span>
          </span>
          <div className="body">
            <div className="min-w-0 flex-1 basis-64">
              <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                {mr.title}
              </OutLink>
              <div className="text-[13px] text-soft">
                {m.first(mr.author)} attend ta relecture depuis {duration(mr.waiting_hours ?? 0)}
              </div>
            </div>
          </div>
        </li>
      ))}
      {waitingOnOthers.map((mr) => (
        <li key={`w${mr.iid}`}>
          <span className="gutter">
            <span className={`hand ${mr.overdue ? "hand-pen" : "text-soft"}`}>en attente</span>
          </span>
          <div className="body">
            <div className="min-w-0 flex-1 basis-64">
              <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                {mr.title}
              </OutLink>
              <div className="text-[13px] text-soft">
                {mr.reviewers.length > 0
                  ? `relecture demandée à ${list(mr.reviewers.map(m.first))}`
                  : "personne n'est désigné pour la relire"}{" "}
                · {duration(mr.waiting_hours ?? 0)}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AttentionRow({ item }: { item: Attention }) {
  const m = useModel();
  const note = marginNote(item, m.snap.settings.review_hours);
  const gutter = (
    <span className="gutter">
      <span className="hand hand-pen tilt">{note}</span>
    </span>
  );

  switch (item.kind) {
    case "mr_waiting": {
      const mr = m.mr(item.mr);
      return (
        <li>
          {gutter}
          <div className="body">
            <div className="min-w-0 flex-1 basis-64">
              <OutLink href={mr?.web_url} refText={`!${item.mr}`}>
                {mr?.title ?? "Merge request"}
              </OutLink>
              <div className="text-[13px] text-soft">
                {item.reviewers.length > 0
                  ? `relecture attendue de ${list(item.reviewers.map(m.first))}`
                  : "personne n'est désigné pour la relire"}{" "}
                · écrite par {m.first(item.author)}
              </div>
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
          {gutter}
          <div className="body">
            <div className="min-w-0 flex-1 basis-64">
              <IssueLink issue={issue} />
              <div className="text-[13px] text-soft">{why}</div>
            </div>
          </div>
        </li>
      );
    }
    case "member_idle":
      return (
        <li>
          {gutter}
          <div className="body">
            <Photo username={item.member} size={30} />
            <div className="min-w-0 flex-1 basis-56">
              <span className="font-medium">{m.first(item.member)} n'a rien en cours</span>
              <div className="text-[13px] text-soft">
                {item.available_todo > 0 ? (
                  <Link to="/tableau">
                    {item.available_todo} {plural(item.available_todo, "tâche attend", "tâches attendent")} quelqu'un
                  </Link>
                ) : (
                  "et il n'y a rien à prendre : il faut décider de la suite"
                )}
              </div>
            </div>
          </div>
        </li>
      );
    case "pipeline_failed":
      return (
        <li>
          {gutter}
          <div className="body">
            <OutLink href={item.web_url}>
              Le pipeline de <span className="mono">{item.ref}</span> a échoué
            </OutLink>
          </div>
        </li>
      );
  }
}

export function ActivityRow({ item }: { item: Activity }) {
  const m = useModel();
  const target = item.target;
  const issue = target?.type === "issue" && target.iid !== null ? m.issue(target.iid) : undefined;
  const sigil = target?.type === "merge_request" ? "!" : "#";

  return (
    <li>
      <span className="gutter">
        <span className="mono text-[12px] text-faint">{stamp(item.at, m.now)}</span>
      </span>
      <div className="body">
        <span>
          <strong className="font-semibold">{m.who(item)}</strong> {activityVerb(item)}{" "}
          {issue ? (
            <IssueLink issue={issue} className="font-normal" />
          ) : target?.title ? (
            <OutLink
              href={target.web_url}
              refText={target.iid !== null ? `${sigil}${target.iid}` : undefined}
              className="font-normal"
            >
              {target.type === "branch" ? <span className="mono">{target.title}</span> : target.title}
            </OutLink>
          ) : null}
        </span>
      </div>
    </li>
  );
}

function Roll() {
  const m = useModel();
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {m.snap.members.map((member) => {
        const doing = m.snap.issues.filter((i) => i.column === "doing" && i.assignees.includes(member.username));
        return (
          <li key={member.username} className="flex items-center gap-3">
            <Photo username={member.username} size={38} />
            <div className="min-w-0 leading-snug">
              <div className="font-semibold">{member.first_name}</div>
              {doing.length > 0 ? (
                doing.map((issue) => <IssueLink key={issue.iid} issue={issue} className="block text-[13.5px] font-normal text-soft" />)
              ) : (
                <span className="hand hand-pen text-[1.2rem]">rien en cours</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PlayableCard() {
  const { snap, now } = useModel();
  const p = snap.playable;
  if (p.source === "none") return <p className="text-soft">Le dépôt est encore vide.</p>;

  const why =
    p.fallback_reason === "no_pipeline"
      ? "pas de CI : c'est le dernier commit qui fait foi"
      : p.fallback_reason === "no_successful_pipeline"
        ? "aucun pipeline réussi : dernier commit affiché"
        : p.fallback_reason === "no_tag"
          ? "aucun tag de version : dernier commit affiché"
          : null;

  return (
    <div>
      <OutLink href={p.web_url} refText={p.tag ?? p.short_sha ?? undefined}>
        {p.title}
      </OutLink>
      <div className="text-[13px] text-soft">
        {p.author_name}
        {p.committed_at && ` · ${ago(p.committed_at, now)}`}
        {p.source === "pipeline" && " · pipeline réussi"}
      </div>
      {why && <div className="hand hand-pen mt-1 text-[1.2rem]">{why}</div>}
    </div>
  );
}

export function SetupNote() {
  const { snap } = useModel();
  const { missing_labels, missing_milestones } = snap.setup;
  if (missing_labels.length + missing_milestones.length === 0) return null;
  return (
    <div className="border-[1.5px] border-dashed border-faint p-4 text-[14px]">
      <div className="label mb-2">Mise en place</div>
      {missing_labels.length > 0 && (
        <p>
          {missing_labels.length} {plural(missing_labels.length, "label manque", "labels manquent")} dans GitLab :{" "}
          <span className="mono">{missing_labels.join(", ")}</span>.
        </p>
      )}
      {missing_milestones.length > 0 && (
        <p className={missing_labels.length > 0 ? "mt-2" : ""}>
          {missing_milestones.length} {plural(missing_milestones.length, "jalon", "jalons")} à créer :{" "}
          {missing_milestones.join(", ")}.
        </p>
      )}
      <p className="mt-2 text-soft">Le carnet proposera de les créer en phase 2.</p>
    </div>
  );
}

export function Today() {
  const m = useModel();
  const { snap, now } = m;
  const next = m.nextDeadline;

  const attention =
    snap.issues.length === 0 ? snap.attention.filter((a) => a.kind !== "member_idle") : snap.attention;

  const since = previousVisit();
  const recent = since === null ? [] : snap.activity.filter((a) => Date.parse(a.at) > since);
  const news = (since === null ? snap.activity : recent).slice(0, 8);

  return (
    <div className="space-y-9 px-5 py-7 md:space-y-11 md:px-10 md:py-10">
      <Cartouche next={next} />

      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="label">Appréciation</span>
        <span className="hand hand-pen text-[1.75rem] leading-[1.15]" style={{ transform: "rotate(-0.7deg)" }}>
          {appreciation(m)}
        </span>
      </p>

      {snap.issues.length === 0 && <SetupNote />}

      <Frise next={next} />

      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-10">
          <Section numeral="I" title="À toi">
            <Mine />
          </Section>

          <Section numeral="II" title="À surveiller">
            <ul className="ruled">
              {attention.length === 0 ? (
                <li>
                  <span className="gutter" />
                  <span className="body text-soft">{EMPTY.attention}</span>
                </li>
              ) : (
                attention.map((item, index) => <AttentionRow key={index} item={item} />)
              )}
            </ul>
          </Section>

          <Section
            numeral="III"
            title={since === null ? "Dernières nouvelles" : "Depuis ta dernière visite"}
            aside={since === null ? undefined : ago(since, now)}
          >
            <ul className="ruled">
              {news.length === 0 ? (
                <li>
                  <span className="gutter" />
                  <span className="body text-soft">{EMPTY.news}</span>
                </li>
              ) : (
                news.map((item) => <ActivityRow key={item.id} item={item} />)
              )}
            </ul>
            <p className="mt-3 text-right">
              <Link to="/projet">tout le journal</Link>
            </p>
          </Section>
        </div>

        <aside className="space-y-10">
          <Section title="Feuille d'appel">
            <Roll />
            <p className="mt-4">
              <Link to="/equipe">voir l'équipe</Link>
            </p>
          </Section>
          <Section title="Version jouable">
            <PlayableCard />
          </Section>
          {snap.issues.length > 0 && <SetupNote />}
        </aside>
      </div>
    </div>
  );
}
