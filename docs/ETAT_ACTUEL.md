# État actuel

Dernière mise à jour : **27 novembre 2026** (session de cadrage).

## Où on en est

- **Phase : cadrage.** Aucun code applicatif. La proposition attend la validation du groupe.
- Rédigé : `docs/UX.md` (parcours et écrans), `docs/ARCHITECTURE.md` (stack, flux, authentification,
  hébergement, contraintes de l'instance), `docs/DECISIONS.md`.
- Maquette des écrans principaux : <https://claude.ai/artifact/L3FZCmggkbCqUPidoAsgWB> (lien privé : Arthur doit
  la partager depuis le menu « Share » pour que les autres membres puissent l'ouvrir). Elle montre : Aujourd'hui,
  Tableau, Point hebdo, Échéance, tableau sur téléphone, détail d'une tâche, messages du bot. Ses données sont
  des exemples.

## Constats importants

1. **Le projet GitLab du jeu est vide** : un commit (README par défaut), aucun label, aucun jalon, aucune issue,
   aucune merge request, aucun pipeline, pas de `docs/`, pas d'`AI_LOG.md`. L'organisation décrite dans le cahier
   des charges reste à créer dans GitLab.
2. **L'instance est en GitLab 19.5.8**, joignable depuis Internet, fournisseur OpenID Connect actif. Détail :
   `docs/ARCHITECTURE.md`, section 11.
3. **La prochaine échéance est proche** : remise du CdST la semaine du 7 décembre 2026 (J-10 au 27 novembre). Les
   rappels J-30 et J-14 de cette échéance sont déjà passés.

## À valider par le groupe

Décisions D-003 à D-016 de `docs/DECISIONS.md`. Les cinq qui bloquent la phase 1 :

| Sujet | Proposition |
|---|---|
| Stack | Python (FastAPI, `discord.py`, `httpx`), React + TypeScript, SQLite, Docker |
| Authentification | Connexion par le GitLab de l'école, identité seule ; repli Discord |
| Écritures | Par le token de projet du serveur, pas au nom de chaque membre |
| Exposition | Caddy, tunnel Cloudflare ou reverse proxy existant |
| Écrans | Ceux de `docs/UX.md` et de la maquette, ajouts proposés compris ou non |

## Questions ouvertes

Pour chacune, la réponse par défaut qui sera appliquée si personne ne s'y oppose.

| N° | Question | Réponse par défaut |
|---|---|---|
| Q1 | Qui crée les labels (`Idée`, `À faire`, `En cours` et les sept domaines) dans GitLab ? | Le dashboard propose de les créer, avec une confirmation qui liste ce qui sera créé |
| Q2 | Quels jalons créer ? | Les cinq échéances à venir, avec pour date le lundi de leur semaine ; pas de jalon pour l'échéance passée |
| Q3 | Que faire d'une issue ouverte sans label de colonne ? | Colonne « Idées » avec la marque « À trier » |
| Q4 | Peut-on prendre une tâche déjà prise ? | Oui, après confirmation ; la tâche change de responsable |
| Q5 | Peut-on fermer une tâche depuis le dashboard ? | Oui, après confirmation (utile pour les tâches sans code) |
| Q6 | Remettre une tâche en « À faire » retire-t-il l'assignation ? | Oui |
| Q7 | « Fait récemment » : quelle durée ? | 14 jours, réglable |
| Q8 | Qu'est-ce qu'une merge request « en attente de relecture » ? | Ouverte, pas en brouillon, sans approbation d'un autre membre que l'auteur |
| Q9 | Les relances (48 h, 14 jours) partent-elles le week-end ? | Non : en semaine, à heure fixe |
| Q10 | Comment compter l'inactivité d'une tâche ? | Dernière modification de l'issue ou de sa merge request liée |
| Q11 | Transparence IA : qu'est-ce qu'un « module » ? | Déduit du chemin des fichiers cités, selon une table de correspondance réglable |
| Q12 | Commits `[IA]` : sur quelles branches ? | `main` uniquement |
| Q13 | Comment le jury voit-il la vue « Transparence IA » ? | Depuis le compte d'un membre ; pas d'accès public |
| Q14 | Compte à rebours : quelle date exacte ? | Le lundi de la semaine indiquée, fuseau Europe/Paris ; la date réelle pourra être précisée dans la configuration quand elle sera connue |
| Q15 | Horaires des messages automatiques ? | Récap le lundi à 8 h, rappels d'échéance à 9 h, relances à 9 h 30 ; tout est réglable |
| Q16 | Le récap nomme-t-il les membres sans tâche ? | Oui, sous l'intitulé « Disponible » |
| Q17 | Ce repo reste-t-il sur GitHub alors que le jeu est sur le GitLab de l'école ? | Oui, tant que les cinq membres y ont accès |
| Q18 | Peut-on créer un projet GitLab « bac à sable » pour essayer les écritures sans toucher au vrai tableau ? | Souhaitable avant la phase 2 |

## Vérifications à faire par un membre

Elles demandent une session GitLab ou le rôle Maintainer, que l'IA n'a pas :

- [ ] Ouvrir `https://gitlab.cri.epita.fr/-/user_settings/applications` : la page propose-t-elle « Add new
      application » ?
- [ ] *Settings → CI/CD → Runners* du projet du jeu : y a-t-il des runners d'instance disponibles ?
- [ ] *Settings → Integrations* : « Discord Notifications » est-elle proposée ?
- [ ] *Settings → Webhooks* : la page est-elle accessible ? Le test d'envoi vers l'extérieur se fera quand le
      serveur sera en ligne.

## Accès de l'IA au GitLab

Un token de projet a été fourni pour les vérifications en lecture. Il a été créé avec le rôle Developer et toutes
les portées, écriture comprise, alors que `read_api` suffit. Seules des lectures ont été effectuées. **À faire :**
le révoquer et le remplacer par un token `read_api` (rôle Maintainer si l'IA doit vérifier elle-même les runners,
webhooks et intégrations ; Reporter sinon).

## Prochaine étape

Après validation : **phase 1, lecture seule**.

1. Squelette du projet, `.env.example`, `docker compose`.
2. Logique pure et ses tests : colonnes, calendrier et comptes à rebours.
3. Client GitLab, synchro, cache, interrogation périodique ; réception des webhooks.
4. Connexion et contrôle d'accès.
5. Écrans Aujourd'hui, Tableau, Équipe, Échéances, Projet, en lecture seule, avec mise à jour en temps réel.
6. `docs/DISCORD_SETUP.md`.

Démonstration au groupe avant de passer à la phase 2.
