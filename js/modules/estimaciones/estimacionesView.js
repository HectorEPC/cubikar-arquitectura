import { printEstimacionesFormat } from '../io/printService.js?v=20261117_cf26';
import { renderTabAssignedAvatars } from '../portal/portalController.js?v=20261117_cf26';
// js/modules/estimaciones/estimacionesView.js
// Renderizador y controlador de eventos para la pestaña ESTIMACIONES DE OBRA
// Sincronizado reactivamente con Catálogo Base, con soporte multiestimaciones,
// amortización progresiva de anticipo al 100%, reflejo de cantidades acumuladas,
// justificación de conceptos, encabezados en una sola línea y resizer vertical de columna de concepto.

import { state, persistLocalData } from '../../state/store.js?v=20261117_cf26';
import { formatCurrency, formatNumber } from '../../core/formatters.js?v=20261117_cf26';
import { showToast } from '../../ui/notifications.js?v=20261117_cf26';
import { findNodeById, collapseAllCatalogNodes, expandAllCatalogNodes } from '../catalog/treeService.js?v=20261117_cf26';
import { renderTAB1 } from '../catalog/catalogView.js?v=20261117_cf26';
import {
  getEstimacionesCalculatedData,
  getActiveEstimacion,
  setActiveEstimacionId,
  createNewEstimacion,
  updateEstimacionMeta,
  deleteEstimacion,
  setConceptoCantidadEjecutada,
  setConceptoAvancePct,
  setEstimacionesAnticipoPct,
  setEstimacionesIvaPct,
  isEstimacionLocked,
  normalizeCloudImageUrl,
  getConceptoFotosEstimacion,
  setConceptoFotosEstimacion,
  formatDDMMAAAA,
  formatDuracion,
  getEstimacionesSubView,
  setEstimacionesSubView,
  getSpecialistsContractsData,
  addSpecialistPayment,
  updateSpecialistPayment,
  deleteSpecialistPayment,
  updateSpecialistProveedor,
  getCashFlowSummary
} from './estimacionesModel.js?v=20261117_cf26';
import { guardTabUnlocked, applyTabLocksToDOM, toggleTabLock } from '../../ui/tabLockController.js?v=20261117_cf26';
import { canCurrentUserEditProject } from '../portal/projectService.js?v=20261117_cf26';
import { renderPartidaNivel1ChatButton, renderProjectChatDock } from '../chat/projectChat.js?v=20261117_cf26';

let estimacionesSearchTerm = '';
let selectedEstimacionRowId = null;
let specialistsSearchTerm = '';
let specialistsStatusFilter = 'todos'; // 'todos' | 'pendientes' | 'liquidados'
let expandedSpecialistHistories = new Set(); // Set of nodeId strings

// Cambiar entre Vista 1: Cobranza al Cliente y Vista 2: Pagos a Especialistas
export function switchEstimacionesSubView(subView) {
  setEstimacionesSubView(subView);
  renderEstimacionesView();
}

// Seleccionar y pintar fila en la tabla de Estimaciones (mismo color y estilo que Catálogo Base)
export function selectEstimacionRow(rowId, event = null) {
  selectedEstimacionRowId = String(rowId);
  if (typeof document === 'undefined') return;
  document.querySelectorAll('#estimaciones-main-table tbody tr[data-est-row]').forEach((rowEl) => {
    if (String(rowEl.getAttribute('data-est-row')) === selectedEstimacionRowId) {
      rowEl.classList.add('selected-row');
    } else {
      rowEl.classList.remove('selected-row');
    }
  });
}

// Cálculo dinámico del ancho máximo permitido para la columna de conceptos según la pantalla
export function getMaxConceptoWidth() {
  const container = document.getElementById('estimaciones-table-container');
  const containerW = container && container.clientWidth > 0
    ? container.clientWidth
    : (typeof window !== 'undefined' ? window.innerWidth - 60 : 1000);
  
  const claveW = 60;
  // Debe reservarse siempre un espacio visible generoso para las columnas de datos numéricos
  // (mínimo 260px o 30% del contenedor), asegurando que el tirador divisor JAMÁS se salga
  // del borde derecho de la pantalla visible.
  const minSpaceForData = Math.max(260, Math.round(containerW * 0.30));
  const maxAllowed = Math.max(180, containerW - claveW - minSpaceForData);
  
  // Límite máximo absoluto de 650px para mantener proporciones óptimas
  return Math.min(650, maxAllowed);
}

// Ancho persistente de la columna de conceptos (mínimo 160px, máximo dinámico según pantalla, estándar 320px)
let estimacionesConceptoColWidth = parseInt(localStorage.getItem('adm_estimaciones_concepto_width'), 10) || 320;

// Aplicar dinámicamente el ancho de la columna de concepto mediante CSS reactivo sin redibujar el DOM
export function applyConceptoColumnWidth(widthPx) {
  const maxW = getMaxConceptoWidth();
  const minW = 160;
  estimacionesConceptoColWidth = Math.max(minW, Math.min(maxW, Math.round(widthPx)));
  
  // Si el valor guardado en localStorage superaba el tamaño de pantalla, se autocorrige
  const saved = parseInt(localStorage.getItem('adm_estimaciones_concepto_width'), 10);
  if (saved && saved > maxW) {
    localStorage.setItem('adm_estimaciones_concepto_width', estimacionesConceptoColWidth);
  }

  let styleEl = document.getElementById('estimaciones-dynamic-col-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'estimaciones-dynamic-col-style';
    document.head.appendChild(styleEl);
  }
  const claveW = 60;
  const leftTotalW = claveW + estimacionesConceptoColWidth;

  styleEl.textContent = `
    .col-estimaciones-clave {
      width: ${claveW}px !important;
      min-width: ${claveW}px !important;
      max-width: ${claveW}px !important;
      left: 0px !important;
    }
    .col-estimaciones-concepto {
      width: ${estimacionesConceptoColWidth}px !important;
      min-width: ${estimacionesConceptoColWidth}px !important;
      max-width: ${estimacionesConceptoColWidth}px !important;
      left: ${claveW}px !important;
    }
    .col-estimaciones-header-cat {
      width: ${leftTotalW}px !important;
      min-width: ${leftTotalW}px !important;
      max-width: ${leftTotalW}px !important;
      left: 0px !important;
    }
    .estimaciones-fixed-left-width {
      width: ${leftTotalW}px !important;
      min-width: ${leftTotalW}px !important;
      max-width: ${leftTotalW}px !important;
    }
    .estimaciones-concepto-desc {
      text-align: justify !important;
      text-justify: inter-word !important;
      hyphens: auto;
      word-break: break-word;
      overflow-wrap: break-word;
      font-size: 11px !important;
      line-height: 1.35;
    }
  `;

  if (typeof updateEstimacionesThumbUI === 'function') {
    updateEstimacionesThumbUI();
  }
}

// Ajuste rápido con botones de incremento / decremento
export function adjustConceptoColumnWidth(deltaPx) {
  const maxW = getMaxConceptoWidth();
  const minW = 160;
  const newW = Math.max(minW, Math.min(maxW, estimacionesConceptoColWidth + deltaPx));
  applyConceptoColumnWidth(newW);
  localStorage.setItem('adm_estimaciones_concepto_width', estimacionesConceptoColWidth);
}

// Restablecer al ancho estándar recomendado
export function resetConceptoColumnWidth() {
  const maxW = getMaxConceptoWidth();
  const standardW = Math.min(320, maxW);
  applyConceptoColumnWidth(standardW);
  localStorage.setItem('adm_estimaciones_concepto_width', standardW);
  showToast(`Ancho de columna de concepto restablecido a ${standardW}px`);
}

