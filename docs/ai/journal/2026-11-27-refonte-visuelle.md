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
- Rendu relu sur captures, ordinateur et téléphone.

## Limites

- Les photos de profil ne sont plus affichées : les membres sont des jetons à initiale.
- Le thème clair a disparu : la direction est nocturne par nature.
- Arthur n'a vu que l'accueil au moment où le reste a été réécrit : la direction n'est pas encore validée.

## Suite de la session : retrait du plan

Arthur a vu le plan de l'étage et l'a jugé « weird et inutile ». Il avait raison : il fallait un mode d'emploi
pour le lire, il occupait la moitié de l'accueil, et tout ce qu'il montrait était dit plus clairement juste en
dessous.

- Le plan, les noms de salles et le vocabulaire associé (couloir, verrous, poste, main courante) sont retirés.
- À leur place sur l'accueil : **temps contre tâches** (deux barres alignées et un verdict) et **qui fait quoi**
  (une ligne par membre).
- L'entrée de menu « Poste » redevient « Aujourd'hui », « Main courante » redevient « Journal ».
- Le système graphique (noir, traits fins, typographie) est conservé : Arthur ne l'a pas critiqué.

Revérifié ensuite : types, compilation, parcours complet dans un navigateur, rendu sur ordinateur, tablette et
téléphone.

## Suite de la session : choix entre trois maquettes

Arthur a trouvé le style « terminal » encore « AI slop » et pas moderne. Diagnostic : libellés en capitales
espacées, sections numérotées, pointillés, coins en équerre, bandes de chantier, vert fluo sur noir sont
exactement les tics des interfaces générées ; et ce style est volontairement rétro.

Plutôt qu'une cinquième direction construite à l'aveugle :

1. Trois maquettes statiques de l'accueil, mêmes données, rendues en images : A « produit sombre » (barre
   latérale, listes denses), B « clair épuré » (blanc, gros chiffres, une couleur vive), C « tuiles » (fond gris,
   cartes blanches, anneaux temps / tâches).
2. Arthur a choisi C, « un peu plus sombre, pas forcément foncé mais juste pas blanc », en saluant les widgets.
3. Toute l'interface a été refaite dans ce style, sur fond graphite : accueil, tableau, détail d'une tâche, équipe
   (une tuile par membre), échéances, projet, connexion. Police Geist à la place d'Archivo et JetBrains Mono.
4. Les calculs « temps écoulé » et « verdict » ont été sortis dans `frontend/src/lib/progress.ts`.

Revérifié : 187 tests, lint, types, compilation, parcours complet dans un navigateur contre le faux GitLab, rendu
sur ordinateur, tablette, téléphone et avec un projet vide.

## Suite

Déploiement, puis phase 2.
