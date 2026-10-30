// Misma URL de la web app que usa el formulario (index.html)
var WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz66zCFtkOvCNZQGNHyll7DdS0d-xDw0p3NvZ74UZUggEPPwiaPtZAcgZ58w9BSa4BXsg/exec";

var MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
var DIAS_LARGO = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
var ROLES = ["COORDINADOR","SUPERVISOR","JEFE DE OPERACIONES"];
var CAMPOS_FORM = [
  ["fecha","Fecha en campo","date"], ["sede","Sede de operación"], ["coordinador","Coordinador"],
  ["t1","Técnico 1"], ["t2","Técnico 2"], ["usuario","Usuario sistema"], ["placa","Placa del vehículo"]
];
var HUES = [18, 78, 150, 190, 218, 335];

/* ---------- iconos (un solo juego, trazo uniforme) ---------- */
var ICONS = {
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  down: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m18 15-6-6-6 6"/>',
  edit: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', plus: '<path d="M5 12h14"/><path d="M12 5v14"/>'
};
function ico(n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }

// Marca del producto: una placa de vehículo con dos remaches
var MARK = '<svg class="mark" viewBox="0 0 34 24" aria-hidden="true"><rect x="1" y="1" width="32" height="22" rx="5" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<circle cx="6" cy="12" r="1.6" fill="var(--accent)"/><circle cx="28" cy="12" r="1.6" fill="var(--accent)"/><path d="M11 9h12M11 15h8" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/></svg>';

var state = { token: "", user: null, year: 0, month: 0, today: "", rows: [], estados: [], sede: "", selected: "",
  openCards: {}, marking: "", editing: null, history: {}, maestros: null, busy: false, loaded: false, error: "", updated: null,
  animate: false, view: "agenda", users: [], editUser: null };

function $(id) { return document.getElementById(id); }
function pad(n) { return ("0" + n).slice(-2); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
  return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]; }); }
function tc(s) { return String(s || "").toLowerCase().replace(/(^|[\s\-\/(])([a-záéíóúñü])/g, function(m, a, b) { return a + b.toUpperCase(); })
  .replace(/ (De|Del|La|El|Y|Sin) /g, function(m, w) { return " " + w.toLowerCase() + " "; }); }
function fmtFecha(iso) { var p = iso.split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }
function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(function() { t.classList.remove("show"); }, 2800); }
function msg(err) { return String((err && err.message) || err).replace(/^Error:\s*/, ""); }
function hue(name) { var h = 0, s = String(name); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return HUES[h % HUES.length]; }
function initials(name) { var w = String(name).trim().split(/\s+/); return ((w[0] || "")[0] || "").toUpperCase() + ((w[1] || "")[0] || "").toUpperCase(); }

/* ---------- comunicación con Apps Script ---------- */
// POST text/plain: evita el preflight de CORS, igual que el formulario
function callServer(fn, args) {
  return fetch(WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "panel", fn: fn, args: args || [] })
  })
  .then(function(r) { if (!r.ok) throw new Error("Error de conexión (" + r.status + ")"); return r.json(); })
  .then(function(res) { if (!res.ok) throw new Error(res.error || "Error del servidor"); return res.data; });
}

// Añade siempre el token como primer argumento
function api(fn, args, ok, fail) {
  callServer(fn, [state.token].concat(args || [])).then(ok).catch(function(err) {
    if (/SESION/.test(msg(err))) { logout("Tu sesión venció. Ingresa de nuevo."); return; }
    if (fail) fail(err); else toast(msg(err));
  });
}

/* ---------- sesión ---------- */
function saveToken(t) { try { t ? localStorage.setItem("panelToken", t) : localStorage.removeItem("panelToken"); } catch (e) {} }
function readToken() { try { return localStorage.getItem("panelToken") || ""; } catch (e) { return ""; } }

function showLogin(text) {
  $("appView").classList.add("hidden"); $("loginView").classList.remove("hidden");
  $("loginErr").textContent = text || ""; $("loginPin").value = "";
}

function logout(text) {
  state.token = ""; state.user = null; saveToken("");
  state.rows = []; state.editing = null; state.history = {}; state.maestros = null; state.loaded = false; state.year = 0;
  showLogin(text);
}

function enterApp(user) {
  state.user = user;
  $("loginView").classList.add("hidden"); $("appView").classList.remove("hidden");
  $("whoName").textContent = tc(user.nombre);
  $("whoRol").textContent = tc(user.rol) + (user.rol === "COORDINADOR" && user.sede ? " · " + tc(user.sede) : "");
  $("btnUsuarios").classList.toggle("hidden", !user.puedeUsuarios);
  $("btnConfig").classList.toggle("hidden", !user.puedeUsuarios);
  setView("agenda");
  load();
}

