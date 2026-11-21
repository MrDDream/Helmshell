<div align="center">

<img src="static/logo.svg" alt="Helmshell logo" width="96" height="96">

# Helmshell

**Drive your Linux server from any browser or phone.**

[![Latest release](https://img.shields.io/github/v/release/MrDDream/Helmshell?label=release&color=1F4E79)](https://github.com/MrDDream/Helmshell/releases/latest)
[![Tests](https://img.shields.io/github/actions/workflow/status/MrDDream/Helmshell/tests.yml?branch=main&label=tests)](https://github.com/MrDDream/Helmshell/actions/workflows/tests.yml)
[![Docker image](https://img.shields.io/badge/ghcr.io-mrddream%2Fhelmshell-1F4E79?logo=docker&logoColor=white)](https://github.com/MrDDream/Helmshell/pkgs/container/helmshell)
[![License: MIT](https://img.shields.io/github/license/MrDDream/Helmshell?color=D97757)](LICENSE)

[Website](https://mrddream.github.io/Helmshell/) · [Live demo](https://mrddream.github.io/Helmshell/demo/) · **English** · [Français](README.fr.md)

</div>

Self-hosted web console to drive your Linux server from a browser or a phone: projects and files, Git,
terminals, AI coding agent sessions (**Claude Code** and **OpenAI Codex**, in tmux) and deployments with
**Coolify** or **Dokploy**. It installs as an app (PWA), in English or French, with five appearance styles.

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
        <img src="https://mrddream.github.io/Helmshell/screens/project-light.png" alt="A project: overview, files, Git, agent, deployment and settings tabs">
      </picture>
      <br><sub><b>Project</b></sub>
    </td>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://mrddream.github.io/Helmshell/screens/agents-dark.png">
        <img src="https://mrddream.github.io/Helmshell/screens/agents-light.png" alt="Agent sessions: Claude Code and Codex terminals of every project">
      </picture>
      <br><sub><b>Agent sessions</b></sub>
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
> (Tailscale, NetBird, WireGuard). Do not forward its port to the Internet; if you want access through a
> domain name, read [Network access](#network-access) first.

## Highlights

- **Claude Code and Codex side by side.** Agent sessions in persistent tmux sessions, per project and per
  task; background tasks; parallel branches with `git worktree`.
- **Your projects in the browser.** Files with a CodeMirror editor, Git (partial commit, branches, history,
  diff), persistent terminals. Every sub-folder of the projects folder is a project.
- **Deployments.** Coolify or Dokploy applications: status, domains, logs, variables, deploy / restart / stop.
- **Answer from your phone.** ntfy, Gotify or Discord notifications with Yes / No buttons when an agent asks
  a question; installable as an app (PWA).
- **Built for a private network.** Network access limited to your LAN, VPN or a domain behind a trusted proxy;
  password with optional 2FA (TOTP), OIDC, strict CSP.
- **Nothing to install besides the basics.** Python 3 (standard library only), `tmux`, `git` and your AI
  agent. Browser libraries ship with the repository (`static/vendor`): no CDN, no build step.
- **Yours to style.** English or French, five appearance styles, ten color palettes, light and dark.

**Contents:** [What it does](#what-it-does) · [Before you start](#before-you-start) ·
[Quick install](#quick-install) · [Manual install](#manual-install) · [First login](#first-login) ·
[Updating](#updating) · [Configuration](#configuration) · [Agents](#agents) ·
[Environment variables](#environment-variables) · [Security](#security) · [Development](#development) ·
[License and credits](#license-and-credits)

## What it does

| Screen | What it does |
| --- | --- |
| Home | "To handle" (agent questions, stopped sessions, failed tasks and deployments, uncommitted files), background tasks, recent projects |
| Projects | Cards with each project's logo, platforms and technologies, filters, search, size |
| Project | Overview (rendered README, activity), Files (CodeMirror editor, search, Markdown, images, PDF), Git (partial commit, branches, parallel branches, history, diff), Agent (tmux terminal, context used, background tasks, past conversations), Deployment (logs, variables, domains), Settings |
| New project | Empty folder, Git clone (or import from a linked account), template (Node, Python, Android, static site), agent instructions file, Coolify / Dokploy application |
| Agent sessions | Agent terminals of every project, recent conversations, resume |
| Terminal | Persistent tmux sessions (server, project, agent) |
| Deployments | Coolify or Dokploy applications: status, domains, logs, history, deploy / restart / stop |
| Server | CPU, memory and disk over 1 h to 30 days, deployment tool resources, trash (30 days) |
| Settings | Agents, Deployment, Git accounts, Notifications, Security (network access, OIDC, password, 2FA), Appearance |

Everywhere: **Ctrl K** (command palette), **?** (shortcuts), `g` then a letter to switch pages. The interface
updates live; the tab shows "(1) Helmshell" when an agent is waiting for an answer.

## Before you start

Do this **before** installing Helmshell:

1. A **Linux server** with **systemd** (Ubuntu, Debian, Fedora…), reachable over SSH, with your normal
   (non-root) user.
2. **Python 3.10** or newer, **tmux** and **git**: `sudo apt install python3 tmux git` (the installer offers
   to do it, after asking).
3. At least one **AI agent installed and logged in** for your user:
   - **Claude Code**: `curl -fsSL https://claude.ai/install.sh | bash`, then run `claude` and `/login`.
     See the [Claude Code documentation](https://docs.claude.com/claude-code).
   - **OpenAI Codex CLI** (Node.js 18 or newer for the npm install): `npm install -g @openai/codex`
     (or `curl -fsSL https://chatgpt.com/codex/install.sh | sh`), then `codex login`
     (`codex login --device-auth` over SSH). On Ubuntu 24.04 and later, also install the system
     `bubblewrap` package (`sudo apt install bubblewrap`): without it, Codex's sandbox cannot start and its
     Read only and Automatic modes refuse every command (Settings › Agents checks this for you).
4. A **local network or a VPN** (Tailscale, NetBird, WireGuard) between your devices and the server, and a
   **fixed IP** for the server (DHCP reservation in your router, or the VPN address).

## Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/MrDDream/Helmshell/main/install.sh | bash
```

Prefer to read the script first? `git clone https://github.com/MrDDream/Helmshell.git ~/helmshell && ~/helmshell/install.sh`.

The installer clones Helmshell (default `~/helmshell`), then asks, step by step:

1. **Language** (English or French), also used as Helmshell's initial language;
2. **Prerequisites**: checks Python 3.10+, tmux and git, and offers to install the missing ones with
   `sudo apt-get` / `sudo dnf` (only after you answer "y");
3. **AI agents**: detects `claude` and `codex` and offers their official installer (after confirmation);
4. **Mode**: systemd user service (default) or Docker Compose (if `docker compose` works);
5. **Projects folder** (`~/projects`, or `~/projets` if it already exists);
6. **Port** (8787);
7. **Allowed networks**: your LAN (e.g. `192.168.1.0/24`) and VPN ranges are detected, edit as you like;
8. **Password**: generated by Helmshell on first start (recommended), or a fixed password of your choice.

It then writes `~/.config/helmshell/helmshell.env` (chmod 600), starts Helmshell and prints its address and
the initial password. Running it again on an installed server offers to **update** instead (settings kept).

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

## Manual install

### Option 1: systemd service (recommended)

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
cd ~/helmshell
./install.sh --mode systemd
sudo loginctl enable-linger $USER   # so the service runs without an open session
```

Fully by hand: copy `deploy/helmshell.service` to `~/.config/systemd/user/` (adjust the path if Helmshell
is not in `~/helmshell`), copy `deploy/helmshell.env.example` to `~/.config/helmshell/helmshell.env`
(chmod 600), then `systemctl --user daemon-reload && systemctl --user enable --now helmshell`.

```bash
systemctl --user status helmshell
journalctl --user -u helmshell -f
systemctl --user restart helmshell
```

### Option 2: Docker Compose

The image `ghcr.io/mrddream/helmshell` (amd64 and arm64, built from the [`Dockerfile`](Dockerfile) for
every release) runs as **your** user (same UID, same home directory) and drives a **tmux server on the
host**: agent sessions and terminals really run on the server and survive container restarts.

```bash
git clone https://github.com/MrDDream/Helmshell.git ~/helmshell
cd ~/helmshell
./deploy/prepare-host.sh            # host tmux server (helmshell-tmux service), prints your values
sudo loginctl enable-linger $USER
cp deploy/.env.example deploy/.env  # fill in HELMSHELL_HOME, HOST_USER, HOST_UID, HOST_GID
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

(`./install.sh --mode docker` does the same.) The container mounts your home directory at the same path
(projects, `~/.claude`, `~/.codex`, SSH keys, Git). Agents must therefore be installed **inside your home
directory** (e.g. `~/.local/bin`, where the Claude Code installer puts `claude`): a global npm install under
`/usr` is not visible from the container. Pin a version with `HELMSHELL_VERSION=0.1.0` in `deploy/.env`.

To run the code cloned on the host instead of the image (development), see the commented variant in
[`deploy/docker-compose.yml`](deploy/docker-compose.yml).

### Option 3: Coolify or Dokploy

1. On the host: clone the repository, run `./deploy/prepare-host.sh` then `sudo loginctl enable-linger $USER`.
2. Create a **Docker Compose** resource (Coolify: *+ New › Docker Compose Empty*; Dokploy: *Compose*) and
   paste the content of [`deploy/docker-compose.yml`](deploy/docker-compose.yml).
3. Set the variables of [`deploy/.env.example`](deploy/.env.example) in the resource's environment
   variables tab, then deploy. No domain needed: access is through port 8787.

## First login

Open `http://<server-IP>:8787` from a device on the local network or the VPN. The initial password is
printed by the installer and stored in `~/.config/helmshell/mot-de-passe-initial.txt` (never in the logs).
Change it in **Settings › Security**: the file is then deleted.

All of Helmshell's configuration and data live in `~/.config/helmshell/` (permissions 700 / 600).

## Updating

Helmshell checks the [GitHub releases](https://github.com/MrDDream/Helmshell/releases) at most once a day
and shows a badge when a new version is available (disable with `HELMSHELL_UPDATE_CHECK=0`). To update:

```bash
~/helmshell/install.sh                                     # offers to update, keeps your settings
# or by hand, systemd:
cd ~/helmshell && git pull --ff-only && systemctl --user restart helmshell
# or by hand, Docker Compose:
docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

With Coolify or Dokploy, redeploy the resource (it pulls the image again).

## Configuration

### Language and appearance

**Settings › Appearance**: language (English or French), style, colors, and the installable app. The
initial language comes from the installer (`HELMSHELL_LANGUAGE`).

### Network access

**Settings › Security › Network access** chooses where Helmshell answers from; other addresses get a 403
before even reaching the login page. As long as nothing is checked there, the `HELMSHELL_ALLOWED_NETWORKS`
variable applies (the networks chosen in the installer, or 192.168.x and the Tailscale / NetBird VPN range
in the provided files).

- **Local network**: 192.168.x and the machine itself. The 10.x and 172.16-31.x networks are not included,
  because Docker uses them too; a 10.x or 172.x LAN is added under **Specific IPs**.
- **VPN**: 100.64.0.0/10 by default (Tailscale, NetBird), or the given subnets (WireGuard…).
- **Domain name**: Helmshell behind a proxy (Coolify's or Dokploy's Traefik, Caddy, nginx…). Point the
  domain to port 8787 in the proxy, then enter the domain and the **trusted proxy** in Helmshell (its
  address or network; the "What the server sees" box shows it). Only that proxy may announce the visitor's
  real address and https.
- **Specific IPs**: always allowed; with the domain checked, they also restrict access through the domain.

Helmshell refuses to save a setting that would cut your own connection. Locked out anyway: set
`HELMSHELL_ACCESS_RESET=1`, restart, fix the setting, then remove the variable.

**Host name.** Helmshell answers to its IP address, to local or VPN names (`my-server`, `*.local`,
`*.netbird.cloud`, `*.ts.net`…), to the domain of the "Helmshell address" and to the domains declared above.
Any other name gets a 421 error (protection against DNS rebinding). To allow another one:
`HELMSHELL_ALLOWED_HOSTS=name1,name2`.

**Firewall.** With Docker, the published port bypasses UFW: the filter above is what protects you. With
systemd, open the port only on the VPN interface, for example `sudo ufw allow in on wt0 to any port 8787 proto tcp`.
If your router lets IPv6 in, enable its IPv6 firewall.

### Login

- **Password** (hashed with PBKDF2) and optional **two-factor authentication** (TOTP: Google Authenticator,
  Aegis, 2FAS, Bitwarden…) with 8 recovery codes.
- **OIDC** (Authentik, Keycloak, Pocket ID, Authelia, Zitadel, Google…): redirect URI
  `<Helmshell address>/auth/oidc/callback`, access limited to verified e-mail addresses or to a group.
  After a successful test, "Only allow OIDC" refuses the password. Provider down:
  `HELMSHELL_OIDC_DISABLE=1` and restart.
- 7-day sessions renewed on use; **Sign out all devices** in Settings › Security.
- 2FA phone lost without a recovery code: on the server, empty `totp_secret` in
  `~/.config/helmshell/config.json`, then restart Helmshell.

### Notifications

Settings › Notifications: **ntfy** (long, secret topic, preferably with a token), **Gotify** or **Discord**.
When an agent asks a question, the **Yes / No** buttons or links answer it: signed links, valid for
10 minutes, single use, accepted only while the question is still waiting.

### Git accounts

Settings › Git: GitHub, GitLab, Codeberg, Forgejo or Gitea, with a token (read, read and write, or full).
The **Import** button of a new project then lists your repositories. The token also authenticates
`git clone`, `pull` and `push` over HTTPS: it goes through git's environment, never through the command line
nor the repository's `.git/config`.

### Deployment (Coolify or Dokploy)

**Settings › Deployment** picks the tool: *None*, *Coolify* or *Dokploy*. Without a tool, everything
related to deployment disappears from the interface.

- **Coolify**: *Keys & Tokens › API tokens*, *root* or *write* token, with the API URL
  (`http://localhost:8000` with systemd, `http://host.docker.internal:8000` from the container).
- **Dokploy**: *Settings › Profile › API/CLI*, with the Dokploy URL (`http://host.docker.internal:3000`
  from the container). Rolling back to a previous version is done from Dokploy.

### Installable app (PWA)

Helmshell installs as an app (icon, separate window, shortcuts), but browsers only allow it over **HTTPS**:
use a domain name (see [Network access](#network-access)) or your VPN's HTTPS. Settings › Appearance › App
shows what is possible from the current device.

## Agents

Claude Code and OpenAI Codex can be installed side by side: choose the agent per project and per task.
Helmshell detects the installed agents (`claude` and `codex` in the PATH or `~/.local/bin`; override with
`CLAUDE_BIN` / `CODEX_BIN`). Each agent must be logged in once for your user, in a terminal: `claude` then
`/login`, or `codex login` (`codex login --device-auth` over SSH or from a Helmshell terminal).

Both agents are independent and get the same features: when only one is installed, the project button reads
**Open Claude** or **Open Codex**; with both, **Open AI** asks which one to open. Each has its own usage
button in the top bar (plan limits with their reset time, pace, context of open sessions, refreshed on the
interval set in Settings › Agents without using any tokens), its live state in the terminal (working,
waiting for your approval) with notifications, and its conversations on the AI sessions page.

- **Agent tab of a project**: a terminal attached to the tmux session named after the folder, created when
  needed with the agent running inside ("Resume the last conversation" optional). When the agent exits, you
  get the project's shell back. From the server over SSH: `tmux -S ~/.config/helmshell/tmux.sock attach -t <Project>`
  (container) or `tmux attach -t <Project>` (systemd).
- **Background tasks**: "Delegate a task" runs the agent non-interactively in tmux with your instructions;
  the result can be read in Helmshell and a notification is sent at the end. If a repository has its own
  agent configuration (e.g. `.claude/settings.json`, `.mcp.json`), Helmshell first asks whether you trust it.
- **Parallel branches**: Git tab › Parallel branches: one working copy (`git worktree`) per branch, in
  `<projects>/.branches/`, with its own agent session.
- **Claude Code only**: **Remote Control** (claude.ai link and QR code to follow a session from the Claude
  app) and the **plan usage** gauges.

## Environment variables

All optional. With systemd: `~/.config/helmshell/helmshell.env`;
in a container: see `deploy/.env.example` (the `HELMSHELL_*` names there map to these).

<details>
<summary><b>All variables</b></summary>

| Variable | Purpose |
| --- | --- |
| `HELMSHELL_HOST`, `HELMSHELL_PORT` | Listening address and port (`0.0.0.0`, `8787`) |
| `HELMSHELL_LANGUAGE` | Initial interface language: `en` or `fr` (then Settings › Appearance) |
| `HELMSHELL_PASSWORD` | Fixed password (otherwise generated, changeable in Settings) |
| `HELMSHELL_ALLOWED_NETWORKS` | Allowed networks as long as network access is not configured in Settings |
| `HELMSHELL_ALLOWED_HOSTS` | Extra accepted host names |
| `HELMSHELL_ACCESS_RESET=1` | Ignore the network access setting (recovery) |
| `HELMSHELL_OIDC_DISABLE=1` | Disable OIDC and restore the password (recovery) |
| `HELMSHELL_PUBLIC_URL` | Helmshell's address as seen from your devices (notification links, OIDC) |
| `HELMSHELL_DATA` | Data folder (`~/.config/helmshell`) |
| `HELMSHELL_TMUX_SOCKET` | Socket of the host tmux server (container mode) |
| `HELMSHELL_HOSTNAME` | Displayed server name |
| `PROJECTS_ROOT` | Projects folder |
| `CLAUDE_BIN` | Path of the `claude` executable |
| `CODEX_BIN` | Path of the `codex` executable |
| `HELMSHELL_UPDATE_CHECK=0` | Do not check GitHub for new releases |
| `COOLIFY_URL`, `COOLIFY_TOKEN`, `DOKPLOY_URL`, `DOKPLOY_TOKEN` | Deployment tool (also editable in Settings) |

</details>

## Security

- Signed `HttpOnly` + `SameSite=Strict` session cookie, anti-CSRF header on every modifying request,
  login attempt limits (per IP and overall), separate login log.
- Strict CSP (no external script), `nosniff` and `frame-ancestors 'none'` headers, host name check.
- File paths confined to the project; project files served as attachments or sandboxed.
- Repository content is treated as untrusted: Markdown sanitized by DOMPurify without app actions, bounded
  file reads, sandboxed agent for commit messages, confirmation before a task.
- Server secrets are not passed to terminals or agent sessions.
- Container: pinned base image, IPv4 only, no privilege escalation, reduced capabilities, memory and
  process limits. Release images are built by GitHub Actions with actions pinned by commit SHA.

Found a vulnerability? Please report it privately (the *Security* tab of the
[GitHub repository](https://github.com/MrDDream/Helmshell/security)) rather than in a public issue.

## Development

```bash
HELMSHELL_PORT=8787 python3 server.py      # manual start
python3 tests/smoke.py                   # isolated instance, calls every route
python3 tests/test_updates.py            # update check against a local fake GitHub API
python3 tests/check_js.py static/*.js    # JavaScript syntax (without node)
bash -n install.sh && ./install.sh --dry-run --yes
```

<details>
<summary><b>Generation tools and repository layout</b></summary>

Tools (run them only to change versions):

```bash
python3 tools/vendor.py        # browser libraries → static/vendor (npm checksums verified)
python3 tools/fetch_icons.py   # style icons → static/icons.js
python3 tools/make_palettes.py # colors → static/palettes.css
python3 tools/make_icons.py    # logo and app icons
python3 tools/fetch_platform_logos.py   # platform logos (sources with known licenses)
```

```
server.py              HTTP server, API routes, authentication
helmshell/               config, projects, Git, agents (tmux), terminals, tasks, network access, OIDC, TOTP,
                       notifications, Git forges, Coolify / Dokploy, server statistics, update check
static/                interface (vanilla JS, no build step), vendor/, icons, palettes
deploy/                docker-compose.yml, .env.example, container script, systemd services
tests/                 API smoke test, update check test, JavaScript check
tools/                 generation of icons, palettes and libraries
site/                  website (GitHub Pages): landing page, demo, screenshots
Dockerfile             image published to ghcr.io/mrddream/helmshell
```

</details>

Releases: bump [`VERSION`](VERSION), tag `vX.Y.Z` and push the tag; the
[Docker workflow](.github/workflows/docker.yml) publishes the image.

## License and credits

Helmshell is released under the [MIT](LICENSE) license. The bundled libraries, icons and fonts keep their
own licenses: see [THIRD_PARTY.md](THIRD_PARTY.md).

Helmshell is an independent project, **not affiliated with Anthropic or OpenAI**. Claude and Claude Code are
trademarks of Anthropic; OpenAI and Codex are trademarks of OpenAI.
