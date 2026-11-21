import { state } from '../../state/store.js?v=20261121_cf45';
import { findNodeById } from '../catalog/treeService.js?v=20261121_cf45';
import { formatMoney, formatQty, round2 } from '../../core/formatters.js?v=20261121_cf45';
import { calculateParentTotal } from '../../core/calculations.js?v=20261121_cf45';
import { showToast } from '../../ui/notifications.js?v=20261121_cf45';
import { getActiveProjectId } from '../../config/constants.js?v=20261121_cf45';
import { canCurrentUserEditProject } from '../portal/projectService.js?v=20261121_cf45';
import { guardTabUnlocked } from '../../ui/tabLockController.js?v=20261121_cf45';
import { scheduleExpensesCloudSync } from '../../core/cloudModulesSyncService.js?v=20261121_cf45';
import {
  cleanPhoneForWhatsApp,
  addCotizacion,
  updateCotizacion,
  deleteCotizacion,
  setCotizacionGanadora,
  unsetCotizacionGanadora,
  attachCotizacionFileS3,
  getCotizacionHierarchyStatus,
  getCotizacionBlockMessage
} from './cotizacionesService.js?v=20261121_cf45';
import {
  uploadCotizacionAttachment,
  openCotizacionAttachmentFromS3,
  deleteCotizacionAttachmentFromS3,
  migrateInlineAttachmentsInBackground
} from '../../services/cotizacionFilesS3.js?v=20261121_cf45';

let activeSideTab = 'proveedores';
let currentEditingCotId = null;

/**
 * Cambia / asegura la pestaña activa del panel lateral derecho (Cotizaciones / Proveedores)
 * @param {'proveedores'} tabName 
 */
export function switchSidePanelTab(tabName = 'proveedores') {
  activeSideTab = 'proveedores';

  const btnProveedores = document.getElementById('side-tab-btn-proveedores');
  const viewProveedores = document.getElementById('side-view-proveedores');
  const quickActions = document.getElementById('side-panel-proveedores-quickactions');

  if (btnProveedores) {
    btnProveedores.className = "px-2.5 py-1 rounded-md text-[11px] font-bold bg-white text-blue-700 shadow-xs flex items-center gap-1.5 transition cursor-pointer";
  }
  if (viewProveedores) viewProveedores.classList.remove('hidden');
  if (quickActions) quickActions.classList.remove('hidden');

  const node = state.activeSelectedId ? findNodeById(state.treeData, state.activeSelectedId) : null;
  if (node) {
    renderCotizacionesSidePanel(node);
  }
}

/**
 * Obtiene la pestaña actualmente activa del panel lateral
 */
export function getActiveSidePanelTab() {
  return activeSideTab;
}

function escapeProvHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeProvJs(str) {
  return escapeProvHtml(String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

function persistProveedoresCloudSummary() {
  const pid = getActiveProjectId();
  if (!pid || typeof localStorage === 'undefined') return;
  try {
    const provList = [];
    const walk = (nodes) => {
      (nodes || []).forEach(n => {
        if (Array.isArray(n.cotizaciones)) {
          n.cotizaciones.forEach(c => {
            if (c && c.id) {
              provList.push({
                id: c.id,
                nombre: c.proveedor || '',
                proveedor: c.proveedor || '',
                telefono: c.telefono || '',
                email: c.email || '',
                especialidad: n.descripcion || 'Especialista',
                notas: c.notas || '',
                monto: Number(c.monto) || 0,
                costo: Number(c.costo) || 0,
                isGanador: Boolean(c.isGanador),
                nodeId: n.id,
                clave: n.clave || ''
              });
            }
          });
        }
        if (Array.isArray(n.children)) walk(n.children);
      });
    };
    walk(state.treeData || []);
    localStorage.setItem(`adm_arq_proveedores_${pid}`, JSON.stringify(provList));
    scheduleExpensesCloudSync(pid);
  } catch (_) {}
}

function updateSidePanelAddButtonState(status) {
  const addBtn = document.getElementById('btn-add-cotizacion-sidepanel');
  if (!addBtn) return;

  const canAdd = Boolean(status && status.canAddCotizacion);
  addBtn.disabled = !canAdd;
  addBtn.title = canAdd
    ? 'Agregar nueva cotización de especialista'
    : getCotizacionBlockMessage(status);
  addBtn.className = canAdd
    ? 'bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] px-2 py-1 rounded font-semibold shadow-xs flex items-center gap-1 transition cursor-pointer'
    : 'bg-slate-200 text-slate-400 text-[10px] px-2 py-1 rounded font-semibold flex items-center gap-1 transition cursor-not-allowed opacity-70';
}

function renderCotizacionContactHtml(cot) {
  const cleanPhone = cleanPhoneForWhatsApp(cot.telefono);
  const tieneTelefono = Boolean(cot.telefono && cot.telefono.trim().length > 0);
  const tieneEmail = Boolean(cot.email && cot.email.trim().length > 0);

  if (!tieneTelefono && !tieneEmail) {
    return '<div class="text-[9px] text-slate-400 italic">Sin datos de teléfono o correo registrados.</div>';
  }

  return `
    <div class="flex flex-wrap items-center gap-2 pt-0.5">
      ${tieneTelefono ? `
        <div class="flex items-center gap-1">
          <a href="tel:${escapeProvHtml(cot.telefono)}" class="text-[10px] text-slate-700 hover:text-blue-600 flex items-center gap-1 font-mono font-medium" title="Llamar a ${escapeProvHtml(cot.telefono)}">
            <i class="fa-solid fa-phone text-slate-400 text-[9px]"></i> ${escapeProvHtml(cot.telefono)}
          </a>
          ${cleanPhone ? `
            <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer"
               class="text-[9px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1 transition"
               title="Abrir chat de WhatsApp con ${escapeProvHtml(cot.proveedor)}">
              <i class="fa-brands fa-whatsapp text-emerald-600 text-[10px]"></i> WhatsApp
            </a>
          ` : ''}
        </div>
      ` : ''}
      ${tieneEmail ? `
        <a href="mailto:${escapeProvHtml(cot.email)}" class="text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 transition truncate max-w-[210px]" title="Enviar correo a ${escapeProvHtml(cot.email)}">
          <i class="fa-regular fa-envelope text-blue-600 text-[9px]"></i>
          <span class="truncate">${escapeProvHtml(cot.email)}</span>
        </a>
      ` : ''}
    </div>
  `;
}

function renderBlockedSubconceptPanel(container, status) {
  const node = status.node;
  const anc = status.blockingAncestor;
  const ancClave = escapeProvHtml(anc?.clave || 'Nivel 1');
  const ancDesc = escapeProvHtml(anc?.descripcion || 'Concepto superior');

  container.innerHTML = `
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/60">
      <div class="p-2.5 bg-white border-b border-slate-200 shrink-0">
        <div class="flex items-center gap-1.5 overflow-hidden">
          <span class="bg-indigo-100 text-indigo-700 font-bold text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0">${escapeProvHtml(node.clave || '')}</span>
          <span class="font-bold text-xs text-slate-800 truncate" title="${escapeProvHtml(node.descripcion || '')}">${escapeProvHtml(node.descripcion || 'Sin descripción')}</span>
        </div>
      </div>
      <div class="flex-1 overflow-auto p-4 flex items-center justify-center">
        <div class="bg-white border-2 border-dashed border-slate-300 rounded-xl p-5 text-center max-w-sm shadow-2xs">
          <div class="w-11 h-11 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-3 text-base border border-slate-200">
            <i class="fa-solid fa-lock"></i>
          </div>
          <h4 class="text-xs font-bold text-slate-800 mb-1.5">Cotizaciones bloqueadas en subconcepto</h4>
          <p class="text-[11px] text-slate-600 leading-relaxed mb-3">
            No se pueden agregar cotizaciones en este subconcepto porque el concepto superior
            <strong class="text-slate-800">[${ancClave}] ${ancDesc}</strong> ya cuenta con cotizaciones registradas.
          </p>
          ${anc ? `
            <button type="button" onclick="window.selectRowAndOpenProveedores('${escapeProvHtml(anc.id)}', event)"
                    class="bg-blue-600 hover:bg-blue-500 text-white text-[11px] px-3 py-1.5 rounded-lg font-semibold shadow-xs inline-flex items-center gap-1.5 transition cursor-pointer">
              <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Ver cotizaciones de [${ancClave}]
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderConsolidatedParentPanel(container, status) {
  const node = status.node;
  const selectedItems = status.selectedDescendantQuotes || [];
  const pendingItems = status.descendantPendingWinner || [];
  const consolidatedTotal = calculateParentTotal(node);
  const selectedCount = selectedItems.length;

  let html = `
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/60">
      <div class="p-2.5 bg-white border-b border-slate-200 shrink-0">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 overflow-hidden">
            <span class="bg-indigo-100 text-indigo-700 font-bold text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0">${escapeProvHtml(node.clave || '')}</span>
            <span class="font-bold text-xs text-slate-800 truncate" title="${escapeProvHtml(node.descripcion || '')}">${escapeProvHtml(node.descripcion || 'Sin descripción')}</span>
          </div>
          <span class="bg-slate-100 text-slate-700 border border-slate-300 font-mono font-bold text-[9px] px-1.5 py-0.5 rounded shrink-0">
            Unidad: lote
          </span>
        </div>

        ${selectedCount > 0 ? `
          <div class="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 overflow-hidden">
              <span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shrink-0 font-bold">
                <i class="fa-solid fa-layer-group"></i>
              </span>
              <div class="overflow-hidden">
                <span class="text-[9px] font-bold text-emerald-800 uppercase tracking-wide block">Consolidado de Subniveles (${selectedCount} ${selectedCount === 1 ? 'seleccionada' : 'seleccionadas'}):</span>
                <span class="text-[10px] font-semibold text-emerald-900 block truncate">Suma de cotizaciones elegidas en subconceptos</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <span class="text-xs font-extrabold text-emerald-700 font-mono block">${formatMoney(consolidatedTotal)}</span>
              <span class="text-[8px] text-emerald-600 font-semibold">Total del Lote</span>
            </div>
          </div>
        ` : `
          <div class="mt-2 p-2 bg-amber-50 border border-amber-200/80 rounded-lg flex items-center justify-between gap-2 text-amber-800 text-[10px]">
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-exclamation text-amber-600 shrink-0"></i>
              <span>Hay cotizaciones en subniveles, pero ninguna seleccionada aún. Selecciona las ganadoras en cada subconcepto para calcular el lote.</span>
            </div>
            <span class="text-xs font-extrabold font-mono text-amber-900 shrink-0">${formatMoney(0)}</span>
          </div>
        `}
      </div>

      <div class="flex-1 overflow-auto p-2.5 space-y-2.5">
  `;

  if (selectedCount === 0) {
    html += `
      <div class="bg-white border-2 border-dashed border-amber-200 rounded-xl p-5 text-center text-slate-500 my-2">
        <div class="w-11 h-11 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2.5 text-lg">
          <i class="fa-solid fa-hourglass-half"></i>
        </div>
        <h4 class="text-xs font-bold text-slate-700 mb-1">Sin cotizaciones seleccionadas en subconceptos</h4>
        <p class="text-[10px] text-slate-500 max-w-xs mx-auto mb-3 leading-relaxed">
          Mientras los subconceptos no tengan una cotización seleccionada como ganadora, el total del concepto nivel 1 permanece en <strong>$0.00</strong>.
        </p>
      </div>
    `;
  } else {
    selectedItems.forEach((item) => {
      const subNode = item.node;
      const cot = item.cotizacion;
      const tienePdf = Boolean(cot.archivoS3Key || cot.archivoData || (cot.archivoNombre && cot.archivoNombre.trim().length > 0));
      html += `
        <div class="rounded-xl bg-white border-2 border-emerald-500/80 shadow-sm p-3 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span class="bg-blue-100 text-blue-800 font-bold text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0">${escapeProvHtml(subNode.clave || '')}</span>
              <span class="text-[10px] font-semibold text-slate-700 truncate" title="${escapeProvHtml(subNode.descripcion || '')}">${escapeProvHtml(subNode.descripcion || '')}</span>
            </div>
            <button type="button" onclick="window.selectRowAndOpenProveedores('${escapeProvHtml(subNode.id)}', event)"
                    class="text-[9px] font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-1.5 py-0.5 rounded transition shrink-0 cursor-pointer"
                    title="Abrir cotizaciones de [${escapeProvHtml(subNode.clave || '')}]">
              Ver <i class="fa-solid fa-chevron-right text-[8px]"></i>
            </button>
          </div>

          <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
            <div class="overflow-hidden flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-xs text-slate-800">${escapeProvHtml(cot.proveedor)}</span>
                <span class="bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <i class="fa-solid fa-check text-[8px]"></i> Elegido
                </span>
              </div>
              ${cot.fecha ? `<span class="text-[9px] text-slate-400 block mt-0.5">Fecha: ${escapeProvHtml(cot.fecha)}</span>` : ''}
            </div>
            <div class="text-right shrink-0">
              <span class="text-sm font-extrabold font-mono text-emerald-700">${formatMoney(item.conceptTotal)}</span>
              <span class="text-[9px] text-slate-500 block font-mono">
                ${formatQty(subNode.cantidad || 0)} ${escapeProvHtml(subNode.unidad || 'pza')} × ${formatMoney(cot.monto)}
              </span>
              ${cot.tiempoEntrega ? `<span class="text-[9px] text-slate-500 block font-medium"><i class="fa-regular fa-clock text-[8px] mr-0.5"></i> ${escapeProvHtml(cot.tiempoEntrega)}</span>` : ''}
            </div>
          </div>

          ${renderCotizacionContactHtml(cot)}

          ${tienePdf ? `
            <div class="pt-1 border-t border-slate-100">
              <button type="button" onclick="window.handleViewCotizacionPdf('${escapeProvHtml(subNode.id)}', '${escapeProvHtml(cot.id)}')"
                      class="text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-md flex items-center gap-1 transition cursor-pointer max-w-[240px] truncate"
                      title="Ver o descargar cotización: ${escapeProvHtml(cot.archivoNombre)}">
                <i class="fa-solid fa-file-pdf text-rose-600 text-[11px] shrink-0"></i>
                <span class="truncate">${escapeProvHtml(cot.archivoNombre)}</span>
                ${cot.archivoSize ? `<span class="text-[8px] text-rose-500 font-mono">(${escapeProvHtml(cot.archivoSize)})</span>` : ''}
              </button>
            </div>
          ` : ''}

          ${cot.notas ? `
            <div class="bg-slate-50 border border-slate-200/70 rounded p-1.5 text-[10px] text-slate-600 leading-snug">
              <span class="font-bold text-slate-500 block text-[9px] uppercase tracking-wider mb-0.5">Alcance / Notas:</span>
              ${escapeProvHtml(cot.notas)}
            </div>
          ` : ''}
        </div>
      `;
    });
  }

  if (pendingItems.length > 0) {
    html += `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[10px] text-amber-900">
        <div class="font-bold mb-1.5 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-info text-amber-600"></i>
          Subconceptos sin ganador seleccionado (${pendingItems.length}):
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${pendingItems.map(ch => `
            <button type="button" onclick="window.selectRowAndOpenProveedores('${escapeProvHtml(ch.id)}', event)"
                    class="bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-md px-2 py-0.5 text-[10px] font-semibold transition cursor-pointer">
              [${escapeProvHtml(ch.clave || '')}] Elegir ganador ($0.00)
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  html += `
      </div>

      <div class="p-2.5 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between">
        <span class="text-[10px] text-slate-500">
          <strong class="text-slate-700">${selectedCount}</strong> ${selectedCount === 1 ? 'cotización seleccionada' : 'cotizaciones seleccionadas'} (Unidad: <strong class="font-mono text-slate-700">lote</strong>)
        </span>
        <span class="text-xs font-extrabold text-emerald-700 font-mono">
          Total: ${formatMoney(consolidatedTotal)}
        </span>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Renderiza el listado de tarjetas de cotizaciones en el panel lateral
 * @param {Object} node 
 */
export function renderCotizacionesSidePanel(node) {
  const container = document.getElementById('side-view-proveedores');
  const badgeCount = document.getElementById('badge-count-cotizaciones');
  if (!container) return;

  if (!node) {
    updateSidePanelAddButtonState(null);
    container.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
        <i class="fa-solid fa-layer-group text-3xl mb-2 text-slate-300"></i>
        <p class="text-xs font-semibold">Selecciona un concepto en la Tabla de Alcances</p>
        <p class="text-[10px] text-slate-400 mt-1">Podrás comparar propuestas de especialistas para ese entregable.</p>
      </div>
    `;
    if (badgeCount) badgeCount.classList.add('hidden');
    return;
  }

  const status = getCotizacionHierarchyStatus(node.id);
  updateSidePanelAddButtonState(status);

  const cotizaciones = status.ownCotizaciones;
  const count = cotizaciones.length;

  if (count === 0 && status.blockReason === 'ancestor_has_quotes') {
    if (badgeCount) badgeCount.classList.add('hidden');
    renderBlockedSubconceptPanel(container, status);
    return;
  }

  if (count === 0 && status.blockReason === 'descendant_has_quotes') {
    if (badgeCount) {
      const selCount = status.selectedDescendantQuotes.length;
      if (selCount > 0) {
        badgeCount.innerText = selCount;
        badgeCount.classList.remove('hidden');
      } else {
        badgeCount.classList.add('hidden');
      }
    }
    renderConsolidatedParentPanel(container, status);
    return;
  }

  migrateInlineAttachmentsInBackground(node, (cotId, s3Res) => {
    attachCotizacionFileS3(node.id, cotId, s3Res);
  });

  // Actualizar contador en la pestaña
  if (badgeCount) {
    if (count > 0) {
      badgeCount.innerText = count;
      badgeCount.classList.remove('hidden');
    } else {
      badgeCount.classList.add('hidden');
    }
  }

  // Cálculos comparativos (mínimo, máximo, promedio)
  let minMonto = Infinity;
  let maxMonto = 0;
  let sumMonto = 0;
  let cotGanadora = null;

  cotizaciones.forEach(c => {
    const qty = (c.cantidad !== undefined && c.cantidad !== null && c.cantidad !== '') ? (parseFloat(c.cantidad) || 1) : 1;
    const cost = (c.costo !== undefined && c.costo !== null) ? Number(c.costo) : round2((parseFloat(c.monto) || 0) * (qty > 0 ? qty : 1));
    if (cost < minMonto) minMonto = cost;
    if (cost > maxMonto) maxMonto = cost;
    sumMonto += cost;
    if (c.isGanador) cotGanadora = c;
  });

  const avgMonto = count > 0 ? (sumMonto / count) : 0;
  const difAhorro = maxMonto > minMonto ? (maxMonto - minMonto) : 0;

  const cotGanadoraQty = (cotGanadora && cotGanadora.cantidad !== undefined && cotGanadora.cantidad !== null && cotGanadora.cantidad !== '') ? (parseFloat(cotGanadora.cantidad) || 1) : 1;
  const cotGanadoraCost = cotGanadora ? ((cotGanadora.costo !== undefined && cotGanadora.costo !== null) ? Number(cotGanadora.costo) : round2(Number(cotGanadora.monto || 0) * (cotGanadoraQty > 0 ? cotGanadoraQty : 1))) : 0;

  // Render HTML
  let html = `
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/60">
      
      <!-- Barra Informativa del Concepto -->
      <div class="p-2.5 bg-white border-b border-slate-200 shrink-0">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 overflow-hidden">
            <span class="bg-indigo-100 text-indigo-700 font-bold text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0">${escapeProvHtml(node.clave || '')}</span>
            <span class="font-bold text-xs text-slate-800 truncate" title="${escapeProvHtml(node.descripcion || '')}">${escapeProvHtml(node.descripcion || 'Sin descripción')}</span>
          </div>
        </div>

        ${cotGanadora ? `
          <div class="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 overflow-hidden">
              <span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shrink-0 font-bold">
                <i class="fa-solid fa-check"></i>
              </span>
              <div class="overflow-hidden">
                <span class="text-[9px] font-bold text-emerald-800 uppercase tracking-wide block">Proveedor Elegido para Alcances:</span>
                <span class="text-xs font-bold text-emerald-950 truncate block">${escapeProvHtml(cotGanadora.proveedor)}</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <span class="text-xs font-extrabold text-emerald-700 font-mono block">${formatMoney(cotGanadoraCost)}</span>
              <span class="text-[8px] text-emerald-600 font-semibold block">
                ${cotGanadoraQty > 1 ? `${formatMoney(cotGanadora.monto)} × ${formatQty(cotGanadoraQty)} ${escapeProvHtml(cotGanadora.unidad || '')}` : 'Costo de Cotización'}
              </span>
            </div>
          </div>
        ` : `
          <div class="mt-2 p-1.5 bg-amber-50 border border-amber-200/80 rounded-lg flex items-center gap-1.5 text-amber-800 text-[10px]">
            <i class="fa-solid fa-circle-exclamation text-amber-600 shrink-0"></i>
            <span>Sin proveedor seleccionado aún (total actual: <strong>$0.00</strong>). Elige uno marcando la casilla redonda para asignar su costo.</span>
          </div>
        `}

        <!-- Mini Comparativa (Si hay 2 o más propuestas) -->
        ${count >= 2 ? `
          <div class="mt-2 grid grid-cols-3 gap-1 text-center bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-[9px]">
            <div>
              <span class="text-slate-500 block">Más económica:</span>
              <span class="font-bold text-emerald-700 font-mono">${formatMoney(minMonto)}</span>
            </div>
            <div>
              <span class="text-slate-500 block">Promedio:</span>
              <span class="font-bold text-slate-700 font-mono">${formatMoney(avgMonto)}</span>
            </div>
            <div>
              <span class="text-slate-500 block">Margen comparativo:</span>
              <span class="font-bold text-indigo-700 font-mono">${formatMoney(difAhorro)}</span>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Lista Scrollable de Tarjetas de Cotizaciones -->
      <div class="flex-1 overflow-auto p-2.5 space-y-2.5">
  `;

  if (count === 0) {
    html += `
      <div class="bg-white border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 my-4">
        <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 text-lg">
          <i class="fa-solid fa-users-viewfinder"></i>
        </div>
        <h4 class="text-xs font-bold text-slate-700 mb-1">Sin cotizaciones de especialistas</h4>
        <p class="text-[10px] text-slate-500 max-w-xs mx-auto mb-3 leading-relaxed">
          Para este concepto (ingeniería, cálculo, estudio o subcontrato) puedes registrar y comparar cotizaciones de diferentes ingenieros o despachos.
        </p>
        <button type="button" onclick="window.openAddCotizacionModal()" class="bg-blue-600 hover:bg-blue-500 text-white text-[11px] px-3 py-1.5 rounded-lg font-semibold shadow-sm inline-flex items-center gap-1.5 transition cursor-pointer">
          <i class="fa-solid fa-plus text-[10px]"></i> Agregar Primera Cotización
        </button>
      </div>
    `;
  } else {
    cotizaciones.forEach((cot) => {
      const isWinner = Boolean(cot.isGanador);
      const tienePdf = Boolean(cot.archivoS3Key || cot.archivoData || (cot.archivoNombre && cot.archivoNombre.trim().length > 0));
      const cotQty = (cot.cantidad !== undefined && cot.cantidad !== null && cot.cantidad !== '') ? (parseFloat(cot.cantidad) || 1) : 1;
      const cotCost = (cot.costo !== undefined && cot.costo !== null) ? Number(cot.costo) : round2(Number(cot.monto || 0) * (cotQty > 0 ? cotQty : 1));

      html += `
        <div class="rounded-xl transition-all duration-200 ${isWinner ? 'bg-white border-2 border-emerald-500 shadow-md ring-2 ring-emerald-500/20' : 'bg-white border border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm'} p-3 flex flex-col gap-2">
          
          <!-- Encabezado de Tarjeta: Selector Ganador, Proveedor y Precio -->
          <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
            <div class="flex items-start gap-2 flex-1 overflow-hidden">
              <label class="cursor-pointer flex items-center gap-1.5 mt-0.5 shrink-0" title="${isWinner ? 'Proveedor ganador actualmente asignado' : 'Hacer clic para elegir a este proveedor como ganador'}">
                <input type="radio" name="cotizacion-ganador-${escapeProvHtml(node.id)}" ${isWinner ? 'checked' : ''} 
                       onchange="window.handleSelectCotizacionGanador('${escapeProvHtml(node.id)}', '${escapeProvHtml(cot.id)}', this.checked)"
                       class="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer">
              </label>

              <div class="overflow-hidden flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-bold text-xs text-slate-800">${escapeProvHtml(cot.proveedor)}</span>
                  ${isWinner ? `
                    <span class="bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <i class="fa-solid fa-check text-[8px]"></i> Elegido
                    </span>
                    <button type="button" onclick="window.handleSelectCotizacionGanador('${escapeProvHtml(node.id)}', '${escapeProvHtml(cot.id)}', false)"
                            class="text-[9px] text-slate-500 hover:text-rose-600 underline font-semibold cursor-pointer"
                            title="Quitar selección de proveedor ganador">
                      Quitar
                    </button>
                  ` : ''}
                </div>
                ${cot.fecha ? `<span class="text-[9px] text-slate-400 block mt-0.5">Fecha: ${escapeProvHtml(cot.fecha)}</span>` : ''}
              </div>
            </div>

            <!-- Costo Total de la Cotización -->
            <div class="text-right shrink-0">
              <span class="text-sm font-extrabold font-mono ${isWinner ? 'text-emerald-700' : 'text-slate-900'}">${formatMoney(cotCost)}</span>
              ${cotQty > 1 ? `
                <span class="text-[9px] text-slate-600 block font-mono">
                  ${formatMoney(cot.monto)}${cot.unidad ? ` / ${escapeProvHtml(cot.unidad)}` : ''} &times; ${formatQty(cotQty)}${cot.unidad ? ` ${escapeProvHtml(cot.unidad)}` : ''}
                </span>
              ` : `
                <span class="text-[9px] text-slate-500 block font-mono">
                  ${cot.unidad ? `Unidad: ${escapeProvHtml(cot.unidad)}` : 'Costo unitario'}
                </span>
              `}
              ${cot.tiempoEntrega ? `
                <span class="text-[9px] text-slate-500 block font-medium">
                  <i class="fa-regular fa-clock text-[8px] mr-0.5"></i> ${escapeProvHtml(cot.tiempoEntrega)}
                </span>
              ` : ''}
            </div>
          </div>

          <!-- Fila de Contacto: Teléfono (con WhatsApp) y Correo -->
          ${renderCotizacionContactHtml(cot)}

          <!-- Archivo PDF Adjunto -->
          <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div class="flex items-center gap-1.5 overflow-hidden">
              ${tienePdf ? `
                <button type="button" onclick="window.handleViewCotizacionPdf('${escapeProvHtml(node.id)}', '${escapeProvHtml(cot.id)}')" 
                        class="text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-md flex items-center gap-1 transition cursor-pointer max-w-[220px] truncate" 
                        title="Ver o descargar cotización original: ${escapeProvHtml(cot.archivoNombre)}">
                  <i class="fa-solid fa-file-pdf text-rose-600 text-[11px] shrink-0"></i>
                  <span class="truncate">${escapeProvHtml(cot.archivoNombre)}</span>
                  ${cot.archivoSize ? `<span class="text-[8px] text-rose-500 font-mono">(${escapeProvHtml(cot.archivoSize)})</span>` : ''}
                </button>
              ` : `
                <label class="text-[10px] text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-0.5 flex items-center gap-1 cursor-pointer transition" title="Adjuntar documento PDF de cotización">
                  <i class="fa-solid fa-paperclip text-slate-400 text-[9px]"></i>
                  <span>Adjuntar PDF</span>
                  <input type="file" accept=".pdf,image/*,.doc,.docx" class="hidden" onchange="window.handleUploadCotizacionFile('${escapeProvHtml(node.id)}', '${escapeProvHtml(cot.id)}', this)">
                </label>
              `}
            </div>

            <!-- Botones de Acción de Tarjeta: Editar / Eliminar -->
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" onclick="window.openEditCotizacionModal('${escapeProvJs(node.id)}', '${escapeProvJs(cot.id)}')" 
                      class="text-slate-400 hover:text-blue-600 text-[10px] p-1 rounded hover:bg-slate-100 transition cursor-pointer" 
                      title="Editar datos de la cotización">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button type="button" onclick="window.handleDeleteCotizacion('${escapeProvJs(node.id)}', '${escapeProvJs(cot.id)}')" 
                      class="text-slate-400 hover:text-rose-600 text-[10px] p-1 rounded hover:bg-rose-50 transition cursor-pointer" 
                      title="Eliminar esta cotización">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>

          <!-- Notas / Alcances incluidos -->
          ${cot.notas ? `
            <div class="bg-slate-50 border border-slate-200/70 rounded p-1.5 text-[10px] text-slate-600 leading-snug">
              <span class="font-bold text-slate-500 block text-[9px] uppercase tracking-wider mb-0.5">Alcance / Notas:</span>
              ${escapeProvHtml(cot.notas)}
            </div>
          ` : ''}

        </div>
      `;
    });
  }

  html += `
      </div>

      <!-- Pie del Panel: Botón Agregar Rápido -->
      <div class="p-2.5 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between">
        <span class="text-[10px] text-slate-500">
          <strong class="text-slate-700">${count}</strong> ${count === 1 ? 'propuesta registrada' : 'propuestas registradas'}
        </span>
        <button type="button" onclick="window.openAddCotizacionModal()" class="bg-blue-600 hover:bg-blue-500 text-white text-[11px] px-3 py-1.5 rounded-lg font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer">
          <i class="fa-solid fa-plus text-[9px]"></i> Agregar Cotización
        </button>
      </div>

    </div>
  `;

  container.innerHTML = html;
}

/**
 * Abre el modal para dar de alta o editar una cotización
 * @param {string|null} cotId Si es null, crea una nueva; si tiene id, edita
 */
export function openCotizacionModal(cotId = null) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo lectura: tu rol no permite agregar ni editar cotizaciones.', 'warning');
    return;
  }
  const viewPres = document.getElementById('view-presupuesto') || document.getElementById('view-insumos');
  const activeTabKey = (viewPres && !viewPres.classList.contains('hidden')) ? 'presupuesto' : 'alcances';
  if (!guardTabUnlocked(activeTabKey)) return;

  currentEditingCotId = cotId;
  const modal = document.getElementById('modal-cotizacion-proveedor');
  const title = document.getElementById('modal-cotizacion-title');
  const form = document.getElementById('form-cotizacion-proveedor');
  if (!modal || !form) return;

  const node = state.activeSelectedId ? findNodeById(state.treeData, state.activeSelectedId) : null;
  if (!node) {
    showToast('Selecciona un concepto primero.', 'warning');
    return;
  }

  if (!cotId) {
    const status = getCotizacionHierarchyStatus(node.id);
    if (!status.canAddCotizacion) {
      showToast(getCotizacionBlockMessage(status), 'warning');
      return;
    }
  }

  // Limpiar campos
  form.reset();
  document.getElementById('cot-modal-archivo-nombre').innerText = 'Ningún archivo seleccionado';
  document.getElementById('cot-modal-archivo-data').value = '';
  document.getElementById('cot-modal-archivo-size').value = '';

  const conceptoRef = document.getElementById('cot-modal-concepto-ref');
  if (conceptoRef) {
    conceptoRef.innerText = `[${node.clave || ''}] ${node.descripcion || ''}`;
  }

  const defaultQty = (node.cantidad !== undefined && node.cantidad !== null) ? node.cantidad : 1;
  const defaultUnit = node.unidad || 'pza';

  if (cotId) {
    // Modo Edición
    if (title) title.innerText = 'Editar Cotización de Especialista';
    const cot = (node.cotizaciones || []).find(c => c.id === cotId);
    if (cot) {
      document.getElementById('cot-proveedor').value = cot.proveedor || '';
      document.getElementById('cot-telefono').value = cot.telefono || '';
      document.getElementById('cot-email').value = cot.email || '';
      document.getElementById('cot-monto').value = cot.monto || '';
      document.getElementById('cot-cantidad').value =
        (cot.cantidad !== undefined && cot.cantidad !== null && cot.cantidad !== '') ? cot.cantidad : defaultQty;
      document.getElementById('cot-unidad').value = cot.unidad || defaultUnit;
      document.getElementById('cot-tiempo-entrega').value = cot.tiempoEntrega || '';
      document.getElementById('cot-notas').value = cot.notas || '';
      document.getElementById('cot-is-ganador').checked = Boolean(cot.isGanador);

      if (cot.archivoNombre) {
        document.getElementById('cot-modal-archivo-nombre').innerText = cot.archivoNombre;
        document.getElementById('cot-modal-archivo-data').value = cot.archivoData || '';
        document.getElementById('cot-modal-archivo-size').value = cot.archivoSize || '';
      }
    }
  } else {
    // Modo Nuevo (no preseleccionar como ganadora por defecto; el usuario decide cuál elegir)
    if (title) title.innerText = 'Nueva Cotización de Especialista';
    document.getElementById('cot-cantidad').value = defaultQty;
    document.getElementById('cot-unidad').value = defaultUnit;
    document.getElementById('cot-is-ganador').checked = false;
  }

  updateCotizacionModalCostoPreview();

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    document.getElementById('cot-proveedor').focus();
  }, 50);
}

/**
 * Actualiza el cálculo dinámico en tiempo real del Costo de la Cotización en el modal:
 * Costo de Cotización = Importe Cotizado x Cantidad
 */
export function updateCotizacionModalCostoPreview() {
  const montoInput = document.getElementById('cot-monto');
  const cantInput = document.getElementById('cot-cantidad');
  const unidadInput = document.getElementById('cot-unidad');
  const formulaEl = document.getElementById('cot-formula-preview');
  const totalEl = document.getElementById('cot-costo-total-preview');

  if (!formulaEl || !totalEl) return;

  const monto = montoInput ? (parseFloat(montoInput.value) || 0) : 0;
  const rawCant = cantInput ? cantInput.value.trim() : '';
  const cant = rawCant === '' ? 1 : (parseFloat(rawCant) || 0);
  const unidad = unidadInput ? unidadInput.value.trim() : '';

  const total = round2(monto * (cant > 0 ? cant : 1));

  const unidadStr = unidad ? ` ${escapeProvHtml(unidad)}` : '';
  const cantStr = formatQty(cant);
  const montoStr = formatMoney(monto);
  const totalStr = formatMoney(total);

  if (cant > 1 || unidad) {
    formulaEl.innerHTML = `${montoStr}${unidad ? ` / ${escapeProvHtml(unidad)}` : ''} &times; ${cantStr}${unidadStr} = <strong class="text-emerald-700">${totalStr}</strong>`;
  } else {
    formulaEl.innerHTML = `${montoStr} &times; ${cantStr} = <strong class="text-emerald-700">${totalStr}</strong>`;
  }
  totalEl.innerText = totalStr;
}

if (typeof window !== 'undefined') {
  window.updateCotizacionModalCostoPreview = updateCotizacionModalCostoPreview;
}

/**
 * Cierra el modal de cotizaciones
 */
export function closeCotizacionModal() {
  const modal = document.getElementById('modal-cotizacion-proveedor');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  currentEditingCotId = null;
}

/**
 * Guarda los datos del formulario de cotización (crear o editar)
 */
export function saveCotizacionForm(event) {
  if (event) event.preventDefault();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo lectura: tu rol no permite guardar cotizaciones.', 'warning');
    return;
  }
  const viewPres = document.getElementById('view-presupuesto') || document.getElementById('view-insumos');
  const activeTabKey = (viewPres && !viewPres.classList.contains('hidden')) ? 'presupuesto' : 'alcances';
  if (!guardTabUnlocked(activeTabKey)) return;

  const nodeId = state.activeSelectedId;
  if (!nodeId) {
    showToast('No hay concepto seleccionado.', 'error');
    return;
  }

  const proveedor = document.getElementById('cot-proveedor').value.trim();
  const telefono = document.getElementById('cot-telefono').value.trim();
  const email = document.getElementById('cot-email').value.trim();
  const monto = parseFloat(document.getElementById('cot-monto').value) || 0;
  const rawCantidad = document.getElementById('cot-cantidad').value;
  const cantidad = rawCantidad === '' ? 0 : (parseFloat(rawCantidad) || 0);
  const unidad = document.getElementById('cot-unidad').value.trim();
  const tiempoEntrega = document.getElementById('cot-tiempo-entrega').value.trim();
  const notas = document.getElementById('cot-notas').value.trim();
  const isGanador = document.getElementById('cot-is-ganador').checked;

  const archivoNombre = document.getElementById('cot-modal-archivo-nombre').innerText.trim();
  const archivoData = document.getElementById('cot-modal-archivo-data').value;
  const archivoSize = document.getElementById('cot-modal-archivo-size').value;

  if (!proveedor) {
    showToast('Por favor escribe el nombre del ingeniero o despacho proveedor.', 'warning');
    document.getElementById('cot-proveedor').focus();
    return;
  }

  if (monto <= 0) {
    showToast('Ingresa un importe de cotización válido mayor a 0.', 'warning');
    document.getElementById('cot-monto').focus();
    return;
  }

  const costo = round2(monto * (cantidad > 0 ? cantidad : 1));

  const prevCot = currentEditingCotId
    ? ((findNodeById(state.treeData, nodeId)?.cotizaciones || []).find(c => c.id === currentEditingCotId) || null)
    : null;
  const hasNewDataUrl = Boolean(archivoData && archivoData.startsWith('data:'));

  const payload = {
    proveedor,
    telefono,
    email,
    monto,
    cantidad,
    unidad,
    costo,
    total: costo,
    tiempoEntrega,
    notas,
    isGanador,
    archivoNombre: archivoNombre !== 'Ningún archivo seleccionado' ? archivoNombre : '',
    archivoData: archivoData || '',
    archivoSize: archivoSize || ''
  };

  let savedCot = null;
  if (currentEditingCotId) {
    savedCot = updateCotizacion(nodeId, currentEditingCotId, payload);
  } else {
    savedCot = addCotizacion(nodeId, payload);
  }
  persistProveedoresCloudSummary();

  if (hasNewDataUrl && savedCot?.id) {
    if (prevCot?.archivoS3Key) {
      deleteCotizacionAttachmentFromS3(prevCot).catch(() => {});
    }
    uploadCotizacionAttachment({
      dataUrl: archivoData,
      fileName: payload.archivoNombre || 'cotizacion.pdf'
    }).then((res) => {
      if (res?.s3Key) {
        attachCotizacionFileS3(nodeId, savedCot.id, res);
      }
    }).catch(() => {});
  }

  closeCotizacionModal();
}

/**
 * Procesa la selección de un archivo en el modal de cotización
 * @param {HTMLInputElement} inputEl 
 */
export function handleModalFileInputChange(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const nameEl = document.getElementById('cot-modal-archivo-nombre');
  const dataEl = document.getElementById('cot-modal-archivo-data');
  const sizeEl = document.getElementById('cot-modal-archivo-size');

  const formattedSize = file.size > 1024 * 1024 
    ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
    : (file.size / 1024).toFixed(0) + ' KB';

  if (nameEl) nameEl.innerText = file.name;
  if (sizeEl) sizeEl.value = formattedSize;

  const reader = new FileReader();
  reader.onload = (e) => {
    if (dataEl) dataEl.value = e.target.result;
    showToast(`Archivo "${file.name}" cargado listo para guardar.`, 'info');
  };
  reader.readAsDataURL(file);
}

/**
 * Permite subir un archivo directamente desde la tarjeta de una cotización ya existente
 * @param {string} nodeId 
 * @param {string} cotId 
 * @param {HTMLInputElement} inputEl 
 */
export function handleCardDirectFileUpload(nodeId, cotId, inputEl) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo lectura: tu rol no permite subir archivos de cotización.', 'warning');
    if (inputEl) inputEl.value = '';
    return;
  }
  const viewPres = document.getElementById('view-presupuesto') || document.getElementById('view-insumos');
  const activeTabKey = (viewPres && !viewPres.classList.contains('hidden')) ? 'presupuesto' : 'alcances';
  if (!guardTabUnlocked(activeTabKey)) {
    if (inputEl) inputEl.value = '';
    return;
  }
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const formattedSize = file.size > 1024 * 1024 
    ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
    : (file.size / 1024).toFixed(0) + ' KB';

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    const prevCot = (findNodeById(state.treeData, nodeId)?.cotizaciones || []).find(c => c.id === cotId) || null;
    updateCotizacion(nodeId, cotId, {
      archivoNombre: file.name,
      archivoData: dataUrl,
      archivoSize: formattedSize
    });
    persistProveedoresCloudSummary();
    try {
      const s3Res = await uploadCotizacionAttachment({ dataUrl, fileName: file.name });
      if (s3Res?.s3Key) {
        if (prevCot?.archivoS3Key && prevCot.archivoS3Key !== s3Res.s3Key) {
          deleteCotizacionAttachmentFromS3(prevCot).catch(() => {});
        }
        attachCotizacionFileS3(nodeId, cotId, s3Res);
        showToast(`Cotización "${file.name}" respaldada en la nube.`, 'success');
        return;
      }
    } catch (_) {}
    showToast(`Cotización "${file.name}" adjuntada con éxito.`, 'success');
  };
  reader.readAsDataURL(file);
}

/**
 * Visualiza el archivo PDF de una cotización abriéndolo en una nueva pestaña del navegador
 * @param {string} nodeId 
 * @param {string} cotId 
 */
export function viewCotizacionPdf(nodeId, cotId) {
  const node = findNodeById(state.treeData, nodeId);
  if (!node) return;

  const cot = (node.cotizaciones || []).find(c => c.id === cotId);
  if (!cot || (!cot.archivoS3Key && !cot.archivoData)) {
    showToast('Esta cotización no tiene documento adjunto.', 'warning');
    return;
  }

  if (cot.archivoS3Key) {
    openCotizacionAttachmentFromS3(cot).catch((err) => {
      showToast(err?.message || 'No se pudo abrir el documento en la nube.', 'error');
    });
    return;
  }

  // Si es un enlace externo (Drive, Dropbox, etc.)
  if (cot.archivoData.startsWith('http://') || cot.archivoData.startsWith('https://')) {
    window.open(cot.archivoData, '_blank');
    return;
  }

  // Si es Data URL Base64
  try {
    const parts = cot.archivoData.split(',');
    if (parts.length === 2) {
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      return;
    }
  } catch (err) {
    console.warn('Error abriendo blob de cotización:', err);
  }

  window.open(cot.archivoData, '_blank');
}
