<div align="center">

<img src="static/logo.svg" alt="Logo de Helmshell" width="96" height="96">

# Helmshell

**Pilote ton serveur Linux depuis n'importe quel navigateur ou téléphone.**

[![Dernière version](https://img.shields.io/github/v/release/MrDDream/Helmshell?label=version&color=1F4E79)](https://github.com/MrDDream/Helmshell/releases/latest)
[![Tests](https://img.shields.io/github/actions/workflow/status/MrDDream/Helmshell/tests.yml?branch=main&label=tests)](https://github.com/MrDDream/Helmshell/actions/workflows/tests.yml)
[![Image Docker](https://img.shields.io/badge/ghcr.io-mrddream%2Fhelmshell-1F4E79?logo=docker&logoColor=white)](https://github.com/MrDDream/Helmshell/pkgs/container/helmshell)
[![Licence : MIT](https://img.shields.io/github/license/MrDDream/Helmshell?label=licence&color=D97757)](LICENSE)

[Site web](https://mrddream.github.io/Helmshell/?lang=fr) · [Démo en ligne](https://mrddream.github.io/Helmshell/demo/?lang=fr) · [English](README.md) · **Français**

</div>

Console web auto-hébergée pour piloter ton serveur Linux depuis le navigateur ou le téléphone : projets et
fichiers, Git, terminaux, sessions d'agents IA de code (**Claude Code** et **OpenAI Codex**, dans tmux) et
déploiements **Coolify** ou **Dokploy**. Elle s'installe comme une application (PWA), en français ou en
anglais, avec cinq styles d'apparence.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/home-dark.png">
    <img src="https://mrddream.github.io/Helmshell/screens/home-light.png" alt="Écran d'accueil de Helmshell : éléments à traiter, tâches de fond et projets récents" width="100%">
  </picture>
</p>

<table>
  <tr>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/project-dark.png">
        <img src="https://mrddream.github.io/Helmshell/screens/project-light.png" alt="Un projet : onglets aperçu, fichiers, Git, agent, déploiement et réglages">
      </picture>
      <br><sub><b>Projet</b></sub>
    </td>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/agents-dark.png">
        <img src="https://mrddream.github.io/Helmshell/screens/agents-light.png" alt="Sessions des agents : terminaux Claude Code et Codex de tous les projets">
      </picture>
      <br><sub><b>Sessions des agents</b></sub>
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
    <img src="https://mrddream.github.io/Helmshell/screens/mobile-home-light.png" alt="Écran d'accueil de Helmshell sur un téléphone" width="220">
  </picture>
  &nbsp;&nbsp;
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/mobile-agents-dark.png">
    <img src="https://mrddream.github.io/Helmshell/screens/mobile-agents-light.png" alt="Une session d'agent sur un téléphone" width="220">
  </picture>
</p>

> [!WARNING]
> **Helmshell donne un shell sur ton serveur.** Garde-le sur ton réseau local ou derrière un VPN
> (Tailscale, NetBird, WireGuard). Ne redirige pas son port sur Internet ; si tu veux un accès par nom de
> domaine, lis d'abord [Accès réseau](#accès-réseau).

## Points forts

- **Claude Code et Codex côte à côte.** Sessions d'agents dans des sessions tmux persistantes, par projet et
  par tâche ; tâches de fond ; branches en parallèle avec `git worktree`.
- **Tes projets dans le navigateur.** Fichiers avec un éditeur CodeMirror, Git (commit partiel, branches,
  historique, diff), terminaux persistants. Chaque sous-dossier du dossier des projets est un projet.
- **Déploiements.** Applications Coolify ou Dokploy : état, domaines, logs, variables, déployer / redémarrer /
  arrêter.
- **Réponds depuis ton téléphone.** Notifications ntfy, Gotify ou Discord avec boutons Oui / Non quand un
  agent pose une question ; installable comme une application (PWA).
- **Pensé pour un réseau privé.** Accès limité à ton réseau local, ton VPN ou un domaine derrière un proxy de
  confiance ; mot de passe avec double authentification (TOTP) facultative, OIDC, CSP stricte.
- **Rien à installer de plus que l'essentiel.** Python 3 (bibliothèque standard seulement), `tmux`, `git` et
  ton agent IA. Les bibliothèques du navigateur sont livrées dans le dépôt (`static/vendor`) : aucun CDN,
  aucune étape de build.
- **À ton goût.** Français ou anglais, cinq styles d'apparence, dix palettes de couleurs, clair et sombre.

**Sommaire :** [Ce qu'il fait](#ce-quil-fait) · [Avant de commencer](#avant-de-commencer) ·
[Installation rapide](#installation-rapide) · [Installation manuelle](#installation-manuelle) ·
[Premier lancement](#premier-lancement) · [Mettre à jour](#mettre-à-jour) · [Configuration](#configuration) ·
[Agents](#agents) · [Variables d'environnement](#variables-denvironnement) · [Sécurité](#sécurité) ·
[Développement](#développement) · [Licence et crédits](#licence-et-crédits)

## Ce qu'il fait

| Écran | Ce qu'il fait |
| --- | --- |
| Accueil | « À traiter » (questions des agents, sessions arrêtées, tâches et déploiements en échec, fichiers non validés), tâches de fond, projets récents |
| Projets | Cartes avec le logo, les plateformes et les technos de chaque projet, filtres, recherche, taille |
| Projet | Aperçu (README rendu, activité), Fichiers (éditeur CodeMirror, recherche, Markdown, images, PDF), Git (commit partiel, branches, branches en parallèle, historique, diff), Agent (terminal tmux, contexte utilisé, tâches de fond, conversations passées), Déploiement (logs, variables, domaines), Réglages |
| Nouveau projet | Dossier vide, clone Git (ou import depuis un compte lié), modèle (Node, Python, Android, site statique), fichier d'instructions de l'agent, application Coolify / Dokploy |
| Sessions des agents | Terminaux des agents de tous les projets, conversations récentes, reprise |
| Terminal | Sessions tmux persistantes (serveur, projet, agent) |
| Déploiements | Applications Coolify ou Dokploy : état, domaines, logs, historique, déployer / redémarrer / arrêter |
| Serveur | Processeur, mémoire et disque sur 1 h à 30 jours, ressources de l'outil de déploiement, corbeille (30 jours) |
| Paramètres | Agents, Déploiement, comptes Git, Notifications, Sécurité (accès réseau, OIDC, mot de passe, 2FA), Apparence |

Partout : **Ctrl K** (palette), **?** (raccourcis), `g` puis une lettre pour changer de page. L'interface se met
à jour en direct ; l'onglet affiche « (1) Helmshell » quand un agent attend une réponse.

## Avant de commencer

À faire **avant** d'installer Helmshell :

1. Un **serveur Linux** avec **systemd** (Ubuntu, Debian, Fedora…), accessible en SSH, avec ton utilisateur
   habituel (pas root).
2. **Python 3.10** ou plus, **tmux** et **git** : `sudo apt install python3 tmux git` (l'installateur propose
   de le faire, après t'avoir demandé).
3. Au moins un **agent IA installé et connecté** pour ton utilisateur :
   - **Claude Code** : `curl -fsSL https://claude.ai/install.sh | bash`, puis lance `claude` et `/login`.
     Voir la [documentation de Claude Code](https://docs.claude.com/claude-code).
   - **OpenAI Codex CLI** (Node.js 18 ou plus pour l'installation par npm) : `npm install -g @openai/codex`
     (ou `curl -fsSL https://chatgpt.com/codex/install.sh | sh`), puis `codex login`
     (`codex login --device-auth` en SSH). Sur Ubuntu 24.04 et suivantes, installe aussi le paquet système
     `bubblewrap` (`sudo apt install bubblewrap`) : sans lui, le bac à sable de Codex ne démarre pas et ses
     modes Lecture seule et Automatique refusent toutes les commandes (Paramètres › Agents le vérifie).
4. Un **réseau local ou un VPN** (Tailscale, NetBird, WireGuard) entre tes appareils et le serveur, et une
   **IP fixe** pour le serveur (bail DHCP réservé dans ta box, ou l'adresse du VPN).

## Installation rapide

```bash
curl -fsSL https://raw.githubusercontent.com/MrDDream/Helmshell/main/install.sh | bash
```

Tu préfères lire le script avant ? `git clone https://github.com/MrDDream/Helmshell.git ~/helmshell && ~/helmshell/install.sh`.

L'installateur clone Helmshell (par défaut dans `~/helmshell`), puis demande, étape par étape :

1. la **langue** (anglais ou français), qui devient aussi la langue initiale de Helmshell ;
2. les **prérequis** : vérifie Python 3.10+, tmux et git, et propose d'installer ce qui manque avec
   `sudo apt-get` / `sudo dnf` (seulement si tu réponds « o ») ;
3. les **agents IA** : détecte `claude` et `codex` et propose leur installateur officiel (après confirmation) ;
4. le **mode** : service utilisateur systemd (par défaut) ou Docker Compose (si `docker compose` fonctionne) ;
5. le **dossier des projets** (`~/projets`, ou `~/projects` s'il existe déjà) ;
6. le **port** (8787) ;
7. les **réseaux autorisés** : ton réseau local (ex. `192.168.1.0/24`) et les plages de tes VPN sont
   détectés, à modifier si besoin ;
8. le **mot de passe** : généré par Helmshell au premier lancement (recommandé), ou un mot de passe fixe.

Il écrit ensuite `~/.config/helmshell/helmshell.env` (chmod 600), démarre Helmshell et affiche son adresse et
le mot de passe initial. Relancé sur un serveur déjà installé, il propose plutôt une **mise à jour**
(réglages conservés).

<details>
<summary><b>Options de l'installateur</b></summary>

| Option | Effet |
| --- | --- |
| `--yes` | Réponses par défaut (jamais de sudo) |
| `--lang en\|fr` | Langue de l'installateur et langue initiale de Helmshell |
| `--mode systemd\|docker` | Mode d'installation |
| `--dir CHEMIN` | Où cloner Helmshell |
| `--projects CHEMIN` | Dossier des projets |
| `--port N` | Port de l'interface web |
| `--networks CIDR` | Réseaux autorisés à se connecter |
| `--no-agents-install` | Ne pas proposer d'installer Claude Code ou Codex |
| `--dry-run` | Affiche chaque action sans rien modifier |
| `--help` | Affiche l'aide |

Avec la ligne unique : `curl … | bash -s -- --dry-run`.

</details>

## Installation manuelle

### Option 1 : service systemd (recommandé)

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
cd ~/helmshell
./install.sh --mode systemd --lang fr
sudo loginctl enable-linger $USER   # pour que le service tourne sans session ouverte
```

Entièrement à la main : copie `deploy/helmshell.service` dans `~/.config/systemd/user/` (adapte le chemin
si Helmshell n'est pas dans `~/helmshell`), copie `deploy/helmshell.env.example` en
`~/.config/helmshell/helmshell.env` (chmod 600, mets `HELMSHELL_LANGUAGE=fr`), puis
`systemctl --user daemon-reload && systemctl --user enable --now helmshell`.

```bash
systemctl --user status helmshell
journalctl --user -u helmshell -f
systemctl --user restart helmshell
```

### Option 2 : Docker Compose

L'image `ghcr.io/mrddream/helmshell` (amd64 et arm64, construite à partir du [`Dockerfile`](Dockerfile) à
chaque version) tourne sous **ton** utilisateur (même UID, même dossier personnel) et pilote un **serveur
tmux de l'hôte** : les sessions des agents et les terminaux tournent vraiment sur le serveur et survivent
aux redémarrages du conteneur.

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
cd ~/helmshell
./deploy/prepare-host.sh            # serveur tmux de l'hôte (service helmshell-tmux), affiche tes valeurs
sudo loginctl enable-linger $USER
cp deploy/.env.example deploy/.env  # renseigne HELMSHELL_HOME, HOST_USER, HOST_UID, HOST_GID, HELMSHELL_LANG=fr
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

(`./install.sh --mode docker` fait la même chose.) Le conteneur monte ton dossier personnel au même endroit
(projets, `~/.claude`, `~/.codex`, clés SSH, Git). Les agents doivent donc être installés **dans ton dossier
personnel** (ex. `~/.local/bin`, où l'installateur de Claude Code place `claude`) : une installation npm
globale sous `/usr` n'est pas visible depuis le conteneur. Pour figer une version : `HELMSHELL_VERSION=0.1.0`
dans `deploy/.env`.

Pour exécuter le code cloné sur l'hôte plutôt que l'image (développement), voir la variante en commentaire
dans [`deploy/docker-compose.yml`](deploy/docker-compose.yml).

### Option 3 : Coolify ou Dokploy

1. Sur l'hôte : clone le dépôt et lance `./deploy/prepare-host.sh` puis `sudo loginctl enable-linger $USER`.
2. Crée une ressource **Docker Compose** (Coolify : *+ New › Docker Compose Empty* ; Dokploy : *Compose*) et
   colle le contenu de [`deploy/docker-compose.yml`](deploy/docker-compose.yml).
3. Renseigne les variables de [`deploy/.env.example`](deploy/.env.example) dans l'onglet des variables
   d'environnement de la ressource, puis déploie. Pas besoin de domaine : l'accès se fait par le port 8787.

## Premier lancement

Ouvre `http://<IP-du-serveur>:8787` depuis un appareil du réseau local ou du VPN. Le mot de passe initial
est affiché par l'installateur et rangé dans `~/.config/helmshell/mot-de-passe-initial.txt` (jamais dans les
journaux). Change-le dans **Paramètres › Sécurité** : le fichier est alors supprimé.

Toute la configuration et les données de Helmshell sont dans `~/.config/helmshell/` (droits 700 / 600).

## Mettre à jour

Helmshell consulte les [versions publiées sur GitHub](https://github.com/MrDDream/Helmshell/releases) au plus
une fois par jour et affiche un badge quand une nouvelle version existe (désactivable avec
`HELMSHELL_UPDATE_CHECK=0`). Pour mettre à jour :

```bash
~/helmshell/install.sh                                     # propose la mise à jour, garde tes réglages
# ou à la main, systemd :
cd ~/helmshell && git pull --ff-only && systemctl --user restart helmshell
# ou à la main, Docker Compose :
docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

Avec Coolify ou Dokploy, redéploie la ressource (l'image est retéléchargée).

## Configuration

### Langue et apparence

**Paramètres › Apparence** : langue (français ou anglais), style, couleurs et application installable. La
langue initiale vient de l'installateur (`HELMSHELL_LANGUAGE`).

### Accès réseau

**Paramètres › Sécurité › Accès réseau** choisit d'où Helmshell répond ; les autres adresses reçoivent une 403
avant même la page de connexion. Tant que rien n'y est coché, c'est la variable `HELMSHELL_ALLOWED_NETWORKS`
qui s'applique (les réseaux choisis dans l'installateur, ou 192.168.x et la plage des VPN Tailscale / NetBird
dans les fichiers fournis).

- **Réseau local** : 192.168.x et la machine elle-même. Les réseaux 10.x et 172.16-31.x n'en font pas partie,
  car ce sont aussi ceux de Docker ; un réseau local en 10.x ou 172.x s'ajoute dans **IP précises**.
- **VPN** : 100.64.0.0/10 par défaut (Tailscale, NetBird), ou les sous-réseaux indiqués (WireGuard…).
- **Nom de domaine** : Helmshell derrière un proxy (Traefik de Coolify ou Dokploy, Caddy, nginx…). Déclare le
  domaine dans le proxy vers le port 8787, puis indique dans Helmshell le domaine et le **proxy de confiance**
  (son adresse ou son réseau ; l'encart « Ce que voit le serveur » l'affiche). Seul ce proxy peut annoncer
  l'adresse réelle du visiteur et le https.
- **IP précises** : toujours autorisées ; avec le domaine coché, elles limitent aussi l'accès par le domaine.

Helmshell refuse d'enregistrer un réglage qui couperait ta propre connexion. Coupé quand même : définis
`HELMSHELL_ACCESS_RESET=1`, redémarre, corrige le réglage, puis retire la variable.

**Nom d'hôte.** Helmshell répond à son adresse IP, aux noms locaux ou de VPN (`mon-serveur`, `*.local`,
`*.netbird.cloud`, `*.ts.net`…), au domaine de l'« Adresse de Helmshell » et aux domaines déclarés ci-dessus.
Tout autre nom reçoit une erreur 421 (protection contre le « DNS rebinding »). Pour en autoriser un autre :
`HELMSHELL_ALLOWED_HOSTS=nom1,nom2`.

**Pare-feu.** Avec Docker, le port publié contourne UFW : c'est le filtre ci-dessus qui protège. En systemd,
ouvre le port seulement sur l'interface du VPN, par exemple `sudo ufw allow in on wt0 to any port 8787 proto tcp`.
Si ta box laisse entrer l'IPv6, active son pare-feu IPv6.

### Connexion

- **Mot de passe** (haché en PBKDF2) et **double authentification** facultative (TOTP : Google Authenticator,
  Aegis, 2FAS, Bitwarden…) avec 8 codes de secours.
- **OIDC** (Authentik, Keycloak, Pocket ID, Authelia, Zitadel, Google…) : URI de redirection
  `<adresse de Helmshell>/auth/oidc/callback`, accès limité à des adresses e-mail vérifiées ou à un groupe.
  Après un test réussi, « N'autoriser que l'OIDC » refuse le mot de passe. Fournisseur en panne :
  `HELMSHELL_OIDC_DISABLE=1` et redémarrage.
- Sessions de 7 jours renouvelées à l'usage ; **Déconnecter tous les appareils** dans Paramètres › Sécurité.
- Téléphone 2FA perdu sans code de secours : sur le serveur, vide `totp_secret` dans
  `~/.config/helmshell/config.json` puis redémarre Helmshell.

### Notifications

Paramètres › Notifications : **ntfy** (sujet long et secret, de préférence avec jeton), **Gotify** ou **Discord**.
Quand un agent pose une question, les boutons ou liens **Oui / Non** y répondent : liens signés, valables
10 minutes, à usage unique, acceptés seulement si la question attend encore.

### Comptes Git

Paramètres › Git : GitHub, GitLab, Codeberg, Forgejo ou Gitea, avec un jeton (lecture, lecture et écriture,
ou complet). Le bouton **Importer** d'un nouveau projet liste alors tes dépôts. Le jeton authentifie aussi
`git clone`, `pull` et `push` en HTTPS : il passe par l'environnement de git, jamais par la ligne de commande
ni par le `.git/config` du dépôt.

### Déploiement (Coolify ou Dokploy)

**Paramètres › Déploiement** choisit l'outil : *Aucun*, *Coolify* ou *Dokploy*. Sans outil, tout ce qui
concerne le déploiement disparaît de l'interface.

- **Coolify** : *Keys & Tokens › API tokens*, jeton *root* ou *write*, avec l'URL de l'API
  (`http://localhost:8000` en systemd, `http://host.docker.internal:8000` depuis le conteneur).
- **Dokploy** : *Settings › Profile › API/CLI*, avec l'URL de Dokploy (`http://host.docker.internal:3000`
  depuis le conteneur). Le retour à une version précédente se fait depuis Dokploy.

### Application installable (PWA)

Helmshell s'installe comme une application (icône, fenêtre à part, raccourcis), mais les navigateurs ne le
permettent qu'en **HTTPS** : passe par un nom de domaine (voir [Accès réseau](#accès-réseau)) ou par le HTTPS
de ton VPN. Paramètres › Apparence › Application indique ce qui est possible depuis l'appareil utilisé.

## Agents

Claude Code et OpenAI Codex peuvent cohabiter : tu choisis l'agent par projet et par tâche. Helmshell
détecte les agents installés (`claude` et `codex` dans le PATH ou `~/.local/bin` ; sinon `CLAUDE_BIN` /
`CODEX_BIN`). Chaque agent doit être connecté une fois pour ton utilisateur, dans un terminal : `claude` puis
`/login`, ou `codex login` (`codex login --device-auth` en SSH ou depuis un terminal de Helmshell).

Les deux agents sont indépendants et ont les mêmes fonctions : avec un seul installé, le bouton d'un projet
affiche **Ouvrir Claude** ou **Ouvrir Codex** ; avec les deux, **Ouvrir IA** demande lequel ouvrir. Chacun a
son bouton d'utilisation dans la barre du haut (limites du forfait et leur réinitialisation, rythme, contexte
des sessions ouvertes, actualisés au délai choisi dans Paramètres › Agents, sans consommer de jetons), son
état en direct dans le terminal (travaille, attend ta validation) avec notifications, et ses conversations
dans la page Sessions IA.

- **Onglet Agent d'un projet** : un terminal attaché à la session tmux qui porte le nom du dossier, créée au
  besoin avec l'agent lancé dedans (« Reprendre la dernière conversation » au choix). Quand l'agent se
  termine, on retrouve le shell du projet. Depuis le serveur en SSH :
  `tmux -S ~/.config/helmshell/tmux.sock attach -t <Projet>` (en conteneur) ou `tmux attach -t <Projet>` (systemd).
- **Tâches de fond** : « Confier une tâche » lance l'agent en mode non interactif dans tmux avec la consigne ;
  le résultat est lisible dans Helmshell et une notification part à la fin. Si un dépôt a sa propre
  configuration d'agent (ex. `.claude/settings.json`, `.mcp.json`), Helmshell demande d'abord si tu lui fais
  confiance.
- **Branches en parallèle** : onglet Git › Branches en parallèle : une copie de travail (`git worktree`) par
  branche, dans `<projets>/.branches/`, avec sa propre session d'agent.
- **Seulement avec Claude Code** : **Remote Control** (lien claude.ai et QR code pour suivre une session
  depuis l'application Claude) et les jauges d'**utilisation du forfait**.

## Variables d'environnement

Toutes facultatives. En systemd : `~/.config/helmshell/helmshell.env` ;
en conteneur : voir `deploy/.env.example` (les noms `HELMSHELL_*` y correspondent à celles-ci).

<details>
<summary><b>Toutes les variables</b></summary>

| Variable | Rôle |
| --- | --- |
| `HELMSHELL_HOST`, `HELMSHELL_PORT` | Adresse et port d'écoute (`0.0.0.0`, `8787`) |
| `HELMSHELL_LANGUAGE` | Langue initiale de l'interface : `en` ou `fr` (ensuite Paramètres › Apparence) |
| `HELMSHELL_PASSWORD` | Mot de passe fixe (sinon : généré, modifiable dans Paramètres) |
| `HELMSHELL_ALLOWED_NETWORKS` | Réseaux autorisés tant que l'accès réseau n'est pas réglé dans Paramètres |
| `HELMSHELL_ALLOWED_HOSTS` | Noms d'hôte supplémentaires acceptés |
| `HELMSHELL_ACCESS_RESET=1` | Ignore le réglage d'accès réseau (secours) |
| `HELMSHELL_OIDC_DISABLE=1` | Désactive l'OIDC et rétablit le mot de passe (secours) |
| `HELMSHELL_PUBLIC_URL` | Adresse de Helmshell vue depuis tes appareils (liens des notifications, OIDC) |
| `HELMSHELL_DATA` | Dossier des données (`~/.config/helmshell`) |
| `HELMSHELL_TMUX_SOCKET` | Socket du serveur tmux de l'hôte (mode conteneur) |
| `HELMSHELL_HOSTNAME` | Nom du serveur affiché |
| `PROJECTS_ROOT` | Dossier des projets |
| `CLAUDE_BIN` | Chemin de l'exécutable `claude` |
| `CODEX_BIN` | Chemin de l'exécutable `codex` |
| `HELMSHELL_UPDATE_CHECK=0` | Ne pas consulter GitHub pour les nouvelles versions |
| `COOLIFY_URL`, `COOLIFY_TOKEN`, `DOKPLOY_URL`, `DOKPLOY_TOKEN` | Outil de déploiement (réglable aussi dans Paramètres) |

</details>

## Sécurité

- Cookie de session signé `HttpOnly` + `SameSite=Strict`, en-tête anti-CSRF sur toutes les requêtes qui
  modifient, limitation des tentatives de connexion (par IP et au total), journal des connexions séparé.
- CSP stricte (aucun script externe), en-têtes `nosniff` et `frame-ancestors 'none'`, contrôle du nom d'hôte.
- Chemins de fichiers confinés au projet ; fichiers des projets servis en pièce jointe ou en bac à sable.
- Le contenu des dépôts est traité comme non fiable : Markdown nettoyé par DOMPurify sans actions de l'appli,
  lectures de fichiers bornées, agent cloisonné pour les messages de commit, confirmation avant une tâche.
- Les secrets du serveur ne sont pas transmis aux terminaux ni aux sessions des agents.
- Conteneur : image de base épinglée, IPv4 seulement, pas d'élévation de privilèges, capacités réduites,
  limites de mémoire et de processus. Les images publiées sont construites par GitHub Actions, avec des
  actions épinglées par empreinte de commit.

Une faille ? Merci de la signaler en privé (onglet *Security* du
[dépôt GitHub](https://github.com/MrDDream/Helmshell/security)) plutôt que dans une issue publique.

## Développement

```bash
HELMSHELL_PORT=8787 python3 server.py      # lancement manuel
python3 tests/smoke.py                   # instance isolée, appelle toutes les routes
python3 tests/test_updates.py            # vérification des mises à jour contre une fausse API GitHub locale
python3 tests/check_js.py static/*.js    # syntaxe JavaScript (sans node)
bash -n install.sh && ./install.sh --dry-run --yes
```

<details>
<summary><b>Outils de génération et organisation du dépôt</b></summary>

Outils (à relancer seulement pour changer de version) :

```bash
python3 tools/vendor.py        # bibliothèques du navigateur → static/vendor (empreintes npm vérifiées)
python3 tools/fetch_icons.py   # icônes des styles → static/icons.js
python3 tools/make_palettes.py # couleurs → static/palettes.css
python3 tools/make_icons.py    # logo et icônes de l'application
python3 tools/fetch_platform_logos.py   # logos des plateformes (sources à licence connue)
```

```
server.py              serveur HTTP, routes de l'API, authentification
helmshell/               config, projets, Git, agents (tmux), terminaux, tâches, accès réseau, OIDC, TOTP,
                       notifications, forges Git, Coolify / Dokploy, statistiques du serveur, mises à jour
static/                interface (JS natif, sans étape de build), vendor/, icônes, palettes
deploy/                docker-compose.yml, .env.example, script du conteneur, services systemd
tests/                 test de fumée de l'API, test des mises à jour, vérification JavaScript
tools/                 génération des icônes, palettes et bibliothèques
site/                  site web (GitHub Pages) : page d'accueil, démo, captures d'écran
Dockerfile             image publiée sur ghcr.io/mrddream/helmshell
```

</details>

Publier une version : change [`VERSION`](VERSION), crée l'étiquette `vX.Y.Z` et pousse-la ; le
[workflow Docker](.github/workflows/docker.yml) publie l'image.

## Licence et crédits

Helmshell est distribué sous licence [MIT](LICENSE). Les bibliothèques, icônes et polices incluses gardent
leur propre licence : voir [THIRD_PARTY.md](THIRD_PARTY.md).

Helmshell est un projet indépendant, **sans lien avec Anthropic ni OpenAI**. Claude et Claude Code sont des
marques d'Anthropic ; OpenAI et Codex sont des marques d'OpenAI.
