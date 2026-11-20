#!/usr/bin/env python3
"""Vérification statique légère des fichiers JavaScript de Helmshell (pas de node sur le serveur).

Détecte :
- parenthèses, crochets et accolades mal équilibrés, chaînes non fermées ;
- les déclarations let / const / class / function en double dans un même bloc
  (l'erreur « Identifier 'x' has already been declared », qui empêche tout le script de se charger).

    python3 tests/check_js.py static/*.js
"""
import re
import sys

KEYWORDS_BEFORE_REGEX = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
                         "throw", "case", "do", "else", "yield", "await"}
CONTINUATION = set(". ?. ? : , = + - * / % & | ^ < > ! ~ && || ?? == === != !== <= >= += -= *= /= "
                   "=> ( [ { ... ** << >> >>>".split())


class Tok:
    __slots__ = ("kind", "val", "line", "nl")

    def __init__(self, kind, val, line, nl):
        self.kind, self.val, self.line, self.nl = kind, val, line, nl

    def __repr__(self):
        return f"{self.kind}:{self.val}@{self.line}"


PUNCT = sorted(">>>= ... === !== **= <<= >>= >>> ?? ?. => == != <= >= && || ++ -- += -= *= /= %= &= |= ^= "
               "** << >> { } ( ) [ ] ; , < > + - * / % & | ^ ! ~ ? : = . @ #".split(), key=len, reverse=True)


def tokenize(src):
    toks, i, n, line, nl = [], 0, len(src), 1, True
    tmpl = []  # pile : profondeur d'accolades au moment d'entrer dans ${ … }
    depth = 0

    def prev_allows_regex():
        if not toks:
            return True
        t = toks[-1]
        if t.kind in ("num", "str", "tmpl", "regex"):
            return False
        if t.kind == "name":
            return t.val in KEYWORDS_BEFORE_REGEX
        return t.val not in (")", "]", "}", "++", "--")

    def read_template(i):
        """Lit un gabarit à partir de i (après ` ou }) ; renvoie (i, terminé_par_backtick)."""
        nonlocal line
        while i < n:
            c = src[i]
            if c == "\\":
                i += 2
                continue
            if c == "\n":
                line += 1
            if c == "`":
                return i + 1, True
            if c == "$" and i + 1 < n and src[i + 1] == "{":
                return i + 2, False
            i += 1
        raise SyntaxError(f"gabarit ` non fermé (ligne {line})")

    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            nl = True
            i += 1
            continue
        if c in " \t\r\f\v﻿":
            i += 1
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            if j < 0:
                raise SyntaxError(f"commentaire /* non fermé (ligne {line})")
            line += src.count("\n", i, j)
            i = j + 2
            continue
        start_line = line
        if c in "'\"":
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == "\\":
                    j += 1
                elif src[j] == "\n":
                    raise SyntaxError(f"chaîne non fermée (ligne {line})")
                j += 1
            if j >= n:
                raise SyntaxError(f"chaîne non fermée (ligne {line})")
            toks.append(Tok("str", src[i:j + 1], start_line, nl))
            i, nl = j + 1, False
            continue
        if c == "`":
            i, done = read_template(i + 1)
            toks.append(Tok("tmpl", "`", start_line, nl))
            nl = False
            if not done:
                tmpl.append(depth)
            continue
        if c == "}" and tmpl and tmpl[-1] == depth:
            tmpl.pop()
            i, done = read_template(i + 1)
            if not done:
                tmpl.append(depth)
            continue
        if c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit()):
            m = re.compile(r"0[xXoObB][\da-fA-F_]+n?|(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)([eE][+-]?\d+)?n?").match(src, i)
            toks.append(Tok("num", m.group(), start_line, nl))
            i, nl = m.end(), False
            continue
        if c.isalpha() or c in "_$" or ord(c) > 127:
            m = re.compile(r"[\w$\u0080-￿]+").match(src, i)
            toks.append(Tok("name", m.group(), start_line, nl))
            i, nl = m.end(), False
            continue
        if c == "/" and prev_allows_regex():
            j, cls = i + 1, False
            while j < n:
                d = src[j]
                if d == "\\":
                    j += 2
                    continue
                if d == "\n":
                    raise SyntaxError(f"expression régulière non fermée (ligne {line})")
                if d == "[":
                    cls = True
                elif d == "]":
                    cls = False
                elif d == "/" and not cls:
                    break
                j += 1
            j += 1
            while j < n and src[j].isalpha():
                j += 1
            toks.append(Tok("regex", src[i:j], start_line, nl))
            i, nl = j, False
            continue
        for p in PUNCT:
            if src.startswith(p, i):
                break
        else:
            raise SyntaxError(f"caractère inattendu {c!r} (ligne {line})")
        if p == "{":
            depth += 1
        elif p == "}":
            depth -= 1
        toks.append(Tok("punct", p, start_line, nl))
        i, nl = i + len(p), False
    if tmpl:
        raise SyntaxError("gabarit ${ … } non fermé")
    return toks


