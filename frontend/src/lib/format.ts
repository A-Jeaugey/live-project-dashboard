// Dates et textes en français, toujours dans le fuseau du groupe.

const TZ = "Europe/Paris";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type When = string | number | Date;

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, ...options });

const longFmt = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortFmt = fmt({ weekday: "short", day: "numeric", month: "short" });
const dayMonthFmt = fmt({ day: "numeric", month: "long" });
const dayMonthShortFmt = fmt({ day: "numeric", month: "short" });
const monthFmt = fmt({ month: "long" });
const monthShortFmt = fmt({ month: "short" });
const weekdayShortFmt = fmt({ weekday: "short" });
const weekdayFmt = fmt({ weekday: "long" });
const clockFmt = fmt({ hour: "2-digit", minute: "2-digit" });
const secondsFmt = fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit" });
const numericDayFmt = fmt({ weekday: "short", day: "2-digit", month: "2-digit" });
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/** Un jour « AAAA-MM-JJ » devient midi UTC, pour ne jamais glisser d'un jour selon le fuseau. */
function toDate(when: When): Date {
  if (typeof when === "string" && /^\d{4}-\d{2}-\d{2}$/.test(when)) return new Date(`${when}T12:00:00Z`);
  return new Date(when);
}

const dayKey = (when: When) => keyFmt.format(toDate(when));

/** Nombre de jours de calendrier (à Paris) entre deux instants. */
export function dayDiff(from: When, to: When): number {
  return Math.round((Date.parse(`${dayKey(to)}T00:00:00Z`) - Date.parse(`${dayKey(from)}T00:00:00Z`)) / DAY);
}

export const longDate = (when: When) => longFmt.format(toDate(when));
export const shortDate = (when: When) => shortFmt.format(toDate(when));
export const dayMonth = (when: When) => dayMonthFmt.format(toDate(when));
export const monthName = (when: When) => monthFmt.format(toDate(when));
export const weekday = (when: When) => weekdayFmt.format(toDate(when));
export const monthShort = (when: When) => monthShortFmt.format(toDate(when));
export const weekdayShort = (when: When) => weekdayShortFmt.format(toDate(when));
export const dayNumber = (when: When) => Number(dayKey(when).slice(8));
export const clock = (when: When) => clockFmt.format(toDate(when));
/** « 14:02:11 », pour l'horloge du poste. */
export const clockSeconds = (when: When) => secondsFmt.format(toDate(when));
/** « ven. 27/11 ». */
export const numericDay = (when: When) => numericDayFmt.format(toDate(when));

export const plural = (n: number, one: string, many: string) => (Math.abs(n) > 1 ? many : one);

/** « il y a 5 min », « hier », « il y a 3 j », puis la date. */
export function ago(when: When, now: number): string {
  const then = toDate(when).getTime();
  const delta = Math.max(0, now - then);
  if (delta < 45_000) return "à l'instant";
  if (delta < HOUR) return `il y a ${Math.max(1, Math.round(delta / MIN))} min`;
  const days = dayDiff(then, now);
  if (days === 0 || delta < 12 * HOUR) return `il y a ${Math.round(delta / HOUR)} h`;
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  return shortDate(then);
}

/** Comme `ago`, à la seconde près, pour l'indicateur de synchronisation. */
export function agoPrecise(when: When, now: number): string {
  const delta = Math.max(0, now - toDate(when).getTime());
  if (delta < MIN) return `il y a ${Math.max(1, Math.round(delta / 1000))} s`;
  return ago(when, now);
}

/** Horodatage court pour la marge du journal : « 08:05 », « hier 21:10 », « 23 nov. ». */
export function stamp(when: When, now: number): string {
  const days = dayDiff(when, now);
  if (days === 0) return clock(when);
  if (days === 1) return `hier ${clock(when)}`;
  return dayMonthShortFmt.format(toDate(when));
}

/** Une attente en heures, dite simplement : « 5 h », « 3 j ». */
export function duration(hours: number): string {
  if (hours < 1) return "moins d'1 h";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.floor(hours / 24)} j`;
}

interface Countdownable {
  days_left: number;
  past: boolean;
  week_of: string;
  target_date: string;
}

/**
 * « J-10 » avant l'échéance. Les échéances sont données par semaine : une fois le lundi atteint,
 * on dit « cette semaine » plutôt qu'un faux « Jour J », sauf si la date exacte est connue.
 */
export function countdown(deadline: Countdownable): string {
  if (deadline.days_left > 0) return `J-${deadline.days_left}`;
  if (deadline.past) return "passée";
  if (deadline.days_left === 0 && deadline.target_date !== deadline.week_of) return "Jour J";
  return "cette semaine";
}

/** Liste en français : « Louis », « Louis et Théo », « Louis, Théo et Samuel ». */
export function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/** Morceau d'URL ou de nom de branche : minuscules, sans accents, tirets. */
export function slug(text: string, max = 36): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length <= max ? base : base.slice(0, max).replace(/-[^-]*$/, "");
}

/** Petit hachage stable, pour donner à chacun une teinte et une inclinaison de photo. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
