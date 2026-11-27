# Déploiement de la phase 1 sur le serveur

Brief destiné à la session Claude Code qui tourne sur le serveur d'Arthur (homelab). Il sert aussi de procédure
pour un humain.

## Objectif

Mettre en ligne la phase 1 (lecture seule) du tableau de bord : `docker compose`, exposition HTTPS par un tunnel
Cloudflare, connexion par le GitLab de l'école, webhook GitLab. Puis vérifier de bout en bout et consigner ce qui
a été vérifié.

Le code est écrit et testé ; il n'a jamais tourné ailleurs que dans un bac à sable. Ce déploiement est donc aussi
le premier essai réel de quatre points : le `Dockerfile` hors bac à sable, la connexion OpenID Connect avec le vrai
GitLab, les webhooks envoyés par le vrai GitLab, le tunnel.

## À lire d'abord

Dans le repo `https://github.com/A-Jeaugey/live-project-dashboard` (branche par défaut
`claude/practical-archimedes-lvfg1k`, la seule) :

1. `AGENTS.md` : règles du projet. En particulier : aucun secret dans Git, les logs ou les messages ; aucune
   écriture sur le vrai projet GitLab ; tout commit d'IA commence par `[IA]` ; journal de session obligatoire.
2. `README.md`, section « Installer sur le serveur ».
3. `.env.example` : chaque variable y est expliquée.
4. `docker-compose.yml` et `Dockerfile`.
5. `docs/ETAT_ACTUEL.md` : ce qui est vérifié et ce qui ne l'est pas.

## Ce que seul Arthur peut faire

La session ne peut pas créer ces éléments : elle les demande à Arthur, au bon moment, avec le chemin exact dans
l'interface. Les valeurs secrètes sont écrites par Arthur directement dans `.env` sur le serveur, ou collées dans la
session si c'est la seule solution ; elles ne doivent jamais être répétées dans une réponse, un log ou un commit.

| Élément | Où | Réglages |
|---|---|---|
| Sous-domaine | À choisir par Arthur | Le domaine personnel est probablement déjà géré par Cloudflare (il sert à d'autres projets) : à confirmer |
| Token du projet | GitLab, projet `arthur.jeaugey/5-nights-at-epita` → *Settings → Access tokens* | Rôle **Reporter**, portée **`read_api`** uniquement, expiration au choix |
| Application OAuth | GitLab → avatar → *Edit profile → Applications → Add new application* | Redirect URI `https://<sous-domaine>/auth/callback` ; **Confidential** coché ; portée **`openid`** seule |
| Tunnel Cloudflare | Cloudflare → *Zero Trust → Networks → Tunnels* | Voir l'étape 3 |
| Webhook GitLab | Projet → *Settings → Webhooks* | Voir l'étape 7 |

## Étapes

### 1. Reconnaissance (sans rien modifier)

- Vérifier `docker`, `docker compose`, `git`, l'espace disque.
- Regarder ce qui tourne déjà : conteneurs, ports occupés (le tableau de bord publie `127.0.0.1:8000` par défaut,
  modifiable avec `APP_PORT`), et surtout si un **tunnel Cloudflare existe déjà** sur la machine (service
  `cloudflared`, conteneur, fichier de configuration).
- Résumer à Arthur ce qui a été trouvé et proposer le dossier d'installation (par défaut
  `~/apps/live-project-dashboard`).

### 2. Récupération du code

Cloner le repo dans le dossier choisi. La branche par défaut est la bonne.

### 3. Exposition

Deux cas, selon la reconnaissance :

- **Pas de tunnel existant** (cas prévu par le `docker-compose.yml`) : Arthur crée un tunnel de type `cloudflared`
  dans le tableau de bord Cloudflare, ajoute le nom d'hôte public `<sous-domaine>` pointant vers le service
  `http://app:8000`, et fournit le jeton du tunnel (`CLOUDFLARE_TUNNEL_TOKEN`).
- **Un tunnel existe déjà sur la machine** : il est plus simple d'y ajouter `<sous-domaine>` →
  `http://127.0.0.1:<APP_PORT>` et de ne pas lancer le service `cloudflared` du compose. Le fichier actuel exige
  `CLOUDFLARE_TUNNEL_TOKEN` ; il faudra donc l'adapter proprement (par exemple placer `cloudflared` sous un
  profil Compose et rendre la variable facultative), commiter ce changement et mettre à jour le README.
  Ne pas modifier la configuration du tunnel existant sans l'accord d'Arthur : d'autres projets en dépendent.

### 4. Configuration

