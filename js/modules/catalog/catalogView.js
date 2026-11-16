import { state } from '../../state/store.js?v=20261116_cf6';
import { formatMoney, formatQty, getCurrencySymbol, round2 } from '../../core/formatters.js?v=20261116_cf6';
import { getHierarchyColor } from '../../core/colors.js?v=20261116_cf6';
import { calculateParentTotal, getEffectivePrecioUnitario, updateGrandTotal, updateSobrecostoBadge, calculateProrrateoCascade, getGroupProrrateoStatus } from '../../core/calculations.js?v=20261116_cf6';
import { findNodeById } from './treeService.js?v=20261116_cf6';
import { APU_WIDTH_KEY } from '../../config/constants.js?v=20261116_cf6';
import { clampApuWidth } from '../../ui/resizer.js?v=20261116_cf6';
import { isTabLocked, applyTabLocksToDOM } from '../../ui/tabLockController.js?v=20261116_cf6';
import { canCurrentUserEditProject } from '../portal/projectService.js?v=20261116_cf6';
import { renderPartidaNivel1ChatButton, renderProjectChatDock } from '../chat/projectChat.js?v=20261116_cf6';
import { switchSidePanelTab } from '../proveedores/proveedoresView.js?v=20261116_cf6';
import { getCotizacionHierarchyStatus } from '../proveedores/cotizacionesService.js?v=20261116_cf6';

const SIDEPANEL_BTN_BASE_CLASS = 'sidepanel-row-btn px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0';
const SIDEPANEL_BTN_ACTIVE_CLASS = `${SIDEPANEL_BTN_BASE_CLASS} bg-blue-600 text-white shadow-xs`;
const SIDEPANEL_BTN_IDLE_CLASS = `${SIDEPANEL_BTN_BASE_CLASS} bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200`;
const SIDEPANEL_BTN_BLOCKED_CLASS = `${SIDEPANEL_BTN_BASE_CLASS} bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-300`;
// Elementos cuya interacción mantiene abierto el panel lateral (propio panel, divisor, botones Cotiz. y modales como #modal-cotizacion-proveedor)
const APU_PANEL_KEEP_OPEN_SELECTOR = '#apu-panel, #panel-resizer, .sidepanel-row-btn, [id^="modal-"]';

let activeSidePanelNodeId = null;
let lastMouseDownInsideApuPanel = false;

function getIdleSidePanelBtnClass(btn) {
  return btn && btn.dataset.locked === '1' ? SIDEPANEL_BTN_BLOCKED_CLASS : SIDEPANEL_BTN_IDLE_CLASS;
}

function escapeCatalogHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderConceptQuoteBadgesHtml(quoteStatus, isParent) {
  if (!quoteStatus) return '';

  if (quoteStatus.ownCotizaciones.length > 0) {
    const ganador = quoteStatus.ownWinner;
    if (ganador) {
      const prov = escapeCatalogHtml(ganador.proveedor);
      const ganadorQty = (ganador.cantidad !== undefined && ganador.cantidad !== null && ganador.cantidad !== '') ? (parseFloat(ganador.cantidad) || 1) : 1;
      const ganadorCost = (ganador.costo !== undefined && ganador.costo !== null) ? Number(ganador.costo) : round2(Number(ganador.monto || 0) * (ganadorQty > 0 ? ganadorQty : 1));
      const titleDetail = ganadorQty > 1
        ? `Proveedor Ganador: ${prov} (Total: ${formatMoney(ganadorCost)} — ${formatMoney(ganador.monto)} × ${formatQty(ganadorQty)} ${escapeCatalogHtml(ganador.unidad || '')})`
        : `Proveedor Ganador: ${prov} (${formatMoney(ganadorCost)})`;
      return `
        <div class="mt-1 flex items-center gap-1.5 flex-wrap">
          <span class="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-300/80 px-2 py-0.5 rounded-md font-sans font-bold shadow-2xs"
                title="${titleDetail}">
            <i class="fa-solid fa-user-check text-[8px] text-emerald-600"></i> ${prov}
            <span class="text-[8px] text-emerald-600 font-mono font-bold">(${formatMoney(ganadorCost)})</span>
          </span>
        </div>
      `;
    }
    const count = quoteStatus.ownCotizaciones.length;
    return `
      <div class="mt-1 flex items-center gap-1.5 flex-wrap">
        <span class="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-800 border border-amber-300/80 px-2 py-0.5 rounded-md font-sans font-semibold shadow-2xs"
              title="${count} cotizaciones registradas sin ganador seleccionado (total $0.00)">
          <i class="fa-solid fa-users-viewfinder text-[8px] text-amber-600"></i> ${count} cotiz. (sin elegir)
        </span>
      </div>
    `;
  }

  if (isParent && quoteStatus.selectedDescendantQuotes.length > 0) {
    const pills = quoteStatus.selectedDescendantQuotes.map((item) => {
      const clave = escapeCatalogHtml(item.node.clave || '');
      const prov = escapeCatalogHtml(item.cotizacion.proveedor || '');
      const desc = escapeCatalogHtml(item.node.descripcion || '');
      return `
        <span class="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-300/80 px-2 py-0.5 rounded-md font-sans font-bold shadow-2xs"
              title="[${clave}] ${desc} — Ganador: ${prov} (${formatMoney(item.conceptTotal)})">
          <i class="fa-solid fa-user-check text-[8px] text-emerald-600"></i>
          <span class="font-mono text-emerald-700">[${clave}]</span> ${prov}
          <span class="text-[8px] text-emerald-600 font-mono font-bold">(${formatMoney(item.conceptTotal)})</span>
        </span>
      `;
    }).join('');
    const pendingBadge = quoteStatus.descendantPendingWinner.length > 0
      ? `<span class="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-800 border border-amber-300/80 px-2 py-0.5 rounded-md font-sans font-semibold" title="Subconceptos con cotizaciones sin ganador seleccionado">${quoteStatus.descendantPendingWinner.length} pendiente(s)</span>`
      : '';
    return `<div class="mt-1 flex items-center gap-1.5 flex-wrap">${pills}${pendingBadge}</div>`;
  }

  if (isParent && quoteStatus.descendantsWithQuotes.length > 0) {
    const pendingCount = quoteStatus.descendantsWithQuotes.length;
    return `
      <div class="mt-1 flex items-center gap-1.5 flex-wrap">
        <span class="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-800 border border-amber-300/80 px-2 py-0.5 rounded-md font-sans font-semibold shadow-2xs"
              title="Los subconceptos tienen cotizaciones pero ninguna seleccionada aún (total $0.00)">
          <i class="fa-solid fa-users-viewfinder text-[8px] text-amber-600"></i> ${pendingCount} subconcepto(s) sin ganador ($0.00)
        </span>
      </div>
    `;
  }

  if (quoteStatus.blockReason === 'ancestor_has_quotes' && quoteStatus.blockingAncestor) {
    const ancClave = escapeCatalogHtml(quoteStatus.blockingAncestor.clave || 'Nivel 1');
    return `
      <div class="mt-1 flex items-center gap-1.5 flex-wrap">
        <span class="inline-flex items-center gap-1 text-[9px] bg-slate-100 text-slate-600 border border-slate-300 px-2 py-0.5 rounded-md font-sans font-medium"
              title="No se pueden agregar cotizaciones porque [${ancClave}] ya tiene cotizaciones registradas">
          <i class="fa-solid fa-lock text-[8px] text-slate-500"></i> Cotiz. en [${ancClave}]
        </span>
      </div>
    `;
  }

  return '';
}

/**
 * Oculta el panel lateral sin destruir el DOM de la tabla para conservar foco y eventos en curso.
 */
function hideApuPanelInPlace() {
  activeSidePanelNodeId = null;
  const apuPanel = document.getElementById('apu-panel');
  if (apuPanel) apuPanel.classList.add('hidden');
  const panelResizer = document.getElementById('panel-resizer');
  if (panelResizer) panelResizer.classList.add('hidden');

  const tbody = document.getElementById('tb1-body');
  if (tbody) {
    tbody.querySelectorAll('.sidepanel-row-btn').forEach((btn) => {
      btn.className = getIdleSidePanelBtnClass(btn);
    });
  }
}

/**
 * Configura doble clic en un campo editable para enfocarlo y seleccionar todo su valor sin propagar a la fila.
 */
function bindSelectAllOnDblClick(fieldEl) {
  if (!fieldEl) return;
  fieldEl.ondblclick = (e) => {
    e.stopPropagation();
    if (fieldEl.disabled) return;
    e.preventDefault();
    fieldEl.focus();
    fieldEl.select();
    if (fieldEl.type !== 'number' && typeof fieldEl.setSelectionRange === 'function') {
      try {
        fieldEl.setSelectionRange(0, fieldEl.value.length);
      } catch (_) {}
    }
  };
}

