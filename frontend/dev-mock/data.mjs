// Données d'exemple pour `npm run dev:mock`. Rien ici n'est utilisé en production.
// Les dates sont calculées par rapport à maintenant pour que les délais restent vrais.

const H = 3600e3;
const D = 24 * H;

const MEMBERS = [
  ["arthur.jeaugey", "Arthur Jeaugey", "Arthur"],
  ["theo.wu", "Théo Wu", "Théo"],
  ["samuel.mopty", "Samuel Mopty", "Samuel"],
  ["louis.landanger", "Louis Landanger", "Louis"],
  ["eliott.damagnez", "Eliott Damagnez", "Eliott"],
].map(([username, name, first_name]) => ({
  username,
  name,
  first_name,
  avatar_url: null,
  web_url: `https://gitlab.example/${username}`,
  in_project: true,
}));

const DOMAINS = [
  { name: "gameplay", color: "#3b6fd4" },
  { name: "profs", color: "#d9482b" },
  { name: "3d", color: "#7c5cd6" },
  { name: "son", color: "#12957b" },
  { name: "code", color: "#5c9a2b" },
  { name: "ui", color: "#d99a12" },
  { name: "orga", color: "#6f7a8c" },
];

const CALENDAR = [
  ["groupes", "Constitution des groupes", "Groupes", "2026-10-19", null],
  ["cdst", "Remise du cahier des spécifications techniques", "Remise du CdST", "2026-12-07", 1],
  ["validation", "Validation du CdST", "Validation du CdST", "2026-12-14", 2],
  ["soutenance-1", "Première soutenance", "1re soutenance", "2027-01-04", 3],
  ["soutenance-2", "Deuxième soutenance", "2e soutenance", "2027-03-29", 4],
  ["finale", "Soutenance finale", "Soutenance finale", "2027-05-31", 5],
];

const MILESTONES = { cdst: 1, validation: 2, "soutenance-1": 3 };

// [iid, titre, colonne, domaines, assignés, échéance, auteur, modifiée (jours), fermée (jours), extras]
const ISSUES = [
  [3, "Choisir le moteur : Panda3D ou Ursina", "done", ["orga"], ["louis.landanger"], "cdst", "louis.landanger", 30, 30, {}],
  [5, "Lister les fonctionnalités pour le CdST", "done", ["orga"], ["eliott.damagnez"], "cdst", "arthur.jeaugey", 24, 24, {}],
  [8, "Plan de l'étage relevé et mis au propre", "done", ["3d"], ["samuel.mopty"], "soutenance-1", "samuel.mopty", 0.7, 0.7, {}],
  [9, "Modéliser le couloir principal de l'étage", "doing", ["3d"], ["samuel.mopty"], "soutenance-1", "samuel.mopty", 0.2, null, { mrs: [8], notes: 1 }],
  [11, "Prototype de la scène Panda3D", "done", ["code"], ["louis.landanger"], "soutenance-1", "louis.landanger", 2, 2, {}],
  [12, "Déplacements du joueur et collisions", "todo", ["gameplay"], [], "soutenance-1", "arthur.jeaugey", 6, null, {}],
  [14, "IA de poursuite : le prof suit le joueur dans les couloirs", "doing", ["profs"], ["theo.wu"], "soutenance-1", "theo.wu", 0.2, null, { mrs: [7], notes: 2, tasks: { done: 2, total: 3 } }],
  [17, "Menu principal et écran de pause", "doing", ["ui"], ["eliott.damagnez"], "soutenance-1", "eliott.damagnez", 16, null, { stale: 16 }],
  [18, "Bruits de pas selon la surface", "todo", ["son"], [], "soutenance-1", "samuel.mopty", 9, null, {}],
  [19, "Lampe torche avec batterie", "todo", ["gameplay"], [], "soutenance-1", "theo.wu", 8, null, {}],
  [20, "Plan du CdST validé en groupe", "done", ["orga"], ["arthur.jeaugey"], "cdst", "arthur.jeaugey", 4, 4, {}],
  [21, "Rédiger la section « Répartition des tâches » du CdST", "doing", ["orga"], ["arthur.jeaugey"], "cdst", "arthur.jeaugey", 1, null, {}],
  [22, "Relire et mettre en page le CdST", "todo", ["orga"], [], "cdst", "arthur.jeaugey", 4, null, {}],
  [23, "Un prof qui n'apparaît que si on regarde ailleurs", "idea", ["profs"], [], null, "theo.wu", 5, null, {}],
  [24, "Distributeur de café qui redonne de l'endurance", "idea", ["gameplay"], [], null, "louis.landanger", 3, null, {}],
  [25, "Mode photo pour la soutenance", "idea", ["ui"], [], null, "eliott.damagnez", 0.25, null, {}],
  [26, "Musique d'ambiance qui s'accélère pendant une poursuite", "idea", [], [], null, "samuel.mopty", 1.5, null, { flags: ["needs_triage"] }],
];

