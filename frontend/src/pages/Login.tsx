import type { ReactNode } from "react";

function Cover({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <main className="tile w-full max-w-[520px] p-8 md:p-10">{children}</main>
    </div>
  );
}

const REFUSALS: Record<string, string> = {
  non_membre: "Ce compte GitLab n'est pas membre du projet du jeu. L'accès est réservé au groupe.",
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
      <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-lime text-[20px] font-bold text-[#141517]">5</span>
      <h1 className="title mt-6 text-[34px]">5 Nights at EPITA</h1>
      <p className="mt-2 text-muted">Les tâches, l'équipe et les échéances du projet, lues en direct dans GitLab.</p>
      {reason && (
        <p role="alert" className="mt-6 rounded-2xl bg-red/15 px-4 py-3 text-[13.5px] text-red">
          {REFUSALS[reason] ?? REFUSALS.connexion}
        </p>
      )}
      <a className="btn mt-8 w-full" href={loginUrl()}>
        Se connecter avec le GitLab de l'école
      </a>
      <p className="mt-4 text-center text-[12.5px] text-faint">Réservé aux membres du projet.</p>
    </Cover>
  );
}

export function Splash({ title, note, onRetry }: { title: string; note?: string; onRetry?: () => void }) {
  return (
    <Cover>
      <h1 className="title text-[26px]">{title}</h1>
      {note && <p className="mt-3 text-muted">{note}</p>}
      {onRetry && (
        <button type="button" className="btn mt-7" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </Cover>
  );
}