$("loginBtn").onclick = doLogin;
$("loginPin").addEventListener("keydown", function(e) { if (e.key === "Enter") doLogin(); });
$("loginDni").addEventListener("keydown", function(e) { if (e.key === "Enter") $("loginPin").focus(); });
function doLogin() {
  var dni = $("loginDni").value.trim(), pin = $("loginPin").value.trim();
  if (!dni || !pin) { $("loginErr").textContent = "Ingresa DNI y PIN."; return; }
  $("loginBtn").disabled = true; $("loginErr").textContent = "";
  callServer("login", [dni, pin])
    .then(function(res) { $("loginBtn").disabled = false; state.token = res.token; saveToken(res.token); enterApp(res); })
    .catch(function(err) { $("loginBtn").disabled = false; $("loginErr").textContent = msg(err); });
}
$("btnSalir").onclick = function() { logout(""); };

/* ---------- datos ---------- */
function load(silent) {
  if (state.busy) return;
  if (!state.year) {
    var n = new Date(); state.year = n.getFullYear(); state.month = n.getMonth() + 1;
    state.selected = state.year + "-" + pad(state.month) + "-" + pad(n.getDate());
  }
  state.busy = true; state.error = ""; $("refresh").classList.add("spin");
  var y = state.year, m = state.month;
  api("getPanelData", [y, m], function(res) {
    state.busy = false; $("refresh").classList.remove("spin");
    if (y !== state.year || m !== state.month) return load(true);
    state.rows = res.rows; state.today = res.today; state.estados = res.estados; state.user = res.user;
    state.loaded = true; state.updated = new Date();
    $("stamp").textContent = "Actualizado " + pad(state.updated.getHours()) + ":" + pad(state.updated.getMinutes());
    fillSedes(); if (state.view === "agenda") render();
  }, function(err) {
    state.busy = false; $("refresh").classList.remove("spin");
    if (!silent || !state.loaded) { state.error = msg(err); if (state.view === "agenda") render(); }
  });
}

function fillSedes() {
  var sel = $("sedeFilter"), cur = state.sede;
  var sedes = Array.from(new Set(state.rows.map(function(r) { return r.sede; }).filter(Boolean))).sort();
  sel.innerHTML = '<option value="">Todas las sedes</option>' +
    sedes.map(function(s) { return '<option value="' + esc(s) + '">' + esc(tc(s)) + '</option>'; }).join("");
  sel.value = sedes.indexOf(cur) >= 0 ? cur : ""; state.sede = sel.value;
  sel.classList.toggle("hidden", !!state.user && state.user.rol === "COORDINADOR");
}

function visibleRows() { return state.rows.filter(function(r) { return !state.sede || r.sede === state.sede; }); }

function render() { renderCalendar(); renderDay(); }

/* ---------- calendario ---------- */
function renderCalendar() {
  $("title").textContent = tc(MESES[state.month - 1]) + " " + state.year;
  var byDay = {};
  visibleRows().forEach(function(r) { byDay[r.fecha] = (byDay[r.fecha] || 0) + 1; });

  var first = new Date(state.year, state.month - 1, 1);
  var lead = (first.getDay() + 6) % 7;                       // semana desde lunes
  var days = new Date(state.year, state.month, 0).getDate();
  var html = "";
  for (var i = 0; i < lead; i++) html += '<div class="cell out"></div>';
  for (var d = 1; d <= days; d++) {
    var key = state.year + "-" + pad(state.month) + "-" + pad(d);
    var dow = new Date(state.year, state.month - 1, d).getDay();
    var c = byDay[key] || 0, dots = "";
    for (var k = 0; k < Math.min(c, 4); k++) dots += "<i></i>";
    html += '<button class="cell' + (c ? " has" : "") + (dow === 0 || dow === 6 ? " wk" : "") + (key === state.today ? " today" : "") + (key === state.selected ? " sel" : "") +
      '" data-day="' + key + '" aria-label="' + d + ' de ' + MESES[state.month - 1] + (c ? ", " + c + " cuadrilla" + (c > 1 ? "s" : "") : "") + '"' +
      (key === state.selected ? ' aria-current="date"' : "") + '><span class="n">' + d + '</span><span class="dots">' + dots + '</span></button>';
  }
  $("grid").innerHTML = html;
  var total = Object.keys(byDay).reduce(function(s, k) { return s + byDay[k]; }, 0);
  $("monthSum").textContent = state.loaded
    ? total + (total === 1 ? " cuadrilla" : " cuadrillas") + " en el mes · " + Object.keys(byDay).length + (Object.keys(byDay).length === 1 ? " día" : " días") + " con registro"
    : "Cargando mes…";
}

