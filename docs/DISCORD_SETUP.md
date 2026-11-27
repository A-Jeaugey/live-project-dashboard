# Mise en place de Discord

Ce document couvre trois choses :

1. les salons à créer sur le serveur « Video Game Project » ;
2. les **notifications natives de GitLab** (aucun code, utilisables tout de suite) ;
3. la préparation du **bot**, qui arrivera en phase 2.

Les salons existants (`#bienvenue-et-règles`, `#notes-et-ressources`, `#général`, `#planification-de-sessions`,
`#hors-sujet` et les salons vocaux) ne sont pas touchés.

> Les libellés des menus Discord et GitLab changent parfois d'une version à l'autre. Si un intitulé diffère
> légèrement, cherche le plus proche.

## 1. Les salons

Créer une catégorie **Projet** avec trois salons textuels :

| Salon | Ce qui y arrive | Qui écrit |
|---|---|---|
| `#tableau` | Issues créées, prises, fermées, commentées. En phase 3 : rappel des tâches qui dorment | Le robot et les membres (pour réagir ou discuter d'une tâche) |
| `#code` | Merge requests, demandes de relecture, pipelines en échec. En phase 3 : relance des relectures après 48 h | Le robot et les membres |
| `#annonces-projet` | En phase 3 : récap du lundi et rappels d'échéance | Le robot seulement |

`#builds` n'est pas créé pour l'instant : le projet n'a pas de CI, le salon resterait vide. Le jour où un pipeline
existe, on le crée et on y déplace les notifications de pipeline (une case à changer, voir 2.3).

### Créer la catégorie et les salons

1. Clic droit dans la liste des salons → **Créer une catégorie** → nom : `Projet`.
2. Sur la catégorie, **+** → **Salon textuel**, trois fois : `tableau`, `code`, `annonces-projet`.
3. Pour `#annonces-projet` seulement, le passer en lecture seule pour les membres :
   **Modifier le salon → Permissions → @everyone** : refuser *Envoyer des messages*, laisser *Ajouter des
   réactions*. Le robot gardera le droit d'écrire grâce à son propre rôle (étape 3).

Recommandé : mettre `#annonces-projet` en notifications « Tous les messages » chez chaque membre, et laisser
`#tableau` et `#code` en « Mentions seulement ». Peu de messages dans le premier, donc personne ne le coupe.

## 2. Notifications natives de GitLab

GitLab sait publier dans Discord sans aucun programme, grâce à l'intégration **Discord Notifications**. Elle
sert de solution d'attente jusqu'à l'arrivée du bot, puis de secours.

Ses limites, à connaître :

- pas de bouton « Je prends » ;
- pas de mention des personnes (GitLab ne connaît pas vos comptes Discord) ;
- messages en anglais.

### 2.1 Créer un webhook Discord par salon

À faire deux fois, pour `#tableau` et pour `#code` :

1. **Modifier le salon** (roue dentée) → **Intégrations** → **Webhooks** → **Nouveau webhook**.
2. Lui donner un nom reconnaissable, par exemple `GitLab`.
3. **Copier l'URL du webhook**. Elle commence par `https://discord.com/api/webhooks/`.

Cette URL est un **secret** : quiconque la possède peut publier dans le salon. Ne pas la coller dans un salon,
une issue ou un commit. Si elle fuite, supprimer le webhook et en recréer un.

Il faut la permission *Gérer les webhooks* sur le serveur pour faire cette étape.

### 2.2 Activer l'intégration dans GitLab

Dans le projet du jeu, avec le rôle Maintainer ou Owner :

1. **Settings → Integrations → Discord Notifications**.
2. Cocher **Active**.
3. Champ **Webhook** principal : coller l'URL du webhook de `#tableau`.
4. Cocher les événements voulus. Chaque événement coché peut recevoir **sa propre URL** de webhook, qui remplace
   alors l'URL principale pour cet événement :

| Événement GitLab | À cocher | Salon (URL à mettre) |
|---|---|---|
| Issue | Oui | `#tableau` |
| Confidential issue | Non | — |
| Note (commentaires) | Oui | `#tableau` |
| Confidential note | Non | — |
| Merge request | Oui | `#code` |
| Pipeline | Oui | `#code` |
| Push | Non (trop bavard) | — |
| Tag push | Au choix | `#code` |
| Wiki page, Deployment | Non | — |

5. Options des pipelines : cocher **Notify only broken pipelines**, pour n'être prévenu que des échecs.
6. **Branches for which notifications are to be sent** : *Default branch* suffit.
7. **Save changes**, puis **Test settings** : un message d'essai doit apparaître dans Discord.

Les commentaires d'une merge request passent par l'événement *Note* et arrivent donc dans `#tableau` avec ceux
des issues : l'intégration ne sait pas les séparer. Le bot, lui, les enverra dans `#code`.

### 2.3 En cas de problème

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| L'intégration n'apparaît pas dans la liste | Désactivée par l'administration de l'école | Ne rien forcer : le bot enverra ces notifications en phase 2 |
| « Test settings » échoue avec un message parlant d'URL bloquée | L'instance interdit les requêtes sortantes | Idem |
| L'URL est refusée à l'enregistrement | Ce n'est pas une URL `https://discord.com/api/webhooks/…` | Recopier l'URL depuis Discord |
| Rien n'arrive alors que le test passe | L'événement n'est pas coché, ou la branche n'est pas la branche par défaut | Revoir les cases de l'étape 4 et l'option de l'étape 6 |

D'après la vérification d'Arthur du 27 novembre 2026, rien ne semble bloqué sur l'instance (intégrations,
runners). À confirmer au premier essai réel avec « Test settings ».

