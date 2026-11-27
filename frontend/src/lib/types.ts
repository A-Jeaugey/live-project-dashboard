/**
 * Contrat entre le serveur (FastAPI) et l'interface.
 * Le serveur renvoie exactement ces formes ; ses modèles pydantic en sont le miroir.
 * Toute modification se fait des deux côtés dans le même commit.
 *
 * Routes :
 *   GET  /api/me            -> Me              (401 si non connecté)
 *   GET  /api/snapshot      -> Snapshot        (401 si non connecté)
 *   GET  /api/issues/{iid}  -> IssueDetail     (401, 404)
 *   GET  /api/stream        -> Server-Sent Events ; chaque message porte un StreamEvent en JSON
 *   GET  /auth/login        -> redirection vers GitLab
 *   GET  /auth/callback     -> retour de GitLab, pose la session, redirige vers /
 *   POST /auth/logout       -> 204
 *   POST /hooks/gitlab      -> webhooks GitLab (secret vérifié)
 *   GET  /healthz           -> { status: "ok" }
 *
 * Dates : chaînes ISO 8601 avec fuseau. Jours (`week_of`, `target_date`) : AAAA-MM-JJ.
 */

export type Username = string;

export interface Me {
  username: Username;
  name: string;
  first_name: string;
  avatar_url: string | null;
}

export interface Member {
  username: Username;
  name: string;
  /** Prénom d'usage, issu de la configuration. */
  first_name: string;
  avatar_url: string | null;
  web_url: string | null;
  /** Faux si la personne est dans la configuration mais plus membre du projet GitLab. */
  in_project: boolean;
}

export interface Domain {
  /** Nom du label GitLab, par exemple « gameplay ». */
  name: string;
  /** Couleur hexadécimale du label GitLab, ou celle de la configuration si le label n'existe pas. */
  color: string;
}

export type ColumnKey = "idea" | "todo" | "doing" | "done";

/**
 * needs_triage      : issue ouverte sans label de colonne (rangée dans « idea »)
 * multiple_columns  : plusieurs labels de colonne
 * doing_unassigned  : « En cours » sans personne assignée
 * todo_assigned     : « À faire » avec une personne assignée
 */
export type IssueFlag = "needs_triage" | "multiple_columns" | "doing_unassigned" | "todo_assigned";

export interface MilestoneRef {
  id: number;
  title: string;
  /** Clé de l'échéance du calendrier à laquelle ce jalon correspond, s'il y en a une. */
  deadline_key: string | null;
}

export interface Issue {
  iid: number;
  title: string;
  column: ColumnKey;
  flags: IssueFlag[];
  /** Labels de domaine portés par l'issue. */
  domains: string[];
  assignees: Username[];
  author: Username | null;
  milestone: MilestoneRef | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  /** Dernière activité : issue ou merge request liée, la plus récente des deux. */
  last_activity_at: string;
  /** Jours sans activité, seulement pour une issue « doing » qui dépasse le seuil ; sinon null. */
  stale_days: number | null;
  notes_count: number;
  /** Cases à cocher de la description. */
  tasks: { done: number; total: number } | null;
  /** iid des merge requests ouvertes qui ferment cette issue. */
  merge_requests: number[];
  web_url: string;
}

export interface Note {
  id: number;
  author: Username;
  author_name: string;
  /** Markdown. */
  body: string;
  created_at: string;
}

export interface IssueDetail extends Issue {
  /** Markdown, éventuellement vide. */
  description: string;
  /** Commentaires humains, du plus ancien au plus récent (notes système exclues). */
  notes: Note[];
}

export interface MergeRequest {
  iid: number;
  title: string;
  author: Username;
  reviewers: Username[];
  approved_by: Username[];
  draft: boolean;
  created_at: string;
  updated_at: string;
  /** Ouverte, pas en brouillon, sans approbation d'un autre membre que l'auteur. */
  waiting_review: boolean;
  /** Heures d'attente si waiting_review, sinon null. */
  waiting_hours: number | null;
  /** waiting_review et attente supérieure au seuil (48 h par défaut). */
  overdue: boolean;
  /** iid des issues que cette merge request ferme. */
  closes: number[];
  source_branch: string;
  pipeline_status: string | null;
  web_url: string;
}