/* ---------- detalle del día ---------- */
function personas(r) {
  var p = [["COORDINADOR", "Coordinador", r.coordinador], ["T1", "Técnico 1", r.t1], ["T2", "Técnico 2", r.t2], ["USUARIO", "Usuario sistema", r.usuario]];
  return p.filter(function(x) { return x[2]; });
}
function esRuta(n) { return /^RUTA SIN/.test(n); }
function estadoClass(e) { return e === "ASISTIÓ" ? "ok" : e === "TARDE" ? "warn" : e === "PERMISO" ? "info" : e === "FALTÓ" ? "bad" : ""; }

function dayTitle(key) {
  var p = key.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
  return tc(DIAS_LARGO[d.getDay()]).replace(/^./, function(c) { return c.toUpperCase(); }) + " " + (+p[2]) + " de " + MESES[+p[1] - 1];
}

function skeletonDay() {
  return '<div class="sk" style="height:24px;width:220px"></div><div class="sk" style="height:14px;width:150px;margin-top:10px"></div>' +
    '<div class="cards">' + [1, 2].map(function() {
      return '<div class="sk-card"><div style="display:flex;justify-content:space-between"><div class="sk" style="height:18px;width:120px"></div><div class="sk" style="height:26px;width:90px"></div></div>' +
        [1, 2, 3, 4].map(function() { return '<div style="display:flex;gap:12px;align-items:center"><div class="sk" style="height:32px;width:32px;border-radius:50%"></div><div class="sk" style="height:14px;width:55%"></div></div>'; }).join("") + '</div>';
    }).join("") + '</div>';
}

function renderDay() {
  var v = $("dayView");
  if (state.error && !state.loaded) {
    v.innerHTML = '<div class="errblock"><p>No se pudo cargar los registros. ' + esc(state.error) + '</p><button class="btn" data-act="retry">Reintentar</button></div>';
    return;
  }
  if (!state.loaded) { v.innerHTML = skeletonDay(); return; }

  var list = visibleRows().filter(function(r) { return r.fecha === state.selected; })
    .sort(function(a, b) { return (+a.numero || 0) - (+b.numero || 0); });
  var can = state.user && state.user.puedeAsistencia;

  var people = 0, marked = 0;
  list.forEach(function(r) { personas(r).forEach(function(p) { if (esRuta(p[2])) return; people++; if (r.asistencia && r.asistencia[p[0]] && r.asistencia[p[0]].estado) marked++; }); });

  var cerrado = can && people > 0 && marked === people;
  var h = '<div class="hero"><h2>' + esc(dayTitle(state.selected)) + (state.selected === state.today ? '<span class="pill-hoy">Hoy</span>' : "") + '</h2>';
  if (list.length) {
    h += '<div class="stats"><div class="st"><b>' + list.length + '</b><span>' + (list.length === 1 ? "cuadrilla" : "cuadrillas") + '</span></div>' +
      '<div class="st"><b>' + people + '</b><span>' + (people === 1 ? "persona" : "personas") + '</span></div>' +
      (can ? '<div class="st"><b>' + marked + '/' + people + '</b><span>marcadas</span></div>' : '') + '</div>';
    if (can) h += '<div class="meter' + (cerrado ? " done" : "") + '"><span>' + (cerrado ? "Asistencia completa" : "Asistencia del día") + '</span><span class="bar-t"><i style="width:' + (people ? Math.round(marked / people * 100) : 0) + '%"></i></span></div>';
  } else {
    h += '<p class="vacio">Sin cuadrillas registradas este día.</p>';
  }
  h += '</div>';
  if (state.error) h += '<div class="errblock" style="margin-top:12px"><p>No se pudo actualizar. Última actualización ' + esc($("stamp").textContent.replace("Actualizado ", "")) + '.</p><button class="btn" data-act="retry">Reintentar</button></div>';

  if (!list.length) {
    h += '<div class="empty">No hay cuadrillas registradas el ' + esc(dayTitle(state.selected).toLowerCase()) + '.</div>';
  } else {
    h += '<div class="cards' + (state.animate ? " enter" : "") + '">' + list.map(cardHtml).join("") + '</div>';
  }
  v.innerHTML = h;
  state.animate = false;
}

