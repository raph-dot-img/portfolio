# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static portfolio site (Raphaël Canevet, Bac Pro CIEL student), French at the root and English under `/en/`, served by nginx in Docker and exposed publicly through an FRP tunnel. No build step, no framework, no package manager, no tests — plain HTML/CSS/JS edited in place.

## Commands

```sh
# Local development (serves custom error pages, unlike python -m http.server)
python3 serve.py [port]        # default 8080, binds 127.0.0.1

# Production-like run (requires .env: cp .env.example .env, then fill it in)
docker compose up -d
docker compose logs -f frpc    # tunnel status / auth failures
docker compose restart portfolio   # after editing nginx/default.conf
tail -f logs/acces.log         # persistent access log (see below)
```

**Restart the `portfolio` container after almost any content edit.** The site files are bind-mounted individually (`./script.js:/usr/share/nginx/html/script.js:ro`), and a single-file bind mount is resolved to an inode when the container is created. Only edits made *in place* (append, `sed -i` without a new inode) appear live; any tool that rewrites the file — most editors, `Write`/`Edit`, `mv`, `git checkout` — gives it a new inode and the container keeps serving the old content, silently. `docker compose restart portfolio` re-resolves the mounts and is enough. Files inside the mounted directories (`assets/`, `erreurs/`) are not affected, since the whole directory is mounted.

Verify what the container actually serves rather than what is on disk:

```sh
docker exec portfolio grep -c "<un motif de la modification>" /usr/share/nginx/html/script.js
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
```

## Architecture

Request path in production: internet → remote FRP server (terminates HTTPS) → `frpc` container → `portfolio` nginx container (plain HTTP on port 81 with PROXY protocol v2, on the Docker network). nginx never sees TLS, but all canonical URLs and redirects it emits are `https://`. Port 8080 is published on `127.0.0.1` only; public exposure is exclusively via frpc.

- **Client IP comes from PROXY protocol, on port 81 only.** frpc (`transport.proxyProtocolVersion = "v2"`) talks to nginx's `listen 81 proxy_protocol`; `real_ip_header proxy_protocol` trusts the private Docker ranges, so `$remote_addr` (logs included) is the visitor. Port 80 stays plain HTTP for the local `127.0.0.1:8080` mapping, which a PROXY listener would break. If the PROXY address is itself private/loopback (a reverse proxy in front of frps), the `$ip_visiteur` map falls back to the last `X-Forwarded-For` entry, filtered to `[0-9A-Fa-f:.]` so it cannot inject HTML.
- **The 418 pages say "incident reported, client IP: …"** — a bluff, nothing is reported. `IP_DU_CLIENT` in `erreurs/418.html` and `en/errors/418.html` is replaced by `sub_filter` in their own `location =` blocks (`no-store`, since the page differs per visitor), and by `serve.py` locally.

Key consequences to keep in mind:

- **`docker-compose.yml` mounts each site file individually**, not the directory. Adding a new page or top-level asset requires adding a matching volume line *and* an entry in `serve.py`'s `RACINES_PUBLIQUES`, or it 404s in one of the two servers only. This is deliberate: `.env`, `ressources/` and `serve.py` must stay out of the container, and `serve.py` mirrors the same allowlist so the dev server never exposes the rest of the repo.
- **Security headers live in `nginx/securite.conf` and are `include`d, never written once at server level.** nginx drops every inherited `add_header` as soon as a `location` declares one of its own, so any location that sets a header (cache, `X-Robots-Tag`) must `include /etc/nginx/securite.conf` too or it silently serves responses with no CSP and no `nosniff`. The file is mounted at `/etc/nginx/securite.conf`, deliberately outside `conf.d/` — nginx includes that whole directory into the `http` block, where these directives would not apply. The CSP is same-origin except `connect-src`/`form-action`, which allow `https://formspree.io` for the contact form; adding any third-party asset means widening it.
- **The access log is persisted in `logs/acces.log`** (host dir mounted at `/var/log/portfolio`, outside the web root), in addition to stdout. `docker logs` is wiped whenever the container is recreated; this file is not. It is never rotated — it grows by roughly 300 KB/day. Requests to the scanner trap and `robots.txt` are `access_log off`, but a trapped request still shows up as a 418 because the internal redirect to `/erreurs/418.html` is logged.
- **Both containers run `read_only: true` with `cap_drop: ALL`** (plus only the capabilities each entrypoint needs) and `no-new-privileges`. nginx writes only to its `tmpfs` (`/var/cache/nginx`, `/var/run`, `/tmp`) and `./logs`; anything else that needs to be writable must be added as a tmpfs or volume, or the container fails to start.
- **Requests are rate-limited per visitor** (`limit_req` keyed on `$ip_visiteur`, 10 r/s, burst 60, answered with the 429 page) and request bodies are capped at 1 KB, since nothing is ever posted to this server.
- **`frp/frpc.toml` is a Go template**, rendered by the frpc image from container env vars (`{{ .Envs.FRP_* }}`). Secrets live in `.env` (gitignored) and are injected via `docker-compose.yml`, which uses `${VAR:?...}` so a missing value fails the stack loudly. Never hardcode a token or the server address in `frpc.toml`.
- **Error pages in `erreurs/` are `internal;` in nginx** — reachable only via `error_page`, never directly. `serve.py` reimplements `send_error` to serve them so they can be tested locally. Adding a new error code means touching `nginx/default.conf` (an `error_page` line) and `docker-compose.yml` is unaffected since the whole `erreurs/` dir is mounted.
- **`nginx/default.conf` holds two server blocks**: `raphael.canevet.eu` / `contact.canevet.eu` 301 to the canonical `canevet.eu`, which is also the `default_server`. Keep the canonical domain single to avoid duplicate-content indexing.
- **`en/` is the English mirror and is mounted as a whole directory**, so its files are not subject to the
  single-file inode caveat above. Structure: `en/index.html`, `en/privacy.html`, `en/errors/*.html`. The root
  stays French and canonical (`x-default`); each page pairs with its counterpart through `hreflang` links, a
  `sitemap.xml` entry and a discreet `.lien-langue` switch in the footer. Adding a page means adding both
  language versions, or the switch link dead-ends.
