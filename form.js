const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz66zCFtkOvCNZQGNHyll7DdS0d-xDw0p3NvZ74UZUggEPPwiaPtZAcgZ58w9BSa4BXsg/exec";
const LS_ULTIMO = "cuadrillasUltimoRegistro";

let globalData = { sedes: [], placas: [], personal: [] };
// Estado de modificación: null = formulario normal. Con datos = se están corrigiendo cuadrillas ya enviadas.
let edicion = null;      // { token, registros: [{id, fecha, ..., abierta, limite}] }

/* ---------- iconos y marca ---------- */
const ICONS = {
  down: '<path d="m6 9 6 6 6-6"/>', plus: '<path d="M5 12h14"/><path d="M12 5v14"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', edit: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  share: '<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>'
};
const ico = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const MARK = '<svg class="mark" viewBox="0 0 34 24" aria-hidden="true"><rect x="1" y="1" width="32" height="22" rx="5" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<circle cx="6" cy="12" r="1.6" fill="var(--accent)"/><circle cx="28" cy="12" r="1.6" fill="var(--accent)"/><path d="M11 9h12M11 15h8" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/></svg>';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const msgOf = (err) => String((err && err.message) || err).replace(/^Error:\s*/, "");
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 3200); }

function normalizeText(text) {
  return String(text || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// tipoRequerido: COORDINADOR | T1 | T2 | USUARIO
function matchesCargo(cargoDB, tipoRequerido) {
  const cargoNorm = normalizeText(cargoDB);
  const tipoNorm = normalizeText(tipoRequerido);
  if (tipoNorm === 'COORDINADOR') return cargoNorm.includes("COORDINADOR");
  if (tipoNorm === 'T1') return cargoNorm.includes("TECNICO 1") || cargoNorm.includes("TECNICO1") || cargoNorm.includes("T1");
  if (tipoNorm === 'T2') return cargoNorm.includes("TECNICO 2") || cargoNorm.includes("TECNICO2") || cargoNorm.includes("T2");
  if (tipoNorm === 'USUARIO') {
    // Cargo "USUARIO", o el cargo combinado "TECNICO 1 / COORDINADOR"
    return cargoNorm.includes("USUARIO") ||
      (cargoNorm.includes("COORDINADOR") && (cargoNorm.includes("TECNICO 1") || cargoNorm.includes("TECNICO1")));
  }
  return false;
}

function localDateISO() {
  const d = new Date(); const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function nombreDia(iso) {
  const p = String(iso || "").split("-");
  if (p.length !== 3 || !p[0]) return "--";
  const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  if (isNaN(d.getTime())) return "--";
  return ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][d.getDay()];
}
const fmtFecha = (iso) => { const p = String(iso).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; };

/* ---------- comunicación con Apps Script ---------- */
// POST text/plain: evita el preflight de CORS
function callServer(fn, args) {
  return fetch(WEB_APP_URL, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "panel", fn, args: args || [] })
  })
  .then(r => { if (!r.ok) throw new Error("Error de conexión (" + r.status + ")"); return r.json(); })
  .then(res => { if (!res.ok) throw new Error(res.error || "Error del servidor"); return res.data; });
}

/* ---------- arranque ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  $("brand").innerHTML = MARK + '<span class="t">Registro de cuadrillas</span>';
  $("chevSede").innerHTML = ico("down");
  $("btnAddCuadrilla").innerHTML = ico("plus") + "Agregar otra cuadrilla";
  $("currentDateDisplay").innerText = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

  $("coordinadorWrapper").innerHTML = comboHtml("input-coordinador", "Seleccione o digite…");
  initCombo(document.querySelector(".input-coordinador"));
  $("inputSede").addEventListener("change", refreshOptions);

  addNewCuadrilla();
  $("btnAddCuadrilla").addEventListener("click", () => addNewCuadrilla());
  $("mainForm").addEventListener("submit", handleSubmit);
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".cb")) closeAllCombos(); });

  await loadMasterData();
  revisarUltimoRegistro();
});

async function loadMasterData() {
  try {
    showLoading("Cargando personal y placas…");
    const response = await fetch(WEB_APP_URL);
    if (!response.ok) throw new Error("Error en la respuesta del servidor");
    globalData = await response.json();
    updateSedeSelect();
    refreshOptions();
  } catch (err) {
    console.warn("Modo sin conexión o fallo al cargar datos:", err);
  } finally {
    hideLoading();
  }
}

function updateSedeSelect() {
  const sel = $("inputSede"), cur = sel.value;
  sel.innerHTML = '<option value="" disabled selected>Seleccionar sede</option>' +
    (globalData.sedes || []).map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  setSede(cur);
}
function setSede(v) {
  const sel = $("inputSede");
  if (v && ![...sel.options].some(o => o.value === v)) sel.insertAdjacentHTML("beforeend", `<option value="${esc(v)}">${esc(v)}</option>`);
  sel.value = v || "";
}

/* ---------- listas desplegables (seleccionar o escribir) ---------- */
function comboHtml(inputClass, placeholder, required = true) {
  return `<div class="cb">
    <input class="${inputClass}" placeholder="${esc(placeholder)}" type="text" autocomplete="off" ${required ? 'required' : ''}>
    <span class="chev">${ico("down")}</span><div class="cbm"></div></div>`;
}
function closeAllCombos() { document.querySelectorAll(".cb.open").forEach(el => el.classList.remove("open")); }

