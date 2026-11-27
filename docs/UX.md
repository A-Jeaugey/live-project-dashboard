# Expérience utilisateur

> Statut : parcours et écrans **validés par Arthur le 27 novembre 2026**, ajouts compris. La première maquette
> a été rejetée pour son apparence (trop générique) ; la direction visuelle actuelle est décrite en section 8.
> Les éléments marqués *(ajout proposé)* ne figuraient pas dans le cahier des charges ; ils ont été acceptés.

## 1. Idées directrices

1. **Une question par écran.** Chaque écran répond à une question que quelqu'un se pose vraiment :
   « où en est-on ? », « qu'est-ce que je prends ? », « de quoi parle-t-on lundi ? », « est-on prêts pour la
   soutenance ? ».
2. **Ce qui demande de l'attention remonte tout seul.** Personne ne devrait avoir à chercher une merge request
   oubliée ou une tâche qui dort : ces cas sont regroupés en haut de l'écran d'accueil.
3. **Les gestes fréquents en une action.** Noter une idée : une ligne et Entrée. Prendre une tâche : un clic.
4. **Discord pousse, le dashboard montre.** Discord apporte l'information là où le groupe discute déjà et permet
   les micro-actions. Le dashboard sert à voir l'ensemble, trier et préparer.
5. **Le vide est un état normal.** Pas de pipeline, pas de jalon, pas d'`AI_LOG.md` : chaque écran dit ce qui
   manque et comment y remédier, sans message d'erreur.

## 2. Navigation

Six entrées, identiques sur ordinateur (barre du haut) et sur téléphone (barre du bas, les deux dernières
derrière « Plus ») :

| Entrée | Nom à l'écran | Question | Contenu du cahier des charges couvert |
|---|---|---|---|
| **Aujourd'hui** | la copie du jour | Où en est-on, et qu'est-ce qui m'attend ? | Compte à rebours, activité récente, résumé équipe et santé |
| **Tableau** | Tableau | Qu'est-ce que je prends ? | Tableau des tâches, filtres, actions |
| **Équipe** | Feuille d'appel | Qui fait quoi ? | Qui travaille sur quoi, membres sans tâche, tâches dormantes |
| **Échéances** | Cahier de textes | Est-on prêts ? | Jalons, comptes à rebours, avancement, bilan à copier |
| **Projet** | Projet | Le dépôt est-il en bonne santé ? | Dernière version jouable, merge requests en attente, pipelines, journal complet, état de la synchro |
| **Transparence IA** | (phase 3) | Comment utilise-t-on l'IA ? | Lecture d'`AI_LOG.md` et des commits `[IA]`, répartitions |

Les cinq échéances à préparer sont numérotées **nuit 1 à nuit 5** (le projet s'appelle *5 Nights at EPITA* et il
reste exactement cinq échéances). Le nom complet de l'échéance reste toujours affiché à côté.

Deux vues sans entrée dans le menu, ouvertes depuis « Aujourd'hui », la palette de commandes ou un lien Discord :
**Point hebdo** *(ajout proposé)* et **détail d'une tâche**.

Dans toute l'interface, un indicateur « GitLab · à jour il y a N s » montre la fraîcheur des données. Si GitLab ne
répond plus, il devient « dernière synchro il y a N min » et les actions d'écriture sont désactivées.

## 3. Parcours principaux

### 3.1 Arriver le matin et voir où en est le projet

1. Ouvrir le dashboard : la session est encore valide, on arrive directement sur **Aujourd'hui**.
2. Lire, de haut en bas, sans cliquer :
   - le compte à rebours de la prochaine échéance et l'avancement de son jalon ;
   - la frise des cinq échéances ;
   - **Demande de l'attention** : merge requests en attente de relecture depuis plus de 48 h, tâches en cours
     sans activité depuis 14 jours, membres sans tâche en cours, tâches à trier ;
   - **À toi** : ses tâches en cours et les relectures qu'on attend de soi ;
   - **Depuis ta dernière visite** : ce qui a bougé depuis le dernier passage ;
   - **Qui fait quoi** et la **dernière version jouable**.
3. Si quelque chose demande une action, un clic ouvre la tâche ou la merge request concernée.

Zéro clic pour l'état du projet, un clic pour agir.

### 3.2 Prendre une tâche

Depuis le dashboard :

1. Aller sur **Tableau** (ou touche `M` pour filtrer « mes tâches », filtres par domaine et jalon si besoin).
2. Cliquer **Je prends** sur une carte de la colonne « À faire ».
3. La carte passe immédiatement dans « En cours » avec son avatar ; GitLab est mis à jour (assignation et label).
   En cas d'échec, la carte revient à sa place avec un message clair.
