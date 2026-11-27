import type { CSSProperties, ReactNode } from "react";
import { useSearchParams } from "react-router";
import { hash } from "../lib/format";
import { useModel } from "../lib/model";
import type { Issue } from "../lib/types";

/** Teinte stable d'un membre, lisible sur fond noir. */
export const agentColor = (username: string) => `hsl(${hash(username) % 360} 85% 72%)`;

/**
 * Jeton d'un membre : son initiale dans un cercle à sa couleur, comme sur le plan.
 * Pas de photo : les avatars de l'école ne se chargent pas hors de son réseau, et des jetons
 * identiques partout se lisent mieux que des vignettes.
 */
export function Agent({ username, size = 28 }: { username: string; size?: number }) {
  const name = useModel().first(username);
  const style = { "--s": `${size}px`, "--ac": agentColor(username) } as CSSProperties;
  return (
    <span className="agent" role="img" aria-label={name} title={name} style={style}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Domaine : la couleur n'est jamais seule, le nom est toujours écrit. */
export function Domain({ name }: { name: string }) {
  const color = useModel().domainColor(name);
  return (
    <span className="domain">
      <i aria-hidden="true" style={{ "--c": color } as CSSProperties} />
      {name}
    </span>
  );
}

export function Tag({
  children,
  color = "var(--dim)",
  solid = false,
}: {
  children: ReactNode;
  color?: string;
  solid?: boolean;
}) {
  return (
    <span className="tag" data-solid={solid} style={{ color: solid ? undefined : color, "--tc": color } as CSSProperties}>
      {children}
    </span>
  );
}

/** Avancement en segments : faits, en cours (hachurés), restants. Au-delà de 40, la barre se tasse. */
export function Segments({ done, doing = 0, total }: { done: number; doing?: number; total: number }) {
  if (total === 0) return null;
  const shown = Math.min(total, 40);
  const scale = shown / total;
  const d = Math.round(done * scale);
  const g = Math.round(doing * scale);
  return (
    <span className="segs" role="img" aria-label={`${done} sur ${total}`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="seg" data-state={i < d ? "done" : i < d + g ? "doing" : "todo"} />
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
      <span aria-hidden="true" className="m ml-1 text-faint">
        ↗
      </span>
    </a>
  );
}

/** Panneau numéroté : « 01 TITRE ········ méta ». */
export function Pane({
  n,
  title,
  meta,
  children,
  className = "",
}: {
  n?: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <header className="pane-h">
        {n && <span className="m n">{n}</span>}
        <h2 className="c text-fg">{title}</h2>
        <span className="leader" aria-hidden="true" />
        {meta && <span className="m text-faint">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

/** En-tête d'écran : un mot énorme, et ce qu'il faut savoir à droite. */
export function PageHead({ title, kicker, children }: { title: string; kicker?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 border-b border-line2 pb-6">
      <div>
        {kicker && <div className="m mb-3 text-go">{kicker}</div>}
        <h1 className="x text-[clamp(44px,8vw,112px)]">{title}</h1>
      </div>
      {children && <div className="m pb-2 text-dim">{children}</div>}
    </header>
  );
}
