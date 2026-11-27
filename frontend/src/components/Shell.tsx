import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { agoPrecise } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel, useNow } from "../lib/model";
import { activityVerb, COLUMN_NAMES } from "../lib/voice";
import { InkFilter, Photo } from "./bits";

const NAV = [
  { to: "/", label: "Aujourd'hui", short: "Jour", color: "#d9482b" },
  { to: "/tableau", label: "Tableau", short: "Tableau", color: "#d99a12" },
  { to: "/equipe", label: "Équipe", short: "Équipe", color: "#12957b" },
  { to: "/echeances", label: "Échéances", short: "Dates", color: "#3b6fd4" },
  { to: "/projet", label: "Projet", short: "Projet", color: "#7c5cd6" },
];

function SyncBadge() {
  const { snap } = useModel();
  const { connected } = useLive();
  const now = useNow(5000);
  const { ok, last_success_at, last_error } = snap.sync;
  const when = last_success_at ? agoPrecise(last_success_at, now) : "jamais";

  return (
    <span
      className="mono flex items-center gap-2 text-[12px] text-soft"
      title={last_error ?? (connected ? "Mises à jour en direct" : "Flux en direct interrompu, nouvelle tentative en cours")}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full"
        style={{ background: ok && connected ? "var(--ok)" : "var(--pen)" }}
      />
      {ok ? "GitLab à jour" : "GitLab ne répond pas"}
      <span className="hidden sm:inline">{ok ? `· ${when}` : `· dernière lecture ${when}`}</span>
    </span>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "jour");
  const other = theme === "nuit" ? "jour" : "nuit";
  return (
    <button
      type="button"
      className="quiet"
      onClick={() => {
        document.documentElement.dataset.theme = other;
        try {
          localStorage.setItem("theme", other);
        } catch {
          // préférence non mémorisée, sans gravité
        }
        setTheme(other);
      }}
    >
      <span className="hidden sm:inline">{other === "nuit" ? "passer au " : "revenir au "}</span>
      {other === "nuit" ? "tableau noir" : "papier"}
    </button>
  );
}

/** Petits mots glissés en bas de l'écran quand quelque chose se passe dans GitLab pendant qu'on regarde. */
function LiveNotes() {
  const { news } = useLive();
  const m = useModel();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-[72px] left-4 z-30 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 md:bottom-6 md:left-6"
    >
      {news.map((note, index) => (
        <div
          key={note.id}
          className="fiche note-in pointer-events-auto px-4 py-3 text-[14px]"
          style={{ transform: `rotate(${index % 2 === 0 ? -0.8 : 0.6}deg)` }}
        >
          {note.kind === "activity" ? (
            <>
              <strong className="font-semibold">{m.who(note.activity)}</strong> {activityVerb(note.activity)}{" "}
              {note.activity.target?.iid != null && (
                <span className="mono text-faint">
                  {note.activity.target.type === "merge_request" ? "!" : "#"}
                  {note.activity.target.iid}{" "}
                </span>
              )}
              {note.activity.target?.title}
            </>
          ) : (
            <>
              {note.by ? (
                <>
                  <strong className="font-semibold">{m.first(note.by)}</strong> a pris{" "}
                </>
              ) : null}
              <span className="mono text-faint">#{note.iid}</span> {note.title}
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
    <div className="pb-20 md:pb-10">
      <InkFilter />

      <header className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pt-5 pb-4">
        <Link to="/" className="flex items-baseline gap-3 text-ink no-underline hover:no-underline">
          <span className="display text-[28px] italic">5 Nights at EPITA</span>
          <span className="label hidden sm:inline">carnet de bord</span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <SyncBadge />
          <ThemeToggle />
          <span className="flex items-center gap-2">
            <Photo username={me.username} size={28} />
            <button type="button" className="quiet" onClick={() => void logout()}>
              sortir
            </button>
          </span>
        </div>
      </header>

      <nav aria-label="Navigation principale" className="wrap tabs hidden md:flex">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className="tab"
            style={{ "--c": item.color } as CSSProperties}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="wrap sheet">{children}</main>

      <LiveNotes />

      <nav aria-label="Navigation principale" className="bottom-nav md:hidden">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} style={{ "--c": item.color } as CSSProperties}>
            {item.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