function initCombo(input) {
  const cb = input.closest(".cb"), menu = cb.querySelector(".cbm");
  if (!cb._optionsList) cb._optionsList = [];

  const render = (q = "") => {
    const qn = normalizeText(q);
    const list = (cb._optionsList || []).filter(o => normalizeText(o).includes(qn));
    menu.innerHTML = list.length
      ? list.map(o => `<div class="cbi" data-value="${esc(o)}">${esc(o)}</div>`).join("")
      : '<div class="cbn">Sin coincidencias. Se conservará el texto escrito.</div>';
  };
  const open = () => { if (input.readOnly || input.disabled) return; refreshOptions(); closeAllCombos(); cb.classList.add("open"); render(""); };

  input.addEventListener("focus", open);
  input.addEventListener("click", open);
  input.addEventListener("input", () => {
    input.value = input.value.toUpperCase(); input.classList.remove("invalid");
    cb.classList.add("open"); render(input.value);
  });

  // Distinguir desplazamiento de toque en móviles
  let scrolling = false, startY = 0;
  menu.addEventListener("touchstart", e => { scrolling = false; startY = e.touches[0].clientY; }, { passive: true });
  menu.addEventListener("touchmove", e => { if (Math.abs(e.touches[0].clientY - startY) > 6) scrolling = true; }, { passive: true });
  menu.addEventListener("click", e => {
    if (scrolling) { scrolling = false; return; }
    const item = e.target.closest(".cbi");
    if (item) { input.value = item.dataset.value; input.classList.remove("invalid"); cb.classList.remove("open"); }
  });
}

// Recalcula las listas según la sede elegida en el módulo 1
function refreshOptions() {
  const sedeNorm = normalizeText($("inputSede").value);
  const filtered = (globalData.personal || []).filter(p => !sedeNorm || normalizeText(p.sede) === sedeNorm);
  const namesFor = tipo => Array.from(new Set(filtered.filter(p => matchesCargo(p.cargo, tipo)).map(p => p.nombre)));

  document.querySelector(".input-coordinador").closest(".cb")._optionsList = namesFor("COORDINADOR");
  document.querySelectorAll(".cuadrilla-card").forEach(card => {
    card.querySelector(".input-placa").closest(".cb")._optionsList = Array.from(new Set(globalData.placas || []));
    card.querySelectorAll("[data-tipo]").forEach(row => {
      const input = row.querySelector(".input-persona");
      if (input) input.closest(".cb")._optionsList = namesFor(row.dataset.tipo);
    });
  });
}

/* ---------- cuadrillas ---------- */
function renumberCuadrillas() {
  document.querySelectorAll(".cuadrilla-card").forEach((card, i) => {
    card.dataset.id = i + 1;
    card.querySelector(".titulo-cuadrilla").innerText = `Cuadrilla ${i + 1}`;
  });
}

