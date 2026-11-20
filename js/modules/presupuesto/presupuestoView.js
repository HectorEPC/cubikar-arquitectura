// js/modules/presupuesto/presupuestoView.js
// Pestaña 1: Presupuesto al Cliente (Barra de botones, Desglose de Presupuesto, Resumen Ejecutivo y Notas)

import { state, persistLocalData } from '../../state/store.js?v=20261119_cf42';
import { findNodeById } from '../catalog/treeService.js?v=20261119_cf42';
import { formatMoney, getCurrencyCode } from '../../core/formatters.js?v=20261119_cf42';
import { showToast } from '../../ui/notifications.js?v=20261119_cf42';
import { isTabLocked, guardTabUnlocked } from '../../ui/tabLockController.js?v=20261119_cf42';
import { getActiveProjectId } from '../../config/constants.js?v=20261119_cf42';
import { canCurrentUserEditProject } from '../portal/projectService.js?v=20261119_cf42';
import { openTabMembersAssignModal, renderTabAssignedAvatars } from '../portal/portalController.js?v=20261119_cf42';

import {
  getProjectPresupuestoConfig,
  getDefaultPresupuestoNotas,
  calcularResumenPresupuesto,
  savePresupuestoSettings,
  isSubtituloNode
} from './presupuestoModel.js?v=20261119_cf42';
import {
  buildPresupuestoPrintTableHtml,
  printPresupuestoCotizacion,
  exportPresupuestoExcel
} from './presupuestoExport.js?v=20261119_cf42';