4. *(ajout proposé)* Dans le détail de la tâche, le nom de branche conforme à la convention
   (`type/numéro-sujet`) est prêt à être copié.

Depuis Discord : cliquer **Je prends** sous la notification d'une nouvelle tâche, ou taper `/prends 12`.

Si la tâche est déjà prise par quelqu'un d'autre, une confirmation est demandée avant de la reprendre.

### 3.3 Noter une idée en quelques secondes

- **Dashboard** : touche `I` depuis n'importe quel écran (ou le champ « Noter une idée » de la barre du haut),
  taper la phrase, Entrée. L'idée apparaît en tête de la colonne « Idées ». Terminer par `#son` (ou un autre
  domaine) pose le label de domaine.
- **Téléphone** : bouton « Noter une idée » toujours visible en bas du tableau.
- **Discord** : `/idee <texte> [domaine]`, sans quitter la conversation ou le vocal.

Dans les trois cas, c'est une issue GitLab avec le label `Idée`, créée en moins de dix secondes.

### 3.4 Préparer le point hebdomadaire

1. Le lundi matin, le bot poste le **récap hebdomadaire** dans `#annonces-projet`, avec un bouton vers la vue
   **Point hebdo**.
2. La vue **Point hebdo** *(ajout proposé)* met sur un seul écran, dans l'ordre de la discussion :
   - **Fait cette semaine** ;
   - **En cours**, avec les blocages visibles (relecture en attente, tâche dormante) ;
   - **Prochaine échéance** et ce qu'il reste pour son jalon ;
   - **Idées à trier** : pour chaque idée, « On la fait » (passe en « À faire ») ou « Abandonner » (ferme
     l'issue). Ne rien faire laisse l'idée en idée ;
   - **Qui prend quoi** : les tâches « À faire » sans personne, et les membres disponibles.
3. *(ajout proposé)* **Copier le compte rendu** produit un résumé Markdown à coller dans `#général` ou dans le
   cahier de suivi.

Pourquoi une vue dédiée : sans elle, la personne qui partage son écran doit passer par quatre écrans et refaire
les mêmes filtres chaque lundi.

### 3.5 Préparer une soutenance

1. Aller sur **Échéances**, choisir la soutenance.
2. La page du jalon donne :
   - le compte à rebours et l'avancement (faites / en cours / à faire) ;
   - l'avancement **par domaine**, pour repérer un domaine en retard ;
   - **ce qu'il reste**, tâches en cours d'abord ;
   - **qui a fait quoi** (tâches fermées et en cours par personne) ;
   - **ce qu'on montrera** : la dernière version jouable ;
   - l'**usage de l'IA sur la période**, avec un lien vers la vue complète.
3. *(ajout proposé)* **Copier le bilan** produit un résumé Markdown réutilisable dans le rapport ou les diapositives.
4. Le jour de la soutenance, la vue **Transparence IA** se montre au jury depuis le compte d'un membre.

## 4. Écrans

La première maquette (hors du repo) est abandonnée. La référence est l'application elle-même, lancée avec des
données d'exemple (`README.md`).

### 4.1 Aujourd'hui

- Bandeau : `J-N`, nom de l'échéance, « semaine du … », barre d'avancement du jalon, liens vers le jalon et le
  point hebdo.
- Frise des échéances à venir, chacune avec son `J-N`.
- **Demande de l'attention** : liste typée (Relecture, Dormante, Disponible, À trier), un lien d'action par ligne.
  Si la liste est vide : « Rien ne demande d'attention ».
- **Depuis ta dernière visite** : fil d'événements filtré sur la période (issues, merge requests, pipelines,
  commentaires). La date de dernière visite est gardée dans le navigateur.
- **À toi** : tâches en cours, relectures attendues.
- **Qui fait quoi** : une ligne par membre.
- **Dernière version jouable** : selon la règle configurée (voir 4.5).

### 4.2 Tableau

- Quatre colonnes : **Idées**, **À faire**, **En cours**, **Fait** (issues fermées depuis 14 jours, réglable, avec
  un lien « voir tout »).
- Carte : numéro, titre, domaine (pastille de couleur **et** nom), avatar de la personne assignée, jalon. Signaux
  sur la carte : « À trier », « Sans activité depuis N jours », état de la merge request liée.
