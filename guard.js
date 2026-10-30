// Protección contra "clickjacking": si esta página se abre dentro de otra (iframe), se bloquea.
(function () {
  if (window.top !== window.self) {
    try { window.top.location = window.self.location; } catch (e) { /* sin permiso */ }
    document.documentElement.style.display = "none";
  }
})();