- Copier `.env.example` vers `.env`, `chmod 600 .env`.
- `APP_ENV=prod`, `APP_BASE_URL=https://<sous-domaine>` (sans barre finale), `COOKIE_SECURE=true`.
- Générer `SESSION_SECRET` et `GITLAB_WEBHOOK_SECRET` sur le serveur :
  `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.
- Arthur remplit `GITLAB_TOKEN`, `GITLAB_OAUTH_CLIENT_ID`, `GITLAB_OAUTH_CLIENT_SECRET` et, le cas échéant,
  `CLOUDFLARE_TUNNEL_TOKEN`.
- Laisser `GITLAB_WEBHOOK_SIGNING_TOKEN` vide pour l'instant (voir l'étape 7).
- `.env` est ignoré par Git : vérifier avec `git status` qu'il n'apparaît pas.

### 5. Lancement et vérifications locales

```bash
docker compose up -d --build
```

- Si la construction de l'image échoue, c'est un vrai défaut du `Dockerfile` : le corriger, commiter sur la
  branche, noter la cause.
- `docker compose ps` : `app` doit être *healthy*.
- `curl -s http://127.0.0.1:<APP_PORT>/healthz` → `{"status":"ok"}`.
- `docker compose logs app` : la première synchronisation avec GitLab doit réussir, sans erreur 401 ni 403.
  Le projet du jeu est vide aujourd'hui : c'est normal de ne voir aucune tâche.

### 6. Vérifications publiques

- `https://<sous-domaine>/healthz` répond.
- Arthur ouvre `https://<sous-domaine>`, clique « Se connecter avec le GitLab de l'école », accepte, et arrive
  sur l'accueil : sa pastille en haut à droite, « Aucune tâche dans GitLab pour l'instant », la tuile « Mise en
  place » listant 10 labels et 5 jalons manquants, les cinq membres dans « Équipe ».
- En cas d'échec de connexion, l'URL de retour contient `?erreur=…` (`configuration`, `connexion`, `gitlab` ou
  `non_membre`) : s'en servir pour diagnostiquer, avec les logs de `app`. Cause la plus probable : Redirect URI
  différente de `APP_BASE_URL` + `/auth/callback`.
- Si l'instance refuse aux utilisateurs de créer une application OAuth, s'arrêter et prévenir Arthur : le repli
  prévu (connexion Discord) n'est pas écrit.

### 7. Webhook GitLab

- Arthur crée le webhook : URL `https://<sous-domaine>/hooks/gitlab`, *Secret token* = la valeur de
  `GITLAB_WEBHOOK_SECRET` (à lire dans `.env` sur le serveur), vérification SSL activée, événements *Issues,
  Merge requests, Comments, Pipelines, Push, Tag push, Milestones*.
- Cliquer **Test → Issue events** : réponse attendue 200. Dans le tableau de bord, onglet **Projet**, tuile
  « Synchronisation » : « Webhook reçu il y a … ».
- Si GitLab répond que l'URL est bloquée ou que le test échoue faute d'accès, ce n'est pas bloquant : le tableau
  de bord interroge GitLab toutes les 30 secondes. Le noter.
- La signature HMAC (`GITLAB_WEBHOOK_SIGNING_TOKEN`) n'a été testée que contre la convention Standard Webhooks.
  L'essayer seulement si tout le reste fonctionne : la renseigner des deux côtés, refaire le test, et revenir au
  seul *Secret token* en cas d'échec, en notant le résultat.

### 8. Discord (facultatif)

Si Arthur le souhaite, l'accompagner dans `docs/DISCORD_SETUP.md`, sections 1 et 2 : création des salons et
notifications natives de GitLab. Tout se fait dans les interfaces de Discord et de GitLab.

## Interdits

- Aucune écriture sur le projet GitLab du jeu par un script ou par l'API. Le webhook est créé par Arthur dans
  l'interface.
- Aucun secret dans un commit, un log, un message ou une réponse.
- Ne pas modifier le code de l'application, sauf si le déploiement l'exige ; dans ce cas, changement minimal,
  tests (`make test`, `make lint`, `cd frontend && npm run build`) et commit sur la branche.
- Ne pas toucher aux autres services du serveur.

## Fin de mission

- Mettre à jour `docs/ETAT_ACTUEL.md` : ce qui est désormais vérifié en réel (image Docker, connexion GitLab,
  webhooks ou interrogation, tunnel) et ce qui ne l'est toujours pas. Ne jamais y écrire de secret ni l'adresse
  IP du serveur ; le sous-domaine peut y figurer si Arthur est d'accord.
- Ajouter un journal `docs/ai/journal/AAAA-MM-JJ-deploiement.md` et une ligne dans `docs/ai/AI_LOG.md`.
- Commiter (`[IA] …`) et pousser sur la branche.
- Indiquer à Arthur comment relancer (`docker compose up -d`), voir les logs (`docker compose logs -f app`) et
  mettre à jour (`git pull && docker compose up -d --build`).