function personHtml(r, p) {
  var can = state.user && state.user.puedeAsistencia;
  var ruta = esRuta(p[2]);
  var a = (r.asistencia && r.asistencia[p[0]]) || {};
  var av = ruta ? '<span class="av ghost" aria-hidden="true">–</span>'
    : '<span class="av role-' + p[0] + '" aria-hidden="true">' + esc(initials(p[2])) + '</span>';
  var nm = '<span class="nm role-' + p[0] + '"><b' + (ruta ? ' class="muted"' : "") + '>' + esc(ruta ? "Ruta sin técnico 2" : tc(p[2])) + '</b><span>' + p[1] + '</span></span>';
  if (!can || ruta) return '<div class="person">' + av + nm + '</div>';
  var pill = '<span class="pill ' + estadoClass(a.estado) + '">' + (a.estado ? esc(tc(a.estado)) : "Sin marcar") + '</span>';
  var key = r.id + "|" + p[0], open = state.marking === key;
  var h = '<button class="person" data-mark="' + esc(key) + '" aria-expanded="' + open + '">' + av + nm + pill + '</button>';
  if (open) {
    h += '<div class="mark-panel"><div class="chips">' + state.estados.map(function(e) {
      return '<button class="chip' + (a.estado === e ? " on " + estadoClass(e) : "") + '" data-asis="' + esc(e) + '" data-id="' + esc(r.id) + '" data-cargo="' + p[0] + '">' + esc(tc(e)) + '</button>';
    }).join("") + '</div>' +
      '<div class="mark-meta"><span>' + (a.estado && a.por ? "Marcado por " + esc(tc(a.por)) + (a.cuando ? " · " + esc(a.cuando) : "") : "Aún sin marcar") + '</span>' +
      (a.estado ? '<button class="btn text" data-asis="" data-id="' + esc(r.id) + '" data-cargo="' + p[0] + '">Quitar marca</button>' : "") + '</div></div>';
  }
  return h;
}

function cardHtml(r) {
  var editing = state.editing === r.id, show = !!state.openCards[r.id] || editing;
  // Vista cerrada: solo cuadrilla, sede y placa. Al tocar se despliega todo el detalle.
  var h = '<article class="card' + (show ? " open" : "") + '" data-id="' + esc(r.id) + '">' +
    '<button type="button" class="card-top" data-card="' + esc(r.id) + '" aria-expanded="' + show + '">' +
    '<div class="lt"><span class="num">' + ico("users") + '</span><div><h3>Cuadrilla ' + esc(r.numero || "") + '</h3><div class="loc pin">' + ico("pin") + esc(tc(r.sede)) + '</div></div></div>' +
    '<span class="right">' + (r.placa ? '<span class="plate" title="Placa del vehículo">' + esc(r.placa) + '</span>' : '<span class="plate none">Sin placa</span>') +
    '<span class="chev">' + ico("down") + '</span></span></button>';
  if (!show) return h + '</article>';

  h += '<div class="card-body"><div class="roster">' + personas(r).map(function(p) { return personHtml(r, p); }).join("") + '</div>';

  if (editing) {
    h += '<div class="editbox"><div class="fgrid">';
    CAMPOS_FORM.forEach(function(f) {
      var lock = f[0] === "sede" && state.user.rol === "COORDINADOR";
      h += '<div class="field"><label>' + f[1] + '</label>';
      if (f[2] === "date") h += '<input data-key="' + f[0] + '" type="date" value="' + esc(r[f[0]]) + '">';
      else h += '<div class="cb"><input data-key="' + f[0] + '" data-cb="1" type="text" autocomplete="off" value="' + esc(r[f[0]]) + '"' + (lock ? " disabled" : "") + '><div class="cbm"></div></div>';
      h += '</div>';
    });
    h += '</div><div class="actions" style="padding-top:4px"><button class="btn primary" data-act="save" data-id="' + esc(r.id) + '">Guardar cambios</button><button class="btn" data-act="cancel">Cancelar</button></div></div>';
  } else {
    h += '<dl class="detail" style="margin-bottom:0">' +
      '<div class="kv"><dt>Fecha en campo</dt><dd>' + esc(fmtFecha(r.fecha)) + '</dd></div>' +
      '<div class="kv"><dt>Sede de operación</dt><dd>' + esc(tc(r.sede)) + '</dd></div>' +
      '<div class="kv"><dt>Placa</dt><dd class="mono">' + esc(r.placa || "—") + '</dd></div>' +
      '<div class="kv"><dt>Registrado</dt><dd>' + esc(r.registro || "—") + '</dd></div>' +
      (r.limite ? '<div class="kv"><dt>Modificable hasta</dt><dd>' + esc(r.limite) + '</dd></div>' : '') + '</dl>' +
      (r.editable === false ? '<div class="noedit">El plazo de modificación terminó. Solicita el cambio a un supervisor.</div>' : '') +
      '<div class="actions" style="padding-left:16px;padding-right:16px">' +
      (state.user.puedeEditar && r.editable !== false ? '<button class="btn" data-act="edit" data-id="' + esc(r.id) + '">' + ico("edit") + 'Editar</button>' : '') +
      '<button class="btn" data-act="hist" data-id="' + esc(r.id) + '">' + ico("history") + (state.history[r.id] ? "Ocultar historial" : "Historial") + '</button></div>';
    var hist = state.history[r.id];
    if (hist) {
      h += '<div class="hist">' + hist.map(function(x) {
        return '<div class="h"><b>' + esc(tc(x.campo)) + '</b> · <span class="old">' + esc(x.anterior || "—") + '</span> → ' + esc(x.nuevo || "—") +
          '<div class="m">' + esc(tc(x.editor)) + ' · ' + esc(x.cuando) + '</div></div>';
      }).join("") + '<div class="h"><b>Registro inicial</b><div class="m">' + esc(r.registro) + (hist.length ? "" : " · sin modificaciones posteriores") + '</div></div></div>';
    }
  }
  return h + '</div></article>';
}