// Inicializar el resizer vertical arrastrable (Splitter en el borde de Catálogo y Concepto de Obra)
export function initEstimacionesColumnResizer() {
  applyConceptoColumnWidth(estimacionesConceptoColWidth);

  const handleN1 = document.getElementById('estimaciones-resizer-handle-n1');
  const handleN2 = document.getElementById('estimaciones-resizer-handle-n2');
  const guideLine = document.getElementById('estimaciones-resizer-guide-line');
  const container = document.getElementById('estimaciones-table-container');

  function updateGuidePosition() {
    const conceptoTh = document.querySelector('th.col-estimaciones-concepto');
    if (conceptoTh && guideLine && container) {
      const rect = conceptoTh.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      const calcLeft = rect.right - contRect.left + container.scrollLeft;
      const maxLeft = container.scrollLeft + container.clientWidth - 4;
      const left = Math.min(calcLeft, maxLeft);
      guideLine.style.left = `${left - 1}px`;
      guideLine.style.height = `${Math.max(container.scrollHeight, container.clientHeight)}px`;
    }
  }

  function setHighlight(active) {
    [handleN1, handleN2].forEach(h => {
      if (!h) return;
      if (active) {
        h.classList.add('bg-blue-600', 'ring-2', 'ring-blue-400', 'shadow-md');
      } else {
        h.classList.remove('bg-blue-600', 'ring-2', 'ring-blue-400', 'shadow-md');
      }
    });
  }

  let isDragging = false;

  function bindDragHandle(handle) {
    if (!handle) return;

    handle.onmouseenter = () => {
      setHighlight(true);
      if (guideLine) {
        updateGuidePosition();
        guideLine.classList.remove('hidden');
      }
    };

    handle.onmouseleave = () => {
      if (!isDragging) {
        setHighlight(false);
        if (guideLine) guideLine.classList.add('hidden');
      }
    };

    handle.onmousedown = (e) => {
      e.preventDefault();
      isDragging = true;
      const startX = e.clientX;
      const startW = estimacionesConceptoColWidth;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      setHighlight(true);
      if (guideLine) {
        updateGuidePosition();
        guideLine.classList.remove('hidden');
      }

      function onMouseMove(ev) {
        const delta = ev.clientX - startX;
        const maxW = getMaxConceptoWidth();
        const minW = 160;
        const newW = Math.max(minW, Math.min(maxW, startW + delta));
        applyConceptoColumnWidth(newW);
        updateGuidePosition();
      }

      function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setHighlight(false);
        if (guideLine) guideLine.classList.add('hidden');
        localStorage.setItem('adm_estimaciones_concepto_width', estimacionesConceptoColWidth);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    handle.ondblclick = (e) => {
      e.preventDefault();
      resetConceptoColumnWidth();
      updateGuidePosition();
    };
  }

  bindDragHandle(handleN1);
  bindDragHandle(handleN2);
}

// Contenido interno del pie de tabla (tfoot) para actualización reactiva sin perder el foco en % AVANCE
function renderEstimacionesTfootContentHTML(kpis = {}, currencySymbol = '$') {
  const ant = kpis?.anticipo || {};
  const iva = kpis?.iva || {};
  const pctGlobal = (Number(kpis?.pctAvanceGlobal) || 0).toFixed(2);
  const pctAnt = (Number(kpis?.pctAvanceAnterior) || 0).toFixed(2);
  const pctEje = (Number(kpis?.pctAvanceEstaEstimacion) || 0).toFixed(2);
  const pctSaldo = (Number(kpis?.pctSaldoGlobal) || 0).toFixed(2);

  return `
            <!-- Renglón 1: Totales de la Obra (Fondo Blanco Puro con Números de Alto Contraste - Formato Panorama Real) -->
            <tr class="font-bold bg-white text-slate-800 border-b border-slate-200">
              <td colspan="2" class="py-2.5 px-2.5 font-extrabold text-right uppercase text-[11px] text-slate-700 font-sans bg-white border-r-2 border-slate-400 whitespace-nowrap sticky left-0 z-25 col-estimaciones-header-cat shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                TOTALES DE LA OBRA:
              </td>
              <!-- Ponderación e Importe Total -->
              <td class="py-2.5 px-1 text-right font-black text-blue-900 bg-white text-[11px]">100.00%</td>
              <td class="py-2.5 px-1.5 text-right font-black text-slate-900 bg-white border-r-2 border-blue-200 whitespace-nowrap text-[11px]" title="Presupuesto Base">${formatCurrency(kpis?.grandTotalBase ?? 0, currencySymbol)}</td>

              <!-- Acumulado Actual -->
              <td class="py-2.5 px-1 text-center font-black text-cyan-800 bg-white text-[10.5px]">${pctGlobal}%</td>
              <td class="py-2.5 px-1.5 text-right font-black text-cyan-950 bg-white border-r-2 border-cyan-200 whitespace-nowrap text-[11px]">${formatCurrency(kpis?.grandTotalAcumulado ?? 0, currencySymbol)}</td>

              <!-- Estimación Anterior -->
              <td class="py-2.5 px-1 text-center font-bold text-purple-800 bg-white text-[10.5px]">${pctAnt}%</td>
              <td class="py-2.5 px-1.5 text-right font-bold text-purple-950 bg-white border-r-2 border-purple-200 whitespace-nowrap text-[11px]">${formatCurrency(kpis?.grandTotalAnterior ?? 0, currencySymbol)}</td>

              <!-- Esta Estimación (Actual) -->
              <td class="py-2.5 px-1 text-center font-black text-emerald-800 bg-emerald-50/50 text-[11px]">${pctEje}%</td>
              <td class="py-2.5 px-1.5 text-right font-black text-emerald-700 bg-emerald-50/50 border-r-2 border-emerald-300 whitespace-nowrap text-[11px]" title="Esta Estimación">${formatCurrency(kpis?.grandTotalEjecutado ?? 0, currencySymbol)}</td>

              <!-- Saldo Pendiente -->
              <td class="py-2.5 px-1 text-center font-black text-amber-800 bg-white text-[10.5px]">${pctSaldo}%</td>
              <td class="py-2.5 px-1.5 text-right font-black text-amber-900 bg-white whitespace-nowrap text-[11px]" title="Saldo x Ejecutar">${formatCurrency(kpis?.grandTotalSaldo ?? 0, currencySymbol)}</td>
            </tr>

            <!-- Renglón 2: Desglose de Amortización de Anticipo y Líquido a Cobrar -->
            <tr class="bg-white text-[11px] font-sans">
              <td colspan="6" class="py-2.5 px-2.5 text-slate-700 font-mono bg-white">
                <span class="text-amber-800 font-bold uppercase mr-1 text-[10.5px]" title="Amortización de Anticipo:">ANTICIPO (${ant.pct ?? 30}%):</span>
                <span>Contratado: <strong class="text-slate-900">${formatCurrency(ant.totalContratado ?? ant.monto ?? 0, currencySymbol)}</strong></span>
                <span class="mx-1 text-slate-300">|</span>
                <span>Amortizado Anterior: <strong class="text-slate-700">${formatCurrency(ant.amortizadoAnterior ?? 0, currencySymbol)}</strong></span>
                <span class="mx-1 text-slate-300">|</span>
                <span>Saldo x Amortizar: <strong class="text-amber-800">${formatCurrency(ant.saldoPendiente ?? 0, currencySymbol)}</strong></span>
              </td>
              
              <!-- Celda Amortización en Esta Estimación -->
              <td colspan="3" class="py-2.5 px-2 text-right font-mono bg-white border-l-2 border-slate-200 text-rose-700 whitespace-nowrap">
                <div class="leading-tight">
                  <span class="text-[9.5px] font-bold uppercase block text-rose-600" title="Amortización de Anticipo:">Amortización en Esta Estimación:</span>
                  <span class="text-[11px] font-black">-${formatCurrency(ant.amortizacionEsta ?? 0, currencySymbol)}</span>
                </div>
              </td>
              
              <!-- Celda NETO A COBRAR -->
              <td colspan="3" class="py-2.5 px-2.5 text-right font-mono bg-white border-l-2 border-slate-200 whitespace-nowrap">
                <div class="flex items-center justify-end gap-2.5">
                  <div>
                    <span class="text-emerald-800 font-bold text-[11px] uppercase font-sans mr-1" title="Neto a Cobrar:">NETO A COBRAR:</span>
                    <span class="text-emerald-700 text-sm font-black">${formatCurrency(ant.netoEstaEstimacion ?? 0, currencySymbol)}</span>
                  </div>
                  ${(Number(iva.pct) || 0) > 0 ? `
                    <div class="pl-2 border-l border-slate-300 text-left font-sans" title="IVA de la estimación: ${formatCurrency(iva.estaEstimacion ?? 0, currencySymbol)}">
                      <span class="text-[7.5px] text-emerald-700 uppercase block font-bold">+IVA (${iva.pct}%):</span>
                      <span class="text-[11px] font-black text-emerald-800 font-mono">${formatCurrency(iva.totalConIva ?? 0, currencySymbol)}</span>
                    </div>
                  ` : ''}
                </div>
              </td>
            </tr>
  `;
}

// Actualizar metadatos de la estimación activa directamente desde la cabecera
export function onChangeEstimacionMeta(field, val) {
  if (!guardTabUnlocked('estimaciones')) {
    renderEstimacionesView();
    return;
  }
  const data = getEstimacionesCalculatedData();
  const activeEst = data.activeEst;
  if (!activeEst) return;
  updateEstimacionMeta(activeEst.id, { [field]: val });
  if (field === 'semanaNo') {
    const el = document.getElementById('est-header-semana-display');
    if (el) el.textContent = val || '1';
  }
}

// Exportar formato oficial de Generadores de Obra a Excel (.xlsx) tipo Panorama Real
export function exportEstimacionesExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('El módulo de exportación a Excel no está disponible', 'error');
    return;
  }
  const data = getEstimacionesCalculatedData();
  const { activeEst, rows, kpis } = data;

  const wsData = [
    [activeEst.razonSocial || state.settings?.companyName || 'DESARROLLADORA PANORAMA REAL'],
    ['GENERADORES DE OBRA — ESTIMACIÓN Y CONTROL DE AVANCE'],
    [],
    ['DATOS GENERALES', '', '', '', 'CONTROL DE PERÍODO', ''],
    ['RAZÓN SOCIAL / PERSONA FÍSICA:', activeEst.razonSocial || state.settings?.companyName || '', '', '', 'SEMANA NO.:', activeEst.semanaNo || activeEst.numero],
    ['DIRECCIÓN:', activeEst.direccion || state.settings?.projectLocation || '', '', '', 'ESTIMACIÓN NO.:', activeEst.numero],
    ['CONTACTO:', activeEst.contacto || state.settings?.projectContact || '', '', '', 'FECHA INICIO:', activeEst.fechaInicio || ''],
    ['TELÉFONO:', activeEst.telefono || state.settings?.projectPhone || '', '', '', 'FECHA CORTE:', activeEst.fechaFin || ''],
    ['PARTIDA:', activeEst.partidaNombre || 'PROYECTO EJECUTIVO', '', '', 'ESTADO:', activeEst.locked ? 'BLOQUEADA' : 'ACTIVA'],
    [],
    [
      'Código',
      'Concepto',
      '%',
      'Importe total',
      '% Acumulado',
      'Importe Acumulado',
      '% Estimación Anterior',
      'Importe Anterior',
      '% Avance',
      'Importe Avance',
      '% Pendiente',
      'Importe Pendiente'
    ],
    // Fila superior de totales generales (Top row Panorama Real)
    [
      '',
      'TOTAL PROYECTO / CONTRATO',
      1.00,
      kpis.grandTotalBase,
      kpis.pctAvanceGlobal / 100,
      kpis.grandTotalAcumulado,
      kpis.pctAvanceAnterior / 100,
      kpis.grandTotalAnterior,
      kpis.pctAvanceEstaEstimacion / 100,
      kpis.grandTotalEjecutado,
      kpis.pctSaldoGlobal / 100,
      kpis.grandTotalSaldo
    ]
  ];

  rows.forEach(r => {
    wsData.push([
      r.clave || '',
      r.descripcion || '',
      (r.pctPonderacion || 0) / 100,
      r.importeTotal || 0,
      (r.pctAcum || 0) / 100,
      r.importeAcum || 0,
      (r.pctAnt || 0) / 100,
      r.importeAnt || 0,
      (r.pctEje || 0) / 100,
      r.importeEje || 0,
      (r.pctSaldo || 0) / 100,
      r.importeSaldo || 0
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Est_${activeEst.numero}`);
  const fileName = `Generadores_Obra_Est_${activeEst.numero}_Semana_${activeEst.semanaNo || activeEst.numero}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast(`Archivo Excel exportado exitosamente: ${fileName}`, 'success');
}

// Renderizado principal de la pestaña ESTIMACIONES (Modelo Panorama Real)
export function renderEstimacionesView() {
  const container = document.getElementById('view-estimaciones');
  if (!container) return;

  try {
    const currencySymbol = state.settings?.currencySymbol || '$';
    const data = getEstimacionesCalculatedData();
    const activeEst = data?.activeEst || {
      id: 'est_1',
      numero: 1,
      nombre: 'Estimación No. 1',
      fechaInicio: '',
      fechaFin: '',
      conceptos: {},
      fotos: {}
    };
    const estimacionesList = Array.isArray(data?.estimacionesList) ? data.estimacionesList : [activeEst];
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const kpis = data?.kpis || {};

    // Asegurar que el estilo CSS dinámico esté activo
    applyConceptoColumnWidth(estimacionesConceptoColWidth);

    // Filtrado de filas si hay término de búsqueda
    const term = (estimacionesSearchTerm || '').trim().toLowerCase();

    // Filtrar visibilidad según estado colapsado de partidas (sincronizado 1:1 con state.treeData de ALCANCES) y búsqueda
    const visibleRows = [];
    const parentStack = [];

    rows.forEach(r => {
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= r.level) {
        parentStack.pop();
      }

      // Un concepto o subpartida está oculto si cualquiera de sus ancestros está colapsado (expanded === false)
      const isHiddenByParent = parentStack.some(p => p.expanded === false);

      if (r.isParent) {
        parentStack.push(r);
      }

      if (!isHiddenByParent) {
        const claveStr = String(r.clave || '').toLowerCase();
        const descStr = String(r.descripcion || '').toLowerCase();
        if (!term || claveStr.includes(term) || descStr.includes(term)) {
          visibleRows.push(r);
        }
      }
    });

    const subView = getEstimacionesSubView();
    const cashflow = getCashFlowSummary(data);

    const isEstLocked = Boolean(activeEst.locked);
    applyTabLocksToDOM();

    const pctCobrado = (Number(cashflow.pctCobradoCliente) || 0).toFixed(1);
    const pctPagado = (Number(cashflow.pctPagadoEspecialistas) || 0).toFixed(1);

    container.innerHTML = `
      <div id="estimaciones-container" class="flex-1 bg-white rounded-lg shadow border border-slate-200 flex flex-col overflow-hidden transition-all duration-300">
        
        <!-- MASTER HEADER: SELECTOR DE SUB-VISTAS + BARRA DE FLUJO DE CAJA EN TIEMPO REAL -->
        <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-3 sm:p-4 border-b border-slate-700 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-md shrink-0 font-sans">
          
          <!-- Izquierda: Selector de Sub-Vistas (Pills) -->
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-300 mr-1 uppercase tracking-wider hidden sm:inline-block">Vistas:</span>
            <div class="inline-flex p-1 bg-slate-950/70 rounded-xl border border-slate-700 shadow-inner">
              <button type="button"
                      onclick="switchEstimacionesSubView('cobranza')"
                      class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${subView === 'cobranza' ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400' : 'text-slate-300 hover:text-white hover:bg-white/5'}">
                <i class="fa-solid fa-file-invoice-dollar text-xs ${subView === 'cobranza' ? 'text-blue-200' : 'text-slate-400'}"></i>
                <span>Vista 1: Cobranza al Cliente</span>
              </button>
              <button type="button"
                      onclick="switchEstimacionesSubView('especialistas')"
                      class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${subView === 'especialistas' ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400' : 'text-slate-300 hover:text-white hover:bg-white/5'}">
                <i class="fa-solid fa-users-gear text-xs ${subView === 'especialistas' ? 'text-indigo-200' : 'text-slate-400'}"></i>
                <span>Vista 2: Pagos a Especialistas</span>
                ${cashflow.totalContratadoEspecialistas > 0 ? `<span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono ${subView === 'especialistas' ? 'bg-indigo-900 text-indigo-100' : 'bg-slate-800 text-slate-300'}">${formatCurrency(cashflow.totalPagadoEspecialistas, currencySymbol)}</span>` : ''}
              </button>
            </div>
          </div>

          <!-- Derecha: Barra de Flujo de Caja en Tiempo Real (3 Tarjetas) -->
          <div class="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs">
            
            <!-- Tarjeta 1: Total Cobrado al Cliente -->
            <div class="flex-1 sm:flex-initial flex items-center gap-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-xs">
              <span class="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <i class="fa-solid fa-circle-arrow-down text-xs"></i>
              </span>
              <div class="leading-tight">
                <div class="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <span>Total Cobrado al Cliente</span>
                  <span class="text-emerald-400 font-mono">(${pctCobrado}%)</span>
                </div>
                <div class="text-xs sm:text-sm font-black font-mono text-emerald-300">
                  ${formatCurrency(cashflow.totalCobradoCliente, currencySymbol)}
                </div>
              </div>
            </div>

            <!-- Tarjeta 2: Total Pagado a Especialistas -->
            <div class="flex-1 sm:flex-initial flex items-center gap-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-xs">
              <span class="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <i class="fa-solid fa-circle-arrow-up text-xs"></i>
              </span>
              <div class="leading-tight">
                <div class="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <span>Total Pagado Especialistas</span>
                  <span class="text-indigo-300 font-mono">(${pctPagado}%)</span>
                </div>
                <div class="text-xs sm:text-sm font-black font-mono text-indigo-300">
                  ${formatCurrency(cashflow.totalPagadoEspecialistas, currencySymbol)}
                </div>
              </div>
            </div>

            <!-- Tarjeta 3: Saldo en Banco / Margen Disponible -->
            <div class="flex-1 sm:flex-initial flex items-center gap-2.5 ${cashflow.saldoEnBanco >= 0 ? 'bg-blue-950/80 border-blue-700/60' : 'bg-rose-950/80 border-rose-700/60'} border rounded-xl px-3 py-1.5 shadow-xs">
              <span class="w-7 h-7 rounded-lg ${cashflow.saldoEnBanco >= 0 ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'} border flex items-center justify-center shrink-0">
                <i class="fa-solid fa-vault text-xs"></i>
              </span>
              <div class="leading-tight">
                <div class="text-[10px] uppercase font-bold ${cashflow.saldoEnBanco >= 0 ? 'text-blue-300' : 'text-rose-300'} flex items-center gap-1">
                  <span>Saldo en Banco / Margen</span>
                </div>
                <div class="text-xs sm:text-sm font-black font-mono ${cashflow.saldoEnBanco >= 0 ? 'text-white' : 'text-rose-200'}">
                  ${formatCurrency(cashflow.saldoEnBanco, currencySymbol)}
                </div>
              </div>
            </div>

          </div>

        </div>

        <!-- CONTENIDO PRINCIPAL SEGÚN SUB-VISTA SELECCIONADA -->
        ${subView === 'especialistas'
          ? renderSpecialistsPaymentsHTML(cashflow, currencySymbol)
          : renderCobranzaClienteHTML(data, isEstLocked, visibleRows, currencySymbol)}

      </div>`;

    if (subView === 'cobranza') {
      initEstimacionesColumnResizer();
      initEstimacionesDisplacementBar();
    }
    renderTabAssignedAvatars('estimaciones');
  } catch (err) {
    console.error('[EstimacionesView] Error al renderizar la pestaña de Estimaciones:', err);
    container.innerHTML = `
      <div class="p-8 text-center bg-white rounded-xl border border-rose-200 m-4 shadow-sm">
        <div class="w-12 h-12 mx-auto rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
          <i class="fa-solid fa-triangle-exclamation text-xl"></i>
        </div>
        <h3 class="text-sm font-bold text-slate-800">No se pudo cargar la pestaña de Estimaciones</h3>
        <p class="text-xs text-slate-500 mt-1 mb-4 font-mono text-[11px] bg-slate-50 p-2 rounded border border-slate-200 inline-block max-w-lg text-left">${err.message}</p>
        <div>
          <button type="button" onclick="renderEstimacionesView()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-sm">
            <i class="fa-solid fa-rotate-right mr-1.5"></i> Reintentar Carga
          </button>
        </div>
      </div>
    `;
  }
}

// ==========================================
// RENDERIZADOR SUB-VISTA 1: COBRANZA AL CLIENTE (FORMATO OFICIAL PANORAMA REAL)
// ==========================================
function renderCobranzaClienteHTML(data, isEstLocked, visibleRows, currencySymbol) {
  const { activeEst, estimacionesList, kpis } = data;

  return `
      <!-- ENCABEZADO EJECUTIVO OFICIAL (FORMATO DE REFERENCIA PANORAMA REAL) -->
      <div class="bg-white border-b border-slate-200 p-3 sm:p-4 flex flex-col gap-2.5 shrink-0 font-sans shadow-2xs">
        
        <!-- Fila Superior: 4 Bloques Principales de Control -->
        <div class="flex flex-wrap items-center justify-between gap-3 lg:gap-4">
          
          <!-- Bloque 1 (Izquierda): Proyecto, Ubicación, Buscador y Botones de Acción -->
          <div class="flex-1 min-w-[320px] flex flex-col gap-1.5">
            <!-- Nombre del Proyecto -->
            <div class="flex items-center gap-1.5 text-xs text-slate-700">
              <i class="fa-solid fa-diagram-project text-blue-600 shrink-0 text-xs"></i>
              <span class="font-extrabold text-slate-500 uppercase tracking-wide text-[10.5px]">PROYECTO:</span>
              <span class="font-black text-slate-900 text-xs sm:text-sm tracking-tight truncate">${state.settings?.projectName || 'Proyecto Residencial Muestra'}</span>
            </div>

            <!-- Ubicación -->
            <div class="flex items-center gap-1.5 text-xs text-slate-600">
              <i class="fa-solid fa-location-dot text-rose-500 shrink-0 text-xs"></i>
              <span class="font-extrabold text-slate-500 uppercase tracking-wide text-[10.5px]">UBICACIÓN:</span>
              <span class="font-medium text-slate-700 text-xs truncate">${activeEst.direccion || state.settings?.projectLocation || 'Fraccionamiento Residencial, Puebla, Pue.'}</span>
            </div>

            <!-- Fila de Herramientas: Buscador + Candado + Agrupar/Desagrupar + Imprimir + Excel + Indicador -->
            <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
              <!-- Buscador -->
              <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-2 text-slate-400 text-[11px]"></i>
                <input type="text"
                       id="estimaciones-search-input"
                       value="${estimacionesSearchTerm}"
                       oninput="onSearchEstimaciones(this.value)"
                       placeholder="Buscar concepto o clave..."
                       class="w-40 sm:w-52 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-lg px-2 py-1 pl-7 text-xs text-slate-800 placeholder-slate-400 outline-none transition shadow-2xs">
                ${estimacionesSearchTerm ? `
                  <button onclick="onSearchEstimaciones('')" class="absolute right-2 top-1 text-slate-400 hover:text-slate-600 text-xs"><i class="fa-solid fa-xmark"></i></button>
                ` : ''}
              </div>

              <!-- Candado de Bloqueo -->
              <button type="button"
                      onclick="toggleActiveEstimacionLock()"
                      id="btn-lock-estimaciones"
                      class="${isEstLocked ? 'bg-amber-50 text-amber-700 border-amber-300 font-bold' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} border text-xs p-1.5 rounded-lg flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs shrink-0"
                      title="${isEstLocked ? `🔒 ${activeEst.nombre} bloqueada — Clic para desbloquear` : `Bloquear ${activeEst.nombre}`}">
                <i class="fa-solid ${isEstLocked ? 'fa-lock text-amber-600' : 'fa-lock-open text-slate-400'} text-xs"></i>
              </button>

              <!-- Agrupar (Colapsar) -->
              <button type="button" onclick="collapseAllEstimacionesPartidas()" class="bg-white hover:bg-amber-50 text-amber-600 border border-slate-200 hover:border-amber-300 text-xs p-1.5 rounded-lg flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs shrink-0" title="Agrupar partidas (Colapsar)">
                <i class="fa-solid fa-layer-group text-xs text-amber-500"></i>
              </button>

              <!-- Desagrupar (Expandir) -->
              <button type="button" onclick="expandAllEstimacionesPartidas()" class="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-blue-300 text-xs p-1.5 rounded-lg flex items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs shrink-0" title="Desagrupar partidas (Expandir)">
                <i class="fa-solid fa-arrows-split-up-and-left text-xs text-blue-500"></i>
              </button>

              <!-- Botón Imprimir Estimación -->
              <button type="button" onclick="printEstimacionActual()" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold shadow-xs transition active:scale-95 cursor-pointer shrink-0" title="Imprimir Formato Panorama Real">
                <i class="fa-solid fa-print text-xs"></i>
                <span>Imprimir Estimación</span>
              </button>

              <!-- Botón Excel (.xlsx) -->
              <button type="button" onclick="exportEstimacionesExcel()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-bold shadow-xs transition active:scale-95 cursor-pointer shrink-0" title="Descargar libro Excel oficial (.xlsx)">
                <i class="fa-solid fa-file-excel text-xs"></i>
                <span>Excel</span>
              </button>

              <!-- Indicador Sincronizado con Catálogo Base -->
              <span class="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium whitespace-nowrap ml-0.5">
                <i class="fa-solid fa-database text-emerald-600 text-[10px]"></i> Sincronizado con Catálogo Base
              </span>
            </div>
          </div>

          <!-- Bloque 2: Período (Del ... al ...) -->
          <div class="border border-slate-200 rounded-xl p-2 bg-white flex flex-col justify-center gap-1.5 shadow-2xs shrink-0 font-sans">
            <div class="flex items-center gap-2 text-xs text-slate-600">
              <span class="w-6 text-slate-500 font-medium text-[11px]">Del</span>
              <div class="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 py-0.5 bg-slate-50/50">
                <i class="fa-regular fa-calendar text-blue-600 text-xs"></i>
                <input type="date"
                       ${isEstLocked ? 'disabled readonly' : ''}
                       value="${activeEst.fechaInicio || ''}"
                       onchange="onChangeEstimacionDate('${activeEst.id}', 'fechaInicio', this.value)"
                       class="bg-transparent text-slate-800 font-mono font-semibold text-xs outline-none cursor-pointer">
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-600">
              <span class="w-6 text-slate-500 font-medium text-[11px]">al</span>
              <div class="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 py-0.5 bg-slate-50/50">
                <i class="fa-regular fa-calendar text-blue-600 text-xs"></i>
                <input type="date"
                       ${isEstLocked ? 'disabled readonly' : ''}
                       value="${activeEst.fechaFin || ''}"
                       onchange="onChangeEstimacionDate('${activeEst.id}', 'fechaFin', this.value)"
                       class="bg-transparent text-slate-800 font-mono font-semibold text-xs outline-none cursor-pointer">
              </div>
            </div>
          </div>

          <!-- Bloque 3: Estimación Selector & % ANTICIPO -->
          <div class="border border-slate-200 rounded-xl p-2 bg-white flex flex-col justify-center gap-1.5 shadow-2xs shrink-0 font-sans">
            <!-- Fila 1: Selector de Estimación -->
            <div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50/50">
              <div class="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <i class="fa-solid fa-file-invoice text-blue-600"></i>
                <span>Estimación:</span>
              </div>
              <select onchange="onSwitchActiveEstimacion(this.value)" class="bg-transparent font-bold text-xs text-slate-900 outline-none cursor-pointer font-sans">
                ${estimacionesList.map(est => `
                  <option value="${est.id}" class="bg-white text-slate-900" ${est.id === activeEst.id ? 'selected' : ''}>
                    ${est.locked ? '🔒 ' : ''}${est.nombre}
                  </option>
                `).join('')}
              </select>
              ${estimacionesList.length > 1 ? `
                <button type="button" ${isEstLocked ? 'disabled' : ''} onclick="confirmDeleteCurrentEstimacion('${activeEst.id}', '${activeEst.nombre}')" class="text-slate-400 hover:text-rose-600 p-0.5 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ml-1" title="Eliminar estimación actual">
                  <i class="fa-solid fa-trash text-[10px]"></i>
                </button>
              ` : ''}
            </div>

            <!-- Fila 2: % ANTICIPO -->
            <div class="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50/50 text-xs">
              <i class="fa-solid fa-hand-holding-dollar text-amber-600 shrink-0"></i>
              <span class="font-extrabold text-slate-700 text-[11px] whitespace-nowrap">% ANTICIPO:</span>
              <input type="number" min="0" max="100" step="1"
                     ${isEstLocked ? 'disabled readonly' : ''}
                     value="${kpis.anticipo?.pct ?? 30}"
                     onchange="onEstimacionesAnticipoInput(this.value)"
                     class="w-12 text-center font-mono font-bold text-xs text-slate-900 bg-white border border-slate-300 rounded px-1 py-0.5 outline-none focus:border-blue-500">
              <span id="est-header-anticipo-monto" class="text-slate-500 text-[11px] font-mono whitespace-nowrap">% (${formatCurrency(kpis.anticipo?.totalContratado ?? kpis.anticipo?.monto ?? 0, currencySymbol)})</span>
            </div>
          </div>

          <!-- Bloque 4: Nueva Estimación & % IVA -->
          <div class="flex flex-col justify-center gap-1.5 shrink-0 font-sans">
            <!-- Botón Nueva Estimación -->
            <button type="button" onclick="promptCreateNewEstimacion()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap">
              <i class="fa-solid fa-plus font-bold text-xs"></i> + Nueva Estimación
            </button>

            <!-- % IVA -->
            <div class="flex items-center gap-1.5 border border-slate-200 rounded-xl px-2.5 py-1 bg-white text-xs shadow-2xs">
              <i class="fa-solid fa-receipt text-blue-600 shrink-0"></i>
              <span class="font-extrabold text-slate-700 text-[11px] whitespace-nowrap">% IVA:</span>
              <input type="number" min="0" max="100" step="1"
                     ${isEstLocked ? 'disabled readonly' : ''}
                     value="${kpis.iva?.pct ?? 16}"
                     onchange="onEstimacionesIvaInput(this.value)"
                     class="w-12 text-center font-mono font-bold text-xs text-slate-900 bg-white border border-slate-300 rounded px-1 py-0.5 outline-none focus:border-blue-500">
              <span id="est-header-iva-monto" class="text-slate-500 text-[11px] font-mono whitespace-nowrap">% (${formatCurrency(kpis.iva?.totalContratado ?? kpis.iva?.monto ?? 0, currencySymbol)})</span>
            </div>
          </div>

        </div>

      </div>

      <!-- BARRA DE INFORMACIÓN Y MIEMBROS ASIGNADOS (SEGUNDA FILA) -->
      <div class="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
        <!-- Izquierda: Título de la Estimación y conteo de renglones -->
        <div class="flex items-center gap-2">
          <span class="font-black text-xs text-slate-900 tracking-wide uppercase">
            ESTIMACIÓN DE OBRA: ${activeEst.nombre.toUpperCase()}
          </span>
          <span class="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10.5px] font-mono font-bold">
            ${visibleRows.length} items
          </span>
        </div>

        <!-- Derecha: Leyenda y Asignados -->
        <div class="flex items-center gap-4 text-xs">
          <span class="text-slate-500 text-[11px] flex items-center gap-1.5 hidden md:inline-flex">
            <i class="fa-solid fa-file-invoice-dollar text-blue-500"></i> Totales y liquidación consolidada en la barra inferior
          </span>
          <div class="flex items-center gap-1.5">
            <span class="font-extrabold text-[11px] text-emerald-800 uppercase flex items-center gap-1">
              <i class="fa-solid fa-users text-emerald-600"></i> ASIGNADOS:
            </span>
            <div id="tab-avatars-estimaciones" class="inline-flex items-center -space-x-1.5"></div>
            <button type="button" onclick="openTabMembersAssignModal('estimaciones')" class="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shadow-2xs">
              <i class="fa-solid fa-user-plus text-[10px]"></i> Asignar
            </button>
          </div>
        </div>
      </div>

      <!-- TABLA DE GENERADORES Y ESTIMACIONES CON ENCABEZADOS EN COLORES FUERTES Y LETRAS BLANCAS -->
      <div class="flex-1 overflow-auto bg-white custom-scroll calendario-premiere-scroll relative" id="estimaciones-table-container">
        <!-- Línea guía vertical interactiva a todo lo largo de la columna al redimensionar -->
        <div id="estimaciones-resizer-guide-line" class="hidden absolute top-0 bottom-0 w-0.5 bg-blue-500 shadow-md z-40 pointer-events-none transition-opacity"></div>

        <table id="estimaciones-main-table" class="w-full text-left text-[11px] border-collapse min-w-[940px]">
          
          <!-- Encabezado de Dos Niveles en Colores Fuertes con Letras Blancas en UNA SOLA LÍNEA (TEXTOS COMPACTOS) -->
          <thead class="sticky top-0 z-20 shadow-md select-none text-white whitespace-nowrap">
            
            <!-- Nivel 1: Agrupadores Principales en Colores Sólidos Fuertes (Modelo Panorama Real) -->
            <tr class="text-[9px] uppercase tracking-wider font-extrabold text-white whitespace-nowrap">
              <!-- 1. Datos del Entregable: Gris Oscuro / Slate-800 (Fijo con botones de ajuste rápido) -->
              <th colspan="2" class="py-1.5 px-2 text-center border-r-2 border-slate-700 bg-slate-800 text-white whitespace-nowrap select-none sticky left-0 z-35 col-estimaciones-header-cat relative" title="Entregables del Proyecto">
                <div class="flex items-center justify-between px-1">
                  <span>DATOS DEL ENTREGABLE</span>
                  <div class="inline-flex items-center gap-0.5 bg-slate-700/80 rounded px-1 py-0.5 text-[8.5px] opacity-80 hover:opacity-100 transition">
                    <button type="button" onclick="adjustConceptoColumnWidth(-30)" class="hover:text-blue-300 px-1 cursor-pointer font-mono font-bold" title="Reducir ancho">-</button>
                    <button type="button" onclick="resetConceptoColumnWidth()" class="hover:text-blue-300 px-1 cursor-normal text-[8px]" title="Restablecer ancho a 320px">↔</button>
                    <button type="button" onclick="adjustConceptoColumnWidth(30)" class="hover:text-blue-300 px-1 cursor-pointer font-mono font-bold" title="Aumentar ancho">+</button>
                  </div>
                </div>
                <div id="estimaciones-resizer-handle-n1" class="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3 bg-slate-600/70 hover:bg-blue-500 active:bg-blue-400 cursor-col-resize flex items-center justify-center transition-all z-30 group" title="Arrastra hacia los lados para redimensionar">
                  <div class="w-0.5 h-3 bg-white/70 group-hover:bg-white rounded-full"></div>
                </div>
              </th>

              <!-- 2. Presupuesto Base Contratado: Azul Corporativo / Blue-700 -->
              <th colspan="2" class="py-1.5 px-1.5 text-center border-r-2 border-blue-900 bg-blue-700 text-white whitespace-nowrap" title="Presupuesto Base Contratado">
                <i class="fa-solid fa-file-contract mr-1 text-blue-200"></i>CONTRATO BASE
              </th>

              <!-- 3. Acumulado al Corte: Cyan Profundo / Cyan-800 -->
              <th colspan="2" class="py-1.5 px-1.5 text-center border-r-2 border-cyan-950 bg-cyan-800 text-white font-extrabold whitespace-nowrap" title="Acumulado al Corte">
                <i class="fa-solid fa-chart-line mr-1 text-cyan-200"></i>ACUMULADO AL CORTE
              </th>

              <!-- 4. Estimación Anterior: Morado / Púrpura Fuerte / Purple-800 -->
              <th colspan="2" class="py-1.5 px-1.5 text-center border-r-2 border-purple-950 bg-purple-800 text-white whitespace-nowrap" title="Estimación Anterior (Reflejada)">
                <i class="fa-solid fa-clock-rotate-left mr-1 text-purple-200"></i>ESTIMACIÓN ANTERIOR
              </th>

              <!-- 5. Esta Estimación: Verde Esmeralda Fuerte / Emerald-700 (Zona Editable) -->
              <th colspan="2" class="py-1.5 px-1.5 text-center border-r-2 border-emerald-900 bg-emerald-700 text-white font-black whitespace-nowrap" title="Esta Estimación (Avance del Período)">
                <i class="fa-solid fa-pencil mr-1 text-emerald-200"></i>ESTA ESTIMACIÓN (ACTUAL)
              </th>

              <!-- 6. Saldo Pendiente: Ámbar / Amber-700 -->
              <th colspan="2" class="py-1.5 px-1.5 text-center bg-amber-700 text-white font-extrabold whitespace-nowrap" title="Saldo por Cobrar">
                <i class="fa-solid fa-coins mr-1 text-amber-200"></i>SALDO PENDIENTE
              </th>
            </tr>

            <!-- Nivel 2: Columnas Específicas Coordinadas en Tonos Sólidos con Letras Blancas -->
            <tr class="text-[8.5px] font-bold text-white uppercase border-b-2 border-slate-400 whitespace-nowrap select-none">
              <!-- Clave (Fija en columna izquierda) -->
              <th class="py-1.5 px-1 text-center border-r border-slate-700 bg-[#27354a] text-white whitespace-nowrap sticky top-[28px] z-35 col-estimaciones-clave">CÓDIGO</th>
              
              <!-- Concepto / Entregable (Fija en columna izquierda con Manija Vertical de Ajuste) -->
              <th id="estimaciones-th-concepto" class="py-1.5 px-2 border-r-2 border-slate-400 bg-[#27354a] text-white whitespace-nowrap col-estimaciones-concepto select-none sticky top-[28px] z-35 relative shadow-[4px_0_8px_-2px_rgba(0,0,0,0.18)]" title="Descripción del Concepto / Entregable">
                <div class="flex items-center justify-between">
                  <span>CONCEPTO / ENTREGABLE</span>
                  <span class="text-[7.5px] text-slate-300 font-normal opacity-70">↕ Justificado</span>
                </div>
                <div id="estimaciones-resizer-handle-n2" class="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3 bg-slate-600/70 hover:bg-blue-500 active:bg-blue-400 cursor-col-resize flex items-center justify-center transition-all z-30 group" title="Arrastra hacia los lados para agrandar o achicar Concepto / Entregable">
                  <div class="w-0.5 h-3 bg-white/70 group-hover:bg-white rounded-full"></div>
                </div>
              </th>

              <!-- Contrato Base -->
              <th class="py-1.5 px-1 min-w-[48px] text-right border-r border-blue-800 bg-blue-800 text-white whitespace-nowrap" title="% de Incidencia sobre el total contratado">% INCID.</th>
              <th class="py-1.5 px-1.5 min-w-[75px] text-right border-r-2 border-blue-900 bg-[#173fa8] text-white font-extrabold whitespace-nowrap" title="Importe Total Contratado">IMPORTE TOTAL ($)</th>

              <!-- Acumulado al Corte -->
              <th class="py-1.5 px-1 min-w-[48px] text-center border-r border-cyan-850 bg-[#155e75] text-white font-bold whitespace-nowrap" title="% Acumulado al Corte">% ACUM.</th>
              <th class="py-1.5 px-1.5 min-w-[75px] text-right border-r-2 border-cyan-950 bg-[#155e75] text-white font-extrabold whitespace-nowrap" title="Importe Acumulado al Corte ($)">IMPORTE ACUM. ($)</th>

              <!-- Estimación Anterior -->
              <th class="py-1.5 px-1 min-w-[48px] text-center border-r border-purple-850 bg-[#581c87] text-white whitespace-nowrap" title="% Estimación Anterior">% ANT.</th>
              <th class="py-1.5 px-1.5 min-w-[75px] text-right border-r-2 border-purple-950 bg-purple-900 text-white font-extrabold whitespace-nowrap" title="Importe Anterior ($)">IMPORTE ANT. ($)</th>

              <!-- Esta Estimación (Zona de Captura Editable con Botón de Foto al lado de %) -->
              <th class="py-1.5 px-1 min-w-[84px] text-center border-r border-emerald-800 bg-emerald-800 text-white font-black whitespace-nowrap" title="% de Avance y Evidencia Fotográfica en Esta Estimación">
                <span class="whitespace-nowrap"><i class="fa-solid fa-pencil text-[8px] text-emerald-200 mr-1"></i>% AVANCE</span>
              </th>
              <th class="py-1.5 px-1.5 min-w-[78px] text-right border-r-2 border-emerald-900 bg-[#065f46] text-white font-black whitespace-nowrap" title="Importe de Esta Estimación (Calculado automáticamente: Total × % Avance)">
                IMPORTE AVANCE ($)
              </th>

              <!-- Saldo Pendiente -->
              <th class="py-1.5 px-1 min-w-[48px] text-center border-r border-amber-800 bg-amber-800 text-white whitespace-nowrap" title="% Pendiente por Ejecutar">% SALDO</th>
              <th class="py-1.5 px-1.5 min-w-[75px] text-right bg-[#92400e] text-white font-black whitespace-nowrap" title="Importe Pendiente por Cobrar ($)">SALDO ($)</th>
            </tr>

          </thead>

          <!-- Cuerpo con Renglones de Partidas y Conceptos Diferenciados por Apartado con TEXTO JUSTIFICADO Y COMPACTO -->
          <tbody class="divide-y divide-slate-100 font-mono text-[11px]">
            <!-- Fila Superior: Resumen Ejecutivo del Proyecto (TOTAL PROYECTO / CONTRATO) -->
            <tr class="bg-blue-900 text-white font-mono font-bold text-[11px] select-none sticky top-[56px] z-18 shadow-xs border-b-2 border-blue-950">
              <td class="py-1 px-1 text-center bg-blue-950 text-blue-200 font-bold sticky left-0 z-20 col-estimaciones-clave">---</td>
              <td class="py-1 px-2 font-sans font-black uppercase tracking-wide bg-blue-950 text-white sticky left-[60px] z-20 col-estimaciones-concepto border-r-2 border-slate-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.18)]">
                TOTAL PROYECTO / CONTRATO
              </td>
              <td class="py-1 px-1 text-right text-blue-100 font-bold bg-blue-900">100.00%</td>
              <td id="est-top-tot-contrato" class="py-1 px-1.5 text-right font-black text-white bg-blue-900 border-r-2 border-blue-800 whitespace-nowrap">${formatCurrency(kpis.grandTotalBase, currencySymbol)}</td>
              
              <td id="est-top-pct-acum" class="py-1 px-1 text-center font-black text-cyan-200 bg-cyan-950">${(Number(kpis.pctAvanceGlobal) || 0).toFixed(2)}%</td>
              <td id="est-top-tot-acum" class="py-1 px-1.5 text-right font-black text-cyan-100 bg-cyan-950 border-r-2 border-cyan-900 whitespace-nowrap">${formatCurrency(kpis.grandTotalAcumulado, currencySymbol)}</td>
              
              <td id="est-top-pct-ant" class="py-1 px-1 text-center font-bold text-purple-200 bg-purple-950">${(Number(kpis.pctAvanceAnterior) || 0).toFixed(2)}%</td>
              <td id="est-top-tot-ant" class="py-1 px-1.5 text-right font-bold text-purple-100 bg-purple-950 border-r-2 border-purple-900 whitespace-nowrap">${formatCurrency(kpis.grandTotalAnterior, currencySymbol)}</td>
              
              <td id="est-top-pct-eje" class="py-1 px-1 text-center font-black text-emerald-200 bg-emerald-950">${(Number(kpis.pctAvanceEstaEstimacion) || 0).toFixed(2)}%</td>
              <td id="est-top-tot-eje" class="py-1 px-1.5 text-right font-black text-emerald-300 bg-emerald-950 border-r-2 border-emerald-900 whitespace-nowrap">${formatCurrency(kpis.grandTotalEjecutado, currencySymbol)}</td>
              
              <td id="est-top-pct-saldo" class="py-1 px-1 text-center font-black text-amber-200 bg-amber-950">${(Number(kpis.pctSaldoGlobal) || 0).toFixed(2)}%</td>
              <td id="est-top-tot-saldo" class="py-1 px-1.5 text-right font-black text-amber-300 bg-amber-950 whitespace-nowrap">${formatCurrency(kpis.grandTotalSaldo, currencySymbol)}</td>
            </tr>

            ${visibleRows.map(row => {
              const isSelectedRow = String(selectedEstimacionRowId) === String(row.id);
              if (row.isParent) {
                const isLevel1 = row.level === 1;
                const indentPx = (row.level - 1) * 12 + 8;
                const isCollapsed = row.expanded === false;

                return `
                  <tr data-est-row="${row.id}" onclick="selectEstimacionRow('${row.id}', event)" onfocusin="selectEstimacionRow('${row.id}', event)" class="${isLevel1 ? 'bg-slate-50/90 font-bold text-slate-800 border-y-2 border-slate-200' : 'bg-slate-50/60 font-semibold text-slate-800 border-y border-slate-200'} ${isSelectedRow ? 'selected-row' : 'hover:bg-slate-100'} cursor-pointer transition select-none">
                    <!-- Clave -->
                    <td class="py-1 px-1 text-center text-blue-700 font-mono font-bold text-[10.5px] sticky z-15 bg-slate-50 border-r border-slate-200 col-estimaciones-clave">${row.clave || ''}</td>
                    
                    <!-- Concepto -->
                    <td class="py-1 px-2 uppercase tracking-wide font-sans text-[11px] sticky z-15 bg-slate-50 border-r-2 border-slate-400 col-estimaciones-concepto shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]" style="padding-left: ${indentPx}px">
                      <div class="flex items-start gap-1 min-w-0">
                        <button type="button" onclick="toggleEstimacionesGroup('${row.id}')" class="w-4 h-4 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 inline-flex items-center justify-center transition cursor-pointer shrink-0 mt-0.5" title="${isCollapsed ? 'Desagrupar partida (mostrar conceptos)' : 'Agrupar partida (ocultar conceptos)'}">
                          <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'} text-[9px]"></i>
                        </button>
                        <span class="estimaciones-concepto-desc flex-1 ${isLevel1 ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'}" style="text-align: justify; text-justify: inter-word;">${row.descripcion || ''}</span>
                        <span class="ml-1 shrink-0 self-center">${renderPartidaNivel1ChatButton(row.id, row.clave, row.descripcion)}</span>
                        ${isCollapsed ? `<span class="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 text-[8.5px] font-mono border border-blue-200 ml-1.5 shrink-0 font-normal self-center whitespace-nowrap">Agrupado (${row.descendantCount} conc.)</span>` : ''}
                      </div>
                    </td>

                    <!-- Contrato Base -->
                    <td class="py-1 px-1 text-right text-[10.5px] font-bold text-blue-800 bg-blue-50/15 whitespace-nowrap">${row.pctPonderacion.toFixed(2)}%</td>
                    <td class="py-1 px-1.5 text-right font-bold text-slate-900 bg-blue-50/25 border-r-2 border-blue-100 whitespace-nowrap text-[11px]">${formatCurrency(row.importeBase, currencySymbol)}</td>

                    <!-- Acumulado al Corte -->
                    <td id="est-part-pct-acum-${row.id}" class="py-1 px-1 text-center text-[10.5px] font-bold text-cyan-800 bg-cyan-50/25 whitespace-nowrap">${row.pctAvanceAcum.toFixed(2)}%</td>
                    <td id="est-part-tot-acum-${row.id}" class="py-1 px-1.5 text-right font-bold text-slate-900 bg-cyan-50/20 border-r-2 border-cyan-100 whitespace-nowrap text-[11px]">${formatCurrency(row.totalAcum, currencySymbol)}</td>

                    <!-- Estimación Anterior -->
                    <td class="py-1 px-1 text-center text-[10.5px] font-semibold text-purple-800 bg-purple-50/15 whitespace-nowrap">${row.pctAnt.toFixed(2)}%</td>
                    <td id="est-part-tot-ant-${row.id}" class="py-1 px-1.5 text-right font-bold text-purple-900 bg-purple-50/25 border-r-2 border-purple-100 whitespace-nowrap text-[11px]">${formatCurrency(row.importeAnt, currencySymbol)}</td>

                    <!-- Esta Estimación (Actual) -->
                    <td id="est-part-pct-eje-${row.id}" class="py-1 px-1 text-center text-[10.5px] font-black text-emerald-800 bg-emerald-50/40 whitespace-nowrap">${row.pctAvanceEsta.toFixed(2)}%</td>
                    <td id="est-part-tot-eje-${row.id}" class="py-1 px-1.5 text-right font-black text-emerald-700 bg-emerald-50/40 border-r-2 border-emerald-200 whitespace-nowrap text-[11px]">${formatCurrency(row.totalEje, currencySymbol)}</td>

                    <!-- Saldo Pendiente -->
                    <td id="est-part-pct-saldo-${row.id}" class="py-1 px-1 text-center text-[10.5px] font-bold text-amber-800 bg-amber-50/25 whitespace-nowrap">${row.pctSaldo.toFixed(2)}%</td>
                    <td id="est-part-tot-saldo-${row.id}" class="py-1 px-1.5 text-right font-bold text-amber-800 bg-amber-50/25 whitespace-nowrap text-[11px]">${formatCurrency(row.totalSaldo, currencySymbol)}</td>
                  </tr>
                `;
              } else {
                const indentPx = (row.level - 1) * 12 + 14;

                return `
                  <tr data-est-row="${row.id}" onclick="selectEstimacionRow('${row.id}', event)" onfocusin="selectEstimacionRow('${row.id}', event)" class="${isSelectedRow ? 'selected-row' : 'hover:bg-blue-50/40'} text-[11px] cursor-pointer transition bg-white">
                    <!-- Clave -->
                    <td class="py-1 px-1 text-center font-mono text-blue-600 font-bold text-[10.5px] sticky z-15 bg-white border-r border-slate-100 col-estimaciones-clave">${row.clave || ''}</td>
                    
                    <!-- Concepto -->
                    <td class="py-1 px-2 text-slate-800 font-normal font-sans text-[11px] sticky z-15 bg-white border-r-2 border-slate-400 col-estimaciones-concepto shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]" style="padding-left: ${indentPx}px">
                      <div class="flex items-start gap-1.5 min-w-0">
                        <span class="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style="background-color: ${row.color?.bar || row.color?.primary || (typeof row.color === 'string' ? row.color : '#3b82f6')};"></span>
                        <span class="estimaciones-concepto-desc flex-1 text-slate-800 font-sans" style="text-align: justify; text-justify: inter-word;">${row.descripcion || ''}</span>
                        <span class="ml-1 shrink-0 self-center">${renderPartidaNivel1ChatButton(row.id, row.clave, row.descripcion)}</span>
                      </div>
                    </td>

                    <!-- Contrato Base -->
                    <td class="py-1 px-1 text-right font-mono text-slate-600 bg-blue-50/10 whitespace-nowrap text-[10.5px]">${row.pctPonderacion.toFixed(2)}%</td>
                    <td class="py-1 px-1.5 min-w-[70px] text-right font-mono font-bold text-slate-900 bg-blue-50/20 border-r-2 border-blue-100 whitespace-nowrap text-[11px]">${formatCurrency(row.importeBase, currencySymbol)}</td>

                    <!-- Acumulado al Corte -->
                    <td id="est-cell-pct-acum-${row.id}" class="py-1 px-1 text-center font-mono font-bold text-[10.5px] bg-cyan-50/25 whitespace-nowrap ${row.pctAcum >= 100 ? 'text-emerald-700 font-black' : row.pctAcum > 0 ? 'text-blue-700' : 'text-slate-400'}">
                      ${row.pctAcum.toFixed(2)}%
                    </td>
                    <td id="est-cell-tot-acum-${row.id}" class="py-1 px-1.5 min-w-[70px] text-right font-mono font-bold text-slate-800 bg-cyan-50/20 border-r-2 border-cyan-100 whitespace-nowrap text-[11px]">
                      ${formatCurrency(row.totalAcum, currencySymbol)}
                    </td>

                    <!-- Estimación Anterior -->
                    <td class="py-1 px-1 text-center font-mono bg-purple-50/10 whitespace-nowrap text-[10.5px] ${row.pctAnt > 0 ? 'text-purple-900 font-semibold' : 'text-slate-400'}">
                      ${row.pctAnt.toFixed(2)}%
                    </td>
                    <td class="py-1 px-1.5 min-w-[70px] text-right font-mono bg-purple-50/20 border-r-2 border-purple-100 whitespace-nowrap text-[11px] ${row.importeAnt > 0 ? 'text-purple-900 font-bold' : 'text-slate-400'}">
                      ${formatCurrency(row.importeAnt, currencySymbol)}
                    </td>

                    <!-- Esta Estimación (Zona de Captura de % Avance con Botón de Foto al lado de %) -->
                    <td class="py-0.5 px-1 text-center bg-emerald-50/40 border-r border-emerald-200">
                      <div class="flex items-center justify-center gap-1">
                        <input type="text" 
                               inputmode="decimal"
                               ${isEstLocked ? 'disabled readonly' : ''}
                               data-est-pct-input="${row.id}"
                               data-est-cant-input="${row.id}"
                               value="${row.pctEje > 0 ? Number(row.pctEje).toFixed(2) : ''}" 
                               placeholder="0.00"
                               oninput="onEstimacionAvanceInput('${row.id}', this.value, this)"
                               onblur="onEstimacionAvanceBlur('${row.id}', this)"
                               onchange="onEstimacionAvanceBlur('${row.id}', this)"
                               onkeydown="if(event.key==='Enter'){event.preventDefault(); onEstimacionAvanceBlur('${row.id}', this); const list=Array.from(document.querySelectorAll('[data-est-pct-input]')); const i=list.indexOf(this); if(i>=0 && list[i+1]) list[i+1].focus(); else this.blur();}"
                               class="w-12 min-w-[36px] text-center font-mono font-bold text-[11px] text-emerald-800 bg-white border border-emerald-300 focus:border-emerald-600 focus:bg-emerald-50/50 rounded px-1 py-0.5 outline-none transition shadow-2xs disabled:opacity-65 disabled:cursor-not-allowed">
                        <span class="text-[9.5px] font-bold text-emerald-700 select-none">%</span>
                        <button type="button"
                                onclick="openEstimacionConceptPhotosModal('${row.id}')"
                                title="${(row.fotos && row.fotos.length > 0) ? `${row.fotos.length} foto(s) vinculada(s) desde la nube (Google Drive / OneDrive)` : 'Agregar 1 o 2 fotos desde la nube (Google Drive / OneDrive)'}"
                                class="shrink-0 inline-flex items-center justify-center gap-0.5 px-1 py-0.5 rounded border text-[9px] font-bold transition cursor-pointer ${(row.fotos && row.fotos.length > 0) ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-700 shadow-2xs' : 'bg-white hover:bg-emerald-100 text-slate-400 hover:text-emerald-700 border-slate-300 hover:border-emerald-300'}">
                          <i class="fa-solid fa-camera text-[8.5px]"></i>
                          ${(row.fotos && row.fotos.length > 0) ? `<span class="font-mono text-[8px] leading-none">${row.fotos.length}</span>` : ''}
                        </button>
                      </div>
                    </td>
                    <td id="est-cell-tot-eje-${row.id}" class="py-1 px-1.5 min-w-[70px] text-right font-mono font-black bg-emerald-50/50 border-r-2 border-emerald-300 whitespace-nowrap text-[11px] ${row.totalEje > 0 ? 'text-emerald-700' : 'text-slate-400'}">
                      ${formatCurrency(row.totalEje, currencySymbol)}
                    </td>

                    <!-- Saldo Pendiente -->
                    <td id="est-cell-pct-saldo-${row.id}" class="py-1 px-1 text-center font-mono text-[10.5px] bg-amber-50/15 whitespace-nowrap ${row.pctSaldo <= 0 ? 'text-slate-400' : 'text-amber-800 font-semibold'}">
                      ${row.pctSaldo.toFixed(2)}%
                    </td>
                    <td id="est-cell-tot-saldo-${row.id}" class="py-1 px-1.5 min-w-[70px] text-right font-mono font-bold bg-amber-50/25 whitespace-nowrap text-[11px] ${row.totalSaldo <= 0 ? 'text-slate-400' : 'text-amber-800'}">
                      ${formatCurrency(row.totalSaldo, currencySymbol)}
                    </td>
                  </tr>
                `;
              }
            }).join('')}
          </tbody>

          <!-- TOTALES INFERIORES: RECTÁNGULO BLANCO CON LÍNEA GRIS GRUESA ENCABEZANDO SEGÚN INDICACIÓN DEL USUARIO -->
          <tfoot id="estimaciones-tfoot" class="bg-white text-slate-800 font-mono sticky bottom-0 z-20 shadow-2xl divide-y divide-slate-200 text-[11px] border-t-[6px] border-slate-500" style="box-shadow: 0 -6px 0 0 #64748b, 0 -12px 24px -4px rgba(0, 0, 0, 0.12);">
            ${renderEstimacionesTfootContentHTML(kpis, currencySymbol)}
          </tfoot>

        </table>
      </div>

      <!-- SECCIÓN DE DESPLAZAMIENTO HORIZONTAL EXCLUSIVA AL LADO DERECHO DE "CATÁLOGO Y CONCEPTO DE OBRA" -->
      <div id="estimaciones-displacement-bar" class="h-7 bg-slate-100 border-t border-slate-300 flex items-center select-none shrink-0 z-25">
        <!-- Espacio izquierdo sincronizado exactamente con el ancho de Catálogo y Concepto de Obra (Clave + Concepto + Unid) -->
        <div id="estimaciones-displacement-left-spacer" class="h-full bg-slate-200/80 border-r-2 border-slate-400 px-2.5 flex items-center justify-between text-[10px] text-slate-600 font-mono shrink-0 estimaciones-fixed-left-width">
          <span class="truncate font-semibold flex items-center gap-1.5" title="Columna fija: Catálogo y Concepto de Obra">
            <i class="fa-solid fa-thumbtack text-blue-600 text-[9px]"></i> Catálogo y Concepto Fijo
          </span>
          <span class="text-slate-400 text-[9px]">→</span>
        </div>

        <!-- Sección Derecha: Barra de Desplazamiento al lado derecho de Catálogo y Concepto de Obra -->
        <div id="estimaciones-displacement-right-zone" class="flex-1 h-full px-2 flex items-center gap-2 min-w-0 bg-slate-50">
          <button type="button"
                  id="estimaciones-scroll-btn-left"
                  onclick="scrollEstimacionesTableStep(-1)"
                  class="w-6 h-5 rounded bg-white hover:bg-slate-200 active:bg-blue-600 text-slate-600 hover:text-slate-900 active:text-white flex items-center justify-center text-[10px] transition cursor-pointer border border-slate-300 shadow-2xs shrink-0"
                  title="Desplazar columnas numéricas hacia la izquierda (◀)">
            <i class="fa-solid fa-chevron-left"></i>
          </button>

          <div id="estimaciones-scroll-track"
               class="flex-1 h-4 bg-slate-200/90 hover:bg-slate-300/80 rounded-full border border-slate-300 relative cursor-pointer overflow-hidden shadow-inner flex items-center"
               title="Haz clic o arrastra para desplazar las secciones a la derecha de Catálogo y Concepto de Obra">
            <div id="estimaciones-scroll-thumb"
                 class="absolute h-3 rounded-full bg-slate-500 hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-2xs flex items-center justify-center gap-0.5 cursor-grab"
                 style="left: 0px; width: 35%;">
              <span class="w-0.5 h-1.5 bg-white/80 rounded-full pointer-events-none"></span>
              <span class="w-0.5 h-1.5 bg-white/80 rounded-full pointer-events-none"></span>
              <span class="w-0.5 h-1.5 bg-white/80 rounded-full pointer-events-none"></span>
            </div>
          </div>

          <button type="button"
                  id="estimaciones-scroll-btn-right"
                  onclick="scrollEstimacionesTableStep(1)"
                  class="w-6 h-5 rounded bg-white hover:bg-slate-200 active:bg-blue-600 text-slate-600 hover:text-slate-900 active:text-white flex items-center justify-center text-[10px] transition cursor-pointer border border-slate-300 shadow-2xs shrink-0"
                  title="Desplazar columnas numéricas hacia la derecha (▶)">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>
  `;
}

// ==========================================
// RENDERIZADOR SUB-VISTA 2: PAGOS A ESPECIALISTAS Y SUBCONTRATOS
// ==========================================
function renderSpecialistsPaymentsHTML(cashflow, currencySymbol) {
  const allContracts = getSpecialistsContractsData();
  const term = specialistsSearchTerm.trim().toLowerCase();

  // Filtrado por buscador y estado
  const filteredContracts = allContracts.filter(c => {
    if (specialistsStatusFilter === 'pendientes' && c.saldoPendiente <= 0.01) return false;
    if (specialistsStatusFilter === 'liquidados' && (c.saldoPendiente > 0.01 || c.totalContratado <= 0)) return false;

    if (!term) return true;
    const matchBasic = (c.clave && String(c.clave).toLowerCase().includes(term)) ||
                       (c.descripcion && c.descripcion.toLowerCase().includes(term)) ||
                       (c.especialidad && c.especialidad.toLowerCase().includes(term)) ||
                       (c.proveedor && c.proveedor.toLowerCase().includes(term)) ||
                       (c.proveedorName && c.proveedorName.toLowerCase().includes(term));
    if (matchBasic) return true;
    const matchPagos = (c.pagos || []).some(p => 
      (p.concepto && p.concepto.toLowerCase().includes(term)) ||
      (p.referencia && p.referencia.toLowerCase().includes(term))
    );
    return matchPagos;
  });

  const totalCount = allContracts.length;
  const pendingCount = allContracts.filter(c => c.saldoPendiente > 0.01).length;
  const liquidatedCount = allContracts.filter(c => c.totalContratado > 0 && c.saldoPendiente <= 0.01).length;

  const totalContratadoSum = filteredContracts.reduce((acc, c) => acc + (c.totalContratado || 0), 0);
  const totalPagadoSum = filteredContracts.reduce((acc, c) => acc + (c.totalPagado || 0), 0);
  const totalSaldoSum = filteredContracts.reduce((acc, c) => acc + (c.saldoPendiente || 0), 0);
  const pctPagadoGlobal = totalContratadoSum > 0 ? (totalPagadoSum / totalContratadoSum) * 100 : 0;

  return `
    <!-- BARRA DE HERRAMIENTAS Y FILTROS DE ESPECIALISTAS -->
    <div class="bg-white border-b border-slate-200 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shrink-0 font-sans shadow-2xs">
      
      <!-- Izquierda: Buscador + Filtros de Estado -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Buscador -->
        <div class="relative">
          <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
          <input type="text"
                 id="specialists-search-input"
                 value="${specialistsSearchTerm}"
                 oninput="onSearchSpecialists(this.value)"
                 placeholder="Buscar especialista, concepto, folio..."
                 class="w-48 sm:w-64 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-indigo-600 rounded-xl px-2.5 py-1.5 pl-8 text-xs text-slate-800 placeholder-slate-400 outline-none transition shadow-2xs">
          ${specialistsSearchTerm ? `
            <button onclick="onSearchSpecialists('')" class="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"><i class="fa-solid fa-xmark"></i></button>
          ` : ''}
        </div>

        <!-- Filtros de Estado: Todos, Con Saldo, Liquidados -->
        <div class="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          <button type="button"
                  onclick="setSpecialistsStatusFilter('todos')"
                  class="px-3 py-1 rounded-lg font-bold transition cursor-pointer ${specialistsStatusFilter === 'todos' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}">
            Todos (${totalCount})
          </button>
          <button type="button"
                  onclick="setSpecialistsStatusFilter('pendientes')"
                  class="px-3 py-1 rounded-lg font-bold transition cursor-pointer ${specialistsStatusFilter === 'pendientes' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}">
            Con Saldo (${pendingCount})
          </button>
          <button type="button"
                  onclick="setSpecialistsStatusFilter('liquidados')"
                  class="px-3 py-1 rounded-lg font-bold transition cursor-pointer ${specialistsStatusFilter === 'liquidados' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}">
            Liquidados (${liquidatedCount})
          </button>
        </div>
      </div>

      <!-- Derecha: Botón [+ Registrar Pago] + Botón [Excel] -->
      <div class="flex items-center gap-2">
        <button type="button"
                onclick="exportPagosEspecialistasExcel()"
                class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 font-bold shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                title="Descargar libro de Cuentas por Pagar en Excel">
          <i class="fa-solid fa-file-excel text-xs"></i>
          <span>Excel Cuentas por Pagar</span>
        </button>

        <button type="button"
                onclick="openRegistrarPagoModal()"
                class="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer shrink-0">
          <i class="fa-solid fa-plus font-bold text-xs"></i>
          <span>+ Registrar Pago</span>
        </button>
      </div>

    </div>

    <!-- TABLA DE ESPECIALISTAS Y SUBCONTRATOS -->
    <div class="flex-1 overflow-auto bg-slate-50 custom-scroll relative" id="specialists-table-container">
      ${filteredContracts.length === 0 ? `
        <div class="p-12 text-center flex flex-col items-center justify-center gap-3">
          <div class="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-500 flex items-center justify-center text-2xl shadow-sm">
            <i class="fa-solid fa-users-gear"></i>
          </div>
          <div class="max-w-md">
            <h4 class="text-sm font-bold text-slate-800">
              ${term ? 'No se encontraron resultados para la búsqueda' : 'No hay especialidades o conceptos con cotizaciones'}
            </h4>
            <p class="text-xs text-slate-500 mt-1">
              ${term ? 'Intenta con otro término de búsqueda o cambia el filtro de estado.' : 'En esta sección solo se muestran las filas de los conceptos o especialidades que cuenten con cotizaciones registradas en la pestaña ALCANCES.'}
            </p>
          </div>
          ${allContracts.length > 0 ? `
            <button type="button" onclick="openRegistrarPagoModal()" class="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1.5">
              <i class="fa-solid fa-plus"></i> Registrar Pago
            </button>
          ` : `
            <button type="button" onclick="switchTab('alcances')" class="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1.5">
              <i class="fa-solid fa-layer-group"></i> Ir a ALCANCES para registrar cotizaciones
            </button>
          `}
        </div>
      ` : `
        <table class="w-full text-left text-xs border-collapse">
          
          <!-- Encabezado de la tabla de especialistas -->
          <thead class="sticky top-0 z-20 shadow-md select-none bg-slate-800 text-white whitespace-nowrap text-[10px] uppercase tracking-wider font-extrabold">
            <tr>
              <th class="py-2.5 px-3 border-r border-slate-700 min-w-[220px]">Especialidad / Servicio</th>
              <th class="py-2.5 px-3 border-r border-slate-700 min-w-[200px]">Proveedor / Especialista Asignado</th>
              <th class="py-2.5 px-3 border-r border-slate-700 text-right min-w-[110px]">Total Contratado ($)</th>
              <th class="py-2.5 px-3 border-r border-slate-700 text-right min-w-[130px]">Total Pagado ($ / %)</th>
              <th class="py-2.5 px-3 border-r border-slate-700 text-right min-w-[120px]">Saldo Pendiente ($)</th>
              <th class="py-2.5 px-3 border-r border-slate-700 min-w-[160px]">Último Pago Realizado</th>
              <th class="py-2.5 px-3 text-center min-w-[160px]">Acciones</th>
            </tr>
          </thead>

          <!-- Filas de contratos con especialistas -->
          <tbody class="divide-y divide-slate-200 bg-white font-sans text-xs">
            ${filteredContracts.map(c => {
              const isExpanded = expandedSpecialistHistories.has(String(c.nodeId));
              const hasBalance = c.saldoPendiente > 0.01;
              const provDisplay = c.proveedor || c.proveedorName || '';

              return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-200 ${isExpanded ? 'bg-indigo-50/20' : ''}">
                  
                  <!-- Especialidad / Servicio -->
                  <td class="py-2.5 px-3 align-middle">
                    <div class="flex items-start gap-2">
                      <span class="font-mono font-bold text-blue-700 text-[10.5px] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                        ${c.clave || '---'}
                      </span>
                      <div class="min-w-0">
                        <div class="font-bold text-slate-900 text-xs leading-snug">${c.descripcion || c.especialidad}</div>
                        ${c.partidaNombre ? `<div class="text-[10.5px] text-slate-500">${c.partidaNombre}</div>` : ''}
                      </div>
                    </div>
                  </td>

                  <!-- Proveedor / Especialista Asignado -->
                  <td class="py-2.5 px-3 align-middle">
                    <div class="flex items-center gap-1.5 group">
                      <i class="fa-solid fa-user-tie text-indigo-500 text-xs shrink-0"></i>
                      <span class="font-semibold text-slate-800 text-xs truncate max-w-[180px]" title="${provDisplay || 'Sin proveedor asignado'}">
                        ${provDisplay || '<span class="text-slate-400 italic">Sin proveedor</span>'}
                      </span>
                      <button type="button"
                              onclick="promptEditSpecialistProveedor('${c.nodeId}')"
                              class="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-slate-100 transition cursor-pointer"
                              title="Editar proveedor">
                        <i class="fa-solid fa-pen-to-square text-[11px]"></i>
                      </button>
                    </div>
                  </td>

                  <!-- Total Contratado -->
                  <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900 align-middle">
                    ${formatCurrency(c.totalContratado, currencySymbol)}
                  </td>

                  <!-- Total Pagado ($ y %) -->
                  <td class="py-2.5 px-3 text-right font-mono align-middle">
                    <div class="font-black text-indigo-700 text-xs">
                      ${formatCurrency(c.totalPagado, currencySymbol)}
                    </div>
                    <div class="mt-0.5">
                      <span class="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${c.pctPagado >= 100 ? 'bg-emerald-100 text-emerald-800' : c.pctPagado > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-500'}">
                        ${c.pctPagado.toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  <!-- Saldo Pendiente -->
                  <td class="py-2.5 px-3 text-right font-mono align-middle">
                    <div class="font-black text-xs ${hasBalance ? 'text-amber-800' : 'text-emerald-700'}">
                      ${formatCurrency(c.saldoPendiente, currencySymbol)}
                    </div>
                    <div class="text-[10px] ${hasBalance ? 'text-amber-600' : 'text-emerald-600'}">
                      ${hasBalance ? 'Por liquidar' : (c.totalContratado > 0 ? '✓ Liquidado' : '---')}
                    </div>
                  </td>

                  <!-- Último Pago Realizado -->
                  <td class="py-2.5 px-3 align-middle text-xs">
                    ${c.ultimoPago ? `
                      <div class="font-mono font-semibold text-slate-800">
                        ${c.ultimoPago.fecha ? formatDDMMAAAA(c.ultimoPago.fecha) : ''}
                      </div>
                      <div class="font-mono text-[11px] font-bold text-emerald-700">
                        ${formatCurrency(c.ultimoPago.monto, currencySymbol)}
                      </div>
                    ` : `
                      <span class="text-slate-400 italic text-[11px]">Sin pagos registrados</span>
                    `}
                  </td>

                  <!-- Acciones: [+ Pago] y [Historial] -->
                  <td class="py-2.5 px-3 align-middle text-center">
                    <div class="flex items-center justify-center gap-1.5">
                      <button type="button"
                              onclick="openRegistrarPagoModal('${c.nodeId}')"
                              class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer shadow-2xs flex items-center gap-1"
                              title="Registrar nuevo pago a ${provDisplay || c.descripcion}">
                        <i class="fa-solid fa-plus text-[10px]"></i>
                        <span>+ Pago</span>
                      </button>
                      <button type="button"
                              onclick="toggleSpecialistHistory('${c.nodeId}')"
                              class="px-2.5 py-1.5 ${isExpanded ? 'bg-indigo-700 text-white' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'} rounded-lg text-xs font-semibold transition active:scale-95 cursor-pointer flex items-center gap-1"
                              title="${isExpanded ? 'Ocultar historial de pagos' : 'Ver historial de pagos'}">
                        <i class="fa-solid fa-clock-rotate-left text-[10px]"></i>
                        <span>Historial (${c.pagos.length})</span>
                      </button>
                    </div>
                  </td>

                </tr>

                <!-- HISTORIAL DETALLADO EXPANDIBLE (ACORDEÓN / DRAWER) -->
                ${isExpanded ? `
                  <tr class="bg-indigo-50/40 border-b-2 border-indigo-200">
                    <td colspan="7" class="p-3 sm:p-4">
                      <div class="bg-white rounded-xl border border-indigo-200 p-3.5 shadow-sm space-y-3">
                        <div class="flex items-center justify-between border-b border-slate-200 pb-2">
                          <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">
                              <i class="fa-solid fa-receipt"></i>
                            </span>
                            <span class="font-extrabold text-xs text-slate-800">
                              Historial de Pagos Realizados — ${provDisplay || c.descripcion}
                            </span>
                            <span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold">
                              ${c.pagos.length} registro(s)
                            </span>
                          </div>
                          <button type="button"
                                  onclick="openRegistrarPagoModal('${c.nodeId}')"
                                  class="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer">
                            <i class="fa-solid fa-plus text-[10px]"></i> Agregar otro pago
                          </button>
                        </div>

                        ${(!c.pagos || c.pagos.length === 0) ? `
                          <div class="py-4 text-center text-slate-400 text-xs italic">
                            No se han registrado pagos para este especialista todavía. Haz clic en <strong>+ Registrar Pago</strong> para capturar el anticipo.
                          </div>
                        ` : `
                          <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr class="border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 bg-slate-50/80">
                                  <th class="py-1.5 px-2.5 w-8 text-center">#</th>
                                  <th class="py-1.5 px-2.5 w-24">Fecha</th>
                                  <th class="py-1.5 px-2.5">Concepto / Referencia</th>
                                  <th class="py-1.5 px-2.5 w-28 text-center">Método</th>
                                  <th class="py-1.5 px-2.5 w-36">Factura / Folio</th>
                                  <th class="py-1.5 px-2.5 w-28 text-right">Monto ($)</th>
                                  <th class="py-1.5 px-2.5 w-20 text-center">Acciones</th>
                                </tr>
                              </thead>
                              <tbody class="divide-y divide-slate-100 font-sans">
                                ${c.pagos.map((p, idx) => `
                                  <tr class="hover:bg-slate-50 transition">
                                    <td class="py-1.5 px-2.5 text-center font-mono text-slate-400 text-[10.5px]">${idx + 1}</td>
                                    <td class="py-1.5 px-2.5 font-mono text-slate-700 text-[11px] whitespace-nowrap">${p.fecha ? formatDDMMAAAA(p.fecha) : ''}</td>
                                    <td class="py-1.5 px-2.5 font-semibold text-slate-800">${p.concepto || 'Pago a especialista'}</td>
                                    <td class="py-1.5 px-2.5 text-center">
                                      <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                        ${p.metodo || 'SPEI'}
                                      </span>
                                    </td>
                                    <td class="py-1.5 px-2.5 font-mono text-[11px] text-slate-600 truncate max-w-[140px]" title="${p.referencia || ''}">
                                      ${p.referencia || '<span class="text-slate-400 italic">---</span>'}
                                    </td>
                                    <td class="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700 text-xs whitespace-nowrap">
                                      ${formatCurrency(p.monto, currencySymbol)}
                                    </td>
                                    <td class="py-1.5 px-2.5 text-center whitespace-nowrap">
                                      <div class="inline-flex items-center gap-1">
                                        <button type="button"
                                                onclick="openRegistrarPagoModal('${c.nodeId}', '${p.id}')"
                                                class="text-slate-400 hover:text-indigo-600 p-1 rounded transition cursor-pointer"
                                                title="Editar pago">
                                          <i class="fa-solid fa-pen text-[10px]"></i>
                                        </button>
                                        <button type="button"
                                                onclick="confirmDeleteSpecialistPayment('${c.nodeId}', '${p.id}')"
                                                class="text-slate-400 hover:text-rose-600 p-1 rounded transition cursor-pointer"
                                                title="Eliminar pago">
                                          <i class="fa-solid fa-trash text-[10px]"></i>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                `).join('')}
                              </tbody>
                            </table>
                          </div>
                        `}
                      </div>
                    </td>
                  </tr>
                ` : ''}
              `;
            }).join('')}
          </tbody>

          <!-- Totales inferiores de especialistas -->
          <tfoot class="sticky bottom-0 bg-slate-900 text-white font-sans text-xs shadow-lg font-bold border-t-2 border-slate-700">
            <tr>
              <td colspan="2" class="py-2.5 px-3 uppercase tracking-wider text-right font-extrabold text-[11px] text-slate-300">
                TOTALES DE ESPECIALISTAS Y SUBCONTRATOS:
              </td>
              <td class="py-2.5 px-3 text-right font-mono font-black text-blue-200 text-xs">
                ${formatCurrency(totalContratadoSum, currencySymbol)}
              </td>
              <td class="py-2.5 px-3 text-right font-mono font-black text-indigo-300 text-xs">
                ${formatCurrency(totalPagadoSum, currencySymbol)} <span class="text-[10px] text-indigo-200 font-normal">(${pctPagadoGlobal.toFixed(1)}%)</span>
              </td>
              <td class="py-2.5 px-3 text-right font-mono font-black text-amber-300 text-xs">
                ${formatCurrency(totalSaldoSum, currencySymbol)}
              </td>
              <td colspan="2" class="py-2.5 px-3 text-slate-400 font-normal text-[11px]">
                <i class="fa-solid fa-shield-check text-emerald-400 mr-1"></i> Resumen de Cuentas por Pagar sincronizado
              </td>
            </tr>
          </tfoot>

        </table>
      `}
    </div>
  `;
}

// ==========================================
// BARRA DE DESPLAZAMIENTO AL LADO DERECHO DE "CATÁLOGO Y CONCEPTO DE OBRA"
// ==========================================
export function updateEstimacionesThumbUI() {
  const container = document.getElementById('estimaciones-table-container');
  const track = document.getElementById('estimaciones-scroll-track');
  const thumb = document.getElementById('estimaciones-scroll-thumb');
  if (!container || !track || !thumb) return;

  const scrollW = Math.max(1, container.scrollWidth || 1000);
  const clientW = Math.max(1, container.clientWidth || 800);
  const trackW = Math.max(60, track.clientWidth || 400);
  const maxScroll = Math.max(0, scrollW - clientW);

  if (maxScroll <= 2) {
    thumb.style.left = '0px';
    thumb.style.width = `${trackW}px`;
    return;
  }

  const ratio = Math.min(1, Math.max(0.15, clientW / scrollW));
  const thumbW = Math.max(36, Math.round(trackW * ratio));
  const maxThumbLeft = Math.max(0, trackW - thumbW);
  const scrollFraction = Math.min(1, Math.max(0, (container.scrollLeft || 0) / maxScroll));
  const thumbLeft = Math.round(scrollFraction * maxThumbLeft);

  thumb.style.width = `${thumbW}px`;
  thumb.style.left = `${thumbLeft}px`;
}

export function scrollEstimacionesTableStep(direction = 1) {
  const container = document.getElementById('estimaciones-table-container');
  if (!container) return;
  const step = 220 * (direction >= 0 ? 1 : -1);
  container.scrollLeft = Math.max(0, (container.scrollLeft || 0) + step);
  updateEstimacionesThumbUI();
}

export function initEstimacionesDisplacementBar() {
  const container = document.getElementById('estimaciones-table-container');
  const track = document.getElementById('estimaciones-scroll-track');
  const thumb = document.getElementById('estimaciones-scroll-thumb');
  if (!container || !track || !thumb) return;

  updateEstimacionesThumbUI();

  container.onscroll = () => {
    updateEstimacionesThumbUI();
  };

  track.onmousedown = (e) => {
    if (e.target === thumb || (thumb.contains && thumb.contains(e.target))) return;
    if (!track.getBoundingClientRect) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackW = Math.max(1, rect.width);
    const maxScroll = Math.max(0, (container.scrollWidth || 0) - (container.clientWidth || 0));
    const fraction = Math.max(0, Math.min(1, clickX / trackW));
    container.scrollLeft = Math.round(fraction * maxScroll);
    updateEstimacionesThumbUI();
  };

  thumb.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startScroll = container.scrollLeft || 0;
    const trackW = Math.max(1, track.clientWidth || 400);
    const thumbW = Math.max(24, thumb.offsetWidth || 80);
    const maxThumbLeft = Math.max(1, trackW - thumbW);
    const maxScroll = Math.max(0, (container.scrollWidth || 0) - (container.clientWidth || 0));

    document.body.style.userSelect = 'none';

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const scrollDelta = (dx / maxThumbLeft) * maxScroll;
      container.scrollLeft = Math.max(0, Math.min(maxScroll, startScroll + scrollDelta));
      updateEstimacionesThumbUI();
    }

    function onUp() {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
}

// ==========================================
// CONTROLADORES DE EVENTOS DE USUARIO
// ==========================================

export function onSwitchActiveEstimacion(estimacionId) {
  setActiveEstimacionId(estimacionId);
  renderEstimacionesView();
  showToast('Estimación cambiada');
}

export function promptCreateNewEstimacion() {
  const data = getEstimacionesCalculatedData();
  const nextNum = data.estimacionesList.length + 1;
  const nombre = prompt(`Nombre de la nueva estimación:`, `Estimación No. ${nextNum}`);
  if (!nombre) return;

  const newEst = createNewEstimacion(nombre.trim());
  renderEstimacionesView();
  showToast(`Creada exitosamente: ${newEst.nombre}`, 'success');
}

export function toggleActiveEstimacionLock() {
  const locked = toggleTabLock('estimaciones');
  renderEstimacionesView();
  return locked;
}

export function confirmDeleteCurrentEstimacion(estId, estNombre) {
  if (!guardTabUnlocked('estimaciones')) return;
  if (!confirm(`¿Estás seguro de eliminar "${estNombre}"? Esta acción no se puede deshacer.`)) {
    return;
  }
  const ok = deleteEstimacion(estId);
  if (ok) {
    renderEstimacionesView();
    showToast(`Se ha eliminado ${estNombre}`);
  } else {
    showToast('No se puede eliminar la única estimación del proyecto', 'warning');
  }
}

export function onChangeEstimacionDate(estId, field, val) {
  if (!guardTabUnlocked('estimaciones')) {
    renderEstimacionesView();
    return;
  }
  if (!val) return;
  updateEstimacionMeta(estId, { [field]: val, fechaCorte: val });
  renderEstimacionesView();
  showToast('Período de estimación actualizado');
}

// Formatea cualquier porcentaje positivo de % AVANCE a 2 decimales exactos (ej. "80" -> "80.00", "5.3" -> "5.30")
export function formatAvancePctTwoDecimals(rawVal) {
  const cleaned = String(rawVal ?? '').replace(/,/g, '.').replace(/[^0-9.]/g, '').trim();
  if (!cleaned) return '';
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return '';
  const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
  return rounded.toFixed(2);
}

export function formatCantEjeTwoDecimals(rawVal) {
  return formatAvancePctTwoDecimals(rawVal);
}

// Sanitiza mientras el usuario escribe sin interrumpir la captura, limitando a máximo 2 decimales después del punto
function sanitizeAvancePctWhileTyping(rawVal) {
  let cleaned = String(rawVal ?? '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx !== -1) {
    const intPart = cleaned.slice(0, dotIdx);
    const decPart = cleaned.slice(dotIdx + 1).replace(/\./g, '').slice(0, 2);
    cleaned = `${intPart}.${decPart}`;
  }
  return cleaned;
}

export function onEstimacionAvanceInput(conceptId, val, inputEl = null) {
  selectEstimacionRow(conceptId);
  if (!guardTabUnlocked('estimaciones')) {
    renderEstimacionesView();
    return;
  }
  const sanitized = sanitizeAvancePctWhileTyping(val);
  if (inputEl && typeof inputEl === 'object' && inputEl.value !== sanitized) {
    inputEl.value = sanitized;
  }

  setConceptoAvancePct(conceptId, sanitized);

  if (typeof document === 'undefined') return;
  const currencySymbol = state.settings?.currencySymbol || '$';
  const { rows, kpis } = getEstimacionesCalculatedData();

  // Actualización reactiva quirúrgica de celdas y totales sin recrear el <input> activo (mantiene el foco en la casilla)
  rows.forEach(r => {
    if (r.isParent) {
      const partEjePctEl = document.getElementById(`est-part-pct-eje-${r.id}`);
      if (partEjePctEl) partEjePctEl.textContent = `${r.pctAvanceEsta.toFixed(2)}%`;

      const partEjeTotEl = document.getElementById(`est-part-tot-eje-${r.id}`);
      if (partEjeTotEl) partEjeTotEl.textContent = formatCurrency(r.totalEje, currencySymbol);

      const partAcumPctEl = document.getElementById(`est-part-pct-acum-${r.id}`);
      if (partAcumPctEl) partAcumPctEl.textContent = `${r.pctAvanceAcum.toFixed(2)}%`;

      const partAcumTotEl = document.getElementById(`est-part-tot-acum-${r.id}`);
      if (partAcumTotEl) partAcumTotEl.textContent = formatCurrency(r.totalAcum, currencySymbol);

      const partSaldoPctEl = document.getElementById(`est-part-pct-saldo-${r.id}`);
      if (partSaldoPctEl) partSaldoPctEl.textContent = `${r.pctSaldo.toFixed(2)}%`;

      const partSaldoTotEl = document.getElementById(`est-part-tot-saldo-${r.id}`);
      if (partSaldoTotEl) partSaldoTotEl.textContent = formatCurrency(r.totalSaldo, currencySymbol);
    } else {
      const totEjeEl = document.getElementById(`est-cell-tot-eje-${r.id}`);
      if (totEjeEl) {
        totEjeEl.textContent = formatCurrency(r.totalEje, currencySymbol);
        totEjeEl.className = `py-1 px-1.5 min-w-[70px] text-right font-mono font-black bg-emerald-50/50 border-r-2 border-emerald-300 whitespace-nowrap text-[11px] ${r.totalEje > 0 ? 'text-emerald-700' : 'text-slate-400'}`;
      }

      const pctAcumEl = document.getElementById(`est-cell-pct-acum-${r.id}`);
      if (pctAcumEl) {
        pctAcumEl.textContent = `${r.pctAcum.toFixed(2)}%`;
        pctAcumEl.className = `py-1 px-1 text-center font-mono font-bold text-[10.5px] bg-cyan-50/25 whitespace-nowrap ${r.pctAcum >= 100 ? 'text-emerald-700 font-black' : r.pctAcum > 0 ? 'text-blue-700' : 'text-slate-400'}`;
      }

      const totAcumEl = document.getElementById(`est-cell-tot-acum-${r.id}`);
      if (totAcumEl) {
        totAcumEl.textContent = formatCurrency(r.totalAcum, currencySymbol);
      }

      const pctSaldoEl = document.getElementById(`est-cell-pct-saldo-${r.id}`);
      if (pctSaldoEl) {
        pctSaldoEl.textContent = `${r.pctSaldo.toFixed(2)}%`;
        pctSaldoEl.className = `py-1 px-1 text-center font-mono text-[10.5px] bg-amber-50/15 whitespace-nowrap ${r.pctSaldo <= 0 ? 'text-slate-400' : 'text-amber-800 font-semibold'}`;
      }

      const totSaldoEl = document.getElementById(`est-cell-tot-saldo-${r.id}`);
      if (totSaldoEl) {
        totSaldoEl.textContent = formatCurrency(r.totalSaldo, currencySymbol);
        totSaldoEl.className = `py-1 px-1.5 min-w-[70px] text-right font-mono font-bold bg-amber-50/25 border-r border-slate-200 whitespace-nowrap text-[11px] ${r.totalSaldo <= 0 ? 'text-slate-400' : 'text-amber-800'}`;
      }
    }
  });

  // Actualización de la Fila Superior: Resumen Ejecutivo del Proyecto
  const topTotContrato = document.getElementById('est-top-tot-contrato');
  if (topTotContrato) topTotContrato.textContent = formatCurrency(kpis.grandTotalBase, currencySymbol);

  const topPctAcum = document.getElementById('est-top-pct-acum');
  if (topPctAcum) topPctAcum.textContent = `${kpis.pctAvanceGlobal.toFixed(2)}%`;

  const topTotAcum = document.getElementById('est-top-tot-acum');
  if (topTotAcum) topTotAcum.textContent = formatCurrency(kpis.grandTotalAcumulado, currencySymbol);

  const topPctAnt = document.getElementById('est-top-pct-ant');
  if (topPctAnt) topPctAnt.textContent = `${kpis.pctAvanceAnterior.toFixed(2)}%`;

  const topTotAnt = document.getElementById('est-top-tot-ant');
  if (topTotAnt) topTotAnt.textContent = formatCurrency(kpis.grandTotalAnterior, currencySymbol);

  const topPctEje = document.getElementById('est-top-pct-eje');
  if (topPctEje) topPctEje.textContent = `${kpis.pctAvanceEstaEstimacion.toFixed(2)}%`;

  const topTotEje = document.getElementById('est-top-tot-eje');
  if (topTotEje) topTotEje.textContent = formatCurrency(kpis.grandTotalEjecutado, currencySymbol);

  const topPctSaldo = document.getElementById('est-top-pct-saldo');
  if (topPctSaldo) topPctSaldo.textContent = `${kpis.pctSaldoGlobal.toFixed(2)}%`;

  const topTotSaldo = document.getElementById('est-top-tot-saldo');
  if (topTotSaldo) topTotSaldo.textContent = formatCurrency(kpis.grandTotalSaldo, currencySymbol);

  // Actualización de las 4 Tarjetas de Resumen Ejecutivo (KPIs Superiores)
  const kpiContratado = document.getElementById('est-kpi-contratado');
  if (kpiContratado) kpiContratado.textContent = formatCurrency(kpis.grandTotalBase, currencySymbol);

  const kpiAcumMonto = document.getElementById('est-kpi-acum-monto');
  if (kpiAcumMonto) kpiAcumMonto.textContent = formatCurrency(kpis.grandTotalAcumulado, currencySymbol);

  const kpiAcumPct = document.getElementById('est-kpi-acum-pct');
  if (kpiAcumPct) kpiAcumPct.textContent = `${kpis.pctAvanceGlobal.toFixed(2)}%`;

  const kpiEjeMonto = document.getElementById('est-kpi-eje-monto');
  if (kpiEjeMonto) kpiEjeMonto.textContent = formatCurrency(kpis.grandTotalEjecutado, currencySymbol);

  const kpiEjePct = document.getElementById('est-kpi-eje-pct');
  if (kpiEjePct) kpiEjePct.textContent = `${kpis.pctAvanceEstaEstimacion.toFixed(2)}%`;

  const kpiSaldoMonto = document.getElementById('est-kpi-saldo-monto');
  if (kpiSaldoMonto) kpiSaldoMonto.textContent = formatCurrency(kpis.grandTotalSaldo, currencySymbol);

  const kpiSaldoPct = document.getElementById('est-kpi-saldo-pct');
  if (kpiSaldoPct) kpiSaldoPct.textContent = `${kpis.pctSaldoGlobal.toFixed(2)}%`;

  const anticipoMontoEl = document.getElementById('est-header-anticipo-monto');
  if (anticipoMontoEl) anticipoMontoEl.textContent = `% (${formatCurrency(kpis.anticipo.monto, currencySymbol)})`;

  const ivaMontoEl = document.getElementById('est-header-iva-monto');
  if (ivaMontoEl) ivaMontoEl.textContent = `% (${formatCurrency(kpis.iva.monto, currencySymbol)})`;

  const tfootEl = document.getElementById('estimaciones-tfoot');
  if (tfootEl) {
    tfootEl.innerHTML = renderEstimacionesTfootContentHTML(kpis, currencySymbol);
  }
}

// Al terminar de capturar en % AVANCE (blur / change / Enter), completa automáticamente .00 o el segundo decimal (.X0)
export function onEstimacionAvanceBlur(conceptId, inputEl) {
  if (isEstimacionLocked()) return '';
  const rawVal = inputEl && typeof inputEl === 'object' ? inputEl.value : inputEl;
  const formatted = formatAvancePctTwoDecimals(rawVal);
  if (inputEl && typeof inputEl === 'object') {
    inputEl.value = formatted;
  }
  onEstimacionAvanceInput(conceptId, formatted || '0', inputEl);
  return formatted;
}

// Aliases para retrocompatibilidad total con llamadas históricas
export function onEstimacionCantEjeInput(conceptId, val, inputEl = null) {
  return onEstimacionAvanceInput(conceptId, val, inputEl);
}

export function onEstimacionCantEjeBlur(conceptId, inputEl) {
  return onEstimacionAvanceBlur(conceptId, inputEl);
}

export function onEstimacionesAnticipoInput(val) {
  if (!guardTabUnlocked('estimaciones')) {
    renderEstimacionesView();
    return;
  }
  setEstimacionesAnticipoPct(val);
  renderEstimacionesView();
  showToast('Porcentaje de anticipo actualizado');
}

export function onSearchEstimaciones(term) {
  estimacionesSearchTerm = term;
  renderEstimacionesView();
  if (typeof document !== 'undefined') {
    const searchEl = document.getElementById('estimaciones-search-input');
    if (searchEl && typeof searchEl.focus === 'function') {
      searchEl.focus();
      if (typeof searchEl.setSelectionRange === 'function') {
        const len = searchEl.value.length;
        searchEl.setSelectionRange(len, len);
      }
    }
  }
}

export function toggleEstimacionesGroup(nodeId) {
  const node = findNodeById(state.treeData, nodeId);
  if (node) {
    node.expanded = (node.expanded === false ? true : false);
    persistLocalData();
    renderEstimacionesView();
    if (typeof renderTAB1 === 'function') {
      try { renderTAB1(); } catch (_) {}
    }
  }
}

export function collapseAllEstimacionesPartidas() {
  collapseAllCatalogNodes();
  renderEstimacionesView();
  showToast('Todas las partidas agrupadas');
}

export function expandAllEstimacionesPartidas() {
  expandAllCatalogNodes();
  renderEstimacionesView();
  showToast('Todas las partidas desagrupadas');
}

// Imprimir formato de Estimación (Carátula ejecutiva y tabla de generadores)
export function printEstimacionActual() {
  printEstimacionesFormat();
}

export function onEstimacionesIvaInput(val) {
  if (!guardTabUnlocked('estimaciones')) {
    renderEstimacionesView();
    return;
  }
  setEstimacionesIvaPct(val);
  renderEstimacionesView();
  showToast('Porcentaje de IVA actualizado');
}

// =========================================================================
// MODAL DE REPORTE FOTOGRÁFICO DESDE LA NUBE DEL USUARIO (GOOGLE DRIVE / ONEDRIVE)
// =========================================================================
let activePhotoModalConceptId = null;

export function openEstimacionConceptPhotosModal(conceptId) {
  const data = getEstimacionesCalculatedData();
  const row = data.rows.find(r => !r.isParent && String(r.id) === String(conceptId));
  if (!row) return;

  activePhotoModalConceptId = String(conceptId);
  const activeEst = data.activeEst;
  const isLocked = Boolean(activeEst && activeEst.locked);
  const fotos = getConceptoFotosEstimacion(conceptId);
  const f1 = fotos[0] || { url: '', displayUrl: '', nota: '' };
  const f2 = fotos[1] || { url: '', displayUrl: '', nota: '' };

  let modalEl = document.getElementById('estimacion-fotos-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'estimacion-fotos-modal';
    modalEl.className = 'no-print fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3';
    document.body.appendChild(modalEl);
  }
  modalEl.onclick = (e) => {
    if (e.target === modalEl) closeEstimacionConceptPhotosModal();
  };
  modalEl.classList.remove('hidden');

  modalEl.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
      
      <!-- Encabezado del Modal -->
      <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white px-5 py-3.5 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="w-9 h-9 rounded-xl bg-indigo-500/25 border border-indigo-400/40 text-amber-300 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-camera-retro text-base"></i>
          </span>
          <div class="min-w-0">
            <h3 class="text-sm font-bold text-white truncate">Reporte Fotográfico en la Nube — ${activeEst.nombre}</h3>
            <p class="text-[11px] text-indigo-200 truncate">
              Clave <strong>${row.clave}</strong> • Avance: <strong>${Number(row.cantEje || 0).toFixed(2)}%</strong> (Sin ocupar espacio en servidor)
            </p>
          </div>
        </div>
        <button type="button" onclick="closeEstimacionConceptPhotosModal()" class="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <!-- Cuerpo del Modal -->
      <div class="p-4 overflow-y-auto space-y-4 text-xs">
        
        <!-- Resumen del Concepto -->
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <div class="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Partida: <strong class="text-slate-700 font-sans">${row.partidaNombre || 'General'}</strong></span>
            <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Avance: ${Number(row.cantEje || 0).toFixed(2)}%</span>
          </div>
          <p class="text-xs font-semibold text-slate-800 leading-snug">${row.descripcion}</p>
        </div>

        <!-- Guía rápida de enlaces de nube -->
        <div class="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
          <i class="fa-solid fa-cloud-arrow-up text-blue-600 mt-0.5 shrink-0"></i>
          <div>
            <strong>Enlaces desde tu nube (Google Drive / OneDrive / Dropbox):</strong> Pega el enlace compartido de 1 o 2 fotografías. El sistema convierte automáticamente los enlaces de Google Drive (<em>"Cualquier persona con el enlace"</em>) para que aparezcan en la hoja de este concepto al imprimir el <strong>Resumen de la Estimación</strong>.
          </div>
        </div>

        <!-- Grid de las 2 Fotografías -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          
          <!-- FOTOGRAFÍA 1 -->
          <div class="p-3 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-800 flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold inline-flex items-center justify-center">1</span>
                <span>Fotografía 1</span>
              </span>
              ${!isLocked ? `
                <button type="button" onclick="clearEstimacionConceptPhotoSlot(1)" class="text-[10.5px] text-rose-600 hover:underline cursor-pointer">
                  Limpiar
                </button>
              ` : ''}
            </div>

            <div class="space-y-1">
              <label class="text-[10.5px] font-semibold text-slate-600 block">Enlace URL (Google Drive / OneDrive):</label>
              <input type="url" id="est-foto-url-1"
                     ${isLocked ? 'disabled readonly' : ''}
                     value="${f1.url.replace(/"/g, '&quot;')}"
                     oninput="onEstimacionPhotoUrlPreviewInput(1)"
                     placeholder="https://drive.google.com/file/d/.../view"
                     class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-600 disabled:bg-slate-100">
            </div>

            <div class="space-y-1">
              <label class="text-[10.5px] font-semibold text-slate-600 block">Pie de foto / Descripción:</label>
              <input type="text" id="est-foto-nota-1"
                     ${isLocked ? 'disabled readonly' : ''}
                     value="${f1.nota.replace(/"/g, '&quot;')}"
                     placeholder="Ej. Vista de armado y cimbrado en eje A-C..."
                     class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-600 disabled:bg-slate-100">
            </div>

            <div class="h-36 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden relative">
              <img id="est-foto-preview-1"
                   src="${f1.displayUrl.replace(/"/g, '&quot;')}"
                   referrerpolicy="no-referrer"
                   alt="Vista previa Foto 1"
                   class="${f1.displayUrl ? '' : 'hidden'} w-full h-full object-contain bg-white"
                   onerror="this.classList.add('hidden'); document.getElementById('est-foto-empty-1').classList.remove('hidden');">
              <div id="est-foto-empty-1" class="${f1.displayUrl ? 'hidden' : ''} text-center p-2 text-slate-400 text-[11px]">
                <i class="fa-regular fa-image text-lg block mb-1"></i>
                <span>Sin vista previa de Foto 1</span>
              </div>
            </div>
          </div>

          <!-- FOTOGRAFÍA 2 -->
          <div class="p-3 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-800 flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold inline-flex items-center justify-center">2</span>
                <span>Fotografía 2 (Opcional)</span>
              </span>
              ${!isLocked ? `
                <button type="button" onclick="clearEstimacionConceptPhotoSlot(2)" class="text-[10.5px] text-rose-600 hover:underline cursor-pointer">
                  Limpiar
                </button>
              ` : ''}
            </div>

            <div class="space-y-1">
              <label class="text-[10.5px] font-semibold text-slate-600 block">Enlace URL (Google Drive / OneDrive):</label>
              <input type="url" id="est-foto-url-2"
                     ${isLocked ? 'disabled readonly' : ''}
                     value="${f2.url.replace(/"/g, '&quot;')}"
                     oninput="onEstimacionPhotoUrlPreviewInput(2)"
                     placeholder="https://drive.google.com/file/d/.../view"
                     class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-600 disabled:bg-slate-100">
            </div>

            <div class="space-y-1">
              <label class="text-[10.5px] font-semibold text-slate-600 block">Pie de foto / Descripción:</label>
              <input type="text" id="est-foto-nota-2"
                     ${isLocked ? 'disabled readonly' : ''}
                     value="${f2.nota.replace(/"/g, '&quot;')}"
                     placeholder="Ej. Colado terminado y nivelado..."
                     class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-600 disabled:bg-slate-100">
            </div>

            <div class="h-36 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden relative">
              <img id="est-foto-preview-2"
                   src="${f2.displayUrl.replace(/"/g, '&quot;')}"
                   referrerpolicy="no-referrer"
                   alt="Vista previa Foto 2"
                   class="${f2.displayUrl ? '' : 'hidden'} w-full h-full object-contain bg-white"
                   onerror="this.classList.add('hidden'); document.getElementById('est-foto-empty-2').classList.remove('hidden');">
              <div id="est-foto-empty-2" class="${f2.displayUrl ? 'hidden' : ''} text-center p-2 text-slate-400 text-[11px]">
                <i class="fa-regular fa-image text-lg block mb-1"></i>
                <span>Sin vista previa de Foto 2</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Pie del Modal -->
      <div class="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
        <span class="text-[11px] text-slate-500">
          ${isLocked ? '🔒 Estimación bloqueada (Modo solo consulta)' : 'Al imprimir la estimación, este concepto tendrá su hoja fotográfica en el Resumen.'}
        </span>
        <div class="flex items-center gap-2">
          <button type="button" onclick="closeEstimacionConceptPhotosModal()"
                  class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition">
            Cerrar
          </button>
          ${!isLocked ? `
            <button type="button" onclick="saveEstimacionConceptPhotosModal()"
                    class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm cursor-pointer transition flex items-center gap-1.5">
              <i class="fa-solid fa-floppy-disk"></i> Guardar Enlaces de Fotos
            </button>
          ` : ''}
        </div>
      </div>

    </div>
  `;
}

export function closeEstimacionConceptPhotosModal() {
  const modalEl = document.getElementById('estimacion-fotos-modal');
  if (modalEl) modalEl.classList.add('hidden');
  activePhotoModalConceptId = null;
}

export function onEstimacionPhotoUrlPreviewInput(slotIdx) {
  const urlEl = document.getElementById(`est-foto-url-${slotIdx}`);
  const imgEl = document.getElementById(`est-foto-preview-${slotIdx}`);
  const emptyEl = document.getElementById(`est-foto-empty-${slotIdx}`);
  if (!urlEl || !imgEl || !emptyEl) return;

  const normalized = normalizeCloudImageUrl(urlEl.value);
  if (normalized) {
    imgEl.src = normalized;
    imgEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
  } else {
    imgEl.src = '';
    imgEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }
}

export function clearEstimacionConceptPhotoSlot(slotIdx) {
  const urlEl = document.getElementById(`est-foto-url-${slotIdx}`);
  const notaEl = document.getElementById(`est-foto-nota-${slotIdx}`);
  if (urlEl) urlEl.value = '';
  if (notaEl) notaEl.value = '';
  onEstimacionPhotoUrlPreviewInput(slotIdx);
}

export function saveEstimacionConceptPhotosModal() {
  if (!activePhotoModalConceptId) return;
  if (!guardTabUnlocked('estimaciones')) return;

  const url1 = document.getElementById('est-foto-url-1')?.value || '';
  const nota1 = document.getElementById('est-foto-nota-1')?.value || '';
  const url2 = document.getElementById('est-foto-url-2')?.value || '';
  const nota2 = document.getElementById('est-foto-nota-2')?.value || '';

  const list = [];
  if (url1.trim()) list.push({ url: url1.trim(), nota: nota1.trim() });
  if (url2.trim()) list.push({ url: url2.trim(), nota: nota2.trim() });

  setConceptoFotosEstimacion(activePhotoModalConceptId, list);
  closeEstimacionConceptPhotosModal();
  renderEstimacionesView();
  showToast(list.length > 0 ? `${list.length} foto(s) vinculada(s) al concepto para impresión` : 'Enlaces de fotos eliminados del concepto', 'success');
}

// =========================================================================
// MÓDULO DE PAGOS A ESPECIALISTAS Y SUBCONTRATOS (VISTA 2)
// =========================================================================
let activePaymentModalNodeId = null;
let activePaymentModalPaymentId = null;

export function onSearchSpecialists(term) {
  specialistsSearchTerm = term;
  renderEstimacionesView();
  if (typeof document !== 'undefined') {
    const el = document.getElementById('specialists-search-input');
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }
}

export function setSpecialistsStatusFilter(filter) {
  specialistsStatusFilter = filter;
  renderEstimacionesView();
}

export function toggleSpecialistHistory(nodeId) {
  const idStr = String(nodeId);
  if (expandedSpecialistHistories.has(idStr)) {
    expandedSpecialistHistories.delete(idStr);
  } else {
    expandedSpecialistHistories.add(idStr);
  }
  renderEstimacionesView();
}

export function promptEditSpecialistProveedor(nodeId, currentName = '') {
  if (!canCurrentUserEditProject() || !guardTabUnlocked('estimaciones')) return;
  if (!currentName) {
    const contracts = getSpecialistsContractsData();
    const c = contracts.find(x => String(x.nodeId) === String(nodeId));
    if (c) currentName = c.proveedor || c.proveedorName || '';
  }
  const newName = prompt('Nombre del Especialista o Empresa Proveedora:', currentName || '');
  if (newName === null) return;
  updateSpecialistProveedor(nodeId, newName.trim());
  renderEstimacionesView();
  showToast('Proveedor asignado correctamente', 'success');
}

export function openRegistrarPagoModal(nodeId = null, paymentId = null) {
  if (!canCurrentUserEditProject() || !guardTabUnlocked('estimaciones')) return;
  const allContracts = getSpecialistsContractsData();
  if (allContracts.length === 0) {
    showToast('Aún no hay conceptos o especialidades con cotizaciones registradas en Alcances', 'warning');
    return;
  }

  activePaymentModalNodeId = nodeId ? String(nodeId) : String(allContracts[0].nodeId);
  activePaymentModalPaymentId = paymentId ? String(paymentId) : null;

  let selectedContract = allContracts.find(c => String(c.nodeId) === String(activePaymentModalNodeId)) || allContracts[0];
  let existingPayment = null;
  if (paymentId && selectedContract) {
    existingPayment = (selectedContract.pagos || []).find(p => String(p.id) === String(paymentId));
  }

  const currencySymbol = state.settings?.currencySymbol || '$';
  const isEditing = Boolean(existingPayment);

  let modalEl = document.getElementById('specialist-payment-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'specialist-payment-modal';
    modalEl.className = 'no-print fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3';
    document.body.appendChild(modalEl);
  }
  modalEl.onclick = (e) => {
    if (e.target === modalEl) closeRegistrarPagoModal();
  };
  modalEl.classList.remove('hidden');

  const defaultDate = existingPayment?.fecha || new Date().toISOString().slice(0, 10);
  const defaultMonto = existingPayment ? existingPayment.monto : (selectedContract.saldoPendiente > 0 ? selectedContract.saldoPendiente : '');
  const defaultConcepto = existingPayment?.concepto || '';
  const defaultMetodo = existingPayment?.metodo || 'SPEI';
  const defaultReferencia = existingPayment?.referencia || '';

  modalEl.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150 font-sans">
      
      <!-- Encabezado del Modal -->
      <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white px-5 py-3.5 flex items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="w-9 h-9 rounded-xl bg-indigo-500/25 border border-indigo-400/40 text-emerald-400 flex items-center justify-center shrink-0">
            <i class="fa-solid ${isEditing ? 'fa-pen-to-square' : 'fa-hand-holding-dollar'} text-base"></i>
          </span>
          <div class="min-w-0">
            <h3 class="text-sm font-bold text-white truncate">
              ${isEditing ? 'Editar Pago a Especialista' : 'Registrar Pago a Especialista / Proveedor'}
            </h3>
            <p class="text-[11px] text-indigo-200 truncate">
              Control de Cuentas por Pagar • Actualización de flujo en tiempo real
            </p>
          </div>
        </div>
        <button type="button" onclick="closeRegistrarPagoModal()" class="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <!-- Cuerpo del Modal -->
      <div class="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
        
        <!-- Selector de Especialista / Servicio -->
        <div class="space-y-1">
          <label class="text-[11px] font-bold text-slate-700 block uppercase tracking-wider">
            Especialidad / Servicio Contratado:
          </label>
          <select id="spec-modal-select-node"
                  onchange="onSpecialistModalNodeChanged(this.value)"
                  class="w-full bg-slate-50 border border-slate-300 hover:border-slate-400 focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition cursor-pointer">
            ${allContracts.map(c => `
              <option value="${c.nodeId}" ${String(c.nodeId) === String(selectedContract.nodeId) ? 'selected' : ''}>
                ${c.clave} — ${c.descripcion} (${c.proveedor || 'Sin proveedor'}) [Saldo: ${formatCurrency(c.saldoPendiente, currencySymbol)}]
              </option>
            `).join('')}
          </select>
        </div>

        <!-- Tarjeta de Resumen del Contrato Seleccionado -->
        <div id="spec-modal-contract-card" class="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <div class="text-[10px] uppercase font-bold text-indigo-900/70">Proveedor Asignado:</div>
            <div class="font-extrabold text-slate-900 text-xs">${selectedContract.proveedor || 'No asignado'}</div>
          </div>
          <div class="flex items-center gap-4 text-right">
            <div>
              <div class="text-[10px] uppercase font-bold text-slate-500">Contratado:</div>
              <div class="font-bold text-slate-800 font-mono">${formatCurrency(selectedContract.totalContratado, currencySymbol)}</div>
            </div>
            <div>
              <div class="text-[10px] uppercase font-bold text-emerald-700">Pagado:</div>
              <div class="font-bold text-emerald-700 font-mono">${formatCurrency(selectedContract.totalPagado, currencySymbol)} (${selectedContract.pctPagado.toFixed(1)}%)</div>
            </div>
            <div>
              <div class="text-[10px] uppercase font-bold text-amber-700">Saldo:</div>
              <div class="font-black text-amber-800 font-mono">${formatCurrency(selectedContract.saldoPendiente, currencySymbol)}</div>
            </div>
          </div>
        </div>

        <!-- Monto a Pagar y Accesos Rápidos de Porcentaje -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Monto a Pagar ($):
            </label>
            <span class="text-[10.5px] text-slate-500">Cálculo rápido por % contratado:</span>
          </div>

          <!-- Botones rápidos de cálculo de porcentaje -->
          <div class="flex flex-wrap items-center gap-1.5 pb-1">
            <button type="button" onclick="setPaymentModalAmountPct(10)" class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 font-bold text-[10.5px] transition cursor-pointer">
              10%
            </button>
            <button type="button" onclick="setPaymentModalAmountPct(20)" class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 font-bold text-[10.5px] transition cursor-pointer">
              20%
            </button>
            <button type="button" onclick="setPaymentModalAmountPct(30)" class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold text-[10.5px] transition cursor-pointer" title="Anticipo inicial del 30%">
              30% Anticipo
            </button>
            <button type="button" onclick="setPaymentModalAmountPct(50)" class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 font-bold text-[10.5px] transition cursor-pointer">
              50%
            </button>
            <button type="button" id="spec-modal-btn-saldo" onclick="setPaymentModalAmountDirect(${selectedContract.saldoPendiente})" class="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-black text-[10.5px] transition cursor-pointer" title="Liquidar saldo restante pendiente">
              100% Saldo (${formatCurrency(selectedContract.saldoPendiente, currencySymbol)})
            </button>
          </div>

          <!-- Input de Monto -->
          <div class="relative">
            <span class="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">${currencySymbol}</span>
            <input type="number"
                   id="spec-modal-monto"
                   step="0.01"
                   min="0.01"
                   value="${defaultMonto}"
                   placeholder="0.00"
                   class="w-full pl-8 pr-3 py-2 bg-white border-2 border-indigo-200 hover:border-indigo-400 focus:border-indigo-600 rounded-xl font-mono text-base font-black text-slate-900 outline-none transition shadow-2xs">
          </div>
        </div>

        <!-- Concepto / Referencia del Pago -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Concepto / Referencia:
            </label>
            <span class="text-[10.5px] text-slate-400">Texto libre</span>
          </div>

          <!-- Chips de Sugerencia Rápida -->
          <div class="flex flex-wrap items-center gap-1.5">
            <button type="button" onclick="setPaymentModalConcept('Anticipo inicial (30%)')" class="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] cursor-pointer transition">
              + Anticipo inicial (30%)
            </button>
            <button type="button" onclick="setPaymentModalConcept('Avance parcial planos de cimentación')" class="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] cursor-pointer transition">
              + Planos de cimentación
            </button>
            <button type="button" onclick="setPaymentModalConcept('Entrega de memorias y cálculo estructural')" class="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] cursor-pointer transition">
              + Memorias y cálculo
            </button>
            <button type="button" onclick="setPaymentModalConcept('Liquidación y entrega final de proyecto')" class="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] cursor-pointer transition">
              + Liquidación final
            </button>
          </div>

          <input type="text"
                 id="spec-modal-concepto"
                 value="${defaultConcepto.replace(/"/g, '&quot;')}"
                 placeholder="Ej. Anticipo inicial del 30% según contrato..."
                 class="w-full border border-slate-300 hover:border-slate-400 focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition">
        </div>

        <!-- Fila de Fecha y Método de Pago -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          
          <!-- Fecha de Pago -->
          <div class="space-y-1">
            <label class="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Fecha de Pago:
            </label>
            <div class="relative">
              <input type="date"
                     id="spec-modal-fecha"
                     value="${defaultDate}"
                     class="w-full border border-slate-300 hover:border-slate-400 focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none transition cursor-pointer">
            </div>
          </div>

          <!-- Método de Pago -->
          <div class="space-y-1">
            <label class="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Método de Pago:
            </label>
            <select id="spec-modal-metodo"
                    class="w-full border border-slate-300 hover:border-slate-400 focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none transition cursor-pointer">
              <option value="SPEI" ${defaultMetodo === 'SPEI' ? 'selected' : ''}>Transferencia SPEI</option>
              <option value="Cheque" ${defaultMetodo === 'Cheque' ? 'selected' : ''}>Cheque Nominativo</option>
              <option value="Efectivo" ${defaultMetodo === 'Efectivo' ? 'selected' : ''}>Efectivo</option>
              <option value="Tarjeta" ${defaultMetodo === 'Tarjeta' ? 'selected' : ''}>Tarjeta Bancaria</option>
              <option value="Otro" ${defaultMetodo === 'Otro' ? 'selected' : ''}>Otro</option>
            </select>
          </div>

        </div>

        <!-- Comprobante / Factura / Folio SAT -->
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Factura / UUID / Folio SPEI (Opcional):
            </label>
            <span class="text-[10.5px] text-slate-400">Comprobante</span>
          </div>
          <input type="text"
                 id="spec-modal-referencia"
                 value="${defaultReferencia.replace(/"/g, '&quot;')}"
                 placeholder="Ej. Factura F-8492 o UUID SAT / Rastreo SPEI..."
                 class="w-full border border-slate-300 hover:border-slate-400 focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 outline-none transition">
        </div>

      </div>

      <!-- Pie del Modal -->
      <div class="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <span class="text-[11px] text-slate-500">
          <i class="fa-solid fa-lock-open text-emerald-600 mr-1"></i> Control 100% libre, sin restricciones
        </span>
        <div class="flex items-center gap-2">
          <button type="button" onclick="closeRegistrarPagoModal()"
                  class="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer transition">
            Cancelar
          </button>
          <button type="button" onclick="handleSaveSpecialistPayment()"
                  class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm cursor-pointer transition flex items-center gap-1.5 active:scale-95">
            <i class="fa-solid fa-check"></i>
            <span>${isEditing ? 'Guardar Cambios' : 'Registrar Pago'}</span>
          </button>
        </div>
      </div>

    </div>
  `;
}