export interface Deadline {
  key: string;
  title: string;
  short_title: string;
  /** Lundi de la semaine de l'échéance. */
  week_of: string;
  /** Date visée par le compte à rebours : week_of, ou la date exacte si elle est connue. */
  target_date: string;
  /** Jours restants, fuseau Europe/Paris. Négatif si passée. */
  days_left: number;
  past: boolean;
  /** Rang parmi les échéances à préparer (1 à 5), null pour celles hors compte. */
  night: number | null;
  milestone: {
    id: number;
    title: string;
    web_url: string;
    total: number;
    closed: number;
    doing: number;
    todo: number;
  } | null;
}

export interface Pipeline {
  id: number;
  status: string;
  ref: string;
  sha: string;
  created_at: string;
  web_url: string;
}

export interface Playable {
  /** Règle configurée. */
  rule: "pipeline" | "tag" | "commit";
  /** Ce qui est réellement affiché. « none » si le dépôt est vide. */
  source: "pipeline" | "tag" | "commit" | "none";
  /** Pourquoi source diffère de rule, sinon null. */
  fallback_reason: "no_pipeline" | "no_successful_pipeline" | "no_tag" | null;
  sha: string | null;
  short_sha: string | null;
  title: string | null;
  author_name: string | null;
  committed_at: string | null;
  tag: string | null;
  web_url: string | null;
}

export type Attention =
  | { kind: "mr_waiting"; mr: number; hours: number; author: Username; reviewers: Username[] }
  | { kind: "issue_stale"; issue: number; days: number; assignees: Username[] }
  | { kind: "member_idle"; member: Username; available_todo: number }
  | { kind: "needs_triage"; issue: number }
  | { kind: "inconsistent"; issue: number; flag: IssueFlag }
  | { kind: "pipeline_failed"; pipeline_id: number; ref: string; web_url: string };

export type ActivityKind =
  | "issue_opened"
  | "issue_closed"
  | "issue_reopened"
  | "mr_opened"
  | "mr_merged"
  | "mr_closed"
  | "mr_approved"
  | "commented"
  | "pushed"
  | "joined"
  | "other";

export interface Activity {
  id: string;
  at: string;
  actor: Username | null;
  actor_name: string | null;
  kind: ActivityKind;
  target: {
    type: "issue" | "merge_request" | "branch" | "project" | "milestone";
    iid: number | null;
    title: string | null;
    web_url: string | null;
  } | null;
  /** Précision libre, par exemple « 2 commits sur feat/14-poursuite ». */
  detail: string | null;
}

export interface SyncStatus {
  mode: "webhook" | "polling";
  ok: boolean;
  last_success_at: string | null;
  last_error: string | null;
  last_webhook_at: string | null;
}

export interface Snapshot {
  /** Augmente à chaque changement de contenu. */
  version: number;
  generated_at: string;
  sync: SyncStatus;
  project: { name: string; path: string; web_url: string; default_branch: string };
  settings: {
    done_window_days: number;
    stale_days: number;
    review_hours: number;
    /** Noms des labels de colonne dans GitLab. */
    column_labels: { idea: string; todo: string; doing: string };
  };
  members: Member[];
  domains: Domain[];
  /** Ce que l'organisation attend et que GitLab n'a pas encore. */
  setup: { missing_labels: string[]; missing_milestones: string[] };
  deadlines: Deadline[];
  /** Toutes les issues du projet, ouvertes et fermées. */
  issues: Issue[];
  /** Merge requests ouvertes. */
  merge_requests: MergeRequest[];
  /** Derniers pipelines de la branche par défaut, du plus récent au plus ancien. */
  pipelines: Pipeline[];
  playable: Playable;
  attention: Attention[];
  /** Événements récents, du plus récent au plus ancien. */
  activity: Activity[];
}

export interface StreamEvent {
  type: "hello" | "changed";
  version: number;
  /** Nouveaux événements depuis le message précédent, pour les notifications à l'écran. */
  activity: Activity[];
}
