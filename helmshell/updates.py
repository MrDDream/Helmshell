"""Update check: is a newer Helmshell release published on GitHub?

At most one request every 24 hours (result cached in DATA_DIR/update.json), never raises: on a network
or API error the last known result is kept and an `error` field is added. Disabled with the environment
variable HELMSHELL_UPDATE_CHECK=0 or the config key `update_check: false`.
"""
import json
import os
import re
import threading
import time
import urllib.request
from pathlib import Path

from . import __version__, config
from .util import open_url

RELEASES_URL = (os.environ.get("HELMSHELL_RELEASES_URL")
                or "https://api.github.com/repos/MrDDream/Helmshell/releases/latest")
RELEASES_PAGE = "https://github.com/MrDDream/Helmshell/releases"
CHECK_EVERY = 24 * 3600     # seconds between two successful checks
RETRY_AFTER_ERROR = 3600    # seconds before retrying after a failed check
TIMEOUT = 10
NOTES_MAX = 4000
REPO_DIR = Path(__file__).resolve().parent.parent

_TAG_RE = re.compile(r"^[vV]?\d+(\.\d+){0,3}([-+][0-9A-Za-z.+-]{1,40})?$")
_lock = threading.Lock()


def cache_file():
    return config.DATA_DIR / "update.json"


def parse_version(value):
    """'v1.2.3-rc.1' → ((1, 2, 3), 0, 'rc.1'); a release sorts after its pre-releases."""
    text = str(value or "").strip().lstrip("vV")
    text = text.split("+", 1)[0]  # build metadata is ignored
    main, _, pre = text.partition("-")
    nums = []
    for part in main.split("."):
        m = re.match(r"\d+", part)
        nums.append(int(m.group()) if m else 0)
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums), (0 if pre else 1), pre


def is_newer(latest, current):
    if not latest:
        return False
    return parse_version(latest) > parse_version(current)


def install_kind():
    if os.environ.get("HELMSHELL_DOCKER") == "1":
        return "docker"
    if (REPO_DIR / ".git").exists():
        return "git"
    return "other"


def enabled():
    if os.environ.get("HELMSHELL_UPDATE_CHECK", "").strip() == "0":
        return False
    try:
        return config.load().get("update_check", True) is not False
    except Exception:  # unreadable config: keep the default (enabled)
        return True


def _read_cache():
    try:
        data = json.loads(cache_file().read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_cache(data):
    path = cache_file()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError:
        pass  # the check still works, it will simply run again next time


def _fetch():
    req = urllib.request.Request(RELEASES_URL, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": f"Helmshell/{__version__}",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with open_url(req, TIMEOUT) as resp:
        raw = resp.read(2_000_000)
    data = json.loads(raw.decode("utf-8", "replace"))
    if not isinstance(data, dict):
        raise ValueError("unexpected response")
    tag = data.get("tag_name")
    if not isinstance(tag, str) or not _TAG_RE.match(tag.strip()):
        raise ValueError("invalid release tag")
    url = data.get("html_url")
    if not isinstance(url, str) or not url.startswith("https://"):
        url = RELEASES_PAGE
    notes = data.get("body")
    notes = notes[:NOTES_MAX] if isinstance(notes, str) else ""
    return {"latest": tag.strip().lstrip("vV"), "url": url, "notes": notes}


def check(force=False):
    """Returns {current, latest, url, notes, available, kind, checked} (+ error, disabled)."""
    result = {
        "current": __version__, "latest": None, "url": RELEASES_PAGE, "notes": "",
        "available": False, "kind": install_kind(), "checked": None,
    }
    if not enabled():
        result["disabled"] = True
        return result
    with _lock:
        cache = _read_cache()
        now = time.time()
        checked = cache.get("checked") or 0
        attempted = cache.get("attempted") or 0
        due = (now - checked >= CHECK_EVERY) and (not cache.get("error") or now - attempted >= RETRY_AFTER_ERROR)
        if force or due:
            try:
                fresh = _fetch()
                cache = {**fresh, "checked": int(now), "attempted": int(now)}
            except Exception as e:  # network, HTTP (redirects included), JSON: keep the last result
                cache = {**cache, "attempted": int(now), "error": (str(e) or e.__class__.__name__)[:200]}
            _write_cache(cache)
    if cache.get("latest"):
        result["latest"] = cache["latest"]
        result["url"] = cache.get("url") or RELEASES_PAGE
        result["notes"] = (cache.get("notes") or "")[:NOTES_MAX]
        result["available"] = is_newer(cache["latest"], __version__)
    result["checked"] = cache.get("checked") or None
    if cache.get("error"):
        result["error"] = cache["error"]
    return result
