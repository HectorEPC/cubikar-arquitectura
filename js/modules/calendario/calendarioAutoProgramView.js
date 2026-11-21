// js/modules/calendario/calendarioAutoProgramView.js
// Modal ✨ Auto-Programar: vista previa de la propuesta por proceso constructivo antes de aplicarla al Gantt.
// Después de aplicar, el usuario puede mover barras, fechas y predecesoras libremente; Deshacer revierte.

import { showToast } from '../../ui/notifications.js?v=20261121_cf45';
import {
  TIPOS_OBRA,
  getAutoProgramTipoInicial,
  getCurrentScheduleEnd,
  previewAutoProgram,
  applyAutoProgram
} from './calendarioAutoProgramService.js?v=20261121_cf45';

const MODAL_ID = 'modal-calendario-autoprog';
let selectedTipoId = null;
let tipoOrigen = 'proyecto';
let onAppliedCallback = null;

function esc(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getModalEl() {
  let el = document.getElementById(MODAL_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = MODAL_ID;
    document.body.appendChild(el);
  }
  return el;
}

export function closeAutoProgramModal() {
  const el = document.getElementById(MODAL_ID);
  if (el) {
    el.className = 'hidden';
    el.innerHTML = '';
  }
  document.removeEventListener('keydown', onKeydown);
}

function onKeydown(ev) {
  if (ev.key === 'Escape') closeAutoProgramModal();
}

export function openAutoProgramModal(options = {}) {
  onAppliedCallback = typeof options.onApplied === 'function' ? options.onApplied : null;
  const inicial = getAutoProgramTipoInicial();
  selectedTipoId = inicial.tipoId;
  tipoOrigen = inicial.origen;
  renderAutoProgramModal();
  document.addEventListener('keydown', onKeydown);
}

function renderAutoProgramModal() {
  const modal = getModalEl();
  let prop;
  try {
    prop = previewAutoProgram(selectedTipoId);
  } catch (e) {
    console.error('[AutoProgramar] Error al generar propuesta', e);
    showToast('No se pudo generar la propuesta de Auto-Programar.', 'error');
    return;
  }
  if (!prop.totalConceptos) {
    showToast('No hay conceptos en el presupuesto para programar.', 'error');
    return;
  }

  const tipo = prop.tipo;
  const actualEnd = getCurrentScheduleEnd();
  const claveById = new Map(prop.filas.map(f => [String(f.id), f.concepto.clave || f.concepto.id]));
  const deltaDias = actualEnd && prop.endDate
    ? Math.round((new Date(prop.endDate) - new Date(actualEnd)) / 86400000)
    : null;

  const grupos = [];
  const porEtapa = new Map();
  prop.filas.forEach(f => {
    if (!porEtapa.has(f.etapa.id)) {
      const g = { etapa: f.etapa, filas: [] };
      porEtapa.set(f.etapa.id, g);
      grupos.push(g);
    }
    porEtapa.get(f.etapa.id).filas.push(f);
  });
  grupos.sort((a, b) => a.etapa.orden - b.etapa.orden);

  const linkPill = (lk) => {
    const isSS = lk.type === 'SS';
    const lagTxt = lk.lag > 0 ? `+${lk.lag}d` : (lk.lag < 0 ? `${lk.lag}d` : '');
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded border ${isSS ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-blue-200 bg-blue-50 text-blue-800'} text-[9.5px] font-mono font-bold" title="${esc(lk.motivo || (isSS ? 'En paralelo (inicio a inicio)' : 'Al terminar (fin a inicio)'))}">${isSS ? '∥' : '🔗'} ${esc(claveById.get(String(lk.id)) || lk.id)} ${isSS ? 'II' : 'FI'}${lagTxt}</span>`;
  };

  modal.className = 'fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5';
  modal.innerHTML = `
    <div id="autoprog-card" class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs">
      <div class="bg-slate-900 text-white px-5 py-3.5 flex items-start justify-between gap-3 shrink-0">
        <div class="flex items-start gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300 shrink-0">
            <i class="fa-solid fa-wand-magic-sparkles text-base"></i>
          </div>
          <div class="min-w-0">
            <h3 class="text-sm sm:text-base font-bold leading-tight">Auto-Programar — Propuesta por proceso constructivo</h3>
            <p class="text-[11px] text-slate-300 mt-0.5">Clasifica cada concepto en su etapa y propone enlaces con esperas técnicas. Después de aplicar puedes mover barras, fechas y predecesoras libremente.</p>
          </div>
        </div>
        <button type="button" id="autoprog-close-x" class="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0" title="Cerrar">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <div class="px-5 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        <div>
          <label class="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">Tipo de obra</label>
          <select id="autoprog-tipo" class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 cursor-pointer">
            ${Object.values(TIPOS_OBRA).map(t => `<option value="${t.id}" ${t.id === tipo.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          </select>
          <p class="text-[10.5px] text-slate-500 mt-1 leading-snug">
            ${tipoOrigen === 'proyecto' ? '<i class="fa-solid fa-circle-check text-emerald-600"></i> Tomado del Tipo de Proyecto.' : '<i class="fa-solid fa-magnifying-glass text-blue-600"></i> Detectado a partir del presupuesto.'}
            ${esc(tipo.referenciaDuracion)}
          </p>
        </div>
        <div class="md:col-span-2 bg-white border border-slate-200 rounded-xl p-2.5">
          <div class="text-[10.5px] font-bold text-slate-600 uppercase mb-0.5">Estrategia constructiva</div>
          <div class="text-[11px] text-slate-700 leading-snug">${esc(tipo.estrategia)}</div>
        </div>
      </div>

      <div class="px-5 py-2.5 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
        <div class="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
          <div class="text-[9.5px] font-bold text-slate-500 uppercase">Término actual</div>
          <div class="font-mono font-bold text-slate-800">${esc(actualEnd || '—')}</div>
        </div>
        <div class="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
          <div class="text-[9.5px] font-bold text-blue-700 uppercase">Término propuesto</div>
          <div class="font-mono font-bold text-blue-800">${esc(prop.endDate || '—')}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
          <div class="text-[9.5px] font-bold text-slate-500 uppercase">Diferencia</div>
          <div class="font-mono font-bold ${deltaDias === null ? 'text-slate-500' : (deltaDias > 0 ? 'text-rose-700' : 'text-emerald-700')}">${deltaDias === null ? '—' : `${deltaDias > 0 ? '+' : ''}${deltaDias} días`}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
          <div class="text-[9.5px] font-bold text-slate-500 uppercase">Clasificación</div>
          <div class="font-mono font-bold text-slate-800">${prop.totalConceptos - prop.heredados}/${prop.totalConceptos} directos${prop.heredados ? ` <span class="text-amber-700 font-normal">· ${prop.heredados} por partida</span>` : ''}</div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto custom-scroll p-3 space-y-2.5 bg-slate-50/60" style="min-height:200px;">
        ${grupos.map(g => `
          <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div class="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-mono text-[10px] font-bold text-blue-700 shrink-0">${esc(g.etapa.id)}</span>
                <span class="font-bold text-slate-800 truncate">${esc(g.etapa.nombre)}</span>
                ${g.etapa.critica ? '<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-bold shrink-0">🔥 Suele ser crítica</span>' : ''}
              </div>
              <span class="text-[10px] text-slate-500 font-mono shrink-0">${g.filas.length} conc.</span>
            </div>
            <div class="divide-y divide-slate-100">
              ${g.filas.map(f => `
                <div class="px-3 py-1.5 flex items-center gap-2">
                  <span class="w-[64px] font-mono text-[10.5px] font-semibold ${f.isCritical ? 'text-rose-700' : 'text-blue-700'} shrink-0 truncate" title="${esc(f.concepto.clave)}">${esc(f.concepto.clave || '—')}</span>
                  <span class="flex-1 min-w-0 truncate text-slate-700" title="${esc(f.concepto.descripcion)}">${esc(f.concepto.descripcion)}</span>
                  ${f.heredada ? '<span class="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-semibold shrink-0" title="No se reconoció por palabras clave; tomó la etapa del concepto anterior de su partida">por partida</span>' : ''}
                  <span class="flex flex-wrap gap-1 justify-end shrink-0 max-w-[240px]">${f.links.length ? f.links.map(linkPill).join('') : '<span class="text-[9.5px] text-slate-400 font-mono">inicio libre</span>'}</span>
                  <span class="w-[150px] text-right font-mono text-[10px] text-slate-600 shrink-0">${esc(f.startDate)} → ${esc(f.endDate)}</span>
                  <span class="w-9 text-right font-mono text-[10.5px] font-bold text-slate-800 shrink-0">${f.durationDays}d</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="px-5 py-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <span class="text-[10.5px] text-slate-500 max-w-[600px] leading-snug">Se conservan tus duraciones y avances. Los enlaces "al terminar" (FI), "en paralelo" (II) y desfases quedan vivos y editables en el Gantt. <strong>Deshacer</strong> regresa al programa anterior.</span>
        <div class="flex items-center gap-2">
          <button type="button" id="autoprog-cancel" class="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer">Cancelar</button>
          <button type="button" id="autoprog-apply" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5">
            <i class="fa-solid fa-wand-magic-sparkles text-xs"></i>
            <span>Aplicar propuesta al Gantt</span>
          </button>
        </div>
      </div>
    </div>
  `;

  modal.onclick = (ev) => { if (ev.target === modal) closeAutoProgramModal(); };
  document.getElementById('autoprog-close-x').onclick = closeAutoProgramModal;
  document.getElementById('autoprog-cancel').onclick = closeAutoProgramModal;
  document.getElementById('autoprog-tipo').onchange = (ev) => {
    selectedTipoId = ev.target.value;
    tipoOrigen = 'manual';
    renderAutoProgramModal();
  };
  document.getElementById('autoprog-apply').onclick = () => {
    try {
      const res = applyAutoProgram(selectedTipoId);
      closeAutoProgramModal();
      if (onAppliedCallback) onAppliedCallback(res);
      showToast(`Propuesta aplicada (${res.tipo.valorSelector}). Término: ${res.endDate}. Ajusta barras o fechas libremente.`, 'success');
    } catch (e) {
      console.error('[AutoProgramar] Error al aplicar propuesta', e);
      showToast('No se pudo aplicar la propuesta.', 'error');
    }
  };
}