function addNewCuadrilla() {
  const container = $("cuadrillasContainer");
  const index = container.children.length + 1;
  const card = document.createElement("section");
  card.className = "panel cuadrilla-card stack";
  card.dataset.id = index;

  card.innerHTML = `
    <div class="card-h">
      <div class="lt">
        <span class="num">${ico("users")}</span>
        <div>
          <h2 class="titulo-cuadrilla">Cuadrilla ${index}</h2>
          <p>Complete la información de la unidad de campo.</p>
        </div>
      </div>
      ${index > 1 && !edicion ? `<button type="button" class="btn danger" data-quitar>Eliminar</button>` : ''}
    </div>

    <div class="field">
      <label>Fecha de trabajo en campo</label>
      <div class="date-row">
        <input class="input-fecha" type="date" value="${localDateISO()}" required>
        <span class="dia">${nombreDia(localDateISO())}</span>
      </div>
    </div>

    <div class="divider"></div>

    <div class="stack" style="gap:12px">
      <div class="people-h">
        <span class="lbl">Técnico 1, técnico 2 y usuario (obligatorios)</span>
        <span class="count badge-asignados">0 de 3</span>
      </div>
      <div class="people tecnicos-list"></div>
      <div class="adds">
        <button type="button" class="add btn-add-t1" data-add="T1">${ico("plus")}Técnico 1</button>
        <button type="button" class="add btn-add-t2" data-add="T2">${ico("plus")}Técnico 2</button>
        <button type="button" class="add btn-add-usuario" data-add="USUARIO">${ico("plus")}Usuario</button>
      </div>
    </div>

    <div class="divider"></div>

    <div class="field">
      <label>Placa del vehículo</label>
      ${comboHtml("input-placa plate-in", "ABC-123")}
    </div>
    <div class="lock-note hidden"></div>
  `;
  container.appendChild(card);
  initCombo(card.querySelector(".input-placa"));
  refreshOptions();
  return card;
}

document.addEventListener("click", (e) => {
  const q = e.target.closest("[data-quitar]");
  if (q) { q.closest(".cuadrilla-card").remove(); renumberCuadrillas(); return; }
  const a = e.target.closest("[data-add]");
  if (a) { addTecnico(a, a.dataset.add); return; }
  const rm = e.target.closest("[data-rmrow]");
  if (rm) { removePersonaRow(rm); return; }
  const rt = e.target.closest("[data-ruta]");
  if (rt) { marcarRutaSinT2(rt); }
});

document.addEventListener("input", (e) => {
  if (e.target.classList && e.target.classList.contains("input-fecha")) {
    const badge = e.target.closest(".cuadrilla-card").querySelector(".dia");
    if (badge) badge.innerText = nombreDia(e.target.value);
  }
});

// Agrega la fila de T1, T2 o USUARIO a la cuadrilla
function addTecnico(btn, tipo) {
  const card = btn.closest(".cuadrilla-card");
  const list = card.querySelector(".tecnicos-list");
  const esUsuario = tipo === 'USUARIO';
  const n = tipo === 'T1' ? '1' : '2';
  if (list.querySelector(`[data-tipo="${tipo}"]`)) return null;

  const row = document.createElement("div");
  row.className = "person";
  row.dataset.tipo = tipo;
  const label = esUsuario ? 'Usuario' : `Nombre del técnico ${n}`;
  const ph = esUsuario ? 'Seleccione o digite…' : 'Seleccione o digite…';
  row.innerHTML = `
    <span class="badge">${esUsuario ? 'US' : tipo}</span>
    <div class="body">
      <label>${label}</label>
      ${comboHtml("input-persona", ph)}
      ${tipo === 'T2' ? `<button type="button" class="btn text sm quick" data-ruta>Marcar como «Ruta sin T2»</button>` : ''}
    </div>
    <button type="button" class="icon-btn x" data-rmrow aria-label="Quitar">${ico("x")}</button>`;
  list.appendChild(row);
  initCombo(row.querySelector(".input-persona"));
  refreshOptions();
  updateBadge(card);
  btn.disabled = true;
  return row;
}

function updateBadge(card) {
  const n = card.querySelectorAll(".tecnicos-list [data-tipo]").length;
  const b = card.querySelector(".badge-asignados");
  b.innerText = `${n} de 3`; b.classList.toggle("full", n === 3);
}

function removePersonaRow(btn) {
  const card = btn.closest(".cuadrilla-card"), row = btn.closest("[data-tipo]");
  const tipo = row.dataset.tipo;
  row.remove(); updateBadge(card);
  const target = card.querySelector(`[data-add="${tipo}"]`);
  if (target) target.disabled = false;
}

