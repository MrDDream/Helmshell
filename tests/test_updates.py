#!/usr/bin/env python3
"""Unit test of helmshell/updates.py against a local fake of the GitHub releases API.

    python3 tests/test_updates.py
No network access; the real configuration is not touched (temporary HELMSHELL_DATA).
"""
import json
import os
import shutil
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = tempfile.mkdtemp(prefix="helmshell-updates-")
os.environ["HELMSHELL_DATA"] = DATA
os.environ.pop("HELMSHELL_UPDATE_CHECK", None)
os.environ.pop("HELMSHELL_DOCKER", None)
sys.path.insert(0, str(ROOT))


class Fake(BaseHTTPRequestHandler):
    hits = 0
    status = 200
    tag = "v99.0.0"
    body = "Release notes"
    headers_seen = {}

    def do_GET(self):
        Fake.hits += 1
        Fake.headers_seen = dict(self.headers)
        if Fake.status == 302:
            self.send_response(302)
            self.send_header("Location", "http://example.invalid/")
            self.end_headers()
            return
        payload = json.dumps({"tag_name": Fake.tag, "html_url": "https://github.com/MrDDream/Helmshell/releases/tag/" + Fake.tag,
                              "body": Fake.body}).encode()
        self.send_response(Fake.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    from helmshell import __version__, config, updates
    updates.RELEASES_URL = f"http://127.0.0.1:{server.server_address[1]}/repos/MrDDream/Helmshell/releases/latest"

    # Version comparison
    assert __version__ and __version__ != "0.0.0", __version__
    assert updates.is_newer("v1.0.1", "1.0.0")
    assert updates.is_newer("1.10.0", "1.9.9")
    assert updates.is_newer("2", "1.99.99")
    assert not updates.is_newer("v1.0.0", "1.0.0")
    assert not updates.is_newer("1.0.0-rc.1", "1.0.0")
    assert updates.is_newer("1.0.0", "1.0.0-rc.1")
    assert not updates.is_newer("0.9.0", "1.0.0")
    assert not updates.is_newer(None, "1.0.0")

    # First check: one request with the expected headers, result cached (0600)
    r = updates.check()
    assert r["available"] is True and r["latest"] == "99.0.0", r
    assert r["current"] == __version__ and r["notes"] == "Release notes" and r["checked"], r
    assert r["url"].startswith("https://github.com/"), r
    assert r["kind"] in ("git", "other"), r
    assert "error" not in r, r
    assert Fake.hits == 1
    assert Fake.headers_seen.get("Accept") == "application/vnd.github+json", Fake.headers_seen
    assert Fake.headers_seen.get("User-Agent") == f"Helmshell/{__version__}", Fake.headers_seen
    cache = Path(DATA) / "update.json"
    assert cache.exists() and (cache.stat().st_mode & 0o777) == 0o600

    # Within 24 h: served from the cache
    assert updates.check()["latest"] == "99.0.0"
    assert Fake.hits == 1

    # force=True: new request; long notes are truncated
    Fake.body = "x" * 10_000
    r = updates.check(force=True)
    assert Fake.hits == 2 and len(r["notes"]) == updates.NOTES_MAX, (Fake.hits, len(r["notes"]))

    # Server error: never raises, last result kept, error reported
    Fake.status = 500
    r = updates.check(force=True)
    assert Fake.hits == 3 and r["latest"] == "99.0.0" and r["available"] and r.get("error"), r
    # ... and no retry right away
    updates.check()
    assert Fake.hits == 3

    # Redirects are not followed
    Fake.status = 302
    r = updates.check(force=True)
    assert Fake.hits == 4 and r.get("error") and r["latest"] == "99.0.0", r

    # Back to normal, same version as ours: nothing available, error cleared
    Fake.status, Fake.tag = 200, "v" + __version__
    r = updates.check(force=True)
    assert r["available"] is False and "error" not in r, r

    # Invalid tag: rejected, previous result kept
    Fake.tag = "<script>"
    r = updates.check(force=True)
    assert r.get("error") and r["latest"] == __version__, r
    Fake.tag = "v99.0.0"

    # Unreachable server: error, no exception
    good_url = updates.RELEASES_URL
    updates.RELEASES_URL = "http://127.0.0.1:9/nothing"
    r = updates.check(force=True)
    assert r.get("error"), r
    updates.RELEASES_URL = good_url

    # Disabled by the environment, then by the config: no request
    hits = Fake.hits
    os.environ["HELMSHELL_UPDATE_CHECK"] = "0"
    r = updates.check(force=True)
    assert r["available"] is False and r["latest"] is None and r.get("disabled"), r
    del os.environ["HELMSHELL_UPDATE_CHECK"]
    config.load()["update_check"] = False
    r = updates.check(force=True)
    assert r["available"] is False and r["latest"] is None, r
    config.load().pop("update_check")
    assert Fake.hits == hits

    # Install kind
    os.environ["HELMSHELL_DOCKER"] = "1"
    assert updates.check()["kind"] == "docker"
    del os.environ["HELMSHELL_DOCKER"]

    server.shutdown()
    shutil.rmtree(DATA, ignore_errors=True)
    print("test_updates: OK")


if __name__ == "__main__":
    main()