export {
  getProjectPresupuestoConfig,
  calcularResumenPresupuesto
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSummaryAndNotesHtml(cfg, resumen, locked) {
  const notas = Array.isArray(cfg.notas) ? cfg.notas : [];
  const subtitulos = resumen.subtitulosResumen || [];

  return `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 mt-3">
      <!-- Notas y Condiciones Comerciales -->
      <div class="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
        <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <i class="fa-solid fa-file-signature text-amber-600"></i> Notas y Condiciones
          </span>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="onPresupuestoResetNotas()" ${locked ? 'disabled' : ''}
                    title="Restaurar notas base recomendadas"
                    class="text-[10px] font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-2 py-0.5 rounded transition cursor-pointer disabled:opacity-40">
              Base
            </button>
            <button type="button" onclick="onPresupuestoAddNota()" ${locked ? 'disabled' : ''}
                    class="text-[10px] font-bold text-blue-700 hover:bg-blue-100 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded transition cursor-pointer disabled:opacity-40">
              + Nota
            </button>
          </div>
        </div>
        <div class="p-2.5 space-y-2 flex-1">
          ${notas.length === 0 ? `
            <div class="text-center text-xs text-slate-400 py-4">No hay notas agregadas.</div>
          ` : notas.map((nota, idx) => `
            <div class="flex items-start gap-2 group">
              <span class="w-5 h-5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                ${idx + 1}
              </span>
              <textarea ${locked ? 'disabled readonly' : ''}
                        onchange="onPresupuestoEditNota(${idx}, this.value)"
                        class="desc-input flex-1 text-xs text-slate-700 bg-slate-50/50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded px-2 py-1 leading-snug">${escapeHtml(nota)}</textarea>
              <button type="button" onclick="onPresupuestoDeleteNota(${idx})" ${locked ? 'disabled' : ''}
                      title="Eliminar nota"
                      class="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer disabled:opacity-30 shrink-0 mt-0.5">
                <i class="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Resumen Ejecutivo por Partida y Totales -->
      <div class="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
        <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span class="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <i class="fa-solid fa-chart-pie text-blue-600"></i> Resumen Ejecutivo por Partida
          </span>
          <span class="text-[11px] font-semibold text-slate-500">
            ${subtitulos.filter(s => s.conceptosCount > 0 || s.hasOwnQuote).length} partida(s) &bull; ${resumen.totalConceptosSeleccionados ?? resumen.totalConceptos} de ${resumen.totalConceptosProyecto ?? resumen.totalConceptos} concepto(s) seleccionados
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase border-b border-slate-200">
                <th class="py-1.5 px-2.5 text-left w-16">Clave</th>
                <th class="py-1.5 px-2.5 text-left">Subtítulo / Partida</th>
                <th class="py-1.5 px-2.5 text-right w-32">Importe</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${subtitulos.length === 0 ? `
                <tr><td colspan="3" class="py-4 text-center text-slate-400">Sin partidas registradas.</td></tr>
              ` : subtitulos.map(s => `
                <tr class="hover:bg-slate-50">
                  <td class="py-1.5 px-2.5 font-mono text-[11px] text-slate-500 font-bold">${escapeHtml(s.clave)}</td>
                  <td class="py-1.5 px-2.5 font-semibold text-slate-800">
                    <span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background-color: ${escapeHtml(s.color)}"></span>
                    ${escapeHtml(s.descripcion)}
                  </td>
                  <td class="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900">${formatMoney(s.importe)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div class="text-[11px] text-slate-600 space-y-0.5">
            <div>Moneda: <strong class="text-slate-800">${escapeHtml(getCurrencyCode())}</strong> &bull; IVA: <strong class="text-slate-800">${resumen.aplicarIva ? `${resumen.ivaPct}%` : 'No aplica'}</strong></div>
            <div>Porcentajes aplicados (Configuración del Sistema): <strong class="text-slate-800 font-mono">${resumen.porcentajeAgregadoPct >= 0 ? '+' : ''}${resumen.porcentajeAgregadoPct.toFixed(2)}%</strong> <span class="text-slate-400 font-mono">(&times;${resumen.factorSobrecosto.toFixed(4)})</span></div>
          </div>

          <div class="w-full sm:w-72 space-y-1 text-xs">
            <div class="flex justify-between items-center py-0.5 border-b border-slate-200">
              <span class="font-bold text-slate-600 uppercase text-[11px]">Subtotal</span>
              <span class="font-mono font-bold text-slate-900">${formatMoney(resumen.subtotalVenta)}</span>
            </div>
            ${resumen.aplicarIva ? `
              <div class="flex justify-between items-center py-0.5 border-b border-slate-200">
                <span class="font-bold text-slate-600 uppercase text-[11px]">IVA (${resumen.ivaPct}%)</span>
                <span class="font-mono font-bold text-slate-900">+${formatMoney(resumen.montoIva)}</span>
              </div>
            ` : ''}
            ${resumen.aplicarRetenciones && resumen.retencionIsrPct > 0 ? `
              <div class="flex justify-between items-center py-0.5 border-b border-slate-200 text-rose-700">
                <span class="font-bold uppercase text-[11px]">(-) Ret. ISR (${resumen.retencionIsrPct}%)</span>
                <span class="font-mono font-bold">-${formatMoney(resumen.montoRetIsr)}</span>
              </div>
            ` : ''}
            ${resumen.aplicarRetenciones && resumen.retencionIvaPct > 0 ? `
              <div class="flex justify-between items-center py-0.5 border-b border-slate-200 text-rose-700">
                <span class="font-bold uppercase text-[11px]">(-) Ret. IVA (${Number(resumen.retencionIvaPct).toFixed(2)}%)</span>
                <span class="font-mono font-bold">-${formatMoney(resumen.montoRetIva)}</span>
              </div>
            ` : ''}
            <div class="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-slate-900 text-white">
              <span class="font-extrabold uppercase tracking-wide text-[11px]">${resumen.aplicarRetenciones ? 'Neto a Cobrar' : 'Gran Total'}</span>
              <span class="font-mono font-extrabold text-sm text-emerald-300">${formatMoney(resumen.granTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Render Principal de la Pestaña 1. PRESUPUESTO
// ---------------------------------------------------------------------------

export function renderPresupuestoView() {
  const container = document.getElementById('view-presupuesto');
  if (!container) return;

  // Preservar posición de scroll al re-renderizar tras ediciones
  const prevScrollEl = document.getElementById('presupuesto-scroll-area');
  const prevScrollTop = prevScrollEl ? prevScrollEl.scrollTop : 0;
  const prevScrollLeft = prevScrollEl ? prevScrollEl.scrollLeft : 0;

  const cfg = getProjectPresupuestoConfig();
  const resumen = calcularResumenPresupuesto();
  const locked = isTabLocked('presupuesto') || !canCurrentUserEditProject(getActiveProjectId());

  container.innerHTML = `
    <div class="bg-white rounded-lg shadow border border-slate-200 flex flex-col h-full overflow-hidden">
      <!-- Encabezado y Barra de Botones -->
      <div class="px-3 sm:px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="p-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-bold">
              <i class="fa-solid fa-calculator"></i>
            </span>
            <h2 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight">PRESUPUESTO</h2>
          </div>
        </div>

        <div class="flex items-center gap-1.5 flex-wrap">
          <button type="button" onclick="agruparPresupuestoConceptos()"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Agrupar todos los conceptos por partida (contraer)">
            <i class="fa-solid fa-layer-group text-[10px] text-amber-600"></i> Agrupar
          </button>

          <button type="button" onclick="desagruparPresupuestoConceptos()"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Desagrupar todos los conceptos (expandir)">
            <i class="fa-solid fa-arrows-split-up-and-left text-[10px] text-blue-600"></i> Desagrupar
          </button>

          <button type="button" onclick="openSettingsModal('sobrecosto')"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Ajustar porcentajes, utilidad e IVA en Configuración del Sistema">
            <i class="fa-solid fa-sliders text-[10px] text-blue-600"></i> % Despacho e IVA
          </button>

          <button type="button" onclick="onPresupuestoExportExcel()"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Exportar Presupuesto del Cliente a Excel (.xlsx)">
            <i class="fa-solid fa-file-excel text-[10px]"></i> Excel
          </button>

          <button type="button" onclick="onPresupuestoPrint()"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-900 text-white transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Imprimir / Guardar PDF formato Cotización para Cliente">
            <i class="fa-solid fa-print text-[10px]"></i> Imprimir
          </button>

          <!-- Widget Asignados -->
          <div id="tab-members-presupuesto" class="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
            <span class="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <i class="fa-solid fa-users text-blue-600"></i> Asignados:
            </span>
            <div id="tab-avatars-presupuesto" class="flex -space-x-1.5 overflow-hidden items-center cursor-pointer" onclick="openTabMembersAssignModal('presupuesto')"></div>
            <button type="button" onclick="openTabMembersAssignModal('presupuesto')" class="text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5 transition cursor-pointer">
              Asignar
            </button>
          </div>

          <!-- Candado de Bloqueo -->
          <button type="button" onclick="toggleTabLock('presupuesto')" id="btn-lock-presupuesto"
                  class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-semibold shadow-2xs transition cursor-pointer"
                  title="Bloquear edición de presupuesto">
            <i class="fa-solid ${locked ? 'fa-lock text-amber-600' : 'fa-lock-open text-slate-600'}"></i>
          </button>
        </div>
      </div>

      <!-- Área Principal: Tabla de Presupuesto + Resumen Ejecutivo y Notas -->
      <div id="presupuesto-scroll-area" class="flex-1 overflow-auto bg-slate-100/60 p-3">
        <div class="bg-white rounded-xl shadow-2xs border border-slate-200 overflow-hidden">
          <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-800 uppercase tracking-wide">
                <i class="fa-solid fa-table-list text-blue-600"></i> Desglose de Presupuesto por Partida y Concepto
              </span>
              <span class="text-[10px] text-slate-500">Casillas de selección: solo las filas marcadas se imprimirán</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                <button type="button" onclick="agruparPresupuestoConceptos()"
                        class="px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer flex items-center gap-1"
                        title="Agrupar todos los conceptos">
                  <i class="fa-solid fa-layer-group text-[9px] text-amber-600"></i> Agrupar
                </button>
                <div class="w-px h-3 bg-slate-200 mx-0.5"></div>
                <button type="button" onclick="desagruparPresupuestoConceptos()"
                        class="px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer flex items-center gap-1"
                        title="Desagrupar todos los conceptos">
                  <i class="fa-solid fa-arrows-split-up-and-left text-[9px] text-blue-600"></i> Desagrupar
                </button>
              </div>
              <span class="text-[11px] font-semibold ${(resumen.totalConceptosSeleccionados ?? resumen.totalConceptos) === (resumen.totalConceptosProyecto ?? resumen.totalConceptos) ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-blue-700 bg-blue-50 border-blue-200'} border px-2 py-0.5 rounded-full flex items-center gap-1" title="Conceptos incluidos en la impresión de la cotización">
                <i class="fa-solid fa-print text-[10px]"></i> ${resumen.totalConceptosSeleccionados ?? resumen.totalConceptos} de ${resumen.totalConceptosProyecto ?? resumen.totalConceptos} para imprimir
              </span>
              <button type="button" onclick="window.switchTab('alcances')" class="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer">
                <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Ir a Tabla de Alcances
              </button>
            </div>
          </div>

          <div class="overflow-x-auto p-2.5 sm:p-3" style="background-color: #ffffff;">
            ${buildPresupuestoPrintTableHtml(state.treeData || [], resumen, cfg, { forPrint: false, locked })}
          </div>
        </div>

        <!-- Resumen Ejecutivo por Partida + Notas y Condiciones -->
        ${renderSummaryAndNotesHtml(cfg, resumen, locked)}
      </div>
    </div>
  `;

  renderTabAssignedAvatars('presupuesto');

  const nextScrollEl = document.getElementById('presupuesto-scroll-area');
  if (nextScrollEl) {
    nextScrollEl.scrollTop = prevScrollTop;
    nextScrollEl.scrollLeft = prevScrollLeft;
  }
}

// ---------------------------------------------------------------------------
// Selección de filas para impresión (casillas al inicio de la tabla)
// ---------------------------------------------------------------------------

export function togglePresupuestoSelectNode(nodeId, isChecked) {
  if (!canCurrentUserEditProject(getActiveProjectId()) || isTabLocked('presupuesto')) {
    showToast('La pestaña de Presupuesto está bloqueada o en modo solo lectura.', 'warning');
    renderPresupuestoView();
    return;
  }
  const tree = state.treeData || [];
  const targetNode = findNodeById(tree, nodeId);
  if (!targetNode) return;

  function setRecursive(n, val) {
    n.selected = val;
    if (Array.isArray(n.children)) {
      n.children.forEach(c => setRecursive(c, val));
    }
  }

  setRecursive(targetNode, isChecked);

  // Si se marcó como checked, asegurarse de que los ancestros también estén seleccionados
  if (isChecked) {
    function markAncestors(nodes, id) {
      for (const n of nodes) {
        if (n.id === id) return true;
        if (Array.isArray(n.children) && n.children.length > 0) {
          if (markAncestors(n.children, id)) {
            n.selected = true;
            return true;
          }
        }
      }
      return false;
    }
    markAncestors(tree, nodeId);
  } else {
    // Si se desmarcó, revisar si todos los hijos de un padre quedaron desmarcados para reflejar estado
    function checkParents(nodes) {
      for (const n of nodes) {
        if (Array.isArray(n.children) && n.children.length > 0) {
          checkParents(n.children);
          const hasAnyCheckedChild = n.children.some(c => c.selected !== false);
          if (!hasAnyCheckedChild) {
            n.selected = false;
          }
        }
      }
    }
    checkParents(tree);
  }

  persistLocalData();
  renderPresupuestoView();
}

export function togglePresupuestoSelectAll(isChecked) {
  if (!canCurrentUserEditProject(getActiveProjectId()) || isTabLocked('presupuesto')) {
    showToast('La pestaña de Presupuesto está bloqueada o en modo solo lectura.', 'warning');
    renderPresupuestoView();
    return;
  }
  const tree = state.treeData || [];
  function setAll(nodes, val) {
    nodes.forEach(n => {
      n.selected = val;
      if (Array.isArray(n.children)) setAll(n.children, val);
    });
  }
  setAll(tree, isChecked);
  persistLocalData();
  renderPresupuestoView();
}

// ---------------------------------------------------------------------------
// Agrupar / Desagrupar conceptos por partida (Expandir / Contraer)
// ---------------------------------------------------------------------------

export function togglePresupuestoSubtituloExpand(nodeId, e) {
  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
  }
  const tree = state.treeData || [];
  const node = findNodeById(tree, nodeId);
  if (!node) return;
  node.expanded = node.expanded === false ? true : false;
  persistLocalData();
  renderPresupuestoView();
}

export function agruparPresupuestoConceptos() {
  function collapseRecursive(nodes) {
    nodes.forEach(n => {
      if (isSubtituloNode(n) || (Array.isArray(n.children) && n.children.length > 0)) {
        n.expanded = false;
        if (Array.isArray(n.children)) collapseRecursive(n.children);
      }
    });
  }
  collapseRecursive(state.treeData || []);
  persistLocalData();
  renderPresupuestoView();
  showToast('Conceptos agrupados por partida.', 'info');
}

export function desagruparPresupuestoConceptos() {
  function expandRecursive(nodes) {
    nodes.forEach(n => {
      if (isSubtituloNode(n) || (Array.isArray(n.children) && n.children.length > 0)) {
        n.expanded = true;
        if (Array.isArray(n.children)) expandRecursive(n.children);
      }
    });
  }
  expandRecursive(state.treeData || []);
  persistLocalData();
  renderPresupuestoView();
  showToast('Conceptos desagrupados.', 'info');
}

// ---------------------------------------------------------------------------
// Handlers UI expuestos en window
// ---------------------------------------------------------------------------

export function onPresupuestoAddNota() {
  if (!guardTabUnlocked('presupuesto')) return;
  const cfg = getProjectPresupuestoConfig();
  if (!Array.isArray(cfg.notas)) cfg.notas = [];
  cfg.notas.push('Nueva nota o condición comercial.');
  savePresupuestoSettings();
  renderPresupuestoView();
}

export function onPresupuestoEditNota(index, text) {
  if (!guardTabUnlocked('presupuesto')) {
    renderPresupuestoView();
    return;
  }
  const cfg = getProjectPresupuestoConfig();
  if (!Array.isArray(cfg.notas) || index < 0 || index >= cfg.notas.length) return;
  cfg.notas[index] = String(text ?? '').trim();
  savePresupuestoSettings();
  renderPresupuestoView();
}

export function onPresupuestoDeleteNota(index) {
  if (!guardTabUnlocked('presupuesto')) return;
  const cfg = getProjectPresupuestoConfig();
  if (!Array.isArray(cfg.notas) || index < 0 || index >= cfg.notas.length) return;
  cfg.notas.splice(index, 1);
  savePresupuestoSettings();
  renderPresupuestoView();
}

export function onPresupuestoResetNotas() {
  if (!guardTabUnlocked('presupuesto')) return;
  const cfg = getProjectPresupuestoConfig();
  cfg.notas = getDefaultPresupuestoNotas(cfg);
  savePresupuestoSettings();
  showToast('Notas base restauradas.', 'info');
  renderPresupuestoView();
}

export function onPresupuestoPrint() {
  printPresupuestoCotizacion();
}

export function onPresupuestoExportExcel() {
  exportPresupuestoExcel();
}

if (typeof window !== 'undefined') {
  window.renderPresupuestoView = renderPresupuestoView;
  window.onPresupuestoAddNota = onPresupuestoAddNota;
  window.onPresupuestoEditNota = onPresupuestoEditNota;
  window.onPresupuestoDeleteNota = onPresupuestoDeleteNota;
  window.onPresupuestoResetNotas = onPresupuestoResetNotas;
  window.onPresupuestoPrint = onPresupuestoPrint;
  window.onPresupuestoExportExcel = onPresupuestoExportExcel;
  window.togglePresupuestoSelectNode = togglePresupuestoSelectNode;
  window.togglePresupuestoSelectAll = togglePresupuestoSelectAll;
  window.togglePresupuestoSubtituloExpand = togglePresupuestoSubtituloExpand;
  window.agruparPresupuestoConceptos = agruparPresupuestoConceptos;
  window.desagruparPresupuestoConceptos = desagruparPresupuestoConceptos;
}