- Filtres : personne, domaine, jalon, « mes tâches ». Les filtres sont dans l'URL : un lien filtré se partage.
- Actions : créer une idée (ligne en tête de colonne), **Je prends**, glisser une carte vers une autre colonne,
  ouvrir le détail.
- **Détail d'une tâche** (panneau latéral, plein écran sur téléphone) : colonne modifiable, personne assignée,
  domaine, jalon, description, commentaires en lecture, merge request liée, lien vers GitLab, nom de branche à
  copier *(ajout proposé)*.

Règles de colonnes et de déplacement : voir section 7.

### 4.3 Équipe

- Une carte par membre : tâches en cours, merge requests ouvertes, relectures attendues, dernière activité.
- Les membres sans tâche en cours sont marqués « Disponible ».
- Liste des tâches en cours sans activité depuis plus de 14 jours.

### 4.4 Échéances

- Frise complète du calendrier officiel, échéances passées comprises.
- Pour chaque échéance : `J-N` jusqu'au lundi de la semaine, jalon GitLab associé, avancement.
- Si un jalon GitLab manque : un bandeau « N jalons à créer » ouvre une confirmation qui liste exactement ce qui
  sera créé. Rien n'est créé sans cette confirmation.
- Page de jalon : voir parcours 3.5.

### 4.5 Projet

- **Dernière version jouable**. Règle configurable :
  - `pipeline` (défaut) : dernier pipeline réussi sur `main` ;
  - `tag` : dernier tag correspondant à un motif (par exemple `jouable-*`) ;
  - `commit` : dernier commit de `main`.
  S'il n'existe aucun pipeline, l'écran l'indique en clair et affiche le dernier commit de `main`.
- **Merge requests en attente de relecture**, avec leur ancienneté ; au-delà de 48 h, elles sont mises en avant.
- **Pipelines récents**, ou « Aucun pipeline pour l'instant ».
- **Fil d'activité** complet, filtrable par type.

### 4.6 Transparence IA

- Source : `docs/ai/AI_LOG.md` du repo du jeu et commits dont le titre contient `[IA]`.
- Répartition des sessions par niveau (N1 à N4), par personne, par module, et dans le temps.
- Tableau des sessions, avec lien vers le journal de chaque session.
- Lignes mal formées : listées dans un encadré « N lignes à corriger », avec leur numéro et la raison. Le reste
  s'affiche normalement.
- Si le fichier n'existe pas encore : l'écran l'indique et rappelle le format attendu.
- Mise en page sobre et lisible en projection, puisque la vue est destinée au jury.

### 4.7 Téléphone

- Barre de navigation en bas, zones tactiles d'au moins 44 px.
- Tableau : une colonne à la fois, onglets en haut pour passer de l'une à l'autre. Pas de glisser-déposer : le
  changement de colonne se fait depuis le détail de la tâche.
- Les listes « Aujourd'hui » s'empilent sur une colonne.

## 5. Dashboard ou Discord ?

| Geste | Dashboard | Discord | Pourquoi |
|---|---|---|---|
| Voir l'état du projet | Aujourd'hui | Récap du lundi | Le dashboard pour le détail, Discord pour ne rien rater |
| Noter une idée | `I` + Entrée | `/idee` | L'idée vient souvent en pleine discussion : il faut pouvoir la noter sur place |
| Prendre une tâche | Je prends | Bouton ou `/prends` | La notification arrive dans Discord, le bouton évite de changer d'outil |
| Voir ses tâches | « Mes tâches » | `/moi` | |
| Voir une tâche | Détail | `/issue` | |
| Voir le tableau | Tableau | `/taches` | Sur Discord : une liste compacte, pas un vrai tableau |
| Changer de colonne | Glisser ou détail | — | Geste visuel, plus sûr avec le tableau sous les yeux |
| Trier les idées, répartir | Point hebdo | — | Demande une vue d'ensemble |
| Préparer une soutenance | Échéances | — | Idem |
| Être prévenu | — | Notifications et rappels | Discord est déjà ouvert, le dashboard non |

### Salons

| Salon | Contenu | Volume attendu |
|---|---|---|
| `#tableau` | Issues créées, prises, fermées, commentées ; rappel des tâches dormantes | Moyen |
| `#code` | Merge requests, demandes de relecture, relances après 48 h, pipelines en échec | Moyen |
| `#annonces-projet` | Récap du lundi, rappels d'échéance | Faible, pour que personne ne le mette en sourdine |
| `#builds` | Pipelines | **À créer seulement quand une CI existera** : aujourd'hui le salon resterait vide |

### Comportement des notifications *(à valider)*

