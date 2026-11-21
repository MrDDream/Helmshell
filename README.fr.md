<div align="center">

<img src="static/logo.svg" alt="Logo de Helmshell" width="96" height="96">

# Helmshell

**Pilote ton serveur Linux et ses agents de code IA depuis n'importe quel navigateur ou téléphone.**

[![Dernière version](https://img.shields.io/github/v/release/MrDDream/Helmshell?label=version&color=1F4E79)](https://github.com/MrDDream/Helmshell/releases/latest)
[![Tests](https://img.shields.io/github/actions/workflow/status/MrDDream/Helmshell/tests.yml?branch=main&label=tests)](https://github.com/MrDDream/Helmshell/actions/workflows/tests.yml)
[![Image Docker](https://img.shields.io/badge/ghcr.io-mrddream%2Fhelmshell-1F4E79?logo=docker&logoColor=white)](https://github.com/MrDDream/Helmshell/pkgs/container/helmshell)
[![Licence : MIT](https://img.shields.io/github/license/MrDDream/Helmshell?color=D97757&label=licence)](LICENSE)

[Site](https://mrddream.github.io/Helmshell/) · [Démo en ligne](https://mrddream.github.io/Helmshell/demo/?lang=fr) · [English](README.md) · **Français**

</div>

Helmshell est une **console web auto-hébergée** pour ton propre serveur. Ouvre-la depuis ton ordinateur ou
ton téléphone : tu y retrouves tes projets, leurs fichiers et leur historique Git, des terminaux persistants,
tes sessions **Claude Code** et **OpenAI Codex**, et tes déploiements **Coolify** ou **Dokploy**, au même
endroit.

Lance un agent sur un projet, ferme l'onglet, reprends plus tard depuis ton téléphone : les sessions vivent
dans tmux sur le serveur, et Helmshell te prévient quand un agent a fini ou attend ta réponse.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/home-dark.png">
    <img src="https://mrddream.github.io/Helmshell/screens/home-light.png" alt="Accueil de Helmshell : éléments à traiter, tâches de fond et projets récents" width="100%">
  </picture>
</p>

<table>
  <tr>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/project-dark.png">
        <img src="https://mrddream.github.io/Helmshell/screens/project-light.png" alt="Un projet : onglets Aperçu, Fichiers, Git, Agents, Déploiement et Réglages">
      </picture>
      <br><sub><b>Projet</b></sub>
    </td>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/agents-dark.png">
        <img src="https://mrddream.github.io/Helmshell/screens/agents-light.png" alt="Sessions IA : terminaux Claude Code et Codex de chaque projet">
      </picture>
      <br><sub><b>Sessions IA</b></sub>
    </td>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/git-dark.png">
        <img src="https://mrddream.github.io/Helmshell/screens/git-light.png" alt="Onglet Git : modifications, commit partiel, branches et historique">
      </picture>
      <br><sub><b>Git</b></sub>
    </td>
  </tr>
</table>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/mobile-home-dark.png">
    <img src="https://mrddream.github.io/Helmshell/screens/mobile-home-light.png" alt="Accueil de Helmshell sur un téléphone" width="220">
  </picture>
  &nbsp;&nbsp;
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/mobile-agents-dark.png">
    <img src="https://mrddream.github.io/Helmshell/screens/mobile-agents-light.png" alt="Une session d'agent sur un téléphone" width="220">
  </picture>
</p>

> [!WARNING]
> **Helmshell donne un shell sur ton serveur.** Garde-le sur ton réseau local ou derrière un VPN
> (Tailscale, NetBird, WireGuard). N'ouvre pas son port sur Internet ; pour un accès par nom de domaine,
> lis d'abord [Accès réseau](#accès-réseau).

## Sommaire

- [Fonctions](#fonctions)
- [Démarrer](#démarrer) : [prérequis](#prérequis) · [installeur en une ligne](#option-a--installeur-en-une-ligne) · [Docker Compose](#option-b--docker-compose) · [systemd](#option-c--service-systemd-à-la-main) · [Coolify / Dokploy](#option-d--coolify-ou-dokploy) · [première connexion](#première-connexion)
- [Mettre à jour](#mettre-à-jour)
- [Agents IA](#agents-ia)
- [Configuration](#configuration)
- [Variables d'environnement](#variables-denvironnement)
- [Sécurité](#sécurité)
- [Développement](#développement)
- [Licence et crédits](#licence-et-crédits)

## Fonctions

### 🤖 Claude Code et Codex, côte à côte

- Un terminal par projet et par agent, dans **tmux** : ferme le navigateur, l'agent continue.
- **Ouvrir Claude**, **Ouvrir Codex**, ou **Ouvrir IA** avec un choix quand les deux sont installés.
- **Tâches de fond** : confie un travail, lis le résultat plus tard, sois prévenu à la fin.
- **État en direct** (travaille, attend ta validation), **utilisation** de chaque forfait dans la barre du
  haut, **contexte** utilisé par chaque session, **conversations** passées à relire ou reprendre.
- **Branches en parallèle** : un `git worktree` et une session d'agent par branche.

### 📁 Tes projets dans le navigateur

- Chaque sous-dossier du dossier des projets est un projet, avec son logo, ses plateformes et ses technos.
- **Fichiers** : éditeur CodeMirror, recherche, aperçu Markdown, images et PDF.
- **Git** : commit partiel, branches, historique, diff, push / pull, import depuis GitHub, GitLab, Codeberg,
  Forgejo ou Gitea.
- **Terminaux** : sessions tmux persistantes pour le serveur, chaque projet et chaque agent.

### 🚀 Déploiements

- Applications **Coolify** ou **Dokploy** : état, domaines, journaux, variables, déployer / redémarrer / arrêter.
- Un nouveau projet peut être relié tout de suite à une application.

### 📱 Pensé pour ton téléphone

- App installable (PWA), avec une mise en page prévue pour les petits écrans.
- Notifications **ntfy**, **Gotify** ou **Discord**, avec des boutons **Oui / Non** qui répondent à la
  question d'un agent.

### 🔒 Fait pour un réseau privé

- Accès limité à ton réseau local, ton VPN, ou un domaine derrière un proxy de confiance.
- Mot de passe avec double authentification (TOTP) en option, ou OIDC (Authentik, Keycloak, Pocket ID…). CSP stricte.

### 🎨 Léger, et à ton goût

- Python 3 (bibliothèque standard), `tmux` et `git` : ni base de données, ni compilation, ni CDN.
- Anglais ou français, cinq styles, dix palettes de couleurs, thèmes clair et sombre.
- Palette de commandes **Ctrl K**, **?** pour les raccourcis, `g` puis une lettre pour changer de page.

<details>
<summary><b>Tous les écrans en un coup d'œil</b></summary>

| Écran | Ce qu'il fait |
| --- | --- |
| Accueil | À traiter (questions des agents, sessions arrêtées, tâches et déploiements en échec, fichiers non validés), tâches de fond, projets récents |
| Projets | Cartes avec le logo, les plateformes et les technos de chaque projet, filtres, recherche, taille |
| Projet | Aperçu (README, activité), Fichiers, Git, Agents (terminal, contexte, tâches de fond, conversations), Déploiement, Réglages |
| Nouveau projet | Dossier vide, clone ou import Git, modèle (Node, Python, Android, site statique), `CLAUDE.md` / `AGENTS.md`, application Coolify / Dokploy |
| Sessions IA | Terminaux des agents de tous les projets, sessions en arrière-plan, conversations récentes des deux agents |
| Terminal | Sessions tmux persistantes (serveur, projet, agent) |
| Déploiements | Applications Coolify ou Dokploy : état, domaines, journaux, historique, actions |
| Serveur | Processeur, mémoire et disque sur 1 h à 30 jours, ressources de l'outil de déploiement, corbeille (30 jours) |
| Paramètres | Agents, Déploiement, Comptes Git, Notifications, Sécurité, Apparence |

</details>

## Démarrer

### Prérequis

- [ ] Un **serveur Linux** avec **systemd** (Ubuntu, Debian, Fedora…), joignable en SSH avec ton utilisateur habituel.
- [ ] **Python 3.10+**, **tmux** et **git** :

  ```bash
  sudo apt install python3 tmux git
  ```

- [ ] Au moins un **agent IA installé et connecté** pour ton utilisateur :

  ```bash
  # Claude Code
  curl -fsSL https://claude.ai/install.sh | bash
  claude              # puis /login

  # OpenAI Codex
  curl -fsSL https://chatgpt.com/codex/install.sh | sh    # ou : npm install -g @openai/codex
  codex login --device-auth
  sudo apt install bubblewrap                              # Ubuntu 24.04+ : nécessaire au bac à sable de Codex
  ```

- [ ] Un **réseau local ou un VPN** entre tes appareils et le serveur, et une **IP fixe** pour le serveur
  (réservation DHCP, ou l'adresse VPN).

### Option A : installeur en une ligne

```bash
curl -fsSL https://raw.githubusercontent.com/MrDDream/Helmshell/main/install.sh | bash
```

Tu préfères lire le script avant :

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
~/helmshell/install.sh
```

L'installeur demande, étape par étape : la langue, les prérequis manquants (installés seulement si tu
réponds « o »), les agents IA, le mode (**systemd** ou **Docker Compose**), le dossier des projets, le port,
les réseaux autorisés et le mot de passe. Il démarre ensuite Helmshell et affiche son adresse et le mot de
passe initial. Relance-le plus tard pour **mettre à jour**.

<details>
<summary><b>Options de l'installeur</b></summary>

| Option | Effet |
| --- | --- |
| `--yes` | Accepter les valeurs par défaut (ne lance jamais sudo) |
| `--lang en\|fr` | Langue de l'installeur et langue initiale de Helmshell |
| `--mode systemd\|docker` | Mode d'installation |
| `--dir CHEMIN` | Où cloner Helmshell |
| `--projects CHEMIN` | Dossier des projets |
| `--port N` | Port de l'interface web |
| `--networks CIDR` | Réseaux autorisés à se connecter |
| `--no-agents-install` | Ne pas proposer d'installer Claude Code ou Codex |
| `--dry-run` | Montrer chaque action sans rien modifier |
| `--help` | Afficher l'aide |

Avec la commande en une ligne : `curl … | bash -s -- --dry-run`.

</details>

### Option B : Docker Compose

L'image `ghcr.io/mrddream/helmshell` (amd64 et arm64) tourne avec **ton** utilisateur, ton dossier personnel
monté au même chemin, et pilote un **serveur tmux de l'hôte** : les sessions d'agents et les terminaux
tournent vraiment sur le serveur et survivent aux redémarrages du conteneur.

**1. Préparer l'hôte** (service tmux sur l'hôte, affiche les valeurs de ton utilisateur) :

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
cd ~/helmshell
./deploy/prepare-host.sh
sudo loginctl enable-linger $USER
```

**2. Créer `deploy/.env`** avec tes valeurs (`id` affiche ton UID et ton GID) :

```dotenv
# Obligatoire : ton dossier personnel et ton utilisateur sur l'hôte
HELMSHELL_HOME=/home/alice
HOST_USER=alice
HOST_UID=1000
HOST_GID=1000

# Facultatif : version de l'image ("latest" ou une version comme 0.2.0), langue (en ou fr), port
HELMSHELL_VERSION=latest
HELMSHELL_LANG=fr
HELMSHELL_PORT=8787

# Facultatif : réseaux autorisés (ton réseau local et ton VPN), dossier des projets, nom du serveur, API Coolify
HELMSHELL_ALLOWED_NETWORKS=192.168.0.0/16,100.64.0.0/10
#HELMSHELL_PROJECTS_ROOT=/home/alice/projets
#HELMSHELL_HOSTNAME=mon-serveur
#COOLIFY_URL=http://host.docker.internal:8000
```

**3. Démarrer** avec le fichier fourni [`deploy/docker-compose.yml`](deploy/docker-compose.yml) :

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

<details>
<summary><b>Le fichier <code>docker-compose.yml</code></b></summary>

```yaml
services:
  helmshell:
    image: ghcr.io/mrddream/helmshell:${HELMSHELL_VERSION:-latest}
    restart: unless-stopped
    ports:
      - "0.0.0.0:${HELMSHELL_PORT:-8787}:8787"        # IPv4 seulement
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      HELMSHELL_HOST: 0.0.0.0
      HELMSHELL_PORT: 8787
      HELMSHELL_LANGUAGE: ${HELMSHELL_LANG:-en}
      HELMSHELL_ALLOWED_NETWORKS: ${HELMSHELL_ALLOWED_NETWORKS:-192.168.0.0/16,100.64.0.0/10}
      HELMSHELL_TMUX_SOCKET: ${HELMSHELL_HOME:?HELMSHELL_HOME must be set}/.config/helmshell/tmux.sock
      HELMSHELL_HOSTNAME: ${HELMSHELL_HOSTNAME:-}
      PROJECTS_ROOT: ${HELMSHELL_PROJECTS_ROOT:-}
      HELMSHELL_UPDATE_CHECK: ${HELMSHELL_UPDATE_CHECK:-1}
      COOLIFY_URL: ${COOLIFY_URL:-http://host.docker.internal:8000}
      HOST_USER: ${HOST_USER:?HOST_USER must be set}
      HOST_UID: ${HOST_UID:-1000}
      HOST_GID: ${HOST_GID:-1000}
      HOST_HOME: ${HELMSHELL_HOME}
    volumes:
      - ${HELMSHELL_HOME}:${HELMSHELL_HOME}
    healthcheck:
      test: ["CMD-SHELL", "python3 -c \"import socket; socket.create_connection(('127.0.0.1', 8787), 5)\""]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 300s
    mem_limit: 2g
    pids_limit: 1024
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add: [CHOWN, DAC_OVERRIDE, FOWNER, FSETID, SETUID, SETGID, KILL]
```

Le fichier commenté du dépôt contient aussi une variante de développement qui exécute le code cloné au lieu
de l'image.

</details>

> [!NOTE]
> Les agents doivent être installés **dans ton dossier personnel** (par exemple `~/.local/bin`, là où les
> installeurs officiels mettent `claude` et `codex`) : une installation npm globale sous `/usr` n'est pas
> visible depuis le conteneur.

`./install.sh --mode docker` fait tout cela à ta place.

### Option C : service systemd à la main

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
cd ~/helmshell
mkdir -p ~/.config/helmshell ~/.config/systemd/user
cp deploy/helmshell.env.example ~/.config/helmshell/helmshell.env && chmod 600 ~/.config/helmshell/helmshell.env
cp deploy/helmshell.service ~/.config/systemd/user/     # adapte le chemin si ce n'est pas ~/helmshell
systemctl --user daemon-reload && systemctl --user enable --now helmshell
sudo loginctl enable-linger $USER                        # pour qu'il tourne sans session ouverte
```

`~/.config/helmshell/helmshell.env` :

```dotenv
HELMSHELL_HOST=0.0.0.0
HELMSHELL_PORT=8787
HELMSHELL_LANGUAGE=fr
HELMSHELL_ALLOWED_NETWORKS=192.168.0.0/16,100.64.0.0/10
#PROJECTS_ROOT=/home/alice/projets
#HELMSHELL_PASSWORD=
```

Commandes utiles :

```bash
systemctl --user status helmshell
journalctl --user -u helmshell -f
systemctl --user restart helmshell
```

### Option D : Coolify ou Dokploy

1. Sur l'hôte, fais l'étape 1 de [Docker Compose](#option-b--docker-compose) (clone, `prepare-host.sh`, linger).
2. Crée une ressource **Docker Compose** (Coolify : *+ New › Docker Compose Empty* ; Dokploy : *Compose*) et
   colle [`deploy/docker-compose.yml`](deploy/docker-compose.yml).
3. Ajoute les variables du `.env` ci-dessus dans les variables d'environnement de la ressource, puis
   déploie. Pas besoin de domaine : l'accès se fait par le port 8787.

### Première connexion

Ouvre `http://<IP-du-serveur>:8787` depuis un appareil du réseau local ou du VPN. Le mot de passe initial est
affiché par l'installeur et rangé dans `~/.config/helmshell/mot-de-passe-initial.txt` (jamais dans les
journaux). Change-le dans **Paramètres › Sécurité** : le fichier est alors supprimé.

Toute la configuration et les données sont dans `~/.config/helmshell/` (droits 700 / 600).

## Mettre à jour

Helmshell consulte les [versions publiées](https://github.com/MrDDream/Helmshell/releases) au plus une fois
par jour et affiche une pastille quand une nouvelle version sort (`HELMSHELL_UPDATE_CHECK=0` pour désactiver).

```bash
# Installeur (garde tes réglages)
~/helmshell/install.sh

# systemd
cd ~/helmshell && git pull --ff-only && systemctl --user restart helmshell

# Docker Compose
docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

Avec Coolify ou Dokploy, redéploie la ressource.

## Agents IA

Claude Code et OpenAI Codex sont indépendants : installe l'un, l'autre, ou les deux. Helmshell les trouve
dans le `PATH` ou `~/.local/bin` (sinon `CLAUDE_BIN` / `CODEX_BIN`). Connecte chacun une fois, dans un
terminal : `claude` puis `/login`, ou `codex login --device-auth`.

| | Claude Code | Codex |
| --- | :---: | :---: |
| Terminal par projet et par branche (tmux) | ✅ | ✅ |
| Tâches de fond avec notification | ✅ | ✅ |
| État en direct : travaille, attend une réponse | ✅ | ✅ |
| Utilisation du forfait dans la barre du haut, sans consommer de jetons | ✅ (`/usage`) | ✅ (`account/rateLimits/read`) |
| Contexte utilisé par chaque session | ✅ | ✅ |
| Conversations passées : lire, reprendre | ✅ | ✅ |
| Modes de permission | 5 modes, de « demander » à « automatique » | Lecture seule, Automatique, Accès complet |
| Remote Control (lien claude.ai et QR code) | ✅ | — |

- **Onglet Agents d'un projet** : un terminal sur la session tmux du projet, créée au besoin avec l'agent
  dedans. Quand l'agent se termine, tu retrouves le shell du projet. En SSH :
  `tmux -S ~/.config/helmshell/tmux.sock attach -t <Projet>` (conteneur) ou `tmux attach -t <Projet>` (systemd).
- **Tâches de fond** : l'agent tourne sans interaction. Si un dépôt a sa propre configuration d'agent
  (`.claude/settings.json`, `.mcp.json`, `.codex/config.toml`), Helmshell te demande d'abord si tu lui fais confiance.
- **Branches en parallèle** (onglet Git) : une copie de travail par branche dans `<projets>/.branches/`, avec
  ses propres sessions.
- **Bac à sable de Codex** : Paramètres › Agents vérifie qu'il démarre. Sur Ubuntu 24.04+, installe
  `bubblewrap`, sinon les modes Lecture seule et Automatique refusent toutes les commandes.

## Configuration

Tout ce qui suit se règle dans la page **Paramètres**.

### Accès réseau

**Paramètres › Sécurité › Accès réseau** choisit d'où Helmshell répond. Les autres adresses reçoivent une
erreur 403 avant même la page de connexion. Tant que rien n'y est coché, `HELMSHELL_ALLOWED_NETWORKS` s'applique.

| Choix | Autorise |
| --- | --- |
| Réseau local | 192.168.x et la machine elle-même (10.x et 172.16-31.x servent à Docker : ajoute-les en IP précises) |
| VPN | 100.64.0.0/10 par défaut (Tailscale, NetBird), ou tes sous-réseaux (WireGuard…) |
| Nom de domaine | Helmshell derrière un proxy (Traefik, Caddy, nginx…) : indique le domaine et le **proxy de confiance** |
| IP précises | Toujours autorisées ; avec un domaine, elles restreignent aussi l'accès par celui-ci |

<details>
<summary><b>Noms d'hôte, pare-feu et récupération</b></summary>

- Helmshell refuse d'enregistrer un réglage qui couperait ta propre connexion. Bloqué quand même : mets
  `HELMSHELL_ACCESS_RESET=1`, redémarre, corrige le réglage, puis retire la variable.
- **Noms d'hôte** : Helmshell répond à son IP, aux noms locaux ou VPN (`mon-serveur`, `*.local`, `*.ts.net`,
  `*.netbird.cloud`…) et aux domaines configurés ; tout autre nom reçoit une erreur 421 (protection contre le
  DNS rebinding). Ajoute des noms avec `HELMSHELL_ALLOWED_HOSTS=nom1,nom2`.
- **Pare-feu** : avec Docker, le port publié contourne UFW, c'est donc le filtre ci-dessus qui te protège.
  Avec systemd, ouvre le port seulement sur l'interface du VPN, par exemple
  `sudo ufw allow in on wt0 to any port 8787 proto tcp`. Si ta box laisse entrer l'IPv6, active son pare-feu IPv6.

</details>

### Connexion

- **Mot de passe** (PBKDF2) avec **double authentification** (TOTP) en option et 8 codes de secours.
- **OIDC** (Authentik, Keycloak, Pocket ID, Authelia, Zitadel, Google…) : URI de redirection
  `<adresse de Helmshell>/auth/oidc/callback`, accès limité à des e-mails vérifiés ou à un groupe, option
  « OIDC seul ». Fournisseur en panne : `HELMSHELL_OIDC_DISABLE=1` puis redémarrage.
- Sessions de 7 jours renouvelées à l'usage ; **Déconnecter tous les appareils** dans Paramètres › Sécurité.
- Téléphone de double authentification perdu sans code de secours : vide `totp_secret` dans
  `~/.config/helmshell/config.json`, puis redémarre.

### Notifications

**ntfy** (sujet long et secret, de préférence avec un jeton), **Gotify** ou **Discord**. Quand un agent pose
une question, les boutons **Oui / Non** y répondent : liens signés, valables 10 minutes, à usage unique.

### Comptes Git

GitHub, GitLab, Codeberg, Forgejo ou Gitea, avec un jeton. **Importer** dans un nouveau projet liste tes
dépôts ; le jeton authentifie aussi `clone`, `pull` et `push` en HTTPS, par l'environnement de git (jamais
dans la ligne de commande ni dans `.git/config`).

### Déploiement

Choisis *Aucun*, *Coolify* ou *Dokploy*. Sans outil, tout ce qui concerne le déploiement disparaît.

- **Coolify** : *Keys & Tokens › API tokens* (*root* ou *write*), URL de l'API `http://localhost:8000`
  (systemd) ou `http://host.docker.internal:8000` (conteneur).
- **Dokploy** : *Settings › Profile › API/CLI*, URL `http://host.docker.internal:3000` depuis le conteneur.

### Apparence et app

Langue, style, couleurs et app installable (PWA) sont dans **Paramètres › Apparence**. Les navigateurs
n'installent une app qu'en **HTTPS** : utilise un nom de domaine ou le HTTPS de ton VPN.

## Variables d'environnement

Toutes facultatives. systemd : `~/.config/helmshell/helmshell.env` ; conteneur : `deploy/.env` (voir
[`deploy/.env.example`](deploy/.env.example)).

<details>
<summary><b>Toutes les variables</b></summary>

| Variable | Rôle |
| --- | --- |
| `HELMSHELL_HOST`, `HELMSHELL_PORT` | Adresse et port d'écoute (`0.0.0.0`, `8787`) |
| `HELMSHELL_LANGUAGE` | Langue initiale de l'interface : `en` ou `fr` |
| `HELMSHELL_PASSWORD` | Mot de passe fixe (sinon généré, modifiable dans les Paramètres) |
| `HELMSHELL_ALLOWED_NETWORKS` | Réseaux autorisés tant que l'accès réseau n'est pas réglé dans les Paramètres |
| `HELMSHELL_ALLOWED_HOSTS` | Noms d'hôte acceptés en plus |
| `HELMSHELL_ACCESS_RESET=1` | Ignorer le réglage d'accès réseau (récupération) |
| `HELMSHELL_OIDC_DISABLE=1` | Désactiver OIDC et rétablir le mot de passe (récupération) |
| `HELMSHELL_PUBLIC_URL` | Adresse de Helmshell vue de tes appareils (liens des notifications, OIDC) |
| `HELMSHELL_DATA` | Dossier des données (`~/.config/helmshell`) |
| `HELMSHELL_TMUX_SOCKET` | Socket du serveur tmux de l'hôte (mode conteneur) |
| `HELMSHELL_HOSTNAME` | Nom du serveur affiché |
| `PROJECTS_ROOT` | Dossier des projets |
| `CLAUDE_BIN`, `CODEX_BIN` | Chemins des exécutables `claude` et `codex` |
| `HELMSHELL_UPDATE_CHECK=0` | Ne pas consulter GitHub pour les nouvelles versions |
| `COOLIFY_URL`, `COOLIFY_TOKEN`, `DOKPLOY_URL`, `DOKPLOY_TOKEN` | Outil de déploiement (aussi dans les Paramètres) |

</details>

## Sécurité

- Cookie de session signé `HttpOnly` + `SameSite=Strict`, en-tête anti-CSRF, limite des tentatives de
  connexion, journal des connexions.
- CSP stricte (aucun script externe), `nosniff`, `frame-ancestors 'none'`, contrôle du nom d'hôte.
- Chemins de fichiers confinés au projet ; contenu des dépôts traité comme non fiable (Markdown nettoyé,
  lectures bornées, confirmation avant de faire confiance à une configuration d'agent).
- Les secrets du serveur ne sont jamais transmis aux terminaux ni aux sessions d'agents.
- Conteneur : image de base épinglée, IPv4 seulement, pas d'élévation de privilèges, capacités réduites,
  limites de mémoire et de processus. Les images sont construites par GitHub Actions, avec des actions
  épinglées par SHA de commit.

Une faille ? Signale-la en privé dans l'[onglet Security](https://github.com/MrDDream/Helmshell/security)
plutôt que dans une issue publique.

## Développement

```bash
HELMSHELL_PORT=8787 python3 server.py    # démarrage
python3 tests/smoke.py                   # instance isolée, appelle chaque route
python3 tests/test_updates.py            # vérification des mises à jour contre une fausse API GitHub
python3 tests/check_i18n.py              # toutes les phrases traduites
python3 tests/check_js.py static/*.js    # syntaxe JavaScript (sans node)
bash -n install.sh && ./install.sh --dry-run --yes
```

<details>
<summary><b>Organisation du dépôt et outils</b></summary>

```
server.py      serveur HTTP, routes de l'API, authentification
helmshell/     configuration, projets, Git, agents (tmux), terminaux, tâches, accès, OIDC, TOTP,
               notifications, forges Git, Coolify / Dokploy, statistiques, mises à jour
static/        interface (JS sans framework ni compilation), vendor/, icônes, palettes, traductions
deploy/        docker-compose.yml, .env.example, script du conteneur, services systemd
site/          site web (GitHub Pages) : page d'accueil, démo en ligne
tests/         test de fumée, mises à jour, traductions, contrôle JavaScript
tools/         bibliothèques, icônes, palettes, logos, construction du site et captures
Dockerfile     image publiée sur ghcr.io/mrddream/helmshell
```

```bash
python3 tools/vendor.py                 # bibliothèques du navigateur → static/vendor (sommes vérifiées)
python3 tools/fetch_icons.py            # icônes des styles → static/icons.js
python3 tools/make_palettes.py          # couleurs → static/palettes.css
python3 tools/make_icons.py             # logo et icônes de l'app
python3 tools/fetch_platform_logos.py   # logos des plateformes
python3 tools/build_site.py --serve 8799   # site et démo sur http://127.0.0.1:8799/Helmshell/
```

Publier une version : augmente [`VERSION`](VERSION), crée le tag `vX.Y.Z` et pousse-le ; le
[workflow Docker](.github/workflows/docker.yml) publie l'image.

</details>

## Licence et crédits

Helmshell est publié sous licence [MIT](LICENSE). Les bibliothèques, icônes et polices incluses gardent leur
propre licence : voir [THIRD_PARTY.md](THIRD_PARTY.md).

Helmshell est un projet indépendant, **sans lien avec Anthropic ni OpenAI**. Claude et Claude Code sont des
marques d'Anthropic ; OpenAI et Codex sont des marques d'OpenAI.
