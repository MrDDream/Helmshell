"""Connexion OpenID Connect (code d'autorisation + PKCE), sans dépendance.

L'id_token est reçu directement du token endpoint, en TLS, par le serveur : OIDC Core §3.1.3.7
permet alors de se fier à TLS plutôt qu'à la signature. On vérifie iss, aud/azp, exp, iat, nonce.
Mode « OIDC seul » : la connexion par mot de passe est refusée (secours : HELMSHELL_OIDC_DISABLE=1).
"""
import base64
import hashlib
import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from helmshell import config
from helmshell.i18n import _
from helmshell.util import ApiError, open_url

STATE_TTL = 600
_pending = {}
_lock = threading.Lock()
_disco = {}


def _local(url):
    host = urllib.parse.urlsplit(url).hostname or ""
    return host in ("localhost", "127.0.0.1", "::1")


def configured():
    return bool(config.get("oidc_issuer") and config.get("oidc_client_id"))


def disabled_by_env():
    return os.environ.get("HELMSHELL_OIDC_DISABLE") == "1"


def only():
    """Connexion par mot de passe refusée ?"""
    return bool(config.get("oidc_enabled")) and configured() and not disabled_by_env()


def available():
    """Bouton OIDC sur la page de connexion."""
    return configured() and (bool(config.get("oidc_tested")) or only()) and not disabled_by_env()


def label():
    return (config.get("oidc_label") or "").strip() or "SSO"


def check_issuer(url):
    url = (url or "").strip().rstrip("/")
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ("https", "http") or not p.netloc:
        raise ApiError(_("Adresse de l'émetteur OIDC invalide (ex. https://auth.exemple.fr/application/o/helmshell)"))
    if p.scheme != "https" and not _local(url):
        raise ApiError(_("L'émetteur OIDC doit être en https"))
    return url


def _http(url, data=None, headers=None, timeout=10):
    req = urllib.request.Request(url, data=data, headers={"Accept": "application/json", "User-Agent": "Helmshell",
                                                          **(headers or {})})
    try:
        with open_url(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode() or "{}")
        except ValueError:
            body = {}
        msg = body.get("error_description") or body.get("error") or f"HTTP {e.code}"
        err = ApiError(_("Fournisseur OIDC : {error}", error=msg), 502)
        err.http = e.code
        raise err from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise ApiError(_("Fournisseur OIDC injoignable : {reason}", reason=getattr(e, "reason", e)), 502) from None


def discovery(issuer=None, fresh=False):
    issuer = check_issuer(issuer or config.get("oidc_issuer"))
    hit = _disco.get(issuer)
    if hit and not fresh and time.time() - hit[0] < 3600:
        return hit[1]
    d = _http(issuer + "/.well-known/openid-configuration")
    for k in ("authorization_endpoint", "token_endpoint", "issuer"):
        if not d.get(k):
            raise ApiError(_("Découverte OIDC incomplète : « {field} » manquant", field=k), 502)
    for k in ("authorization_endpoint", "token_endpoint", "userinfo_endpoint"):
        if d.get(k) and not d[k].startswith("https://") and not _local(d[k]):
            raise ApiError(_("Découverte OIDC : {field} doit être en https", field=k), 502)
    if str(d["issuer"]).rstrip("/") != issuer.rstrip("/"):  # OIDC Discovery §4.3
        raise ApiError(_("Découverte OIDC : l'émetteur annoncé ne correspond pas à celui configuré"), 502)
    _disco[issuer] = (time.time(), d)
    return d


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


PENDING_PER_IP = 5


def start(redirect_uri, test=False, ip=""):
    """→ (url d'autorisation, state à mettre en cookie)."""
    if not configured():
        raise ApiError(_("OIDC n'est pas configuré"), 400)
    if disabled_by_env():
        raise ApiError(_("OIDC désactivé sur le serveur (HELMSHELL_OIDC_DISABLE)"), 403)
    if not test and not available():
        raise ApiError(_("La connexion OIDC n'est pas encore activée : teste-la depuis les Paramètres"), 403)
    d = discovery()
    state, nonce, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    with _lock:
        now = time.time()
        for k in [k for k, v in _pending.items() if v["exp"] < now]:
            _pending.pop(k, None)
        if len(_pending) > 200 or sum(1 for v in _pending.values() if v.get("ip") == ip) >= PENDING_PER_IP:
            raise ApiError(_("Trop de connexions en cours, réessaie dans quelques minutes"), 429)
        _pending[state] = {"nonce": nonce, "verifier": verifier, "exp": now + STATE_TTL, "test": bool(test),
                           "redirect": redirect_uri, "ip": ip}
    q = {"response_type": "code", "client_id": config.get("oidc_client_id"), "redirect_uri": redirect_uri,
         "scope": "openid email profile", "state": state, "nonce": nonce,
         "code_challenge": _b64(hashlib.sha256(verifier.encode()).digest()), "code_challenge_method": "S256"}
    if test:
        q["prompt"] = "login"
    sep = "&" if "?" in d["authorization_endpoint"] else "?"
    return d["authorization_endpoint"] + sep + urllib.parse.urlencode(q), state