// Renderizado de la tabla principal de catálogo (TAB1-CAT-BASE)
export function renderTAB1() {
  const tbody = document.getElementById('tb1-body');
  if (!tbody) return;

  const isCatLocked = isTabLocked('cat') || !canCurrentUserEditProject();
  applyTabLocksToDOM();

  const apuPanelEl = document.getElementById('apu-panel');
  const isPanelVisible = Boolean(apuPanelEl && !apuPanelEl.classList.contains('hidden'));

  // Ejecutar cascada de prorrateo y porcentajes globales
  calculateProrrateoCascade(state.treeData);

  const fragment = document.createDocumentFragment();
  let totalCount = 0;
  let selectedCount = 0;

  function traverse(nodes, level = 1, inheritedColor = null, parentColorLevel = 1) {
    nodes.forEach((node) => {
      totalCount++;
      if (node.selected) selectedCount++;

      const isParent = node.children && node.children.length > 0;
      if (isParent && node.unidad !== 'lote') {
        node.unidad = 'lote';
      }
      const quoteStatus = getCotizacionHierarchyStatus(node.id);
      const hasOwnQuotes = quoteStatus.ownCotizaciones.length > 0;
      const isQuoteBlockedByAncestor = quoteStatus.blockReason === 'ancestor_has_quotes';
      const calculatedTotal = calculateParentTotal(node);
      const effectivePU = getEffectivePrecioUnitario(node);
      if (isParent) {
        node.precioUnitario = effectivePU;
      }
      const isPuEditable = !isCatLocked && !isParent && !hasOwnQuotes;
      const puTitle = hasOwnQuotes
        ? (quoteStatus.ownWinner
            ? 'Precio definido por la cotización seleccionada en el panel lateral (Para editar manualmente, elimine todas las cotizaciones)'
            : 'Cotizaciones agregadas sin proveedor ganador seleccionado ($0.00). Para editar manualmente, elimine todas las cotizaciones')
        : (isParent
            ? 'Resultado calculado a partir de los precios unitarios de los subconceptos'
            : (isCatLocked ? 'Catálogo bloqueado' : 'Precio unitario editable (Haga doble clic para editar)'));

      // Solo pintar la fila de nivel 1; subfilas y conceptos permanecen limpios sin fondo de color
      const isLevel1 = level === 1;
      const activeColor = node.color || inheritedColor;
      const colorOriginLevel = node.color ? level : parentColorLevel;
      const rowBgColor = (isLevel1 && activeColor) ? getHierarchyColor(activeColor, 0) : '';

      const isSelected = state.activeSelectedId === node.id;
      const isSidePanelActiveRow = Boolean(
        isPanelVisible &&
        state.activeSelectedId &&
        String(activeSidePanelNodeId) === String(node.id)
      );
      const tr = document.createElement('tr');
      tr.dataset.nodeId = node.id;
      tr.dataset.rowBgColor = rowBgColor || '';
      tr.className = `cursor-pointer transition duration-150 ${isLevel1 ? 'font-bold' : ''} ${isSelected ? 'selected-row' : 'hover:brightness-95'}`;
      if (!isSelected && rowBgColor) {
        tr.style.backgroundColor = rowBgColor;
      }
      tr.onclick = (e) => {
        if (
          e.target.tagName !== 'INPUT' && 
          e.target.tagName !== 'TEXTAREA' && 
          e.target.tagName !== 'BUTTON' && 
          !e.target.closest('button') &&
          !e.target.closest('.dropdown-container')
        ) {
          closeAllDropdownMenus();
          highlightCatalogRowInPlace(node.id);
        } else if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          highlightCatalogRowInPlace(node.id);
        }
      };
      tr.onfocusin = () => {
        highlightCatalogRowInPlace(node.id);
      };
      tr.ondblclick = (e) => {
        if (
          e.target.closest('button') ||
          e.target.closest('.dropdown-container') ||
          e.target.closest('label') ||
          e.target.closest('textarea.desc-input, input.qty-input, input.pu-input, input.pct-rel-input') ||
          (e.target.tagName === 'INPUT' && (e.target.type === 'checkbox' || e.target.type === 'color'))
        ) {
          return;
        }
        if ((e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') && typeof e.target.blur === 'function') {
          e.target.blur();
        }
        if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
          try {
            window.getSelection()?.removeAllRanges();
          } catch (_) {}
        }
        closeAllDropdownMenus();
        selectRow(node.id);
      };

      const paddingIndent = (level - 1) * 12;

      tr.innerHTML = `
        <td class="p-1 text-center align-top pt-2">
          <div class="relative inline-flex items-center justify-center">
            ${isLevel1 ? `
              <label class="cursor-pointer flex items-center justify-center m-0 p-0" title="${escapeCatalogHtml(node.color ? 'Color propio: ' + node.color + ' (clic para cambiar)' : 'Elegir color para esta partida Nivel 1')}">
                <input type="color" value="${escapeCatalogHtml(node.color || '#3b82f6')}" ${isCatLocked ? 'disabled' : ''}
                       onchange="updateNodeColor('${escapeCatalogHtml(node.id)}', this.value, event)" 
                       class="color-picker-dot w-4 h-4 rounded-full cursor-pointer border ${node.color ? 'border-slate-500 ring-1 ring-slate-400' : 'border-slate-300 opacity-30 hover:opacity-100'}">
              </label>
              ${node.color && !isCatLocked ? `
                <button type="button" onclick="clearNodeColor('${escapeCatalogHtml(node.id)}', event)" 
                        title="Quitar color propio" 
                        class="absolute -top-1.5 -right-1.5 bg-white hover:bg-red-600 hover:text-white text-slate-500 rounded-full w-3.5 h-3.5 flex items-center justify-center border border-slate-300 text-[7px] shadow-xs transition leading-none">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              ` : ''}
            ` : '<span class="w-4 inline-block"></span>'}
          </div>
        </td>
        <td class="p-1.5 text-center align-top pt-2">
          <input type="checkbox" ${node.selected ? 'checked' : ''} ${isCatLocked ? 'disabled' : ''} onchange="toggleSelectNode('${escapeCatalogHtml(node.id)}', this.checked, event)" class="rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
        </td>
        <td class="p-1.5 text-center font-sans ${isLevel1 ? 'font-bold text-slate-700' : 'text-slate-400'} text-[10px] align-top pt-2">${level}</td>
        <td class="p-1.5 ${isLevel1 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'} align-top pt-2">${escapeCatalogHtml(node.clave)}</td>
        <td class="p-1.5 align-top text-justify">
          <div class="flex items-start" style="padding-left: ${paddingIndent}px">
            ${isParent ? `
              <button onclick="toggleExpand('${escapeCatalogHtml(node.id)}', event)" class="mr-1 ${isLevel1 ? 'text-slate-700 font-bold' : 'text-slate-500'} hover:text-slate-900 w-3 text-center shrink-0 mt-1">
                <i class="fa-solid fa-chevron-${node.expanded ? 'down' : 'right'} text-[9px]"></i>
              </button>
            ` : '<span class="w-4 inline-block shrink-0"></span>'}
            <div class="flex-1 min-w-0">
              <textarea ${isCatLocked ? 'disabled readonly' : ''} onchange="updateNode('${escapeCatalogHtml(node.id)}', 'descripcion', this.value)" 
                        class="desc-input w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white px-1 py-0.5 rounded text-xs font-sans ${isLevel1 ? 'font-bold text-slate-900' : 'text-slate-700'} text-justify leading-snug break-words whitespace-normal disabled:cursor-default">${escapeCatalogHtml(node.descripcion || '')}</textarea>
              
              ${renderConceptQuoteBadgesHtml(quoteStatus, isParent)}
            </div>
            <div class="ml-1.5 mt-0.5 shrink-0">${renderPartidaNivel1ChatButton(node.id, node.clave, node.descripcion)}</div>
          </div>
        </td>
        <td class="p-1.5 text-right align-top pt-2">
          ${!isParent ? `
            <input type="number" step="0.01" ${isCatLocked ? 'disabled readonly' : ''} value="${Number(node.cantidad || 0).toFixed(2)}" onchange="updateNode('${escapeCatalogHtml(node.id)}', 'cantidad', parseFloat(this.value) || 0)" 
                   class="qty-input w-16 text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white py-0.5 rounded text-xs font-mono ${isLevel1 ? 'font-bold text-slate-900' : ''} disabled:cursor-default">
          ` : `<span class="${isLevel1 ? 'font-bold text-slate-600' : 'text-slate-400'} font-mono">${formatQty(node.cantidad)}</span>`}
        </td>
        <td class="p-1.5 text-center align-top pt-2">
          ${isParent ? `
            <span class="${isLevel1 ? 'font-bold text-slate-800' : 'text-slate-600 font-medium'} text-xs font-mono">lote</span>
          ` : `
            <input type="text" ${isCatLocked ? 'disabled readonly' : ''} value="${escapeCatalogHtml(node.unidad || 'pza')}" onchange="updateNode('${escapeCatalogHtml(node.id)}', 'unidad', this.value)" 
                   class="w-10 text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white py-0.5 rounded text-xs ${isLevel1 ? 'font-bold text-slate-900' : ''} disabled:cursor-default">
          `}
        </td>
        <td class="p-1.5 text-center align-top pt-2">
          ${isParent ? `
            <div class="flex items-center justify-center gap-1 flex-wrap">
              ${(() => {
                const groupStatus = getGroupProrrateoStatus(node.children);
                if (groupStatus.status === 'valid') {
                  return `
                    <span class="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold shadow-2xs"
                          title="Ponderación balanceada al 100.00%">
                      <i class="fa-solid fa-check text-[8px] text-emerald-600"></i> 100%
                    </span>
                  `;
                } else if (groupStatus.status === 'under') {
                  return `
                    <span class="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded font-mono font-bold shadow-2xs"
                          title="Suma: ${groupStatus.sum.toFixed(2)}%. Falta ${groupStatus.diff.toFixed(2)}% para completar el 100%">
                      <i class="fa-solid fa-triangle-exclamation text-[8px] text-amber-500"></i> ${groupStatus.sum.toFixed(1)}% <span class="text-[8px] text-amber-600 font-normal">(-${groupStatus.diff.toFixed(1)}%)</span>
                    </span>
                  `;
                } else {
                  return `
                    <span class="inline-flex items-center gap-1 text-[9px] bg-rose-50 text-rose-700 border border-rose-300 px-1.5 py-0.5 rounded font-mono font-bold shadow-2xs"
                          title="Suma: ${groupStatus.sum.toFixed(2)}%. Excede el 100% por ${groupStatus.diff.toFixed(2)}%">
                      <i class="fa-solid fa-circle-xmark text-[8px] text-rose-500"></i> ${groupStatus.sum.toFixed(1)}% <span class="text-[8px] text-rose-600 font-normal">(+${groupStatus.diff.toFixed(1)}%)</span>
                    </span>
                  `;
                }
              })()}
              <button type="button" onclick="repartirEquitativamente('${escapeCatalogHtml(node.id)}', event)" ${isCatLocked ? 'disabled' : ''}
                      class="no-print text-[9px] bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 border border-slate-300 hover:border-indigo-600 px-1.5 py-0.5 rounded transition cursor-pointer flex items-center gap-0.5 font-sans font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Dividir 100% equitativamente entre los ${node.children.length} subconceptos">
                <i class="fa-solid fa-divide text-[8px]"></i>
                <span>Repartir =</span>
              </button>
            </div>
          ` : `
            <div class="flex items-center justify-center">
              <input type="number" step="0.01" min="0" max="100" ${isCatLocked ? 'disabled readonly' : ''}
                     value="${Number(node.porcentaje_relativo || 0).toFixed(2)}"
                     onchange="updateNode('${escapeCatalogHtml(node.id)}', 'porcentaje_relativo', parseFloat(this.value) || 0)"
                     class="pct-rel-input w-16 text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white px-1 py-0.5 rounded text-xs font-mono font-semibold text-slate-700 disabled:cursor-default"
                     title="Ponderación relativa respecto a su padre directo">
              <span class="text-slate-400 text-[10px] ml-0.5 font-mono">%</span>
            </div>
          `}
        </td>
        <td class="p-1.5 text-right align-top pt-2" title="${puTitle}">
          ${isParent ? `
            <div class="flex items-center justify-end">
              <span class="text-slate-500 mr-0.5 ${isLevel1 ? 'font-bold' : 'font-semibold'}">${getCurrencySymbol()}</span>
              <span class="w-20 text-right py-0.5 text-xs ${isLevel1 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'} font-mono">${effectivePU.toFixed(2)}</span>
            </div>
          ` : (isPuEditable ? `
            <div class="flex items-center justify-end">
              <span class="text-slate-500 mr-0.5 ${isLevel1 ? 'font-bold' : 'font-semibold'}">${getCurrencySymbol()}</span>
              <input type="number" step="0.01" value="${effectivePU.toFixed(2)}"
                     onchange="updateNode('${node.id}', 'precioUnitario', parseFloat(this.value) || 0)"
                     class="pu-input w-20 text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white py-0.5 rounded text-xs ${isLevel1 ? 'font-bold' : 'font-semibold'} text-blue-700 font-mono disabled:cursor-default">
            </div>
          ` : `
            <div class="flex items-center justify-end">
              <span class="text-slate-500 mr-0.5 ${isLevel1 ? 'font-bold' : 'font-semibold'}">${getCurrencySymbol()}</span>
              <input type="number" step="0.01" disabled readonly value="${effectivePU.toFixed(2)}"
                     class="w-20 text-right bg-transparent border-b border-transparent py-0.5 rounded text-xs ${isLevel1 ? 'font-bold' : 'font-semibold'} text-blue-700 font-mono disabled:cursor-default pointer-events-none">
            </div>
          `)}
        </td>
        <td class="p-1.5 text-right ${isLevel1 ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'} align-top pt-2">
          ${formatMoney(calculatedTotal)}
        </td>
        <td class="p-1.5 text-center align-top pt-2">
          <span class="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${isLevel1 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}"
                title="Representa el ${(Number(node.porcentaje_global) || 0).toFixed(2)}% del costo total del proyecto">
            ${(Number(node.porcentaje_global) || 0).toFixed(2)}%
          </span>
        </td>
        <td class="p-1.5 text-center align-top pt-2">
          <div class="flex items-center justify-center space-x-1 whitespace-nowrap">
            <button type="button" data-locked="${isQuoteBlockedByAncestor ? '1' : '0'}" onclick="window.selectRowAndOpenProveedores('${node.id}', event)"
                    title="${isQuoteBlockedByAncestor ? `Bloqueado: el concepto [${quoteStatus.blockingAncestor?.clave || 'Nivel 1'}] ya tiene cotizaciones` : 'Abrir panel lateral de Cotizaciones / Proveedores'}"
                    class="${isSidePanelActiveRow ? SIDEPANEL_BTN_ACTIVE_CLASS : (isQuoteBlockedByAncestor ? SIDEPANEL_BTN_BLOCKED_CLASS : SIDEPANEL_BTN_IDLE_CLASS)}">
              <i class="fa-solid ${isQuoteBlockedByAncestor ? 'fa-lock' : 'fa-users-viewfinder'} text-[9px]"></i>
              <span>Cotiz.</span>
            </button>
            <button onclick="addChildRow('${node.id}', event)" ${isCatLocked ? 'disabled' : ''}
                    title="${isCatLocked ? 'Pestaña bloqueada (Solo consulta e impresión)' : 'Agregar Sub-renglón'}" 
                    class="${isCatLocked ? 'text-slate-300 p-1 transition disabled:opacity-35 disabled:cursor-not-allowed' : 'text-blue-600 hover:text-blue-800 p-1'}">
              <i class="fa-solid fa-plus-circle text-xs ${isCatLocked ? 'opacity-35' : ''}"></i>
            </button>
            <div class="relative dropdown-container" id="dropdown-container-${node.id}">
              <button type="button" 
                      onclick="toggleDropdownMenu('${node.id}', event)" 
                      title="Opciones de fila" 
                      class="dropdown-trigger text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-200 transition focus:outline-none">
                <i class="fa-solid fa-ellipsis-vertical text-xs pointer-events-none"></i>
              </button>
              <div id="dropdown-menu-${node.id}" class="dropdown-menu absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-xl z-50 text-left py-1 text-[11px] font-sans">
                <button onclick="duplicarNode('${node.id}', event); closeAllDropdownMenus();" ${isCatLocked ? 'disabled' : ''} class="w-full text-left px-3 py-1 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  <i class="fa-solid fa-clone text-[10px]"></i> Duplicar
                </button>
                <button onclick="copiarNode('${node.id}', event); closeAllDropdownMenus();" class="w-full text-left px-3 py-1 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2" title="Copiar este concepto para pegarlo aquí o en otro proyecto">
                  <i class="fa-solid fa-copy text-[10px]"></i> Copiar
                </button>
                <button onclick="pegarNode('${node.id}', event); closeAllDropdownMenus();" ${isCatLocked ? 'disabled' : ''} class="w-full text-left px-3 py-1 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 ${!state.clipboardNode || isCatLocked ? 'opacity-40 cursor-not-allowed' : ''}" title="${state.clipboardNode ? `Pegar concepto copiado [${state.clipboardNode.clave || ''}]` : 'No hay concepto en el portapapeles'}">
                  <i class="fa-solid fa-paste text-[10px]"></i> Pegar debajo
                </button>
                <div class="border-t border-slate-100 my-0.5"></div>
                <button onclick="moverNode('${node.id}', 'up', event); closeAllDropdownMenus();" ${isCatLocked ? 'disabled' : ''} class="w-full text-left px-3 py-1 hover:bg-slate-100 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  <i class="fa-solid fa-arrow-up text-[10px]"></i> Mover Arriba
                </button>
                <button onclick="moverNode('${node.id}', 'down', event); closeAllDropdownMenus();" ${isCatLocked ? 'disabled' : ''} class="w-full text-left px-3 py-1 hover:bg-slate-100 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  <i class="fa-solid fa-arrow-down text-[10px]"></i> Mover Abajo
                </button>
                <div class="border-t border-slate-100 my-0.5"></div>
                <button onclick="deleteNode('${node.id}', event); closeAllDropdownMenus();" ${isCatLocked ? 'disabled' : ''} class="w-full text-left px-3 py-1 hover:bg-red-50 text-red-600 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  <i class="fa-solid fa-trash text-[10px]"></i> Eliminar
                </button>
              </div>
            </div>
          </div>
        </td>
      `;

      tr.querySelectorAll('textarea.desc-input, input.qty-input, input.pu-input, input.pct-rel-input').forEach(bindSelectAllOnDblClick);

      fragment.appendChild(tr);

      if (isParent && node.expanded) {
        traverse(node.children, level + 1, activeColor, colorOriginLevel);
      }
    });
  }

  traverse(state.treeData);
  tbody.replaceChildren(fragment);

  const totalItemsEl = document.getElementById('total-items');
  if (totalItemsEl) totalItemsEl.innerText = `${totalCount} renglones`;
  renderProjectChatDock();

  const selBadge = document.getElementById('selected-items-badge');
  if (selBadge) {
    if (selectedCount > 0) {
      selBadge.classList.remove('hidden');
      selBadge.innerText = `${selectedCount} sel.`;
    } else {
      selBadge.classList.add('hidden');
    }
  }

  const selectAllHeader = document.getElementById('select-all-checkbox');
  if (selectAllHeader) {
    selectAllHeader.checked = (totalCount > 0 && selectedCount === totalCount);
  }

  const statusSpan = document.getElementById('selected-row-status');
  if (statusSpan) {
    if (state.activeSelectedId) {
      const selNode = findNodeById(state.treeData, state.activeSelectedId);
      if (selNode) {
        const isGroup = selNode.children && selNode.children.length > 0;
        const cotsCount = Array.isArray(selNode.cotizaciones) ? selNode.cotizaciones.length : 0;
        const badgeInfo = cotsCount > 0 ? `(${cotsCount} cotiz.)` : (isGroup ? '(Partida)' : '(Sin cotizaciones)');
        statusSpan.innerText = `Seleccionado: [${selNode.clave}] ${(selNode.descripcion || '').substring(0, 22)}... ${badgeInfo}`;
      }
    } else {
      statusSpan.innerText = `Seleccione una fila para acciones`;
    }
  }

  updateGrandTotal();
  updateSobrecostoBadge();
}