/* ---------- eventos ---------- */
document.addEventListener("click", function(e) {
  if (state.view !== "agenda") return;
  var chip = e.target.closest("[data-asis]");
  if (chip) return setAsistencia(chip);
  var btn = e.target.closest("[data-act]");
  if (btn) return onAction(btn);
  var mk = e.target.closest("[data-mark]");
  if (mk) { state.marking = state.marking === mk.dataset.mark ? "" : mk.dataset.mark; return renderDay(); }
  var card = e.target.closest("[data-card]");
  if (card) { var id = card.dataset.card; if (state.editing === id) return; state.openCards[id] = !state.openCards[id]; state.marking = ""; return renderDay(); }
  var day = e.target.closest("[data-day]");
  if (day) { state.selected = day.dataset.day; state.marking = ""; state.editing = null; state.animate = true; render(); }
});

function setAsistencia(chip) {
  var id = chip.dataset.id, cargo = chip.dataset.cargo, estado = chip.dataset.asis;
  chip.disabled = true;
  api("setAsistencia", [id, cargo, estado], function(res) {
    var r = state.rows.filter(function(x) { return x.id === id; })[0];
    if (r) {
      r.asistencia = r.asistencia || {};
      if (estado) r.asistencia[cargo] = { estado: estado, por: res.por || state.user.nombre, cuando: res.cuando || "" }; else delete r.asistencia[cargo];
    }
    delete state.history[id]; state.marking = ""; toast(estado ? "Asistencia: " + tc(estado) : "Marca quitada"); renderDay();
  }, function(err) { toast(msg(err)); renderDay(); });
}

function onAction(btn) {
  var id = btn.dataset.id, act = btn.dataset.act;
  if (act === "retry") { state.busy = false; state.error = ""; load(); }
  else if (act === "edit") {
    var go = function() { state.editing = id; renderDay(); };
    if (state.maestros) return go();
    btn.disabled = true;
    api("getMaestros", [], function(m) { state.maestros = m; go(); }, function(err) { btn.disabled = false; toast(msg(err)); });
  }
  else if (act === "cancel") { state.editing = null; renderDay(); }
  else if (act === "hist") {
    if (state.history[id]) { delete state.history[id]; renderDay(); return; }
    btn.disabled = true;
    api("getHistorial", [id], function(h) { state.history[id] = h; renderDay(); }, function(err) { btn.disabled = false; toast(msg(err)); });
  }
  else if (act === "save") {
    var card = btn.closest(".card"), cambios = {};
    card.querySelectorAll("input[data-key]:not([disabled])").forEach(function(i) { cambios[i.dataset.key] = i.value; });
    btn.disabled = true; btn.textContent = "Guardando…";
    api("updateRegistro", [id, cambios], function(res) {
      state.editing = null; delete state.history[id];
      toast(res.cambios ? "Guardado: " + res.cambios + (res.cambios === 1 ? " cambio registrado" : " cambios registrados") : "Sin cambios");
      state.busy = false; load(true);
    }, function(err) { btn.disabled = false; btn.textContent = "Guardar cambios"; toast(msg(err)); });
  }
}