- **Un message par tâche, mis à jour** : la notification « nouvelle tâche » est modifiée quand la tâche est prise
  ou fermée, plutôt que de publier un message de plus.
- **Regroupement** : plusieurs changements rapprochés sur la même tâche donnent un seul message.
- **Pipelines** : seuls les échecs sur `main` et le retour à la normale sont annoncés.
- **Mentions** : une personne n'est mentionnée que si on attend quelque chose d'elle (relecture, tâche dormante).

## 6. Raccourcis et automatismes

| Raccourci | Effet |
|---|---|
| `I` | Noter une idée |
| `Ctrl K` / `⌘ K` | Palette : chercher une tâche par numéro ou titre, aller à un écran, lancer une action |
| `M` | Filtrer « mes tâches » |
| `P` | Prendre la tâche sélectionnée |
| `Échap` | Fermer le panneau de détail |

Automatismes :

- Passer une carte en « En cours » assigne la personne qui la déplace si la tâche n'a personne.
- Remettre une carte en « À faire » retire l'assignation.
- `#domaine` à la fin d'une idée pose le label de domaine.
- Les filtres sont conservés dans l'URL.
- Les liens des messages Discord ouvrent directement la tâche dans le dashboard.
- Le bot retrouve seul les identifiants Discord numériques à partir des pseudos connus ; `/lier` ne sert qu'en cas
  de changement de pseudo.
- *(ajout proposé)* Le dashboard peut s'installer sur l'écran d'accueil du téléphone.

## 7. Règles du tableau

### 7.1 Colonne d'une issue

La première règle qui s'applique gagne :

1. issue fermée → **Fait** ;
2. label `En cours` → **En cours** ;
3. label `À faire` → **À faire** ;
4. label `Idée` → **Idées** ;
5. aucun de ces labels → **Idées**, avec la marque « À trier ».

Cas signalés, jamais corrigés en silence :

- plusieurs labels de colonne sur la même issue ;
- `En cours` sans personne assignée ;
- `À faire` avec une personne assignée.

Chaque signalement propose une correction en un clic.

### 7.2 Déplacements

Chaque déplacement est **une seule** requête GitLab sur l'issue.

| Vers | Effet dans GitLab |
|---|---|
| Idées | label `Idée`, retrait de `À faire` et `En cours`, retrait de l'assignation |
| À faire | label `À faire`, retrait de `Idée` et `En cours`, retrait de l'assignation |
| En cours | label `En cours`, retrait de `Idée` et `À faire`, assignation de la personne qui déplace s'il n'y a personne |
| Fait | fermeture de l'issue, après confirmation (la voie normale reste la merge request avec `Closes #n`) |
| Depuis Fait | réouverture, puis labels de la colonne d'arrivée |

**Je prends** équivaut à « vers En cours » avec assignation à soi.

## 8. Apparence : « le carnet »

Le projet est présenté comme une **copie d'élève annotée par un prof** : le jeu met en scène des enseignants,
le carnet leur emprunte leur stylo rouge.

| Élément | Rôle |
|---|---|
| Papier crème, encre noire | Le contenu |
| **Stylo rouge**, écriture manuscrite | Uniquement ce qui demande de l'attention : retards, tâches qui dorment, manques |
| **Stylo bleu**, écriture manuscrite | Ce que l'on fait soi-même (« en cours ») et les liens |
| Marge rouge à gauche des listes | L'endroit où lire les alertes : parcourir la marge suffit |
| En-tête de copie | Sur l'accueil : nom, épreuve en cours, et dans la case de la note, le compte à rebours entouré |
| Appréciation | Une à trois phrases calculées (sans IA) qui résument ce qui presse |
| Post-it jaunes | Les idées |
| Fiches bristol | Les tâches décidées ; tampon « FAIT » sur celles qui sont fermées |
| Photos d'identité | Les membres |
| Gommettes | Les domaines ; le nom du domaine est toujours écrit à côté |
| Cases cochées | L'avancement d'un jalon |
| Intercalaires | La navigation |

La nuit, la copie devient un **tableau noir** et les stylos des craies ; les post-it restent jaunes. Le thème suit
le réglage du système et se change d'un clic.

Typographie : Instrument Serif pour les titres, IBM Plex Sans pour le texte, IBM Plex Mono pour les numéros et
les dates, Caveat pour l'écriture manuscrite. Les polices sont servies par l'application elle-même, sans appel à
un service extérieur.

Règles tenues partout : contraste suffisant dans les deux thèmes, zones tactiles d'au moins 44 px sur téléphone,
aucune information portée par la couleur seule, animations coupées si le système le demande.