// Resaltar fila en Catálogo Base sin recrear el DOM (preserva el foco al hacer clic dentro de un input/textarea)
export function highlightCatalogRowInPlace(id) {
  state.activeSelectedId = id;

  const apuPanel = document.getElementById('apu-panel');
  const isPanelVisible = Boolean(apuPanel && !apuPanel.classList.contains('hidden'));

  const tbody = document.getElementById('tb1-body');
  if (tbody) {
    tbody.querySelectorAll('tr[data-node-id]').forEach((rowEl) => {
      const nodeId = rowEl.dataset.nodeId;
      const isMatch = String(nodeId) === String(id);
      const isPanelRow = Boolean(isPanelVisible && activeSidePanelNodeId !== null && String(activeSidePanelNodeId) === String(nodeId));
      const sidePanelBtn = rowEl.querySelector('.sidepanel-row-btn');
      if (isMatch) {
        rowEl.classList.add('selected-row');
        rowEl.classList.remove('hover:brightness-95');
        rowEl.style.backgroundColor = '';
      } else {
        rowEl.classList.remove('selected-row');
        rowEl.classList.add('hover:brightness-95');
        rowEl.style.backgroundColor = rowEl.dataset.rowBgColor || '';
      }
      if (sidePanelBtn) {
        sidePanelBtn.className = isPanelRow ? SIDEPANEL_BTN_ACTIVE_CLASS : getIdleSidePanelBtnClass(sidePanelBtn);
      }
    });
  }

  const statusSpan = document.getElementById('selected-row-status');
  if (statusSpan) {
    const selNode = findNodeById(state.treeData, id);
    if (selNode) {
      const isGroup = selNode.children && selNode.children.length > 0;
      const cotsCount = Array.isArray(selNode.cotizaciones) ? selNode.cotizaciones.length : 0;
      const badgeInfo = cotsCount > 0 ? `(${cotsCount} cotiz.)` : (isGroup ? '(Partida)' : '(Sin cotizaciones)');
      statusSpan.innerText = `Seleccionado: [${selNode.clave}] ${(selNode.descripcion || '').substring(0, 22)}... ${badgeInfo}`;
    }
  }
}

