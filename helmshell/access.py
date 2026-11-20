"""Qui peut joindre Helmshell : réseau local, VPN, domaine (derrière un proxy de confiance), IP précises.

Le réglage `access` (Paramètres › Sécurité) l'emporte sur la variable HELMSHELL_ALLOWED_NETWORKS ;
sans réglage actif, c'est elle qui s'applique (et sans elle, tout le monde passe, comme avant).
HELMSHELL_ACCESS_RESET=1 ignore le réglage, au cas où on se serait coupé l'accès.
"""
import ipaddress
import os
import re

from helmshell import config
from helmshell.i18n import _
from helmshell.util import ApiError

# Réseau local : box et réseaux domestiques (192.168.x) et la machine elle-même.
# 10.x et 172.16-31.x n'en font pas partie : ce sont aussi les réseaux de Docker, et une connexion
# relayée par docker-proxy (IPv6 publique, autre conteneur) y apparaîtrait comme « locale ».
# Un réseau local en 10.x ou 172.x s'ajoute dans « IP précises ».
LAN = ("192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16", "::1/128", "fe80::/10")
VPN_DEFAULT = ("100.64.0.0/10",)  # plage CGNAT : Tailscale, NetBird
DOMAIN_RE = re.compile(r"^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
PROXY_HEADERS = ("X-Forwarded-For", "X-Real-Ip", "Forwarded")
MAX_ITEMS = 50


def _nets(items):
    out = []
    for part in items or ():
        try:
            out.append(ipaddress.ip_network(str(part).strip(), strict=False))
        except ValueError:
            pass
    return out


_LAN = _nets(LAN)


def _env_raw():
    return [p.strip() for p in os.environ.get("HELMSHELL_ALLOWED_NETWORKS", "").split(",") if p.strip()]


ENV_NETS = _nets(_env_raw())


def _addr(ip):
    try:
        a = ipaddress.ip_address(str(ip).strip().strip("[]"))
    except ValueError:
        return None
    return getattr(a, "ipv4_mapped", None) or a


def _in(addr, nets):
    return addr is not None and any(addr.version == n.version and addr in n for n in nets)


def active(cfg):
    """Le réglage compte-t-il ? (au moins une porte ouverte)"""
    return bool(cfg) and bool(cfg.get("lan") or cfg.get("vpn") or cfg.get("domain") or cfg.get("ips"))


def current():
    """Réglage en vigueur, ou None si c'est la variable d'environnement (ou rien) qui s'applique."""
    if os.environ.get("HELMSHELL_ACCESS_RESET") == "1":
        return None
    cfg = config.get("access") or {}
    return cfg if active(cfg) else None


def _host(headers):
    h = (headers.get("Host") or "").strip().lower()
    if h.startswith("["):
        return h.split("]")[0] + "]"
    return h.rsplit(":", 1)[0] if h.count(":") == 1 else h


def _host_ok(host, domains):
    for d in domains or ():
        d = str(d).lower()
        if d.startswith("*.") and host.endswith(d[1:]) and host != d[2:]:
            return True
        if host == d:
            return True
    return False


def evaluate(direct, headers, cfg=Ellipsis):
    """→ dict {allowed, ip (IP retenue), rule, via_proxy}."""
    if cfg is Ellipsis:
        cfg = current()
    if cfg is None:
        if not ENV_NETS:
            return {"allowed": True, "ip": direct, "rule": _("Ouvert à tous"), "via_proxy": False}
        ok = _in(_addr(direct), ENV_NETS)
        return {"allowed": ok, "ip": direct, "via_proxy": False,
                "rule": "HELMSHELL_ALLOWED_NETWORKS" if ok else _("Hors des réseaux de HELMSHELL_ALLOWED_NETWORKS")}
    addr = _addr(direct)
    ips = _nets(cfg.get("ips"))
    proxies = _nets(cfg.get("trusted_proxies"))
    proxied = any(headers.get(h) for h in PROXY_HEADERS)
    # Par le domaine : seulement depuis un proxy de confiance, avec un nom d'hôte attendu
    if cfg.get("domain") and proxies and _in(addr, proxies):
        real = direct
        hops = [h.strip() for h in (headers.get("X-Forwarded-For") or "").split(",") if h.strip()]
        for hop in reversed(hops):  # dernier saut qui n'est pas un de nos proxies
            if not _in(_addr(hop), proxies):
                real = hop
                break
        if not hops and headers.get("X-Real-Ip"):
            real = headers.get("X-Real-Ip").strip()
        if not _host_ok(_host(headers), cfg.get("domains")):
            return {"allowed": False, "ip": real, "via_proxy": True, "rule": _("Nom de domaine non autorisé")}
        if ips:
            ok = _in(_addr(real), ips)
            return {"allowed": ok, "ip": real, "via_proxy": True,
                    "rule": _("Domaine, IP autorisée") if ok else _("Domaine, mais IP non autorisée")}
        return {"allowed": True, "ip": real, "via_proxy": True, "rule": _("Domaine")}
    # Accès direct. Une requête relayée par un proxy non approuvé n'est pas « locale » :
    # derrière Traefik, l'IP vue serait celle du conteneur (réseau privé Docker).
    if proxied:
        return {"allowed": False, "ip": direct, "via_proxy": False, "rule": _("Relayée par un proxy non approuvé")}
    if cfg.get("lan") and _in(addr, _LAN):
        return {"allowed": True, "ip": direct, "via_proxy": False, "rule": _("Réseau local")}
    if cfg.get("vpn") and _in(addr, _nets(cfg.get("vpn_cidrs") or VPN_DEFAULT)):
        return {"allowed": True, "ip": direct, "via_proxy": False, "rule": "VPN"}
    if _in(addr, ips):
        return {"allowed": True, "ip": direct, "via_proxy": False, "rule": _("IP autorisée")}
    return {"allowed": False, "ip": direct, "via_proxy": False, "rule": _("Aucune règle ne correspond")}


def _clean_list(values, what, check):
    if values is None:
        return []
    if isinstance(values, str):
        values = re.split(r"[\s,]+", values)
    if not isinstance(values, list):
        raise ApiError(_("{what} : liste attendue", what=what))
    out = []
    for v in values:
        v = str(v).strip().lower()
        if not v:
            continue
        if not check(v):
            raise ApiError(_("{what} : « {value} » n'est pas valable", what=what, value=v))
        if v not in out:
            out.append(v)
    if len(out) > MAX_ITEMS:
        raise ApiError(_("{what} : {n} entrées au plus", what=what, n=MAX_ITEMS))
    return out


def _is_net(v):
    try:
        ipaddress.ip_network(v, strict=False)
        return True
    except ValueError:
        return False


def clean(data):
    """Valide le réglage envoyé par la page Sécurité."""
    if not isinstance(data, dict):
        raise ApiError(_("Réglage d'accès invalide"))
    cfg = {
        "lan": bool(data.get("lan")),
        "vpn": bool(data.get("vpn")),
        "vpn_cidrs": _clean_list(data.get("vpn_cidrs"), _("Réseaux VPN"), _is_net),
        "domain": bool(data.get("domain")),
        "domains": _clean_list(data.get("domains"), _("Domaines"), lambda v: bool(DOMAIN_RE.match(v))),
        "trusted_proxies": _clean_list(data.get("trusted_proxies"), _("Proxies de confiance"), _is_net),
        "ips": _clean_list(data.get("ips"), _("IP autorisées"), _is_net),
    }
    if cfg["domain"] and not cfg["domains"]:
        raise ApiError(_("Accès par domaine : indique au moins un nom de domaine"))
    if cfg["domain"] and not cfg["trusted_proxies"]:
        raise ApiError(_("Accès par domaine : indique le proxy de confiance (ex. le réseau Docker de Traefik)"))
    return cfg


# Noms d'hôte acceptés dans l'en-tête Host (contre le « DNS rebinding » : une page piégée qui fait pointer
# son propre nom de domaine vers l'adresse de Helmshell). Une adresse IP, un nom local ou de VPN, le domaine
# de Helmshell et ceux déclarés dans l'accès réseau passent ; un nom de domaine inconnu reçoit une erreur 421.
LOCAL_SUFFIXES = (".local", ".lan", ".home", ".home.arpa", ".internal", ".localdomain", ".netbird.cloud",
                  ".netbird.selfhosted", ".ts.net")


def host_allowed(headers):
    host = _host(headers).strip("[]")
    if not host or os.environ.get("HELMSHELL_ACCESS_RESET") == "1":
        return True
    if _addr(host) is not None or "." not in host or host == "localhost" or host.endswith(LOCAL_SUFFIXES):
        return True
    extra = {h.strip().lower() for h in os.environ.get("HELMSHELL_ALLOWED_HOSTS", "").split(",") if h.strip()}
    url = (config.get("public_url") or "").lower()
    if url:
        from urllib.parse import urlsplit
        extra.add(urlsplit(url).hostname or "")
    cfg = config.get("access") or {}
    return host in extra or _host_ok(host, cfg.get("domains"))


def secure_proxy(headers, ev):
    """Le cookie peut-il être marqué Secure ? (https annoncé par un proxy qu'on accepte)"""
    if current() is None:
        return headers.get("X-Forwarded-Proto") == "https"
    return ev.get("via_proxy") and headers.get("X-Forwarded-Proto") == "https"


def summary():
    return {"env": _env_raw(), "reset": os.environ.get("HELMSHELL_ACCESS_RESET") == "1",
            "lan": list(LAN), "vpn_default": list(VPN_DEFAULT)}