const DETAILS = {
  14: {
    description:
      "Le prof patrouille entre des points de passage. S'il voit le joueur, il le poursuit en suivant la grille des couloirs.\n\n- [x] Grille de navigation des couloirs\n- [x] Poursuite en ligne de vue\n- [ ] Retour à la patrouille quand le joueur est perdu\n\nVoir aussi `docs/profs.md` pour les vitesses.",
    notes: [
      ["louis.landanger", "Louis Landanger", "Je relis !7 ce soir. Le prof traverse encore la porte de la salle 204.", 5 * H],
      ["theo.wu", "Théo Wu", "Vu, la grille est mal alignée à cet endroit. Je corrige.", 4.5 * H],
    ],
  },
  9: {
    description: "Maillage du couloir principal d'après le plan relevé (#8), avec les portes et les casiers.",
    notes: [["arthur.jeaugey", "Arthur Jeaugey", "Pense aux néons, c'est ce qui fait l'ambiance.", 20 * H]],
  },
};

function parisToday(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(now));
  return Date.parse(`${parts}T00:00:00Z`);
}

export function buildMock({ empty = false, now = Date.now() } = {}) {
  const iso = (ago) => new Date(now - ago).toISOString();
  const today = parisToday(now);

  const issues = empty
    ? []
    : ISSUES.map(([iid, title, column, domains, assignees, deadline, author, updated, closed, x]) => ({
        iid,
        title,
        column,
        flags: x.flags ?? [],
        domains,
        assignees,
        author,
        milestone: deadline
          ? { id: MILESTONES[deadline], title: CALENDAR.find((c) => c[0] === deadline)[1], deadline_key: deadline }
          : null,
        created_at: iso((updated + 6) * D),
        updated_at: iso(updated * D),
        closed_at: closed === null ? null : iso(closed * D),
        last_activity_at: iso(updated * D),
        stale_days: x.stale ?? null,
        notes_count: x.notes ?? 0,
        tasks: x.tasks ?? null,
        merge_requests: x.mrs ?? [],
        web_url: `https://gitlab.example/jeu/-/issues/${iid}`,
      }));

  const deadlines = CALENDAR.map(([key, title, short_title, week_of, night]) => {
    const days_left = Math.round((Date.parse(`${week_of}T00:00:00Z`) - today) / D);
    const mine = issues.filter((i) => i.milestone?.deadline_key === key);
    const hasMilestone = !empty && key in MILESTONES;
    return {
      key,
      title,
      short_title,
      week_of,
      target_date: week_of,
      days_left,
      past: days_left < 0,
      night,
      milestone: hasMilestone
        ? {
            id: MILESTONES[key],
            title,
            web_url: `https://gitlab.example/jeu/-/milestones/${MILESTONES[key]}`,
            total: mine.length,
            closed: mine.filter((i) => i.column === "done").length,
            doing: mine.filter((i) => i.column === "doing").length,
            todo: mine.filter((i) => i.column === "todo").length,
          }
        : null,
    };
  });

  const merge_requests = empty
    ? []
    : [
        {
          iid: 7,
          title: "Poursuite : pathfinding sur la grille des couloirs",
          author: "theo.wu",
          reviewers: ["louis.landanger"],
          approved_by: [],
          draft: false,
          created_at: iso(3 * D + 2 * H),
          updated_at: iso(17 * H),
          waiting_review: true,
          waiting_hours: 74,
          overdue: true,
          closes: [14],
          source_branch: "feat/14-ia-de-poursuite",
          pipeline_status: null,
          web_url: "https://gitlab.example/jeu/-/merge_requests/7",
        },
        {
          iid: 8,
          title: "Couloir principal : maillage et textures",
          author: "samuel.mopty",
          reviewers: ["arthur.jeaugey"],
          approved_by: [],
          draft: false,
          created_at: iso(5 * H),
          updated_at: iso(5 * H),
          waiting_review: true,
          waiting_hours: 5,
          overdue: false,
          closes: [9],
          source_branch: "feat/9-couloir-principal",
          pipeline_status: null,
          web_url: "https://gitlab.example/jeu/-/merge_requests/8",
        },
      ];

  const act = (id, ago, actor, kind, type, iid, title, detail = null) => ({
    id: String(id),
    at: iso(ago),
    actor,
    actor_name: MEMBERS.find((m) => m.username === actor)?.name ?? null,
    kind,
    target: { type, iid, title, web_url: "https://gitlab.example/jeu" },
    detail,
  });

  const activity = empty
    ? []
    : [
        act(9, 5 * H, "samuel.mopty", "mr_opened", "merge_request", 8, "Couloir principal : maillage et textures"),
        act(8, 5.3 * H, "louis.landanger", "commented", "issue", 14, "IA de poursuite : le prof suit le joueur dans les couloirs"),
        act(7, 6 * H, "eliott.damagnez", "issue_opened", "issue", 25, "Mode photo pour la soutenance"),
        act(6, 15.5 * H, "samuel.mopty", "issue_closed", "issue", 8, "Plan de l'étage relevé et mis au propre"),
        act(5, 17 * H, "theo.wu", "pushed", "branch", null, "feat/14-ia-de-poursuite", "2 commits"),
        act(4, 1.5 * D, "samuel.mopty", "issue_opened", "issue", 26, "Musique d'ambiance qui s'accélère pendant une poursuite"),
        act(3, 2 * D, "louis.landanger", "mr_merged", "merge_request", 6, "Prototype de la scène Panda3D"),
        act(2, 3 * D + 2 * H, "theo.wu", "mr_opened", "merge_request", 7, "Poursuite : pathfinding sur la grille des couloirs"),
        act(1, 4 * D, "arthur.jeaugey", "issue_closed", "issue", 20, "Plan du CdST validé en groupe"),
      ];

  const snapshot = {
    version: 1,
    generated_at: iso(0),
    sync: { mode: "polling", ok: true, last_success_at: iso(12e3), last_error: null, last_webhook_at: null },
    project: {
      name: "5-nights-at-epita",
      path: "arthur.jeaugey/5-nights-at-epita",
      web_url: "https://gitlab.example/jeu",
      default_branch: "main",
    },
    settings: {
      done_window_days: 14,
      stale_days: 14,
      review_hours: 48,
      column_labels: { idea: "Idée", todo: "À faire", doing: "En cours" },
    },
    members: MEMBERS,
    domains: DOMAINS,
    setup: empty
      ? {
          missing_labels: ["Idée", "À faire", "En cours", ...DOMAINS.map((d) => d.name)],
          missing_milestones: CALENDAR.filter((c) => c[4]).map((c) => c[1]),
        }
      : { missing_labels: [], missing_milestones: ["Deuxième soutenance", "Soutenance finale"] },
    deadlines,
    issues,
    merge_requests,
    pipelines: [],
    playable: {
      rule: "pipeline",
      source: "commit",
      fallback_reason: "no_pipeline",
      sha: empty ? "92dc1b20c4a1" : "a3f9c2e81b7d",
      short_sha: empty ? "92dc1b20" : "a3f9c2e8",
      title: empty ? "Initial commit" : "Fusion de !6 : prototype de la scène Panda3D",
      author_name: empty ? "Arthur Jeaugey" : "Louis Landanger",
      committed_at: iso(empty ? 35 * D : 2 * D),
      tag: null,
      web_url: "https://gitlab.example/jeu/-/commit/a3f9c2e8",
    },
    attention: empty
      ? []
      : [
          { kind: "mr_waiting", mr: 7, hours: 74, author: "theo.wu", reviewers: ["louis.landanger"] },
          { kind: "issue_stale", issue: 17, days: 16, assignees: ["eliott.damagnez"] },
          { kind: "member_idle", member: "louis.landanger", available_todo: 4 },
          { kind: "needs_triage", issue: 26 },
        ],
    activity,
  };

  const { username, name, first_name, avatar_url } = MEMBERS[0];
  return { me: { username, name, first_name, avatar_url }, snapshot };
}

export function buildIssueDetail(iid, now = Date.now()) {
  const issue = buildMock({ now }).snapshot.issues.find((i) => i.iid === iid);
  if (!issue) return null;
  const extra = DETAILS[iid] ?? { description: "", notes: [] };
  return {
    ...issue,
    description: extra.description,
    notes: extra.notes.map(([author, author_name, body, ago], n) => ({
      id: iid * 100 + n,
      author,
      author_name,
      body,
      created_at: new Date(now - ago).toISOString(),
    })),
  };
}
