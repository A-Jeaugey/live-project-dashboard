import type { ReactNode } from "react";

function Cover({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-5">
      <main className="brk w-full max-w-[620px] border border-line2 bg-panel p-8 md:p-12">{children}</main>
    </div>
  );
}

const REFUSALS: Record<string, string> = {
  non_membre: "Ce compte GitLab n'est pas membre du projet du jeu. Le poste est réservé au groupe.",
  connexion: "La connexion avec GitLab n'a pas abouti. Réessaie.",
  gitlab: "GitLab ne répond pas pour l'instant. Réessaie dans un moment.",
  configuration: "La connexion n'est pas encore configurée sur le serveur. Préviens Arthur.",
};

/** Adresse de connexion qui ramène ensuite à la page demandée, sans le code d'erreur éventuel. */
function loginUrl(): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("erreur");
  const query = params.toString();
  const here = window.location.pathname + (query ? `?${query}` : "");
  return here === "/" ? "/auth/login" : `/auth/login?next=${encodeURIComponent(here)}`;
}

export function Login() {
  const reason = new URLSearchParams(window.location.search).get("erreur");
  return (
    <Cover>
      <div className="m text-go">POSTE DE NUIT · ACCÈS RÉSERVÉ AU GROUPE</div>
      <h1 className="x mt-5 text-[clamp(44px,9vw,84px)]">
        5 Nights
        <br />
        at EPITA
      </h1>
      <p className="mt-6 max-w-[44ch] text-dim">
        Le tableau des tâches, l'équipe et les échéances du projet, lus en direct dans GitLab.
      </p>
      {reason && (
        <div role="alert" className="mt-7">
          <div className="hazard" style={{ "--hc": "var(--alarm)" } as React.CSSProperties} aria-hidden="true" />
          <p className="mt-3 text-alarm">{REFUSALS[reason] ?? REFUSALS.connexion}</p>
        </div>
      )}
      <a className="btn mt-9" href={loginUrl()}>
        Se connecter avec le GitLab de l'école
      </a>
    </Cover>
  );
}

export function Splash({ title, note, onRetry }: { title: string; note?: string; onRetry?: () => void }) {
  return (
    <Cover>
      <h1 className="x text-[clamp(30px,5vw,48px)]">{title}</h1>
      {note && <p className="mt-5 text-dim">{note}</p>}
      {onRetry && (
        <button type="button" className="btn mt-8" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </Cover>
  );
}