function marcarRutaSinT2(btn) {
  const input = btn.closest(".person").querySelector(".input-persona");
  if (input.value === "RUTA SIN TÉCNICO 2") {
    input.value = ""; input.readOnly = false;
    btn.innerHTML = "Marcar como «Ruta sin T2»";
  } else {
    input.value = "RUTA SIN TÉCNICO 2"; input.readOnly = true; input.classList.remove("invalid");
    btn.innerHTML = "Deshacer «Ruta sin T2»";
  }
}

/* ---------- lectura del formulario ---------- */
function collectPayload() {
  const sede = $("inputSede").value;
  const coordInput = document.querySelector(".input-coordinador");
  const coordinador = coordInput.value.trim();
  document.querySelectorAll("input.invalid").forEach(i => i.classList.remove("invalid"));

  if (!sede) { alert("Seleccione la SEDE DE OPERACIONES."); $("inputSede").focus(); return null; }
  if (!coordinador) { coordInput.classList.add("invalid"); alert("Indique el NOMBRE DEL COORDINADOR."); coordInput.focus(); return null; }

  const payload = [];
  const cards = [...document.querySelectorAll(".cuadrilla-card")];
  for (let index = 0; index < cards.length; index++) {
    const card = cards[index], n = index + 1;
    const fecha = card.querySelector(".input-fecha").value;
    const placaInput = card.querySelector(".input-placa");
    const placa = placaInput.value.trim();
    const val = (t) => { const r = card.querySelector(`[data-tipo="${t}"]`); return r ? r.querySelector(".input-persona").value.trim() : ""; };
    const mark = (t) => { const r = card.querySelector(`[data-tipo="${t}"]`); if (r) r.querySelector(".input-persona").classList.add("invalid"); };

    if (!fecha) { alert(`Cuadrilla ${n}: Indique la FECHA DE TRABAJO EN CAMPO.`); return null; }
    if (!val("T1")) { mark("T1"); alert(`Cuadrilla ${n}: Debe agregar y seleccionar el TÉCNICO 1.`); return null; }
    if (!val("T2")) { mark("T2"); alert(`Cuadrilla ${n}: Debe agregar el TÉCNICO 2 y seleccionar un nombre o «Ruta sin técnico 2».`); return null; }
    if (!val("USUARIO")) { mark("USUARIO"); alert(`Cuadrilla ${n}: Debe agregar el USUARIO (seleccione o digite el nombre).`); return null; }
    if (!placa) { placaInput.classList.add("invalid"); alert(`Cuadrilla ${n}: Debe indicar la PLACA DEL VEHÍCULO.`); return null; }

    payload.push({
      numeroCuadrilla: n, sede, coordinador, fecha, placa, usuario: val("USUARIO"),
      integrantes: [{ nombre: val("T1"), cargo: "T1" }, { nombre: val("T2"), cargo: "T2" }],
      _id: card.dataset.recordId || ""
    });
  }
  return payload;
}

