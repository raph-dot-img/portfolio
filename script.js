// Le site existe en français (racine) et en anglais (/en/). Un seul script
// pour les deux : les textes visibles sont choisis d'après l'attribut lang
// de la page, le reste du comportement est identique.
const LANGUE = document.documentElement.lang === "en" ? "en" : "fr";

const TEXTES = {
  fr: {
    console: "Qu'est-ce que tu fais là toi ? Ouste, rien à voir ici.",
    envoiEnCours: "Envoi en cours...",
    envoye: "Message envoyé, merci. Je réponds dès que possible.",
    echec: "L'envoi a échoué. Vous pouvez m'écrire directement par e-mail.",
    horsLigne: "Envoi impossible, vérifiez votre connexion.",
    legendePluie: "Échap pour revenir au monde réel",
  },
  en: {
    console: "What are you doing in here? Off you go, nothing to see.",
    envoiEnCours: "Sending...",
    envoye: "Message sent, thank you. I will reply as soon as I can.",
    echec: "Sending failed. You can also write to me directly by e-mail.",
    horsLigne: "Could not send, please check your connection.",
    legendePluie: "Esc to go back to the real world",
  },
}[LANGUE];

// Petit mot pour les curieux qui ouvrent les outils de développement.
console.log(`%c${TEXTES.console}`, "color:#1db954;font:600 14px monospace");

// Envoi du formulaire vers Formspree en AJAX, pour rester sur la page.
// Le formulaire n'existe que sur l'accueil : sans cette garde, ce script
// planterait sur les autres pages et l'easter egg plus bas ne partirait pas.
const form = document.getElementById("contact-form");

if (form) {
  const status = document.getElementById("form-status");
  const bouton = form.querySelector("button");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    bouton.disabled = true;
    status.className = "";
    status.textContent = TEXTES.envoiEnCours;

    try {
      const reponse = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });

      if (reponse.ok) {
        form.reset();
        status.className = "ok";
        status.textContent = TEXTES.envoye;
      } else {
        status.className = "erreur";
        status.textContent = TEXTES.echec;
      }
    } catch {
      status.className = "erreur";
      status.textContent = TEXTES.horsLigne;
    } finally {
      bouton.disabled = false;
    }
  });
}

// --- Thème Aero : horloge de la barre des tâches ---
// Purement décorative, comme la zone de notification de Windows 7 : elle est
// masquée aux lecteurs d'écran.
const barreDesTaches = document.querySelector(".topbar");

if (barreDesTaches) {
  const LOCALE = LANGUE === "en" ? "en-GB" : "fr-FR";
  const horloge = document.createElement("div");
  const heure = document.createElement("span");
  const date = document.createElement("span");
  horloge.className = "horloge";
  horloge.setAttribute("aria-hidden", "true");
  horloge.append(heure, date);
  barreDesTaches.append(horloge);

  const mettreAJourHorloge = () => {
    const maintenant = new Date();
    heure.textContent = maintenant.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
    date.textContent = maintenant.toLocaleDateString(LOCALE);
  };

  mettreAJourHorloge();
  setInterval(mettreAJourHorloge, 10000);
}

// --- Thème Aero : fenêtre au premier plan ---
// La section qui passe au milieu de l'écran devient la fenêtre active (cadre
// plus vif) et son bouton s'allume dans la barre des tâches. Sans script,
// toutes les fenêtres gardent l'aspect actif.
const sections = document.querySelectorAll("main > section");

