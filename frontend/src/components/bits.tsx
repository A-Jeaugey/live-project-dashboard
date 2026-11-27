import { useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { hash } from "../lib/format";
import { useModel } from "../lib/model";
import type { Issue } from "../lib/types";

/** Photo d'identité : l'avatar GitLab, ou l'initiale si l'image ne se charge pas. */
export function Photo({ username, size = 34 }: { username: string; size?: number }) {
  const member = useModel().member(username);
  const [broken, setBroken] = useState(false);
  const h = hash(username);
  const name = member?.first_name ?? username;
  const style = {
    "--s": `${size}px`,
    "--tint": `hsl(${h % 360} 36% 80%)`,
    "--tilt": `${(h % 7) - 3}deg`,
  } as CSSProperties;

  return (
    <span className="photo" role="img" aria-label={name} title={name} style={style}>
      {member?.avatar_url && !broken ? (
        <img src={member.avatar_url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

/** Gommette de domaine : la couleur n'est jamais seule, le nom est toujours écrit. */
export function Gommette({ name }: { name: string }) {
  const color = useModel().domainColor(name);
  return (
    <span className="gommette">
      <i aria-hidden="true" style={{ "--c": color } as CSSProperties} />
      {name}
    </span>
  );
}

/** Entoure son contenu d'un cercle tracé à la main. */
export function Circled({ children }: { children: ReactNode }) {
  return (
    <span className="circled">
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M24 60C8 30 58 5 112 7c50 2 82 23 77 50-5 29-56 41-106 36C40 89 6 73 15 44 20 28 42 16 70 12" />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

export function Stamp({ children, color, tilt = -5 }: { children: ReactNode; color: string; tilt?: number }) {
  return (
    <span className="stamp" style={{ color, "--r": `${tilt}deg` } as CSSProperties}>
      {children}
    </span>
  );
}

/** Filtre SVG partagé qui donne aux tampons leur encre irrégulière. */
export function InkFilter() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <filter id="rough">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.7" />
      </filter>
    </svg>
  );
}

/** Avancement en cases : cochées, en cours, vides. Au-delà de 36 tâches, une barre. */
export function Ticks({ done, doing = 0, total }: { done: number; doing?: number; total: number }) {
  const label = `${done} sur ${total}`;
  if (total === 0) return null;
  if (total > 36) {
    return (
      <span
        role="img"
        aria-label={label}
        className="inline-block h-[15px] w-40 border-[1.5px] border-ink align-middle"
        style={{
          background: `linear-gradient(90deg, var(--biro) ${(done / total) * 100}%, var(--ink-faint) 0 ${((done + doing) / total) * 100}%, transparent 0)`,
        }}
      />
    );
  }
  return (
    <span className="ticks" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="tick" data-state={i < done ? "done" : i < done + doing ? "doing" : "todo"} />
      ))}
    </span>
  );
}

/** Ouvre le détail d'une tâche en gardant l'écran courant (paramètre d'URL `t`). */
export function useOpenIssue() {
  const [, setParams] = useSearchParams();
  return (iid: number | null) =>
    setParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (iid === null) next.delete("t");
        else next.set("t", String(iid));
        return next;
      },
      { preventScrollReset: true },
    );
}

/** « #14 Titre » cliquable, qui ouvre le détail. */
export function IssueLink({ issue, className = "" }: { issue: Issue; className?: string }) {
  const open = useOpenIssue();
  return (
    <button type="button" onClick={() => open(issue.iid)} className={`title-link ${className}`}>
      <span className="ref">#{issue.iid}</span>
      {issue.title}
    </button>
  );
}

/** Titre qui ouvre GitLab dans un nouvel onglet (merge request, commit, jalon). */
export function OutLink({
  href,
  refText,
  children,
  className = "",
}: {
  href: string | null | undefined;
  refText?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href ?? undefined} target="_blank" rel="noreferrer" className={`title-link ${className}`}>
      {refText && <span className="ref">{refText}</span>}
      {children}
      <span aria-hidden="true" className="mono ml-1 text-faint">
        ↗
      </span>
    </a>
  );
}

export function Section({
  numeral,
  title,
  aside,
  children,
}: {
  numeral?: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {numeral && <span className="display text-[26px] italic text-pen">{numeral}.</span>}
        <h2 className="display text-[30px]">{title}</h2>
        {aside && <span className="mono ml-auto text-faint">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <h1 className="display text-[52px] md:text-[64px]">
        <span className="ruler">{title}</span>
      </h1>
      {children && <div className="pb-2 text-soft">{children}</div>}
    </header>
  );
}
