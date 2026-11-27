import { OutLink, PageHead, Pane, Tag } from "../components/bits";
import { ago, agoPrecise, duration, list } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import { EMPTY } from "../lib/voice";
import { ActivityRow, PlayableCard, SetupNote } from "./Today";

const PIPELINE_STATUS: Record<string, string> = {
  success: "réussi",
  failed: "échoué",
  running: "en cours",
  pending: "en attente",
  created: "créé",
  canceled: "annulé",
  skipped: "ignoré",
  manual: "manuel",
};

/** Santé du dépôt : version jouable, relectures, pipelines, journal complet, état de la synchro. */
export function Project() {
  const m = useModel();
  const { snap, now } = m;
  const { connected } = useLive();

  const waiting = snap.merge_requests
    .filter((mr) => mr.waiting_review)
    .sort((a, b) => (b.waiting_hours ?? 0) - (a.waiting_hours ?? 0));
  const others = snap.merge_requests.filter((mr) => !mr.waiting_review);

  return (
    <div className="space-y-10 py-8 md:py-10">
      <PageHead title="Projet" kicker="05 · L'ÉTAT DU DÉPÔT">
        <a href={snap.project.web_url} target="_blank" rel="noreferrer">
          {snap.project.path} ↗
        </a>
      </PageHead>

      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-12">
          <Pane n="01" title="Relectures" meta={`relance au-delà de ${snap.settings.review_hours} h`}>
            <ul className="rows">
              {waiting.length + others.length === 0 && (
                <li>
                  <span className="k m text-go">RAS</span>
                  <span className="text-dim">{EMPTY.reviews}</span>
                </li>
              )}
              {waiting.map((mr) => (
                <li key={mr.iid}>
                  <span className={`k x text-[19px] leading-none ${mr.overdue ? "text-alarm" : "text-dim"}`}>
                    {duration(mr.waiting_hours ?? 0)}
                  </span>
                  <div className="min-w-0">
                    <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                      {mr.title}
                    </OutLink>
                    <div className="m mt-1 text-faint">
                      {m.first(mr.author)} → {mr.reviewers.length > 0 ? list(mr.reviewers.map(m.first)) : "aucun relecteur désigné"}
                      {mr.closes.length > 0 && ` · ferme ${mr.closes.map((iid) => `#${iid}`).join(", ")}`}
                    </div>
                  </div>
                </li>
              ))}
              {others.map((mr) => (
                <li key={mr.iid}>
                  <span className="k">
                    <Tag color={mr.draft ? "var(--faint)" : "var(--go)"}>{mr.draft ? "brouillon" : "relue"}</Tag>
                  </span>
                  <div className="min-w-0">
                    <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                      {mr.title}
                    </OutLink>
                    <div className="m mt-1 text-faint">
                      {m.first(mr.author)}
                      {mr.approved_by.length > 0 && ` · approuvée par ${list(mr.approved_by.map(m.first))}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Pane>

          <Pane n="02" title="Journal" meta={`${snap.activity.length} derniers événements`}>
            <ul className="rows" style={{ "--gutter": "92px" } as React.CSSProperties}>
              {snap.activity.length === 0 ? (
                <li>
                  <span className="k m text-faint">—</span>
                  <span className="text-dim">Il ne s'est encore rien passé dans GitLab.</span>
                </li>
              ) : (
                snap.activity.map((item) => <ActivityRow key={item.id} item={item} />)
              )}
            </ul>
          </Pane>
        </div>

        <aside className="space-y-12">
          <Pane n="03" title="Version jouable">
            <PlayableCard />
          </Pane>

          <Pane n="04" title="Pipelines">
            {snap.pipelines.length === 0 ? (
              <div className="border-t border-line2 pt-3">
                <p className="m text-warn">{EMPTY.pipelines.toUpperCase()}</p>
                <p className="mt-2 text-dim">
                  Dès qu'une CI tournera sur <span className="m">{snap.project.default_branch}</span>, ses résultats
                  s'afficheront ici.
                </p>
              </div>
            ) : (
              <ul className="rows" style={{ "--gutter": "84px" } as React.CSSProperties}>
                {snap.pipelines.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <span className="k">
                      <Tag color={p.status === "failed" ? "var(--alarm)" : p.status === "success" ? "var(--go)" : "var(--dim)"}>
                        {PIPELINE_STATUS[p.status] ?? p.status}
                      </Tag>
                    </span>
                    <span className="flex items-baseline justify-between gap-3">
                      <OutLink href={p.web_url} className="font-normal">
                        <span className="m">{p.sha.slice(0, 8)}</span>
                      </OutLink>
                      <span className="m text-faint">{ago(p.created_at, now)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Pane>

          <Pane n="05" title="Synchronisation">
            <dl className="grid grid-cols-[104px_minmax(0,1fr)] border-t border-line2">
              <dt className="c border-b border-line py-2.5 text-faint">Mode</dt>
              <dd className="border-b border-line py-2.5">
                {snap.sync.mode === "webhook" ? "webhooks GitLab" : "interrogation régulière de GitLab"}
              </dd>
              <dt className="c border-b border-line py-2.5 text-faint">Lecture</dt>
              <dd className="border-b border-line py-2.5">
                {snap.sync.last_success_at ? agoPrecise(snap.sync.last_success_at, now) : "jamais"}
                {!snap.sync.ok && <span className="text-alarm"> · GitLab ne répond pas</span>}
              </dd>
              <dt className="c border-b border-line py-2.5 text-faint">Webhook</dt>
              <dd className="border-b border-line py-2.5">
                {snap.sync.last_webhook_at ? `dernier reçu ${ago(snap.sync.last_webhook_at, now)}` : "aucun reçu"}
              </dd>
              <dt className="c border-b border-line py-2.5 text-faint">En direct</dt>
              <dd className="border-b border-line py-2.5">
                {connected ? <span className="text-go">flux ouvert</span> : <span className="text-alarm">flux coupé, reconnexion…</span>}
              </dd>
            </dl>
            {snap.sync.last_error && <p className="m mt-3 text-alarm">{snap.sync.last_error}</p>}
          </Pane>

          <SetupNote />
        </aside>
      </div>
    </div>
  );
}
