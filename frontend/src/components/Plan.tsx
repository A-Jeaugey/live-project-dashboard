import { useNavigate } from "react-router";
import { countdown } from "../lib/format";
import { useLive } from "../lib/live";
import { useModel } from "../lib/model";
import { roomOf } from "../lib/rooms";
import type { Deadline, Issue } from "../lib/types";
import { agentColor, useOpenIssue } from "./bits";

/**
 * Le plan de l'étage, de nuit. C'est une lecture du projet, pas un décor :
 * - une salle par domaine, un repère par tâche (idée, à faire, en cours, faite) ;
 * - chaque membre est posé dans la salle de sa tâche en cours, ou dans le couloir s'il n'en a pas ;
 * - la prochaine échéance est un prof qui remonte le couloir : sa position est le temps écoulé ;
 * - la sortie de secours porte un verrou par tâche du jalon ; fermer une tâche en ouvre un.
 */

const W = 1040;
const H = 556;
const X0 = 14;
const X1 = W - 14;
const Y0 = 14;
const Y1 = H - 40;
const CY0 = 222; // couloir
const CY1 = 300;
const STAIRS_W = 132;
const DOOR = 46;
const CELL = 27;

interface Room {
  domain: string;
  x: number;
  y: number;
  w: number;
  h: number;
  top: boolean;
}

function layout(domains: string[]): Room[] {
  const upper = domains.slice(0, Math.ceil(domains.length / 2));
  const lower = domains.slice(upper.length);
  const rooms: Room[] = [];
  upper.forEach((domain, i) => {
    const w = (X1 - X0) / upper.length;
    rooms.push({ domain, x: X0 + i * w, y: Y0, w, h: CY0 - Y0, top: true });
  });
  lower.forEach((domain, i) => {
    const w = (X1 - X0 - STAIRS_W) / lower.length;
    rooms.push({ domain, x: X0 + STAIRS_W + i * w, y: CY1, w, h: Y1 - CY1, top: false });
  });
  return rooms;
}

/** Contour d'une salle avec une ouverture pour la porte, côté couloir. */
function roomPath(r: Room): string {
  const door = r.x + r.w / 2;
  const a = door - DOOR / 2;
  const b = door + DOOR / 2;
  return r.top
    ? `M${a},${r.y + r.h} H${r.x} V${r.y} H${r.x + r.w} V${r.y + r.h} H${b}`
    : `M${a},${r.y} H${r.x} V${r.y + r.h} H${r.x + r.w} V${r.y} H${b}`;
}

function Mark({ issue, x, y }: { issue: Issue; x: number; y: number }) {
  const open = useOpenIssue();
  const { fresh } = useLive();
  const label = `#${issue.iid} ${issue.title}`;
  const act = () => open(issue.iid);
  const stale = issue.stale_days !== null;

  let shape;
  if (issue.column === "idea") {
    shape = <circle cx={x} cy={y} r="6" fill="none" stroke="var(--dim)" strokeWidth="1.4" />;
  } else if (issue.column === "todo") {
    shape = <rect x={x - 7} y={y - 7} width="14" height="14" fill="none" stroke="var(--fg)" strokeWidth="1.7" />;
  } else if (issue.column === "doing") {
    const color = stale ? "var(--warn)" : "var(--go)";
    shape = (
      <>
        <rect className={stale ? "flicker" : "pulse"} x={x - 7} y={y - 7} width="14" height="14" fill={color} opacity="0.5" />
        <rect x={x - 7} y={y - 7} width="14" height="14" fill={color} />
      </>
    );
  } else {
    shape = <path d={`M${x - 7},${y} l4.6,5 l9,-10.6`} fill="none" stroke="var(--go-dim)" strokeWidth="2.2" />;
  }

  return (
    <g
      className="mark"
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        act();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          act();
        }
      }}
    >
      <title>{label}</title>
      <rect x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} fill="transparent" stroke="none" />
      {fresh.has(issue.iid) && (
        <circle className="pulse" cx={x} cy={y} r="12" fill="none" stroke="var(--go)" strokeWidth="2" />
      )}
      {shape}
    </g>
  );
}