export function closeRegistrarPagoModal() {
  const modalEl = document.getElementById('specialist-payment-modal');
  if (modalEl) modalEl.classList.add('hidden');
  activePaymentModalNodeId = null;
  activePaymentModalPaymentId = null;
}

export function onSpecialistModalNodeChanged(newNodeId) {
  activePaymentModalNodeId = newNodeId;
  const allContracts = getSpecialistsContractsData();
  const contract = allContracts.find(c => String(c.nodeId) === String(newNodeId));
  if (!contract) return;
  const currencySymbol = state.settings?.currencySymbol || '$';

  const card = document.getElementById('spec-modal-contract-card');
  if (card) {
    card.innerHTML = `
      <div>
        <div class="text-[10px] uppercase font-bold text-indigo-900/70">Proveedor Asignado:</div>
        <div class="font-extrabold text-slate-900 text-xs">${contract.proveedor || 'No asignado'}</div>
      </div>
      <div class="flex items-center gap-4 text-right">
        <div>
          <div class="text-[10px] uppercase font-bold text-slate-500">Contratado:</div>
          <div class="font-bold text-slate-800 font-mono">${formatCurrency(contract.totalContratado, currencySymbol)}</div>
        </div>
        <div>
          <div class="text-[10px] uppercase font-bold text-emerald-700">Pagado:</div>
          <div class="font-bold text-emerald-700 font-mono">${formatCurrency(contract.totalPagado, currencySymbol)} (${contract.pctPagado.toFixed(1)}%)</div>
        </div>
        <div>
          <div class="text-[10px] uppercase font-bold text-amber-700">Saldo:</div>
          <div class="font-black text-amber-800 font-mono">${formatCurrency(contract.saldoPendiente, currencySymbol)}</div>
        </div>
      </div>
    `;
  }

  const saldoBtn = document.getElementById('spec-modal-btn-saldo');
  if (saldoBtn) {
    const nextSaldo = Math.max(0, Number(contract.saldoPendiente) || 0);
    saldoBtn.setAttribute('onclick', `setPaymentModalAmountDirect(${nextSaldo})`);
    saldoBtn.textContent = `100% Saldo (${formatCurrency(nextSaldo, currencySymbol)})`;
  }
}

