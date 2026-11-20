"""Notifications (ntfy, Gotify ou webhook Discord) et liens d'action signés (répondre Oui/Non sans se connecter)."""
import base64
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
import urllib.parse
import urllib.request

from . import config
from .i18n import _
from .util import open_url

ACTION_TTL = 600  # liens Oui / Non valables 10 minutes


SERVICES = {"ntfy": "ntfy", "gotify": "Gotify", "discord": "Discord"}
DISCORD_RE = re.compile(r"^https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/api/webhooks/\d+/[\w-]+$")



_MD = re.compile(r"([\\`*_\[\]()<>#|~!])")


def md_escape(text):
    """Texte venu de Claude ou d'un terminal : affiché tel quel, sans faux liens ni faux boutons Markdown."""
    return _MD.sub(r"\\\1", text or "")

def service():
    s = config.get("notify_service") or ""
    if s in SERVICES or s == "off":
        return "" if s == "off" else s
    return "ntfy" if config.get("ntfy_url") else ""  # réglages d'avant le choix du service


def configured():
    return bool(service())


def check_gotify(url):
    u = urllib.parse.urlsplit((url or "").strip())
    if u.scheme not in ("http", "https") or not u.netloc:
        raise ValueError(_("Adresse Gotify attendue sous la forme https://gotify.exemple.fr"))
    return url.strip().rstrip("/")


def check_discord(url):
    if not DISCORD_RE.match((url or "").strip()):
        raise ValueError(_("URL de webhook Discord attendue : https://discord.com/api/webhooks/…"))
    return url.strip()


def _split(url):
    u = urllib.parse.urlsplit(url.strip())
    topic = u.path.strip("/")
    if u.scheme not in ("http", "https") or not topic or "/" in topic:
        raise ValueError(_("Adresse ntfy attendue sous la forme https://ntfy.sh/mon-sujet"))
    return f"{u.scheme}://{u.netloc}", topic


def _links(actions):
    """Boutons Oui / Non en liens Markdown : ils ouvrent une page de confirmation (GET sans effet)."""
    return " · ".join(f"[{a['label']}]({a['url']})" for a in actions or [] if a.get("url"))


def _request(svc, title, message, click, actions, priority, tags):
    headers = {"Content-Type": "application/json", "User-Agent": "Helmshell/1.0"}
    if svc == "ntfy":
        base, topic = _split(config.get("ntfy_url") or "")
        body = {"topic": topic, "title": title[:200], "message": message[:3000] or title,
                "priority": priority, "tags": tags or []}
        if click:
            body["click"] = click
        if actions:
            body["actions"] = actions
        if config.get("ntfy_token"):
            headers["Authorization"] = "Bearer " + config.get("ntfy_token")
        return base, body, headers
    links = _links(actions)
    if svc == "gotify":
        base = check_gotify(config.get("gotify_url"))
        if not config.get("gotify_token"):
            raise ValueError(_("Jeton d'application Gotify manquant"))
        headers["X-Gotify-Key"] = config.get("gotify_token")
        open_link = _("Ouvrir Helmshell")
        text = (md_escape(message[:3000]) or md_escape(title)) + (f"\n\n{links}" if links else "") + (f"\n\n[{open_link}]({click})" if click else "")
        body = {"title": title[:200], "message": text, "priority": {3: 5, 4: 8}.get(priority, 5),
                "extras": {"client::display": {"contentType": "text/markdown"}}}
        if click:
            body["extras"]["client::notification"] = {"click": {"url": click}}
        return base + "/message", body, headers
    if svc == "discord":
        url = check_discord(config.get("discord_webhook"))
        text = (md_escape(message[:3500]) or md_escape(title)) + (f"\n\n**{links}**" if links else "")
        embed = {"title": title[:250], "description": text,
                 "color": 0xB3261E if "warning" in (tags or []) or "x" in (tags or []) else 0x006A60}
        if click:
            embed["url"] = click
        return url + "?wait=true", {"username": "Helmshell", "embeds": [embed]}, headers
    raise ValueError(_("Service de notification inconnu"))


def send(title, message, click="", actions=None, priority=3, tags=None, wait=False):
    """Publie une notification. Renvoie None si tout va bien, sinon le message d'erreur."""
    svc = service()
    if not svc:
        return _("Les notifications ne sont pas configurées")
    try:
        url, body, headers = _request(svc, title, message, click, actions, priority, tags)
    except ValueError as e:
        return str(e)
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    result = {}

    def go():
        try:
            with open_url(req, timeout=10) as r:
                r.read()
        except Exception as e:  # noqa: BLE001 — une notification ratée ne doit rien casser
            result["err"] = _("{service} : {error}", service=SERVICES[svc], error=getattr(e, "reason", None) or e)
            print(result["err"], flush=True)

    if wait:
        go()
        return result.get("err")
    threading.Thread(target=go, daemon=True).start()
    return None


# --- Liens d'action signés ---------------------------------------------------

def _sig(payload):
    return hmac.new(config.secret(), b"hook:" + payload, hashlib.sha256).hexdigest()[:32]


def action_token(**data):
    data["exp"] = int(time.time()) + ACTION_TTL
    data.setdefault("n", secrets.token_hex(8))  # usage unique (voir consume)
    payload = base64.urlsafe_b64encode(json.dumps(data, separators=(",", ":")).encode()).rstrip(b"=")
    return payload.decode() + "." + _sig(payload)


def read_token(token):
    try:
        payload, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _sig(payload.encode())):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (ValueError, TypeError):
        return None
    if data.get("exp", 0) < time.time():
        return None
    return data


_used_lock = threading.Lock()


def consume(data):
    """Marque le lien comme utilisé. Renvoie False s'il l'a déjà été (rejeu)."""
    from . import config
    path = config.DATA_DIR / "liens-utilises.json"
    with _used_lock:
        try:
            used = json.loads(path.read_text())
        except (OSError, ValueError):
            used = {}
        now = time.time()
        used = {n: exp for n, exp in used.items() if exp > now}
        nonce = str(data.get("n") or "")
        if not nonce or nonce in used:
            return False
        used[nonce] = data.get("exp", now + ACTION_TTL)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(used))
        tmp.replace(path)
        return True


def public_url():
    return (config.get("public_url") or "").rstrip("/")