/* ---------- desplegables del modo edición (igual que el formulario) ---------- */
function norm(t) { return String(t || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }

function cargoOk(cargoDB, tipo) {
  var c = norm(cargoDB);
  if (tipo === "COORDINADOR") return c.indexOf("COORDINADOR") >= 0;
  if (tipo === "T1") return c.indexOf("TECNICO 1") >= 0 || c.indexOf("TECNICO1") >= 0 || c.indexOf("T1") >= 0;
  if (tipo === "T2") return c.indexOf("TECNICO 2") >= 0 || c.indexOf("TECNICO2") >= 0 || c.indexOf("T2") >= 0;
  if (tipo === "USUARIO") return c.indexOf("USUARIO") >= 0 ||
    (c.indexOf("COORDINADOR") >= 0 && (c.indexOf("TECNICO 1") >= 0 || c.indexOf("TECNICO1") >= 0));
  return false;
}

function opcionesCampo(key, card) {
  var m = state.maestros || { sedes: [], placas: [], personal: [] };
  if (key === "sede") return m.sedes;
  if (key === "placa") return m.placas;
  var sedeInput = card.querySelector('[data-key="sede"]');
  var sede = norm(sedeInput ? sedeInput.value : "");
  var tipo = { coordinador: "COORDINADOR", t1: "T1", t2: "T2", usuario: "USUARIO" }[key];
  var lista = m.personal.filter(function(p) { return (!sede || norm(p.sede) === sede) && cargoOk(p.cargo, tipo); }).map(function(p) { return p.nombre; });
  if (key === "t2") lista.push("RUTA SIN TÉCNICO 2");
  return Array.from(new Set(lista));
}

function cerrarCombos() { document.querySelectorAll(".cb.open").forEach(function(c) { c.classList.remove("open"); }); }

function pintarCombo(input, todo) {
  var menu = input.closest(".cb").querySelector(".cbm"), q = todo ? "" : norm(input.value);
  var ops = opcionesCampo(input.dataset.key, input.closest(".card")).filter(function(o) { return norm(o).indexOf(q) >= 0; });
  menu.innerHTML = ops.length
    ? ops.map(function(o) { return '<div class="cbi" data-v="' + esc(o) + '">' + esc(o) + '</div>'; }).join("")
    : '<div class="cbn">Sin coincidencias. Se conservará el texto escrito.</div>';
}

function abrirCombo(input) {
  if (input.disabled) return;
  cerrarCombos(); pintarCombo(input, true); input.closest(".cb").classList.add("open");
}

document.addEventListener("focusin", function(e) { if (e.target.matches && e.target.matches("input[data-cb]")) abrirCombo(e.target); });
document.addEventListener("click", function(e) { if (e.target.matches && e.target.matches("input[data-cb]")) abrirCombo(e.target); });
document.addEventListener("input", function(e) {
  if (e.target.matches && e.target.matches("input[data-cb]")) {
    e.target.value = e.target.value.toUpperCase();
    e.target.closest(".cb").classList.add("open"); pintarCombo(e.target);
  }
});

// Selección con control de scroll vs toque (móvil)
var cbMoved = false, cbY = 0;
document.addEventListener("touchstart", function(e) { if (e.target.closest(".cbm")) { cbMoved = false; cbY = e.touches[0].clientY; } }, { passive: true });
document.addEventListener("touchmove", function(e) { if (e.target.closest(".cbm") && Math.abs(e.touches[0].clientY - cbY) > 6) cbMoved = true; }, { passive: true });
document.addEventListener("click", function(e) {
  var item = e.target.closest(".cbi");
  if (item) {
    if (cbMoved) { cbMoved = false; return; }
    var cb = item.closest(".cb");
    cb.querySelector("input").value = item.dataset.v; cb.classList.remove("open");
  } else if (!e.target.closest(".cb")) cerrarCombos();
});

/* ---------- navegación del calendario ---------- */
function shiftMonth(delta) {
  state.month += delta;
  if (state.month < 1) { state.month = 12; state.year--; }
  if (state.month > 12) { state.month = 1; state.year++; }
  var t = state.today.split("-"), esHoy = state.today && +t[0] === state.year && +t[1] === state.month;
  state.selected = esHoy ? state.today : state.year + "-" + pad(state.month) + "-01";
  state.editing = null; state.marking = ""; state.loaded = false; state.rows = []; state.animate = true;
  render(); state.busy = false; load();
}

$("prev").onclick = function() { shiftMonth(-1); };
$("next").onclick = function() { shiftMonth(1); };
$("refresh").onclick = function() { state.busy = false; load(); };
$("sedeFilter").onchange = function() { state.sede = this.value; state.animate = true; render(); };
$("today").onclick = function() {
  if (!state.today) return;
  var p = state.today.split("-"), same = state.year === +p[0] && state.month === +p[1];
  state.selected = state.today; state.marking = ""; state.animate = true;
  if (same) { render(); return; }
  state.year = +p[0]; state.month = +p[1]; state.loaded = false; state.rows = []; render(); state.busy = false; load();
};

/* ---------- usuarios (solo Jefe de Operaciones) ---------- */
function setView(v) {
  state.view = v;
  $("agendaView").classList.toggle("hidden", v !== "agenda");
  $("usersView").classList.toggle("hidden", v !== "usuarios");
  $("configView").classList.toggle("hidden", v !== "config");
  $("btnUsuarios").textContent = v === "usuarios" ? "Volver a la agenda" : "Usuarios";
  $("btnConfig").textContent = v === "config" ? "Volver a la agenda" : "Plazos";
  $("btnUsuarios").classList.toggle("on", v === "usuarios");
  $("btnConfig").classList.toggle("on", v === "config");
}

$("btnUsuarios").onclick = function() {
  if (state.view === "usuarios") { setView("agenda"); render(); return; }
  setView("usuarios"); $("usersView").innerHTML = '<p style="color:var(--ink-3)">Cargando usuarios…</p>';
  loadUsers();
};

$("btnConfig").onclick = function() {
  if (state.view === "config") { setView("agenda"); render(); return; }
  setView("config"); $("configView").innerHTML = '<p style="color:var(--ink-3)">Cargando…</p>';
  api("getConfig", [], function(c) { renderConfig(c); });
};

/* ---------- plazo de modificación (solo Jefe de Operaciones) ---------- */
function renderConfig(c) {
  $("configView").innerHTML = '<h2>Plazo de modificación</h2>' +
    '<p style="margin:0 0 16px;color:var(--ink-2)">Los coordinadores pueden corregir una cuadrilla hasta la hora indicada del día de la <b>fecha en campo</b> ' +
    '(registran el día anterior y corrigen hasta la mañana siguiente). Pasado el plazo, solo un supervisor o el jefe pueden modificarla. ' +
    'Esto aplica al panel y a la corrección desde el formulario.</p>' +
    '<div class="panel">' +
    '<div class="field"><label for="cHora">Hora límite (del día de la fecha en campo)</label><input id="cHora" type="time" value="' + esc(c.horaLimite) + '"></div>' +
    '<div class="field"><label for="cMargen">Margen mínimo después de registrar (minutos)</label><input id="cMargen" type="number" min="0" max="720" inputmode="numeric" value="' + esc(c.margenMinutos) + '">' +
    '<span style="font-size:12px;color:var(--ink-3)">Si un coordinador registra cuando el plazo ya venció, igual puede corregir durante este tiempo. Use 0 para no dar margen.</span></div>' +
    '<div class="actions" style="padding:0"><button class="btn primary" id="cSave">Guardar plazo</button></div></div>';
  $("cSave").onclick = function() {
    var btn = this; btn.disabled = true;
    api("saveConfig", [{ horaLimite: $("cHora").value, margenMinutos: $("cMargen").value }],
      function() { btn.disabled = false; toast("Plazo guardado"); },
      function(err) { btn.disabled = false; toast(msg(err)); });
  };
}

function loadUsers() { api("listUsuarios", [], function(list) { state.users = list; renderUsers(); }); }

function renderUsers() {
  var u = state.editUser, nuevo = !(u && u.existe);
  var h = '<h2>Usuarios del panel</h2><p style="margin:0 0 16px;color:var(--ink-2)">Cada persona ingresa con su DNI y un PIN. El PIN solo se muestra al crearlo.</p>' +
    '<div class="panel"><div class="sec" style="margin-top:0">' + (nuevo ? "Nuevo usuario" : "Editar usuario") + '</div>' +
    '<div class="field"><label>DNI</label><input id="uDni" inputmode="numeric" maxlength="8" value="' + esc(u ? u.dni : "") + '"' + (nuevo ? "" : " disabled") + '></div>' +
    '<div class="field"><label>Nombre completo</label><input id="uNombre" data-key="x" value="' + esc(u ? u.nombre : "") + '"></div>' +
    '<div class="field"><label>Rol</label><select id="uRol">' + ROLES.map(function(r) { return '<option value="' + r + '"' + (u && u.rol === r ? " selected" : "") + '>' + tc(r) + '</option>'; }).join("") + '</select></div>' +
    '<div class="field"><label>Sede (obligatoria para coordinador; varias separadas por coma)</label><input id="uSede" data-key="x" value="' + esc(u ? u.sede : "") + '"></div>' +
    '<div class="field"><label>' + (nuevo ? "PIN (6 dígitos)" : "PIN nuevo (6 dígitos; vacío = no cambiar)") + '</label><input id="uPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password">' +
    '<div><button type="button" class="btn text" id="uGen" style="padding-left:0">Generar PIN aleatorio</button></div></div>' +
    '<div class="field"><label><input type="checkbox" id="uActivo"' + (!u || u.activo ? " checked" : "") + '>Activo</label></div>' +
    '<div class="actions" style="padding:0"><button class="btn primary" id="uSave">Guardar</button>' + (u ? '<button class="btn" id="uCancel">Cancelar</button>' : "") + '</div></div>' +
    '<div class="sec">Usuarios (' + state.users.length + ')</div>' +
    (state.users.length ? state.users.map(function(x) {
      return '<div class="urow"><span class="av" style="--h:' + hue(x.nombre) + '">' + esc(initials(x.nombre)) + '</span><div class="n"><b>' + esc(tc(x.nombre)) + '</b><small>' +
        esc(x.dni) + ' · ' + esc(tc(x.rol)) + (x.sede ? " · " + esc(tc(x.sede)) : "") + (x.activo ? "" : " · Inactivo") + '</small></div>' +
        '<button class="btn" data-uedit="' + esc(x.dni) + '">Editar</button></div>';
    }).join("") : '<div class="empty">Aún no hay usuarios.</div>');
  $("usersView").innerHTML = h;
  $("uSave").onclick = saveUser;
  $("uGen").onclick = function() {
    var n = new Uint32Array(1); crypto.getRandomValues(n);
    var pin;
    do { crypto.getRandomValues(n); pin = String(100000 + (n[0] % 900000)); }
    while (/^(\d)\1+$/.test(pin) || "0123456789".indexOf(pin) >= 0 || "9876543210".indexOf(pin) >= 0);
    $("uPin").type = "text"; $("uPin").value = pin;
    toast("PIN generado: " + pin + ". Anótalo y entrégalo; luego no se puede ver.");
  };
  if ($("uCancel")) $("uCancel").onclick = function() { state.editUser = null; renderUsers(); };
  document.querySelectorAll("[data-uedit]").forEach(function(b) {
    b.onclick = function() {
      var x = state.users.filter(function(y) { return y.dni === b.dataset.uedit; })[0];
      state.editUser = Object.assign({ existe: true }, x); renderUsers(); window.scrollTo(0, 0);
    };
  });
}

function saveUser() {
  var data = { dni: $("uDni").value, nombre: $("uNombre").value, rol: $("uRol").value, sede: $("uSede").value, pin: $("uPin").value, activo: $("uActivo").checked };
  $("uSave").disabled = true;
  api("saveUsuario", [data], function() { toast("Usuario guardado"); state.editUser = null; loadUsers(); },
    function(err) { $("uSave").disabled = false; toast(msg(err)); });
}

/* ---------- arranque ---------- */
(function init() {
  $("barBrand").innerHTML = MARK + '<div><span class="t">Registro de cuadrillas</span></div>';
  $("loginBrand").innerHTML = MARK + '<div><span class="t">Registro de cuadrillas</span></div>';
  $("refresh").innerHTML = ico("refresh"); $("btnSalir").innerHTML = ico("logout");
  $("prev").innerHTML = ico("left"); $("next").innerHTML = ico("right");

  var t = readToken();
  if (!t) return showLogin("");
  state.token = t;
  callServer("getSession", [t]).then(function(user) { enterApp(user); }).catch(function() { logout(""); });
})();

// Actualización automática cada 60 s (no interrumpe edición ni otra vista)
setInterval(function() {
  if (state.token && state.view === "agenda" && !state.editing && !state.marking && !document.hidden) load(true);
}, 60000);
