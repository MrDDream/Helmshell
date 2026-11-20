"""Double authentification par application (TOTP, RFC 6238).

Compatible avec Google Authenticator, Aegis, 2FAS, Bitwarden, 1Password… : code à 6 chiffres
renouvelé toutes les 30 s. Des codes de secours à usage unique (stockés hachés) permettent de se
connecter sans le téléphone.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import threading
import time
import urllib.parse

from . import config
from .i18n import _
from .util import ApiError

STEP = 30
DIGITS = 6
WINDOW = 1  # tolère un pas de 30 s d'écart d'horloge
RECOVERY_COUNT = 8
_lock = threading.Lock()


def new_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def code_at(secret, counter):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 10 ** DIGITS:0{DIGITS}d}"


def match(secret, code, now=None):
    """Renvoie le pas de temps correspondant au code, ou None."""
    code = "".join(c for c in str(code or "") if c.isdigit())
    if len(code) != DIGITS or not secret:
        return None
    step = int((now if now is not None else time.time()) // STEP)
    for s in range(step - WINDOW, step + WINDOW + 1):
        if hmac.compare_digest(code_at(secret, s), code):
            return s
    return None


def _hash_recovery(code):
    norm = "".join(c for c in str(code).lower() if c.isalnum())
    return hashlib.sha256(b"helmshell-secours:" + norm.encode()).hexdigest()


def _new_recovery():
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # sans 0/o, 1/l/i
    codes = ["".join(secrets.choice(alphabet) for _x in range(4)) + "-" + "".join(secrets.choice(alphabet) for _x in range(4))
             for _x in range(RECOVERY_COUNT)]
    return codes, [_hash_recovery(c) for c in codes]


def enabled():
    return bool(config.get("totp_secret"))


def status():
    return {"enabled": enabled(), "recovery_left": len(config.get("totp_recovery") or [])}


def account():
    import os
    return os.environ.get("HOST_USER") or os.environ.get("USER") or "helmshell"


def setup():
    """Prépare un nouveau secret (pas encore actif tant qu'un code n'a pas été vérifié)."""
    if enabled():
        raise ApiError(_("La double authentification est déjà active"))
    secret = new_secret()
    config.update(totp_pending=secret)
    label = urllib.parse.quote(f"Helmshell:{account()}")
    uri = f"otpauth://totp/{label}?secret={secret}&issuer=Helmshell&algorithm=SHA1&digits={DIGITS}&period={STEP}"
    return {"secret": secret, "uri": uri}


def enable(code):
    pending = config.get("totp_pending") or ""
    if not pending:
        raise ApiError(_("Recommence l'activation : aucun secret en attente"))
    step = match(pending, code)
    if step is None:
        raise ApiError(_("Code incorrect : vérifie l'heure du téléphone et réessaie"), 403)
    codes, hashes = _new_recovery()
    config.update(totp_secret=pending, totp_pending="", totp_last=step, totp_recovery=hashes)
    return codes


def verify(code):
    """Code de l'application (une seule fois par pas de 30 s) ou code de secours (usage unique)."""
    secret = config.get("totp_secret") or ""
    if not secret:
        return True
    with _lock:
        step = match(secret, code)
        if step is not None:
            if step <= int(config.get("totp_last") or 0):
                return False  # code déjà utilisé : rejeu
            config.update(totp_last=step)
            return True
        h = _hash_recovery(code)
        left = list(config.get("totp_recovery") or [])
        for i, stored in enumerate(left):
            if hmac.compare_digest(stored, h):
                del left[i]
                config.update(totp_recovery=left)
                return True
    return False


def regenerate_recovery(code):
    if not verify(code):
        raise ApiError(_("Code incorrect"), 403)
    codes, hashes = _new_recovery()
    config.update(totp_recovery=hashes)
    return codes


def disable():
    config.update(totp_secret="", totp_pending="", totp_last=0, totp_recovery=[])
