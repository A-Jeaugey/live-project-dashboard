import type { CSSProperties } from "react";
import { OutLink, PageHead, Pill, Tile } from "../components/bits";
import { ago, agoPrecise, duration, list } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import { EMPTY } from "../lib/voice";
import { ActivityRow, PlayableCard, SetupNote } from "./Today";

const PIPELINE: Record<string, [string, string]> = {
  success: ["Réussi", "var(--green)"],
  failed: ["Échoué", "var(--red)"],
  running: ["En cours", "var(--blue)"],
  pending: ["En attente", "var(--muted)"],
  created: ["Créé", "var(--muted)"],
  canceled: ["Annulé", "var(--muted)"],
  skipped: ["Ignoré", "var(--muted)"],
  manual: ["Manuel", "var(--muted)"],
};

/** Santé du dépôt : relectures, journal complet, version jouable, pipelines, synchronisation. */
export function Project() {
  const m = useModel();
  const { snap, now } = m;
  const { connected } = useLive();

  const waiting = snap.merge_requests.filter((mr) => mr.waiting_review).sort((a, b) => (b.waiting_hours ?? 0) - (a.waiting_hours ?? 0));
  const others = snap.merge_requests.filter((mr) => !mr.waiting_review);

  return (
    <div className="space-y-5">
      <PageHead title="Projet">
        <a href={snap.project.web_url} target="_blank" rel="noreferrer" className="capsule hover:text-fg">
          {snap.project.path} ↗
        </a>
      </PageHead>

      <div className="bento">
        <Tile title="Relectures" meta={`relance au-delà de ${snap.settings.review_hours} h`} className="col-span-12 lg:col-span-8">
          <ul className="rows">
            {waiting.length + others.length === 0 && <li className="text-muted">{EMPTY.reviews}</li>}
            {waiting.map((mr) => (
              <li key={mr.iid}>
                <span className="ellipsis flex-1">
                  <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                    {mr.title}
                  </OutLink>
                  <span className="ml-3 text-[12.5px] text-muted">
                    {m.first(mr.author)} → {mr.reviewers.length > 0 ? list(mr.reviewers.map(m.first)) : "aucun relecteur"}
                  </span>
                </span>
                <Pill color={mr.overdue ? "var(--red)" : "var(--blue)"}>{duration(mr.waiting_hours ?? 0)}</Pill>
              </li>
            ))}
            {others.map((mr) => (
              <li key={mr.iid}>
                <span className="ellipsis flex-1">
                  <OutLink href={mr.web_url} refText={`!${mr.iid}`}>
                    {mr.title}
                  </OutLink>
                </span>
                <Pill color={mr.draft ? "var(--muted)" : "var(--green)"}>{mr.draft ? "Brouillon" : "Relue"}</Pill>
              </li>
            ))}
          </ul>
        </Tile>

        <Tile title="Version jouable" meta={snap.project.default_branch} className="col-span-12 md:col-span-6 lg:col-span-4">
          <PlayableCard />
        </Tile>

        <Tile title="Journal" meta={`${snap.activity.length} derniers événements`} className="col-span-12 lg:col-span-8 lg:row-span-2">
          <ul className="rows top">
            {snap.activity.length === 0 ? (
              <li className="text-muted">Il ne s'est encore rien passé dans GitLab.</li>
            ) : (
              snap.activity.map((item) => <ActivityRow key={item.id} item={item} />)
            )}
          </ul>
        </Tile>

        <Tile title="Pipelines" className="col-span-12 md:col-span-6 lg:col-span-4">
          {snap.pipelines.length === 0 ? (
            <>
              <p className="text-muted">{EMPTY.pipelines}</p>
              <p className="mt-2 text-[12.5px] text-faint">
                Dès qu'une CI tournera sur <span className="mono">{snap.project.default_branch}</span>, ses résultats s'afficheront ici.
              </p>
            </>
          ) : (
            <ul className="rows">
              {snap.pipelines.slice(0, 6).map((p) => {
                const [label, color] = PIPELINE[p.status] ?? [p.status, "var(--muted)"];
                return (
                  <li key={p.id}>
                    <Pill color={color}>{label}</Pill>
                    <OutLink href={p.web_url} className="font-normal">
                      <span className="mono">{p.sha.slice(0, 8)}</span>
                    </OutLink>
                    <span className="ml-auto text-[12.5px] text-faint">{ago(p.created_at, now)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Tile>

        <Tile title="Synchronisation" className="col-span-12 md:col-span-6 lg:col-span-4">
          <dl className="m-0 space-y-2.5 text-[13.5px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Mode</dt>
              <dd className="m-0">{snap.sync.mode === "webhook" ? "Webhooks GitLab" : "Interrogation régulière"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Dernière lecture</dt>
              <dd className="m-0">
                {snap.sync.last_success_at ? agoPrecise(snap.sync.last_success_at, now) : "jamais"}
                {!snap.sync.ok && <span className="text-red"> · GitLab muet</span>}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Webhook</dt>
              <dd className="m-0">{snap.sync.last_webhook_at ? `reçu ${ago(snap.sync.last_webhook_at, now)}` : "aucun reçu"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">En direct</dt>
              <dd className="m-0 flex items-center gap-2">
                <span className="led" data-live={connected} style={{ "--c": connected ? "var(--green)" : "var(--red)" } as CSSProperties} />
                {connected ? "Flux ouvert" : "Reconnexion…"}
              </dd>
            </div>
          </dl>
          {snap.sync.last_error && <p className="mono mt-3 text-red">{snap.sync.last_error}</p>}
        </Tile>

        <SetupNote className="col-span-12" />
      </div>
    </div>
  );
}
