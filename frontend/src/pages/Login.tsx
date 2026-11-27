import type { ReactNode } from "react";
import { InkFilter, Stamp } from "../components/bits";

function Cover({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-5">
      <InkFilter />
      <main className="sheet w-full max-w-[560px] p-8 md:p-12" style={{ minHeight: 0 }}>
        {children}
      </main>
    </div>
  );
}

const REFUSALS: Record<string, string> = {
  "non-membre": "Ce compte GitLab n'est pas membre du projet du jeu. Le carnet est réservé au groupe.",
  echec: "La connexion avec GitLab n'a pas abouti. Réessaie ; si ça recommence, préviens Arthur.",
};

export function Login() {
  const reason = new URLSearchParams(window.location.search).get("erreur");
  return (
    <Cover>
      <div className="label">Carnet de bord</div>
      <h1 className="display mt-3 text-[56px] md:text-[72px]">
        <span className="ruler">5 Nights</span> at EPITA
      </h1>
      <p className="mt-6 text-soft">
        Le tableau des tâches, l'équipe et les échéances du projet, lus en direct dans GitLab.
      </p>
      {reason && (
        <p role="alert" className="hand hand-pen mt-6 text-[1.5rem] leading-tight">
          {REFUSALS[reason] ?? REFUSALS.echec}
        </p>
      )}
      <div className="mt-9 flex flex-wrap items-center gap-6">
        <a className="btn" href="/auth/login">
          Se connecter avec le GitLab de l'école
        </a>
        <Stamp color="var(--pen)" tilt={-7}>
          réservé au groupe
        </Stamp>
      </div>
    </Cover>
  );
}

export function Splash({ title, note, onRetry }: { title: string; note?: string; onRetry?: () => void }) {
  return (
    <Cover>
      <h1 className="display text-[44px]">{title}</h1>
      {note && <p className="mt-4 text-soft">{note}</p>}
      {onRetry && (
        <button type="button" className="btn mt-7" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </Cover>
  );
}
