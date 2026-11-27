# Registre de l'usage de l'IA

Une ligne par session d'IA, la plus récente en bas. Mêmes colonnes que le registre du repo du jeu.

Niveaux : **N1** conseil · **N2** co-écriture · **N3** génération relue · **N4** génération d'asset.

| Date | Humain | IA / outil | Niveau | Fichiers ou assets | Ce que l'IA a fait | Ce que l'humain a vérifié ou modifié | Journal |
|---|---|---|---|---|---|---|---|
| 2026-11-27 | Arthur | Claude Code | N3 | `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`, `docs/UX.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ETAT_ACTUEL.md` | Vérification en lecture de l'instance GitLab ; proposition des parcours, des écrans, de la stack, de l'architecture et de l'authentification ; maquette des écrans ; rédaction de la documentation initiale | À compléter après relecture par le groupe | [2026-11-27-cadrage](journal/2026-11-27-cadrage.md) |
| 2026-11-27 | Arthur | Claude Code | N3 | `frontend/`, `app/`, `tests/`, `dev/`, `config/`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `Makefile`, `docs/DISCORD_SETUP.md`, `docs/apercu/` | Phase 1 en lecture seule : interface « le carnet », serveur (lecture de GitLab, connexion, webhooks, temps réel), déploiement Docker, tests, documentation d'installation | Arthur a choisi la stack, la connexion et l'exposition, et rejeté la première maquette ; relecture du code par le groupe à faire | [2026-11-27-phase-1](journal/2026-11-27-phase-1.md) |
| 2026-11-27 | Arthur | Claude Code | N3 | `frontend/src/` (styles, composants, pages), `docs/UX.md`, `docs/DECISIONS.md`, `docs/apercu/` | Recherche de références visuelles ; refonte complète de l'interface en « poste de nuit » (plan de l'étage, nouveau système graphique) | Arthur a rejeté la direction précédente et demandé la refonte ; il n'a pas encore validé la nouvelle | [2026-11-27-refonte-visuelle](journal/2026-11-27-refonte-visuelle.md) |
