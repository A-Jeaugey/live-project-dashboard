import { OutLink, PageTitle, Section } from "../components/bits";
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
    <div className="space-y-9 px-5 py-7 md:px-10 md:py-10">
      <PageTitle title="Projet">
        <a href={snap.project.web_url} target="_blank" rel="noreferrer">
          {snap.project.path} ↗
        </a>
      </PageTitle>

      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-10">
          <Section numeral="I" title="Relectures" aside={`relance au-delà de ${snap.settings.review_hours} h`}>
            <ul className="ruled">
              {waiting.length + others.length === 0 && (
                <li>
                  <span className="gutter" />
                  <span className="body text-soft">{EMPTY.reviews}</span>
                </li>
              )}
              {waiting.map((mr) => (
                <li key={mr.iid}>
                  <span className="gutter">
                    <span className={`hand tilt ${mr.overdue ? "hand-pen" : "text-soft"}`}>
                      {duration(mr.waiting_hours ?? 0)}
                      {mr.overdue && " !"}
                    </span>
                  </span>
                  <div className="body">
                    <div className="min-w-0 flex-1 basis-64">
                      <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                        {mr.title}
                      </OutLink>
                      <div className="text-[13px] text-soft">
                        {m.first(mr.author)} →{" "}
                        {mr.reviewers.length > 0 ? list(mr.reviewers.map(m.first)) : "personne n'est désigné"}
                        {mr.closes.length > 0 && ` · ferme ${mr.closes.map((iid) => `#${iid}`).join(", ")}`}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {others.map((mr) => (
                <li key={mr.iid}>
                  <span className="gutter">
                    <span className="hand text-soft">{mr.draft ? "brouillon" : "relue"}</span>
                  </span>
                  <div className="body">
                    <div className="min-w-0 flex-1 basis-64">
                      <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                        {mr.title}
                      </OutLink>
                      <div className="text-[13px] text-soft">
                        {m.first(mr.author)}
                        {mr.approved_by.length > 0 && ` · approuvée par ${list(mr.approved_by.map(m.first))}`}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section numeral="II" title="Journal" aside={`${snap.activity.length} derniers événements`}>
            <ul className="ruled">
              {snap.activity.length === 0 ? (
                <li>
                  <span className="gutter" />
                  <span className="body text-soft">Il ne s'est encore rien passé dans GitLab.</span>
                </li>
              ) : (
                snap.activity.map((item) => <ActivityRow key={item.id} item={item} />)
              )}
            </ul>
          </Section>
        </div>

        <aside className="space-y-10">
          <Section title="Version jouable">
            <PlayableCard />
          </Section>

          <Section title="Pipelines">
            {snap.pipelines.length === 0 ? (
              <>
                <p className="hand text-[1.3rem] text-soft">{EMPTY.pipelines}</p>
                <p className="mt-1 text-[13.5px] text-soft">
                  Dès qu'une CI tournera sur <span className="mono">{snap.project.default_branch}</span>, ses résultats
                  s'afficheront ici.
                </p>
              </>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0">
                {snap.pipelines.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-baseline gap-3">
                    <span className={`w-20 font-medium ${p.status === "failed" ? "text-pen" : p.status === "success" ? "text-ok" : ""}`}>
                      {PIPELINE_STATUS[p.status] ?? p.status}
                    </span>
                    <OutLink href={p.web_url} className="font-normal">
                      <span className="mono">{p.sha.slice(0, 8)}</span>
                    </OutLink>
                    <span className="mono ml-auto text-[12px] text-faint">{ago(p.created_at, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Synchronisation">
            <dl className="m-0 grid grid-cols-[112px_minmax(0,1fr)] gap-y-2 text-[14px]">
              <dt className="label pt-0.5">Mode</dt>
              <dd className="m-0">
                {snap.sync.mode === "webhook" ? "webhooks GitLab" : "interrogation régulière de GitLab"}
              </dd>
              <dt className="label pt-0.5">Lecture</dt>
              <dd className="m-0">
                {snap.sync.last_success_at ? agoPrecise(snap.sync.last_success_at, now) : "jamais"}
                {!snap.sync.ok && <span className="text-pen"> · GitLab ne répond pas</span>}
              </dd>
              <dt className="label pt-0.5">Webhook</dt>
              <dd className="m-0">
                {snap.sync.last_webhook_at ? `dernier reçu ${ago(snap.sync.last_webhook_at, now)}` : "aucun reçu"}
              </dd>
              <dt className="label pt-0.5">En direct</dt>
              <dd className="m-0">{connected ? "flux ouvert" : <span className="text-pen">flux coupé, reconnexion…</span>}</dd>
            </dl>
            {snap.sync.last_error && <p className="mono mt-3 text-[12px] text-pen">{snap.sync.last_error}</p>}
          </Section>

          <SetupNote />
        </aside>
      </div>
    </div>
  );
}
