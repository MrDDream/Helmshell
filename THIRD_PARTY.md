# Third-party components

Helmshell is released under the MIT license (see `LICENSE`). It bundles the following components, each under
its own license; the license texts of the libraries are in `static/vendor/<package>@<version>/`.

## Browser libraries (`static/vendor`, via `tools/vendor.py`)

| Component | Version | License |
| --- | --- | --- |
| [marked](https://github.com/markedjs/marked) | 18.2.1 | MIT |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.18 | Apache 2.0 or MPL 2.0 |
| [CodeMirror 5](https://codemirror.net/5/) | 5.65.21 | MIT |
| [xterm.js](https://xtermjs.org) and addon-fit | 5.5.0 / 0.10.0 | MIT |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 2.0.4 | MIT |

## Appearance style icons (`static/icons.js`, via `tools/fetch_icons.py`)

| Family | Version | License |
| --- | --- | --- |
| [Material Symbols](https://fonts.google.com/icons) (Google) | 0.49.0 | Apache 2.0 |
| [Lucide](https://lucide.dev) | 1.76.0 | ISC |
| [Phosphor Icons](https://phosphoricons.com) | 2.1.1 | MIT |
| [Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons) (Microsoft) | 1.1.347 | MIT |
| [Tabler Icons](https://tabler.io/icons) | 3.52.0 | MIT |

## Fonts

- `static/fonts/SymbolsNerdFontMono-3.3.0.ttf`: [Nerd Fonts](https://www.nerdfonts.com) (MIT; the glyphs
  come from icon sets under free licenses, detailed by the project).
- Roboto Flex, Roboto Mono, Inter and Nunito are loaded from Google Fonts (SIL Open Font License).

## Platform logos (`static/logos/platform`, via `tools/fetch_platform_logos.py`)

| Logo | Source | License |
| --- | --- | --- |
| Apple, Discord, Linux, Telegram | [Simple Icons](https://simpleicons.org) 16.38.0 | CC0 1.0 |
| Android | Simple Icons 16.38.0 | CC BY 3.0: the Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License |
| Windows | [Devicon](https://devicon.dev) 2.18.0 | MIT |
| Web | original Helmshell drawing | MIT (project license) |

Tux, the Linux mascot, was created by Larry Ewing with The GIMP.

## Logos (`static/logos`)

See `static/logos/CREDITS.txt`:

| Logos | Source | License |
| --- | --- | --- |
| Technologies (`tech/`), except those below | [Devicon](https://devicon.dev) 2.16.0 | MIT |
| Technologies android, docker, golang, html5, java, node-js, python, rust, typescript; notification services (gotify, ntfy, discord) | [selfh.st icons](https://selfh.st/icons/) ([repository](https://github.com/selfhst/icons)), © selfh.st | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Avalonia | Avalonia UI | brand logo |
| Codex (`codex.svg`, OpenAI logo) | [Simple Icons](https://simpleicons.org) 15.22.0 (last release that ships it), `fill` added | CC0 1.0 |

The selfh.st icons are reproduced without modifying the drawing; only the way the SVG file is written may
differ from the current version of the original repository (style attributes). They remain under CC BY 4.0,
without warranty, as that license provides. Trademarks (Claude, OpenAI, Codex, GitHub, GitLab, Discord,
Coolify, Dokploy…) remain the property of their owners; their logos are used only to identify them.
OpenAI and Codex are trademarks of OpenAI.
Helmshell is not affiliated with any of them.
