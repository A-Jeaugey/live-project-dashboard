# Tableau de bord — 5 Nights at EPITA

Outil interne du groupe : un **dashboard web** et un **bot Discord** qui donnent une vue commune et vivante du
projet *5 Nights at EPITA* (jeu d'horreur 3D en Python / Panda3D, projet annuel de 1re année à EPITA Lyon), et qui
permettent d'agir sur les tâches depuis le navigateur ou depuis Discord.

Les tâches vivent dans GitLab (`arthur.jeaugey/5-nights-at-epita` sur `https://gitlab.cri.epita.fr/`). Cet outil ne
garde jamais sa propre version des tâches : il lit et écrit dans GitLab.

## État

**Cadrage — 27 novembre 2026.** La proposition (parcours, écrans, stack, architecture, authentification) attend la
validation du groupe. Il n'y a pas encore de code applicatif. Le détail est dans
[`docs/ETAT_ACTUEL.md`](docs/ETAT_ACTUEL.md).

## Documentation

| Fichier | Contenu |
|---|---|
| [`docs/ETAT_ACTUEL.md`](docs/ETAT_ACTUEL.md) | Où on en est, ce qui attend une réponse, prochaine étape |
| [`docs/UX.md`](docs/UX.md) | Parcours, écrans, partage dashboard / Discord, raccourcis |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, composants, flux de données, authentification, hébergement, contraintes de l'instance GitLab |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Décisions et leur statut |
| [`AGENTS.md`](AGENTS.md) | Règles pour les IA qui travaillent sur ce repo |
| [`docs/ai/AI_LOG.md`](docs/ai/AI_LOG.md) | Registre de l'usage de l'IA |
| [`docs/ai/journal/`](docs/ai/journal/) | Un journal par session d'IA |

`docs/DISCORD_SETUP.md` (création des salons, permissions du bot, notifications natives de GitLab) sera rédigé en
phase 1.

## Installation

Pas encore disponible. Cible de la phase 1, sur le serveur :

1. copier `.env.example` vers `.env` et le remplir ;
2. lancer `docker compose up -d`.

## Principes

1. GitLab est la seule source de vérité des tâches.
2. Les secrets restent côté serveur, dans un `.env` ignoré par Git.
3. L'URL de l'instance GitLab est configurable.
4. Mise à jour en temps réel par webhooks, avec interrogation périodique en secours.
5. Accès réservé aux membres du projet GitLab du jeu.

## Phases

1. **Lecture seule** : tableau, équipe, comptes à rebours, temps réel, `docs/DISCORD_SETUP.md`.
2. **Actions** : prendre une tâche, créer une idée, changer de colonne, depuis le dashboard puis depuis le bot.
3. **Automatisations et transparence IA** : récap hebdomadaire, rappels, vue « Transparence IA ».
