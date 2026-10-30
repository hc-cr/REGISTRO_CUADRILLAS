// Registro del service worker + aviso discreto para instalar la app.
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  var instalada = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (instalada) return;

  var KEY = "pwaAvisoHasta";
  try { if (Date.now() < (Number(localStorage.getItem(KEY)) || 0)) return; } catch (e) {}

  var diferido = null, barra = null;

  function posponer() {
    try { localStorage.setItem(KEY, String(Date.now() + 14 * 86400000)); } catch (e) {}
    if (barra) { barra.remove(); barra = null; }
  }

  function mostrar(texto, conBoton) {
    if (barra) return;
    barra = document.createElement("div");
    barra.setAttribute("role", "region");
    barra.setAttribute("aria-label", "Instalar aplicación");
    barra.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between;" +
      "margin:12px 16px 0;padding:10px 14px;border-radius:12px;background:#eaf1ff;border:1px solid #9db9f3;color:#101828;font:14px/1.4 system-ui,sans-serif;";
    var t = document.createElement("span");
    t.textContent = texto;
    t.style.cssText = "flex:1;min-width:180px;";
    barra.appendChild(t);

    var acc = document.createElement("span");
    acc.style.cssText = "display:flex;gap:6px;";
    if (conBoton) {
      var ok = document.createElement("button");
      ok.type = "button"; ok.textContent = "Instalar";
      ok.style.cssText = "height:36px;padding:0 14px;border-radius:8px;border:0;background:#0f5bd8;color:#fff;font-weight:600;cursor:pointer;";
      ok.onclick = function () {
        if (!diferido) return;
        diferido.prompt();
        diferido.userChoice.finally(function () { diferido = null; if (barra) { barra.remove(); barra = null; } });
      };
      acc.appendChild(ok);
    }
    var no = document.createElement("button");
    no.type = "button"; no.textContent = "Ahora no";
    no.style.cssText = "height:36px;padding:0 10px;border-radius:8px;border:0;background:transparent;color:#0f5bd8;font-weight:600;cursor:pointer;";
    no.onclick = posponer;
    acc.appendChild(no);
    barra.appendChild(acc);

    var cab = document.querySelector("header.bar, header");
    if (cab && cab.parentNode) cab.parentNode.insertBefore(barra, cab.nextSibling);
    else document.body.insertBefore(barra, document.body.firstChild);
  }

  // Android / Chrome: el navegador ofrece instalar
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); diferido = e;
    mostrar("Instala «Registro Cuadrillas» en tu celular para abrirla como una app.", true);
  });
  window.addEventListener("appinstalled", function () { posponer(); });

  // iPhone / iPad (Safari): no hay botón automático, se explica el paso
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (ios) mostrar("Para instalar la app: toca el botón Compartir y elige «Añadir a pantalla de inicio».", false);
})();