// Abrir panel lateral de Cotizaciones / Proveedores para cualquier concepto (desde nivel 1 hasta el final)
export function selectRow(id) {
  state.activeSelectedId = id;
  const node = findNodeById(state.treeData, id);

  if (!node) {
    activeSidePanelNodeId = null;
    renderTAB1();
    return;
  }

  activeSidePanelNodeId = node.id;
  const apuPanel = document.getElementById('apu-panel');
  const panelResizer = document.getElementById('panel-resizer');

  if (apuPanel) apuPanel.classList.remove('hidden');
  if (panelResizer) panelResizer.classList.remove('hidden');

  // Restaurar ancho guardado en localStorage limitándolo de forma segura
  if (apuPanel) {
    const savedWidth = localStorage.getItem(APU_WIDTH_KEY);
    const container = document.getElementById('view-alcances') || document.getElementById('view-cat');
    const containerW = container ? container.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const parsed = savedWidth ? parseInt(savedWidth, 10) : 480;
    const initialW = !isNaN(parsed) && parsed >= 320 ? parsed : 480;
    const clamped = clampApuWidth(initialW, containerW);
    apuPanel.style.width = `${clamped}px`;
  }

  const isParent = Boolean(node.children && node.children.length > 0);
  const apuClave = document.getElementById('apu-clave');
  if (apuClave) apuClave.innerText = node.clave || '';
  const apuTitle = document.getElementById('apu-title');
  if (apuTitle) apuTitle.innerText = node.descripcion || 'Sin descripción';
  const apuDesc = document.getElementById('apu-desc');
  if (apuDesc) apuDesc.innerText = `Unidad: ${isParent ? 'lote' : (node.unidad || 'pza')} | Cantidad: ${node.cantidad || 0}`;

  highlightCatalogRowInPlace(id);
  switchSidePanelTab('proveedores');
}