function Token({
  username,
  x,
  y,
  me,
  idle,
  line,
  bare,
}: {
  username: string;
  x: number;
  y: number;
  me: boolean;
  idle?: boolean;
  /** Seconde ligne de la légende : la tâche en cours, ou « sans tâche ». */
  line: string;
  /** Jeton seul, sans légende, quand la place manque. */
  bare?: boolean;
}) {
  const m = useModel();
  const color = me ? "var(--alarm)" : idle ? "var(--warn)" : agentColor(username);
  const name = m.first(username);
  return (
    <g>
      <title>{`${name} · ${line}`}</title>
      {me && <circle className="pulse" cx={x} cy={y} r="15" fill="none" stroke="var(--alarm)" strokeWidth="2" />}
      <circle cx={x} cy={y} r="14" fill="var(--bg)" stroke={color} strokeWidth={me ? 2.4 : 1.7} />
      <text x={x} y={y + 5.4} textAnchor="middle" fill={color} style={{ fontStretch: "62%", fontWeight: 700, fontSize: 15.5 }}>
        {name.slice(0, 1).toUpperCase()}
      </text>
      {!bare && (
        <>
          <text x={x + 21} y={y - 2} fill={color} style={{ fontStretch: "62%", fontWeight: 700, fontSize: 13, letterSpacing: "0.1em" }}>
            {me ? "VOUS ÊTES ICI" : name.toUpperCase()}
          </text>
          <text className="mono" x={x + 21} y={y + 12} fill={idle ? "var(--warn)" : "var(--dim)"}>
            {line}
          </text>
        </>
      )}
    </g>
  );
}

const ORDER = { doing: 0, todo: 1, idea: 2, done: 3 } as const;

