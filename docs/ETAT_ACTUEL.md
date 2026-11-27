# État actuel

Dernière mise à jour : **27 novembre 2026**, après le retrait du plan de l'étage.

## Où on en est

**La phase 1 (lecture seule) est écrite et fonctionne sur un ordinateur de développement.** Elle n'est pas encore
déployée, et la connexion n'a pas encore été essayée avec le vrai GitLab de l'école.

Ce qui existe :

- **Interface** : Aujourd'hui (compte à rebours, temps contre tâches, qui fait quoi), Tableau, Équipe,
  Échéances, Projet, détail d'une tâche, écran de connexion. Utilisable sur téléphone. L'apparence a été refaite
  plusieurs fois à la demande d'Arthur ; l'historique est dans `docs/UX.md` §8.
- **Serveur** : lecture de GitLab (issues, labels, jalons, membres, merge requests, pipelines, commits,
  événements), cache en mémoire, interrogation périodique, réception des webhooks, flux temps réel, connexion
  par OpenID Connect réservée aux membres du projet.
- **Déploiement** : `Dockerfile`, `docker-compose.yml` avec tunnel Cloudflare, `.env.example` documenté.
- **Documentation** : `README.md` (essai local et installation), `docs/DISCORD_SETUP.md`.

Captures : `docs/apercu/`. Elles montrent des données d'exemple.

## Ce qui a été vérifié, et comment

| Vérification | Résultat |
|---|---|
| Tests Python (`make test`) | 187 passent |
| Style (`make lint`) | propre |
| Types et compilation de l'interface (`npm run build`) | passent |
| Parcours dans un vrai navigateur, contre le faux GitLab : page de connexion, choix d'un membre, retour à la page demandée, tableau, détail avec description et commentaires, déconnexion | passe |
| Mise à jour en direct : une tâche prise dans le faux GitLab change de colonne à l'écran sans recharger ; sur l'accueil, la ligne de la personne se met à jour ; message « en direct : Louis a pris #12 » | passe, en moins d'une seconde avec webhook |
| Refus d'un compte qui n'est pas membre du projet | passe |
| Webhook sans secret ou avec un mauvais secret ; requête de modification venue d'un autre site | refusés (403) |
| Webhook reçu en double | ignoré (vérifié par les tests) |
| GitLab injoignable au démarrage, puis de retour | l'outil reste affichable et se resynchronise (vérifié pendant l'écriture du serveur, non rejoué ensuite) |
| Lecture du **vrai** projet GitLab (requêtes de lecture uniquement) | instantané correct d'un projet vide : 5 membres, 10 labels et 5 jalons manquants |
| Rendu sur ordinateur et téléphone | relu sur captures après la refonte |
| Affichage d'un projet vide | relu sur captures, avec des données d'exemple vides |
| Image Docker | construite et lancée dans le bac à sable, avec un Dockerfile adapté à son réseau |

## Ce qui n'a pas pu être vérifié

- **La connexion avec le vrai GitLab de l'école** : il faut d'abord créer l'application OAuth (étape 2 du README).
- **Les webhooks envoyés par le vrai GitLab**, en particulier la signature HMAC, écrite d'après la convention
  Standard Webhooks.
- **Le tunnel Cloudflare** et un `docker compose up` complet sur le serveur.
- **Le `Dockerfile` tel qu'il est dans le repo** : dans le bac à sable, le réseau imposait d'y ajouter un
  certificat. Il devrait fonctionner tel quel ailleurs, mais ce n'est pas prouvé.
- **Les avatars** : sur le vrai GitLab, ils pointent vers le site de photos de l'école. S'ils ne se chargent pas,
  l'initiale de la personne s'affiche à la place.

## Constats

1. **Le projet GitLab du jeu est toujours vide** (un commit, aucun label, aucun jalon, aucune issue). L'accueil
   affichera donc « Aucune tâche dans GitLab pour l'instant » et la liste de ce qu'il manque. Les labels et les jalons sont à créer à la main
   dans GitLab, ou attendront la phase 2, où l'outil proposera de le faire.
2. **Prendre une tâche ne laisse aucune trace dans le journal d'événements de GitLab.** Le fil d'activité ne
   montre donc que les ouvertures, fermetures, commentaires, merge requests et poussées. Le changement de colonne
   est quand même annoncé en direct par l'interface. Le bot aura besoin de la même détection côté serveur.
3. **Pendant la semaine d'une échéance**, le compte à rebours affiche « cette semaine » plutôt qu'un nombre.

## Décisions

Validées par Arthur le 27 novembre : React + TypeScript, connexion par le GitLab de l'école avec écritures par le
robot du projet, tunnel Cloudflare, les quatre ajouts proposés. Le reste de la proposition est appliqué par
défaut. **En attente d'un avis** : le système graphique actuel (D-019) et la numérotation des échéances en
« nuits » (D-018). Abandonnés : la direction « le carnet » (D-017) et le plan de l'étage en accueil (D-020). Les
quatre autres membres ne se sont pas encore exprimés. Détail : `docs/DECISIONS.md`.

## À faire par un membre

- [ ] Regarder les captures de `docs/apercu/` ou lancer l'outil en local (README), et dire si l'apparence
      convient.
- [ ] **Révoquer le token GitLab « Claude code »** créé le 27 novembre avec toutes les portées, et en créer un en
      `read_api` (rôle Reporter) pour le serveur.
- [ ] Créer l'application OAuth, le tunnel Cloudflare et le `.env`, puis déployer (README, « Installer sur le
      serveur »).
- [ ] Créer le webhook GitLab et cliquer « Test ».
- [ ] Créer les salons Discord et activer les notifications natives (`docs/DISCORD_SETUP.md`).
- [ ] Créer dans GitLab les labels `Idée`, `À faire`, `En cours`, les sept labels de domaine et les jalons, ou
      attendre la phase 2.

## Questions encore ouvertes

Les réponses par défaut de la session de cadrage sont appliquées. Restent à trancher avant la phase 2 :

| Question | Réponse par défaut |
|---|---|
| Peut-on créer un projet GitLab « bac à sable » pour essayer les écritures sans toucher au vrai tableau ? | Souhaitable |
| Prendre une tâche déjà prise : remplacer la personne, ou refuser ? | Remplacer après confirmation |
| Le bot publie-t-il toutes les notifications, l'intégration native de GitLab restant en secours ? | Oui |

## Prochaine étape

Démonstration de la phase 1 au groupe. Après validation : **phase 2, les actions**.

1. Module d'écriture unique : prendre une tâche, créer une idée, changer de colonne ; création des labels et
   des jalons manquants après confirmation.
2. Les mêmes actions dans l'interface (glisser-déposer, touche `I`, bouton « Je prends »), vue « Point hebdo ».
3. Bot Discord : commandes, bouton « Je prends », notifications.
