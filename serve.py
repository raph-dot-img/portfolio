#!/usr/bin/env python3
"""Petit serveur de développement qui sert les pages d'erreur personnalisées.

Le module http.server de base renvoie ses propres pages d'erreur, ce qui empêche
de tester celles du dossier erreurs/. Ce script les branche à la place.

Usage : python3 serve.py [port]
"""

import re
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

RACINE = Path(__file__).resolve().parent
DOSSIER_ERREURS = RACINE / "erreurs"
DOSSIER_ERREURS_EN = RACINE / "en" / "errors"

# Mêmes chemins que les blocs « scanners » de nginx/default.conf : les deux
# listes doivent rester identiques, sinon l'easter egg ne se voit qu'en Docker.
# Le préfixe /en/ est optionnel : /.env et /en/.env valent tous les deux 418.
# « wp » couvre tous les wp-*, la dernière entrée tout fichier .php/.asp/.jsp/.cgi.
CHEMINS_SCANNERS = re.compile(
    r"^/(?:en/)?(?:admin|administrator|cpanel|panel|manage|management|manager|backend|dashboard"
    r"|console|login|setup|install|wp|wordpress|joomla|drupal|typo3|laravel"
    r"|telescope|_profiler|_ignition|vendor|cgi-bin|boaform|hnap1|owa|ecp"
    r"|autodiscover|jenkins|solr|actuator|server-status|server-info|debug|phpmyadmin"
    r"|myadmin|pma|mysql|sql|db|dbadmin|dump|backups?|shell|api|graphql|swagger"
    r"|\.env|\.git|\.svn|\.hg|\.aws|\.ssh|\.docker|\.vscode|\.idea|\.ds_store"
    r"|\.npmrc|\.bash_history|\.htpasswd|\.htaccess|id_rsa|id_ed25519|web\.config"
    r"|config\.(?:json|ya?ml)|database\.yml|docker-compose\.ya?ml|secrets?"
    r"|credentials|elmah\.axd|trace\.axd"
    r"|(?:[^/]+/)*[^/]*\.(?:php\d?|phtml|aspx?|jsp|cgi))(?:[/.-]|$)",
    re.IGNORECASE,
)


# Même principe que les volumes de docker-compose.yml : seuls les fichiers
# destinés au site sont servis. Sans cette liste, le serveur de développement
# exposerait tout le dépôt (docker-compose.yml, CLAUDE.md, nginx/, frp/...),
# ce que Docker ne fait pas. Toute nouvelle page se déclare ici et là-bas.
RACINES_PUBLIQUES = {
    "index.html",
    "googlefcec097abc8fdb0a.html",
    "confidentialite.html",
    "credits.html",
    "style.css",
    "script.js",
    "robots.txt",
    "sitemap.xml",
    ".well-known",
    "assets",
    "erreurs",
    "en",
}


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        chemin = self.path.split("?", 1)[0].split("#", 1)[0]
        if CHEMINS_SCANNERS.match(chemin):
            self.send_error(418)
            return None

        premier = chemin.strip("/").split("/", 1)[0]
        if premier and premier not in RACINES_PUBLIQUES:
            self.send_error(404)
            return None

        return super().send_head()

    def list_directory(self, path):
        """nginx ne liste aucun dossier (« try_files ... =404 ») : idem ici."""
        self.send_error(404)
        return None

    def dossier_erreurs(self):
        """erreurs/ pour le site français, en/errors/ sous /en/."""
        chemin = self.path.split("?", 1)[0].split("#", 1)[0]
        if chemin == "/en" or chemin.startswith("/en/"):
            return DOSSIER_ERREURS_EN
        return DOSSIER_ERREURS

    def send_error(self, code, message=None, explain=None):
        page = self.dossier_erreurs() / f"{code}.html"
        if not page.is_file():
            return super().send_error(code, message, explain)

        corps = page.read_bytes()
        if code == 418:
            # Comme le sub_filter de nginx : l'IP du visiteur, pour le bluff
            # « Cet incident a été signalé ».
            corps = corps.replace(b"IP_DU_CLIENT", self.client_address[0].encode())
        self.send_response(code, message)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corps)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(Handler, directory=str(RACINE))
    serveur = HTTPServer(("127.0.0.1", port), handler)
    print(f"Site disponible sur http://localhost:{port}")
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur.")


if __name__ == "__main__":
    main()