def _claims(id_token):
    try:
        payload = id_token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        raise ApiError(_("Jeton d'identité illisible"), 502) from None


def _token(d, code, pend):
    cid, secret = config.get("oidc_client_id"), config.get("oidc_client_secret") or ""
    form = {"grant_type": "authorization_code", "code": code, "redirect_uri": pend["redirect"],
            "code_verifier": pend["verifier"], "client_id": cid}
    methods = d.get("token_endpoint_auth_methods_supported") or ["client_secret_basic"]
    use_post = secret and "client_secret_basic" not in methods and "client_secret_post" in methods
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if secret and not use_post:
        cred = f"{urllib.parse.quote(cid, safe='')}:{urllib.parse.quote(secret, safe='')}"
        headers["Authorization"] = "Basic " + base64.b64encode(cred.encode()).decode()
    elif secret:
        form["client_secret"] = secret
    try:
        return _http(d["token_endpoint"], urllib.parse.urlencode(form).encode(), headers)
    except ApiError as e:
        if secret and not use_post and getattr(e, "http", 0) in (400, 401):  # certains IdP n'acceptent que « post »
            form["client_secret"] = secret
            headers.pop("Authorization", None)
            return _http(d["token_endpoint"], urllib.parse.urlencode(form).encode(), headers)
        raise


def _allowed(email, groups, verified=False):
    emails = {e.strip().lower() for e in (config.get("oidc_allowed_emails") or "").replace(",", " ").split() if e.strip()}
    group = (config.get("oidc_group") or "").strip()
    if not emails and not group:
        raise ApiError(_("Aucun utilisateur autorisé : renseigne des adresses e-mail ou un groupe dans Helmshell"), 403)
    if email and email.lower() in emails:
        if verified:
            return True
        # Autorisation par adresse : elle doit être vérifiée chez le fournisseur (sinon n'importe qui
        # pourrait s'inscrire avec cette adresse et entrer)
        if not group or group not in (groups or []):
            raise ApiError(_("L'adresse {email} n'est pas marquée comme vérifiée par le fournisseur", email=email), 403)
    if group and group in (groups or []):
        return True
    raise ApiError(_("Le compte {email} n'est pas autorisé dans Helmshell", email=email or _("(sans e-mail)")), 403)


def finish(state, cookie_state, code):
    """Retour du fournisseur → {email, test}. Lève ApiError sinon."""
    if not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        raise ApiError(_("Session de connexion expirée ou ouverte depuis une autre adresse : recommence"), 400)
    with _lock:
        pend = _pending.pop(state, None)
    if not pend or pend["exp"] < time.time():
        raise ApiError(_("Session de connexion expirée : recommence"), 400)
    if not code:
        raise ApiError(_("Le fournisseur n'a pas renvoyé de code"), 400)
    d = discovery()
    tok = _token(d, code, pend)
    if not tok.get("id_token"):
        raise ApiError(_("Le fournisseur n'a pas renvoyé de jeton d'identité"), 502)
    c = _claims(tok["id_token"])
    cid, now = config.get("oidc_client_id"), time.time()
    aud = c.get("aud")
    auds = aud if isinstance(aud, list) else [aud]
    if c.get("iss") != d["issuer"]:
        raise ApiError(_("Jeton refusé : émetteur inattendu"), 403)
    if cid not in auds or (len(auds) > 1 and c.get("azp") not in (None, cid)):
        raise ApiError(_("Jeton refusé : il n'est pas destiné à Helmshell"), 403)
    if not isinstance(c.get("exp"), (int, float)) or c["exp"] < now - 60:
        raise ApiError(_("Jeton refusé : expiré"), 403)
    if isinstance(c.get("iat"), (int, float)) and c["iat"] > now + 300:
        raise ApiError(_("Jeton refusé : daté du futur (horloges décalées ?)"), 403)
    if not secrets.compare_digest(str(c.get("nonce") or ""), pend["nonce"]):
        raise ApiError(_("Jeton refusé : nonce invalide"), 403)
    email, groups = c.get("email"), c.get("groups")
    if (not email or groups is None) and d.get("userinfo_endpoint") and tok.get("access_token"):
        try:
            ui = _http(d["userinfo_endpoint"], headers={"Authorization": "Bearer " + tok["access_token"]})
            if ui.get("sub") == c.get("sub"):
                email = email or ui.get("email")
                groups = groups if groups is not None else ui.get("groups")
                if "email_verified" in ui and "email_verified" not in c:
                    c["email_verified"] = ui["email_verified"]
        except ApiError:
            pass
    if c.get("email_verified") is False:
        raise ApiError(_("L'adresse {email} n'est pas vérifiée chez le fournisseur", email=email), 403)
    _allowed(email, groups if isinstance(groups, list) else [], c.get("email_verified") is True)
    return {"email": email or c.get("sub"), "test": pend["test"]}


def status():
    return {"configured": configured(), "enabled": bool(config.get("oidc_enabled")),
            "tested": bool(config.get("oidc_tested")), "only": only(), "env_disabled": disabled_by_env(),
            "label": label()}
