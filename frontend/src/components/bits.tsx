import type { CSSProperties, ReactNode } from "react";
import { useSearchParams } from "react-router";
import { hash } from "../lib/format";
import { useModel } from "../lib/model";
import type { Issue } from "../lib/types";

/** Teinte pastel stable pour chaque membre. */
export const agentColor = (username: string) => `hsl(${hash(username) % 360} 70% 80%)`;

/** Pastille ronde à l'initiale d'un membre. */
export function Agent({ username, size = 28 }: { username: string; size?: number }) {
  const name = useModel().first(username);
  const style = { "--s": `${size}px`, "--ac": agentColor(username) } as CSSProperties;
  return (
    <span className="av" role="img" aria-label={name} title={name} style={style}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Domaine : un point de couleur, toujours suivi de son nom. */
export function Domain({ name }: { name: string }) {
  const color = useModel().domainColor(name);
  return (
    <span className="domain">
      <i className="dot" aria-hidden="true" style={{ "--c": color } as CSSProperties} />
      {name}
    </span>
  );
}

export function Pill({ children, color = "var(--muted)", solid = false }: { children: ReactNode; color?: string; solid?: boolean }) {
  return (
    <span className="pill" data-solid={solid} style={{ "--pc": color } as CSSProperties}>
      {children}
    </span>
  );
}

export function Tile({
  title,
  meta,
  children,
  className = "",
  hero = false,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  hero?: boolean;
}) {
  return (
    <section className={`tile ${hero ? "tile-hero" : ""} ${className}`}>
      {title !== undefined && (
        <header className="tile-h">
          <h2>{title}</h2>
          {meta !== undefined && <span className="meta">{meta}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Deux anneaux concentriques : le temps écoulé (extérieur) et les tâches rendues (intérieur). */
export function Rings({
  time,
  done,
  doing = 0,
  size = 200,
  label,
}: {
  time: number;
  done: number;
  doing?: number;
  size?: number;
  label: string;
}) {
  const stroke = size * 0.088;
  const c = size / 2;
  const outer = c - stroke / 2 - 1;
  const inner = outer - stroke * 1.3;
  const arc = (r: number, share: number) => {
    const length = 2 * Math.PI * r;
    return `${Math.max(0.001, Math.min(1, share)) * length} ${length}`;
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="flex-none">
      <circle className="ring-track" cx={c} cy={c} r={outer} strokeWidth={stroke} />
      <circle
        className="ring-arc"
        cx={c}
        cy={c}
        r={outer}
        strokeWidth={stroke}
        stroke="var(--fg)"
        strokeDasharray={arc(outer, time)}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <circle className="ring-track" cx={c} cy={c} r={inner} strokeWidth={stroke} />
      {doing > 0 && (
        <circle
          className="ring-arc"
          cx={c}
          cy={c}
          r={inner}
          strokeWidth={stroke}
          stroke="var(--lime)"
          strokeOpacity="0.3"
          strokeDasharray={arc(inner, done + doing)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      )}
      {done > 0 && (
        <circle
          className="ring-arc"
          cx={c}
          cy={c}
          r={inner}
          strokeWidth={stroke}
          stroke="var(--lime)"
          strokeDasharray={arc(inner, done)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      )}
    </svg>
  );
}

/** Petit anneau d'avancement, pour une ligne ou une tuile compacte. */
export function MiniRing({ done, total, size = 34, color = "var(--lime)" }: { done: number; total: number; size?: number; color?: string }) {
  const stroke = size * 0.14;
  const c = size / 2;
  const r = c - stroke / 2;
  const length = 2 * Math.PI * r;
  const share = total > 0 ? done / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} sur ${total}`} className="flex-none">
      <circle className="ring-track" cx={c} cy={c} r={r} strokeWidth={stroke} />
      {share > 0 && (
        <circle
          className="ring-arc"
          cx={c}
          cy={c}
          r={r}
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={`${share * length} ${length}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      )}
    </svg>
  );
}

/** Barre d'avancement : rendues, plus les en cours en plus clair. */
export function Bar({ done, doing = 0, total, color = "var(--lime)" }: { done: number; doing?: number; total: number; color?: string }) {
  if (total === 0) return <div className="bar" />;
  return (
    <div className="bar" role="img" aria-label={`${done} sur ${total}`}>
      {doing > 0 && <i style={{ width: `${((done + doing) / total) * 100}%`, background: color, opacity: 0.3 }} />}
      <i style={{ width: `${(done / total) * 100}%`, background: color }} />
    </div>
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
      <span aria-hidden="true" className="ml-1 text-faint">
        ↗
      </span>
    </a>
  );
}

/** En-tête d'écran. */
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pt-2 pb-1">
      <h1 className="title text-[clamp(30px,4vw,44px)]">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2 pb-1 text-muted">{children}</div>}
    </header>
  );
}
