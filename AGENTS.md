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

À compléter quand la stack sera validée (lancement, tests, lint).