export function setPaymentModalAmountPct(pct) {
  const allContracts = getSpecialistsContractsData();
  const contract = allContracts.find(c => String(c.nodeId) === String(activePaymentModalNodeId));
  if (!contract) return;
  const total = Number(contract.totalContratado) || 0;
  const calc = Math.round((total * (pct / 100)) * 100) / 100;
  const el = document.getElementById('spec-modal-monto');
  if (el) el.value = calc > 0 ? calc : '';
}

export function setPaymentModalAmountDirect(amount) {
  const el = document.getElementById('spec-modal-monto');
  const num = Number(amount) || 0;
  if (el) el.value = num > 0 ? (Math.round(num * 100) / 100) : '';
}

export function setPaymentModalConcept(text) {
  const el = document.getElementById('spec-modal-concepto');
  if (el) el.value = text;
}

export function handleSaveSpecialistPayment() {
  if (!guardTabUnlocked('estimaciones')) return;
  const selectNode = document.getElementById('spec-modal-select-node');
  const nodeId = selectNode ? selectNode.value : activePaymentModalNodeId;
  if (!nodeId) {
    showToast('Selecciona un especialista o servicio', 'warning');
    return;
  }

  const montoVal = parseFloat(document.getElementById('spec-modal-monto')?.value || 0);
  if (isNaN(montoVal) || montoVal <= 0) {
    showToast('Ingresa un monto válido mayor a cero', 'warning');
    return;
  }

  const conceptoVal = document.getElementById('spec-modal-concepto')?.value || 'Pago a especialista';
  const fechaVal = document.getElementById('spec-modal-fecha')?.value || new Date().toISOString().slice(0, 10);
  const metodoVal = document.getElementById('spec-modal-metodo')?.value || 'SPEI';
  const referenciaVal = document.getElementById('spec-modal-referencia')?.value || '';

  const paymentData = {
    monto: montoVal,
    concepto: conceptoVal.trim(),
    fecha: fechaVal,
    metodo: metodoVal,
    referencia: referenciaVal.trim()
  };

  if (activePaymentModalPaymentId) {
    updateSpecialistPayment(nodeId, activePaymentModalPaymentId, paymentData);
    showToast('Pago actualizado correctamente', 'success');
  } else {
    addSpecialistPayment(nodeId, paymentData);
    showToast('Pago registrado exitosamente', 'success');
  }

  expandedSpecialistHistories.add(String(nodeId));
  closeRegistrarPagoModal();
  renderEstimacionesView();
}

