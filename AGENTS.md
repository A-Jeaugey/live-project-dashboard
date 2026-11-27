# Règles pour les IA — tableau de bord 5 Nights at EPITA

Outil interne du groupe : un dashboard web et un bot Discord branchés sur le projet GitLab du jeu
(`arthur.jeaugey/5-nights-at-epita`, instance `https://gitlab.cri.epita.fr/`). Ce repo n'est pas le repo du jeu.

## À lire avant de travailler

1. `docs/ETAT_ACTUEL.md` : où en est le projet, ce qui est validé, ce qui attend une réponse.
2. `docs/DECISIONS.md` : décisions prises et leur statut. Ne pas contredire une décision validée sans le signaler.
3. `docs/ARCHITECTURE.md` et `docs/UX.md` : comment c'est construit et pourquoi.

## Règles non négociables

- **GitLab est la seule source de vérité des tâches.** Aucune copie locale des tâches autre qu'un cache
  reconstruit depuis l'API. Toute action (prendre, créer, déplacer) s'écrit dans GitLab.
- **Les secrets restent côté serveur**, dans `.env` (ignoré par Git). Jamais dans le code, les logs, les tests,
  le frontend ou les messages de commit. Toute nouvelle variable est documentée dans `.env.example`.
- **L'URL de l'instance GitLab est configurable.** Ne jamais écrire `gitlab.cri.epita.fr` en dur dans le code.
- **Demander avant** toute décision structurante : stack, dépendance importante, modèle de données,
  authentification, hébergement. Proposer, expliquer, attendre la réponse.
- **Rester dans le périmètre** du cahier des charges et de la phase en cours. Une idée hors périmètre se propose,
  elle ne s'implémente pas d'office.
- **Aucune écriture sur le vrai projet GitLab pendant le développement ou les tests** sans accord explicite.
  Les tests utilisent des réponses simulées.

## Conventions

- Interface, documentation, messages de commit et messages d'erreur en français. Identifiants de code en anglais.
- Tout commit contenant du travail d'IA commence par `[IA]`.
- Chaque session d'IA laisse :
  - un journal dans `docs/ai/journal/AAAA-MM-JJ-sujet.md` ;
  - une ligne dans `docs/ai/AI_LOG.md` (colonnes imposées, voir l'en-tête du fichier) ;
  - `docs/ETAT_ACTUEL.md` à jour.
- Une décision structurante validée s'ajoute à `docs/DECISIONS.md`.
- La logique métier (colonnes, rappels, comptes à rebours, parseur d'`AI_LOG.md`, vérification des webhooks)
  est écrite en fonctions pures et testée.

## Commandes

| Commande | Effet |
|---|---|
| `make install` | Installe les dépendances Python (uv) et celles du frontend (npm) |
| `make dev-gitlab` | Faux GitLab de développement sur `127.0.0.1:8001` |
| `make dev-app` | Serveur sur `127.0.0.1:8000`, branché sur le faux GitLab (`dev/dev.env`) |
| `make dev-front` | Interface sur `127.0.0.1:5173`, qui relaie `/api`, `/auth` et `/hooks` vers le serveur |
| `make test` | Tests Python |
| `make lint` / `make format` | ruff : vérification / correction |
| `cd frontend && npm run build` | Vérifie les types puis compile l'interface |
| `cd frontend && npm run dev:mock` | Interface seule, avec des données d'exemple (`npm run dev:vide` pour un projet vide) |

Avant de dire qu'un changement fonctionne : `make test`, `make lint`, `npm run build`, et pour l'interface un
essai dans un navigateur (les trois serveurs de dev lancés).

## Repères

- `frontend/src/lib/types.ts` est le contrat entre le serveur et l'interface ; `app/core/models.py` en est le
  miroir. Les deux se modifient ensemble.
- Les classes CSS de l'interface vivent dans `@layer components` de `frontend/src/styles.css` : hors de cette couche,
  elles écraseraient les utilitaires Tailwind.
- Le serveur pose une politique de sécurité (CSP) qui interdit les scripts écrits dans la page : tout script passe
  par un fichier.
- Un seul serveur Vite à la fois par dossier (verrou de Vite).
