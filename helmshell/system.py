"""Mesures du serveur (CPU, mémoire, disque) lues dans /proc."""
import json
import os
import shutil
import socket
import threading
import time
from collections import deque

_cpu = {"pct": 0.0}
HISTORY_DAYS = 30
HISTORY_POINTS = HISTORY_DAYS * 24 * 60  # une mesure par minute pendant 30 jours
_history = deque(maxlen=HISTORY_POINTS)
_hist_lock = threading.Lock()


def _history_file():
    from . import config
    return config.DATA_DIR / "metriques.json"


def _load_history():
    try:
        points = json.loads(_history_file().read_text())
        cutoff = time.time() - HISTORY_DAYS * 86400
        with _hist_lock:
            _history.extend(p for p in points if p[0] > cutoff)
    except (OSError, ValueError, TypeError):
        pass


def _save_history():
    try:
        with _hist_lock:
            data = list(_history)
        f = _history_file()
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(data))
        os.replace(tmp, f)
    except OSError:
        pass


def history():
    with _hist_lock:
        return list(_history)


def _disk_pct():
    try:
        from . import projects
        d = shutil.disk_usage(projects.root())
        return round(100 * d.used / d.total, 1)
    except Exception:  # noqa: BLE001 - mesure facultative, ne doit jamais bloquer l'échantillonneur
        return None


def metrics(hours=24, buckets=180):
    """Moyennes de la période : courbe regroupée en `buckets` points, résumé et moyennes par heure.

    Points d'origine : [t, cpu, mem, disque?] (le disque n'existe pas dans les anciennes mesures).
    """
    hours = max(1, min(int(hours or 24), HISTORY_DAYS * 24))
    buckets = max(10, min(int(buckets or 180), 600))
    now = time.time()
    t0 = now - hours * 3600
    pts = [p for p in history() if p[0] >= t0]
    width = hours * 3600 / buckets

    def agg(group):
        cpu = [p[1] for p in group]
        mem = [p[2] for p in group]
        disk = [p[3] for p in group if len(p) > 3 and p[3] is not None]
        return {"cpu": round(sum(cpu) / len(cpu), 1), "cpu_max": max(cpu),
                "mem": round(sum(mem) / len(mem), 1), "mem_max": max(mem),
                "disk": round(sum(disk) / len(disk), 1) if disk else None}

    curve = {}
    for p in pts:
        curve.setdefault(int((p[0] - t0) // width), []).append(p)
    series = []
    for i in sorted(curve):
        a = agg(curve[i])
        series.append([round(t0 + (i + 0.5) * width), a["cpu"], a["mem"], a["disk"], a["cpu_max"], a["mem_max"]])
    # Tableau : moyennes par heure jusqu'à 7 jours, par jour au-delà (14 et 30 jours)
    per = "day" if hours > 168 else "hour"
    hourly = {}
    for p in pts:
        if per == "day":
            lt = time.localtime(p[0])
            key = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)))
        else:
            key = int(p[0] // 3600) * 3600
        hourly.setdefault(key, []).append(p)
    per_hour = [{"t": h, "n": len(g), **agg(g)} for h, g in sorted(hourly.items(), reverse=True)]
    return {"hours": hours, "per": per, "points": series, "hourly": per_hour,
            "summary": ({"n": len(pts), "from": pts[0][0], **agg(pts)} if pts else None)}


def _read_cpu():
    with open("/proc/stat") as f:
        parts = [int(x) for x in f.readline().split()[1:]]
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    return idle, sum(parts)


def _sampler():
    _load_history()
    prev = _read_cpu()
    acc, n, minute, saved = 0.0, 0, int(time.time() // 60), time.time()
    while True:
        time.sleep(2)
        cur = _read_cpu()
        d_idle, d_total = cur[0] - prev[0], cur[1] - prev[1]
        if d_total > 0:
            _cpu["pct"] = round(100 * (1 - d_idle / d_total), 1)
            acc += _cpu["pct"]
            n += 1
        prev = cur
        now_min = int(time.time() // 60)
        if now_min != minute and n:
            try:
                total, used = meminfo()
                mem = round(100 * used / total, 1)
            except (OSError, KeyError, ZeroDivisionError):
                mem = 0
            with _hist_lock:
                _history.append([minute * 60, round(acc / n, 1), mem, _disk_pct()])
            acc, n, minute = 0.0, 0, now_min
            if time.time() - saved > 600:
                _save_history()
                saved = time.time()


threading.Thread(target=_sampler, daemon=True).start()


def meminfo():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":", 1)
            info[k] = int(v.split()[0]) * 1024
    return info["MemTotal"], info["MemTotal"] - info.get("MemAvailable", info.get("MemFree", 0))


def uptime():
    with open("/proc/uptime") as f:
        return float(f.read().split()[0])


def os_name():
    try:
        with open("/etc/os-release") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return "Linux"


def stats(projects_root):
    total, used = meminfo()
    disk = shutil.disk_usage(projects_root)
    return {
        "hostname": os.environ.get("HELMSHELL_HOSTNAME") or socket.gethostname(),
        "os": os_name(),
        "cpu": _cpu["pct"],
        "cores": os.cpu_count(),
        "load": round(os.getloadavg()[0], 2),
        "mem_total": total,
        "mem_used": used,
        "disk_total": disk.total,
        "disk_used": disk.used,
        "uptime": uptime(),
    }