// Cerrar panel lateral
export function closeApuPanel() {
  state.activeSelectedId = null;
  hideApuPanelInPlace();
  renderTAB1();
}

// Abrir / cerrar menú desplegable de opciones de fila
export function toggleDropdownMenu(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const menu = document.getElementById(`dropdown-menu-${id}`);
  const container = document.getElementById(`dropdown-container-${id}`);
  if (!menu || !container) return;

  const wasOpen = menu.classList.contains('show') || container.classList.contains('is-open');

  // Cerrar cualquier otro menú antes de abrir
  closeAllDropdownMenus();

  if (!wasOpen) {
    // Detectar si está cerca del límite inferior para desplegar hacia arriba
    const rect = container.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 220 && rect.top > 200) {
      menu.classList.add('dropdown-menu-up');
    } else {
      menu.classList.remove('dropdown-menu-up');
    }

    menu.classList.add('show');
    container.classList.add('is-open');
  }
}

// Cerrar todos los menús desplegables abiertos
export function closeAllDropdownMenus() {
  document.querySelectorAll('.dropdown-menu.show').forEach((menu) => {
    menu.classList.remove('show', 'dropdown-menu-up');
  });
  document.querySelectorAll('.dropdown-container.is-open').forEach((container) => {
    container.classList.remove('is-open');
  });
}