/* ---------- envío ---------- */
async function handleSubmit(e) {
  e.preventDefault();
  const payload = collectPayload();
  if (!payload) return;
  if (edicion) return guardarCambios(payload);

  const btn = $("btnSubmit");
  try {
    btn.disabled = true; showLoading("Guardando registro…");
    const body = payload.map(({ _id, ...c }) => c);
    const response = await fetch(WEB_APP_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (result.status !== "success") throw new Error(result.message || "Error al registrar en Google Sheets.");

    const registros = body.map((c, i) => ({ ...c, id: (result.ids || [])[i] || "", limite: ((result.limites || [])[i] || {}).limite || "", abierta: true }));
    guardarUltimo(result.editToken, registros);
    hideLoading();
    mostrarResultado(registros, result.editToken, { actualizado: false });
  } catch (err) {
    hideLoading();
    alert("Error al enviar los datos: " + msgOf(err));
  } finally {
    btn.disabled = false;
  }
}

/* ---------- aviso al terminar: modificar / ver / finalizar ---------- */
function openModal(html) {
  $("overlay").innerHTML = `<div class="scrim" role="dialog" aria-modal="true"><div class="modal">${html}</div></div>`;
  return $("overlay").querySelector(".modal");
}
function closeModal() { $("overlay").innerHTML = ""; }

function limiteMasLejano(registros) {
  const con = registros.filter(r => r.limite);
  return con.length ? con.map(r => r.limite).sort().slice(-1)[0] : "";
}
function textoLimite(l) { return l ? `Puedes modificarlo hasta el ${l}.` : ""; }

function mostrarResultado(registros, token, opts) {
  const n = registros.length;
  const lim = limiteMasLejano(registros);
  const m = openModal(`
    <div class="okmark">${ico("check")}</div>
    <h2>${opts.actualizado ? "Cambios guardados" : "Registro enviado"}</h2>
    <p class="lead">${n} ${n === 1 ? "cuadrilla guardada" : "cuadrillas guardadas"} correctamente. ${esc(textoLimite(lim))}</p>
    <div class="opts">
      <button class="opt" id="optModificar"><div><b>Modificar datos</b><span>Corrige sede, fecha, técnicos, usuario o placa.</span></div>${ico("edit")}</button>
      <button class="opt" id="optVer"><div><b>Ver lo registrado</b><span>Resumen, PDF y compartir.</span></div>${ico("eye")}</button>
      <button class="opt main" id="optFin"><div><b>Finalizar</b><span>Dejar todo como está y empezar un registro nuevo.</span></div>${ico("check")}</button>
    </div>`);
  m.querySelector("#optModificar").onclick = () => { closeModal(); entrarEdicion(registros, token); };
  m.querySelector("#optVer").onclick = () => mostrarResumen(registros, token, opts);
  m.querySelector("#optFin").onclick = () => { closeModal(); location.reload(); };
}

function mostrarResumen(registros, token, opts) {
  const m = openModal(`
    <h2>Lo registrado</h2>
    <p class="lead">Resumen de ${registros.length === 1 ? "la cuadrilla" : "las cuadrillas"} enviadas.</p>
    ${registros.map((c, i) => `
      <div class="sum-card">
        <h3><span>Cuadrilla ${i + 1}</span><span class="plate">${esc(c.placa)}</span></h3>
        <dl style="margin:0">
          <div class="kv"><dt>Fecha en campo</dt><dd>${esc(fmtFecha(c.fecha))} · ${esc(nombreDia(c.fecha))}</dd></div>
          <div class="kv"><dt>Sede</dt><dd>${esc(c.sede)}</dd></div>
          <div class="kv"><dt>Coordinador</dt><dd>${esc(c.coordinador)}</dd></div>
          <div class="kv"><dt>Técnico 1</dt><dd>${esc(nombreDe(c, "T1"))}</dd></div>
          <div class="kv"><dt>Técnico 2</dt><dd>${esc(nombreDe(c, "T2"))}</dd></div>
          <div class="kv"><dt>Usuario</dt><dd>${esc(c.usuario)}</dd></div>
        </dl>
      </div>`).join("")}
    <div class="row-btns">
      <button class="btn" id="btnPdf">${ico("doc")}Ver PDF</button>
      <button class="btn" id="btnShare">${ico("share")}Compartir</button>
    </div>
    <div class="row-btns"><button class="btn primary" id="btnVolver">Volver</button></div>`);
  const act = async (btn, accion) => { btn.disabled = true; await procesarPDFOpcion(registros, accion); btn.disabled = false; };
  m.querySelector("#btnPdf").onclick = (e) => act(e.currentTarget, "VER");
  m.querySelector("#btnShare").onclick = (e) => act(e.currentTarget, "COMPARTIR");
  m.querySelector("#btnVolver").onclick = () => mostrarResultado(registros, token, opts || { actualizado: false });
}
function nombreDe(c, cargo) { const i = (c.integrantes || []).find(x => x.cargo === cargo); return i ? i.nombre : (cargo === "T1" ? c.t1 : c.t2) || ""; }

/* ---------- modificar lo enviado (sin login, dentro del plazo) ---------- */
function normRegistro(r) {
  // Acepta registros del envío (integrantes) o de formLoad (t1/t2)
  return { ...r, integrantes: r.integrantes || [{ nombre: r.t1 || "", cargo: "T1" }, { nombre: r.t2 || "", cargo: "T2" }] };
}

function entrarEdicion(registros, token) {
  registros = registros.map(normRegistro);
  edicion = { token, registros };
  $("cuadrillasContainer").innerHTML = "";
  const first = registros[0];
  setSede(first.sede);
  document.querySelector(".input-coordinador").value = first.coordinador || "";

  registros.forEach(r => {
    const card = addNewCuadrilla();
    card.dataset.recordId = r.id;
    const f = card.querySelector(".input-fecha"); f.value = r.fecha; card.querySelector(".dia").innerText = nombreDia(r.fecha);
    card.querySelector(".input-placa").value = r.placa || "";
    const fila = (tipo, valor) => {
      const row = addTecnico(card.querySelector(`[data-add="${tipo}"]`), tipo);
      if (!row) return;
      const inp = row.querySelector(".input-persona"); inp.value = valor || "";
      if (tipo === "T2" && valor === "RUTA SIN TÉCNICO 2") { inp.value = ""; marcarRutaSinT2(row.querySelector("[data-ruta]")); }
    };
    fila("T1", nombreDe(r, "T1")); fila("T2", nombreDe(r, "T2")); fila("USUARIO", r.usuario);

    if (r.abierta === false) {            // plazo vencido: la cuadrilla queda solo de lectura
      card.classList.add("locked");
      card.querySelectorAll("input, button.add, [data-rmrow], [data-ruta]").forEach(el => { el.disabled = true; });
      const note = card.querySelector(".lock-note");
      note.textContent = `El plazo para modificar esta cuadrilla terminó (${r.limite}). Solicita el cambio a un supervisor.`;
      note.classList.remove("hidden");
    }
  });

  const lim = limiteMasLejano(registros);
  $("bannerSlot").innerHTML = `<div class="notice edit"><p><b>Modificando lo registrado.</b> ${esc(textoLimite(lim))}</p>
    <div class="acts"><button type="button" class="btn sm" id="btnCancelarEdicion">Cancelar modificación</button></div></div>`;
  $("btnCancelarEdicion").onclick = () => location.reload();
  $("btnAddCuadrilla").classList.add("hidden");
  $("btnSubmit").textContent = "Guardar cambios";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function guardarCambios(payload) {
  const btn = $("btnSubmit");
  btn.disabled = true; showLoading("Guardando cambios…");
  const errores = [], actualizados = [];
  for (const c of payload) {
    const reg = edicion.registros.find(r => r.id === c._id);
    if (!reg || reg.abierta === false) { if (reg) actualizados.push(reg); continue; }
    const cambios = { fecha: c.fecha, sede: c.sede, coordinador: c.coordinador, placa: c.placa,
      t1: c.integrantes[0].nombre, t2: c.integrantes[1].nombre, usuario: c.usuario };
    try {
      await callServer("formUpdate", [edicion.token, c._id, cambios]);
      actualizados.push({ ...reg, ...c, id: c._id, abierta: true });
    } catch (err) {
      errores.push(`Cuadrilla ${c.numeroCuadrilla}: ${msgOf(err)}`);
      actualizados.push(reg);
    }
  }
  hideLoading(); btn.disabled = false;

  edicion.registros = actualizados.map(normRegistro);
  guardarUltimo(edicion.token, edicion.registros);
  if (errores.length) { alert("No se pudo guardar todo:\n\n" + errores.join("\n")); return; }
  mostrarResultado(edicion.registros, edicion.token, { actualizado: true });
}

/* ---------- recordar el último registro para poder corregirlo después ---------- */
function guardarUltimo(token, registros) {
  try { localStorage.setItem(LS_ULTIMO, JSON.stringify({ token, registros: registros.map(normRegistro), cuando: Date.now() })); } catch (e) {}
}
function leerUltimo() { try { return JSON.parse(localStorage.getItem(LS_ULTIMO) || "null"); } catch (e) { return null; } }
function borrarUltimo() { try { localStorage.removeItem(LS_ULTIMO); } catch (e) {} }

async function revisarUltimoRegistro() {
  const u = leerUltimo();
  if (!u || !u.token) return;
  try {
    const r = await callServer("formLoad", [u.token]);
    const registros = (r.registros || []).map(normRegistro);
    if (!registros.some(x => x.abierta)) { borrarUltimo(); return; }
    guardarUltimo(u.token, registros);
    const lim = limiteMasLejano(registros.filter(x => x.abierta));
    $("bannerSlot").innerHTML = `<div class="notice"><p><b>Tienes un registro reciente</b> (${registros.length} ${registros.length === 1 ? "cuadrilla" : "cuadrillas"}, fecha ${esc(fmtFecha(registros[0].fecha))}). Puedes modificarlo hasta el ${esc(lim)}.</p>
      <div class="acts"><button type="button" class="btn sm primary" id="bnMod">Modificar</button><button type="button" class="btn sm" id="bnVer">Ver</button><button type="button" class="btn sm text" id="bnOcultar">Ocultar</button></div></div>`;
    $("bnMod").onclick = () => entrarEdicion(registros, u.token);
    $("bnVer").onclick = () => mostrarResumen(registros, u.token, { actualizado: false });
    $("bnOcultar").onclick = () => { $("bannerSlot").innerHTML = ""; };
  } catch (err) { /* sin conexión o permiso inválido: no se muestra nada */ }
}

/* ---------- PDF del resumen ---------- */
async function procesarPDFOpcion(registros, accion) {
  const sedes = Array.from(new Set(registros.map(p => p.sede).filter(Boolean)));
  const sedeNombre = sedes.length === 1 ? sedes[0].replace(/[^a-zA-Z0-9]/g, "_").toUpperCase() : "GENERAL";
  const fileName = `Registro_Cuadrillas_${sedeNombre}_${new Date().toISOString().split('T')[0]}.pdf`;

  const el = document.createElement("div");
  el.style.cssText = "width: 650px; padding: 20px; background: #ffffff; color: #000000; position: fixed; top: 0; left: 0; z-index: 9999999;";
  let html = `<div style="font-family: Arial, sans-serif; color: #000000;">
    <div style="text-align: center; border-bottom: 2px solid #0a4aa6; padding-bottom: 10px; margin-bottom: 20px;">
      <h1 style="color: #0a4aa6; margin: 0; font-size: 18px; font-weight: bold;">RESUMEN DE REGISTRO DE CUADRILLAS</h1>
      <p style="margin: 5px 0 0 0; font-size: 11px; color: #333333;">SEDE: ${esc(sedeNombre)} | FECHA: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}</p>
    </div>`;
  registros.forEach((c, idx) => {
    html += `<div style="border: 1px solid #000000; border-radius: 4px; padding: 10px; margin-bottom: 12px; background: #ffffff;">
      <h3 style="color: #0a4aa6; margin: 0 0 6px 0; border-bottom: 1px solid #cccccc; padding-bottom: 4px; font-size: 13px;">CUADRILLA ${idx + 1}</h3>
      <table style="width: 100%; font-size: 10px; border-collapse: collapse;">
        <tr><td style="padding: 2px; font-weight: bold; width: 35%;">SEDE DE OPERACIÓN:</td><td style="padding: 2px;">${esc(c.sede || 'N/A')}</td></tr>
        <tr><td style="padding: 2px; font-weight: bold;">COORDINADOR:</td><td style="padding: 2px;">${esc(c.coordinador || 'N/A')}</td></tr>
        <tr><td style="padding: 2px; font-weight: bold;">FECHA EN CAMPO:</td><td style="padding: 2px;">${esc(fmtFecha(c.fecha) || 'N/A')}</td></tr>
        <tr><td style="padding: 2px; font-weight: bold;">PLACA VEHÍCULO:</td><td style="padding: 2px;">${esc(c.placa || 'N/A')}</td></tr>
        <tr><td style="padding: 2px; font-weight: bold;">TÉCNICO 1:</td><td style="padding: 2px;">${esc(nombreDe(c, "T1") || 'N/A')}</td></tr>
        <tr><td style="padding: 2px; font-weight: bold;">TÉCNICO 2:</td><td style="padding: 2px;">${esc(nombreDe(c, "T2") || 'N/A')}</td></tr>
        <tr><td style="padding: 2px; font-weight: bold;">USUARIO:</td><td style="padding: 2px;">${esc(c.usuario || 'N/A')}</td></tr>
      </table></div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
  document.body.appendChild(el);
  await new Promise(r => setTimeout(r, 200));

  try {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    document.body.removeChild(el);
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const JsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
    const pdf = new JsPDF('p', 'mm', 'a4');
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(imgData, 'JPEG', 0, 0, w, (canvas.height * w) / canvas.width);
    const blob = pdf.output('blob');

    if (accion === "VER") {
      window.open(URL.createObjectURL(blob), '_blank');
    } else {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: `Registro Cuadrillas - ${sedeNombre}`, files: [file] });
      } else {
        window.open(URL.createObjectURL(blob), '_blank');
      }
    }
  } catch (err) {
    if (document.body.contains(el)) document.body.removeChild(el);
    alert("Error al procesar el documento: " + msgOf(err));
  }
}

function showLoading(text) {
  $("overlay").innerHTML = `<div class="scrim"><div class="loadbox"><div class="spin"></div><span>${esc(text)}</span></div></div>`;
}
function hideLoading() { $("overlay").innerHTML = ""; }
