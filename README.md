<div align="center">

<img src="static/logo.svg" alt="Helmshell logo" width="96" height="96">

# Helmshell

**Drive your Linux server and its AI coding agents from any browser or phone.**

[![Latest release](https://img.shields.io/github/v/release/MrDDream/Helmshell?label=release&color=1F4E79)](https://github.com/MrDDream/Helmshell/releases/latest)
[![Tests](https://img.shields.io/github/actions/workflow/status/MrDDream/Helmshell/tests.yml?branch=main&label=tests)](https://github.com/MrDDream/Helmshell/actions/workflows/tests.yml)
[![Docker image](https://img.shields.io/badge/ghcr.io-mrddream%2Fhelmshell-1F4E79?logo=docker&logoColor=white)](https://github.com/MrDDream/Helmshell/pkgs/container/helmshell)
[![License: MIT](https://img.shields.io/github/license/MrDDream/Helmshell?color=D97757)](LICENSE)

[Website](https://mrddream.github.io/Helmshell/) · [Live demo](https://mrddream.github.io/Helmshell/demo/) · **English** · [Français](README.fr.md)

</div>

Helmshell is a **self-hosted web console** for your own server. Open it from your laptop or your phone and
you get your projects, their files and Git history, persistent terminals, your **Claude Code** and
**OpenAI Codex** sessions, and your **Coolify** or **Dokploy** deployments, in one place.

Start an agent on a project, close the tab, and pick it up later from your phone: sessions live in tmux on
the server, and Helmshell notifies you when an agent is done or waiting for your answer.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/home-dark.png">
    <img src="https://mrddream.github.io/Helmshell/screens/home-light.png" alt="Helmshell home screen: items to handle, background tasks and recent projects" width="100%">
  </picture>
</p>

<table>
  <tr>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/project-dark.png">
        <img src="https://mrddream.github.io/Helmshell/screens/project-light.png" alt="A project: overview, files, Git, agents, deployment and settings tabs">
      </picture>
      <br><sub><b>Project</b></sub>
    </td>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/agents-dark.png">
        <img src="https://mrddream.github.io/Helmshell/screens/agents-light.png" alt="AI sessions: Claude Code and Codex terminals of every project">
      </picture>
      <br><sub><b>AI sessions</b></sub>
    </td>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/git-dark.png">
        <img src="https://mrddream.github.io/Helmshell/screens/git-light.png" alt="Git tab: changes, partial commit, branches and history">
      </picture>
      <br><sub><b>Git</b></sub>
    </td>
  </tr>
</table>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/mobile-home-dark.png">
    <img src="https://mrddream.github.io/Helmshell/screens/mobile-home-light.png" alt="Helmshell home screen on a phone" width="220">
  </picture>
  &nbsp;&nbsp;
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/mobile-agents-dark.png">
    <img src="https://mrddream.github.io/Helmshell/screens/mobile-agents-light.png" alt="An agent session on a phone" width="220">
  </picture>
</p>

> [!WARNING]
> **Helmshell gives a shell on your server.** Keep it on your local network or behind a VPN
> (Tailscale, NetBird, WireGuard). Do not forward its port to the Internet; for access through a domain
> name, read [Network access](#network-access) first.

## Contents

- [Features](#features)
- [Getting started](#getting-started): [requirements](#requirements) · [one-line installer](#option-a-one-line-installer) · [Docker Compose](#option-b-docker-compose) · [systemd](#option-c-systemd-service-by-hand) · [Coolify / Dokploy](#option-d-coolify-or-dokploy) · [first login](#first-login)
- [Updating](#updating)
- [AI agents](#ai-agents)
- [Configuration](#configuration)
- [Environment variables](#environment-variables)
- [Security](#security)
- [Development](#development)
- [License and credits](#license-and-credits)

## Features

### 🤖 Claude Code and Codex, side by side

- One terminal per project and per agent, in **tmux**: close the browser, the agent keeps working.
- **Open Claude**, **Open Codex**, or **Open AI** with a picker when both are installed.
- **Background tasks**: hand off a job, read the result later, get notified at the end.
- **Live state** (working, waiting for your approval), **usage** of each plan in the top bar, **context**
  used by each session, past **conversations** to read or resume.
- **Parallel branches**: one `git worktree` and one agent session per branch.

### 📁 Your projects in the browser

- Every sub-folder of the projects folder is a project, with its logo, platforms and technologies.
- **Files**: CodeMirror editor, search, Markdown, images and PDF preview.
- **Git**: partial commit, branches, history, diff, push / pull, import from GitHub, GitLab, Codeberg,
  Forgejo or Gitea.
- **Terminals**: persistent tmux sessions for the server, each project and each agent.

### 🚀 Deployments

- **Coolify** or **Dokploy** applications: status, domains, logs, variables, deploy / restart / stop.
- New projects can be linked to an application right away.

### 📱 Built for your phone

- Installable app (PWA) with a layout designed for small screens.
- **ntfy**, **Gotify** or **Discord** notifications, with **Yes / No** buttons that answer an agent's question.

### 🔒 Made for a private network

- Access limited to your LAN, VPN, or a domain behind a trusted proxy.
- Password with optional 2FA (TOTP), or OIDC (Authentik, Keycloak, Pocket ID…). Strict CSP.

### 🎨 Light and yours

- Python 3 standard library, `tmux` and `git`: no database, no build step, no CDN.
- English or French, five appearance styles, ten color palettes, light and dark themes.
- **Ctrl K** command palette, **?** for shortcuts, `g` then a letter to switch pages.

<details>
<summary><b>Every screen at a glance</b></summary>

| Screen | What it does |
| --- | --- |
| Home | Items to handle (agent questions, stopped sessions, failed tasks and deployments, uncommitted files), background tasks, recent projects |
| Projects | Cards with each project's logo, platforms and technologies, filters, search, size |
| Project | Overview (rendered README, activity), Files, Git, Agents (terminal, context, background tasks, conversations), Deployment, Settings |
| New project | Empty folder, Git clone or import, template (Node, Python, Android, static site), `CLAUDE.md` / `AGENTS.md`, Coolify / Dokploy application |
| AI sessions | Agent terminals of every project, background sessions, recent conversations of both agents |
| Terminal | Persistent tmux sessions (server, project, agent) |
| Deployments | Coolify or Dokploy applications: status, domains, logs, history, actions |
| Server | CPU, memory and disk over 1 h to 30 days, deployment tool resources, trash (30 days) |
| Settings | Agents, Deployment, Git accounts, Notifications, Security, Appearance |

</details>

## Getting started

### Requirements

- [ ] A **Linux server** with **systemd** (Ubuntu, Debian, Fedora…), reachable over SSH with your normal user.
- [ ] **Python 3.10+**, **tmux** and **git**:

  ```bash
  sudo apt install python3 tmux git
  ```

- [ ] At least one **AI agent installed and logged in** for your user:

  ```bash
  # Claude Code
  curl -fsSL https://claude.ai/install.sh | bash
  claude              # then /login

  # OpenAI Codex
  curl -fsSL https://chatgpt.com/codex/install.sh | sh    # or: npm install -g @openai/codex
  codex login --device-auth
  sudo apt install bubblewrap                              # Ubuntu 24.04+: needed by Codex's sandbox
  ```

- [ ] A **local network or a VPN** between your devices and the server, and a **fixed IP** for the server
  (DHCP reservation, or the VPN address).

### Option A: one-line installer

```bash
curl -fsSL https://raw.githubusercontent.com/MrDDream/Helmshell/main/install.sh | bash
```

Prefer to read the script first:

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
~/helmshell/install.sh
```

The installer asks, step by step: language, missing prerequisites (installed only after you answer "y"),
AI agents, mode (**systemd** or **Docker Compose**), projects folder, port, allowed networks and password.
It then starts Helmshell and prints its address and the initial password. Run it again later to **update**.

<details>
<summary><b>Installer options</b></summary>

| Option | Effect |
| --- | --- |
| `--yes` | Accept the defaults (never runs sudo) |
| `--lang en\|fr` | Language of the installer and initial language of Helmshell |
| `--mode systemd\|docker` | Installation mode |
| `--dir PATH` | Where to clone Helmshell |
| `--projects PATH` | Projects folder |
| `--port N` | Port of the web interface |
| `--networks CIDRs` | Networks allowed to connect |
| `--no-agents-install` | Do not offer to install Claude Code or Codex |
| `--dry-run` | Show every action without changing anything |
| `--help` | Show the help |

With the one-liner: `curl … | bash -s -- --dry-run`.

</details>

### Option B: Docker Compose

The image `ghcr.io/mrddream/helmshell` (amd64 and arm64) runs as **your** user, with your home directory
mounted at the same path, and drives a **tmux server on the host**: agent sessions and terminals really run
on the server and survive container restarts.

**1. Prepare the host** (tmux service on the host, prints your user's values):

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
cd ~/helmshell
./deploy/prepare-host.sh
sudo loginctl enable-linger $USER
```

**2. Create `deploy/.env`** with your values (`id` shows your UID and GID):

```dotenv
# Required: your home directory and your user on the host
HELMSHELL_HOME=/home/alice
HOST_USER=alice
HOST_UID=1000
HOST_GID=1000

# Optional: image version ("latest" or a release such as 0.2.0), language (en or fr), port
HELMSHELL_VERSION=latest
HELMSHELL_LANG=en
HELMSHELL_PORT=8787

# Optional: networks allowed to connect (your LAN and VPN), projects folder, server name, Coolify API
HELMSHELL_ALLOWED_NETWORKS=192.168.0.0/16,100.64.0.0/10
#HELMSHELL_PROJECTS_ROOT=/home/alice/projects
#HELMSHELL_HOSTNAME=my-server
#COOLIFY_URL=http://host.docker.internal:8000
```

**3. Start it** with the provided [`deploy/docker-compose.yml`](deploy/docker-compose.yml):

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

<details>
<summary><b>The <code>docker-compose.yml</code> file</b></summary>

```yaml
services:
  helmshell:
    image: ghcr.io/mrddream/helmshell:${HELMSHELL_VERSION:-latest}
    restart: unless-stopped
    ports:
      - "0.0.0.0:${HELMSHELL_PORT:-8787}:8787"        # IPv4 only
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

The commented file in the repository also has a development variant that runs the cloned code instead of
the image.

</details>

> [!NOTE]
> Agents must be installed **inside your home directory** (for example `~/.local/bin`, where the official
> installers put `claude` and `codex`): a global npm install under `/usr` is not visible from the container.

`./install.sh --mode docker` does all of the above for you.

### Option C: systemd service by hand

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
cd ~/helmshell
mkdir -p ~/.config/helmshell ~/.config/systemd/user
cp deploy/helmshell.env.example ~/.config/helmshell/helmshell.env && chmod 600 ~/.config/helmshell/helmshell.env
cp deploy/helmshell.service ~/.config/systemd/user/     # adjust the path if not in ~/helmshell
systemctl --user daemon-reload && systemctl --user enable --now helmshell
sudo loginctl enable-linger $USER                        # keep it running without an open session
```

`~/.config/helmshell/helmshell.env`:

```dotenv
HELMSHELL_HOST=0.0.0.0
HELMSHELL_PORT=8787
HELMSHELL_LANGUAGE=en
HELMSHELL_ALLOWED_NETWORKS=192.168.0.0/16,100.64.0.0/10
#PROJECTS_ROOT=/home/alice/projects
#HELMSHELL_PASSWORD=
```

Useful commands:

```bash
systemctl --user status helmshell
journalctl --user -u helmshell -f
systemctl --user restart helmshell
```

### Option D: Coolify or Dokploy

1. On the host, run step 1 of [Docker Compose](#option-b-docker-compose) (clone, `prepare-host.sh`, linger).
2. Create a **Docker Compose** resource (Coolify: *+ New › Docker Compose Empty*; Dokploy: *Compose*) and
   paste [`deploy/docker-compose.yml`](deploy/docker-compose.yml).
3. Add the variables of the `.env` above in the resource's environment variables, then deploy.
   No domain needed: access is through port 8787.

### First login

Open `http://<server-IP>:8787` from a device on your local network or VPN. The initial password is printed
by the installer and stored in `~/.config/helmshell/mot-de-passe-initial.txt` (never in the logs). Change it
in **Settings › Security**: the file is then deleted.

All configuration and data live in `~/.config/helmshell/` (permissions 700 / 600).

## Updating

Helmshell checks the [releases](https://github.com/MrDDream/Helmshell/releases) at most once a day and
shows a badge when a new version is out (`HELMSHELL_UPDATE_CHECK=0` to disable).

```bash
# Installer (keeps your settings)
~/helmshell/install.sh

# systemd
cd ~/helmshell && git pull --ff-only && systemctl --user restart helmshell

# Docker Compose
docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

With Coolify or Dokploy, redeploy the resource.

## AI agents

Claude Code and OpenAI Codex are independent: install one or both. Helmshell finds them in the `PATH` or
`~/.local/bin` (override with `CLAUDE_BIN` / `CODEX_BIN`). Log each one in once, in a terminal:
`claude` then `/login`, or `codex login --device-auth`.

| | Claude Code | Codex |
| --- | :---: | :---: |
| Terminal per project and per branch (tmux) | ✅ | ✅ |
| Background tasks with notification | ✅ | ✅ |
| Live state: working, waiting for an answer | ✅ | ✅ |
| Plan usage in the top bar, without using tokens | ✅ (`/usage`) | ✅ (`account/rateLimits/read`) |
| Context used by each session | ✅ | ✅ |
| Past conversations: read, resume | ✅ | ✅ |
| Permission modes | 5 modes, from "ask" to "auto" | Read only, Automatic, Full access |
| Remote Control (claude.ai link and QR code) | ✅ | — |

- **Agents tab of a project**: a terminal on the tmux session of the project, created when needed with the
  agent inside. When the agent exits, you get the project's shell back. Over SSH:
  `tmux -S ~/.config/helmshell/tmux.sock attach -t <Project>` (container) or `tmux attach -t <Project>` (systemd).
- **Background tasks** run the agent non-interactively. If a repository has its own agent configuration
  (`.claude/settings.json`, `.mcp.json`, `.codex/config.toml`), Helmshell asks first whether you trust it.
- **Parallel branches** (Git tab): one working copy per branch in `<projects>/.branches/`, with its own sessions.
- **Codex sandbox**: Settings › Agents checks that it starts. On Ubuntu 24.04+, install `bubblewrap`,
  otherwise the Read only and Automatic modes refuse every command.

## Configuration

Everything below is set from the **Settings** page.

### Network access

**Settings › Security › Network access** chooses where Helmshell answers from. Other addresses get a 403
before even reaching the login page. Until something is checked there, `HELMSHELL_ALLOWED_NETWORKS` applies.

| Choice | Allows |
| --- | --- |
| Local network | 192.168.x and the machine itself (10.x and 172.16-31.x are used by Docker: add them as specific IPs) |
| VPN | 100.64.0.0/10 by default (Tailscale, NetBird), or your subnets (WireGuard…) |
| Domain name | Helmshell behind a proxy (Traefik, Caddy, nginx…): enter the domain and the **trusted proxy** |
| Specific IPs | Always allowed; with a domain, they also restrict access through it |

<details>
<summary><b>Host names, firewall and recovery</b></summary>

- Helmshell refuses to save a setting that would cut your own connection. Locked out anyway: set
  `HELMSHELL_ACCESS_RESET=1`, restart, fix the setting, then remove the variable.
- **Host names**: Helmshell answers to its IP, local or VPN names (`my-server`, `*.local`, `*.ts.net`,
  `*.netbird.cloud`…) and the configured domains; any other name gets a 421 (DNS rebinding protection).
  Add names with `HELMSHELL_ALLOWED_HOSTS=name1,name2`.
- **Firewall**: with Docker, the published port bypasses UFW, so the filter above is what protects you. With
  systemd, open the port on the VPN interface only, e.g. `sudo ufw allow in on wt0 to any port 8787 proto tcp`.
  If your router lets IPv6 in, enable its IPv6 firewall.

</details>

### Login

- **Password** (PBKDF2) with optional **two-factor authentication** (TOTP) and 8 recovery codes.
- **OIDC** (Authentik, Keycloak, Pocket ID, Authelia, Zitadel, Google…): redirect URI
  `<Helmshell address>/auth/oidc/callback`, access limited to verified e-mails or a group, optional
  "OIDC only". Provider down: `HELMSHELL_OIDC_DISABLE=1` and restart.
- 7-day sessions renewed on use; **Sign out all devices** in Settings › Security.
- Lost 2FA phone and no recovery code: empty `totp_secret` in `~/.config/helmshell/config.json`, then restart.

### Notifications

**ntfy** (long secret topic, preferably with a token), **Gotify** or **Discord**. When an agent asks a
question, the **Yes / No** buttons answer it: signed links, valid 10 minutes, single use.

### Git accounts

GitHub, GitLab, Codeberg, Forgejo or Gitea, with a token. **Import** in a new project lists your
repositories; the token also authenticates `clone`, `pull` and `push` over HTTPS, through git's environment
(never the command line nor `.git/config`).

### Deployment

Pick *None*, *Coolify* or *Dokploy*. Without a tool, everything related to deployment disappears.

- **Coolify**: *Keys & Tokens › API tokens* (*root* or *write*), API URL `http://localhost:8000` (systemd)
  or `http://host.docker.internal:8000` (container).
- **Dokploy**: *Settings › Profile › API/CLI*, URL `http://host.docker.internal:3000` from the container.

### Appearance and app

Language, style, colors and the installable app (PWA) are in **Settings › Appearance**. Browsers only
install apps over **HTTPS**: use a domain name or your VPN's HTTPS.

## Environment variables

All optional. systemd: `~/.config/helmshell/helmshell.env`; container: `deploy/.env` (see
[`deploy/.env.example`](deploy/.env.example)).

<details>
<summary><b>All variables</b></summary>

| Variable | Purpose |
| --- | --- |
| `HELMSHELL_HOST`, `HELMSHELL_PORT` | Listening address and port (`0.0.0.0`, `8787`) |
| `HELMSHELL_LANGUAGE` | Initial interface language: `en` or `fr` |
| `HELMSHELL_PASSWORD` | Fixed password (otherwise generated, changeable in Settings) |
| `HELMSHELL_ALLOWED_NETWORKS` | Allowed networks until network access is configured in Settings |
| `HELMSHELL_ALLOWED_HOSTS` | Extra accepted host names |
| `HELMSHELL_ACCESS_RESET=1` | Ignore the network access setting (recovery) |
| `HELMSHELL_OIDC_DISABLE=1` | Disable OIDC and restore the password (recovery) |
| `HELMSHELL_PUBLIC_URL` | Helmshell's address as seen from your devices (notification links, OIDC) |
| `HELMSHELL_DATA` | Data folder (`~/.config/helmshell`) |
| `HELMSHELL_TMUX_SOCKET` | Socket of the host tmux server (container mode) |
| `HELMSHELL_HOSTNAME` | Displayed server name |
| `PROJECTS_ROOT` | Projects folder |
| `CLAUDE_BIN`, `CODEX_BIN` | Paths of the `claude` and `codex` executables |
| `HELMSHELL_UPDATE_CHECK=0` | Do not check GitHub for new releases |
| `COOLIFY_URL`, `COOLIFY_TOKEN`, `DOKPLOY_URL`, `DOKPLOY_TOKEN` | Deployment tool (also in Settings) |

</details>

## Security

- Signed `HttpOnly` + `SameSite=Strict` session cookie, anti-CSRF header, login attempt limits, login log.
- Strict CSP (no external script), `nosniff`, `frame-ancestors 'none'`, host name check.
- File paths confined to the project; repository content treated as untrusted (sanitized Markdown, bounded
  reads, confirmation before trusting an agent configuration).
- Server secrets are never passed to terminals or agent sessions.
- Container: pinned base image, IPv4 only, no privilege escalation, reduced capabilities, memory and process
  limits. Images are built by GitHub Actions with actions pinned by commit SHA.

Found a vulnerability? Report it privately in the [Security tab](https://github.com/MrDDream/Helmshell/security)
rather than in a public issue.

## Development

```bash
HELMSHELL_PORT=8787 python3 server.py    # start
python3 tests/smoke.py                   # isolated instance, calls every route
python3 tests/test_updates.py            # update check against a fake GitHub API
python3 tests/check_i18n.py              # every string translated
python3 tests/check_js.py static/*.js    # JavaScript syntax (without node)
bash -n install.sh && ./install.sh --dry-run --yes
```

<details>
<summary><b>Repository layout and tools</b></summary>

```
server.py      HTTP server, API routes, authentication
helmshell/     config, projects, Git, agents (tmux), terminals, tasks, access, OIDC, TOTP,
               notifications, Git forges, Coolify / Dokploy, server stats, update check
static/        interface (vanilla JS, no build step), vendor/, icons, palettes, locales
deploy/        docker-compose.yml, .env.example, container script, systemd services
site/          website (GitHub Pages): landing page, live demo
tests/         smoke test, update check, translations, JavaScript check
tools/         libraries, icons, palettes, logos, site build and screenshots
Dockerfile     image published to ghcr.io/mrddream/helmshell
```

```bash
python3 tools/vendor.py                 # browser libraries → static/vendor (checksums verified)
python3 tools/fetch_icons.py            # style icons → static/icons.js
python3 tools/make_palettes.py          # colors → static/palettes.css
python3 tools/make_icons.py             # logo and app icons
python3 tools/fetch_platform_logos.py   # platform logos
python3 tools/build_site.py --serve 8799   # website and demo on http://127.0.0.1:8799/Helmshell/
```

Releases: bump [`VERSION`](VERSION), tag `vX.Y.Z` and push the tag; the
[Docker workflow](.github/workflows/docker.yml) publishes the image.

</details>

## License and credits

Helmshell is released under the [MIT](LICENSE) license. Bundled libraries, icons and fonts keep their own
licenses: see [THIRD_PARTY.md](THIRD_PARTY.md).

Helmshell is an independent project, **not affiliated with Anthropic or OpenAI**. Claude and Claude Code are
trademarks of Anthropic; OpenAI and Codex are trademarks of OpenAI.