function getElementTarget(target) {
  if (!target) return null;
  if (typeof target.closest === 'function') return target;
  return target.parentElement || null;
}

function isKeepOpenTarget(target) {
  const el = getElementTarget(target);
  return Boolean(el && el.closest(APU_PANEL_KEEP_OPEN_SELECTOR));
}

// Manejadores globales para cerrar menús y panel lateral al hacer clic fuera o presionar Escape
if (typeof document !== 'undefined') {
  const markPointerDownOrigin = (e) => {
    lastMouseDownInsideApuPanel = isKeepOpenTarget(e.target);
  };
  const scheduleResetPointerDownOrigin = () => {
    if (lastMouseDownInsideApuPanel) {
      setTimeout(() => {
        lastMouseDownInsideApuPanel = false;
      }, 0);
    }
  };

  document.addEventListener('mousedown', markPointerDownOrigin, true);
  document.addEventListener('touchstart', markPointerDownOrigin, { capture: true, passive: true });
  document.addEventListener('mouseup', scheduleResetPointerDownOrigin, true);
  document.addEventListener('touchend', scheduleResetPointerDownOrigin, { capture: true, passive: true });

  if (typeof window !== 'undefined') {
    window.addEventListener('blur', () => {
      lastMouseDownInsideApuPanel = false;
    });
  }

  // Fase de captura: cierra el panel lateral al hacer clic fuera aunque un control hijo llame a stopPropagation()
  document.addEventListener('click', (e) => {
    const apuPanel = document.getElementById('apu-panel');
    const wasMouseDownInside = e.detail > 0 && lastMouseDownInsideApuPanel;
    lastMouseDownInsideApuPanel = false;

    if (!apuPanel || apuPanel.classList.contains('hidden')) return;
    if (wasMouseDownInside || isKeepOpenTarget(e.target)) return;

    hideApuPanelInPlace();
  }, true);

  document.addEventListener('click', (e) => {
    const el = getElementTarget(e.target);
    if (!el || !el.closest('.dropdown-container')) {
      closeAllDropdownMenus();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDropdownMenus();
    }
  });
}
