// Applique le thème avant le premier rendu, pour éviter un flash clair la nuit.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("theme");
  } catch (e) {
    // stockage indisponible : on suit le réglage du système
  }
  if (theme !== "jour" && theme !== "nuit") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "nuit" : "jour";
  }
  document.documentElement.dataset.theme = theme;
})();
