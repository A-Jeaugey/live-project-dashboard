import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { agoPrecise, clockSeconds, numericDay } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel, useNow } from "../lib/model";
import { activityVerb, COLUMN_NAMES } from "../lib/voice";
import { Agent } from "./bits";

const NAV = [
  { to: "/", label: "Poste", n: "01" },
  { to: "/tableau", label: "Tableau", n: "02" },
  { to: "/equipe", label: "Équipe", n: "03" },
  { to: "/echeances", label: "Échéances", n: "04" },
  { to: "/projet", label: "Projet", n: "05" },
];

function Clock() {
  const now = useNow(1000);
  return (
    <span className="m hidden text-dim xl:inline">
      {numericDay(now).replace(".", "").toUpperCase()} <span className="text-fg">{clockSeconds(now)}</span>
    </span>
  );
}

function Sync() {
  const { snap } = useModel();
  const { connected } = useLive();
  const now = useNow(5000);
  const { ok, last_success_at, last_error } = snap.sync;
  const healthy = ok && connected;
  const when = last_success_at ? agoPrecise(last_success_at, now).replace("il y a ", "") : "jamais";

  return (
    <span
      className="m flex items-center gap-2 text-dim"
      title={last_error ?? (connected ? "Mises à jour en direct" : "Flux en direct interrompu, nouvelle tentative en cours")}
    >
      <span
        className="led"
        data-live={healthy}
        style={{ "--c": healthy ? "var(--go)" : "var(--alarm)" } as React.CSSProperties}
      />
      <span className={ok ? "" : "text-alarm"}>{ok ? "GITLAB" : "GITLAB MUET"}</span>
      <span className="hidden whitespace-nowrap lg:inline">{when.toUpperCase()}</span>
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
      className="pointer-events-none fixed bottom-[72px] left-4 z-30 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 md:bottom-6 md:left-6"
    >
      {news.map((note) => (
        <div key={note.id} className="brk note-in pointer-events-auto border border-line2 bg-raised px-4 py-3">
          <div className="m mb-1 text-go">EN DIRECT</div>
          {note.kind === "activity" ? (
            <>
              <strong className="font-semibold">{m.who(note.activity)}</strong> {activityVerb(note.activity)}{" "}
              {note.activity.target?.iid != null && (
                <span className="m text-faint">
                  {note.activity.target.type === "merge_request" ? "!" : "#"}
                  {note.activity.target.iid}{" "}
                </span>
              )}
              {note.activity.target?.title}
            </>
          ) : (
            <>
              {note.by && (
                <>
                  <strong className="font-semibold">{m.first(note.by)}</strong> a pris{" "}
                </>
              )}
              <span className="m text-faint">#{note.iid}</span> {note.title}
              {!note.by && <> passe dans « {COLUMN_NAMES[note.column]} »</>}
            </>
          )}
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
    <div className="pb-24 md:pb-16">
      <header className="sysbar">
        <div className="wrap flex items-center gap-x-5 lg:gap-x-8">
          <Link to="/" className="flex items-baseline gap-3 py-3 text-fg hover:no-underline">
            <span className="x text-[20px]">
              5N<span className="text-go">@</span>E
            </span>
            <span className="c hidden text-dim lg:inline">Poste de nuit</span>
          </Link>

          <nav aria-label="Navigation principale" className="hidden items-center gap-4 md:flex lg:gap-6">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className="nav-item">
                <span className="m hidden lg:inline">{item.n}</span>
                <span className="c">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4 whitespace-nowrap lg:gap-5">
            <Clock />
            <Sync />
            <span className="flex items-center gap-2.5">
              <Agent username={me.username} size={26} />
              <button type="button" className="quiet" onClick={() => void logout()}>
                sortir
              </button>
            </span>
          </div>
        </div>
      </header>

      <main className="wrap">{children}</main>

      <LiveNotes />

      <nav aria-label="Navigation principale" className="bottom-nav md:hidden">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"}>
            <span className="m">{item.n}</span>
            <span className="c text-[11.5px]">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
