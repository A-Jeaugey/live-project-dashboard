# Journal — 27 novembre 2026 — Refonte visuelle « poste de nuit »

- **Humain :** Arthur
- **Outil :** Claude Code (session cloud)
- **Niveau :** N3 (génération relue ; la relecture par le groupe reste à faire)

## Demande

Arthur a rejeté l'interface « le carnet » (copie d'élève, papier crème, écriture manuscrite) : « still AI slop ».
Il a demandé de regarder de vraies références (Awwwards, dashboards modernes) et de faire quelque chose
d'original, pas générique.

## Ce qui a été fait

1. **Recherche de références.** Les galeries étant bloquées par le réseau de la session, Arthur a autorisé une
   liste précise de sites. Consultés avec un navigateur : Behance (recherches ciblées, trois projets ouverts en
   grand) et Linear. Awwwards refuse les navigateurs automatisés ; il n'a été vu qu'à travers la recherche web.
   Dribbble a renvoyé une page de vérification.
2. **Constat.** Les deux premières directions n'étaient qu'un habillage posé sur des listes. Ce qui distingue les
   références, c'est une idée visuelle propre au sujet, tenue partout.
3. **Nouvelle direction, « poste de nuit ».** L'accueil devient le plan de l'étage : salles = domaines,
   repères = tâches, jetons = membres, le prof dans le couloir = l'échéance, verrous de la sortie = avancement.
   Système graphique noir à traits fins, trois couleurs porteuses de sens, une seule famille de caractères
   poussée du très large au très étroit.
4. **Réécriture de l'interface** dans cette direction : accueil, tableau, détail d'une tâche, équipe, échéances,
   projet, connexion. La logique (lecture, temps réel, filtres) n'a pas changé ; le serveur non plus.
5. **Documentation** : `docs/UX.md` §8, décisions D-017 (abandonnée) et D-019 (proposée), état actuel, README,
   captures de `docs/apercu/`.

## Vérifications

- Types et compilation de l'interface.
- Parcours complet rejoué dans un navigateur contre le faux GitLab : connexion, tableau, mise à jour en direct,
  détail, déconnexion.
- Sur le plan : quand une tâche est prise dans le faux GitLab, le jeton de la personne quitte le couloir pour la
  salle de la tâche, sans recharger.
- Rendu relu sur captures, ordinateur et téléphone.
- Projet vide (données d'exemple vides) : les cinq membres attendent dans le couloir, la sortie est sans verrou,
  la note de mise en place liste les labels et jalons manquants.

## Limites

- Les photos de profil ne sont plus affichées : les membres sont des jetons à initiale.
- Sur téléphone, le plan se fait défiler horizontalement.
- Le thème clair a disparu : la direction est nocturne par nature.
- Arthur n'a vu que l'accueil au moment où le reste a été réécrit : la direction n'est pas encore validée.

## Suite

Avis d'Arthur sur la direction. Si elle convient : déploiement, puis phase 2.