def check_balance(toks):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for t in toks:
        if t.kind != "punct":
            continue
        if t.val in "([{":
            stack.append(t)
        elif t.val in ")]}":
            if not stack or stack[-1].val != pairs[t.val]:
                opened = f" (ouvert ligne {stack[-1].line} : {stack[-1].val})" if stack else ""
                raise SyntaxError(f"« {t.val} » inattendu ligne {t.line}{opened}")
            stack.pop()
    if stack:
        raise SyntaxError(f"« {stack[-1].val} » ouvert ligne {stack[-1].line} jamais fermé")


def check_redeclarations(toks):
    """Signale les liaisons lexicales déclarées deux fois dans le même bloc."""
    errors = []
    scopes = [{"names": {}, "paren": 0}]
    paren = 0
    i, n = 0, len(toks)

    def declare(name_tok):
        names = scopes[-1]["names"]
        if name_tok.val in names:
            errors.append(f"ligne {name_tok.line} : « {name_tok.val} » déjà déclaré dans ce bloc "
                          f"(ligne {names[name_tok.val]})")
        else:
            names[name_tok.val] = name_tok.line

    def read_pattern(j):
        """Lit un motif de liaison à partir de toks[j] ; renvoie l'indice suivant."""
        t = toks[j]
        if t.kind == "name":
            declare(t)
            return j + 1
        if t.val not in ("{", "["):
            return j + 1
        close = "}" if t.val == "{" else "]"
        j += 1
        while j < n and toks[j].val != close:
            t = toks[j]
            if t.val == ",":
                j += 1
                continue
            if t.val == "...":
                j += 1
                continue
            if close == "}" and t.kind in ("name", "str", "num") and j + 1 < n and toks[j + 1].val == ":":
                j = read_pattern(j + 2)
            elif close == "}" and t.val == "[":  # clé calculée [expr]: motif
                d = 0
                while j < n:
                    d += toks[j].val == "["
                    d -= toks[j].val == "]"
                    j += 1
                    if d == 0:
                        break
                j = read_pattern(j + 1)
            else:
                j = read_pattern(j)
            if j < n and toks[j].val == "=":  # valeur par défaut : sauter l'expression
                d = 0
                j += 1
                while j < n:
                    v = toks[j].val
                    if toks[j].kind == "punct":
                        if v in "([{":
                            d += 1
                        elif v in ")]}":
                            if d == 0:
                                break
                            d -= 1
                        elif v == "," and d == 0:
                            break
                    j += 1
        return j + 1

    in_decl = None  # (taille de la pile de portées, profondeur de parenthèses) d'une déclaration en cours
    while i < n:
        t = toks[i]
        prev = toks[i - 1] if i else None
        if in_decl and len(scopes) == in_decl[0] and paren == in_decl[1]:
            if t.val == ";" and t.kind == "punct":
                in_decl = None
            elif t.val == "," and t.kind == "punct":
                i = read_pattern(i + 1)
                continue
            elif t.val in ("}", ")", "]") and t.kind == "punct":
                in_decl = None
            elif t.nl and prev is not None and prev.val not in CONTINUATION and t.val not in CONTINUATION:
                in_decl = None
        if t.kind == "punct":
            if t.val == "{":
                scopes.append({"names": {}, "paren": paren})
            elif t.val == "}":
                if len(scopes) > 1:
                    scopes.pop()
            elif t.val in "([":
                paren += 1
            elif t.val in ")]":
                paren -= 1
            i += 1
            continue
        if t.kind == "name" and (prev is None or prev.val not in (".", "?.")) and paren == scopes[-1]["paren"]:
            nxt = toks[i + 1] if i + 1 < n else None
            if t.val in ("let", "const") and nxt and (nxt.kind == "name" or nxt.val in ("{", "[")):
                i = read_pattern(i + 1)
                in_decl = (len(scopes), paren)
                continue
            stmt_start = prev is None or prev.val in (";", "{", "}", "export", "default") or (
                prev.val == "async" and (i < 2 or toks[i - 2].val in (";", "{", "}", "export")))
            if t.val in ("class", "function") and stmt_start:
                j = i + 1
                if j < n and toks[j].val == "*":
                    j += 1
                if j < n and toks[j].kind == "name":
                    declare(toks[j])
        i += 1
    return errors


def check_file(path):
    src = open(path, encoding="utf-8").read()
    try:
        toks = tokenize(src)
        check_balance(toks)
    except SyntaxError as e:
        return [str(e)]
    return check_redeclarations(toks)


def main(paths):
    bad = 0
    for p in paths:
        errs = check_file(p)
        for e in errs:
            print(f"{p}: {e}")
        bad += len(errs)
    if bad:
        print(f"{bad} problème(s) JavaScript")
        return 1
    print(f"JavaScript OK ({len(paths)} fichier(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
