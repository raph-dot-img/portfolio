// Choix du thème : terminal ambre (par défaut) ou Windows 95.
//
// Chaque page charge les deux feuilles : terminal.css active, style.css
// (Windows 95) en media="not all", donc téléchargée mais sans effet. Ce
// script est chargé dans le <head>, juste après elles : il applique le thème
// mémorisé avant le premier affichage, sans flash. Sans JavaScript, le thème
// terminal reste seul et le bouton de bascule n'apparaît pas.
//
// Le choix est gardé dans le localStorage du navigateur ; il n'est jamais
// envoyé au serveur (voir la politique de confidentialité).
(() => {
  const CLEF = "theme";
  const PAR_DEFAUT = "terminal";
  const COULEURS = { terminal: "#0c0903", win95: "#008080" };

  const TEXTES = {
    fr: { terminal: "Passer au thème Windows 95", win95: "Passer au thème terminal" },
    en: { terminal: "Switch to the Windows 95 theme", win95: "Switch to the terminal theme" },
  }[document.documentElement.lang === "en" ? "en" : "fr"];

  // Navigation privée, stockage bloqué... : le choix vaut alors pour la page.
  const lire = () => {
    try {
      const valeur = localStorage.getItem(CLEF);
      return Object.hasOwn(COULEURS, valeur) ? valeur : PAR_DEFAUT;
    } catch {
      return PAR_DEFAUT;
    }
  };

  const ecrire = (theme) => {
    try {
      localStorage.setItem(CLEF, theme);
    } catch {
      // Rien à faire : la bascule marche quand même jusqu'au prochain chargement.
    }
  };

  let actuel = lire();
  let bouton = null;

  const appliquer = (theme) => {
    actuel = theme;
    document.querySelectorAll("link[data-theme]").forEach((feuille) => {
      feuille.media = feuille.dataset.theme === theme ? "all" : "not all";
    });
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COULEURS[theme]);
    if (bouton) bouton.textContent = TEXTES[theme];
  };

  appliquer(actuel);

  // Bouton de bascule, dans le pied de page de chaque page qui en a un
  document.addEventListener("DOMContentLoaded", () => {
    const pied = document.querySelector("footer");
    if (!pied) return;

    const ligne = document.createElement("p");
    ligne.className = "choix-theme";
    bouton = document.createElement("button");
    bouton.type = "button";
    bouton.textContent = TEXTES[actuel];
    bouton.addEventListener("click", () => {
      const suivant = actuel === "terminal" ? "win95" : "terminal";
      appliquer(suivant);
      ecrire(suivant);
    });

    ligne.append(bouton);
    pied.insertBefore(ligne, pied.querySelector(".mention-ia"));
  });

  // Un changement fait dans un autre onglet s'applique ici aussi
  window.addEventListener("storage", (e) => {
    if (e.key === CLEF && Object.hasOwn(COULEURS, e.newValue ?? "")) appliquer(e.newValue);
  });
})();