## 3. Le bot (phase 2)

Rien à installer maintenant. Cette section prépare ce qu'il faudra faire le moment venu.

### 3.1 Créer l'application Discord

1. Aller sur le portail développeur de Discord → **New Application** → nom au choix (par exemple `Le Surveillant`).
2. Onglet **Bot** → **Reset Token** → copier le jeton et le ranger dans le `.env` du serveur
   (`DISCORD_BOT_TOKEN`). Il ne sera plus affiché ensuite.
3. Toujours dans **Bot**, activer **Server Members Intent** : le bot s'en sert pour retrouver vos comptes à
   partir de vos pseudos, sans que vous ayez à copier vos identifiants numériques.
4. Laisser **Public Bot** décoché : seul le propriétaire de l'application doit pouvoir l'inviter.

### 3.2 L'inviter sur le serveur

Onglet **OAuth2 → URL Generator** :

- **Scopes** : `bot` et `applications.commands`.
- **Bot permissions** :

| Permission | Pourquoi |
|---|---|
| Voir les salons | Trouver les salons du projet |
| Envoyer des messages | Publier les notifications et les récaps |
| Intégrer des liens | Mettre en forme les messages |
| Voir les anciens messages | Mettre à jour un message déjà publié |
| Gérer les salons *(facultatif)* | Créer lui-même la catégorie et les salons manquants |

Ouvrir l'URL générée, choisir « Video Game Project », valider. Le bot n'a besoin ni des droits d'administrateur,
ni de *Mentionner @everyone*, ni de *Gérer les messages*.

### 3.3 Création automatique des salons

Si la permission *Gérer les salons* est accordée, le bot proposera au premier lancement de créer la catégorie et
les salons qui manquent. Il affiche la liste et attend une confirmation ; il ne modifie ni ne supprime jamais un
salon existant. Sans cette permission, il suffit de suivre la section 1.

### 3.4 Éviter les doublons

Quand le bot publiera lui-même les notifications, il faudra **décocher dans GitLab** les événements qu'il prend
en charge (section 2.2, étape 4), sinon chaque événement apparaîtra deux fois. L'intégration native pourra rester
active pour un seul type d'événement, comme filet de sécurité, ou être désactivée entièrement.

### 3.5 Correspondance des comptes

Pré-remplie dans `config/projet.toml` :

| Prénom | GitLab | Discord |
|---|---|---|
| Arthur | `arthur.jeaugey` | `para_bellum._` |
| Théo | `theo.wu` | `layxq` |
| Samuel | `samuel.mopty` | `doc_bob` |
| Louis | `louis.landanger` | `heisenberg4576` |
| Eliott | `eliott.damagnez` | `this_is_some1` |

Si quelqu'un change de pseudo Discord, il met à jour ce fichier ou utilise la commande `/lier`.
