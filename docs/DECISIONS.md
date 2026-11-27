# Décisions

Une ligne par décision structurante. Statuts : **Imposée** (vient du cahier des charges), **Proposée** (attend la
validation du groupe), **Validée**, **Abandonnée**. Une décision validée ne se modifie pas : on en ajoute une
nouvelle qui la remplace.

Dernière mise à jour : 27 novembre 2026, après les réponses d'Arthur.

« Validée » : réponse explicite d'Arthur. « Validée par défaut » : Arthur a dit de continuer avec la proposition,
sans se prononcer point par point. Les autres membres du groupe ne se sont pas encore exprimés.

| N° | Décision | Statut | Pourquoi | Alternatives écartées |
|---|---|---|---|---|
| D-001 | GitLab est la seule source de vérité des tâches ; l'outil ne garde qu'un cache reconstruit depuis l'API | Imposée | Dashboard, Discord et `glab` doivent toujours montrer la même chose | — |
| D-002 | Repo séparé de celui du jeu | Imposée | Outil interne, non évalué comme le jeu | — |
| D-003 | Un seul programme Python : serveur web (FastAPI), bot (`discord.py`) et automatisations dans le même processus | Validée par défaut | Cache et événements partagés sans service supplémentaire ; un seul conteneur à surveiller | Deux services reliés par Redis : plus de pièces pour cinq utilisateurs |
| D-004 | Client GitLab maison sur `httpx` | Validée par défaut | Asynchrone, peu de points d'API, simple à simuler en test | `python-gitlab` : plus lisible mais synchrone |
| D-005 | Frontend React + TypeScript + Vite + Tailwind | Validée | Glisser-déposer, mises à jour instantanées, palette de commandes | HTMX + gabarits serveur : tout en Python, mais interactions limitées |
| D-006 | Les webhooks sont des signaux : chaque changement est relu dans l'API ; interrogation périodique en secours et relecture complète toutes les 10 minutes | Validée par défaut | Le cache ne peut pas diverger de GitLab ; fonctionne même si l'école bloque les webhooks | Appliquer le contenu des webhooks au cache : risque de dérive |
| D-007 | Temps réel vers le navigateur par Server-Sent Events | Validée par défaut | Sens unique suffisant, reconnexion automatique | WebSocket : plus complexe sans bénéfice ici |
| D-008 | Connexion par OpenID Connect sur le GitLab de l'école (portée `openid` seule) + vérification de l'appartenance au projet du jeu | Validée | La liste des personnes autorisées est celle de GitLab ; aucun droit sur les dépôts des membres | Connexion Discord limitée à cinq comptes : gardée comme repli |
| D-009 | Toutes les écritures passent par le token de projet du serveur (rôle Reporter, portée `api`) | Validée | Un seul secret, limité au projet du jeu | Portée OAuth `api` par membre : historique plus fidèle, mais cinq tokens donnant accès à tous leurs dépôts |
| D-010 | SQLite pour l'état technique (liaisons Discord, rappels envoyés, messages Discord) ; aucune donnée de tâche | Validée par défaut | Un fichier, rien à administrer | PostgreSQL : disproportionné |
| D-011 | Automatisations par une boucle interne (une vérification par minute) et des fonctions pures | Validée par défaut | Testable sans horloge, reprise propre après redémarrage, aucune dépendance | APScheduler ou cron système |
| D-012 | Le bot publie lui-même toutes les notifications ; l'intégration native « Discord Notifications » de GitLab est documentée comme solution d'attente et de secours | Validée par défaut | Le bouton « Je prends » n'est possible que sur les messages du bot ; les mentions demandent la correspondance Discord ↔ GitLab ; pas de doublons | Intégration native seule : pas de boutons ni de mentions |
| D-013 | Règles de colonnes : fermée > `En cours` > `À faire` > `Idée` > « à trier » ; incohérences signalées, jamais corrigées en silence | Validée par défaut | Comportement prévisible et testable | Colonne supplémentaire « À trier » |
| D-014 | Hébergement Docker Compose ; exposition par **tunnel Cloudflare** (aucun port ouvert à la maison) | Validée | Choix d'Arthur ; l'adresse IP de la maison reste cachée | Caddy avec ports 80 et 443 ouverts ; reverse proxy existant |
| D-015 | Salon `#builds` créé seulement quand une CI existera ; d'ici là, les échecs de pipeline iraient dans `#code` | Validée par défaut | Le projet n'a aucun pipeline : le salon resterait vide | Créer les quatre salons tout de suite |
| D-016 | Ajouts hors cahier des charges : vue « Point hebdo », boutons « Copier le compte rendu / le bilan », nom de branche à copier, attribution d'une tâche à quelqu'un d'autre pendant le point hebdo, installation sur téléphone | Validée | Servent directement les parcours demandés (voir `docs/UX.md`) | S'en tenir strictement aux sections 4 et 5 |
| D-018 | Les cinq échéances à préparer sont numérotées « nuit 1 » à « nuit 5 » dans l'interface | Proposée | Clin d'œil au titre du jeu ; le nom complet reste affiché | Noms complets seuls |
| D-017 | Direction visuelle « le carnet » (copie d'élève annotée au stylo rouge) | Abandonnée | Construite, puis rejetée par Arthur : encore trop générique | — |
| D-019 | Système graphique sombre : noir, traits fins, trois couleurs porteuses de sens, Archivo du très large au très étroit, JetBrains Mono (voir `docs/UX.md` §8) | Proposée ; Arthur n'a critiqué que le plan (D-020) | Lisible, sans métaphore à déchiffrer | Les directions précédentes |
| D-020 | Plan de l'étage en page d'accueil | Abandonnée | Jugé bizarre et inutile par Arthur ; remplacé par « temps contre tâches » et « qui fait quoi » | — |