export function confirmDeleteSpecialistPayment(nodeId, paymentId, montoFormatted = '') {
  if (!guardTabUnlocked('estimaciones')) return;
  const msg = montoFormatted
    ? `¿Eliminar el pago de ${montoFormatted}? Esta acción actualizará los saldos en tiempo real.`
    : '¿Eliminar este pago? Esta acción actualizará los saldos en tiempo real.';
  if (!confirm(msg)) {
    return;
  }
  deleteSpecialistPayment(nodeId, paymentId);
  renderEstimacionesView();
  showToast('Pago eliminado correctamente', 'info');
}

export function exportPagosEspecialistasExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('El módulo de exportación a Excel no está disponible', 'error');
    return;
  }
  const contracts = getSpecialistsContractsData();
  const currencySymbol = state.settings?.currencySymbol || '$';
  const cashflow = getCashFlowSummary();

  const wsData = [
    [state.settings?.companyName || 'DESARROLLADORA'],
    ['CONTROL DE PAGOS A ESPECIALISTAS Y SUBCONTRATOS'],
    [`PROYECTO: ${state.settings?.projectName || 'Proyecto'}`, '', '', `FECHA: ${new Date().toLocaleDateString('es-MX')}`],
    [],
    ['RESUMEN FINANCIERO DE CUENTAS POR PAGAR'],
    ['Total Contratado Especialistas:', cashflow.totalContratadoEspecialistas],
    ['Total Pagado Acumulado:', cashflow.totalPagadoEspecialistas, `${cashflow.pctPagadoEspecialistas.toFixed(1)}%`],
    ['Saldo Pendiente Total:', cashflow.totalSaldoEspecialistas],
    ['Total Cobrado al Cliente:', cashflow.totalCobradoCliente],
    ['Margen / Saldo Disponible:', cashflow.saldoEnBanco],
    [],
    [
      'Código',
      'Especialidad / Servicio',
      'Proveedor Asignado',
      'Total Contratado ($)',
      'Total Pagado ($)',
      '% Pagado',
      'Saldo Pendiente ($)',
      'Último Pago Fecha',
      'Último Pago Monto ($)',
      'No. Pagos'
    ]
  ];

  contracts.forEach(c => {
    wsData.push([
      c.clave || '',
      c.descripcion || '',
      c.proveedor || '',
      c.totalContratado || 0,
      c.totalPagado || 0,
      (c.pctPagado || 0) / 100,
      c.saldoPendiente || 0,
      c.ultimoPago?.fecha || '',
      c.ultimoPago?.monto || 0,
      c.pagos?.length || 0
    ]);
  });

  // Sección 2: Historial Detallado de Pagos
  wsData.push([]);
  wsData.push(['HISTORIAL DETALLADO DE PAGOS REALIZADOS A ESPECIALISTAS']);
  wsData.push([
    'Código',
    'Especialidad',
    'Proveedor',
    'Fecha de Pago',
    'Concepto / Referencia',
    'Método',
    'Factura / UUID / Folio',
    'Monto Pagado ($)'
  ]);

  contracts.forEach(c => {
    (c.pagos || []).forEach(p => {
      wsData.push([
        c.clave || '',
        c.descripcion || '',
        c.proveedor || '',
        p.fecha || '',
        p.concepto || '',
        p.metodo || '',
        p.referencia || '',
        p.monto || 0
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pagos_Especialistas');
  const fileName = `Control_Pagos_Especialistas_${(state.settings?.projectName || 'Proyecto').replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast(`Excel de especialistas exportado: ${fileName}`, 'success');
}

// Listener para adaptar el ancho automáticamente si el usuario redimensiona la ventana del navegador
if (typeof window !== 'undefined') {
  let estResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(estResizeTimer);
    estResizeTimer = setTimeout(() => {
      const container = document.getElementById('estimaciones-table-container');
      if (container && !container.closest('.hidden')) {
        applyConceptoColumnWidth(estimacionesConceptoColWidth);
      }
    }, 100);
  });
}

// Exponer funciones globales clave en window para compatibilidad directa con eventos HTML inline
if (typeof window !== 'undefined') {
  Object.assign(window, {
    // Estimaciones - Cobranza al Cliente
    renderEstimacionesView,
    onSwitchActiveEstimacion,
    promptCreateNewEstimacion,
    confirmDeleteCurrentEstimacion,
    onChangeEstimacionDate,
    onChangeEstimacionMeta,
    onEstimacionAvanceInput,
    onEstimacionAvanceBlur,
    formatAvancePctTwoDecimals,
    exportEstimacionesExcel,
    onEstimacionCantEjeInput,
    onEstimacionCantEjeBlur,
    formatCantEjeTwoDecimals,
    toggleActiveEstimacionLock,
    onEstimacionesAnticipoInput,
    onEstimacionesIvaInput,
    onSearchEstimaciones,
    toggleEstimacionesGroup,
    collapseAllEstimacionesPartidas,
    expandAllEstimacionesPartidas,
    printEstimacionActual,
    adjustConceptoColumnWidth,
    resetConceptoColumnWidth,
    getMaxConceptoWidth,
    scrollEstimacionesTableStep,
    selectEstimacionRow,
    openEstimacionConceptPhotosModal,
    closeEstimacionConceptPhotosModal,
    onEstimacionPhotoUrlPreviewInput,
    clearEstimacionConceptPhotoSlot,
    saveEstimacionConceptPhotosModal,

    // Estimaciones - Sub-vistas y Pagos a Especialistas
    switchEstimacionesSubView,
    onSearchSpecialists,
    setSpecialistsStatusFilter,
    toggleSpecialistHistory,
    promptEditSpecialistProveedor,
    openRegistrarPagoModal,
    closeRegistrarPagoModal,
    onSpecialistModalNodeChanged,
    setPaymentModalAmountPct,
    setPaymentModalAmountDirect,
    setPaymentModalConcept,
    handleSaveSpecialistPayment,
    confirmDeleteSpecialistPayment,
    exportPagosEspecialistasExcel
  });
}