if (sections.length > 1 && "IntersectionObserver" in window) {
  const liensBarre = document.querySelectorAll(".topbar nav a[href^='#']");
  document.body.classList.add("fenetres-actives");

  const observateur = new IntersectionObserver((entrees) => {
    entrees.forEach((entree) => {
      if (!entree.isIntersecting) return;

      sections.forEach((s) => s.classList.toggle("premier-plan", s === entree.target));
      liensBarre.forEach((lien) => {
        if (lien.hash === `#${entree.target.id}`) lien.setAttribute("aria-current", "location");
        else lien.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });

  sections.forEach((s) => observateur.observe(s));
}

// --- Easter egg : pluie « Matrix » déclenchée par le code Konami ---
// Rien n'est ajouté au DOM avant le déclenchement, et l'effet est purement
// décoratif : il est masqué aux lecteurs d'écran et n'intercepte pas les clics.

const CODE_KONAMI = [
  "arrowup", "arrowup", "arrowdown", "arrowdown",
  "arrowleft", "arrowright", "arrowleft", "arrowright",
  "b", "a",
];

const CARACTERES = "アイウエオカキクケコサシスセソタチツテトナニヌネノabcdef0123456789$#*+=<>/\\";

let saisie = [];
let pluie = null;

document.addEventListener("keydown", (e) => {
  // Pendant la saisie du formulaire, les touches appartiennent au champ.
  if (e.target.closest("input, textarea")) return;

  if (e.key === "Escape" && pluie) {
    arreterPluie();
    return;
  }

  saisie.push(e.key.toLowerCase());
  if (saisie.length > CODE_KONAMI.length) saisie.shift();

  if (saisie.length === CODE_KONAMI.length && CODE_KONAMI.every((t, i) => saisie[i] === t)) {
    saisie = [];
    if (pluie) arreterPluie();
    else demarrerPluie();
  }
});

function demarrerPluie() {
  const canvas = document.createElement("canvas");
  canvas.className = "pluie-matrix";
  canvas.setAttribute("aria-hidden", "true");

  const legende = document.createElement("p");
  legende.className = "pluie-legende";
  legende.setAttribute("aria-hidden", "true");
  legende.textContent = TEXTES.legendePluie;

  document.body.append(canvas, legende);
  document.body.classList.add("mode-matrix");

  const ctx = canvas.getContext("2d");
  const corps = 16;
  let colonnes = [];
  let largeur = 0;
  let hauteur = 0;

  // Le canvas est dimensionné en pixels physiques, sinon le rendu est flou
  // sur les écrans à haute densité.
  function redimensionner() {
    const ratio = window.devicePixelRatio || 1;
    largeur = window.innerWidth;
    hauteur = window.innerHeight;
    canvas.width = largeur * ratio;
    canvas.height = hauteur * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.font = `${corps}px monospace`;
    ctx.textBaseline = "top";

    const nb = Math.ceil(largeur / corps);
    // Chaque colonne garde sa position : un redimensionnement ne remet pas
    // toute la pluie à zéro, il ajoute ou retire des colonnes au bord.
    colonnes = Array.from({ length: nb }, (_, i) => colonnes[i] ?? Math.random() * -50);
  }

  function caractere() {
    return CARACTERES[Math.floor(Math.random() * CARACTERES.length)];
  }

  function dessiner(effacer) {
    if (effacer) {
      // Voile translucide plutôt qu'un effacement complet : c'est lui qui
      // laisse la traînée derrière chaque goutte.
      ctx.fillStyle = "rgba(0, 0, 0, 0.07)";
      ctx.fillRect(0, 0, largeur, hauteur);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, largeur, hauteur);
    }

    colonnes.forEach((y, i) => {
      const x = i * corps;

      if (effacer) {
        ctx.fillStyle = "#c8ffd4";
        ctx.fillText(caractere(), x, y * corps);
        ctx.fillStyle = "#1db954";
        ctx.fillText(caractere(), x, (y - 1) * corps);
      } else {
        // Image fixe : une colonne de caractères, sans animation.
        ctx.fillStyle = "#1db954";
        for (let j = 0; j < hauteur / corps; j++) {
          if (Math.random() < 0.35) ctx.fillText(caractere(), x, j * corps);
        }
      }

      colonnes[i] = y * corps > hauteur && Math.random() > 0.975 ? 0 : y + 1;
    });
  }

  redimensionner();
  window.addEventListener("resize", redimensionner);

  // prefers-reduced-motion : on garde le clin d'œil, sans le mouvement.
  const sansAnimation = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let image = null;
  let dernier = 0;

  if (sansAnimation) {
    dessiner(false);
  } else {
    const boucle = (temps) => {
      // ~20 images par seconde : au-delà l'effet perd son côté saccadé
      // et consomme du CPU pour rien.
      if (temps - dernier > 50) {
        dessiner(true);
        dernier = temps;
      }
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
  }

  canvas.addEventListener("click", arreterPluie);

  pluie = {
    arreter() {
      if (image) cancelAnimationFrame(image);
      window.removeEventListener("resize", redimensionner);
      canvas.remove();
      legende.remove();
      document.body.classList.remove("mode-matrix");
    },
  };
}

function arreterPluie() {
  pluie.arreter();
  pluie = null;
}
