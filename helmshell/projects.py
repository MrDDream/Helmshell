"""Projets (= dossiers sous la racine), fichiers et Git."""
import os
import re
import shutil
import stat
import time
import unicodedata
from pathlib import Path

from . import config, deployer
from .i18n import _, lang, tr
from .util import ApiError, child_env, log_activity, run, tmux_slug


def read_small(path, limit=400_000):
    """Lit au plus `limit` octets d'un vrai fichier (pas de périphérique, tube, ni lien vers /dev/zero).

    Les fichiers d'un dépôt cloné ne sont pas fiables : `package.json -> /dev/zero` ferait tourner une
    lecture sans fin à chaque affichage de la liste des projets.
    """
    try:
        if not stat.S_ISREG(os.stat(path).st_mode):
            return ""
        with open(path, "rb") as fh:
            return fh.read(limit).decode("utf-8", "replace")
    except OSError:
        return ""

SLUG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$")
MAX_PREVIEW = 1_000_000
HIDDEN = {".git", "node_modules", "__pycache__", ".venv", ".gradle", ".idea"}


def root():
    p = Path(config.get("projects_root")).expanduser()
    p.mkdir(parents=True, exist_ok=True)
    return p


def slugify(name):
    s = unicodedata.normalize("NFD", name or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "projet"


def project_dir(slug):
    if not slug or not SLUG_RE.match(slug):
        raise ApiError(_("Nom de projet invalide"), 404)
    p = root() / slug
    if not p.is_dir():
        raise ApiError(_("Projet introuvable"), 404)
    return p


def safe_path(base, rel):
    """Résout un chemin relatif dans `base` sans permettre d'en sortir."""
    rel = (rel or "").strip().lstrip("/")
    target = (base / rel).resolve()
    base_r = base.resolve()
    if target != base_r and base_r not in target.parents:
        raise ApiError(_("Chemin en dehors du projet"), 403)
    return target


def rel_of(base, path):
    return str(path.resolve().relative_to(base.resolve())) if path.resolve() != base.resolve() else ""


# --- Détection ---------------------------------------------------------------

TAG_RULES = [
    ("package.json", "Node.js"), ("pyproject.toml", "Python"), ("requirements.txt", "Python"),
    ("Cargo.toml", "Rust"), ("go.mod", "Go"), ("Dockerfile", "Docker"),
    ("docker-compose.yml", "Docker"), ("compose.yaml", "Docker"), ("index.html", "HTML"),
    ("pubspec.yaml", "Flutter"), ("composer.json", "PHP"), ("tsconfig.json", "TypeScript"),
    ("pom.xml", "Java"), ("Package.swift", "Swift"), ("Gemfile", "Ruby"),
]
TAG_GLOBS = [("*.csproj", ".NET"), ("*.fsproj", ".NET"), ("*.sln", ".NET"), ("*.slnx", ".NET"),
             ("CMakeLists.txt", "C/C++"), ("meson.build", "C/C++"), ("*.xcodeproj", "Swift"),
             ("deno.json", "Deno"), ("deno.jsonc", "Deno"), ("bun.lockb", "Bun"), ("bun.lock", "Bun"),
             ("project.godot", "Godot"), ("ProjectSettings/ProjectVersion.txt", "Unity"), ("mix.exs", "Elixir"),
             ("build.zig", "Zig"), ("build.sbt", "Scala"), ("stack.yaml", "Haskell"), ("*.cabal", "Haskell"),
             ("*.rockspec", "Lua"), (".luarc.json", "Lua"), ("main.lua", "Lua"), ("nginx.conf", "Nginx"),
             ("schema.prisma", "Prisma"), ("prisma/schema.prisma", "Prisma"), ("supabase/config.toml", "Supabase"),
             ("firebase.json", "Firebase"), ("tailwind.config.*", "Tailwind CSS"), ("vite.config.*", "Vite"),
             ("next.config.*", "Next.js"), ("nuxt.config.*", "Nuxt"), ("astro.config.*", "Astro"),
             ("svelte.config.*", "Svelte"), ("angular.json", "Angular"), ("Chart.yaml", "Kubernetes"),
             ("k8s/*.yaml", "Kubernetes"), ("kustomization.yaml", "Kubernetes"), ("firestore.rules", "Firebase"),
             ("firebase-config.*", "Firebase"), ("*.js", "JavaScript"), ("*.mjs", "JavaScript"), ("*.css", "CSS"),
             ("*.scss", "Sass")]
# Dépendances déclarées -> technos : fichier repère, puis (motif cherché dans son contenu, techno)
_PY = [(r'(?im)^\s*"?django\b', "Django"), (r'(?im)^\s*"?flask\b', "Flask"), (r'(?im)^\s*"?fastapi\b', "FastAPI"),
       (r'(?im)^\s*"?(psycopg2?(-binary)?|asyncpg)\b', "PostgreSQL"), (r'(?im)^\s*"?pymongo\b', "MongoDB"),
       (r'(?im)^\s*"?redis\b', "Redis"), (r'(?im)^\s*"?supabase\b', "Supabase"),
       (r'(?im)^\s*"?firebase-admin\b', "Firebase"), (r'(?im)^\s*"?(pyside[26]|pyqt[56])\b', "Qt"),
       (r'(?im)^\s*"?pygobject\b', "GTK")]
_GRADLE = [(r'spring-boot|org\.springframework', "Spring"), (r'compose\s*(=\s*)?true|androidx\.compose|compose\.(bom|ui|material)', "Jetpack Compose"),
           (r'firebase', "Firebase")]
_COMPOSE = [(r'image:\s*["\']?(postgres|postgis)', "PostgreSQL"), (r'image:\s*["\']?(mysql|mariadb)', "MySQL"),
            (r'image:\s*["\']?mongo', "MongoDB"), (r'image:\s*["\']?(redis|valkey)', "Redis"),
            (r'image:\s*["\']?nginx', "Nginx")]
TAG_DEPS = {
    "package.json": [(r'"(react-native|expo)"\s*:', "React Native"), (r'"react"\s*:', "React"), (r'"vue"\s*:', "Vue"),
                     (r'"(svelte|@sveltejs/kit)"\s*:', "Svelte"), (r'"@angular/core"\s*:', "Angular"), (r'"next"\s*:', "Next.js"),
                     (r'"nuxt"\s*:', "Nuxt"), (r'"astro"\s*:', "Astro"), (r'"vite"\s*:', "Vite"), (r'"tailwindcss"\s*:', "Tailwind CSS"),
                     (r'"express"\s*:', "Express"), (r'"@nestjs/core"\s*:', "NestJS"), (r'"electron"\s*:', "Electron"),
                     (r'"@tauri-apps/(api|cli)"\s*:', "Tauri"), (r'"(prisma|@prisma/client)"\s*:', "Prisma"),
                     (r'"@supabase/supabase-js"\s*:', "Supabase"), (r'"firebase(-admin)?"\s*:', "Firebase"),
                     (r'"(pg|postgres)"\s*:', "PostgreSQL"), (r'"(mysql2?|mariadb)"\s*:', "MySQL"),
                     (r'"(better-sqlite3|sqlite3?)"\s*:', "SQLite"), (r'"(mongoose|mongodb)"\s*:', "MongoDB"),
                     (r'"(redis|ioredis)"\s*:', "Redis"), (r'"sass"\s*:', "Sass"), (r'"typescript"\s*:', "TypeScript")],
    "requirements.txt": _PY, "Pipfile": _PY, "pyproject.toml": _PY,
    "composer.json": [(r'"laravel/framework"', "Laravel"), (r'"symfony/', "Symfony")],
    "Gemfile": [(r'gem\s+["\']rails["\']', "Rails")],
    "pom.xml": [(r'spring-boot', "Spring")],
    "build.gradle": _GRADLE, "build.gradle.kts": _GRADLE,
    "app/build.gradle": _GRADLE, "app/build.gradle.kts": _GRADLE,
    "Cargo.toml": [(r'(?m)^\s*tauri\b', "Tauri")],
    "pubspec.yaml": [(r'(?m)^\s*firebase_core:', "Firebase"), (r'(?m)^\s*supabase_flutter:', "Supabase")],
    "CMakeLists.txt": [(r'\bQt[56]?\b', "Qt"), (r'(?i)\bgtk', "GTK")],
    "meson.build": [(r'(?i)\bgtk', "GTK"), (r'\bqt[56]\b', "Qt")],
    "docker-compose.yml": _COMPOSE, "docker-compose.yaml": _COMPOSE, "compose.yaml": _COMPOSE, "compose.yml": _COMPOSE,
}
TAG_ORDER = [".NET", "Avalonia", "Kotlin", "Jetpack Compose", "Flutter", "React Native", "Swift", "Rust", "Tauri", "Electron", "Qt",
             "GTK", "C/C++", "Go", "Python", "Django", "Flask", "FastAPI", "TypeScript", "JavaScript", "Node.js", "Deno", "Bun",
             "Next.js", "Nuxt", "Astro", "React", "Vue", "Svelte", "Angular", "Vite", "Tailwind CSS", "Sass", "Express", "NestJS",
             "Java", "Spring", "PHP", "Laravel", "Symfony", "Ruby", "Rails", "Elixir", "Scala", "Haskell", "Zig", "Lua", "Godot",
             "Unity", "HTML", "CSS", "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Supabase", "Firebase", "Prisma",
             "Docker", "Kubernetes", "Nginx", "Shell"]


PLATFORM_ORDER = ["Android", "iOS", "Windows", "Linux", "macOS", "Web", "Discord", "Telegram"]
# Frameworks web (front et serveur) reconnus dans les dépendances
WEB_JS = r'"(next|nuxt|@sveltejs/kit|astro|vite|react-scripts|express|fastify|koa|hono|@nestjs/core|@remix-run/[\w-]+|@angular/core|vue|svelte|ejs|socket\.io)"\s*:'
# Interfaces web côté navigateur (un bot qui en a une reste aussi « Web »)
WEB_FRONT_JS = r'"(next|nuxt|@sveltejs/kit|astro|vite|react-scripts|react-dom|@angular/core|vue|svelte)"\s*:'
# Bots : la plateforme est la messagerie, même si un petit serveur web (Express…) les accompagne
BOTS = [("Discord", r'"(discord\.js|eris|oceanic\.js|@discordjs/[\w-]+)"\s*:',
         r'^\s*"?(discord\.py|discord|nextcord|py-cord|disnake|hikari)\b'),
        ("Telegram", r'"(telegraf|grammy|node-telegram-bot-api)"\s*:',
         r'^\s*"?(python-telegram-bot|aiogram|pytelegrambotapi|telethon|pyrogram)\b')]
# Sites statiques et applis web installables : fichiers repères à la racine
WEB_ROOT_FILES = {"manifest.webmanifest", "sw.js", "service-worker.js", "firebase.json", "netlify.toml",
                  "vercel.json", "wrangler.toml", "_redirects", "staticwebapp.config.json"}
WEB_PY = r'^\s*"?(flask|django|fastapi|starlette|aiohttp|quart|tornado|sanic|streamlit|gradio)\b'
WEB_PHP = r'"(laravel/framework|symfony/[\w-]+|slim/slim|cakephp/cakephp)"'
WEB_RB = r'^\s*gem\s+["\'](rails|sinatra|hanami)["\']'
WEB_GO = r'(github\.com/(gin-gonic/gin|labstack/echo|gofiber/fiber|go-chi/chi)|net/http)'

_platform_cache = {}
DESKTOP_CRATES = re.compile(r'^\s*(eframe|egui|iced|slint|gpui|winit|druid|tauri|dioxus-desktop|fltk)\b', re.M)


def _walk_limited(p, depth=3):
    """Fichiers jusqu'à `depth` niveaux, sans les dossiers lourds."""
    skip = HIDDEN | {"build", "dist", "target", "vendor", "out", ".next", "venv", "third_party", "Pods"}
    for dirpath, dirnames, filenames in os.walk(p):
        rel = Path(dirpath).relative_to(p)
        dirnames[:] = [d for d in dirnames if d not in skip and (not d.startswith(".") or d in (".github",))]
        if len(rel.parts) >= depth:
            dirnames[:] = [d for d in dirnames if rel.parts[:1] == (".github",)]
        yield rel, dirnames, filenames


def detect_platforms(p):
    """Plateformes visées, d'après la structure du dépôt (mise en cache 5 min)."""
    hit = _platform_cache.get(str(p))
    if hit and time.time() - hit[0] < 300:
        return hit[1]
    found = set()
    ci = ""
    try:
        for rel, dirs, files in _walk_limited(p):
            names = set(files)
            top = rel.parts[:1]
            if "AndroidManifest.xml" in names or (("build.gradle" in names or "build.gradle.kts" in names)
                                                     and "android" in (p / rel).as_posix().lower()):
                found.add("Android")
            if any(d.endswith(".xcodeproj") for d in dirs) or (rel.name == "ios" and "Podfile" in names):
                found.add("iOS")
            if "tauri.conf.json" in names or rel.name == "src-tauri":
                found |= {"Windows", "Linux", "macOS"}
            if "Cargo.toml" in names:
                try:
                    if DESKTOP_CRATES.search(read_small(p / rel / "Cargo.toml")):
                        found |= {"Windows", "Linux", "macOS"}
                except OSError:
                    pass
            if rel == Path(".") and not (p / "src-tauri").exists() and (
                    "index.html" in names or names & WEB_ROOT_FILES):
                found.add("Web")  # site statique ou appli web installable (PWA) à la racine
            if "package.json" in names:
                try:
                    pkg = read_small(p / rel / "package.json")
                    bots = [name for name, rx_js, _x in BOTS if re.search(rx_js, pkg)]
                    found |= set(bots)
                    if '"electron"' in pkg:
                        found |= {"Windows", "Linux", "macOS"}
                    elif not (p / rel / "src-tauri").exists() and (
                            re.search(WEB_FRONT_JS, pkg) or (not bots and re.search(WEB_JS, pkg))):
                        found.add("Web")
                except OSError:
                    pass
            # Applis web côté serveur : Python, PHP, Ruby, Go
            for fname, rx in (("requirements.txt", WEB_PY), ("pyproject.toml", WEB_PY), ("composer.json", WEB_PHP),
                              ("Gemfile", WEB_RB), ("go.mod", WEB_GO)):
                if fname not in names:
                    continue
                try:
                    txt = read_small(p / rel / fname, 200_000)
                except OSError:
                    continue
                bots = [name for name, _x, rx_py in BOTS if fname in ("requirements.txt", "pyproject.toml")
                        and re.search(rx_py, txt, re.I | re.M)]
                found |= set(bots)
                if not bots and "Web" not in found and re.search(rx, txt, re.I | re.M):
                    found.add("Web")
            for flutter_dir, plat in (("windows", "Windows"), ("linux", "Linux"), ("macos", "macOS"), ("web", "Web")):
                if rel.name == flutter_dir and (p / rel.parent / "pubspec.yaml").exists():
                    found.add(plat)
            if top == (".github",):
                for f in files:
                    if f.endswith((".yml", ".yaml")):
                        try:
                            ci += read_small(p / rel / f, 200_000)
                        except OSError:
                            pass
    except OSError:
        pass
    # Intégration continue : artefacts publiés par plateforme
    if re.search(r"\.(msi|exe)\b|nsis|windows-latest|windows-20\d\d", ci):
        found.add("Windows")
    if re.search(r"\.(dmg|pkg)\b|macos-latest|macos-1\d", ci):
        found.add("macOS")
    if re.search(r"\.(AppImage|deb|rpm|flatpak|snap)\b", ci):
        found.add("Linux")
    if re.search(r"\.(apk|aab)\b", ci):
        found.add("Android")
    out = sorted(found, key=PLATFORM_ORDER.index)
    _platform_cache[str(p)] = (time.time(), out)
    return out


_desc_tried = {}


def sync_description(slug, force=False):
    """Reprend la description du dépôt distant (GitHub, GitLab…) si le projet n'en a pas."""
    from . import forges
    if not force and time.time() - _desc_tried.get(slug, 0) < 3600:
        return None
    _desc_tried[slug] = time.time()
    p = root() / slug
    if config.project_meta(slug).get("description"):
        return None
    code, url = git(p, "remote", "get-url", "origin")
    if code != 0:
        return None
    info = forges.repo_info(url)
    if info and info["description"]:
        config.set_project_meta(slug, description=info["description"])
        return info["description"]
    return None


def detect_tags(p):
    """Technos du projet, d'après des fichiers repères à la racine ou dans un sous-dossier direct."""
    found = set()
    dirs = [p]
    skip = HIDDEN | {"build", "dist", "target", "vendor", "docs", "tests", "test"}
    try:
        first = sorted(d for d in p.iterdir() if d.is_dir() and not d.name.startswith(".") and d.name not in skip)[:40]
        dirs += first
        for d in first:
            if d.name in ("src", "apps", "packages", "crates", "modules", "projects"):
                dirs += sorted(x for x in d.iterdir() if x.is_dir() and not x.name.startswith("."))[:30]
    except OSError:
        pass
    for d in dirs:
        for f, tag in TAG_RULES:
            if tag not in found and (d / f).exists():
                found.add(tag)
        for pattern, tag in TAG_GLOBS:
            if tag not in found:
                try:
                    if next(d.glob(pattern), None) is not None:
                        found.add(tag)
                except OSError:
                    pass
        for gradle in ("build.gradle.kts", "build.gradle"):
            g = d / gradle
            if g.exists():
                try:
                    txt = read_small(g)
                except OSError:
                    txt = ""
                found.add("Kotlin" if gradle.endswith(".kts") or "kotlin" in txt.lower() else "Java")
        for fname, rules in TAG_DEPS.items():
            f = d / fname
            try:
                if not f.is_file() or f.stat().st_size > 400_000:
                    continue
                txt = read_small(f)
            except OSError:
                continue
            for pattern, tag in rules:
                if tag not in found and re.search(pattern, txt):
                    found.add(tag)
        # Avalonia (interface .NET multiplateforme)
        if ".NET" in found and "Avalonia" not in found:
            for proj in list(d.glob("*.csproj"))[:5]:
                try:
                    if 'Include="Avalonia' in read_small(proj):
                        found.add("Avalonia")
                        break
                except OSError:
                    pass
    if "TypeScript" in found:  # fichiers de config en .js d'un projet TypeScript
        found.discard("JavaScript")
    return sorted(found, key=lambda t: TAG_ORDER.index(t) if t in TAG_ORDER else 99)


def git(p, *args, timeout=30, strip=True, env=None):
    # core.quotePath=false : les noms accentués restent lisibles (sinon « caf\303\251.txt »)
    return run(["git", "-C", str(p), "-c", "core.quotePath=false", *args], timeout=timeout, strip=strip, env=env)


def remote_env(p, write=False):
    """Environnement de git avec le jeton du compte lié qui correspond au dépôt distant (HTTPS)."""
    from . import forges
    code, url = git(p, "remote", "get-url", "origin")
    return forges.git_env(url if code == 0 else "", child_env(), write=write)


def current_branch(p):
    code, branch = git(p, "rev-parse", "--abbrev-ref", "HEAD")
    if code == 0:
        return branch
    code, branch = git(p, "symbolic-ref", "--short", "HEAD")  # dépôt sans commit
    return branch if code == 0 else _("(aucun commit)")


def git_quick(p):
    if not (p / ".git").exists():
        return None
    branch = current_branch(p)
    code, status = git(p, "status", "--porcelain")
    changes = len([l for l in status.splitlines() if l.strip()]) if code == 0 else 0
    return {"branch": branch, "changes": changes}


def summary(p, activity=None):
    from . import claude  # import tardif (dépendance circulaire)
    from .util import last_activity_map
    slug = p.name
    meta = config.project_meta(slug)
    # Choisies à la main ou non, les plus importantes d'abord (les cartes n'en montrent que 5 avant « +N »)
    tags = sorted(meta.get("tags") or detect_tags(p), key=lambda t: TAG_ORDER.index(t) if t in TAG_ORDER else len(TAG_ORDER))
    platforms = meta.get("platforms") if meta.get("platforms") is not None else detect_platforms(p)
    try:
        mtime = p.stat().st_mtime
    except OSError:
        mtime = 0
    last = mtime
    if (p / ".git").exists():
        code, ct = git(p, "log", "-1", "--format=%ct")
        if code == 0 and ct.isdigit():
            last = max(last, int(ct))
    activity = activity if activity is not None else last_activity_map()
    last = max(last, activity.get(slug, 0))
    return {
        "slug": slug,
        "name": meta.get("name") or slug,
        "path": str(p),
        "description": meta.get("description", ""),
        "tags": tags,
        "platforms": platforms,
        # Réglés à la main (sinon détectés automatiquement)
        "tags_manual": bool(meta.get("tags")), "platforms_manual": meta.get("platforms") is not None,
        "git": git_quick(p),
        "claude": claude.state(slug, light=True),
        "app_id": deployer.app_id(meta),
        "icon": icon_version(slug),
        "mtime": mtime,
        "last_activity": last,
    }


# Taille des dossiers projets : `du` en tâche de fond, au plus toutes les 10 min (gros node_modules…)
SIZE_EVERY = 600
_sizes = {"t": 0, "v": {}, "thread": None}


def _compute_sizes():
    import subprocess
    out = {}
    try:
        dirs = [p for p in root().iterdir() if p.is_dir() and not p.name.startswith(".")]
    except OSError:
        dirs = []
    from . import branches
    for p in dirs:
        try:
            # Dossier principal + copies de travail des branches (~/projets/.branches/<projet>).
            # stdout seul : les dossiers illisibles écrivent sur stderr mais le total reste juste.
            paths = [str(p)] + ([str(branches.base_dir(p.name))] if branches.base_dir(p.name).is_dir() else [])
            r = subprocess.run(["du", "-sbc", *paths], capture_output=True, text=True, timeout=180)
            out[p.name] = int(r.stdout.strip().splitlines()[-1].split()[0])
        except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
            out[p.name] = None  # illisible : on n'insiste pas avant le prochain calcul
    _sizes["v"] = out
    _sizes["t"] = time.time()


def invalidate_sizes():
    _sizes["t"] = 0


def project_sizes(slugs=(), wait=2.0):
    """{slug: octets}. Relance le calcul s'il est trop ancien ou s'il manque un dossier (projet tout neuf) ;
    dans ce cas, attend un peu le résultat."""
    import threading
    missing = any(x not in _sizes["v"] for x in slugs)
    th = _sizes["thread"]
    if (th is None or not th.is_alive()) and (missing or time.time() - _sizes["t"] > SIZE_EVERY):
        th = _sizes["thread"] = threading.Thread(target=_compute_sizes, daemon=True, name="sizes")
        th.start()
    if (missing or not _sizes["t"]) and th is not None:
        th.join(wait)
    return _sizes["v"]


def list_projects():
    from .util import last_activity_map
    activity = last_activity_map()
    dirs = [p for p in sorted(root().iterdir(), key=lambda x: x.name.lower())
            if p.is_dir() and not p.name.startswith(".") and SLUG_RE.match(p.name)]
    sizes = project_sizes([p.name for p in dirs])
    out = []
    for p in dirs:
        out.append(summary(p, activity))
        out[-1]["size"] = sizes.get(p.name)
    # Projets sans description : on la reprend du dépôt distant, en arrière-plan (au plus 1 fois par heure)
    missing = [x["slug"] for x in out if not x["description"] and x["git"] and time.time() - _desc_tried.get(x["slug"], 0) > 3600]
    no_icon = [x["slug"] for x in out if not x["icon"] and time.time() - _icon_tried.get(x["slug"], 0) > 3600]
    if missing or no_icon:
        import threading
        threading.Thread(target=lambda: ([sync_description(s) for s in missing], [auto_icon(s) for s in no_icon]),
                         daemon=True).start()
    return out


def details(slug):
    p = project_dir(slug)
    info = summary(p)
    remote = ""
    if info["git"]:
        _x, remote = git(p, "remote", "get-url", "origin")
        if "fatal" in remote or "error" in remote:
            remote = ""
    info["remote"] = mask_url(remote)
    info["has_claude_md"] = (p / "CLAUDE.md").exists()
    return info


# --- Icône du projet ----------------------------------------------------------
# Copiée dans ~/.config/helmshell/icones/<slug>.<ext> : rien n'est ajouté au dépôt.

ICON_EXT = {"png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif"}
ICON_MAX = 2 * 1024 * 1024
ICON_NAME_RE = re.compile(r"(icon|logo|favicon|ic_launcher|apple-touch|brand|appicon)", re.I)
ICON_SKIP = HIDDEN | {"build", "dist", "target", "vendor", ".next", "out", "venv", "coverage", ".dart_tool"}


def icons_dir():
    return config.DATA_DIR / "icones"


def icon_file(slug):
    d = icons_dir()
    if not d.is_dir():
        return None
    for ext in ICON_EXT:
        f = d / f"{slug}.{ext}"
        if f.is_file():
            return f
    return None


def icon_version(slug):
    f = icon_file(slug)
    try:
        return int(f.stat().st_mtime) if f else 0
    except OSError:
        return 0


def _check_icon(data, ext):
    ext = (ext or "").lower().lstrip(".")
    if ext == "jpeg":
        ext = "jpg"
    if ext not in ICON_EXT:
        raise ApiError(_("Format d'image non pris en charge (png, jpg, svg, webp, gif, ico, avif)"))
    if not data or len(data) > ICON_MAX:
        raise ApiError(_("Image vide ou trop grosse (2 Mo max)"))
    if ext == "svg" and b"<svg" not in data[:4096].lower():
        raise ApiError(_("Ce fichier SVG n'est pas valide"))
    return ext


def set_icon(slug, data, ext):
    project_dir(slug)
    ext = _check_icon(data, ext)
    d = icons_dir()
    d.mkdir(parents=True, exist_ok=True)
    remove_icon(slug)
    tmp = d / f".{slug}.tmp"
    tmp.write_bytes(data)
    os.replace(tmp, d / f"{slug}.{ext}")
    return icon_version(slug)


def set_icon_from_repo(slug, rel):
    p = project_dir(slug)
    f = safe_path(p, rel)
    if not f.is_file():
        raise ApiError(_("Fichier introuvable"), 404)
    if f.stat().st_size > ICON_MAX:
        raise ApiError(_("Image trop grosse (2 Mo max)"))
    return set_icon(slug, f.read_bytes(), f.suffix)


def remove_icon(slug):
    d = icons_dir()
    for ext in ICON_EXT:
        try:
            (d / f"{slug}.{ext}").unlink()
        except OSError:
            pass


ICON_DIRS = {"branding", "brand", "icons", "icon", "logo", "logos", "assets", "art", "images", "img", "media"}
ICON_NOT = re.compile(r"(screenshot|screen-?shot|capture|banner|hero|demo|preview|social|cover|badge|tray|splash)", re.I)
README_IMG = re.compile(r"""<img[^>]*?src=["']([^"']+)["'][^>]*>|!\[([^\]]*)\]\(([^)\s]+)""", re.I)


def _readme_logo(p):
    """Premier visuel du README quand il ressemble à un logo (GitHub met souvent le logo tout en haut)."""
    for name in ("README.md", "readme.md", "README.MD", "Readme.md"):
        f = p / name
        if not f.is_file():
            continue
        try:
            head = read_small(f, 6000)
        except OSError:
            return None
        for m in README_IMG.finditer(head):
            src = (m.group(1) or m.group(3) or "").split("#")[0].split("?")[0]
            tag = m.group(0).lower()
            if not src or src.startswith(("http:", "https:", "data:")):
                continue  # badges et images distantes
            if "logo" in tag or "icon" in tag or ("width" in tag and head.find(m.group(0)) < 800):
                return src.lstrip("./")
        return None
    return None


def icon_candidates(slug, limit=40):
    """Images du dépôt qui ressemblent à une icône ou un logo, les plus probables d'abord.

    Indices : logo en tête du README, nom contenant icon / logo / favicon / le nom du projet,
    dossiers branding / icons / assets, icônes d'application (hicolor, mipmap, .ico)."""
    p = project_dir(slug)
    found = []
    start = time.time()
    key = re.sub(r"[^a-z0-9]", "", slug.lower())
    readme = _readme_logo(p)
    for dirpath, dirnames, filenames in os.walk(p):
        dirnames[:] = [d for d in dirnames if d not in ICON_SKIP and not d.startswith(".")]
        rel_dir = Path(dirpath).relative_to(p)
        depth = len(rel_dir.parts)
        if depth >= 7:
            dirnames[:] = []
        in_icon_dir = any(part.lower() in ICON_DIRS for part in rel_dir.parts)
        for fn in filenames:
            ext = fn.rsplit(".", 1)[-1].lower() if "." in fn else ""
            if ext not in ICON_EXT:
                continue
            f = Path(dirpath) / fn
            rel = str(f.relative_to(p))
            low = rel.lower()
            stem = re.sub(r"[^a-z0-9]", "", fn.rsplit(".", 1)[0].lower())
            by_name = bool(ICON_NAME_RE.search(fn))
            by_project = bool(key) and len(key) >= 3 and key in stem
            app_icon = "/hicolor/" in "/" + low or ext == "ico" or "mipmap" in low
            is_readme = readme is not None and rel == readme
            if not (by_name or by_project or app_icon or is_readme or (in_icon_dir and not ICON_NOT.search(fn))):
                continue
            if ICON_NOT.search(fn) and not is_readme:
                continue
            try:
                size = f.stat().st_size
            except OSError:
                continue
            if not size or size > ICON_MAX:
                continue
            score = 0
            score += 120 if is_readme else 0
            score += 30 if ext == "svg" else 20 if ext == "png" else 12 if ext == "ico" else 8
            score += 25 if by_project else 0
            score += 15 if "logo" in fn.lower() else 0
            score += 10 if by_name else 0
            score += 8 if in_icon_dir else 0
            score += 12 if "xxxhdpi" in low else 8 if "xxhdpi" in low else 0
            m = re.search(r"/(\d{2,4})x\d{2,4}/", "/" + low)
            if m:
                score += min(int(m.group(1)) // 32, 16)  # icônes hicolor : la plus grande d'abord
            score += 10 if "round" not in low and "foreground" not in low and "background" not in low else -10
            score += min(size // 4096, 15)
            score -= depth * 3
            found.append({"path": rel, "size": size, "score": score,
                          "strong": is_readme or by_project or by_name})
        if time.time() - start > 3:
            break
    found.sort(key=lambda x: -x["score"])
    return [{"path": x["path"], "size": x["size"], "strong": x["strong"]} for x in found[:limit]]


_icon_tried = {}


def auto_icon(slug):
    """Projet sans icône (cloné à la main, par ex.) : prend le logo du dépôt s'il y en a un clairement identifié."""
    if icon_file(slug) or time.time() - _icon_tried.get(slug, 0) < 3600:
        return None
    _icon_tried[slug] = time.time()
    try:
        best = next((c for c in icon_candidates(slug, limit=5) if c["strong"]), None)
        if best:
            set_icon_from_repo(slug, best["path"])
            return best["path"]
    except (ApiError, OSError):
        pass
    return None


# --- Fichiers ----------------------------------------------------------------

def git_modified_set(p):
    if not (p / ".git").exists():
        return set()
    code, out = git(p, "status", "--porcelain", "-uall", strip=False)
    mod = set()
    if code != 0:
        return mod
    for line in out.splitlines():
        path = line[3:].split(" -> ")[-1].strip('"')
        mod.add(path)
        parts = path.split("/")
        for i in range(1, len(parts)):
            mod.add("/".join(parts[:i]))
    return mod


def tree(slug, rel):
    base = project_dir(slug)
    d = safe_path(base, rel)
    if not d.is_dir():
        raise ApiError(_("Ce n'est pas un dossier"))
    modified = git_modified_set(base)
    entries = []
    for e in d.iterdir():
        r = rel_of(base, e) if not e.is_symlink() else str(Path(rel or "") / e.name).lstrip("/")
        try:
            is_dir = e.is_dir()
            size = 0 if is_dir else e.stat().st_size
        except OSError:
            is_dir, size = False, 0
        entries.append({
            "name": e.name, "path": r, "dir": is_dir, "size": size,
            "modified": r in modified, "heavy": e.name in HIDDEN,
        })
    entries.sort(key=lambda x: (not x["dir"], x["name"].lower()))
    return entries


def read_file(slug, rel):
    base = project_dir(slug)
    f = safe_path(base, rel)
    if not f.is_file():
        raise ApiError(_("Fichier introuvable"), 404)
    size = f.stat().st_size
    with open(f, "rb") as fh:
        raw = fh.read(MAX_PREVIEW)
    binary = b"\x00" in raw[:8000]
    content = None
    if not binary:
        try:
            content = raw.decode("utf-8")
        except UnicodeDecodeError:
            content = raw.decode("latin-1")
    return {"path": rel, "size": size, "binary": binary, "content": content,
            "truncated": size > MAX_PREVIEW, "mtime": f.stat().st_mtime}


def write_file(slug, rel, content):
    base = project_dir(slug)
    f = safe_path(base, rel)
    if f.is_dir():
        raise ApiError(_("C'est un dossier"))
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(content)
    log_activity(_("Fichier {slug}/{rel} enregistré", slug=slug, rel=rel), "file", slug)


def write_bytes(slug, rel, data):
    base = project_dir(slug)
    f = safe_path(base, rel)
    if f.is_dir():
        raise ApiError(_("C'est un dossier"))
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(data)


def mkdir(slug, rel):
    base = project_dir(slug)
    d = safe_path(base, rel)
    if d.exists():
        raise ApiError(_("Existe déjà"))
    d.mkdir(parents=True)
    log_activity(_("Dossier {slug}/{rel} créé", slug=slug, rel=rel), "file", slug)


def newfile(slug, rel):
    base = project_dir(slug)
    f = safe_path(base, rel)
    if f.exists():
        raise ApiError(_("Existe déjà"))
    f.parent.mkdir(parents=True, exist_ok=True)
    f.touch()


def rename(slug, src, dst):
    base = project_dir(slug)
    a, b = safe_path(base, src), safe_path(base, dst)
    if a == base.resolve():
        raise ApiError(_("Impossible de renommer la racine"))
    if b.exists():
        raise ApiError(_("La destination existe déjà"))
    b.parent.mkdir(parents=True, exist_ok=True)
    a.rename(b)
    log_activity(_("{slug}/{src} renommé en {dst}", slug=slug, src=src, dst=dst), "file", slug)


def delete(slug, rel):
    """Déplace le fichier ou dossier dans la corbeille (<racine>/.corbeille), restaurable 30 jours."""
    import json
    import secrets
    base = project_dir(slug)
    t = safe_path(base, rel)
    if t == base.resolve():
        raise ApiError(_("Impossible de supprimer la racine du projet ici"))
    if not t.exists() and not t.is_symlink():
        raise ApiError(_("Introuvable"), 404)
    tid = f"{int(time.time())}-{secrets.token_hex(3)}"
    dest = trash_dir() / tid
    dest.mkdir(parents=True)
    shutil.move(str(t), str(dest / t.name))
    (trash_dir() / f"{tid}.json").write_text(json.dumps(
        {"id": tid, "slug": slug, "path": rel_of(base, t) or rel, "name": t.name, "deleted": time.time()},
        ensure_ascii=False))
    log_activity(_("{slug}/{rel} mis à la corbeille", slug=slug, rel=rel), "file", slug)
    return {"trash_id": tid}


def delete_project(slug):
    """Met tout le dossier du projet à la corbeille (restaurable 30 jours).

    Rien n'est envoyé aux dépôts distants (GitHub…) ni à Coolify : seul le dossier local bouge.
    Les sessions tmux du projet (Claude, shells) sont fermées avant.
    """
    import json
    import secrets
    from . import branches, claude, tasks, terminal
    p = project_dir(slug)
    if any(t.get("slug") == slug and t.get("status") == "running" for t in tasks.list_tasks(slug, limit=50)):
        raise ApiError(_("Une tâche de fond tourne dans ce projet : arrête-la d'abord"), 409)
    try:
        claude.stop(slug)
    except ApiError:
        pass
    for agent in claude.REPO_AGENTS:
        claude._tmux("kill-session", "-t", "=" + claude.repo_session(slug, agent))
    branches.kill_sessions(slug)
    for t in terminal.list_sessions():
        if t.get("slug") == slug:
            claude._tmux("kill-session", "-t", "=" + t["name"])
    tid = f"{int(time.time())}-{secrets.token_hex(3)}"
    dest = trash_dir() / tid
    dest.mkdir(parents=True)
    shutil.move(str(p), str(dest / slug))
    branches.move_all(slug, dest / ".branches")  # copies de travail des branches : avec le projet
    meta = config.remove_project_meta(slug)
    (trash_dir() / f"{tid}.json").write_text(json.dumps(
        {"id": tid, "slug": slug, "path": "", "name": slug, "deleted": time.time(), "project": True,
         "meta": meta}, ensure_ascii=False))
    log_activity(_("Projet {name} mis à la corbeille", name=meta.get("name") or slug), "stop", slug)
    return {"trash_id": tid}


# --- Corbeille -----------------------------------------------------------------

TRASH_DAYS = 30
TRASH_ID = re.compile(r"^[0-9]{10}-[a-f0-9]{6}$")


def trash_dir():
    d = root() / ".corbeille"
    d.mkdir(exist_ok=True)
    return d


def _tree_size(path):
    if path.is_file() or path.is_symlink():
        return path.lstat().st_size
    total = 0
    for dirpath, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.lstat(os.path.join(dirpath, f)).st_size
            except OSError:
                pass
    return total


def list_trash():
    import json
    out = []
    now = time.time()
    for meta in sorted(trash_dir().glob("*.json"), reverse=True):
        if not TRASH_ID.match(meta.stem):
            continue
        try:
            info = json.loads(meta.read_text())
        except ValueError:
            continue
        if now - info.get("deleted", now) > TRASH_DAYS * 86400:
            purge_trash(meta.stem)
            continue
        item = trash_dir() / meta.stem / info.get("name", "")
        info["dir"] = item.is_dir()
        info["size"] = _tree_size(item) if item.exists() else 0
        out.append(info)
    return out


def _trash_item(tid):
    import json
    if not TRASH_ID.match(tid or ""):
        raise ApiError(_("Élément inconnu"), 404)
    meta = trash_dir() / f"{tid}.json"
    if not meta.exists():
        raise ApiError(_("Élément introuvable dans la corbeille"), 404)
    return json.loads(meta.read_text())


def restore_trash(tid):
    info = _trash_item(tid)
    if info.get("project"):
        # Projet entier : on remet le dossier à la racine et ses réglages (nom, icône, Coolify…)
        if not SLUG_RE.match(info.get("slug") or ""):
            raise ApiError(_("Élément invalide"))
        target = root() / info["slug"]
        if target.exists():
            raise ApiError(_("Un dossier {slug} existe déjà dans les projets", slug=info["slug"]))
        shutil.move(str(trash_dir() / tid / info["name"]), str(target))
        from . import branches
        branches.restore_all(info["slug"], trash_dir() / tid / ".branches")
        meta = {k: v for k, v in (info.get("meta") or {}).items() if v is not None}
        if meta:
            config.set_project_meta(info["slug"], **meta)
        purge_trash(tid)
        log_activity(_("Projet {name} restauré depuis la corbeille", name=meta.get("name") or info["slug"]), "file",
                     info["slug"])
        return {"path": "", "slug": info["slug"], "project": True}
    base = project_dir(info["slug"])
    target = safe_path(base, info["path"])
    if target.exists():
        stem, dot, ext = target.name.partition(".")
        target = target.with_name(stem + " " + _("(restauré)") + dot + ext)
        if target.exists():
            raise ApiError(_("{path} existe déjà", path=info["path"]))
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(trash_dir() / tid / info["name"]), str(target))
    purge_trash(tid)
    log_activity(_("{slug}/{path} restauré depuis la corbeille", slug=info["slug"], path=info["path"]), "file",
                 info["slug"])
    return {"path": rel_of(base, target), "slug": info["slug"]}


def purge_trash(tid=None):
    ids = [tid] if tid else [m.stem for m in trash_dir().glob("*.json") if TRASH_ID.match(m.stem)]
    for i in ids:
        if not TRASH_ID.match(i or ""):
            continue
        d = trash_dir() / i
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
        (trash_dir() / f"{i}.json").unlink(missing_ok=True)


# --- Git ---------------------------------------------------------------------

def git_info(slug):
    p = project_dir(slug)
    if not (p / ".git").exists():
        return {"repo": False}
    branch = current_branch(p)
    _x, remote = git(p, "remote", "get-url", "origin")
    if remote.startswith(("fatal", "error")):
        remote = ""
    ahead = behind = 0
    code, ab = git(p, "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
    upstream = code == 0
    if code == 0 and ab:
        ahead, behind = (int(x) for x in ab.split()[:2])
    numstat = {}
    for args in (("diff", "--numstat"), ("diff", "--numstat", "--cached")):
        _x, out = git(p, *args)
        for line in out.splitlines():
            parts = line.split("\t")
            if len(parts) == 3:
                a, d, path = parts
                cur = numstat.setdefault(path, [0, 0])
                cur[0] += int(a) if a.isdigit() else 0
                cur[1] += int(d) if d.isdigit() else 0
    changes = []
    _x, status = git(p, "status", "--porcelain", "-uall", strip=False)
    for line in status.splitlines():
        if len(line) < 4:
            continue
        xy, path = line[:2], line[3:].split(" -> ")[-1].strip('"')
        kind = "?" if xy == "??" else (xy.strip()[:1] or "M")
        add, dele = numstat.get(path, [0, 0])
        if kind == "?":
            try:
                fp = p / path
                st = os.stat(fp)
                if stat.S_ISREG(st.st_mode) and st.st_size < 2_000_000:
                    with open(fp, "rb") as fh:
                        add = sum(1 for _x in fh)
            except OSError:
                pass
        changes.append({"kind": "A" if kind == "?" else kind, "path": path, "add": add, "del": dele})
    _x, log = git(p, "log", "-n", "8", "--pretty=format:%h\t%s\t%ct")
    commits = [dict(zip(("hash", "msg", "when"), l.split("\t", 2))) for l in log.splitlines() if "\t" in l]
    return {"repo": True, "branch": branch, "remote": mask_url(remote), "ahead": ahead, "behind": behind, "upstream": upstream,
            "fetched": _last_fetch.get(slug, 0),
            "changes": changes, "log": commits}


def git_diff(slug, rel):
    p = project_dir(slug)
    safe_path(p, rel)
    has_head = git(p, "rev-parse", "--verify", "-q", "HEAD")[0] == 0
    out = git(p, "diff", "HEAD", "--", rel)[1] if has_head else ""
    if not out:
        _x, out = git(p, "diff", "--no-index", "--", "/dev/null", rel)  # « -- » : un fichier nommé --output=… reste un chemin
    return out[:400_000]


def _identity_args(p):
    code, email = git(p, "config", "user.email")
    if code == 0 and email:
        return []
    return ["-c", "user.name=Helmshell", "-c", "user.email=helmshell@localhost"]


def git_commit(slug, message, push, paths=None):
    p = project_dir(slug)
    if not message.strip():
        raise ApiError(_("Message de commit vide"))
    if paths is not None:
        paths = [str(x) for x in paths if str(x).strip()]
        if not paths:
            raise ApiError(_("Choisis au moins un fichier"))
        for rel in paths:
            safe_path(p, rel)
        # Un renommage « a -> b » : il faut aussi l'ancien chemin, sinon « a » resterait suivi.
        _x, status = git(p, "status", "--porcelain", "-uall", strip=False)
        for line in status.splitlines():
            if " -> " in line[3:]:
                old, new = (x.strip('"') for x in line[3:].split(" -> ", 1))
                if new in paths and old not in paths:
                    paths.append(old)
        # Seuls les fichiers choisis vont dans le commit : on vide l'index puis on ajoute la sélection.
        # L'index d'origine est mis de côté pour être remis en place si l'ajout échoue.
        _x, saved_tree = git(p, "write-tree")
        has_head = git(p, "rev-parse", "--verify", "-q", "HEAD")[0] == 0
        if has_head:
            git(p, "reset", "-q")
        else:
            git(p, "rm", "-r", "-q", "--cached", "--ignore-unmatch", ".")
        code, out = git(p, "add", "-A", "--", *paths)
        if code != 0 and re.fullmatch(r"[0-9a-f]{40,64}", saved_tree.strip()):
            git(p, "read-tree", saved_tree.strip())
    else:
        code, out = git(p, "add", "-A")
    if code != 0:
        raise ApiError(out)
    code, out = run(["git", "-C", str(p), "-c", "core.quotePath=false", *_identity_args(p), "commit", "-m", message],
                    timeout=60)
    if code != 0:
        raise ApiError(out or _("Rien à valider"))
    result = out
    if push:
        _x, remote = git(p, "remote")
        if remote.strip():
            code, pout = git(p, "push", "-u", "origin", "HEAD", timeout=120, env=remote_env(p, write=True))
            result += "\n" + pout
            if code != 0:
                log_activity(_("Commit sur {slug} (push en échec)", slug=slug), "error", slug)
                raise ApiError(_("Commit créé mais le push a échoué :\n{output}", output=pout))
        else:
            result += "\n" + _("Pas de dépôt distant : rien à pousser.")
    log_activity(_("Commit « {message} » sur {slug}", message=message.splitlines()[0][:60], slug=slug), "git", slug)
    return result


BRANCH_RE = re.compile(r"^[A-Za-z0-9._/-]{1,120}$")
HASH_RE = re.compile(r"^[0-9a-f]{4,40}$")


def git_branches(slug):
    p = project_dir(slug)
    if not (p / ".git").exists():
        return {"current": None, "local": [], "remote": []}
    _x, out = git(p, "branch", "--format=%(refname:short)\t%(HEAD)\t%(upstream:short)\t%(committerdate:unix)")
    local = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) == 4:
            local.append({"name": parts[0], "current": parts[1] == "*", "upstream": parts[2],
                          "when": int(parts[3]) if parts[3].isdigit() else 0})
    _x, rout = git(p, "branch", "-r", "--format=%(refname:short)")
    names = {b["name"] for b in local}
    remote = [r for r in rout.splitlines() if r and not r.endswith("/HEAD") and "/" in r
              and r.split("/", 1)[1] not in names]
    return {"current": current_branch(p), "local": local, "remote": remote}


def git_checkout(slug, branch, create=False):
    p = project_dir(slug)
    branch = (branch or "").strip()
    # « origin/x » : crée la branche locale x qui suit la branche distante
    local = branch.split("/", 1)[1] if branch.startswith("origin/") and not create else branch
    if (not BRANCH_RE.match(branch) or ".." in branch
            or any(part.startswith("-") or not part for part in local.split("/"))):
        raise ApiError(_("Nom de branche invalide"))
    if git(p, "check-ref-format", "--branch", local)[0] != 0:
        raise ApiError(_("Nom de branche invalide"))
    if create:
        code, out = git(p, "switch", "-c", local)
    else:
        code, out = git(p, "switch", local)
    if code != 0:
        raise ApiError(out)
    log_activity(_("{slug} : branche {branch} créée", slug=slug, branch=branch) if create
                 else _("{slug} : branche {branch}", slug=slug, branch=branch), "git", slug)
    return out


def git_log(slug, skip=0, n=30):
    p = project_dir(slug)
    code, out = git(p, "log", f"--skip={max(0, int(skip))}", f"--max-count={max(1, min(int(n), 100))}",
                    "--pretty=format:%H\t%h\t%an\t%ct\t%D\t%s")
    if code != 0:
        return []
    commits = []
    for line in out.splitlines():
        parts = line.split("\t", 5)
        if len(parts) == 6:
            commits.append({"hash": parts[0], "short": parts[1], "author": parts[2],
                            "when": int(parts[3]) if parts[3].isdigit() else 0, "refs": parts[4],
                            "msg": parts[5]})
    return commits


def git_show(slug, rev):
    p = project_dir(slug)
    if not HASH_RE.match(rev or ""):
        raise ApiError(_("Commit invalide"))
    code, meta = git(p, "show", "-s", "--format=%H%n%an <%ae>%n%ct%n%B", rev)
    if code != 0:
        raise ApiError(meta, 404)
    lines = meta.splitlines()
    _x, stat = git(p, "show", "--format=", "--numstat", rev)
    files = []
    for line in stat.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            files.append({"path": parts[2], "add": int(parts[0]) if parts[0].isdigit() else 0,
                          "del": int(parts[1]) if parts[1].isdigit() else 0})
    _x, diff = git(p, "show", "--format=", "--patch", rev)
    return {"hash": lines[0] if lines else rev, "author": lines[1] if len(lines) > 1 else "",
            "when": int(lines[2]) if len(lines) > 2 and lines[2].isdigit() else 0,
            "message": "\n".join(lines[3:]).strip(), "files": files, "diff": diff[:400_000]}


_last_fetch = {}


def git_fetch(slug, force=False):
    """Met à jour les branches distantes (au plus toutes les 2 min) pour que « à jour » soit vrai."""
    p = project_dir(slug)
    if not (p / ".git").exists():
        return {"ok": False, "skipped": True}
    if git(p, "remote", "get-url", "origin")[0] != 0:
        return {"ok": False, "skipped": True}
    if not force and time.time() - _last_fetch.get(slug, 0) < 120:
        return {"ok": True, "skipped": True}
    _last_fetch[slug] = time.time()
    code, out = git(p, "fetch", "--prune", "origin", timeout=60, env=remote_env(p))
    return {"ok": code == 0, "output": out[-600:]}


CREDS_RE = re.compile(r"^https?://[^/\s]*@", re.I)   # https://jeton@hôte/… (ssh://git@… reste normal)


def mask_url(url):
    """URL de dépôt affichable : identifiants éventuels masqués."""
    return re.sub(r"^(https?://)[^/\s@]*@", r"\1•••@", url or "", flags=re.I)


REMOTE_RE = re.compile(r"^(https?://[^\s/@]+(:\d+)?/\S+|ssh://\S+|[\w.-]+@[\w.-]+:\S+)$")


def git_set_remote(slug, url):
    """Relie le projet à un dépôt distant (origin), récupère ses branches et suit la branche du même nom."""
    p = project_dir(slug)
    url = (url or "").strip()
    if not REMOTE_RE.match(url) or url.startswith("-"):
        raise ApiError(_("Adresse de dépôt invalide (https://… ou git@hôte:chemin)"))
    if not (p / ".git").exists():
        raise ApiError(_("Initialise d'abord Git dans ce projet"))
    code, old = git(p, "remote", "get-url", "origin")
    has = code == 0
    code, out = git(p, "remote", "set-url" if has else "add", "origin", url)
    if code != 0:
        raise ApiError(out)
    res = git_fetch(slug, force=True)
    if not res.get("ok"):
        # Injoignable : on remet le dépôt distant d'avant
        if has:
            git(p, "remote", "set-url", "origin", old)
        else:
            git(p, "remote", "remove", "origin")
        raise ApiError(_("Impossible de joindre ce dépôt (adresse, droits du jeton ?) :\n{output}",
                         output=res.get("output", "")))
    branch = current_branch(p)
    linked = ""
    if git(p, "rev-parse", "--verify", "--quiet", f"refs/remotes/origin/{branch}")[0] == 0:
        git(p, "branch", f"--set-upstream-to=origin/{branch}", branch)
        linked = branch
    log_activity(_("Dépôt distant relié : {url}", url=url), "git", slug)
    try:
        sync_description(slug, force=True)
    except Exception:  # noqa: BLE001 — la description est un bonus
        pass
    info = git_info(slug)
    info["tracking"] = linked
    # Historiques sans ancêtre commun : le dépôt local et le distant n'ont rien à voir (pour l'instant)
    info["unrelated"] = bool(linked) and git(p, "merge-base", "HEAD", f"origin/{branch}")[0] != 0
    return info


def git_init(slug):
    p = project_dir(slug)
    if (p / ".git").exists():
        raise ApiError(_("Ce dossier est déjà un dépôt Git"))
    code, out = git(p, "init", "-b", "main")
    if code != 0:
        raise ApiError(out)
    log_activity(_("Dépôt Git initialisé dans {slug}", slug=slug), "git", slug)
    return out


def git_pull(slug):
    p = project_dir(slug)
    code, out = git(p, "pull", "--ff-only", timeout=120, env=remote_env(p))
    if code != 0:
        raise ApiError(out)
    log_activity(_("Pull sur {slug}", slug=slug), "git", slug)
    return out


def suggest_commit(slug):
    p = project_dir(slug)
    git(p, "add", "-A", "--intent-to-add")
    _x, diff = git(p, "diff", "HEAD")
    if not diff:
        _x, diff = git(p, "diff")
    if not diff.strip():
        raise ApiError(_("Aucune modification"))
    # Message de commit dans la langue de Helmshell
    prompt = tr("Écris un message de commit Git concis en français (une ligne de titre de 72 caractères max, "
                "puis éventuellement une liste courte). Réponds uniquement avec le message, sans guillemets "
                "ni bloc de code.\n\nDiff :\n",
                "Write a concise Git commit message in English (a title line of 72 characters max, "
                "optionally followed by a short list). Reply with the message only, without quotes "
                "or code block.\n\nDiff:\n") + diff[:60_000]
    from . import agents
    if agents.default_agent() == "codex":
        # Codex : bac à sable en lecture seule, session non enregistrée (--ephemeral), réponse = dernier message
        from . import codex
        cmd = [codex.bin(), "exec", "--json", "--skip-git-repo-check", "-s", "read-only", "--ephemeral",
               "-C", str(p), "-"]
        code, out = run(cmd, cwd=str(p), timeout=180, input=prompt, env=child_env())
        text = codex.last_message(out)
        if code != 0 or not text:
            raise ApiError(_("Codex n'a pas pu répondre : {output}", output=out[-500:]))
        return text.strip().strip("`").strip()
    # Le diff vient du dépôt : Claude répond sans outils, sans les réglages, hooks ni serveurs MCP du dépôt
    code, out = run([config.get("claude_bin"), "-p", "--model", "haiku", "--restricted", "--strict-mcp-config",
                     "--tools", ""], cwd=str(p), timeout=180,
                    input=prompt, env=child_env())
    if code != 0:
        raise ApiError(_("Claude n'a pas pu répondre : {output}", output=out[-500:]))
    return out.strip().strip("`").strip()


# --- Création ----------------------------------------------------------------

def templates():
    """Fichiers des modèles de projet, dans la langue de Helmshell (%(slug)s, %(name)s : remplacés à la copie)."""
    hello = tr("Bonjour depuis %(name)s", "Hello from %(name)s")
    return {
        "node": {
            "package.json": '{\n  "name": "%(slug)s",\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": {\n    "start": "node index.js"\n  }\n}\n',
            "index.js": ("import http from 'node:http';\n\nconst port = process.env.PORT || 3000;\n"
                         "http.createServer((req, res) => {\n  res.end('" + hello + "');\n}).listen(port, () => console.log(`"
                         + tr("Écoute sur ${port}", "Listening on ${port}") + "`));\n"),
            ".gitignore": "node_modules/\n.env\n",
        },
        "python": {
            "main.py": 'def main():\n    print("' + hello + '")\n\n\nif __name__ == "__main__":\n    main()\n',
            "requirements.txt": "",
            ".gitignore": "__pycache__/\n.venv/\n.env\n",
        },
        "android": {
            ".gitignore": "*.iml\n.gradle/\nlocal.properties\n.idea/\nbuild/\ncaptures/\n.cxx/\n",
            "README.md": "# %(name)s\n\n" + tr(
                "Application Android (Kotlin). Demande à Claude de générer le squelette Gradle.\n",
                "Android app (Kotlin). Ask Claude to generate the Gradle skeleton.\n"),
        },
        "static": {
            "index.html": ('<!doctype html>\n<html lang="' + lang() + '">\n<head>\n  <meta charset="utf-8">\n'
                           '  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>%(name)s</title>\n'
                           '  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>%(name)s</h1>\n</body>\n</html>\n'),
            "style.css": "body {\n  font-family: system-ui, sans-serif;\n  margin: 2rem;\n}\n",
        },
    }


def _context_md(name, description, agent):
    """CLAUDE.md / AGENTS.md : consignes du projet, dans la langue de Helmshell."""
    if lang() == "fr":
        desc = description.strip() or f"[Décris ici le projet, ses technos et ce que {agent} doit savoir.]"
        return (f"# {name}\n\n{desc}\n\n## Règles\n\n"
                "- Réponds et commente en français\n"
                "- Ne commite jamais de secrets : ils vont dans .env\n")
    desc = description.strip() or f"[Describe the project here: its stack and what {agent} needs to know.]"
    return (f"# {name}\n\n{desc}\n\n## Rules\n\n"
            "- Reply and write comments in English\n"
            "- Never commit secrets: they go in .env\n")


def claude_md(name, description):
    return _context_md(name, description, "Claude")


def agents_md(name, description):
    """AGENTS.md : consignes du projet lues par Codex (et d'autres agents)."""
    return _context_md(name, description, tr("l'agent de code", "the coding agent"))


def create_project(data):
    from . import claude
    name = (data.get("name") or "").strip()
    if not name:
        raise ApiError(_("Donne un nom au projet"))
    slug = slugify(name)
    p = root() / slug
    if p.exists():
        raise ApiError(_("Le dossier {path} existe déjà", path=p))
    source = data.get("source", "vide")
    opts = data.get("opts") or {}
    description = data.get("description", "")
    steps = []

    def step(label, ok, detail=""):
        steps.append({"label": label, "ok": ok, "detail": detail[-2000:]})
        return ok

    if source == "git":
        url = (data.get("repo") or "").strip()
        if not url:
            raise ApiError(_("Indique l'URL du dépôt"))
        if CREDS_RE.match(url):
            raise ApiError(_("Pas d'identifiant ni de jeton dans l'URL : il resterait dans .git/config et la liste des "
                             "processus. Lie plutôt le compte dans Paramètres › Git."))
        from . import forges
        code, out = run(["git", "clone", "--", url, str(p)], timeout=600, env=forges.git_env(url, child_env()))
        if not step(_("Cloner le dépôt"), code == 0, out):
            shutil.rmtree(p, ignore_errors=True)
            raise ApiError(_("Le clonage a échoué :\n{output}", output=out))
    else:
        p.mkdir(parents=True)
        step(_("Créer le dossier"), True, str(p))

    if source == "modele":
        tpl = templates().get(data.get("template"), {})
        for rel, content in tpl.items():
            (p / rel).write_text(content % {"slug": slug, "name": name})
        step(_("Copier le modèle {template}", template=data.get("template")), True, ", ".join(tpl))

    if source == "git":
        # Dépôt cloné : on ne touche pas à son contenu. Son logo devient l'icône du projet.
        try:
            cands = icon_candidates(slug, limit=1)
            if cands:
                set_icon_from_repo(slug, cands[0]["path"])
                step(_("Icône du projet"), True, cands[0]["path"])
        except (ApiError, OSError) as e:
            step(_("Icône du projet"), False, str(e))
    has_context = any((p / n).exists() for n in ("CLAUDE.md", ".claude/CLAUDE.md", "AGENTS.md"))
    if opts.get("claudemd") and source != "git" and not has_context:
        (p / "CLAUDE.md").write_text(claude_md(name, description))
        step(_("Écrire CLAUDE.md"), True)
    if opts.get("agentsmd") and source != "git" and not has_context:
        (p / "AGENTS.md").write_text(agents_md(name, description))
        step(_("Écrire AGENTS.md"), True)

    if opts.get("git") and source != "git":
        code, out = git(p, "init", "-b", "main")
        if step(_("Initialiser Git"), code == 0, out):
            git(p, "add", "-A")
            code, out = run(["git", "-C", str(p), *_identity_args(p), "commit", "--allow-empty", "-m",
                             _("Initialisation du projet")], timeout=60)
            step(_("Premier commit"), code == 0, out)

    config.set_project_meta(slug, name=name, description=description)
    log_activity(_("Projet {name} créé dans {path}", name=name, path=p), "create", slug)

    if opts.get("deploy") or opts.get("coolify"):
        tool = deployer.info()["name"] or _("l'outil de déploiement")
        try:
            prov = deployer.require()
            if source != "git":
                raise ApiError(_("{tool} a besoin d'un dépôt Git distant : pousse le projet puis relie-le depuis ses réglages.",
                                 tool=tool))
            domain = ""
            if opts.get("domain") and config.get("domain_suffix"):
                domain = f"https://{slug}.{config.get('domain_suffix').lstrip('.')}"
            app = prov.create_public_app(name=name, repo=data.get("repo"), domain=domain)
            config.set_project_meta(slug, **{deployer.meta_key(): app.get("uuid", "")})
            step(_("Créer l'application dans {tool}", tool=tool), True, f"id {app.get('uuid')}" + (f" · {domain}" if domain else ""))
        except Exception as e:  # noqa: BLE001 — on veut remonter l'erreur dans les étapes
            step(_("Créer l'application dans {tool}", tool=tool), False, str(e))

    # Agent à démarrer après la création : opts.agent ("claude" | "codex"), ou opts.claude (réglage d'avant)
    start_agent = opts.get("agent") or ("claude" if opts.get("claude") else "")
    if start_agent == "codex":
        from . import agents
        try:
            mode = data.get("mode") if data.get("mode") in agents.get("codex").mode_ids() else None
            name_ = claude.repo_ensure(slug, mode=mode, agent="codex")
            step(_("Démarrer Codex"), True, _("session tmux {name}", name=name_))
        except Exception as e:  # noqa: BLE001
            step(_("Démarrer Codex"), False, str(e))
    elif start_agent == "claude":
        try:
            claude.start(slug, data.get("mode") or config.get("default_mode"), False)
            step(_("Démarrer Claude Remote Control"), True, _("session tmux {name}", name=claude.tmux_name(slug)))
        except Exception as e:  # noqa: BLE001
            step(_("Démarrer Claude Remote Control"), False, str(e))

    return {"slug": slug, "steps": steps}


def create_folder(name):
    slug = slugify(name)
    p = root() / slug
    if p.exists():
        raise ApiError(_("Ce dossier existe déjà"))
    p.mkdir(parents=True)
    config.set_project_meta(slug, name=name.strip() or slug)
    log_activity(_("Dossier {slug} créé", slug=slug), "create", slug)
    return {"slug": slug}


def dir_size_cached(_cache={"t": 0, "v": 0}):
    if time.time() - _cache["t"] > 300:
        code, out = run(["du", "-sb", str(root())], timeout=60)
        try:
            _cache["v"] = int(out.split()[0]) if code == 0 else 0
        except (ValueError, IndexError):
            _cache["v"] = 0
        _cache["t"] = time.time()
    return _cache["v"]


def _transcript_dir(slug):
    p = project_dir(slug)
    return config.HOME / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9-]", "-", str(p))


def transcript(slug, sid, limit=400):
    """Messages d'une session passée (texte de l'utilisateur et de Claude, outils résumés)."""
    import json
    from .tasks import tool_detail
    if not re.match(r"^[A-Za-z0-9-]{8,80}$", sid or ""):
        raise ApiError(_("Session inconnue"), 404)
    f = _transcript_dir(slug) / f"{sid}.jsonl"
    if not f.is_file():
        raise ApiError(_("Session introuvable"), 404)
    out, title = [], ""
    with open(f, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            kind = e.get("type")
            if kind in ("custom-title", "ai-title"):
                title = e.get("customTitle") or e.get("aiTitle") or title
                continue
            if kind not in ("user", "assistant") or e.get("isMeta") or e.get("isSidechain"):
                continue
            content = (e.get("message") or {}).get("content")
            when = e.get("timestamp") or ""
            if isinstance(content, str):
                if kind == "user" and not content.startswith("<"):
                    out.append({"role": "user", "text": content[:8000], "when": when})
                elif kind == "assistant":
                    out.append({"role": "assistant", "text": content[:8000], "when": when})
                continue
            for block in content or []:
                if not isinstance(block, dict):
                    continue
                t = block.get("type")
                if t == "text" and block.get("text", "").strip():
                    if kind == "user" and block["text"].startswith("<"):
                        continue
                    out.append({"role": kind, "text": block["text"][:8000], "when": when})
                elif t == "tool_use":
                    out.append({"role": "tool", "text": block.get("name", ""),
                                "detail": tool_detail(block.get("input") or {}), "when": when})
    return {"id": sid, "title": title, "messages": out[-limit:], "total": len(out)}


def transcripts(slug, limit=8):
    """Sessions Claude passées pour ce dossier, lues depuis ~/.claude/projects."""
    import json
    d = _transcript_dir(slug)
    if not d.is_dir():
        return []
    files = sorted(d.glob("*.jsonl"), key=lambda f: f.stat().st_mtime, reverse=True)[:limit]
    out = []
    for f in files:
        title, first, prompts = "", "", 0
        try:
            with open(f, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    if '"custom-title"' in line or '"ai-title"' in line:
                        try:
                            e = json.loads(line)
                            title = e.get("customTitle") or e.get("aiTitle") or title
                        except ValueError:
                            pass
                    elif '"type":"user"' in line and '"kind":"human"' in line:
                        prompts += 1
                        if not first:
                            try:
                                c = json.loads(line)["message"]["content"]
                                if isinstance(c, list):
                                    c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
                                first = str(c).strip()[:120]
                            except (ValueError, KeyError, TypeError):
                                pass
        except OSError:
            continue
        st = f.stat()
        out.append({"id": f.stem, "title": title or first or _("Session sans titre"),
                    "mtime": st.st_mtime, "prompts": prompts, "size": st.st_size})
    return out


def recent_conversations(limit=20):
    """Dernières conversations Claude de tous les projets."""
    out = []
    for p in root().iterdir():
        if not p.is_dir() or p.name.startswith(".") or not SLUG_RE.match(p.name):
            continue
        meta = config.project_meta(p.name)
        try:
            for c in transcripts(p.name, limit=limit):
                if not c["prompts"]:
                    continue  # conversation ouverte puis fermée sans message
                out.append({**c, "slug": p.name, "project": meta.get("name") or p.name, "icon": icon_version(p.name)})
        except (ApiError, OSError):
            continue
    out.sort(key=lambda c: c["mtime"], reverse=True)
    return out[:limit]


# --- Recherche et liste des fichiers --------------------------------------------

def all_files(slug, limit=20000):
    p = project_dir(slug)
    if (p / ".git").exists():
        code, out = git(p, "ls-files", "-co", "--exclude-standard", timeout=30)
        if code == 0:
            return sorted(set(out.splitlines()))[:limit]
    out = []
    for dirpath, dirs, files in os.walk(p):
        dirs[:] = sorted(d for d in dirs if d not in HIDDEN and not d.startswith(".git"))
        rel = os.path.relpath(dirpath, p)
        for f in sorted(files):
            out.append(f if rel == "." else f"{rel}/{f}")
            if len(out) >= limit:
                return out
    return out


def search(slug, q, regex=False, case=False, limit=400):
    p = project_dir(slug)
    q = (q or "").strip()
    if len(q) < 2:
        raise ApiError(_("Tape au moins 2 caractères"))
    flags = [] if regex else ["-F"]
    if not case:
        flags.append("-i")
    if (p / ".git").exists():
        cmd = ["git", "-C", str(p), "-c", "core.quotePath=false", "grep", "-n", "-I", "--no-color", "--untracked",
               *flags, "-e", q]
    else:
        cmd = ["grep", "-rnI", *flags, *[f"--exclude-dir={d}" for d in HIDDEN], "-e", q, "."]
    code, out = run(cmd, cwd=str(p), timeout=20)
    if code not in (0, 1):
        raise ApiError(out[-300:] or _("Recherche impossible"))
    results, files = [], set()
    for line in out.splitlines():
        path, _x, rest = line.partition(":")
        num, _x, text = rest.partition(":")
        if not num.isdigit():
            continue
        path = path[2:] if path.startswith("./") else path
        files.add(path)
        results.append({"path": path, "line": int(num), "text": text[:300]})
        if len(results) >= limit:
            break
    return {"results": results, "files": len(files), "truncated": len(results) >= limit}


# --- Commandes favorites ----------------------------------------------------------

def command_suggestions(p):
    import json
    out = []
    pkg = p / "package.json"
    if pkg.is_file():
        try:
            scripts = json.loads(read_small(pkg) or "{}").get("scripts") or {}
            runner = "pnpm" if (p / "pnpm-lock.yaml").exists() else "yarn" if (p / "yarn.lock").exists() else "npm"
            if not (p / "node_modules").exists():
                out.append({"label": f"{runner} install", "cmd": f"{runner} install"})
            for name in list(scripts)[:12]:
                out.append({"label": f"{runner} run {name}", "cmd": f"{runner} run {name}"})
        except (ValueError, OSError, AttributeError):
            pass
    mk = p / "Makefile"
    if mk.is_file():
        try:
            for m in re.finditer(r"^([A-Za-z][\w-]*):(?!=)", read_small(mk), re.M):
                out.append({"label": f"make {m.group(1)}", "cmd": f"make {m.group(1)}"})
        except OSError:
            pass
    if (p / "manage.py").exists():
        out.append({"label": _("Django : runserver"), "cmd": "python3 manage.py runserver"})
    if (p / "gradlew").exists():
        out.append({"label": _("Gradle : assembleDebug"), "cmd": "./gradlew assembleDebug"})
    if (p / "docker-compose.yml").exists() or (p / "compose.yaml").exists():
        out.append({"label": "docker compose up", "cmd": "docker compose up"})
    if (p / "pyproject.toml").exists() or (p / "pytest.ini").exists():
        out.append({"label": "pytest", "cmd": "python3 -m pytest"})
    return out[:20]


def commands(slug):
    p = project_dir(slug)
    saved = config.project_meta(slug).get("commands") or []
    known = {c["cmd"] for c in saved}
    return {"saved": saved, "suggested": [c for c in command_suggestions(p) if c["cmd"] not in known]}


def set_commands(slug, items):
    project_dir(slug)
    clean = []
    for c in items or []:
        label, cmd = str(c.get("label", "")).strip()[:60], str(c.get("cmd", "")).strip()[:500]
        if cmd:
            clean.append({"label": label or cmd[:60], "cmd": cmd})
    config.set_project_meta(slug, commands=clean[:20] or None)
    return clean


def run_command(slug, cmd):
    """Tape la commande dans le shell tmux du projet (le même que le terminal du projet)."""
    from .util import tmux_cmd
    p = project_dir(slug)
    cmd = (cmd or "").strip()
    if not cmd or len(cmd) > 500 or "\n" in cmd:
        raise ApiError(_("Commande invalide"))
    name = "helmshell-" + tmux_slug(slug)
    if run(tmux_cmd("has-session", "-t", "=" + name), timeout=10)[0] != 0:
        env = child_env()
        code, out = run(tmux_cmd("new-session", "-d", "-s", name, "-c", str(p), "-e", f"PATH={env['PATH']}"),
                        timeout=10)
        if code != 0:
            raise ApiError(_("Impossible d'ouvrir le shell du projet : {output}", output=out))
        time.sleep(0.4)
    run(tmux_cmd("send-keys", "-t", f"={name}:", "-l", cmd), timeout=10)
    run(tmux_cmd("send-keys", "-t", f"={name}:", "Enter"), timeout=10)
    log_activity(_("Commande lancée dans {slug} : {cmd}", slug=slug, cmd=cmd[:80]), "info", slug)
