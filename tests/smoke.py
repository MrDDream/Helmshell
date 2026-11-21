#!/usr/bin/env python3
"""Test de fumée : lance une instance de Helmshell isolée (dossiers temporaires, port libre),
se connecte, crée un projet et appelle les routes principales.

    python3 tests/smoke.py
Aucune session Claude n'est lancée et la vraie configuration n'est pas touchée.
"""
import http.cookiejar
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PASSWORD = "test-fumee-123"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Client:
    def __init__(self, base):
        self.base = base
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, method, path, body=None, raw=False, expect=200):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"X-Helmshell": "1", "Content-Type": "application/json"})
        try:
            with self.opener.open(req, timeout=30) as r:
                status, payload = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, payload = e.code, e.read()
        if status != expect:
            raise AssertionError(f"{method} {path} → {status} (attendu {expect}) : {payload[:300]!r}")
        return payload if raw else json.loads(payload or b"{}")


def main():
    failures = []
    with tempfile.TemporaryDirectory(prefix="helmshell-fumee-") as tmp:
        tmp = Path(tmp)
        (tmp / "projets").mkdir()
        port = free_port()
        env = dict(os.environ, HELMSHELL_DATA=str(tmp / "data"), PROJECTS_ROOT=str(tmp / "projets"),
                   HELMSHELL_PASSWORD=PASSWORD, HELMSHELL_PORT=str(port), HELMSHELL_HOST="127.0.0.1",
                   HELMSHELL_TMUX_SOCKET=str(tmp / "tmux.sock"), COOLIFY_URL="http://127.0.0.1:9",
                   HELMSHELL_ALLOWED_NETWORKS="", HELMSHELL_LOGIN_MAX_FAILS="30", GIT_AUTHOR_NAME="Test", GIT_AUTHOR_EMAIL="t@t",
                   GIT_COMMITTER_NAME="Test", GIT_COMMITTER_EMAIL="t@t", HELMSHELL_UPDATE_CHECK="0")
        proc = subprocess.Popen([sys.executable, str(ROOT / "server.py")], env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        try:
            c = Client(f"http://127.0.0.1:{port}")
            for _ in range(50):
                try:
                    c.call("GET", "/", raw=True)
                    break
                except (urllib.error.URLError, ConnectionError):
                    time.sleep(0.1)
            c.call("GET", "/api/me", expect=401)
            c.call("POST", "/api/login", {"password": "mauvais"}, expect=403)
            c.call("POST", "/api/login", {"password": PASSWORD})

            def check(label, fn):
                try:
                    fn()
                    print(f"  ok   {label}")
                except Exception as e:  # noqa: BLE001
                    failures.append(f"{label} : {e}")
                    print(f"  ÉCHEC {label} : {e}")

            # Modules importés dans ce processus (sans HELMSHELL_DATA : configuration de la machine) : textes en anglais
            sys.path.insert(0, str(ROOT))
            from helmshell import config as inproc_cfg
            inproc_cfg.get = (lambda orig: (lambda key: "en" if key == "language" else orig(key)))(inproc_cfg.get)

            for f in ("app.js", "app.css", "index.html"):
                if (ROOT / "static" / f).exists():
                    check(f"statique {f}", lambda f=f: c.call("GET", "/" + f, raw=True))
            for js in sorted((ROOT / "static").glob("*.js")):
                check(f"en-tête module {js.name}", lambda js=js: c.call("GET", "/" + js.name, raw=True))

            check("créer un projet", lambda: c.call("POST", "/api/projects",
                                                   {"name": "fumee", "source": "vide", "opts": {"git": True, "claudemd": True}}))
            slug = "fumee"
            gets = ["/api/me", "/api/overview", "/api/projects", "/api/sessions", "/api/activity", "/api/settings",
                    f"/api/projects/{slug}", f"/api/projects/{slug}/tree", f"/api/projects/{slug}/git",
                    f"/api/projects/{slug}/git/diff", f"/api/projects/{slug}/claude",
                    f"/api/projects/{slug}/claude/history", f"/api/projects/{slug}/file?path=CLAUDE.md"]
            gets += [g for g in os.environ.get("SMOKE_EXTRA_GETS", "").split() if g]
            extra = ROOT / "tests" / "smoke_routes.json"
            if extra.exists():
                gets += [g.replace("{slug}", slug) for g in json.loads(extra.read_text())["get"]]
            for g in gets:
                check(f"GET {g}", lambda g=g: c.call("GET", g))

            def file_roundtrip():
                c.call("PUT", f"/api/projects/{slug}/file?path=notes.md", {"content": "# Bonjour\n"})
                got = c.call("GET", f"/api/projects/{slug}/file?path=notes.md")
                assert "Bonjour" in json.dumps(got), got
            check("écrire puis relire un fichier", file_roundtrip)
            check("commit", lambda: c.call("POST", f"/api/projects/{slug}/git/commit",
                                           {"message": "test", "push": False}))
            def partial_commit():
                c.call("PUT", f"/api/projects/{slug}/file?path=a.txt", {"content": "a\n"})
                c.call("PUT", f"/api/projects/{slug}/file?path=b.txt", {"content": "b\n"})
                c.call("POST", f"/api/projects/{slug}/git/commit", {"message": "a seul", "paths": ["a.txt"]})
                g = c.call("GET", f"/api/projects/{slug}/git")
                assert [x["path"] for x in g["changes"]] == ["b.txt"], g["changes"]
                log = c.call("GET", f"/api/projects/{slug}/git/log")
                show = c.call("GET", f"/api/projects/{slug}/git/show?rev={log[0]['hash']}")
                assert show["files"][0]["path"] == "a.txt" and "+a" in show["diff"], show
            check("commit d'une partie des fichiers + détail du commit", partial_commit)

            def branches():
                c.call("POST", f"/api/projects/{slug}/git/checkout", {"branch": "essai", "create": True})
                assert c.call("GET", f"/api/projects/{slug}/git/branches")["current"] == "essai"
                c.call("POST", f"/api/projects/{slug}/git/checkout", {"branch": "main"})
                c.call("POST", f"/api/projects/{slug}/git/checkout", {"branch": "--force"}, expect=400)
            check("branches", branches)

            def trash():
                r = c.call("POST", f"/api/projects/{slug}/delete", {"path": "b.txt"})
                items = c.call("GET", "/api/trash")
                assert items and items[0]["path"] == "b.txt", items
                c.call("POST", f"/api/trash/{r['trash_id']}/restore")
                got = c.call("GET", f"/api/projects/{slug}/file?path=b.txt")
                assert got["content"] == "b\n"
                assert c.call("GET", "/api/trash") == []
            check("corbeille : supprimer puis restaurer", trash)

            def search():
                r = c.call("GET", f"/api/projects/{slug}/search?q=bonjour")
                assert any(x["path"] == "notes.md" for x in r["results"]), r
            check("recherche dans le projet", search)

            def commands():
                c.call("PUT", f"/api/projects/{slug}/commands", {"commands": [{"label": "Tests", "cmd": "echo ok"}]})
                assert c.call("GET", f"/api/projects/{slug}/commands")["saved"][0]["cmd"] == "echo ok"
            check("commandes favorites", commands)

            def live():
                req = urllib.request.Request(c.base + "/api/events")
                with c.opener.open(req, timeout=10) as r:
                    line = r.readline().decode()
                    assert line.startswith("data: "), line
                    snap = json.loads(line[6:])
                    assert "sessions" in snap and "tasks" in snap, snap.keys()
            check("flux en direct /api/events", live)
            def review_fixes():
                c.call("POST", f"/api/projects/{slug}/git/checkout", {"branch": "origin/-Cmain"}, expect=400)
                c.call("POST", f"/api/projects/{slug}/git/checkout", {"branch": "-x", "create": True}, expect=400)
                # fichier Latin-1 et nom accentué : recherche, liste et commit
                (tmp / "projets" / slug / "latin.txt").write_bytes("bonjour café".encode("latin-1"))
                c.call("PUT", f"/api/projects/{slug}/file?path=" + urllib.parse.quote("café.txt"), {"content": "bonjour\n"})
                r = c.call("GET", f"/api/projects/{slug}/search?q=bonjour")
                assert any(x["path"] == "café.txt" for x in r["results"]), r
                assert "café.txt" in c.call("GET", f"/api/projects/{slug}/files")
                g = c.call("GET", f"/api/projects/{slug}/git")
                assert any(x["path"] == "café.txt" for x in g["changes"]), g["changes"]
                c.call("POST", f"/api/projects/{slug}/git/commit", {"message": "accents", "paths": ["café.txt"]})
                log = c.call("GET", f"/api/projects/{slug}/git/log")
                c.call("GET", f"/api/projects/{slug}/git/show?rev={log[0]['hash']}")
                c.call("POST", f"/api/projects/{slug}/claude/send", {"text": "y", "question": "x"}, expect=409)
                # Réponse libre (ex. lien piégé d'un README) ou sans question : refusée
                c.call("POST", f"/api/projects/{slug}/claude/send", {"text": "2", "question": "x"}, expect=400)
                c.call("POST", f"/api/projects/{slug}/claude/send", {"text": "y"}, expect=400)
            check("relecture : branche piégée, Latin-1, accents, réponse périmée", review_fixes)
            def icons_and_metrics():
                svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>'
                (tmp / "projets" / slug / "assets").mkdir(exist_ok=True)
                (tmp / "projets" / slug / "assets" / "logo.svg").write_bytes(svg)
                cands = c.call("GET", f"/api/projects/{slug}/icon/candidates")
                assert cands and cands[0]["path"] == "assets/logo.svg", cands
                c.call("GET", f"/api/projects/{slug}/icon", expect=404)
                v = c.call("POST", f"/api/projects/{slug}/icon", {"path": "assets/logo.svg"})["icon"]
                assert v and c.call("GET", f"/api/projects/{slug}/icon", raw=True) == svg
                assert any(p["slug"] == slug and p["icon"] == v for p in c.call("GET", "/api/projects"))
                c.call("POST", f"/api/projects/{slug}/icon", {"path": "../../etc/passwd"}, expect=403)
                req = urllib.request.Request(c.base + f"/api/projects/{slug}/icon?name=x.exe", data=b"MZ", method="PUT",
                                             headers={"X-Helmshell": "1"})
                try:
                    c.opener.open(req, timeout=10)
                    raise AssertionError("format .exe accepté")
                except urllib.error.HTTPError as e:
                    assert e.code == 400, e.code
                c.call("DELETE", f"/api/projects/{slug}/icon")
                c.call("GET", f"/api/projects/{slug}/icon", expect=404)
                m = c.call("GET", "/api/metrics?hours=168")
                assert m["hours"] == 168 and "hourly" in m and "points" in m, m.keys()
                c.call("GET", "/api/metrics?hours=abc", expect=400)
                c.call("DELETE", "/api/terminals/..%2F..", expect=404)
            check("icône du projet, moyennes, terminaux", icons_and_metrics)

            def status_first_line():
                # « git status --porcelain » commence par une espace pour un fichier modifié non indexé :
                # elle ne doit pas être mangée (bug « ndroid/… » au lieu de « android/… »).
                c.call("PUT", f"/api/projects/{slug}/file?path=notes.md", {"content": "modifié\n"})
                g = c.call("GET", f"/api/projects/{slug}/git")
                assert any(x["path"] == "notes.md" for x in g["changes"]), g["changes"]
            check("git status : premier fichier modifié intact", status_first_line)
            def notif_services():
                # Faux serveur Gotify / ntfy local : on vérifie ce qu'Helmshell publie
                import http.server, threading as th
                got = []

                class H(http.server.BaseHTTPRequestHandler):
                    def do_POST(self):
                        n = int(self.headers.get("Content-Length") or 0)
                        got.append((self.path, dict(self.headers), json.loads(self.rfile.read(n) or b"{}")))
                        self.send_response(200); self.send_header("Content-Length", "2"); self.end_headers(); self.wfile.write(b"{}")

                    def log_message(self, *a):
                        pass
                srv = http.server.HTTPServer(("127.0.0.1", 0), H)
                th.Thread(target=srv.serve_forever, daemon=True).start()
                try:
                    base = f"http://127.0.0.1:{srv.server_port}"
                    c.call("PUT", "/api/settings", {"notify_service": "gotify", "gotify_url": base + "/", "gotify_token": "Atok"})
                    st = c.call("GET", "/api/settings")
                    assert st["notify_service"] == "gotify" and st["gotify_token_set"] and "gotify_token" not in st, st
                    c.call("POST", "/api/notify/test")
                    path, headers, body = got[-1]
                    assert path == "/message" and headers.get("X-Gotify-Key") == "Atok" and body["title"] == "Helmshell", got[-1]
                    assert body["message"].startswith("Notifications are working."), body
                    c.call("PUT", "/api/settings", {"notify_service": "ntfy", "ntfy_url": base + "/sujet"})
                    c.call("POST", "/api/notify/test")
                    assert got[-1][2]["topic"] == "sujet", got[-1]
                    c.call("PUT", "/api/settings", {"notify_service": "discord", "discord_webhook": "https://exemple.fr/x"}, expect=400)
                    c.call("PUT", "/api/settings", {"notify_service": "pigeon"}, expect=400)
                    c.call("PUT", "/api/settings", {"notify_service": "off"})
                    c.call("POST", "/api/notify/test", expect=502)
                finally:
                    srv.shutdown()
                page = c.call("GET", "/hook/answer?t=abc.def", raw=True, expect=403).decode()
                assert "<form" not in page and "expired" in page and '<html lang="en">' in page, page[:200]
            check("notifications : Gotify, ntfy, Discord, page de confirmation", notif_services)
            def two_factor():
                sys.path.insert(0, str(ROOT))
                from helmshell import totp
                assert c.call("GET", "/api/2fa") == {"enabled": False, "recovery_left": 0}
                setup = c.call("POST", "/api/2fa/setup")
                secret = setup["secret"]
                assert setup["uri"].startswith("otpauth://totp/Helmshell") and secret in setup["uri"]
                step = int(time.time() // 30)
                c.call("POST", "/api/2fa/enable", {"code": "000000" if totp.code_at(secret, step) != "000000" else "111111"}, expect=403)
                rec = c.call("POST", "/api/2fa/enable", {"code": totp.code_at(secret, step)})["recovery"]
                assert len(rec) == 8 and c.call("GET", "/api/settings")["totp"]["enabled"]
                assert "totp_secret" not in json.dumps(c.call("GET", "/api/settings"))
                # connexion depuis un autre navigateur : mot de passe, puis code
                c2 = Client(c.base)
                r = c2.call("POST", "/api/login", {"password": PASSWORD}, expect=401)
                assert r.get("totp") is True, r
                c2.call("GET", "/api/me", expect=401)
                c2.call("POST", "/api/login", {"password": PASSWORD, "code": totp.code_at(secret, step)}, expect=403)  # rejeu
                c2.call("POST", "/api/login", {"password": "mauvais", "code": totp.code_at(secret, step + 1)}, expect=403)
                c2.call("POST", "/api/login", {"password": PASSWORD, "code": totp.code_at(secret, step + 1)})
                c2.call("GET", "/api/me")
                # code de secours : une seule fois
                c3 = Client(c.base)
                c3.call("POST", "/api/login", {"password": PASSWORD, "code": rec[0].upper()})
                c3.call("POST", "/api/login", {"password": PASSWORD, "code": rec[0]}, expect=403)
                assert c.call("GET", "/api/2fa")["recovery_left"] == 7
                c.call("POST", "/api/2fa/disable", {"password": "mauvais", "code": rec[1]}, expect=403)
                c.call("POST", "/api/2fa/disable", {"password": PASSWORD, "code": rec[1]})
                Client(c.base).call("POST", "/api/login", {"password": PASSWORD})
            check("double authentification : activation, connexion, rejeu, secours", two_factor)
            def git_accounts():
                # Fausse forge Forgejo (API Gitea) : compte, dépôts, jeton jamais renvoyé
                import http.server, threading as th
                seen = []

                class F(http.server.BaseHTTPRequestHandler):
                    def do_GET(self):
                        seen.append((self.path, self.headers.get("Authorization")))
                        if self.headers.get("Authorization") != "token secret-123":
                            body, code = b'{"message":"unauthorized"}', 401
                        elif self.path.startswith("/api/v1/user/repos"):
                            page = 1 if "page=1" in self.path else 2
                            body, code = json.dumps([{"name": "helmshell", "full_name": "bob/helmshell", "private": True,
                                                      "clone_url": "https://git.exemple.fr/bob/helmshell.git",
                                                      "html_url": "https://git.exemple.fr/bob/helmshell", "pushed_at": "2026-11-01T10:00:00Z"}]
                                                     if page == 1 else []).encode(), 200
                        elif self.path == "/api/v1/user":
                            body, code = b'{"login":"bob","full_name":"Bob"}', 200
                        else:
                            body, code = b"{}", 404
                        self.send_response(code); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

                    def log_message(self, *a):
                        pass
                srv = http.server.HTTPServer(("127.0.0.1", 0), F)
                th.Thread(target=srv.serve_forever, daemon=True).start()
                try:
                    base = f"http://127.0.0.1:{srv.server_port}"
                    c.call("POST", "/api/forges", {"kind": "forgejo", "url": base, "token": "mauvais"}, expect=400)
                    c.call("POST", "/api/forges", {"kind": "pigeon", "url": base, "token": "x"}, expect=400)
                    c.call("POST", "/api/forges", {"kind": "forgejo", "url": base, "token": "secret-123", "access": "tout"}, expect=400)
                    f = c.call("POST", "/api/forges", {"kind": "forgejo", "url": base + "/", "token": "secret-123", "access": "read"})
                    assert f["user"] == "bob" and f["token_set"] and "token" not in f and f["access"] == "read", f
                    lst = c.call("GET", "/api/forges")
                    assert len(lst) == 1 and "secret-123" not in json.dumps(lst), lst
                    assert "secret-123" not in json.dumps(c.call("GET", "/api/settings"))
                    repos = c.call("GET", f"/api/forges/{f['id']}/repos")
                    assert repos[0]["full_name"] == "bob/helmshell" and repos[0]["private"], repos
                    c.call("DELETE", f"/api/forges/{f['id']}")
                    assert c.call("GET", "/api/forges") == []
                    c.call("GET", "/api/forges/deadbeef/repos", expect=404)
                finally:
                    srv.shutdown()
                # Authentification git : seulement en HTTPS vers l'hôte du compte, par l'environnement
                sys.path.insert(0, str(ROOT))
                from helmshell import forges
                forges._all = lambda: [{"url": "https://git.exemple.fr", "token": "T0K", "kind": "forgejo", "user": "bob"},
                                       {"url": "https://github.com", "token": "GH", "kind": "github", "user": "x"}]
                env = forges.git_env("https://git.exemple.fr/bob/helmshell.git", {})
                import base64 as b64
                assert env["GIT_CONFIG_KEY_0"] == "http.https://git.exemple.fr/.extraheader", env
                assert env["GIT_CONFIG_VALUE_0"] == "Authorization: Basic " + b64.b64encode(b"bob:T0K").decode(), env
                gh = forges.git_env("https://github.com/x/y.git", {})
                assert b64.b64decode(gh["GIT_CONFIG_VALUE_0"].split()[-1]) == b"x-access-token:GH", gh
                assert "GIT_CONFIG_COUNT" not in forges.git_env("https://autre.fr/a.git", {})
                assert "GIT_CONFIG_COUNT" not in forges.git_env("http://git.exemple.fr/a.git", {})
                assert "GIT_CONFIG_COUNT" not in forges.git_env("git@github.com:x/y.git", {})
                # jeton en lecture seule : utilisé pour cloner, pas pour pousser
                forges._all = lambda: [{"url": "https://git.exemple.fr", "token": "T0K", "kind": "forgejo", "user": "bob", "access": "read"}]
                assert forges.git_env("https://git.exemple.fr/bob/a.git", {})["GIT_CONFIG_COUNT"] == "1"
                assert "GIT_CONFIG_COUNT" not in forges.git_env("https://git.exemple.fr/bob/a.git", {}, write=True)
            check("comptes Git : lier, lister les dépôts, jeton caché, auth git", git_accounts)
            def clone_import():
                # Projet cloné : logo du dépôt en icône, aucun CLAUDE.md ajouté
                src = tmp / "source-depot"
                (src / "docs").mkdir(parents=True)
                (src / "docs" / "logo.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>')
                (src / "README.md").write_text("# Source\n")
                for cmd in (["init", "-b", "main"], ["add", "-A"], ["commit", "-m", "init"]):
                    subprocess.run(["git", "-C", str(src), *cmd], capture_output=True, env=env, check=True)
                r = c.call("POST", "/api/projects", {"name": "Clone Test", "source": "git", "repo": str(src),
                                                     "opts": {"claudemd": True, "git": True}})
                labels = [x["label"] for x in r["steps"] if x["ok"]]
                assert "Project icon" in labels and "Write CLAUDE.md" not in labels, r["steps"]
                assert not (tmp / "projets" / r["slug"] / "CLAUDE.md").exists()
                p = [x for x in c.call("GET", "/api/projects") if x["slug"] == r["slug"]][0]
                assert p["icon"], p
                assert c.call("GET", f"/api/projects/{r['slug']}/git")["changes"] == []
            check("import d'un dépôt : icône automatique, pas de CLAUDE.md", clone_import)
            def remote_link():
                r = c.call("POST", f"/api/projects/{slug}/git/fetch", {})
                assert r.get("skipped"), r  # pas encore de dépôt distant
                c.call("POST", f"/api/projects/{slug}/git/remote", {"url": "--upload-pack=touch /tmp/x"}, expect=400)
                c.call("POST", f"/api/projects/{slug}/git/remote", {"url": "/etc"}, expect=400)
                # adresse valide mais injoignable : refusée proprement, le dépôt reste utilisable
                c.call("POST", f"/api/projects/{slug}/git/remote", {"url": "https://127.0.0.1:9/x/y.git"}, expect=400)
                g = c.call("GET", f"/api/projects/{slug}/git")
                assert g["repo"] and "upstream" in g and not g["remote"], g  # remis comme avant
            check("dépôt distant : validation, fetch", remote_link)
            def platforms():
                sys.path.insert(0, str(ROOT))
                from helmshell import projects as pr
                d = tmp / "plateformes"
                (d / "app" / "src" / "main").mkdir(parents=True)
                (d / "app" / "src" / "main" / "AndroidManifest.xml").write_text("<manifest/>")
                (d / "desktop" / "src-tauri").mkdir(parents=True)
                (d / "desktop" / "src-tauri" / "tauri.conf.json").write_text("{}")
                assert pr.detect_platforms(d) == ["Android", "Windows", "Linux", "macOS"], pr.detect_platforms(d)
                w = tmp / "web"
                w.mkdir()
                (w / "package.json").write_text('{"dependencies": {"next": "15"}}')
                assert pr.detect_platforms(w) == ["Web"], pr.detect_platforms(w)
                for name, fname, content in (("express", "package.json", '{"dependencies": {"express": "^5.1.0"}}'),
                                             ("flask", "requirements.txt", "flask==3.0\ngunicorn\n")):
                    d2 = tmp / f"web-{name}"
                    d2.mkdir()
                    (d2 / fname).write_text(content)
                    assert pr.detect_platforms(d2) == ["Web"], (name, pr.detect_platforms(d2))
                cases = [("site", {"index.html": "<!doctype html>", "manifest.webmanifest": "{}"}, ["Web"]),
                         ("botjs", {"package.json": '{"dependencies": {"discord.js": "14", "express": "5"}}'}, ["Discord"]),
                         ("botpy", {"requirements.txt": "aiogram==3\nflask\n"}, ["Telegram"]),
                         ("botweb", {"package.json": '{"dependencies": {"discord.js": "14", "react-dom": "19"}}'}, ["Web", "Discord"])]
                for name, files, want in cases:
                    d3 = tmp / f"plat-{name}"
                    d3.mkdir()
                    for fn, content in files.items():
                        (d3 / fn).write_text(content)
                    assert pr.detect_platforms(d3) == want, (name, pr.detect_platforms(d3))
                assert "platforms" in c.call("GET", "/api/projects")[0]
                assert all("size" in x for x in c.call("GET", "/api/projects")), "taille des dossiers"
            check("plateformes visées", platforms)

            def dotnet_and_logo():
                sys.path.insert(0, str(ROOT))
                from helmshell import projects as pr
                d = tmp / "projets" / "snapdemo"
                (d / "src" / "Snap.App").mkdir(parents=True)
                (d / "src" / "Snap.App" / "Snap.App.csproj").write_text('<Project><ItemGroup><PackageReference Include="Avalonia" /></ItemGroup></Project>')
                (d / "docs" / "branding").mkdir(parents=True)
                (d / "docs" / "branding" / "snapdemo.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
                (d / "docs" / "screenshot.png").write_bytes(b"\x89PNG")
                (d / "README.md").write_text('<img src="docs/branding/snapdemo.svg" alt="logo" width="112">\n# Snap\n')
                assert pr.detect_tags(d)[:2] == [".NET", "Avalonia"], pr.detect_tags(d)
                c0 = c.call("GET", "/api/projects/snapdemo/icon/candidates")
                assert c0[0]["path"] == "docs/branding/snapdemo.svg" and all("screenshot" not in x["path"] for x in c0), c0
            check("technos .NET et logo du README", dotnet_and_logo)
            def sessions_page():
                c.call("POST", f"/api/projects/{slug}/claude/repo/send", {"text": "bonjour"}, expect=404)
                c.call("POST", f"/api/projects/{slug}/claude/repo/open", {"mode": "nimporte", "rc": True}, expect=400)
                c.call("POST", f"/api/projects/{slug}/claude/repo/resume", {"id": "../../etc"}, expect=400)
                c.call("POST", f"/api/projects/{slug}/claude/repo/resume", {"id": "00000000-0000-0000-0000-000000000000"}, expect=400)
                assert isinstance(c.call("GET", "/api/claude/history"), list)
                assert isinstance(c.call("GET", "/api/repo-sessions?preview=1"), list)
                c.call("POST", "/api/tasks/1234567890-abcdef/retry", expect=404)
                c.call("POST", f"/api/projects/{slug}/tasks", {"prompt": "x", "mode": "plan", "kind": "bidon"}, expect=400)
                c.call("DELETE", "/api/tasks", expect=400)
                assert "deleted" in c.call("DELETE", "/api/tasks?done=1")
                c.call("PUT", "/api/settings", {"notify_done": False})
                assert c.call("GET", "/api/settings")["notify_done"] is False
                c.call("PUT", "/api/settings", {"notify_done": True})
                # Transition « travaille » -> « en attente » : une notification « Claude a terminé »
                sys.path.insert(0, str(ROOT))
                from helmshell import events, notify, config as cfg
                sent = []
                events.notify.send = lambda title, *a, **k: sent.append(title)
                cfg.get = (lambda orig: (lambda key: True if key == "notify_done" else orig(key)))(cfg.get)
                now = time.time()
                r0 = {"slug": "x", "name": "Projet X", "claude": True, "started": now - 600, "status": "busy"}
                events._prev = None
                events._notify_transitions([], [], [r0])          # premier passage : rien
                events._notify_transitions([], [], [r0])
                events._busy_since["x"] = now - 30                 # a travaillé 30 s
                events._notify_transitions([], [], [dict(r0, status="idle")])
                assert sent == ["Projet X: Claude is done"], sent
                events._notify_transitions([], [], [dict(r0, status="busy")])
                events._notify_transitions([], [], [dict(r0, status="idle")])  # moins de 20 s : rien
                assert len(sent) == 1, sent
            check("page Sessions : envoyer, reprendre, historique, tâches, fin de travail", sessions_page)
            def agents_codex():
                import shutil as sh
                sys.path.insert(0, str(ROOT))
                from helmshell import codex as CX, tasks as T
                # Registre des agents
                info = c.call("GET", "/api/agents")
                ids = [a["id"] for a in info["agents"]]
                assert ids == ["claude", "codex"], info
                assert info["default_agent"] in ids, info
                cx = info["agents"][1]
                assert cx["label"] == "Codex" and cx["default_mode"] == "auto", cx
                assert [m["id"] for m in cx["modes"]] == ["read-only", "auto", "full-access"], cx
                assert all(m["label_fr"] and m["label_en"] and m["hint_fr"] and m["hint_en"]
                           for a in info["agents"] for m in a["modes"]), info
                assert [m["id"] for m in info["agents"][0]["modes"]] == ["default", "acceptEdits", "plan", "auto", "dontAsk"]
                codex_missing = not sh.which("codex") and not os.access(cx["bin"], os.X_OK)
                if codex_missing:
                    assert cx["available"] is False, cx
                # Commandes construites (bac à sable / validation)
                CX.bin = lambda: "codex"
                assert CX.cmd_interactive("/p", "read-only") == ["codex", "-C", "/p", "-s", "read-only", "-a", "on-request"]
                assert CX.cmd_interactive("/p", "auto", cont=True) == [
                    "codex", "resume", "--last", "-C", "/p", "-s", "workspace-write", "-a", "on-request"]
                assert CX.cmd_interactive("/p", "full-access", resume_id="0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b")[:3] == [
                    "codex", "resume", "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"]
                assert CX.cmd_interactive("/p", "full-access")[-4:] == ["-s", "danger-full-access", "-a", "never"]
                assert CX.cmd_exec("/p", "auto") == ["codex", "exec", "--json", "--skip-git-repo-check", "-C", "/p",
                                                     "-s", "workspace-write", "-"]
                assert CX.cmd_exec("/p", "read-only")[-3:] == ["-s", "read-only", "-"]
                full = CX.cmd_exec("/p", "full-access")
                assert "--dangerously-bypass-approvals-and-sandbox" in full and "-s" not in full, full
                # Sortie JSONL de codex exec
                sample = [
                    '{"type":"thread.started","thread_id":"t1"}',
                    '{"type":"turn.started"}',
                    'Avertissement sur stderr',
                    '{"type":"item.started","item":{"id":"i1","type":"command_execution","command":"ls -la","status":"in_progress"}}',
                    '{"type":"item.completed","item":{"id":"i1","type":"command_execution","command":"ls -la","exit_code":0}}',
                    '{"type":"item.completed","item":{"id":"i2","type":"file_change","changes":[{"path":"a.py","kind":"update"}]}}',
                    '{"type":"item.completed","item":{"id":"i3","type":"reasoning","text":"je réfléchis"}}',
                    '{"type":"item.completed","item":{"id":"i4","type":"agent_message","text":"Fini !"}}',
                    '{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":2,"output_tokens":5,"reasoning_output_tokens":1}}',
                ]
                ev, res = CX.parse_exec(sample)
                assert res["text"] == "Fini !" and res["error"] is False and res["turns"] == 1, res
                assert res["usage"]["output_tokens"] == 5, res
                tools = [e for e in ev if e["k"] == "tool"]
                assert [t["name"] for t in tools] == ["Command", "Files"] and tools[0]["detail"] == "ls -la", ev
                assert {"k": "text", "t": "Avertissement sur stderr"} in ev and {"k": "text", "t": "Fini !"} in ev, ev
                ev, res = CX.parse_exec(['{"type":"turn.started"}',
                                         '{"type":"turn.failed","error":{"message":"quota dépassé"}}'])
                assert res["error"] is True and "quota" in res["text"], res
                ev, res = CX.parse_exec(['{"type":"error","message":"plus de réseau"}'])
                assert res["error"] is True and res["text"] == "plus de réseau", res
                assert CX.parse_exec(['{"type":"turn.started"}'])[1] is None  # pas fini
                f = tmp / "tache-codex.jsonl"
                f.write_text("\n".join(sample) + "\n")
                assert T._parse(f, "codex")[1]["text"] == "Fini !"
                # Historique Codex : lecture défensive des fichiers de session
                old_home = os.environ.get("CODEX_HOME")
                ch = tmp / "codex-home"
                day = ch / "sessions" / "2026" / "01" / "02"
                day.mkdir(parents=True)
                proj = tmp / "projets" / slug
                sid = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
                (day / f"rollout-2026-01-02T10-00-00-{sid}.jsonl").write_text("\n".join(json.dumps(x) for x in [
                    {"timestamp": "2026-01-02T10:00:00Z", "type": "session_meta",
                     "payload": {"id": sid, "cwd": str(proj), "timestamp": "2026-01-02T10:00:00Z"}},
                    {"timestamp": "2026-01-02T10:00:01Z", "type": "response_item",
                     "payload": {"type": "message", "role": "user",
                                 "content": [{"type": "input_text", "text": "<environment_context>x</environment_context>"}]}},
                    {"timestamp": "2026-01-02T10:00:02Z", "type": "event_msg",
                     "payload": {"type": "user_message", "message": "Ajoute un test"}},
                    {"timestamp": "2026-01-02T10:00:03Z", "type": "response_item",
                     "payload": {"type": "function_call", "name": "shell", "arguments": "{\"command\":[\"ls\"]}"}},
                    {"timestamp": "2026-01-02T10:00:04Z", "type": "event_msg",
                     "payload": {"type": "agent_message", "message": "C'est fait."}},
                ]) + "\n")
                (day / "rollout-autre.jsonl").write_text(json.dumps(
                    {"type": "session_meta", "payload": {"id": "1111aaaa-0000-0000-0000-000000000000", "cwd": "/ailleurs"}}) + "\n")
                (day / "rollout-casse.jsonl").write_text("pas du json\n")
                (day / "rollout-ancien.jsonl").write_text(json.dumps({"id": "2222bbbb-0000", "timestamp": "x"}) + "\n")
                os.environ["CODEX_HOME"] = str(ch)
                try:
                    h = CX.history(proj)
                    assert len(h) == 1 and h[0]["id"] == sid and h[0]["prompts"] == 1, h
                    assert h[0]["title"] == "Ajoute un test" and h[0]["agent"] == "codex", h
                    tr = CX.transcript(proj, sid)
                    assert [m["role"] for m in tr["messages"]] == ["user", "tool", "assistant"], tr
                    assert CX.find(proj, "1111aaaa-0000-0000-0000-000000000000") is None
                    assert CX.history(tmp / "nulle-part") == []
                    from helmshell.i18n import _ as I18N
                    # Ancien format sans « source » : compté comme interactif
                    assert CX.has_interactive(proj) and not CX.has_interactive(tmp / "nulle-part")
                    # Format de Codex 0.171 (relevé sur une vraie session) : item_completed + custom_tool_call « exec »
                    sid2 = "0199c0de-0000-7000-8000-00000000c0de"
                    day2 = ch / "sessions" / "2026" / "11" / "21"
                    day2.mkdir(parents=True)
                    ts = "2026-11-21T09:11:%02d.000Z"
                    tok = {"type": "token_count", "info": {
                        "total_token_usage": {"total_tokens": 30000},
                        "last_token_usage": {"input_tokens": 12800, "cached_input_tokens": 12000, "output_tokens": 120,
                                             "total_tokens": 12920}, "model_context_window": 258400},
                        "rate_limits": {"limit_id": "codex", "plan_type": "free", "secondary": None,
                                        "primary": {"used_percent": 12.5, "window_minutes": 43200, "resets_at": 1797844157}}}
                    rows = [
                        {"timestamp": ts % 0, "type": "session_meta",
                         "payload": {"id": sid2, "session_id": sid2, "cwd": str(proj), "source": "cli",
                                     "originator": "codex-tui", "cli_version": "0.171.0"}},
                        {"timestamp": ts % 1, "type": "response_item", "payload": {"type": "message", "role": "developer",
                                                                                   "content": [{"type": "input_text", "text": "You are Codex"}]}},
                        {"timestamp": ts % 1, "type": "response_item", "payload": {"type": "message", "role": "user",
                                                                                   "content": [{"type": "input_text", "text": "<environment_context>…"}]}},
                        {"timestamp": ts % 2, "type": "response_item", "payload": {"type": "message", "role": "user",
                                                                                   "content": [{"type": "input_text", "text": "Crée hello.txt"}]}},
                        {"timestamp": ts % 2, "type": "event_msg", "payload": {"type": "item_completed", "item": {
                            "type": "UserMessage", "content": [{"type": "text", "text": "Crée hello.txt"}]}}},
                        {"timestamp": ts % 3, "type": "event_msg", "payload": {"type": "item_completed", "item": {
                            "type": "AgentMessage", "content": [{"type": "Text", "text": "Je crée le fichier."}], "phase": "commentary"}}},
                        {"timestamp": ts % 4, "type": "response_item", "payload": {
                            "type": "custom_tool_call", "name": "exec",
                            "input": 'const r = await tools.exec_command({cmd:"printf \'bonjour\' > hello.txt","workdir":"/p"});\ntext(r.output);\n'}},
                        {"timestamp": ts % 5, "type": "event_msg", "payload": tok},
                        {"timestamp": ts % 6, "type": "event_msg", "payload": {"type": "item_completed", "item": {
                            "type": "AgentMessage", "content": [{"type": "Text", "text": "hello.txt contient bonjour."}], "phase": "final"}}},
                    ]
                    (day2 / f"rollout-2026-11-21T09-11-07-{sid2}.jsonl").write_text("\n".join(json.dumps(x) for x in rows) + "\n")
                    sid3 = "0199c0de-0000-7000-8000-0000000ta5k0"  # tâche `codex exec` dans le même dossier
                    (day2 / f"rollout-2026-11-21T09-09-13-{sid3}.jsonl").write_text(json.dumps(
                        {"type": "session_meta", "payload": {"id": sid3, "cwd": str(proj), "source": "exec"}}) + "\n" + json.dumps(
                        {"timestamp": ts % 1, "type": "event_msg", "payload": {"type": "item_completed", "item": {
                            "type": "UserMessage", "content": [{"type": "text", "text": "Tâche"}]}}}) + "\n")
                    os.utime(day2 / f"rollout-2026-11-21T09-09-13-{sid3}.jsonl", (time.time() - 60, time.time() - 60))
                    h = {x["id"]: x for x in CX.history(proj)}
                    assert h[sid2]["title"] == "Crée hello.txt" and h[sid2]["prompts"] == 1 and not h[sid2]["task"], h
                    assert h[sid3]["task"] is True, h
                    tr = CX.transcript(proj, sid2)
                    assert [(m["role"], m["text"][:6]) for m in tr["messages"]] == [
                        ("user", "Crée h"), ("assistant", "Je cré"), ("tool", "Comman"), ("assistant", "hello.")], tr
                    assert tr["messages"][2]["detail"] == "printf 'bonjour' > hello.txt", tr
                    assert tr["title"] == "Crée hello.txt", tr
                    ctx = CX.session_context(proj)
                    assert ctx["size"] == 258400 and ctx["tokens"] == 12920 and 4.9 < ctx["used"] < 5.1, ctx
                    assert CX.session_context(proj, since=time.time() + 60) is None
                    lim = CX.rate_limits()
                    assert lim["plan"] == "free" and lim["limits"] == [{"id": "codex_primary", "label": I18N("Mois"), "used": 12.5,
                                                                        "resets_at": 1797844157, "window": 2592000}], lim
                    # Écrans du TUI relevés sur Codex 0.171 (tmux capture-pane)
                    working = ("› Crée hello.txt\n• Je crée hello.txt.\n\n• Working (3s • esc to interrupt)\n\n"
                               "› Ask Codex to do anything\n  GPT-6-Luna default · /p\n  ← for agents · ? for shortcuts")
                    approval = ("• Running printf 'bonjour' > hello.txt\n  Would you like to run the following command?\n"
                                "  Environment: local\n  Reason: Autorisez-vous la création de hello.txt ?\n"
                                "  $ printf 'bonjour' > hello.txt\n› 1. Yes, proceed (y)\n  2. Yes, and don't ask again (p)\n"
                                "  3. No, and tell Codex what to do differently (esc)\n  Press enter to confirm or esc to cancel")
                    trust = ("  Folder access\n  /p\n  Trust this folder? Codex can read, edit, and run files here.\n"
                             "› 1. Trust and continue\n  2. Back to Agent Command Center\n  enter continue · esc back")
                    idle = ("• hello.txt contient bonjour.\n  Worked for 21s • 9:11 AM\n› Ask Codex to do anything\n"
                            "  GPT-6-Luna default · /p\n  ← for agents · ? for shortcuts")
                    assert CX.screen_state(working) == ("busy", ""), CX.screen_state(working)
                    assert CX.screen_state(approval) == ("waiting", "Autorisez-vous la création de hello.txt ?"), CX.screen_state(approval)
                    assert CX.screen_state(approval.replace("  Reason: Autorisez-vous la création de hello.txt ?\n", "")) == (
                        "waiting", "printf 'bonjour' > hello.txt")
                    assert CX.screen_state(trust)[0] == "waiting" and CX.screen_state(trust)[1] == I18N("Faire confiance à ce dossier ?")
                    assert CX.screen_state(idle) == ("idle", "") and CX.screen_state("") == ("idle", "")
                    # Conversations de tous les projets : Codex à côté de Claude (page Sessions)
                    allc = CX.history_all(tmp / "projets")
                    assert {x["id"] for x in allc} == {sid, sid2, sid3} and all(x["slug"] == slug for x in allc), allc
                    assert CX.history_all(tmp / "nulle-part") == []
                    # (dans ce processus : dossier des projets du serveur de test, pas de session tmux)
                    from helmshell import claude as CLm, projects as PJ, usage as US
                    orig_root, orig_list = PJ.root, CLm.list_repo_sessions
                    PJ.root = lambda: tmp / "projets"
                    CLm.list_repo_sessions = lambda **k: []
                    try:
                        rc = PJ.recent_conversations(40, "codex")
                        assert rc and all(x["agent"] == "codex" and x["project"] for x in rc), rc
                        assert all(x["agent"] == "claude" for x in PJ.recent_conversations(40, "claude"))
                        cu = US.codex_summary()
                        assert cu["plan"] == "free" and cu["limits"][0]["used"] == 12.5 and cu["sessions"] == [], cu
                    finally:
                        PJ.root, CLm.list_repo_sessions = orig_root, orig_list
                    both = c.call("GET", "/api/claude/history?limit=40")
                    assert all(x.get("agent") in ("claude", "codex") for x in both), both
                    c.call("GET", "/api/claude/history?agent=bidon", expect=400)
                    assert isinstance(c.call("GET", "/api/codex/usage")["limits"], list)
                    # Réponse de account/rateLimits/read (serveur d'application de Codex 0.171, camelCase)
                    live = CX._limits_out({"limitId": "codex", "planType": "plus", "secondary": {"usedPercent": 40,
                                           "windowDurationMins": 10080, "resetsAt": 1797000000},
                                           "primary": {"usedPercent": 7, "windowDurationMins": 300, "resetsAt": 1796000000}}, 5)
                    assert live == {"plan": "plus", "updated": 5, "limits": [
                        {"id": "codex_primary", "label": I18N("Session ({n} h)", n=5), "used": 7.0, "resets_at": 1796000000, "window": 18000},
                        {"id": "codex_secondary", "label": I18N("Semaine"), "used": 40.0, "resets_at": 1797000000, "window": 604800}]}, live
                    c.call("PUT", "/api/settings", {"codex_usage_every": 7}, expect=400)
                    c.call("PUT", "/api/settings", {"codex_usage_every": 15})
                    assert c.call("GET", "/api/settings")["codex_usage_every"] == 15
                    c.call("PUT", "/api/settings", {"codex_usage_every": 5})
                finally:
                    if old_home is None:
                        os.environ.pop("CODEX_HOME", None)
                    else:
                        os.environ["CODEX_HOME"] = old_home
                os.environ["CODEX_HOME"] = str(tmp / "absent")
                try:
                    assert CX.history(proj) == []
                finally:
                    if old_home is None:
                        os.environ.pop("CODEX_HOME", None)
                    else:
                        os.environ["CODEX_HOME"] = old_home
                assert isinstance(c.call("GET", f"/api/projects/{slug}/agents/history?agent=codex"), list)
                assert isinstance(c.call("GET", f"/api/projects/{slug}/agents/history"), list)
                c.call("GET", f"/api/projects/{slug}/agents/history?agent=bidon", expect=400)
                c.call("GET", f"/api/projects/{slug}/agents/history/{sid}?agent=codex", expect=404)
                # Sessions du dépôt : une par agent, noms sans collision
                st = c.call("GET", f"/api/projects/{slug}/claude/repo?agent=codex")
                assert st["exists"] is False and st["agent"] == "codex" and st["name"] == "codex-" + slug, st
                assert c.call("GET", f"/api/projects/{slug}/claude/repo")["name"] == slug
                c.call("GET", f"/api/projects/{slug}/claude/repo?agent=bidon", expect=400)
                c.call("POST", f"/api/projects/{slug}/claude/repo/rc?agent=codex", {}, expect=400)
                c.call("POST", f"/api/projects/{slug}/claude/repo/open?agent=codex", {"mode": "acceptEdits"}, expect=400)
                c.call("POST", f"/api/projects/{slug}/claude/repo/send?agent=codex", {"text": "x"}, expect=404)
                from helmshell import claude as CL
                assert CL.repo_session("codex-x") == "depot-codex-x" and CL.repo_session("x", "codex") == "codex-x"
                assert CL.repo_key("x", "b", "codex") == "codex:x@b" and CL.repo_key("x") == "x"
                if codex_missing:
                    try:
                        c.call("POST", f"/api/projects/{slug}/claude/repo/open?agent=codex", {"mode": "auto"}, expect=400)
                        c.call("POST", "/api/term", {"target": "repo", "slug": slug, "agent": "codex"}, expect=400)
                        assert c.call("GET", f"/api/projects/{slug}/claude/repo?agent=codex")["exists"] is False
                        err = c.call("POST", f"/api/projects/{slug}/tasks", {"prompt": "x", "agent": "codex"}, expect=400)
                        assert "Codex" in err["error"], err
                    finally:
                        c.call("POST", f"/api/projects/{slug}/claude/repo/kill?agent=codex", {})
                c.call("POST", f"/api/projects/{slug}/tasks", {"prompt": "x", "agent": "bidon"}, expect=400)
                # Notifications de Codex : validation demandée (une fois par question), puis fin de travail
                from helmshell import events
                sent = []
                orig_send = events.notify.send
                events.notify.send = lambda title, *a, **k: sent.append((title, a[0] if a else ""))
                try:
                    now = time.time()
                    r0 = {"slug": "y", "key": "codex:y", "agent": "codex", "name": "Y", "claude": True,
                          "started": now - 600, "status": "busy"}
                    events._prev = None
                    events._notify_transitions([], [], [r0])
                    events._notify_transitions([], [], [dict(r0, status="waiting", question="ls ?")])
                    events._notify_transitions([], [], [dict(r0, status="waiting", question="ls ?")])
                    assert sent == [(I18N("{name} : Codex attend ta validation", name="Y"), "ls ?")], sent
                    events._notify_transitions([], [], [r0])
                    events._busy_since["codex:y"] = now - 30
                    events._notify_transitions([], [], [dict(r0, status="idle")])
                    assert sent[1:] == [(I18N("{name} : {agent} a terminé", name="Y", agent="Codex"),
                                         I18N("{agent} attend la suite dans le terminal du projet.", agent="Codex"))], sent
                finally:
                    events.notify.send = orig_send
                    events._prev = None
                # Réglages
                c.call("PUT", "/api/settings", {"default_agent": "bidon"}, expect=400)
                c.call("PUT", "/api/settings", {"codex_default_mode": "plan"}, expect=400)
                c.call("PUT", "/api/settings", {"default_agent": "codex", "codex_default_mode": "full-access"})
                s = c.call("GET", "/api/settings")
                assert s["default_agent"] == "codex" and s["codex_default_mode"] == "full-access", s
                if codex_missing:  # Codex absent : l'agent par défaut retombe sur un agent installé (ou Claude)
                    assert c.call("GET", "/api/agents")["default_agent"] == "claude"
                c.call("PUT", "/api/settings", {"default_agent": "", "codex_default_mode": "auto"})
            check("Codex : agents, commandes, sortie JSONL, historique, sessions, tâches, réglages", agents_codex)

            def language():
                # Nouvelle installation (dossier de données neuf) : anglais
                assert c.call("GET", "/api/auth-info")["language"] == "en"
                assert c.call("GET", "/api/me")["language"] == "en"
                s = c.call("GET", "/api/settings")
                assert s["language"] == "en" and s["update_check"] is True, s
                c.call("PUT", "/api/settings", {"language": "de"}, expect=400)
                c.call("PUT", "/api/settings", {"language": "fr", "update_check": False})
                assert c.call("GET", "/api/auth-info")["language"] == "fr"
                assert c.call("GET", "/api/settings")["update_check"] is False
                c.call("PUT", "/api/settings", {"language": "en", "update_check": True})
                # Installation existante (config.json déjà là) : français ; neuve : HELMSHELL_LANGUAGE, sinon anglais
                code = "from helmshell import config; config.ensure_initialized(); print(config.get('language'))"

                def lang(data_dir, **extra):
                    e = {k: v for k, v in os.environ.items() if k != "HELMSHELL_LANGUAGE"}
                    e.update(HELMSHELL_DATA=str(data_dir), HELMSHELL_PASSWORD="x", **extra)
                    r = subprocess.run([sys.executable, "-c", code], cwd=str(ROOT), env=e, capture_output=True,
                                       text=True, timeout=30)
                    assert r.returncode == 0, r.stderr
                    return r.stdout.strip()
                old = tmp / "lang-ancienne"
                old.mkdir()
                (old / "config.json").write_text(json.dumps({"secret": "s", "default_mode": "plan"}))
                assert lang(old) == "fr"
                assert json.loads((old / "config.json").read_text())["language"] == "fr"
                assert lang(old, HELMSHELL_LANGUAGE="en") == "fr"  # réglage d'installation ignoré : déjà installé
                assert lang(tmp / "lang-neuve") == "en"
                assert lang(tmp / "lang-neuve-fr", HELMSHELL_LANGUAGE="fr") == "fr"
                assert lang(tmp / "lang-neuve") == "en"  # relancé : la langue enregistrée reste
            check("langue : nouvelle installation, installation existante, réglage", language)

            def server_language():
                # Textes du serveur dans la langue réglée : anglais par défaut, français au choix
                def manifest():
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/manifest.webmanifest", timeout=10) as r:
                        assert r.headers["Content-Type"] == "application/manifest+json", r.headers["Content-Type"]
                        assert r.headers["Cache-Control"] == "no-cache", r.headers["Cache-Control"]
                        return json.loads(r.read())  # sans cookie : pas de connexion exigée
                c.call("POST", "/manifest.webmanifest", expect=405)
                assert c.call("GET", "/api/projects/inexistant", expect=404)["error"] == "Project not found"
                assert c.call("GET", "/api/rien", expect=404)["error"] == "Unknown route"
                m = manifest()
                assert m["lang"] == "en" and m["name"] == "Helmshell" and m["start_url"] == "/", m
                assert m["description"].startswith("Run your server") and m["shortcuts"][0]["name"] == "Projects", m
                assert len(m["icons"]) == 4 and [s_["url"] for s_ in m["shortcuts"]][-1] == "/#/nouveau", m
                c.call("PUT", "/api/settings", {"language": "fr"})
                try:
                    assert c.call("GET", "/api/projects/inexistant", expect=404)["error"] == "Projet introuvable"
                    assert c.call("GET", "/api/rien", expect=404)["error"] == "Route inconnue"
                    m = manifest()
                    assert m["lang"] == "fr" and m["description"].startswith("Pilote ton serveur"), m
                    assert [s_["name"] for s_ in m["shortcuts"]] == ["Projets", "Sessions Claude", "Terminal", "Nouveau projet"], m
                    c.call("PUT", "/api/settings", {"notify_service": "off"})
                    err = c.call("POST", "/api/notify/test", expect=502)["error"]
                    assert err == "Les notifications ne sont pas configurées", err
                    page = c.call("GET", "/hook/answer?t=abc.def", raw=True, expect=403).decode()
                    assert '<html lang="fr">' in page and "Lien expiré" in page, page[:300]
                finally:
                    c.call("PUT", "/api/settings", {"language": "en"})
                err = c.call("POST", "/api/notify/test", expect=502)["error"]
                assert err == "Notifications aren’t configured", err
            check("langue des textes du serveur : erreurs, manifeste, notifications, pages", server_language)

            def version():
                # Vérification des mises à jour coupée (HELMSHELL_UPDATE_CHECK=0) : réponse sans réseau
                v = c.call("GET", "/api/version")
                for k in ("version", "repo", "current", "latest", "url", "notes", "available", "kind", "checked"):
                    assert k in v, (k, v)
                assert v["repo"] == "https://github.com/MrDDream/Helmshell" and v["version"] == v["current"], v
                assert v["available"] is False and v["disabled"] is True and v["kind"] in ("docker", "git", "other"), v
                assert c.call("GET", "/api/version?force=1")["available"] is False
            check("version et mises à jour", version)

            def fake_codex():
                # Faux binaire `codex` : session interactive (dort), tâche et message de commit (JSONL)
                fake = tmp / "faux-codex" / "codex"
                fake.parent.mkdir()
                args_f = fake.parent / "args.txt"
                fake.write_text("#!/bin/sh\n"
                                f"echo \"$@\" >> {args_f}\n"
                                "if [ \"$1\" = exec ]; then\n"
                                "  cat > /dev/null\n"
                                "  echo '{\"type\":\"thread.started\",\"thread_id\":\"t\"}'\n"
                                "  echo '{\"type\":\"item.completed\",\"item\":{\"id\":\"m\",\"type\":\"agent_message\",\"text\":\"Fait par le faux Codex\"}}'\n"
                                "  echo '{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}'\n"
                                "  exit 0\n"
                                "fi\n"
                                "exec sleep 60\n")
                fake.chmod(0o755)
                import shutil as sh
                if not sh.which("tmux"):
                    print("       (tmux absent : test sauté)")
                    return
                sock = str(tmp / "tmux.sock")  # serveur tmux « de l'hôte » le temps du test (session de garde _*)
                subprocess.run(["tmux", "-S", sock, "new-session", "-d", "-s", "_garde"], check=True)
                c.call("PUT", "/api/settings", {"codex_bin": str(fake)})
                try:
                    assert c.call("GET", "/api/agents")["agents"][1]["available"] is True
                    st = c.call("POST", f"/api/projects/{slug}/claude/repo/open?agent=codex", {"mode": "read-only"})
                    assert st["exists"] and st["agent"] == "codex" and st["name"] == "codex-" + slug, st
                    for _ in range(40):
                        if c.call("GET", f"/api/projects/{slug}/claude/repo?agent=codex")["alive"]:
                            break
                        time.sleep(0.25)
                    else:
                        raise AssertionError("Codex ne tourne pas dans sa session")
                    assert f"-C {tmp / 'projets' / slug} -s read-only -a on-request" in args_f.read_text(), args_f.read_text()
                    c.call("POST", f"/api/projects/{slug}/claude/repo/open?agent=codex", {}, expect=400)  # déjà ouvert
                    assert c.call("GET", f"/api/projects/{slug}/claude/repo")["exists"] is False  # Claude : à part
                    repos = [r for r in c.call("GET", "/api/repo-sessions") if r["slug"] == slug]
                    assert [(r["agent"], r["key"]) for r in repos] == [("codex", "codex:" + slug)], repos
                    terms = [t for t in c.call("GET", "/api/terminals") if t["name"] == "codex-" + slug]
                    assert terms and terms[0]["kind"] == "repo" and terms[0]["agent"] == "codex" and terms[0]["slug"] == slug, terms
                    c.call("POST", f"/api/projects/{slug}/claude/repo/kill?agent=codex", {})
                    assert c.call("GET", f"/api/projects/{slug}/claude/repo?agent=codex")["exists"] is False
                    # Tâche confiée à Codex
                    t = c.call("POST", f"/api/projects/{slug}/tasks", {"prompt": "Dis bonjour", "agent": "codex"})
                    assert t["agent"] == "codex" and t["mode"] == "auto", t
                    for _ in range(60):
                        t = c.call("GET", f"/api/tasks/{t['id']}")
                        if t["status"] != "running":
                            break
                        time.sleep(0.25)
                    assert t["status"] == "ok" and t["result"]["text"] == "Fait par le faux Codex", t
                    assert "exec --json --skip-git-repo-check" in args_f.read_text()
                    t2 = c.call("POST", f"/api/tasks/{t['id']}/retry", {})
                    assert t2["agent"] == "codex" and t2["mode"] == "auto", t2
                    for _ in range(60):
                        if c.call("GET", f"/api/tasks/{t2['id']}")["status"] != "running":
                            break
                        time.sleep(0.25)
                    # Message de commit proposé par l'agent par défaut (Codex)
                    c.call("PUT", "/api/settings", {"default_agent": "codex"})
                    c.call("PUT", f"/api/projects/{slug}/file?path=codex.txt", {"content": "x\n"})
                    assert c.call("POST", f"/api/projects/{slug}/git/suggest", {})["message"] == "Fait par le faux Codex"
                    assert "--ephemeral" in args_f.read_text()
                finally:
                    c.call("PUT", "/api/settings", {"codex_bin": "", "default_agent": ""})
                    c.call("POST", f"/api/projects/{slug}/claude/repo/kill?agent=codex", {})
                    subprocess.run(["git", "-C", str(tmp / "projets" / slug), "reset", "-q", "--", "codex.txt"],
                                   capture_output=True)
                    (tmp / "projets" / slug / "codex.txt").unlink(missing_ok=True)
                    subprocess.run(["tmux", "-S", sock, "kill-server"], capture_output=True)
            check("Codex simulé : session interactive, tâche, relance, message de commit", fake_codex)

            def coolify_guard():
                c.call("DELETE", "/api/deploy/apps/abc123", {}, expect=400)          # sans confirmation
                c.call("DELETE", "/api/deploy/apps/abc123", {"confirm": "autre"}, expect=400)
                c.call("POST", "/api/deploy/apps/abc123/explode", {}, expect=404)   # action inconnue
            check("Déploiement : suppression confirmée seulement", coolify_guard)

            def deploy_providers():
                import http.server, threading as th
                # Sans outil : rien à déployer, menu masqué côté interface
                ov = c.call("GET", "/api/overview")
                assert ov["deploy"]["provider"] == "" and "coolify" not in ov, ov.get("deploy")
                c.call("GET", "/api/deploy/apps", expect=404)
                c.call("PUT", "/api/settings", {"deploy_provider": "heroku"}, expect=400)
                # Faux Dokploy local : on vérifie ce qu'Helmshell appelle et ce qu'il comprend
                calls, state = [], {"env": "A=1\n# commentaire\nB=\"deux mots\"\n", "domains": [{"domainId": "d1", "host": "vieux.exemple.fr", "https": True, "port": 8080}]}
                app = {"applicationId": "app1", "name": "Fumée", "appName": "fumee-x1", "applicationStatus": "done",
                       "sourceType": "github", "owner": "moi", "repository": "fumee", "branch": "main", "buildType": "nixpacks"}

                class D(http.server.BaseHTTPRequestHandler):
                    def reply(self, obj):
                        b = json.dumps(obj).encode()
                        self.send_response(200); self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

                    def do_GET(self):
                        u = urllib.parse.urlsplit(self.path)
                        q = dict(urllib.parse.parse_qsl(u.query))
                        calls.append(("GET", u.path, q, self.headers.get("x-api-key")))
                        if u.path == "/api/project.all":
                            return self.reply([{"projectId": "p1", "name": "Perso", "environments": [
                                {"environmentId": "e1", "name": "production", "applications": [dict(app, domains=state["domains"])],
                                 "postgres": [{"postgresId": "pg1", "name": "base", "applicationStatus": "done"}]}]}])
                        if u.path == "/api/application.one":
                            return self.reply(dict(app, env=state["env"], buildArgs=None, buildSecrets=None, domains=state["domains"]))
                        if u.path == "/api/deployment.all":
                            return self.reply([{"deploymentId": "x1", "title": "Ancien", "status": "done", "createdAt": "2026-01-01T10:00:00Z"},
                                               {"deploymentId": "x2", "title": "Récent", "status": "error", "createdAt": "2026-02-01T10:00:00Z"}])
                        if u.path == "/api/domain.byApplicationId":
                            return self.reply(state["domains"])
                        if u.path == "/api/server.all":
                            return self.reply([{"serverId": "s1", "name": "vps", "ipAddress": "10.0.0.2"}])
                        self.send_response(404); self.send_header("Content-Length", "0"); self.end_headers()

                    def do_POST(self):
                        n = int(self.headers.get("Content-Length") or 0)
                        body = json.loads(self.rfile.read(n) or b"{}")
                        calls.append(("POST", self.path, body, self.headers.get("x-api-key")))
                        if self.path == "/api/application.saveEnvironment":
                            state["env"] = body["env"]
                        if self.path == "/api/domain.delete":
                            state["domains"] = [d for d in state["domains"] if d["domainId"] != body["domainId"]]
                        if self.path == "/api/domain.create":
                            state["domains"].append({"domainId": "d2", **body})
                        self.reply({})

                    def log_message(self, *a):
                        pass
                srv = http.server.HTTPServer(("127.0.0.1", 0), D)
                th.Thread(target=srv.serve_forever, daemon=True).start()
                try:
                    base = f"http://127.0.0.1:{srv.server_port}"
                    c.call("PUT", "/api/settings", {"dokploy_url": base, "dokploy_token": "dk-cle"})
                    m = c.call("GET", "/api/deploy/meta?provider=dokploy")  # test avant de choisir l'outil
                    assert m["environments"][0] == {"uuid": "e1", "name": "Perso · production", "project": "p1"}, m
                    assert m["servers"][0]["ip"] == "10.0.0.2", m
                    c.call("PUT", "/api/settings", {"deploy_provider": "dokploy"})
                    st = c.call("GET", "/api/settings")
                    assert st["deploy_provider"] == "dokploy" and st["dokploy_token_set"] and "dokploy_token" not in st
                    ov = c.call("GET", "/api/overview")["deploy"]
                    assert ov["name"] == "Dokploy" and ov["configured"] and not ov["features"]["rollback"], ov
                    apps = c.call("GET", "/api/deploy/apps?fresh=1")
                    a0 = apps[0]
                    assert a0["uuid"] == "app1" and a0["status"] == "running:healthy" and a0["repo"] == "https://github.com/moi/fumee", a0
                    assert a0["fqdn"] == "https://vieux.exemple.fr", a0
                    assert all(k == "dk-cle" for *_, k in calls), "clé d'API absente"
                    c.call("PATCH", f"/api/projects/{slug}", {"app_id": "app1"})
                    assert c.call("GET", f"/api/projects/{slug}")["app"]["name"] == "Fumée"
                    assert any(p["app_id"] == "app1" for p in c.call("GET", "/api/projects"))
                    c.call("POST", "/api/deploy/deploy", {"uuid": "app1"})
                    lastpost = lambda: next(x for x in reversed(calls) if x[0] == "POST")
                    assert lastpost()[1] == "/api/application.deploy" and lastpost()[2]["applicationId"] == "app1", lastpost()
                    c.call("POST", "/api/deploy/deploy", {"uuid": "app1", "force": True})
                    assert lastpost()[1] == "/api/application.redeploy", lastpost()
                    deps = c.call("GET", "/api/deploy/apps/app1/deployments")
                    assert [d["label"] for d in deps] == ["Récent", "Ancien"] and deps[0]["status"] == "failed", deps
                    envs = c.call("GET", "/api/deploy/apps/app1/envs")
                    assert [(e["key"], e["value"]) for e in envs] == [("A", "1"), ("B", "deux mots")], envs
                    c.call("POST", "/api/deploy/apps/app1/envs", {"key": "C", "value": "3", "create": True})
                    c.call("POST", "/api/deploy/apps/app1/envs", {"key": "A", "value": "un"})
                    c.call("DELETE", "/api/deploy/apps/app1/envs/B")
                    assert state["env"] == "A=un\nC=3", state["env"]
                    c.call("POST", "/api/deploy/apps/app1/envs", {"key": "1X", "value": "x", "create": True}, expect=400)
                    c.call("POST", "/api/deploy/apps/app1/domains", {"domains": "https://neuf.exemple.fr"})
                    assert [d["host"] for d in state["domains"]] == ["neuf.exemple.fr"] and state["domains"][0]["port"] == 8080, state
                    res = c.call("GET", "/api/deploy/resources?fresh=1")
                    assert {(r["name"], r["type"]) for r in res} == {("Fumée", "application"), ("base", "standalone-postgres")}, res
                    c.call("POST", "/api/deploy/apps/app1/rollback", {"commit": "abc"}, expect=400)
                    # Retour à « aucun outil » : le lien du projet reste rangé pour Dokploy
                    c.call("PUT", "/api/settings", {"deploy_provider": ""})
                    assert c.call("GET", f"/api/projects/{slug}")["app_id"] == ""
                    c.call("PUT", "/api/settings", {"deploy_provider": "dokploy"})
                    assert c.call("GET", f"/api/projects/{slug}")["app_id"] == "app1"
                    c.call("PATCH", f"/api/projects/{slug}", {"app_id": ""})
                    c.call("PUT", "/api/settings", {"deploy_provider": "", "clear_dokploy_token": True})
                finally:
                    srv.shutdown()
            check("déploiement : aucun outil, Dokploy (applis, variables, domaines, déploiements)", deploy_providers)
            def project_delete():
                # Projet avec un dépôt « distant » local : la suppression ne doit toucher que le dossier
                bare = tmp / "distant.git"
                subprocess.run(["git", "init", "--bare", "-q", str(bare)], check=True, env=env)
                r = c.call("POST", "/api/projects", {"name": "A Jeter", "source": "vide", "opts": {"git": True}})
                sl = r["slug"]
                pdir = tmp / "projets" / sl
                for cmd in (["remote", "add", "origin", str(bare)], ["push", "-q", "origin", "HEAD:main"]):
                    subprocess.run(["git", "-C", str(pdir), *cmd], check=True, env=env, capture_output=True)
                heads = subprocess.run(["git", "-C", str(bare), "rev-parse", "main"], capture_output=True, text=True).stdout
                c.call("DELETE", f"/api/projects/{sl}", {}, expect=400)
                d = c.call("DELETE", f"/api/projects/{sl}", {"confirm": sl})
                assert not pdir.exists()
                assert subprocess.run(["git", "-C", str(bare), "rev-parse", "main"], capture_output=True, text=True).stdout == heads
                assert all(p["slug"] != sl for p in c.call("GET", "/api/projects"))
                item = [t for t in c.call("GET", "/api/trash") if t["id"] == d["trash_id"]][0]
                assert item["project"] and item["meta"]["name"] == "A Jeter", item
                c.call("POST", f"/api/trash/{d['trash_id']}/restore")
                back = [p for p in c.call("GET", "/api/projects") if p["slug"] == sl]
                assert back and back[0]["name"] == "A Jeter" and (pdir / ".git").exists(), back
            check("supprimer un projet : corbeille, dépôt distant intact, restauration", project_delete)

            def parallel_branches():
                r = c.call("POST", "/api/projects", {"name": "Parallele", "source": "vide", "opts": {"git": True}})
                sl = r["slug"]
                pdir = tmp / "projets" / sl
                B = f"/api/projects/{sl}/branches"
                cp = c.call("POST", B, {"branch": "feat/x"})
                copy = tmp / "projets" / ".branches" / sl / "feat_x"
                assert cp["path"] == str(copy) and (copy / ".git").is_file(), cp
                # Taille du projet : dossier principal + copies (recalculée dès la création de la copie)
                main_only = int(subprocess.run(["du", "-sb", str(pdir)], capture_output=True, text=True).stdout.split()[0])
                plist = c.call("GET", "/api/projects")
                assert all(p["slug"] != ".branches" for p in plist)
                size = [p for p in plist if p["slug"] == sl][0]["size"]
                assert size > main_only, (size, main_only)
                c.call("POST", B, {"branch": "feat/x"}, expect=400)
                c.call("POST", B, {"branch": "main"}, expect=400)
                c.call("POST", B, {"branch": "--x"}, expect=400)
                # Commit dans la copie : visible depuis le dossier principal sans rien télécharger
                (copy / "nouveau.txt").write_text("x\n")
                for cmd in (["add", "-A"], ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-qm", "dans la copie"]):
                    subprocess.run(["git", "-C", str(copy), *cmd], check=True, env=env, capture_output=True)
                lst = c.call("GET", B)
                assert [(x["branch"], x["ahead"], x["changes"]) for x in lst] == [("feat/x", 1, 0)], lst
                st = c.call("GET", f"/api/projects/{sl}/claude/repo?branch=feat/x")
                assert not st["exists"] and st["name"].endswith("@feat_x"), st
                c.call("GET", f"/api/projects/{sl}/claude/repo?branch=inconnue", expect=404)
                # Fusion, puis suppression de la copie et de la branche (fusionnée)
                c.call("POST", f"{B}/merge", {"branch": "feat/x"})
                assert (pdir / "nouveau.txt").exists()
                rm = c.call("POST", f"{B}/remove", {"branch": "feat/x", "delete_branch": True})
                assert rm["deleted_branch"] and not copy.exists(), rm
                assert c.call("GET", B) == []
                # Copie avec un fichier non validé : refus sans confirmation ; corbeille du projet avec ses copies
                c.call("POST", B, {"branch": "garde"})
                keep = tmp / "projets" / ".branches" / sl / "garde"
                (keep / "brouillon.txt").write_text("y\n")
                c.call("POST", f"{B}/remove", {"branch": "garde"}, expect=409)
                d = c.call("DELETE", f"/api/projects/{sl}", {"confirm": sl})
                assert not keep.exists() and not pdir.exists()
                c.call("POST", f"/api/trash/{d['trash_id']}/restore")
                assert (keep / "brouillon.txt").exists()
                assert [x["branch"] for x in c.call("GET", B)] == ["garde"]
            check("branches en parallèle : copie, fusion, taille, corbeille", parallel_branches)
            def claude_usage():
                # La ligne d'état écrit les chiffres ; l'API les relit (contexte par projet, limites du forfait)
                inp = {"session_id": "s-1", "cwd": str(tmp / "projets" / slug), "model": {"display_name": "Opus"},
                       "context_window": {"context_window_size": 1000000, "used_percentage": 40},
                       "rate_limits": {"five_hour": {"used_percentage": 12, "resets_at": int(time.time()) + 3600},
                                       "seven_day": {"used_percentage": 30, "resets_at": "2099-01-01T00:00:00Z"}}}
                out = subprocess.run([sys.executable, str(ROOT / "helmshell" / "statusline.py")], input=json.dumps(inp),
                                     capture_output=True, text=True, env=env, timeout=20).stdout
                assert "context 40%" in out and "session 12%" in out, out
                u = c.call("GET", "/api/claude/usage")
                assert [l["id"] for l in u["limits"]] == ["session", "week"] and u["limits"][1]["resets_at"] > 4e9, u
                assert all(x["slug"] != slug for x in u["sessions"]), u  # pas de session Claude ouverte dans ce projet
            check("utilisation de Claude (ligne d'état)", claude_usage)
            def usage_cli_parse():
                # Sortie de `claude -p /usage` : lue quand aucune session n'exécute la ligne d'état
                sys.path.insert(0, str(ROOT))
                from helmshell import usage as U
                r = U.parse_usage("Current session: 60% used · resets Nov 18, 6:20pm (UTC)\n"
                                  "Current week (all models): 51% used · resets Nov 21, 4am (UTC)\n"
                                  "Current week (Fable): 0% used · resets Nov 21, 4am (UTC)\nContributions…")
                assert set(r) == {"five_hour", "seven_day", "seven_day_fable"}, r
                assert r["five_hour"]["used_percentage"] == 60 and r["seven_day"]["used_percentage"] == 51, r
                from datetime import datetime, timezone
                d = datetime.fromtimestamp(r["seven_day"]["resets_at"], timezone.utc)
                assert (d.month, d.day, d.hour, d.minute) == (11, 21, 4, 0), d
                assert U.parse_usage("rien d'utile") == {}
            check("utilisation de Claude (sortie de /usage)", usage_cli_parse)
            def usage_every():
                assert c.call("GET", "/api/settings")["usage_every"] == 5
                c.call("PUT", "/api/settings", {"usage_every": 7}, expect=400)
                c.call("PUT", "/api/settings", {"usage_every": 10})
                assert c.call("GET", "/api/settings")["usage_every"] == 10
                u = c.call("GET", "/api/claude/usage")
                assert u["every"] == 10 and "refreshing" in u, u
            check("utilisation de Claude : délai d'actualisation réglable", usage_every)
            def tech_detect():
                sys.path.insert(0, str(ROOT))
                from helmshell import projects as P
                d = tmp / "tech-detect"
                (d / "web").mkdir(parents=True, exist_ok=True)
                (d / "web" / "package.json").write_text('{"dependencies": {"react": "1", "@prisma/client": "1"}, "devDependencies": {"vite": "1", "typescript": "1"}}')
                (d / "web" / "vite.config.js").write_text("")
                (d / "requirements.txt").write_text("Django>=5\npsycopg2-binary\n")
                (d / "compose.yaml").write_text("services:\n  cache:\n    image: redis:7\n")
                t = P.detect_tags(d)
                for x in ("React", "Prisma", "Vite", "TypeScript", "Django", "PostgreSQL", "Redis", "Python"):
                    assert x in t, (x, t)
                assert "JavaScript" not in t and t.index("Django") < t.index("Redis"), t
            check("détection des technos (dépendances, fichiers repères)", tech_detect)
            def manual_platforms():
                c.call("PATCH", f"/api/projects/{slug}", {"platforms": ["Pigeon"]}, expect=400)
                c.call("PATCH", f"/api/projects/{slug}", {"platforms": ["Web", "Android", "Web"], "tags": ["Svelte", "Go"]})
                p = c.call("GET", f"/api/projects/{slug}")
                assert p["platforms"] == ["Android", "Web"] and p["platforms_manual"], p
                assert p["tags"] == ["Go", "Svelte"] and p["tags_manual"], p
                c.call("PATCH", f"/api/projects/{slug}", {"platforms": None, "tags": None})
                p = c.call("GET", f"/api/projects/{slug}")
                assert not p["platforms_manual"] and not p["tags_manual"], p
            check("plateformes et technos réglées à la main", manual_platforms)
            def metrics_ranges():
                assert c.call("GET", "/api/metrics?hours=720")["per"] == "day"
                assert c.call("GET", "/api/metrics?hours=168")["per"] == "hour"
                assert c.call("GET", "/api/metrics?hours=9999")["hours"] == 720
            check("serveur : moyennes sur 14 et 30 jours (par jour)", metrics_ranges)
            def raw(method, path, headers=None, body=None):
                """Requête brute (sans suivre les redirections) → (statut, en-têtes, corps)."""
                import http.client
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=15)
                conn.request(method, path, body=body, headers=headers or {})
                r = conn.getresponse()
                out = (r.status, r.getheaders(), r.read())
                conn.close()
                return out

            def network_access():
                sys.path.insert(0, str(ROOT))
                from helmshell import access
                from helmshell.util import ApiError
                # Règles (sans serveur)
                dom = access.clean({"domain": True, "domains": ["helmshell.exemple.fr"], "trusted_proxies": ["172.18.0.0/16"]})
                ev = access.evaluate("172.18.0.5", {"Host": "helmshell.exemple.fr", "X-Forwarded-For": "1.2.3.4, 203.0.113.7"}, dom)
                assert ev["allowed"] and ev["ip"] == "203.0.113.7" and ev["via_proxy"], ev
                assert not access.evaluate("172.18.0.5", {"Host": "autre.fr", "X-Forwarded-For": "203.0.113.7"}, dom)["allowed"]
                dom_ip = dict(dom, ips=["198.51.100.0/24"])
                assert not access.evaluate("172.18.0.5", {"Host": "helmshell.exemple.fr", "X-Forwarded-For": "203.0.113.7"}, dom_ip)["allowed"]
                assert access.evaluate("172.18.0.5", {"Host": "helmshell.exemple.fr", "X-Forwarded-For": "198.51.100.4"}, dom_ip)["allowed"]
                lan = access.clean({"lan": True})
                assert access.evaluate("192.168.1.5", {}, lan)["allowed"]
                assert not access.evaluate("192.168.1.5", {"X-Forwarded-For": "8.8.8.8"}, lan)["allowed"]  # proxy non approuvé
                assert not access.evaluate("172.18.0.5", {"X-Forwarded-For": "8.8.8.8"}, lan)["allowed"]
                assert not access.evaluate("100.101.2.3", {}, lan)["allowed"]
                # Passerelles Docker (docker-proxy relaie l'IPv6 publique depuis 10.x / 172.x) : pas « locales »
                assert not access.evaluate("10.0.3.1", {}, lan)["allowed"] and not access.evaluate("172.18.0.1", {}, lan)["allowed"]
                assert access.evaluate("10.0.3.1", {}, access.clean({"lan": True, "ips": ["10.0.3.0/24"]}))["allowed"]
                vpn = access.clean({"vpn": True})
                assert access.evaluate("100.101.2.3", {}, vpn)["allowed"] and not access.evaluate("192.168.1.5", {}, vpn)["allowed"]
                assert access.evaluate("::ffff:100.101.2.3", {}, vpn)["allowed"]
                assert access.evaluate("10.8.0.2", {}, access.clean({"vpn": True, "vpn_cidrs": ["10.8.0.0/24"]}))["allowed"]
                for bad in ({"domain": True, "trusted_proxies": ["10.0.0.0/8"]}, {"domain": True, "domains": ["a.fr"]},
                            {"ips": ["pas-une-ip"]}, {"domain": True, "domains": ["exemple fr"], "trusted_proxies": ["10.0.0.1"]}):
                    try:
                        access.clean(bad)
                        raise AssertionError(f"accepté : {bad}")
                    except ApiError:
                        pass
                # Serveur : anti-blocage, puis réseau local, puis remise à zéro
                c.call("PUT", "/api/settings", {"access": {"ips": ["10.9.9.9"]}}, expect=400)
                c.call("PUT", "/api/settings", {"access": {"domain": True, "domains": ["helmshell.test"], "trusted_proxies": ["127.0.0.1"]}}, expect=400)
                c.call("PUT", "/api/settings", {"access": {"lan": True}})
                who = c.call("GET", "/api/access/whoami")
                assert who["source"] == "settings" and who["rule"] == "Local network" and who["ip"] == "127.0.0.1", who
                st, _, body = raw("GET", "/", {"X-Forwarded-For": "8.8.8.8"})
                assert st == 403 and "accessible from this address" in body.decode(), (st, body[:100])
                assert c.call("GET", "/api/settings")["access"]["lan"] is True
                c.call("PUT", "/api/settings", {"access": {}})
                assert c.call("GET", "/api/access/whoami")["source"] == "open"
            check("accès réseau : local, VPN, domaine via proxy, IP, anti-blocage", network_access)

            def http_hardening():
                import socket as so
                st, _, body = raw("POST", "/api/login", {"Content-Length": "-1", "Content-Type": "application/json"})
                assert st == 400 and b"Content-Length" in body, (st, body)
                st, hd, _ = raw("POST", "/api/login", {"Transfer-Encoding": "chunked"}, body=b"0\r\n\r\n")
                assert st == 400, st
                # Corps non lu (requête refusée) : la connexion est fermée, pas réutilisée pour une requête cachée
                s = so.create_connection(("127.0.0.1", port), timeout=10)
                smuggled = b"GET /api/me HTTP/1.1\r\nHost: x\r\n\r\n"
                s.sendall(b"POST /api/projects HTTP/1.1\r\nHost: x\r\nContent-Length: %d\r\n\r\n" % len(smuggled) + smuggled)
                data = b""
                while True:
                    chunk = s.recv(65536)
                    if not chunk:
                        break
                    data += chunk
                s.close()
                assert data.count(b"HTTP/1.1 ") == 1, data[:300]
            check("HTTP : Content-Length négatif, chunked, corps non lu", http_hardening)

            def low_fixes():
                sys.path.insert(0, str(ROOT))
                from helmshell import notify, util
                assert raw("GET", "/api/auth-info", {"Host": "evil.example.com"})[0] == 421     # DNS rebinding
                assert raw("GET", "/api/auth-info", {"Host": "serveur.netbird.cloud"})[0] == 200
                st, hd, _ = raw("GET", "/api/auth-info")
                h = {k.lower(): v for k, v in hd}
                assert h.get("x-content-type-options") == "nosniff" and "frame-ancestors" in h.get("content-security-policy", ""), h
                old = os.environ.get("HELMSHELL_PASSWORD")
                os.environ["HELMSHELL_PASSWORD"] = "secret"
                try:
                    env = util.child_env()
                    assert "HELMSHELL_PASSWORD" not in env and "COOLIFY_TOKEN" not in env
                finally:
                    if old is None:
                        os.environ.pop("HELMSHELL_PASSWORD", None)
                    else:
                        os.environ["HELMSHELL_PASSWORD"] = old
                assert notify.md_escape("[Oui](https://x)") == "\\[Oui\\]\\(https://x\\)"
                assert util.tmux_slug("a.b") != util.tmux_slug("a_b")
                csp = {k.lower(): v for k, v in raw("GET", "/")[1]}["content-security-policy"]
                assert "jsdelivr" not in csp and "script-src 'self';" in csp, csp
            check("corrections basses : Host, en-têtes, secrets des processus, Markdown, CSP", low_fixes)

            def repo_content():
                d = tmp / "projets" / slug
                # Lien vers /dev/zero dans un dépôt : la liste des projets répond quand même
                (d / "zero-dir").mkdir(exist_ok=True)
                os.symlink("/dev/zero", d / "zero-dir" / "package.json")
                os.symlink("/dev/zero", d / "Cargo.toml")
                t0 = time.time()
                c.call("GET", "/api/projects")
                c.call("GET", f"/api/projects/{slug}/git")
                assert time.time() - t0 < 20
                (d / "zero-dir" / "package.json").unlink(); (d / "Cargo.toml").unlink(); (d / "zero-dir").rmdir()
                # Fichier nommé comme une option de git : affiché comme un fichier, rien d'écrit ailleurs
                victim = tmp / "projets" / "victime.txt"
                victim.write_text("intact")
                (d / "--output=..").mkdir(exist_ok=True)
                (d / "--output=.." / "victime.txt").write_text("x")
                try:
                    c.call("GET", f"/api/projects/{slug}/git/diff?path=" + urllib.parse.quote("--output=../victime.txt"))
                except AssertionError:
                    pass
                assert victim.read_text() == "intact"
                import shutil as sh
                sh.rmtree(d / "--output=..")
                victim.unlink()
                # URL de clonage avec jeton : refusée
                c.call("POST", "/api/projects", {"name": "jeton", "source": "git", "repo": "https://ghp_x@github.com/a/b.git"}, expect=400)
                # Dépôt avec sa propre configuration Claude : confirmation exigée avant une tâche
                (d / ".mcp.json").write_text("{}")
                c.call("POST", f"/api/projects/{slug}/tasks", {"prompt": "rien", "mode": "plan"}, expect=428)
                (d / ".mcp.json").unlink()
            check("contenu d'un dépôt : /dev/zero, option git, jeton dans l'URL, configuration Claude", repo_content)

            def oidc_login():
                import base64, http.server, threading as th
                idp = {"nonce": None, "email": "moi@exemple.fr", "auth": None, "aud": "helmshell"}

                class I(http.server.BaseHTTPRequestHandler):
                    def reply(self, obj):
                        b = json.dumps(obj).encode()
                        self.send_response(200); self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

                    def do_GET(self):
                        base = f"http://127.0.0.1:{self.server.server_port}"
                        self.reply({"issuer": base, "authorization_endpoint": base + "/authorize",
                                    "token_endpoint": base + "/token", "userinfo_endpoint": base + "/userinfo"})

                    def do_POST(self):
                        n = int(self.headers.get("Content-Length") or 0)
                        form = urllib.parse.parse_qs(self.rfile.read(n).decode())
                        idp["auth"] = self.headers.get("Authorization")
                        assert form["code_verifier"][0] and form["grant_type"] == ["authorization_code"]
                        base = f"http://127.0.0.1:{self.server.server_port}"
                        claims = {"iss": base, "aud": idp["aud"], "sub": "u1", "exp": time.time() + 300, "iat": time.time(),
                                  "nonce": idp["nonce"], "email": idp["email"], "email_verified": True}
                        enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
                        self.reply({"id_token": f"{enc({'alg': 'RS256'})}.{enc(claims)}.sig", "access_token": "at"})

                    def log_message(self, *a):
                        pass
                srv = http.server.HTTPServer(("127.0.0.1", 0), I)
                th.Thread(target=srv.serve_forever, daemon=True).start()
                session = next(ck for ck in c.opener.handlers if isinstance(ck, urllib.request.HTTPCookieProcessor)).cookiejar
                sess_cookie = "; ".join(f"{k.name}={k.value}" for k in session)

                def flow(test=False, nonce_ok=True, cookie=""):
                    st, hd, _ = raw("GET", "/auth/oidc/start" + ("?test=1" if test else ""), {"Cookie": cookie} if cookie else {})
                    assert st == 302, st
                    hd = dict(hd) if not isinstance(hd, dict) else hd
                    loc = urllib.parse.urlsplit(dict((k.lower(), v) for k, v in hd.items())["location"])
                    q = urllib.parse.parse_qs(loc.query)
                    assert q["code_challenge_method"] == ["S256"] and q["client_id"] == ["helmshell"], q
                    idp["nonce"] = q["nonce"][0] if nonce_ok else "faux"
                    state = q["state"][0]
                    ck = f"helmshell_oidc={state}" + (f"; {cookie}" if cookie else "")
                    return raw("GET", f"/auth/oidc/callback?code=abc&state={state}", {"Cookie": ck})
                try:
                    base = f"http://127.0.0.1:{srv.server_port}"
                    c.call("PUT", "/api/settings", {"oidc_issuer": "http://idp.exemple.fr"}, expect=400)  # https exigé
                    c.call("PUT", "/api/settings", {"oidc_issuer": base, "oidc_client_id": "helmshell", "oidc_client_secret": "s3cret",
                                                    "oidc_allowed_emails": "moi@exemple.fr", "oidc_label": "Test"})
                    st = c.call("GET", "/api/settings")
                    assert st["oidc"]["configured"] and not st["oidc"]["tested"] and "oidc_client_secret" not in st, st["oidc"]
                    c.call("PUT", "/api/settings", {"oidc_enabled": True}, expect=400)  # pas encore testé
                    assert c.call("GET", "/api/auth-info") == {"password": True, "oidc": None, "language": "en"}
                    assert raw("GET", "/auth/oidc/start?test=1")[0] == 401  # test réservé à une session ouverte
                    # Les réglages OIDC enregistrés ont révoqué les sessions : on reprend le cookie renouvelé
                    sess_cookie = "; ".join(f"{k.name}={k.value}" for k in session)
                    stt, _, body = flow(test=True, cookie=sess_cookie)
                    assert stt == 200 and "Test succeeded" in body.decode(), (stt, body[:200])
                    assert idp["auth"] == "Basic " + base64.b64encode(b"helmshell:s3cret").decode(), idp["auth"]
                    assert c.call("GET", "/api/settings")["oidc"]["tested"]
                    assert c.call("GET", "/api/auth-info")["oidc"] == {"label": "Test"}
                    assert flow(nonce_ok=False)[0] == 403
                    idp["email"] = "intrus@exemple.fr"
                    assert flow()[0] == 403
                    idp["email"], idp["aud"] = "moi@exemple.fr", "autre-client"
                    assert flow()[0] == 403
                    idp["aud"] = "helmshell"
                    stt, _, _ = raw("GET", "/auth/oidc/callback?code=abc&state=inconnu", {"Cookie": "helmshell_oidc=inconnu"})
                    assert stt == 400, stt
                    stt, hd, _ = flow()
                    cookies = [v for k, v in hd if k.lower() == "set-cookie"]
                    assert stt == 302 and any(v.startswith("helmshell=") and "Max-Age=0" not in v for v in cookies), (stt, cookies)
                    tok = next(v for v in cookies if v.startswith("helmshell=")).split(";")[0]
                    assert raw("GET", "/api/me", {"Cookie": tok})[0] == 200
                    c.call("PUT", "/api/settings", {"oidc_enabled": True})
                    assert c.call("GET", "/api/auth-info") == {"password": False, "oidc": {"label": "Test"}, "language": "en"}
                    c.call("POST", "/api/login", {"password": PASSWORD}, expect=403)
                    c.call("PUT", "/api/settings", {"oidc_enabled": False})
                    c.call("POST", "/api/login", {"password": PASSWORD})
                    # Changer de client oblige à refaire le test
                    c.call("PUT", "/api/settings", {"oidc_client_id": "helmshell2"})
                    assert not c.call("GET", "/api/settings")["oidc"]["tested"]
                    c.call("PUT", "/api/settings", {"oidc_issuer": "", "oidc_client_id": "", "clear_oidc_client_secret": True})
                finally:
                    srv.shutdown()
            check("connexion OIDC : test, nonce, audience, e-mail autorisé, mode OIDC seul", oidc_login)

            def sessions_revocation():
                jar = next(h for h in c.opener.handlers if isinstance(h, urllib.request.HTTPCookieProcessor)).cookiejar
                old = "; ".join(f"{k.name}={k.value}" for k in jar)
                assert old.count(".") >= 2, old  # génération.expiration.signature
                assert raw("GET", "/api/me", {"Cookie": old})[0] == 200
                c.call("POST", "/api/logout-all")
                assert raw("GET", "/api/me", {"Cookie": old})[0] == 401   # l'ancien cookie (volé) ne vaut plus
                c.call("GET", "/api/me")                                  # cet appareil reste connecté
                assert raw("GET", "/api/me", {"Cookie": "helmshell=123.4567890123.abc"})[0] == 401
            check("sessions : déconnexion de tous les appareils, ancien format refusé", sessions_revocation)
            check("lien de notification falsifié refusé",
                  lambda: c.call("POST", "/hook/answer?t=abc.def", expect=403))
            def login_limit():
                # En dernier : bloque les connexions depuis 127.0.0.1 pour 10 minutes
                fresh = Client(f"http://127.0.0.1:{port}")
                seen = []
                for _ in range(40):
                    st, _, _ = raw("POST", "/api/login", {"Content-Type": "application/json", "X-Helmshell": "1"},
                                   body=json.dumps({"password": "faux"}).encode())
                    seen.append(st)
                    if st == 429:
                        break
                assert seen[-1] == 429 and len(seen) <= 31, seen
                st, _, _ = raw("POST", "/api/login", {"Content-Type": "application/json"}, body=json.dumps({"password": PASSWORD}).encode())
                assert st == 429, st  # même le bon mot de passe attend : pas de force brute en parallèle
                st, _, body = raw("POST", "/api/login", {"Content-Type": "application/json"}, body=json.dumps({"password": 1}).encode())
                assert st in (400, 403, 429) and b"Erreur interne" not in body, body
            check("chemin hors projet refusé",
                  lambda: c.call("GET", f"/api/projects/{slug}/file?path=../../etc/passwd", expect=403))
            check("connexion : limitation des tentatives (en dernier)", login_limit)
        finally:
            proc.terminate()
            try:
                out, _ = proc.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                out, _ = proc.communicate()
            if "Traceback" in (out or ""):
                failures.append("traceback côté serveur :\n" + out[-2000:])
    js = subprocess.run([sys.executable, str(ROOT / "tests" / "check_js.py"),
                         *map(str, sorted((ROOT / "static").glob("*.js")))], capture_output=True, text=True)
    print(js.stdout.strip())
    if js.returncode:
        failures.append("JavaScript")
    if failures:
        print(f"\n{len(failures)} échec(s)")
        for f in failures:
            print(" -", f)
        return 1
    print("\nTout est OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