export function Plan({ next }: { next: Deadline | undefined }) {
  const m = useModel();
  const navigate = useNavigate();
  const { snap, me } = m;

  const domains = snap.domains.map((d) => d.name);
  const rooms = layout(domains);
  const visible = snap.issues.filter((i) => i.column !== "done" || m.isRecentlyDone(i));
  const untriaged = visible.filter((i) => i.domains.length === 0 || !domains.includes(i.domains[0]));

  // Où se trouve chacun : la salle de sa première tâche en cours, sinon le couloir.
  const whereabouts = new Map<string, string | null>();
  for (const member of snap.members) {
    const task = snap.issues.find((i) => i.column === "doing" && i.assignees.includes(member.username));
    whereabouts.set(member.username, task?.domains.find((d) => domains.includes(d)) ?? null);
  }
  const loose = snap.members.filter((mb) => whereabouts.get(mb.username) === null);
  const crowded = loose.length > 2;

  // Le prof : sa position dans le couloir est la part du temps déjà écoulée avant l'échéance.
  const previous = [...snap.deadlines]
    .filter((d) => next && d.target_date < next.target_date)
    .sort((a, b) => b.target_date.localeCompare(a.target_date))[0];
  const span = next
    ? Math.max(1, previous ? next.days_left - previous.days_left : Math.max(next.days_left, 30))
    : 1;
  const elapsed = next ? Math.min(1, Math.max(0, 1 - next.days_left / span)) : 0;
  const trackStart = X0 + STAIRS_W + 150;
  const trackEnd = X1 - 150;
  const profX = trackStart + elapsed * (trackEnd - trackStart);
  const cy = (CY0 + CY1) / 2;

  const locks = next?.milestone ? { total: next.milestone.total, open: next.milestone.closed } : null;
  const shownLocks = locks ? Math.min(locks.total, 9) : 0;

  const tickStep = span > 60 ? 30 : span > 28 ? 10 : span > 12 ? 7 : 2;
  const ticks: number[] = [];
  for (let d = tickStep; d < span && next; d += tickStep) ticks.push(d);

  return (
    <svg className="plan" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Plan de l'étage : une salle par domaine">
      <defs>
        <pattern id="dots" width="19" height="19" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="var(--line-2)" />
        </pattern>
        <linearGradient id="beam" x1="0" x2="1">
          <stop offset="0" stopColor="var(--alarm)" stopOpacity="0.34" />
          <stop offset="1" stopColor="var(--alarm)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="scan" x1="0" x2="1">
          <stop offset="0" stopColor="var(--go)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--go)" stopOpacity="0.07" />
        </linearGradient>
        <clipPath id="inside">
          <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} />
        </clipPath>
      </defs>

      <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} fill="url(#dots)" />
      <g clipPath="url(#inside)">
        <rect className="sweep" x="0" y={Y0} width="70" height={Y1 - Y0} fill="url(#scan)" />
      </g>

      {/* Salles */}
      {rooms.map((r) => {
        const issues = visible
          .filter((i) => (i.domains.find((d) => domains.includes(d)) ?? null) === r.domain)
          .sort((a, b) => ORDER[a.column] - ORDER[b.column] || a.iid - b.iid);
        const cols = Math.max(1, Math.floor((r.w - 36) / CELL));
        const shown = issues.slice(0, cols * 2);
        const stale = issues.some((i) => i.stale_days !== null);
        const people = snap.members.filter((mb) => whereabouts.get(mb.username) === r.domain);
        const open = issues.filter((i) => i.column !== "done").length;
        const go = () => navigate(`/tableau?dom=${encodeURIComponent(r.domain)}`);

        return (
          <g
            key={r.domain}
            className="room"
            role="link"
            tabIndex={0}
            aria-label={`${roomOf(r.domain)} : ${open} tâches ouvertes. Voir au tableau.`}
            onClick={go}
            onKeyDown={(event) => event.key === "Enter" && go()}
          >
            <rect className="floor" x={r.x} y={r.y} width={r.w} height={r.h} />
            {people.length > 0 && <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="var(--go)" opacity="0.045" />}
            <path className={`wall ${stale ? "flicker" : ""}`} d={roomPath(r)} stroke={stale ? "var(--warn)" : undefined} />
            {/* Battant de porte */}
            <path
              className="thin"
              d={
                r.top
                  ? `M${r.x + r.w / 2 - DOOR / 2},${r.y + r.h} v-${DOOR} a${DOOR},${DOOR} 0 0 1 ${DOOR},${DOOR}`
                  : `M${r.x + r.w / 2 - DOOR / 2},${r.y} v${DOOR} a${DOOR},${DOOR} 0 0 0 ${DOOR},-${DOOR}`
              }
              strokeDasharray="2 3"
            />
            <text className="room-name" x={r.x + 16} y={r.y + 31}>
              {roomOf(r.domain)}
            </text>
            <rect x={r.x + 16} y={r.y + 41} width="8" height="8" fill={m.domainColor(r.domain)} />
            <text className="mono" x={r.x + 30} y={r.y + 49}>
              {r.domain}
            </text>
            <text className="mono" x={r.x + r.w - 14} y={r.y + 30} textAnchor="end" fill={stale ? "var(--warn)" : undefined}>
              {stale ? "! " : ""}
              {String(open).padStart(2, "0")}
            </text>

            {shown.map((issue, i) => (
              <Mark
                key={issue.iid}
                issue={issue}
                x={r.x + 24 + (i % cols) * CELL}
                y={r.y + 82 + Math.floor(i / cols) * CELL}
              />
            ))}
            {issues.length > shown.length && (
              <text className="mono" x={r.x + r.w - 14} y={r.y + 82 + CELL + 4} textAnchor="end">
                +{issues.length - shown.length}
              </text>
            )}
            {issues.length === 0 && (
              <text className="mono" x={r.x + 16} y={r.y + 86}>
                vide
              </text>
            )}

            {people.map((mb, i) => {
              const task = issues.find((issue) => issue.column === "doing" && issue.assignees.includes(mb.username));
              return (
                <Token
                  key={mb.username}
                  username={mb.username}
                  x={r.x + 30 + (i % 2) * 124}
                  y={r.y + r.h - 30 - Math.floor(i / 2) * 36}
                  me={mb.username === me.username}
                  line={task ? `#${task.iid}${task.stale_days !== null ? ` · ${task.stale_days} j` : ""}` : ""}
                />
              );
            })}
          </g>
        );
      })}

      {/* Escalier : c'est par là que les profs arrivent, et là que traînent les tâches non triées. */}
      <g>
        <path className="wall" d={`M${X0 + STAIRS_W},${CY1 + DOOR + 14} V${Y1} H${X0} V${CY1} H${X0 + STAIRS_W}`} />
        {Array.from({ length: 7 }, (_, i) => (
          <path key={i} className="thin" d={`M${X0 + 16 + i * 14},${Y1 - 14} v-58`} />
        ))}
        <text className="room-name" x={X0 + 16} y={CY1 + 31}>
          Escalier
        </text>
        <text className="mono" x={X0 + 16} y={CY1 + 49} fill={untriaged.length ? "var(--warn)" : undefined}>
          {untriaged.length ? `${untriaged.length} à trier` : "rien à trier"}
        </text>
        {untriaged.slice(0, 4).map((issue, i) => (
          <Mark key={issue.iid} issue={issue} x={X0 + 24 + i * CELL} y={CY1 + 82} />
        ))}
      </g>

      {/* Couloir */}
      <path className="thin" d={`M${X0 + 20},${cy} H${X1 - 20}`} strokeDasharray="1 9" strokeLinecap="round" />
      {next &&
        ticks.map((d) => {
          const x = trackStart + (1 - d / span) * (trackEnd - trackStart);
          if (Math.abs(x - profX) < 46) return null; // le prof masque la graduation qu'il atteint
          return (
            <g key={d}>
              <path className="thin" d={`M${x},${CY0} v10`} />
              <text className="mono" x={x} y={CY0 + 23} textAnchor="middle">
                J-{d}
              </text>
            </g>
          );
        })}

      {loose.map((mb, i) => (
        <Token
          key={mb.username}
          username={mb.username}
          x={X0 + 34 + i * (crowded ? 34 : 118)}
          y={cy + 6}
          me={mb.username === me.username}
          idle
          line="sans tâche"
          bare={crowded}
        />
      ))}
      {loose.length > 0 && (
        <text className="mono" x={X0 + 16} y={CY0 + 17} fill="var(--warn)">
          COULOIR · {loose.length} SANS TÂCHE
        </text>
      )}

      {/* Le prof */}
      {next && (
        <g className="walk glow-alarm">
          <path d={`M${profX + 6},${cy} L${Math.min(profX + 230, X1 - 44)},${CY0 + 6} V${CY1 - 6} Z`} fill="url(#beam)" />
          <circle cx={profX} cy={cy - 17} r="8.5" fill="var(--alarm)" />
          <path d={`M${profX - 13},${cy + 22} v-14 a13,13 0 0 1 26,0 v14 Z`} fill="var(--alarm)" />
          <text
            x={profX - 22}
            y={cy - 3}
            textAnchor="end"
            fill="var(--alarm)"
            style={{ fontStretch: "62%", fontWeight: 700, fontSize: 17, letterSpacing: "0.1em" }}
          >
            {(next.short_title.length > 16 ? `${next.short_title.slice(0, 15)}…` : next.short_title).toUpperCase()}
          </text>
          <text className="mono" x={profX - 22} y={cy + 14} textAnchor="end" fill="var(--alarm)">
            {countdown(next)}
          </text>
        </g>
      )}

      {/* Sortie de secours et ses verrous */}
      <g className="glow-go">
        <rect x={X1 - 40} y={CY0 + 7} width="32" height={CY1 - CY0 - 14} fill="var(--go)" />
        <path
          d={`M${X1 - 33},${cy} h17 m-6,-6 l6,6 l-6,6`}
          fill="none"
          stroke="var(--bg)"
          strokeWidth="2.8"
          strokeLinecap="square"
        />
        <text
          x={X1 - 48}
          y={CY0 + 20}
          textAnchor="end"
          fill="var(--go)"
          style={{ fontStretch: "62%", fontWeight: 700, fontSize: 13, letterSpacing: "0.12em" }}
        >
          SORTIE{locks ? ` ${locks.open}/${locks.total}` : ""}
        </text>
        {Array.from({ length: shownLocks }, (_, i) => {
          const unlocked = locks !== null && i < Math.round((locks.open / locks.total) * shownLocks);
          return (
            <rect
              key={i}
              x={X1 - 56 - (shownLocks - 1 - i) * 12}
              y={CY1 - 27}
              width="8"
              height="16"
              fill={unlocked ? "var(--go)" : "none"}
              stroke={unlocked ? "var(--go)" : "var(--fg)"}
              strokeWidth="1.4"
            />
          );
        })}
      </g>

      {/* Murs extérieurs par-dessus tout, ouverts sur la sortie */}
      <path className="wall-out" d={`M${X1},${CY0} V${Y0} H${X0} V${Y1} H${X1} V${CY1}`} />

      {/* Cartouche */}
      <text className="mono" x={X0} y={H - 12}>
        PLAN DE L'ÉTAGE · {String(visible.length).padStart(2, "0")} REPÈRES · MIS À JOUR EN DIRECT
      </text>
      <g transform={`translate(${X1}, ${H - 12})`}>
        <text className="mono" textAnchor="end">
          <tspan fill="var(--go)">■</tspan> en cours <tspan dx="10" fill="var(--fg)">□</tspan> à faire{" "}
          <tspan dx="10">○</tspan> idée <tspan dx="10" fill="var(--go-dim)">✓</tspan> fait{" "}
          <tspan dx="10" fill="var(--alarm)">●</tspan> vous
        </text>
      </g>
    </svg>
  );
}
