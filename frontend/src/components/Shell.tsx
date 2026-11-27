import type { CSSProperties, ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { agoPrecise } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel, useNow } from "../lib/model";
import { activityVerb, COLUMN_NAMES } from "../lib/voice";
import { Agent } from "./bits";

const NAV = [
  { to: "/", label: "Aujourd'hui" },
  { to: "/tableau", label: "Tableau" },
  { to: "/equipe", label: "Équipe" },
  { to: "/echeances", label: "Échéances" },
  { to: "/projet", label: "Projet" },
];

function Sync() {
  const { snap } = useModel();
  const { connected } = useLive();
  const now = useNow(5000);
  const { ok, last_success_at, last_error } = snap.sync;
  const healthy = ok && connected;
  const when = last_success_at ? agoPrecise(last_success_at, now) : "jamais";

  return (
    <span
      className="capsule"
      title={last_error ?? (connected ? `Dernière lecture ${when}` : "Flux en direct interrompu, nouvelle tentative en cours")}
    >
      <span className="led" data-live={healthy} style={{ "--c": healthy ? "var(--green)" : "var(--red)" } as CSSProperties} />
      <span className="hidden sm:inline">{ok ? "GitLab à jour" : "GitLab ne répond pas"}</span>
    </span>
  );
}

/** Ce qui se passe dans GitLab pendant qu'on regarde, annoncé en bas de l'écran. */
function LiveNotes() {
  const { news } = useLive();
  const m = useModel();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-4 z-30 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 md:left-6"
    >
      {news.map((note) => (
        <div
          key={note.id}
          className="note-in pointer-events-auto flex items-start gap-3 rounded-2xl bg-tile3 px-4 py-3 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.6)]"
        >
          <span className="led mt-1.5" data-live="true" style={{ "--c": "var(--lime)" } as CSSProperties} />
          <span>
            {note.kind === "activity" ? (
              <>
                <strong className="font-semibold">{m.who(note.activity)}</strong>{" "}
                <span className="text-muted">{activityVerb(note.activity)}</span>{" "}
                {note.activity.target?.iid != null && (
                  <span className="ref mr-1">
                    {note.activity.target.type === "merge_request" ? "!" : "#"}
                    {note.activity.target.iid}
                  </span>
                )}
                {note.activity.target?.title}
              </>
            ) : (
              <>
                {note.by && (
                  <>
                    <strong className="font-semibold">{m.first(note.by)}</strong> <span className="text-muted">a pris</span>{" "}
                  </>
                )}
                <span className="ref mr-1">#{note.iid}</span>
                {note.title}
                {!note.by && <span className="text-muted"> passe dans « {COLUMN_NAMES[note.column]} »</span>}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

async function logout() {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  window.location.assign("/");
}

export function Shell({ children }: { children: ReactNode }) {
  const { me } = useModel();

  return (
    <div className="pb-16">
      <header className="wrap flex flex-wrap items-center gap-x-5 gap-y-3 pt-5 pb-5">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-[-0.02em] text-[15px]">
          <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-lime text-[13px] font-bold text-[#141517]">5</span>
          <span className="hidden sm:inline">5 Nights at EPITA</span>
        </Link>

        <nav aria-label="Navigation principale" className="seg order-3 w-full md:order-none md:w-auto">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Sync />
          <span className="capsule pr-1.5 pl-1.5">
            <Agent username={me.username} size={24} />
            <button type="button" className="quiet pr-2" onClick={() => void logout()}>
              Sortir
            </button>
          </span>
        </div>
      </header>

      <main className="wrap">{children}</main>

      <LiveNotes />
    </div>
  );
}