- **`nginx/default.conf` carries the `/en/` locations in a deliberate order.** `location /en/` uses a plain
  prefix, *not* `^~`: `^~` would make nginx skip the regex locations and the `/en/` scanner trap would never
  fire. It redefines every `error_page` to `/en/errors/`, and `location ^~ /en/errors/` is `internal;` like
  its French counterpart.
- **The scanner easter egg exists twice**, once per language: `^/(?:…)` returns 418 with the French cat page,
  `^/en/(?:…)` with the English one. The two path lists and `serve.py`'s `CHEMINS_SCANNERS` (which folds both
  into one `^/(?:en/)?…` regex) must stay in sync, or the trap only fires on some of them.
- **`absolute_redirect off;`** is set on the canonical server block so the `/en` → `/en/` directory redirect
  stays relative. nginx only ever sees plain HTTP, so an absolute redirect would downgrade the visitor to
  `http://`. The 301s from the secondary domains are explicit `https://` returns and are unaffected.
- **`script.js` is shared by both languages.** It picks its visible strings from `TEXTES[LANGUE]`, keyed off
  `document.documentElement.lang`. Any new user-facing string in the script needs both entries; identifiers
  and comments stay French as everywhere else.
- **The contact form posts to Formspree** from `script.js` via AJAX so the page is never left. The endpoint is hardcoded in `index.html`'s `form action` (`.env`'s `FORMSPREE_ENDPOINT` is a convenience copy, not consumed by anything at runtime). Status messages are written into `#form-status` with class `ok` / `erreur`.

## Windows 9x theme

The site is styled as a Windows 95 / 98 / 2000 desktop (teal desktop, grey bevelled windows, taskbar).

- **Every decorative image is a file in `assets/win9x/`** (pixel icons, caption buttons, checkboxes, wizard banner, desktop icons). The CSP's `img-src 'self'` rejects `data:` URIs and `style-src 'self'` rejects inline styles, so nothing can be inlined. The 16 x 16 icons are drawn as pixel maps: keep `shape-rendering="crispEdges"` and integer scaling (16 or 32 px) so they stay sharp. `assets/favicon.svg` is the "computer" icon, also used on the Start button.
- **Each `main > section` is a window, and its `h2` is the title bar** (real text). `h2::before` is the per-section icon (selected by section `id`), `h2::after` the caption buttons, `section::after` the resize grip. `.hero` (welcome wizard) and `main.erreur` (message box) have no h2, so their title bar is their own `::before`, with the text set in CSS `content` and a `:lang(en)` override. Any new visible CSS string needs both languages.
- **Bevels are the `--relief*` / `--creux*` / `--enfonce` box-shadow variables**; reuse them rather than borders.
- **`.topbar` is a taskbar fixed at the bottom**; `body` reserves its height with `padding-bottom`. `script.js` turns `.brand` into a Start button with a menu built from the links already on the page, adds the clock, and on pages with several sections sets `fenetres-actives` / `premier-plan` (blue vs grey title bars) and `aria-current` on taskbar links. Without the script the brand stays a label and every window shows as active.
- **Desktop icons are `body::before` at `z-index: -1`**, shown from 1180px wide; `body` must keep no background of its own (the colour is on `html`) or it hides them.
- **5xx error pages carry `body.ecran-bleu`** and render as a blue screen in VT323 (`assets/polices/`, OFL). 4xx pages are message-box dialogs; 418 is `chat.exe`.

## Conventions

- **Code comments, identifiers and CSS custom properties are in French everywhere, including under `en/`** (`--fond`, `--texte-doux`, `RACINE`, `bouton`, `reponse`). Match this when adding code; don't introduce English names.
- **Only the text the visitor reads is translated**: French at the root, English under `/en/`. The French wording is the reference — write it there first, then mirror it.
- CSS is a single hand-written `style.css` using custom properties defined on `:root`; error pages reuse the same stylesheet and the `.topbar` / `.btn` / `.tagline` classes from `index.html`.
- SEO surface must stay consistent across changes: `index.html` carries canonical, OG tags and a JSON-LD `Person` block; new pages need a `sitemap.xml` entry (with `lastmod`) and `noindex` if they are not meant to be found. The CV PDF is downloadable but served with `X-Robots-Tag: noindex`.
- `googlefcec097abc8fdb0a.html` is a Google Search Console verification file — do not rename or delete.
