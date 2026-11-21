import { printCalendarioObraFormat } from '../io/printService.js?v=20261121_cf45';
import { renderTabAssignedAvatars } from '../portal/portalController.js?v=20261121_cf45';
// js/modules/calendario/calendarioView.js
// Renderizador y controlador de la pestaña CALENDARIO DE OBRA
// Diseño ejecutivo de alta fidelidad, interactivo y sincronizado 100% con Catálogo Base

import { state } from '../../state/store.js?v=20261121_cf45';
import { formatCurrency, formatNumber } from '../../core/formatters.js?v=20261121_cf45';
import { showToast } from '../../ui/notifications.js?v=20261121_cf45';
import { isNightMode } from '../../ui/themeController.js?v=20261121_cf45';
import { isTabLocked, guardTabUnlocked, applyTabLocksToDOM } from '../../ui/tabLockController.js?v=20261121_cf45';
import { getActiveProjectId } from '../../config/constants.js?v=20261121_cf45';
import { canCurrentUserEditProject } from '../portal/projectService.js?v=20261121_cf45';
import { renderPartidaNivel1ChatButton, renderProjectChatDock } from '../chat/projectChat.js?v=20261121_cf45';
import { openAutoProgramModal } from './calendarioAutoProgramView.js?v=20261121_cf45';

function escapeCalHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAdvancedCalendarioAllowed() {
  return true;
}

import {
  extractScheduleItems,
  ensureInitialDates,
  generateTimePeriods,
  calculateScheduleDistribution,
  getScheduleSettings,
  saveScheduleSettings,
  getProjectCreationDate,
  updateConceptDatesInModel,
  updateConceptPeriodInModel,
  autoDistributeAllSchedule,
  diffDays,
  addDays,
  formatDate,
  parseDate,
  generateGanttDays,
  generateGanttTimeScale,
  getGanttTodayDate,
  setGanttTodayDate,
  resetGanttTodayDate,
  isItemVisible,
  toggleCalendarioNodeExpand,
  expandAllCalendarioNodes,
  collapseAllCalendarioNodes,
  getWorkdaysSettings,
  saveWorkdaysSettings,
  getDateWorkdayInfo,
  calculateWorkdaysSummary,
  getMexicanHolidaysForYear,
  wouldCreateScheduleCycle,
  setConceptPredecessorsInModel,
  toggleConceptPredecessorInModel,
  clearAllScheduleDependenciesInModel,
  applyScheduleProposalToModel,
  shiftProjectScheduleStart,
  normalizeScheduleLinks,
  formatScheduleLinkTag,
  computeLinkMinStartDate,
  saveScheduleUndoSnapshot,
  hasScheduleUndoSnapshot,
  hasScheduleRedoSnapshot,
  undoLastScheduleChange,
  redoLastScheduleChange
} from './calendarioModel.js?v=20261121_cf45';
import {
  WORK_TYPE_PROFILES,
  detectProjectWorkType,
  generateLocalConstructiveProposal,
  generateGeminiConstructiveProposal
} from './calendarioAiService.js?v=20261121_cf45';
import { exportScheduleToExcel } from './calendarioExporter.js?v=20261121_cf45';

let currentScheduleData = null;
let calendarioLinkClickMode = false;
let pendingLinkPredecessorId = null;
let currentAiProposalPreview = null;
let currentDepModalConceptId = null;
let calendarioInitTimer = null;
let isPremiereResizeListenerAttached = false;
let selectedCalendarioRowId = null;
let lastRenderedCalendarioProjectId = null;

// Estado UI de popover calendario, modal predecesoras y lupa de barras
let openDatePickerConceptId = null;
let datePickerViewYear = null;
let datePickerViewMonth = null;
let lastDatePickerAnchorRect = null;
let isCalendarioGlobalListenersAttached = false;
let isDraggingGanttBar = false;
let barDraggedRecently = false;
let depModalDraftLinks = [];
let depModalFilterPartida = 'all';
let depModalSearch = '';

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Seleccionar y pintar fila en Calendario de Obra (Vista Gantt expande detalle en sitio; Financiero/Curva S resaltan fila)
export function selectCalendarioRow(rowId, event = null) {
  if (event && event.target && event.target.closest) {
    if (event.target.closest('button, input, select, a, [data-pick-date], [data-open-predec], .gantt-bar-concept')) {
      return;
    }
  }
  if (barDraggedRecently) return;

  const nextId = String(rowId);
  const cfg = getScheduleSettings();
  const isGanttActive = (cfg.viewMode || 'gantt') === 'gantt';

  if (isGanttActive && event) {
    closeCalendarioDatePickerPopover();
    selectedCalendarioRowId = (String(selectedCalendarioRowId) === nextId) ? null : nextId;
    renderCalendarioObra();
    return;
  }

  selectedCalendarioRowId = nextId;
  if (typeof document === 'undefined') return;

  // Vista Gantt (panel izquierdo y derecho sincronizados)
  document.querySelectorAll('#view-calendario [data-gantt-left-row]').forEach((el) => {
    if (String(el.getAttribute('data-gantt-left-row')) === selectedCalendarioRowId) {
      el.classList.add('selected-row');
    } else {
      el.classList.remove('selected-row');
    }
  });
  document.querySelectorAll('#view-calendario [data-gantt-right-row]').forEach((el) => {
    if (String(el.getAttribute('data-gantt-right-row')) === selectedCalendarioRowId) {
      el.classList.add('selected-row');
    } else {
      el.classList.remove('selected-row');
    }
  });

  // Vista Programa Financiero
  document.querySelectorAll('#view-calendario tr[data-fin-row]').forEach((el) => {
    if (String(el.getAttribute('data-fin-row')) === selectedCalendarioRowId) {
      el.classList.add('selected-row');
    } else {
      el.classList.remove('selected-row');
    }
  });

  // Vista Curva S (Tabla Resumen Ejecutivo)
  document.querySelectorAll('#view-calendario tr[data-curva-row]').forEach((el) => {
    if (String(el.getAttribute('data-curva-row')) === selectedCalendarioRowId) {
      el.classList.add('selected-row');
    } else {
      el.classList.remove('selected-row');
    }
  });

  // Actualizar indicador de fila seleccionada en el pie/status si existe
  const statusSpan = document.getElementById('selected-row-status');
  if (statusSpan && currentScheduleData && currentScheduleData.items) {
    const foundItem = currentScheduleData.items.find(i => String(i.id) === selectedCalendarioRowId);
    if (foundItem) {
      statusSpan.textContent = `Fila seleccionada: ${foundItem.clave || 'PART'} - ${foundItem.descripcion}`;
    }
  }
}
if (typeof window !== 'undefined') {
  window.selectCalendarioRow = selectCalendarioRow;
}

// ==========================================
// RENDERIZADO PRINCIPAL DEL CALENDARIO
// ==========================================
export function renderCalendarioObra() {
  const container = document.getElementById('view-calendario');
  if (!container) return;

  const activeProjId = getActiveProjectId() || 'default';
  const sameProject = (lastRenderedCalendarioProjectId === activeProjId);
  if (!sameProject) {
    lastRenderedCalendarioProjectId = activeProjId;
    selectedCalendarioRowId = null;
    closeCalendarioDatePickerPopover();
  }

  const prevLeftScroll = document.getElementById('gantt-left-scroll') || document.getElementById('gantt-left-panel');
  const prevRightPanel = document.getElementById('gantt-timeline-panel');
  const preservedLeftTop = sameProject && prevLeftScroll ? prevLeftScroll.scrollTop : 0;
  const preservedRightTop = sameProject && prevRightPanel ? prevRightPanel.scrollTop : 0;
  const preservedRightLeft = sameProject && prevRightPanel ? prevRightPanel.scrollLeft : 0;

  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems(state.treeData);

  // El inicio de obra por defecto es el día de creación del proyecto
  const creationDate = getProjectCreationDate();
  const concepts = rawItems.filter(it => it.tipo === 'concepto');
  let currentEarliestDateStr = null;
  concepts.forEach(c => {
    if (c.node?.schedule?.startDate) {
      if (!currentEarliestDateStr || c.node.schedule.startDate < currentEarliestDateStr) {
        currentEarliestDateStr = c.node.schedule.startDate;
      }
    }
  });

  // Si los conceptos fueron previamente fijados con la fecha legacy '2026-05-01' y no por elección explícita del usuario
  if (!cfg.userCustomStartDate && currentEarliestDateStr === '2026-05-01' && creationDate !== '2026-05-01') {
    shiftProjectScheduleStart(creationDate);
    rawItems.length = 0;
    rawItems.push(...extractScheduleItems(state.treeData));
  }

  // Asegurar fechas iniciales
  ensureInitialDates(rawItems, cfg.startDate);

  // Generar períodos según escala seleccionada (días, semanas, meses)
  const periods = generateTimePeriods(rawItems, cfg.scale, cfg.startDate);

  // Calcular distribución y totales
  const scheduleData = calculateScheduleDistribution(rawItems, periods);
  currentScheduleData = scheduleData;

  // Filtrar partidas si hay un filtro de dropdown activo
  let filteredItems = scheduleData.items;
  if (cfg.selectedPartida && cfg.selectedPartida !== 'all') {
    filteredItems = filteredItems.filter(item => {
      if (item.level === 1) return item.descripcion === cfg.selectedPartida;
      return item.parentPartidaName === cfg.selectedPartida;
    });
  }

  // Filtrar según el estado agrupado/desagrupado (visibleItems)
  const visibleItems = filteredItems.filter(item => isItemVisible(item, scheduleData.items));

  // Métricas generales
  let minDate = null;
  let maxDate = null;
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });

  if (!minDate) minDate = parseDate(cfg.startDate || creationDate);
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const totalDias = Math.max(1, diffDays(minDate, maxDate) + 1);
  const workdaysSummary = calculateWorkdaysSummary(minDate, maxDate);
  const currencySymbol = state.settings.currencySymbol || '$';
  const dayWidthPx = cfg.dayWidth || 34;

  // Partidas principales de nivel 1 para el dropdown de filtro
  const partidasList = scheduleData.items.filter(it => it.level === 1 && it.isParent);
  const allConcepts = scheduleData.items.filter(it => it.tipo === 'concepto');
  const criticalConceptsCount = allConcepts.filter(it => it.isCritical).length;
  const showCpm = cfg.showCriticalPath !== false;
  const canUndo = hasScheduleUndoSnapshot();
  const canRedo = hasScheduleRedoSnapshot();
  const pendingPredConcept = pendingLinkPredecessorId
    ? allConcepts.find(it => String(it.id) === String(pendingLinkPredecessorId))
    : null;
  const isCalLocked = isTabLocked('calendario');
  const rowViewMode = cfg.rowViewMode || (cfg.justifyConcepts ? 'justified' : 'normal');
  const isJustifyConcepts = (rowViewMode === 'justified');
  const allParentGroups = scheduleData.items.filter(it => it.isParent);
  const allGroupsCollapsed = allParentGroups.length > 0 && allParentGroups.every(p => p.expanded === false);
  const rowModeBtnClass = rowViewMode === 'justified'
    ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-700 font-bold'
    : (rowViewMode === 'compact'
      ? 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-800 font-bold'
      : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium');
  const rowModeBtnTitle = rowViewMode === 'justified'
    ? 'Texto completo (Justificado) activo — Clic para Filas compactas'
    : (rowViewMode === 'compact'
      ? 'Filas compactas activo (1 línea) — Clic para volver a Vista normal'
      : 'Vista de filas: Normal — Clic para Texto completo / Filas compactas');
  const rowModeBtnIconHtml = rowViewMode === 'compact'
    ? `<svg viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2v3M3 3.5L4.5 5 6 3.5M4.5 14v-3M3 12.5L4.5 11 6 12.5M8.5 5.5h5M8.5 8h5M8.5 10.5h5"/></svg>`
    : `<i class="fa-solid fa-align-justify ${isJustifyConcepts ? 'text-white' : 'text-slate-600'} text-xs"></i>`;
  applyTabLocksToDOM();

  container.innerHTML = `
    <div id="calendario-container" class="flex-1 bg-white border border-slate-200 rounded-lg shadow flex flex-col h-full overflow-hidden text-slate-800 transition-all duration-300">
      
      <!-- 1. BARRA DE HERRAMIENTAS Y CONTROL INTEGRADA -->
      <div class="p-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 overflow-x-auto custom-scroll w-full flex-nowrap select-none">

        <!-- Lado Izquierdo: Diagrama Gantt, Programa Financiero, Curva "S" y Flujo -->
        <div class="flex items-center gap-1.5 shrink-0 flex-nowrap">
          <!-- 1, 2, 3. Selector de Modo de Vista: Diagrama Gantt, Programa Financiero, Curva "S" y Flujo -->
          <div class="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-300 shadow-2xs shrink-0">
            <button type="button" onclick="setCalendarioViewMode('gantt')" class="px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${cfg.viewMode === 'gantt' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">
              <i class="fa-solid fa-chart-gantt ${cfg.viewMode === 'gantt' ? 'text-white' : 'text-blue-600'}"></i> <span>Diagrama Gantt</span>
            </button>
            <button type="button" onclick="setCalendarioViewMode('financiero')" class="px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${cfg.viewMode === 'financiero' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">
              <i class="fa-solid fa-table-columns ${cfg.viewMode === 'financiero' ? 'text-white' : 'text-blue-600'}"></i> <span>Programa Financiero</span>
            </button>
            <button type="button" onclick="setCalendarioViewMode('curva_s')" class="px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${cfg.viewMode === 'curva_s' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">
              <i class="fa-solid fa-chart-line ${cfg.viewMode === 'curva_s' ? 'text-white' : 'text-blue-600'}"></i> <span>Curva "S" y Flujo</span>
            </button>
          </div>
        </div>

        <!-- Lado Derecho: Todos los botones desde "Todas las partidas" hasta "Asignados" pegados a la derecha -->
        <div id="calendario-right-toolbar-group" class="ml-auto flex items-center gap-1.5 shrink-0 flex-nowrap justify-end">

          <!-- 4. Todas las partidas (Filtro de Partidas) -->
          <select id="calendario-partida-select" onchange="filterCalendarioPartida(this.value)" class="bg-white border border-slate-300 text-slate-700 text-[11px] font-medium rounded px-2 py-1 outline-none focus:border-blue-500 cursor-pointer max-w-[155px] truncate shadow-sm shrink-0">
            <option value="all">Todas las partidas (${partidasList.length})</option>
            ${partidasList.map(p => `
              <option value="${escapeCalHtml(p.descripcion)}" ${cfg.selectedPartida === p.descripcion ? 'selected' : ''}>${escapeCalHtml(p.descripcion)}</option>
            `).join('')}
          </select>

          <!-- 5. ✨ Auto-Programar (Base de Procesos Constructivos) -->
          <button type="button" onclick="triggerAutoDistributeSchedule()" id="btn-calendario-auto-pct" ${isCalLocked ? 'disabled' : ''} class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0" title="${isCalLocked ? 'Calendario bloqueado (Solo consulta e impresión)' : 'Auto-Programar: propuesta automática por proceso constructivo (después puedes ajustar barras y fechas)'}">
            <i class="fa-solid fa-wand-magic-sparkles text-xs text-amber-600"></i>
          </button>

          <!-- 6. Solo icono Deshacer -->
          <button type="button" onclick="undoCalendarioScheduleAction()" id="btn-calendario-undo" ${(!canUndo || isCalLocked) ? 'disabled' : ''}
                  class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white shrink-0"
                  title="Deshacer último cambio en Calendario de Obra (Ctrl+Z)">
            <i class="fa-solid fa-rotate-left text-xs"></i>
          </button>

          <!-- 7. Solo icono Rehacer -->
          <button type="button" onclick="redoCalendarioScheduleAction()" id="btn-calendario-redo" ${(!canRedo || isCalLocked) ? 'disabled' : ''}
                  class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white shrink-0"
                  title="Rehacer cambio en Calendario de Obra (Ctrl+Y)">
            <i class="fa-solid fa-rotate-right text-xs"></i>
          </button>

          <!-- Botón unificado Vista de Filas: Normal → Justificado (Texto completo) → Filas compactas -->
          <button type="button" onclick="cycleCalendarioRowViewMode()" id="btn-calendario-justify"
                  class="${rowModeBtnClass} text-[11px] p-1.5 rounded flex items-center justify-center shadow-sm transition active:scale-95 cursor-pointer shrink-0"
                  title="${rowModeBtnTitle}" aria-label="Vista de filas (Justificar / Compactar)">
            ${rowModeBtnIconHtml}
          </button>

          <!-- Botón Candado de Bloqueo (Al lado izquierdo de Agrupar / Desagrupar) -->
          <button type="button" onclick="toggleTabLock('calendario')" id="btn-lock-calendario"
                  class="${isCalLocked ? 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-700 font-bold' : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium'} text-[11px] p-1.5 rounded flex items-center justify-center shadow-sm transition active:scale-95 cursor-pointer shrink-0"
                  title="${isCalLocked ? '🔒 Calendario de Obra bloqueado (Solo consulta e impresión) — Haz clic para desbloquear' : 'Bloquear Calendario de Obra (Permitir solo consulta e impresión)'}">
            <i class="fa-solid ${isCalLocked ? 'fa-lock text-white' : 'fa-lock-open text-slate-600'} text-xs"></i>
          </button>

          <!-- 8. Botón único Agrupar / Desagrupar partidas -->
          <button type="button" onclick="toggleAllCalendarioGroups()" id="btn-toggle-all-calendario-groups"
                  class="${allGroupsCollapsed ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-700 font-bold' : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium'} text-[11px] p-1.5 rounded flex items-center justify-center shadow-sm transition active:scale-95 cursor-pointer shrink-0"
                  title="${allGroupsCollapsed ? 'Desagrupar Todo (Mostrar todos los conceptos)' : 'Agrupar Todo (Colapsar partidas para vista macro)'}"
                  aria-label="${allGroupsCollapsed ? 'Desagrupar partidas' : 'Agrupar partidas'}">
            <i class="fa-solid ${allGroupsCollapsed ? 'fa-arrows-split-up-and-left text-white' : 'fa-layer-group text-amber-600'} text-xs"></i>
          </button>

          <!-- 10. Imprimir -->
          <button type="button" onclick="printCalendarioObra()" id="btn-calendario-print" class="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] px-2.5 py-1 rounded flex items-center gap-1 font-medium shadow-sm transition active:scale-95 cursor-pointer shrink-0" title="Imprimir programa de obra">
            <i class="fa-solid fa-print text-[10px]"></i> <span>Imprimir</span>
          </button>

          <!-- 11. Días Inhábiles (Jornada Laboral, Festivos, Lluvias) -->
          <button type="button" onclick="openCalendarioJornadaModal()" id="btn-calendario-jornada" ${isCalLocked ? 'disabled' : ''}
                  class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] px-2 py-1 rounded flex items-center gap-1 font-medium shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0" 
                  title="${isCalLocked ? 'Calendario bloqueado (Solo consulta e impresión)' : 'Configurar Jornada Laboral, Días Inhábiles, Festivos y Lluvias'}">
            <i class="fa-solid fa-calendar-xmark text-amber-600 text-xs"></i> <span>Días Inhábiles</span>
          </button>

          <!-- 13. Días, Semanas, Meses (Selector de Escala Temporal) -->
          <div id="calendario-scale-selector" class="flex items-center bg-white p-0.5 rounded border border-slate-300 text-[11px] font-semibold shadow-2xs shrink-0">
            <button type="button" onclick="setCalendarioTimeScale('dias')" class="px-2 py-0.5 rounded transition cursor-pointer ${cfg.scale === 'dias' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">Días</button>
            <button type="button" onclick="setCalendarioTimeScale('semanas')" class="px-2 py-0.5 rounded transition cursor-pointer ${cfg.scale === 'semanas' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">Semanas</button>
            <button type="button" onclick="setCalendarioTimeScale('meses')" class="px-2 py-0.5 rounded transition cursor-pointer ${cfg.scale === 'meses' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">Meses</button>
          </div>

          <!-- 14. Zoom del Diagrama Gantt (Acercar / Alejar) -->
          <div class="flex items-center gap-0.5 bg-white p-0.5 rounded border border-slate-300 text-xs font-semibold shadow-2xs shrink-0 ${cfg.viewMode !== 'gantt' ? 'hidden' : ''}" id="gantt-zoom-controls">
            <button type="button" onclick="changeGanttZoom('out')" class="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition cursor-pointer" title="Alejar escala diaria (-)">
              <i class="fa-solid fa-minus text-[9px]"></i>
            </button>
            <button type="button" onclick="changeGanttZoom('reset')" class="px-1.5 py-0.5 rounded text-blue-700 font-mono font-bold text-[11px] hover:bg-blue-50 transition cursor-pointer" title="Restablecer zoom normal (34px/día)">
              ${Math.round((dayWidthPx / 34) * 100)}%
            </button>
            <button type="button" onclick="changeGanttZoom('in')" class="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition cursor-pointer" title="Acercar escala diaria (+)">
              <i class="fa-solid fa-plus text-[9px]"></i>
            </button>
          </div>

          <!-- 15. Asignados (Miembros Asignados a Calendario de Obra, al extremo derecho del mismo renglón) -->
          <div id="tab-members-calendario" class="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-0.5 shadow-2xs shrink-0">
            <i class="fa-solid fa-users text-blue-600 text-[10px]" title="Colaboradores con acceso a Calendario de Obra"></i>
            <div id="tab-avatars-calendario" class="flex -space-x-1.5 overflow-hidden items-center cursor-pointer" onclick="openTabMembersAssignModal('calendario')" title="Ver colaboradores con acceso a Calendario de Obra"></div>
            <button type="button" onclick="openTabMembersAssignModal('calendario')" class="text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5 transition flex items-center gap-1 cursor-pointer" title="Asignar miembros invitados a la pestaña Calendario de Obra">
              <i class="fa-solid fa-user-gear text-[9px]"></i> Asignar
            </button>
          </div>

        </div>

      </div>

      <!-- 2. TARJETAS KPI DE RESUMEN EJECUTIVO (Diseño Claro Corporativo estilo Catálogo Base) -->
      <div class="px-2.5 py-2 bg-slate-50 border-b border-slate-200 grid grid-cols-6 gap-2 shrink-0 w-full select-none">
        
        <!-- Tarjeta 1: INICIO -->
        <div class="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block truncate">INICIO</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-regular fa-calendar-check text-blue-600 text-xs shrink-0"></i>
            <input type="date" value="${minDate ? formatDate(minDate) : cfg.startDate}" onchange="changeProjectStartDate(this.value)" class="calendario-date-input text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer hover:text-blue-600 font-mono w-full truncate">
          </div>
        </div>

        <!-- Tarjeta 2: DÍA ACTUAL / CORTE -->
        <div class="bg-rose-50/50 border border-rose-200 hover:border-rose-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <div class="flex items-center justify-between gap-1">
            <span class="text-[9.5px] font-bold text-rose-700 uppercase tracking-wider block truncate">DÍA ACTUAL / CORTE</span>
            <button type="button" onclick="resetGanttTodayDateAction()" class="text-[8px] font-extrabold text-white bg-rose-600 hover:bg-rose-500 rounded-full px-2 py-0.5 transition cursor-pointer shrink-0 shadow-2xs flex items-center gap-1" title="Restablecer al día de hoy actual en tiempo real">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> Hoy
            </button>
          </div>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-solid fa-location-crosshairs text-rose-600 text-xs shrink-0"></i>
            <input type="date" value="${getGanttTodayDate()}" onchange="changeGanttTodayDateAction(this.value)" class="calendario-date-input text-xs font-bold text-rose-800 bg-transparent outline-none cursor-pointer hover:text-rose-600 font-mono w-full truncate" title="Fecha del día de hoy o fecha de corte desplazada">
          </div>
        </div>

        <!-- Tarjeta 3: TÉRMINO ESTIMADO -->
        <div class="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block truncate">TÉRMINO ESTIMADO</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-solid fa-flag-checkered text-rose-500 text-xs shrink-0"></i>
            <span class="text-xs font-bold text-slate-800 font-mono truncate">${maxDate ? formatDate(maxDate) : '---'}</span>
          </div>
        </div>

        <!-- Tarjeta 4: PLAZO DE EJECUCIÓN -->
        <div class="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block truncate">PLAZO DE EJECUCIÓN</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-regular fa-clock text-amber-600 text-xs shrink-0"></i>
            <span class="text-xs font-extrabold text-slate-800 font-mono truncate" title="${totalDias} días naturales (${workdaysSummary.workingDays} días hábiles efectivos)">
              ${totalDias}d naturales <span class="text-[10px] text-emerald-700 font-bold">(${workdaysSummary.workingDays} hábiles)</span>
            </span>
          </div>
        </div>

        <!-- Tarjeta 5: PRESUPUESTO BASE -->
        <div class="bg-emerald-50/50 border border-emerald-200 hover:border-emerald-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wider block truncate">PRESUPUESTO BASE</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-solid fa-coins text-emerald-600 text-xs shrink-0"></i>
            <span class="text-xs font-black text-emerald-700 font-mono truncate">${formatCurrency(scheduleData.grandTotalObra, currencySymbol)}</span>
          </div>
        </div>

        <!-- Tarjeta 6: MES PICO (MÁX INVERSIÓN) -->
        <div class="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block truncate">MES PICO (MÁX INVERSIÓN)</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0 truncate">
            <i class="fa-solid fa-bolt text-indigo-600 text-xs shrink-0"></i>
            <span class="text-xs font-bold text-slate-800 truncate font-mono" title="${scheduleData.picoPeriod ? scheduleData.picoPeriod.fullLabel : 'N/A'}">
              ${scheduleData.picoPeriod ? scheduleData.picoPeriod.label : 'N/A'} (${formatCurrency(scheduleData.picoMonto, currencySymbol)})
            </span>
          </div>
        </div>

      </div>

      <!-- 3. ÁREA DE VISUALIZACIÓN DINÁMICA (Diagrama Gantt / Financiero / Curva S) -->
      <div class="bg-white overflow-hidden flex-1 flex flex-col relative min-h-[380px]" id="calendario-main-content">
        ${renderActiveCalendarioView(cfg.viewMode, visibleItems, periods, scheduleData, currencySymbol, minDate, maxDate)}
      </div>

    </div>
  `;

  // Inicializar resizer arrastrable manual, alturas sincronizadas + SVG, scroll, barras, lupa de cursor, zoom Premiere y líneas de corte
  if (calendarioInitTimer) clearTimeout(calendarioInitTimer);
  calendarioInitTimer = setTimeout(() => {
    calendarioInitTimer = null;
    ensureCalendarioGlobalListeners();
    initGanttResizer();
    syncGanttJustifiedRowHeights();
    const curLeftScroll = document.getElementById('gantt-left-scroll') || document.getElementById('gantt-left-panel');
    const curRightPanel = document.getElementById('gantt-timeline-panel');
    if (sameProject && curLeftScroll && curRightPanel) {
      curLeftScroll.scrollTop = preservedLeftTop;
      curRightPanel.scrollTop = preservedRightTop;
      curRightPanel.scrollLeft = preservedRightLeft;
    }
    syncGanttScroll();
    initGanttBarDrag();
    initGanttCursorBarLens();
    initPremiereZoomBar();
    initGanttTodayLineDrag();
    initFinancialTodayLineDrag();
    initCurvaSTodayLineDrag();
    renderTabAssignedAvatars('calendario');
  }, 0);
}

// ==========================================
// RENDERIZADO SEGÚN MODO SELECCIONADO
// ==========================================
function renderActiveCalendarioView(mode, items, periods, scheduleData, currencySymbol, minDate, maxDate) {
  if (mode === 'gantt') {
    return renderGanttTimelineView(items, periods, currencySymbol, minDate, maxDate);
  } else if (mode === 'financiero') {
    return renderFinancialTableView(items, periods, scheduleData, currencySymbol);
  } else {
    return renderCurvaSView(periods, scheduleData, currencySymbol);
  }
}

// Construye ruta SVG ortogonal para flechas FI (solid) e II (dashed paralelo)
function buildGanttSvgPathD(linkType, x1, y1, x2, y2, succRowH = 44) {
  const targetX = Math.max(0, x2 - 2);
  if (linkType === 'SS') {
    const leftX = Math.max(2, Math.min(x1, x2) - 9);
    return `M ${x1} ${y1} L ${leftX} ${y1} L ${leftX} ${y2} L ${targetX} ${y2}`;
  }
  if (x2 >= x1 + 12) {
    const midX = Math.round(x1 + Math.min(16, (x2 - x1) / 2));
    return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${targetX} ${y2}`;
  }
  const dir = y2 >= y1 ? 1 : -1;
  const turnY = y1 + dir * Math.max(14, Math.round((succRowH || 40) / 2));
  const outX = x1 + 8;
  const inX = Math.max(2, x2 - 9);
  return `M ${x1} ${y1} L ${outX} ${y1} L ${outX} ${turnY} L ${inX} ${turnY} L ${inX} ${y2} L ${targetX} ${y2}`;
}

// ==========================================
// 1. VISTA DIAGRAMA DE GANTT (ESTILO EJECUTIVO)
// ==========================================
function renderGanttTimelineView(items, periods, currencySymbol, minDate, maxDate) {
  if (!minDate) minDate = parseDate(getScheduleSettings()?.startDate || getProjectCreationDate());
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const cfg = getScheduleSettings();
  const rowViewMode = cfg.rowViewMode || (cfg.justifyConcepts ? 'justified' : 'normal');
  const isJustifyConcepts = (rowViewMode === 'justified');
  const compactRows = (rowViewMode === 'compact');
  const lensEnabled = (cfg.cursorLensEnabled !== false);
  const isCalLocked = isTabLocked('calendario') || !canCurrentUserEditProject(getActiveProjectId());

  const savedPanelWidth = cfg.panelWidth || parseInt(localStorage.getItem('calendario_gantt_split_w'), 10) || 500;
  const showCpm = isAdvancedCalendarioAllowed() && (cfg.showCriticalPath !== false);
  const allItemsSource = currentScheduleData?.items || items;
  const allConceptItems = allItemsSource.filter(it => it.tipo === 'concepto');
  const conceptById = new Map();
  allConceptItems.forEach(c => conceptById.set(String(c.id), c));

  // Generar escala según modo seleccionado: Días, Semanas o Meses (soportando zoom panorámico)
  const scaleData = generateGanttTimeScale(minDate, maxDate, cfg.scale, cfg.dayWidth);
  const { timelineStart, scale, pxPerDay, totalTimelineWidth, monthGroups, days } = scaleData;

  // Cálculo de posición del día actual / fecha de corte
  const todayStr = getGanttTodayDate();
  const todayDate = parseDate(todayStr);
  const todayOffsetDays = diffDays(timelineStart, todayDate);
  const todayLeftPx = Math.round(todayOffsetDays * pxPerDay + (pxPerDay / 2));
  const showTodayLine = (todayLeftPx >= -20 && todayLeftPx <= totalTimelineWidth + 100);

  const night = isNightMode();
  const gridLineRgb = night ? '51, 65, 85' : '203, 213, 225';
  const stepGridPx = (scale === 'dias' && pxPerDay >= 10)
    ? pxPerDay
    : ((scale === 'semanas' && pxPerDay >= 3.5) || pxPerDay >= 4 ? 7 * pxPerDay : 30 * pxPerDay);
  const gridBackgroundStyle = `background-size: ${stepGridPx}px 100%; background-image: linear-gradient(to right, rgba(${gridLineRgb}, ${scale === 'meses' || pxPerDay < 4 ? '0.72' : '0.55'}) 1px, transparent 1px);`;

  // Precalcular altura inicial estimada y geometría (x, y) para flechas SVG (FI + II en paralelo)
  const visibleGeomMap = new Map();
  const rowHeightsMap = new Map();
  const descColWidthPx = Math.max(120, savedPanelWidth - 150);
  const charsPerLine = Math.max(18, Math.floor(descColWidthPx / 6.3));
  let cumulativeRowY = 0;

  items.forEach((it, rowIdx) => {
    const isSel = String(selectedCalendarioRowId) === String(it.id);
    const baseH = compactRows ? 24 : (it.isParent ? 40 : 46);
    let rowH = baseH;
    if (isSel || (isJustifyConcepts && !compactRows)) {
      const descLen = String(it.descripcion || '').length;
      const lines = Math.max(1, Math.ceil(descLen / charsPerLine));
      rowH = it.isParent
        ? Math.max(baseH, lines * 16 + (isSel ? 28 : 14))
        : Math.max(baseH, lines * 15 + (isSel ? 46 : 24));
    }
    rowHeightsMap.set(String(it.id), rowH);

    if (it.startDate && it.endDate) {
      const sD = parseDate(it.startDate);
      const eD = parseDate(it.endDate);
      const offD = Math.max(0, diffDays(timelineStart, sD));
      const bDays = Math.max(3, it.durationDays || (diffDays(sD, eD) + 1));
      const lPx = offD * pxPerDay;
      const wPx = Math.max(6, bDays * pxPerDay);
      visibleGeomMap.set(String(it.id), {
        rowIdx,
        leftPx: lPx,
        rightPx: lPx + wPx,
        widthPx: wPx,
        centerY: cumulativeRowY + (rowH / 2),
        rowHeight: rowH,
        item: it
      });
    }
    cumulativeRowY += rowH;
  });
  const totalRowsHeightPx = Math.max(40, cumulativeRowY);

  // Construir rutas ortogonales SVG para cada enlace FI (FS) e II (SS) visible
  const svgPaths = [];
  items.forEach(succItem => {
    if (succItem.isParent) return;
    const succLinks = normalizeScheduleLinks(succItem.predecessors);
    if (succLinks.length === 0) return;
    const succGeom = visibleGeomMap.get(String(succItem.id));
    if (!succGeom) return;

    succLinks.forEach(lk => {
      const predGeom = visibleGeomMap.get(String(lk.id));
      if (!predGeom) return;
      const predConcept = conceptById.get(String(lk.id));
      const isSS = (lk.type === 'SS');
      const isCritLink = showCpm &&
        predConcept &&
        Array.isArray(predConcept.criticalSuccIds) &&
        predConcept.criticalSuccIds.includes(String(succItem.id));

      const x1 = Math.round(isSS ? predGeom.leftPx : predGeom.rightPx);
      const y1 = Math.round(predGeom.centerY);
      const x2 = Math.round(succGeom.leftPx);
      const y2 = Math.round(succGeom.centerY);
      const pathD = buildGanttSvgPathD(lk.type, x1, y1, x2, y2, succGeom.rowHeight);

      svgPaths.push({
        d: pathD,
        predId: String(lk.id),
        succId: String(succItem.id),
        type: lk.type,
        x1,
        x2,
        rowH: Math.round(succGeom.rowHeight),
        isSS,
        isCritLink,
        fromClave: predConcept?.clave || '',
        toClave: succItem.clave || ''
      });
    });
  });

  const visibleConceptsCount = items.filter(it => !it.isParent).length;
  const visibleCriticalCount = items.filter(it => !it.isParent && it.isCritical).length;
  const visibleLinksCount = items.filter(it => !it.isParent && normalizeScheduleLinks(it.predecessors).length > 0).length;

  const isSingleCompactHeader = !(scale === 'dias' && pxPerDay >= 10) && !(scale === 'semanas' && pxPerDay >= 3.5);
  const fmtHeaderMonthLabel = (m) => {
    if (m.widthPx < 48) return m.short3 || m.monthName.slice(0, 3).toUpperCase();
    if (m.widthPx < 90) return m.shortWithYear || `${m.monthName.slice(0, 3).toUpperCase()} '${String(m.year).slice(-2)}`;
    if (m.widthPx < 135) return m.shortLabel || `${m.monthName.slice(0, 3).toUpperCase()} ${m.year}`;
    return `${m.monthName.toUpperCase()} ${m.year}`;
  };

  return `
    <div class="flex flex-1 overflow-hidden h-full relative bg-white" id="gantt-root-container">
      
      <!-- Panel Izquierdo Streamlined (Clave + Concepto amplio con Predec. e Inicio en 2° renglón + Días) -->
      <div id="gantt-left-panel" 
           class="shrink-0 flex flex-col bg-white z-10 overflow-hidden border-r border-slate-200 relative"
           style="width: ${savedPanelWidth}px; min-width: 240px; max-width: 78%;">
        
        <div id="gantt-left-scroll" class="flex-1 overflow-y-auto overflow-x-hidden custom-scroll relative">
          <!-- Encabezado de la tabla izquierda -->
          <div class="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-semibold px-2.5 flex items-center justify-between sticky top-0 z-20 h-16 shrink-0 shadow-2xs">
            <div class="flex items-center min-w-0 flex-1 mr-1.5">
              <span class="w-[58px] shrink-0">Clave</span>
              <span class="flex-1 min-w-0 px-1 truncate" title="Concepto de Obra con selector interactivo de Inicio y Predecesoras (FI / II)">Concepto de Obra / Inicio y Predecesora</span>
            </div>
            <div class="flex items-center shrink-0">
              <span class="w-12 shrink-0 text-center">Días</span>
            </div>
          </div>

          <!-- Renglones de conceptos y partidas -->
          <div id="gantt-left-rows" class="divide-y divide-slate-100 font-mono text-xs">
            ${items.map(item => {
              const isSelectedRow = String(selectedCalendarioRowId) === String(item.id);
              const wrapText = isSelectedRow || (isJustifyConcepts && !compactRows);
              const baseH = compactRows ? 24 : (item.isParent ? 40 : 46);
              const sizeStyle = wrapText ? `min-height: ${baseH}px;` : `height: ${baseH}px;`;

              if (item.isParent) {
                const isLevel1 = item.level === 1;
                const indentPx = (item.level - 1) * 12 + 6;
                const defaultParentBg = isLevel1 ? 'bg-slate-50 font-bold text-slate-800 border-y border-slate-200' : 'bg-slate-50/60 font-semibold text-slate-800 border-y border-slate-200/70';
                return `
                  <div data-gantt-left-row="${escapeCalHtml(item.id)}" data-base-h="${baseH}" onclick="selectCalendarioRow('${escapeCalHtml(item.id)}', event)" onfocusin="selectCalendarioRow('${escapeCalHtml(item.id)}', null)" class="${item.rowBgColor ? 'font-bold text-slate-800 border-y border-slate-200' : defaultParentBg} ${isSelectedRow ? 'selected-row py-2' : 'hover:bg-slate-100/80'} px-2 flex items-center justify-between cursor-pointer transition select-none" style="padding-left: ${indentPx}px; ${sizeStyle} ${item.rowBgColor ? `background-color: ${item.rowBgColor};` : ''}">
                    <div class="flex ${isSelectedRow ? 'items-start' : 'items-center'} min-w-0 flex-1 mr-1.5">
                      <button type="button" onclick="toggleCalendarioNodeGroup('${escapeCalHtml(item.id)}', event)" 
                              class="mr-1 w-5 h-5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 inline-flex items-center justify-center transition cursor-pointer shrink-0 ${isSelectedRow ? 'mt-0.5' : ''}" 
                              title="${item.expanded ? 'Agrupar partida (colapsar)' : 'Desagrupar partida (expandir)'}">
                        <i class="fa-solid fa-chevron-${item.expanded ? 'down' : 'right'} text-[10px]"></i>
                      </button>
                      <span class="w-[44px] mr-1 text-blue-700 font-mono text-[11px] font-bold shrink-0 truncate ${isSelectedRow ? 'mt-0.5' : ''}">${escapeCalHtml(item.clave || 'PART')}</span>
                      <div class="min-w-0 flex-1 font-sans">
                        <div class="flex items-center gap-1 min-w-0">
                          <span class="${wrapText ? 'whitespace-normal break-words text-justify leading-snug' : 'truncate'} ${isLevel1 ? 'uppercase text-xs tracking-wide font-extrabold text-slate-900' : 'text-xs font-bold text-slate-800'} ${compactRows && !isSelectedRow ? 'text-[11px]' : ''}">${escapeCalHtml(item.descripcion)}</span>
                          <span class="shrink-0">${renderPartidaNivel1ChatButton(item.id, item.clave, item.descripcion)}</span>
                          ${showCpm && item.hasCriticalChildren ? `<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-sans font-bold shrink-0" title="Contiene actividades en Ruta Crítica">🔥 Crítica</span>` : ''}
                          ${!item.expanded ? `<span class="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-mono border border-blue-200 shrink-0 font-normal">Agrup. (${item.descendantConceptCount})</span>` : ''}
                        </div>
                        ${isSelectedRow ? `<span class="block text-[10px] font-mono font-semibold text-blue-800 mt-0.5">📅 ${escapeCalHtml(item.startDate)} → ${escapeCalHtml(item.endDate)} • Total: ${formatCurrency(item.totalImporte, currencySymbol)}</span>` : ''}
                      </div>
                    </div>
                    <div class="flex items-center shrink-0">
                      <span class="w-12 text-center text-[11px] text-slate-800 font-bold">${item.durationDays || 0}d</span>
                    </div>
                  </div>
                `;
              } else {
                const indentPx = (item.level - 1) * 12 + 10;
                const curDur = Math.max(3, item.durationDays || 3);
                const barColorHex = item.customColor || item.color.bar;
                const isCrit = showCpm && item.isCritical;
                const dotHex = isCrit ? '#dc2626' : barColorHex;
                const predLinks = normalizeScheduleLinks(item.predecessors);
                const predDetails = predLinks.map(lk => ({ lk, c: conceptById.get(String(lk.id)) })).filter(x => x.c);
                const predClaves = predDetails.map(x => x.c.clave || 'CONC');
                const hasLock = predLinks.length > 0 && Boolean(item.minAllowedStartDate);
                const hasParallelLink = predLinks.some(lk => lk.type === 'SS' || lk.lag < 0);

                let predPillHtml = '';
                if (predDetails.length === 0) {
                  predPillHtml = `
                    <button type="button" data-open-predec="${escapeCalHtml(item.id)}"
                            onclick="event.stopPropagation(); openConceptDependenciesModal('${escapeCalHtml(item.id)}')"
                            class="h-[18px] px-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-500 hover:text-blue-700 text-[9.5px] font-mono inline-flex items-center gap-1 cursor-pointer transition shrink-0"
                            title="Sin dependencia (inicio libre). Clic para configurar predecesoras (FI o en paralelo II)">
                      <span class="pointer-events-none">🔗 Libre</span>
                    </button>
                  `;
                } else if (predDetails.length === 1) {
                  const { lk, c } = predDetails[0];
                  const isSS = lk.type === 'SS';
                  predPillHtml = `
                    <button type="button" data-open-predec="${escapeCalHtml(item.id)}"
                            onclick="event.stopPropagation(); openConceptDependenciesModal('${escapeCalHtml(item.id)}')"
                            class="h-[18px] px-1.5 rounded border ${isSS ? 'border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800' : 'border-blue-200 bg-blue-50/90 hover:bg-blue-100 text-blue-800'} text-[9.5px] font-mono font-bold inline-flex items-center gap-1 cursor-pointer transition shrink-0"
                            title="${isSS ? 'En paralelo desde inicio de' : 'Al terminar'} ${escapeCalHtml(c.clave)} (${escapeCalHtml(c.descripcion)}) — Clic para editar">
                      <span class="pointer-events-none">${isSS ? '∥' : '🔗'} ${escapeCalHtml(formatScheduleLinkTag(lk, c.clave))}</span>
                    </button>
                  `;
                } else {
                  predPillHtml = `
                    <button type="button" data-open-predec="${escapeCalHtml(item.id)}"
                            onclick="event.stopPropagation(); openConceptDependenciesModal('${escapeCalHtml(item.id)}')"
                            class="h-[18px] px-1.5 rounded border ${hasParallelLink ? 'border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800' : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700'} text-[9.5px] font-mono font-bold inline-flex items-center gap-1 cursor-pointer transition shrink-0"
                            title="${escapeCalHtml(predDetails.map(x => `${formatScheduleLinkTag(x.lk, x.c.clave)}: ${x.c.descripcion}`).join(' | '))} — Clic para editar">
                      <span class="pointer-events-none">🔗 ${predDetails.length} enlac.</span>
                    </button>
                  `;
                }

                const isDatePickerOpen = (String(openDatePickerConceptId) === String(item.id));
                const inicioPillHtml = `
                  <button type="button" data-pick-date="${escapeCalHtml(item.id)}"
                          onclick="event.stopPropagation(); openCalendarioDatePickerPopover('${escapeCalHtml(item.id)}', this)"
                          class="h-[20px] px-1.5 rounded border ${isDatePickerOpen ? 'ring-2 ring-blue-500 border-blue-500 ' : ''}${hasLock ? 'bg-amber-50/90 border-amber-200 text-amber-900 hover:bg-amber-100' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300'} text-[9.5px] font-mono font-semibold inline-flex items-center gap-1 cursor-pointer transition shrink-0"
                          title="${hasLock ? `Inicio: ${escapeCalHtml(item.startDate)} (mín. ${escapeCalHtml(item.minAllowedStartDate)} por ${escapeCalHtml(predClaves.join(', '))}) — Clic para elegir fecha` : `Inicio: ${escapeCalHtml(item.startDate)} — Clic para abrir calendario`}">
                    <span class="pointer-events-none inline-flex items-center gap-1">
                      <i class="fa-regular fa-calendar text-[9px] ${hasLock ? 'text-amber-600' : 'text-blue-600'}"></i>
                      <span>${escapeCalHtml(item.startDate)}</span>
                      ${hasLock ? `<i class="fa-solid fa-lock text-[8px] text-amber-600"></i>` : ''}
                    </span>
                  </button>
                `;

                return `
                  <div data-gantt-left-row="${escapeCalHtml(item.id)}" data-base-h="${baseH}" onclick="selectCalendarioRow('${escapeCalHtml(item.id)}', event)" onfocusin="selectCalendarioRow('${escapeCalHtml(item.id)}', null)" class="${item.rowBgColor ? '' : (isCrit ? 'bg-rose-50/35 hover:bg-rose-50/65' : 'bg-white hover:bg-slate-50')} ${isSelectedRow ? 'selected-row py-2' : ''} px-2 flex items-center justify-between group cursor-pointer transition select-none" style="padding-left: ${indentPx}px; ${sizeStyle} ${item.rowBgColor ? `background-color: ${item.rowBgColor};` : ''}">
                    <div class="flex ${isSelectedRow ? 'items-start' : 'items-center'} min-w-0 flex-1 mr-1.5">
                      <span class="w-2 h-2 rounded-full mr-1.5 shrink-0 border ${isSelectedRow ? 'mt-1.5' : ''}" style="background-color: ${dotHex}44; border-color: ${dotHex};"></span>
                      <span class="w-[50px] mr-1.5 font-mono ${isCrit ? 'text-rose-700 font-bold' : 'text-blue-700 font-semibold'} truncate text-[11px] shrink-0 ${isSelectedRow ? 'mt-0.5' : ''}" title="${escapeCalHtml(item.clave)}">${escapeCalHtml(item.clave)}</span>
                      <div class="min-w-0 flex-1 font-sans">
                        <div class="flex items-start justify-between gap-1 min-w-0">
                          <span class="block min-w-0 flex-1 ${wrapText ? 'whitespace-normal break-words text-justify leading-snug' : 'truncate'} text-slate-800 ${compactRows && !isSelectedRow ? 'text-[11px]' : 'text-xs'} ${isSelectedRow ? 'font-semibold text-slate-900' : 'font-medium'}" title="${escapeCalHtml(item.descripcion)}">${escapeCalHtml(item.descripcion)}</span>
                          <span class="ml-1 shrink-0">${renderPartidaNivel1ChatButton(item.id, item.clave, item.descripcion)}</span>
                        </div>
                        ${isSelectedRow ? `
                          <div class="mt-1.5 space-y-1">
                            <div class="flex flex-wrap items-center justify-between gap-1.5">
                              <span class="text-[10px] text-slate-600 font-mono">${formatNumber(item.cantidad, 2)} ${escapeCalHtml(item.unidad)} • <strong class="text-emerald-700">${formatCurrency(item.importe, currencySymbol)}</strong></span>
                              <div class="flex flex-wrap items-center gap-1">
                                ${predPillHtml}
                                ${inicioPillHtml}
                                <span class="text-[10px] font-mono text-blue-800 font-bold">→ ${escapeCalHtml(item.endDate)}</span>
                                ${showCpm ? `<span class="text-[10px] font-mono ${isCrit ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}">${isCrit ? '🔥 Crítica' : `✓ +${item.slackDays || 0}d`}</span>` : ''}
                              </div>
                            </div>
                            ${predDetails.length > 0 ? `<div class="text-[10.5px] text-indigo-800 font-medium leading-snug whitespace-normal break-words">${predDetails.map(x => {
                              const modeTxt = x.lk.type === 'SS'
                                ? (x.lk.lag === 0 ? '∥ Paralela al inicio de' : `∥ ${x.lk.lag > 0 ? `+${x.lk.lag}d` : `${x.lk.lag}d`} desde inicio de`)
                                : (x.lk.lag === 0 ? '🔗 Tras terminar' : (x.lk.lag > 0 ? `🔗 +${x.lk.lag}d tras terminar` : `🔗 Traslape ${x.lk.lag}d de`));
                              return `${modeTxt} <strong>${escapeCalHtml(x.c.clave)}</strong> (${escapeCalHtml(x.c.descripcion)})`;
                            }).join(' <span class="text-slate-400">•</span> ')}</div>` : ''}
                          </div>
                        ` : (!compactRows ? `
                          <div class="flex items-center justify-between gap-1.5 mt-0.5 min-w-0">
                            <span class="text-[10px] text-slate-500 font-mono truncate">${formatNumber(item.cantidad, 2)} ${escapeCalHtml(item.unidad)} • ${formatCurrency(item.importe, currencySymbol)}</span>
                            <div class="flex items-center gap-1 shrink-0">
                              ${predPillHtml}
                              ${inicioPillHtml}
                            </div>
                          </div>
                        ` : '')}
                      </div>
                    </div>
                    <!-- Input de Duración sin flechas spinner (Mínimo 3 días) -->
                    <div class="w-12 text-center shrink-0">
                      <input type="number" min="3" max="999" value="${curDur}" ${isCalLocked ? 'disabled' : ''}
                             onclick="event.stopPropagation()"
                             onchange="onGanttDurationInput('${escapeCalHtml(item.id)}', '${escapeCalHtml(item.startDate)}', this.value)"
                             class="calendario-dur-input text-[11px] bg-transparent hover:bg-white focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-blue-500 rounded-xs px-0.5 py-0.5 outline-none font-mono text-slate-800 font-bold w-10 text-center transition disabled:opacity-60 disabled:cursor-not-allowed"
                             title="${isCalLocked ? 'Calendario bloqueado (solo consulta)' : 'Duración en días (mínimo 3 días). Al cambiar empuja conceptos dependientes.'}">
                    </div>
                  </div>
                `;
              }
            }).join('')}
          </div>
        </div>

        <!-- Pie del panel izquierdo sincronizado con la barra de navegación -->
        <div id="gantt-left-footer" class="h-8 bg-slate-100 border-t border-slate-200 px-3 flex items-center justify-between text-[10.5px] text-slate-600 font-mono shrink-0 relative z-10">
          <span class="flex items-center gap-1.5 font-semibold text-slate-700"><i class="fa-solid fa-list-check text-blue-600 text-[10px]"></i> ${visibleConceptsCount} conc.</span>
          <span class="flex items-center gap-2">
            <span class="text-rose-700 font-bold" title="Conceptos en Ruta Crítica"><i class="fa-solid fa-fire-flame-curved text-[9px]"></i> ${visibleCriticalCount} crít.</span>
            <span class="text-indigo-700 font-semibold" title="Conceptos con dependencia (FI / II)"><i class="fa-solid fa-link text-[9px]"></i> ${visibleLinksCount} enl.</span>
          </span>
        </div>

      </div>

      <!-- Divisor Arrastrable (Splitter / Resizer Manual entre Conceptos y Gantt) -->
      <div id="gantt-resizer" 
           class="w-2 hover:w-2.5 bg-slate-200 hover:bg-blue-600 active:bg-blue-500 cursor-col-resize shrink-0 z-30 transition-all flex items-center justify-center group select-none shadow-2xs border-x border-slate-300"
           title="Arrastra para ajustar manualmente el ancho del panel de conceptos y el diagrama de Gantt">
        <div class="h-10 w-0.5 rounded-full bg-slate-400 group-hover:bg-white transition-colors"></div>
      </div>

      <!-- Panel Derecho: Contenedor con Timeline y Barra de Desplazamiento y Zoom -->
      <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white relative" id="gantt-right-wrapper">

        <!-- Timeline Gráfico Gantt -->
        <div id="gantt-timeline-panel" class="flex-1 overflow-x-hidden overflow-y-auto bg-white custom-scroll relative">
        
        <!-- Encabezado según Escala: Días (3 niveles), Semanas (2 niveles), Meses o Panorámico (cuando pxPerDay está alejado) -->
        <div id="gantt-timeline-header" class="sticky top-0 z-20 min-w-max bg-slate-100 shadow-2xs" style="width: ${totalTimelineWidth}px;">
          ${(scale === 'dias' && pxPerDay >= 10) ? `
            <!-- ESCALA DÍAS (3 NIVELES: Mes arriba, día del mes en medio, letra L-D abajo) -->
            <div class="flex border-b border-slate-200 min-w-max h-7">
              ${monthGroups.map(m => `
                <div class="border-r border-slate-200 text-center py-1 px-1 bg-slate-100 font-extrabold text-[11px] text-slate-700 uppercase tracking-wider shrink-0 truncate flex items-center justify-center overflow-hidden"
                     style="width: ${m.widthPx}px;"
                     title="${escapeCalHtml(m.label)} (${m.daysCount} días)">
                  <span class="truncate">${fmtHeaderMonthLabel(m)}</span>
                </div>
              `).join('')}
            </div>

            <div class="flex border-b border-slate-200 min-w-max h-9">
              ${days.map(d => {
                let cellBgClass = 'bg-slate-50 text-slate-700';
                let badgeIcon = '';
                let dayTitle = `${d.dateStr} (Día laboral)`;

                if (d.isLluvia) {
                  cellBgClass = 'bg-sky-50 text-sky-700 border-sky-200';
                  badgeIcon = '<i class="fa-solid fa-cloud-rain text-[8px] text-sky-600 leading-none"></i>';
                  dayTitle = `${d.dateStr} - DÍA DE LLUVIA: ${d.lluviaName || 'Suspensión climática'}`;
                } else if (d.isFestivo) {
                  cellBgClass = 'bg-purple-50 text-purple-700 border-purple-200';
                  badgeIcon = '<i class="fa-solid fa-star text-[8px] text-purple-600 leading-none"></i>';
                  dayTitle = `${d.dateStr} - DÍA FESTIVO: ${d.festivoName}`;
                } else if (d.isNonWorkingDayOfWeek) {
                  cellBgClass = 'bg-amber-50/90 text-amber-800';
                  dayTitle = `${d.dateStr} - DÍA NO LABORABLE (Descanso semanal)`;
                } else if (d.isWeekend) {
                  cellBgClass = 'bg-slate-100/80 text-slate-500';
                  dayTitle = `${d.dateStr} - Fin de semana`;
                }

                return `
                  <div class="border-r border-slate-200 text-center flex flex-col justify-between shrink-0 select-none py-0.5 overflow-hidden transition-colors ${cellBgClass}"
                       style="width: ${pxPerDay}px;"
                       title="${escapeCalHtml(dayTitle)}">
                    <div class="flex items-center justify-center gap-0.5 leading-none">
                      <span class="text-[10px] font-mono font-bold leading-none truncate">${d.dayNum}</span>
                      ${badgeIcon}
                    </div>
                    <span class="text-[9px] font-mono leading-none truncate ${d.isNonWorkingDayOfWeek ? 'font-black text-amber-700' : d.isFestivo ? 'font-black text-purple-700' : d.isLluvia ? 'font-black text-sky-700' : 'text-slate-500 font-semibold'}">${d.letter}</span>
                  </div>
                `;
              }).join('')}
            </div>
          ` : (scale === 'semanas' && pxPerDay >= 3.5) ? `
            <!-- ESCALA SEMANAS: Mes arriba y Semana 1, 2, 3, 4 abajo -->
            <div class="flex border-b border-slate-200 min-w-max h-7">
              ${monthGroups.map(m => `
                <div class="border-r border-slate-200 text-center py-1 px-1 bg-slate-100 font-extrabold text-[11px] text-slate-700 uppercase tracking-wider shrink-0 truncate flex items-center justify-center overflow-hidden"
                     style="width: ${m.widthPx}px;"
                     title="${escapeCalHtml(m.label)} (${m.daysCount} días)">
                  <span class="truncate">${fmtHeaderMonthLabel(m)}</span>
                </div>
              `).join('')}
            </div>

            <div class="flex border-b border-slate-200 min-w-max h-9">
              ${monthGroups.map(m => m.weeks.map(w => {
                let weekTitle = w.label;
                let weekSubtitle = w.rangeLabel;
                if (w.widthPx < 45) {
                  weekTitle = w.ultraShortLabel || `S${w.num}`;
                  weekSubtitle = w.shortRange || `${w.rangeLabel}`;
                } else if (w.widthPx < 85) {
                  weekTitle = w.shortLabel || `Sem ${w.num}`;
                  weekSubtitle = w.shortRange || `${w.rangeLabel}`;
                } else {
                  weekTitle = `Semana ${w.num}`;
                  weekSubtitle = `${w.rangeLabel}`;
                }

                return `
                  <div class="border-r border-slate-200 text-center flex flex-col justify-center shrink-0 select-none py-0.5 px-0.5 bg-slate-50 text-slate-700 overflow-hidden"
                       style="width: ${w.widthPx}px;"
                       title="${escapeCalHtml(m.label)} - Semana ${w.num} (${w.daysCount} días: del ${w.rangeLabel})">
                    <span class="text-[10px] font-bold leading-none text-slate-800 truncate w-full">${weekTitle}</span>
                    <span class="text-[9px] font-mono leading-none text-slate-500 mt-0.5 truncate w-full">${weekSubtitle}</span>
                  </div>
                `;
              }).join('')).join('')}
            </div>
          ` : `
            <!-- ESCALA MESES O VISTA PANORÁMICA ALEJADA -->
            <div class="flex border-b border-slate-200 min-w-max h-16">
              ${monthGroups.map(m => {
                const monthTitle = fmtHeaderMonthLabel(m);
                const monthSub = m.widthPx < 65 ? `${m.daysCount}d` : (m.widthPx < 150 ? `${m.daysCount} días` : `${m.daysCount} días naturales`);
                return `
                  <div class="border-r border-slate-200 text-center pt-1.5 pb-5 px-1 bg-slate-100 flex flex-col items-center justify-start shrink-0 overflow-hidden"
                       style="width: ${m.widthPx}px;"
                       title="${escapeCalHtml(m.label)} (${m.daysCount} días naturales)">
                    <span class="text-xs font-black text-blue-700 uppercase tracking-wider truncate w-full px-1">${monthTitle}</span>
                    <span class="text-[10px] text-slate-500 font-mono mt-0.5 truncate w-full px-1">${monthSub}</span>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Filas con las Barras del Gantt, Flechas SVG FI/II y Cuadrícula de Fondo -->
        <div id="gantt-timeline-rows" class="divide-y divide-slate-100 text-xs min-w-max relative" style="width: ${totalTimelineWidth}px;">
          
          <!-- Capa SVG de Flechas de Dependencia FI (sólidas) / II en paralelo (punteadas) y Ruta Crítica -->
          <svg id="gantt-dependency-svg"
               width="${totalTimelineWidth}"
               height="${totalRowsHeightPx}"
               class="absolute top-0 left-0 pointer-events-none z-20 overflow-visible">
            <defs>
              <marker id="gantt-arrow-crit" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#e11d48"></path>
              </marker>
              <marker id="gantt-arrow-ss" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#0284c7"></path>
              </marker>
              <marker id="gantt-arrow-norm" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="${night ? '#94a3b8' : '#64748b'}"></path>
              </marker>
            </defs>
            ${svgPaths.map(p => {
              const strokeCol = p.isCritLink ? '#e11d48' : (p.isSS ? '#0284c7' : (night ? '#94a3b8' : '#64748b'));
              const markerId = p.isCritLink ? 'gantt-arrow-crit' : (p.isSS ? 'gantt-arrow-ss' : 'gantt-arrow-norm');
              return `
                <path d="${p.d}"
                      data-gantt-svg-link="1"
                      data-pred-id="${escapeCalHtml(p.predId)}"
                      data-succ-id="${escapeCalHtml(p.succId)}"
                      data-link-type="${escapeCalHtml(p.type)}"
                      data-x1="${p.x1}"
                      data-x2="${p.x2}"
                      data-row-h="${p.rowH}"
                      fill="none"
                      stroke="${strokeCol}"
                      stroke-width="${p.isCritLink ? '1.9' : (p.isSS ? '1.5' : '1.4')}"
                      ${p.isSS ? 'stroke-dasharray="4 2"' : ''}
                      stroke-linejoin="round"
                      marker-end="url(#${markerId})"
                      opacity="${p.isCritLink ? '0.95' : (p.isSS ? '0.88' : '0.75')}"></path>
              `;
            }).join('')}
          </svg>

          ${items.map(item => {
            const rowH = rowHeightsMap.get(String(item.id)) || (compactRows ? 24 : 44);
            const isSelectedRow = String(selectedCalendarioRowId) === String(item.id);
            const sDate = parseDate(item.startDate);
            const eDate = parseDate(item.endDate);
            const offsetDays = Math.max(0, diffDays(timelineStart, sDate));
            const barDays = Math.max(3, item.durationDays || (diffDays(sDate, eDate) + 1));

            const leftPx = offsetDays * pxPerDay;
            const widthPx = Math.max(6, barDays * pxPerDay);
            const barHeightClass = (compactRows && !isSelectedRow) ? 'h-[14px]' : 'h-6';

            if (item.isParent) {
              const parentCrit = showCpm && item.hasCriticalChildren;
              const showParentText = widthPx >= 64 && !(compactRows && !isSelectedRow);
              return `
                <div data-gantt-right-row="${escapeCalHtml(item.id)}" onclick="selectCalendarioRow('${escapeCalHtml(item.id)}', event)" class="relative ${item.rowBgColor ? '' : 'bg-slate-50/70'} ${isSelectedRow ? 'selected-row' : ''} border-y border-slate-200/80 flex items-center cursor-pointer"
                     style="height: ${rowH}px; width: ${totalTimelineWidth}px; ${item.rowBgColor ? `background-color: ${item.rowBgColor};` : ''} ${gridBackgroundStyle}">
                  <div class="absolute ${barHeightClass} rounded-md shadow-xs ${parentCrit ? 'bg-slate-800 border-rose-500/80' : 'bg-slate-700 border-slate-800'} hover:bg-slate-600 border hover:border-blue-500 flex items-center justify-between px-2 text-[10px] text-white font-bold truncate transition cursor-pointer select-none z-10" 
                       style="left: ${leftPx}px; width: ${widthPx}px;"
                       onclick="event.stopPropagation(); toggleCalendarioNodeGroup('${escapeCalHtml(item.id)}', event)"
                       title="${escapeCalHtml(item.descripcion)}: ${escapeCalHtml(item.startDate)} al ${escapeCalHtml(item.endDate)} (${barDays} días)&#10;Total: ${formatCurrency(item.totalImporte, currencySymbol)}&#10;Clic para ${item.expanded ? 'agrupar' : 'desagrupar'}">
                    ${showParentText ? `<span class="truncate">${escapeCalHtml(item.descripcion)}</span><span class="shrink-0 text-[9px] font-mono opacity-85 ml-1">${barDays}d</span>` : ''}
                  </div>
                </div>
              `;
            } else {
              const color = item.color || { bar: '#3b82f6' };
              const baseColorHex = item.customColor || color.bar;
              const isCritBar = showCpm && item.isCritical;
              const effectiveBarHex = isCritBar ? '#dc2626' : baseColorHex;
              const isPendingPred = calendarioLinkClickMode && String(pendingLinkPredecessorId) === String(item.id);
              const barLinks = normalizeScheduleLinks(item.predecessors);
              const predClaves = barLinks.map(lk => conceptById.get(String(lk.id))?.clave).filter(Boolean);
              const predTooltipLine = barLinks.length > 0
                ? `&#10;🔗 Enlaces: ${barLinks.map(lk => formatScheduleLinkTag(lk, conceptById.get(String(lk.id))?.clave || lk.id)).join(', ')} (mín. ${item.minAllowedStartDate})`
                : '';
              const cpmTooltipLine = item.isCritical
                ? `&#10;🔥 RUTA CRÍTICA (Holgura: 0 días)`
                : `&#10;✓ Holgura disponible: +${item.slackDays || 0} día(s)`;
              const showBarText = widthPx >= 46 && !(compactRows && !isSelectedRow);
              const handleWClass = widthPx >= 28 ? 'w-2.5' : 'w-1.5';

              return `
                <div data-gantt-right-row="${escapeCalHtml(item.id)}" onclick="selectCalendarioRow('${escapeCalHtml(item.id)}', event)" class="relative ${item.rowBgColor ? '' : (isCritBar ? 'bg-rose-50/25 hover:bg-rose-50/50' : 'bg-white hover:bg-slate-50/80')} ${isSelectedRow ? 'selected-row' : ''} transition flex items-center cursor-pointer"
                     style="height: ${rowH}px; width: ${totalTimelineWidth}px; ${item.rowBgColor ? `background-color: ${item.rowBgColor};` : ''} ${gridBackgroundStyle}">
                  <div class="gantt-bar-concept ${isCritBar ? 'gantt-bar-critical ring-1 ring-rose-950/25 shadow-sm' : 'shadow-xs'} ${isSelectedRow ? 'ring-2 ring-blue-600/50' : ''} ${isPendingPred ? 'ring-2 ring-amber-400 shadow-lg' : ''} ${barHeightClass} absolute rounded-md flex items-center justify-between group select-none z-10 overflow-hidden transition-shadow"
                       data-concept-id="${escapeCalHtml(item.id)}"
                       data-start-date="${escapeCalHtml(item.startDate)}"
                       data-duration="${barDays}"
                       data-clave="${escapeCalHtml(item.clave)}"
                       data-desc="${escapeCalHtml(item.descripcion)}"
                       data-min-start-date="${escapeCalHtml(item.minAllowedStartDate || '')}"
                       data-pred-claves="${escapeCalHtml(predClaves.join(', '))}"
                       data-is-critical="${item.isCritical ? '1' : '0'}"
                       style="left: ${leftPx}px; width: ${widthPx}px; background-color: ${effectiveBarHex}; cursor: ${calendarioLinkClickMode ? 'pointer' : (isCalLocked ? 'default' : 'grab')};"
                       title="${escapeCalHtml(item.clave)} - ${escapeCalHtml(item.descripcion)}&#10;Inicio: ${escapeCalHtml(item.startDate)} | Fin: ${escapeCalHtml(item.endDate)} (${barDays} días)${escapeCalHtml(predTooltipLine)}${cpmTooltipLine}&#10;Monto: ${formatCurrency(item.importe, currencySymbol)}&#10;• Arrastra el centro para mover fecha&#10;• Arrastra los bordes laterales para estirar o reducir">
                    
                    <!-- Manija Izquierda: Reducir / Estirar Inicio -->
                    <div class="gantt-handle-left absolute left-0 top-0 bottom-0 ${handleWClass} rounded-l-md hover:bg-white/40 cursor-ew-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
                         title="Arrastra para cambiar inicio (reducir o estirar)">
                      <div class="w-0.5 h-3 bg-white/80 rounded-full pointer-events-none"></div>
                    </div>

                    <!-- Contenido Central de la Barra (Mover) -->
                    <div class="gantt-bar-body flex-1 flex items-center justify-between px-2 min-w-0 pointer-events-none select-none text-white">
                      ${showBarText ? `
                        <span class="truncate text-[10px] font-bold flex items-center gap-1">
                          ${predClaves.length > 0 ? `<i class="fa-solid fa-lock text-[8px] opacity-90 shrink-0"></i>` : ''}
                          <span class="truncate">${escapeCalHtml(item.clave)}</span>
                        </span>
                        <span class="text-[9px] font-mono shrink-0 hidden sm:inline text-white/95 ml-1 font-bold">${barDays}d</span>
                      ` : ''}
                    </div>

                    <!-- Manija Derecha: Reducir / Estirar Fin -->
                    <div class="gantt-handle-right absolute right-0 top-0 bottom-0 ${handleWClass} rounded-r-md hover:bg-white/40 cursor-ew-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
                         title="Arrastra para cambiar duración (reducir o estirar)">
                      <div class="w-0.5 h-3 bg-white/80 rounded-full pointer-events-none"></div>
                    </div>
                  </div>
                </div>
              `;
            }
          }).join('')}

          <!-- LÍNEA INDICADORA DE DÍA DE HOY / FECHA DE CORTE (Arrastrable a días anteriores o futuros) -->
          ${showTodayLine ? `
            <div id="gantt-today-line-container" 
                 class="absolute -top-16 bottom-0 z-30 pointer-events-none"
                 style="left: ${todayLeftPx}px;"
                 data-today-date="${todayStr}">
              
              <!-- Pin / Marcador Superior en el Encabezado (Arrastrable) -->
              <div id="gantt-today-pin" 
                   class="absolute ${isSingleCompactHeader ? 'top-[42px]' : 'top-1'} -translate-x-1/2 pointer-events-auto cursor-ew-resize z-40 select-none group flex flex-col items-center"
                   title="Día de Hoy / Fecha de Corte: ${todayStr}&#10;• Arrastra para mover a días anteriores o futuros&#10;• Doble clic para volver al día real"
                   data-today-date="${todayStr}">
                
                <div class="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 active:bg-rose-400 text-white text-[9px] font-black uppercase tracking-wider shadow-md border border-rose-300 flex items-center gap-1 transition-transform group-hover:scale-105">
                  <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                  <span>HOY</span>
                </div>
                <div class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-rose-600 -mt-0.5 shadow-sm"></div>
              </div>

              <!-- Línea Vertical que atraviesa todas las filas -->
              <div class="w-0.5 h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] -translate-x-1/2 opacity-90"></div>

              <!-- Etiqueta Flotante Inferior con la fecha -->
              <div class="absolute bottom-2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-rose-600 border border-rose-700 text-white text-[9px] font-mono font-bold pointer-events-none shadow-sm">
                ${todayStr}
              </div>

            </div>
          ` : ''}

        </div>

      </div>

      <!-- Barra de Desplazamiento y Zoom Inferior (Estilo Claro Catálogo Base) -->
      <div id="gantt-premiere-zoombar-container" 
           class="h-8 bg-slate-100 border-t border-slate-200 px-2.5 flex items-center justify-between select-none z-20 gap-2 shrink-0">
        
        <!-- Botón Desplazar Izquierda (Paso suave) -->
        <button type="button" 
                id="gantt-nav-btn-left" 
                onclick="scrollGanttTimelineStep(-1)" 
                class="w-6 h-5 rounded bg-white hover:bg-slate-200 active:bg-blue-600 text-slate-600 hover:text-slate-900 active:text-white flex items-center justify-center text-[10px] transition cursor-pointer border border-slate-300 shadow-2xs shrink-0" 
                title="Desplazar línea de tiempo hacia la izquierda (◀)">
          <i class="fa-solid fa-chevron-left"></i>
        </button>

        <!-- Pista de Navegación y Zoom (Track) -->
        <div id="gantt-premiere-track" 
             class="flex-1 h-5 bg-slate-200/80 hover:bg-slate-200 rounded-md border border-slate-300 relative cursor-pointer overflow-hidden shadow-inner flex items-center"
             title="Clic para saltar a esta posición en el cronograma">
          
          <!-- Líneas de referencia sutiles de la pista -->
          <div class="absolute inset-0 flex items-center justify-between px-3 pointer-events-none opacity-40">
            <div class="h-1.5 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1.5 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1.5 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1.5 w-0.5 bg-slate-400 rounded-full"></div>
          </div>

          <!-- Deslizador / Thumb de Zoom y Desplazamiento -->
          <div id="gantt-premiere-thumb" 
               class="absolute h-3.5 rounded-sm bg-gradient-to-b from-white to-slate-100 hover:from-blue-50 hover:to-blue-100 active:from-blue-600 active:to-blue-700 border border-slate-400 hover:border-blue-500 shadow-2xs flex items-center justify-between transition-colors z-10"
               style="left: 0px; width: 120px; cursor: grab;"
               title="Arrastra para desplazar la línea de tiempo; usa los bordes laterales para hacer zoom">
            
            <!-- Manija Extremo Izquierdo: Zoom In / Out desde el inicio -->
            <div id="gantt-premiere-handle-left" 
                 class="w-3.5 h-full rounded-l-sm bg-slate-300 hover:bg-blue-500 active:bg-blue-600 cursor-ew-resize flex items-center justify-center transition-colors group/hleft"
                 title="Arrastra hacia adentro para acercar (Zoom In), hacia afuera para alejar (Zoom Out)">
              <div class="w-0.5 h-2 bg-slate-600 group-hover/hleft:bg-white rounded-full pointer-events-none"></div>
            </div>

            <!-- Centro de Agarre / Desplazamiento -->
            <div id="gantt-premiere-thumb-body" 
                 class="flex-1 h-full flex items-center justify-center pointer-events-none gap-0.5 select-none opacity-70">
              <div class="w-0.5 h-1.5 bg-slate-500 rounded-full"></div>
              <div class="w-0.5 h-1.5 bg-slate-500 rounded-full"></div>
              <div class="w-0.5 h-1.5 bg-slate-500 rounded-full"></div>
            </div>

            <!-- Manija Extremo Derecho: Zoom In / Out desde el final -->
            <div id="gantt-premiere-handle-right" 
                 class="w-3.5 h-full rounded-r-sm bg-slate-300 hover:bg-blue-500 active:bg-blue-600 cursor-ew-resize flex items-center justify-center transition-colors group/hright"
                 title="Arrastra hacia adentro para acercar (Zoom In), hacia afuera para alejar (Zoom Out)">
              <div class="w-0.5 h-2 bg-slate-600 group-hover/hright:bg-white rounded-full pointer-events-none"></div>
            </div>

          </div>

        </div>

        <!-- Botón Desplazar Derecha (Paso suave) -->
        <button type="button" 
                id="gantt-nav-btn-right" 
                onclick="scrollGanttTimelineStep(1)" 
                class="w-6 h-5 rounded bg-white hover:bg-slate-200 active:bg-blue-600 text-slate-600 hover:text-slate-900 active:text-white flex items-center justify-center text-[10px] transition cursor-pointer border border-slate-300 shadow-2xs shrink-0" 
                title="Desplazar línea de tiempo hacia la derecha (▶)">
          <i class="fa-solid fa-chevron-right"></i>
        </button>

        <!-- Toggle Lupa al pasar sobre barras alejadas / compactas -->
        <button type="button"
                id="btn-gantt-cursor-lens"
                onclick="toggleCalendarioCursorLens()"
                class="px-2 h-5 rounded border text-[10px] font-bold transition flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer ${lensEnabled ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300' : 'bg-white hover:bg-slate-200 text-slate-500 border-slate-300'}"
                title="${lensEnabled ? 'Lupa flotante activa al pasar sobre barras alejadas o filas compactas (clic para desactivar)' : 'Activar lupa flotante sobre barras alejadas'}">
          <i class="fa-solid fa-magnifying-glass-plus text-[9px]"></i> <span>Lupa</span>
        </button>

        <!-- Botón Ver Todo / Ajustar Proyecto (Fit Entire Project) -->
        <button type="button" 
                id="gantt-nav-btn-fit" 
                onclick="fitGanttTimelineEntireProject()" 
                class="px-2 h-5 rounded bg-white hover:bg-blue-600 text-[10px] font-mono font-bold text-slate-700 hover:text-white transition flex items-center gap-1 border border-slate-300 shadow-2xs shrink-0 cursor-pointer group/fit" 
                title="Ajustar escala para ver la obra completa en pantalla (Fit Timeline)">
          <i class="fa-solid fa-expand text-[9px] text-blue-600 group-hover/fit:text-white"></i> <span>Ajustar</span>
        </button>

      </div>

    </div>

  </div>
`;
}

// ==========================================
// 2. VISTA PROGRAMA FINANCIERO (FORMATO Y COLORES CATÁLOGO BASE)
// ==========================================
function renderFinancialTableView(items, periods, scheduleData, currencySymbol) {
  const { periodTotals, grandTotalObra } = scheduleData;
  const cfg = getScheduleSettings();
  const isJustifyConcepts = Boolean(cfg.justifyConcepts);
  const n = periods.length;

  const todayStr = getGanttTodayDate();
  const todayDate = parseDate(todayStr);

  // Anchos fijos en px: Clave(80) + Concepto(260) + Unid(48) + Cant(80) + PU(96) + ImpTot(112) = 676px
  const fixedColsWidth = 676;
  const periodColWidth = 144; // 144px por período

  let finTodayLeftPx = fixedColsWidth + 10;
  if (n > 0) {
    const pStart0 = periods[0].startDate;
    const pEndLast = periods[n - 1].endDate;
    if (todayDate <= pStart0) {
      finTodayLeftPx = fixedColsWidth;
    } else if (todayDate >= pEndLast) {
      finTodayLeftPx = fixedColsWidth + (n * periodColWidth);
    } else {
      let foundIdx = 0;
      let fraction = 0;
      for (let i = 0; i < n; i++) {
        const p = periods[i];
        if (todayDate >= p.startDate && todayDate <= p.endDate) {
          foundIdx = i;
          const pDays = Math.max(1, diffDays(p.startDate, p.endDate));
          fraction = diffDays(p.startDate, todayDate) / pDays;
          break;
        } else if (todayDate < p.startDate) {
          foundIdx = Math.max(0, i - 1);
          fraction = 1;
          break;
        }
      }
      finTodayLeftPx = Math.round(fixedColsWidth + (foundIdx * periodColWidth) + (fraction * periodColWidth));
    }
  }

  return `
    <div class="overflow-x-auto overflow-y-auto flex-1 h-full relative bg-white custom-scroll calendario-premiere-scroll" id="financial-table-panel">
      
      <div class="relative min-w-max" id="financial-table-wrapper">
        <table class="w-full text-left border-collapse text-xs text-slate-700 bg-white" id="financial-program-table">
          
          <!-- Encabezado de la Tabla Financiera (Idéntico a Catálogo Base: bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold) -->
          <thead class="bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold sticky top-0 z-20 border-b border-slate-200 shadow-2xs">
            <tr>
              <th class="py-2.5 px-3 font-bold w-20 text-center border-r border-slate-200">Clave</th>
              <th class="py-2.5 px-3 font-bold min-w-[260px] border-r border-slate-200">Concepto de Obra</th>
              <th class="py-2.5 px-2 font-bold w-12 text-center border-r border-slate-200">Unid</th>
              <th class="py-2.5 px-3 font-bold w-20 text-right border-r border-slate-200">Cant Total</th>
              <th class="py-2.5 px-3 font-bold w-24 text-right border-r border-slate-200">P.U. ($)</th>
              <th class="py-2.5 px-3 font-bold w-28 text-right border-r border-slate-300 bg-slate-200/70 text-slate-800">Importe Total</th>

              <!-- Columnas de Períodos -->
              ${periods.map((p, pIdx) => `
                <th colspan="2" 
                    id="fin-col-${p.key}"
                    data-period-idx="${pIdx}"
                    data-period-key="${p.key}"
                    data-period-start="${formatDate(p.startDate)}"
                    data-period-end="${formatDate(p.endDate)}"
                    class="py-1 px-2 text-center border-r border-slate-200 font-bold bg-slate-100 text-slate-700 min-w-[144px] w-36">
                  <span class="block text-[10.5px] truncate">${p.label}</span>
                  <div class="flex justify-between text-[9.5px] text-slate-500 font-normal px-1 mt-0.5 font-mono normal-case">
                    <span class="w-1/2 text-center">Cant</span>
                    <span class="w-1/2 text-right">Importe ($)</span>
                  </div>
                </th>
              `).join('')}

              <th class="py-2.5 px-3 font-bold w-28 text-right bg-blue-50 text-blue-800 border-l border-blue-200">Total Programado</th>
              <th class="py-2.5 px-2 font-bold w-16 text-center bg-blue-50 text-blue-800 border-l border-blue-100">% Pond</th>
            </tr>
          </thead>

          <!-- Cuerpo con Conceptos y Partidas (Estilo Catálogo Base) -->
          <tbody class="divide-y divide-slate-100 font-mono text-xs">
            ${items.map(item => {
              const isSelectedRow = String(selectedCalendarioRowId) === String(item.id);
              if (item.isParent) {
                const pctPartida = grandTotalObra > 0 ? ((item.totalImporte || 0) / grandTotalObra) * 100 : 0;
                const isLevel1 = item.level === 1;
                const indentPx = (item.level - 1) * 14 + 10;
                const defaultRowClass = isLevel1 ? 'bg-slate-50 font-bold text-slate-800 border-y-2 border-slate-200' : 'bg-slate-50/60 font-semibold text-slate-800 border-y border-slate-200';
                return `
                  <tr data-fin-row="${item.id}" onclick="selectCalendarioRow('${item.id}', event)" onfocusin="selectCalendarioRow('${item.id}', event)" class="${item.rowBgColor ? 'font-bold text-slate-800 border-y border-slate-200' : defaultRowClass} ${isSelectedRow ? 'selected-row' : 'hover:bg-slate-100/80'} cursor-pointer transition select-none" ${item.rowBgColor ? `style="background-color: ${item.rowBgColor};"` : ''}>
                    <td class="py-2 px-3 text-center text-blue-700 font-mono font-bold">${item.clave || 'PART'}</td>
                    <td class="py-2 px-3 uppercase tracking-wide ${isJustifyConcepts ? 'whitespace-normal break-words text-justify leading-snug' : 'truncate'} font-sans text-xs" colspan="4" style="padding-left: ${indentPx}px">
                      <div class="flex items-center gap-1.5">
                        <button type="button" onclick="toggleCalendarioNodeGroup('${item.id}', event)" 
                                class="w-5 h-5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 inline-flex items-center justify-center transition cursor-pointer shrink-0" 
                                title="${item.expanded ? 'Agrupar partida (colapsar)' : 'Desagrupar partida (expandir)'}">
                          <i class="fa-solid fa-chevron-${item.expanded ? 'down' : 'right'} text-[10px]"></i>
                        </button>
                        <span class="${isJustifyConcepts ? 'whitespace-normal break-words text-justify leading-snug' : 'truncate'} ${isLevel1 ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'}">${item.descripcion}</span>
                        <span class="ml-1.5 shrink-0">${renderPartidaNivel1ChatButton(item.id, item.clave, item.descripcion)}</span>
                        ${!item.expanded ? `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-mono border border-blue-200 ml-2 shrink-0 font-normal">Agrupado (${item.descendantConceptCount} conc.)</span>` : ''}
                      </div>
                    </td>
                    <td class="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-100/80 border-x border-slate-200">${formatCurrency(item.totalImporte, currencySymbol)}</td>

                    <!-- Importes agrupados por período -->
                    ${periods.map(p => {
                      const d = item.periodData ? item.periodData[p.key] : null;
                      const imp = d ? d.importe : 0;
                      return `
                        <td class="py-2 px-1 text-center text-[10px] text-slate-400 border-l border-slate-200">---</td>
                        <td class="py-2 px-2 text-right font-mono text-xs font-bold text-slate-800 border-r border-slate-200">
                          ${imp > 0 ? formatCurrency(imp, currencySymbol) : '<span class="text-slate-400">$0.00</span>'}
                        </td>
                      `;
                    }).join('')}

                    <td class="py-2 px-3 text-right font-mono font-black text-blue-800 bg-blue-50/70 border-l border-blue-100">${formatCurrency(item.totalImporte, currencySymbol)}</td>
                    <td class="py-2 px-2 text-center text-xs font-bold text-blue-700 bg-blue-50/70">${pctPartida.toFixed(1)}%</td>
                  </tr>
                `;
              } else {
                const pctConc = grandTotalObra > 0 ? ((item.importe || 0) / grandTotalObra) * 100 : 0;
                const indentPx = (item.level - 1) * 14 + 16;
                const barColorHex = item.customColor || item.color.bar;
                return `
                  <tr data-fin-row="${item.id}" onclick="selectCalendarioRow('${item.id}', event)" onfocusin="selectCalendarioRow('${item.id}', event)" class="${item.rowBgColor ? '' : 'bg-white hover:bg-slate-50'} ${isSelectedRow ? 'selected-row' : ''} text-xs cursor-pointer transition" ${item.rowBgColor ? `style="background-color: ${item.rowBgColor};"` : ''}>
                    <td class="py-1.5 px-3 text-center font-mono text-blue-700 font-semibold">${item.clave}</td>
                    <td class="py-1.5 px-3 text-slate-800 font-medium ${isJustifyConcepts ? 'whitespace-normal break-words text-justify leading-snug min-w-[260px] max-w-[340px]' : 'truncate max-w-[280px]'} font-sans" title="${item.descripcion}" style="padding-left: ${indentPx}px">
                      <div class="flex items-start gap-1.5 min-w-0">
                        <span class="w-1.5 h-1.5 rounded-full mr-1 mt-1.5 shrink-0" style="background-color: ${barColorHex};"></span>
                        <span class="flex-1 min-w-0 ${isJustifyConcepts ? 'block whitespace-normal break-words text-justify leading-snug' : 'truncate'}">${item.descripcion}</span>
                        <span class="shrink-0">${renderPartidaNivel1ChatButton(item.id, item.clave, item.descripcion)}</span>
                      </div>
                    </td>
                    <td class="py-1.5 px-2 text-center text-slate-600 font-mono">${item.unidad}</td>
                    <td class="py-1.5 px-3 text-right font-mono text-slate-700">${formatNumber(item.cantidad, 2)}</td>
                    <td class="py-1.5 px-3 text-right font-mono text-slate-600">${formatCurrency(item.precioUnitario, currencySymbol)}</td>
                    <td class="py-1.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/80 border-x border-slate-200">${formatCurrency(item.importe, currencySymbol)}</td>

                    <!-- Celdas Editables por Período (Inputs estilo Catálogo Base) -->
                    ${periods.map(p => {
                      const d = item.periodData ? item.periodData[p.key] : null;
                      const cant = d ? d.cantidad : 0;
                      const imp = d ? d.importe : 0;
                      return `
                        <td class="py-1 px-1 border-l border-slate-100">
                          <input type="number" step="any" min="0" value="${cant > 0 ? cant.toFixed(2) : ''}" 
                                 placeholder="0.00"
                                 onchange="onFinancialCellEdit('${item.id}', '${p.key}', 'cantidad', this.value)"
                                 class="w-14 text-center font-mono bg-transparent hover:bg-white focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-blue-500 rounded-xs px-1 py-0.5 text-xs text-slate-700 outline-none transition">
                        </td>
                        <td class="py-1 px-2 border-r border-slate-200">
                          <input type="number" step="any" min="0" value="${imp > 0 ? imp.toFixed(2) : ''}" 
                                 placeholder="$0.00"
                                 onchange="onFinancialCellEdit('${item.id}', '${p.key}', 'importe', this.value)"
                                 class="w-20 text-right font-mono font-bold text-emerald-700 bg-transparent hover:bg-white focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-blue-500 rounded-xs px-1 py-0.5 text-xs outline-none transition">
                        </td>
                      `;
                    }).join('')}

                    <td class="py-1.5 px-3 text-right font-mono font-bold text-slate-800 bg-blue-50/30 border-l border-blue-100">${formatCurrency(item.importe, currencySymbol)}</td>
                    <td class="py-1.5 px-2 text-center text-[11px] font-mono text-slate-600 bg-blue-50/30">${pctConc.toFixed(2)}%</td>
                  </tr>
                `;
              }
            }).join('')}
          </tbody>

          <!-- Totales Físicos y Financieros por Período (Estilo Pie de Tabla de Catálogo Base: bg-slate-50 border-t-2 border-slate-300) -->
          <tfoot class="bg-slate-50 text-slate-800 font-mono sticky bottom-0 z-20 border-t-2 border-slate-300 shadow-md">
            
            <!-- Renglón 1: Total Período ($) -->
            <tr class="bg-slate-50 font-bold border-b border-slate-200">
              <td colspan="6" class="py-2 px-3 font-bold text-right uppercase text-xs text-slate-700 font-sans">
                Total Período ($):
              </td>
              ${periods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td colspan="2" class="py-2 px-2 text-right font-bold text-slate-900 border-r border-slate-200 font-mono">
                    ${formatCurrency(tot ? tot.importe : 0, currencySymbol)}
                  </td>
                `;
              }).join('')}
              <td class="py-2 px-3 text-right font-black text-emerald-700 bg-emerald-50 border-l border-emerald-200">${formatCurrency(grandTotalObra, currencySymbol)}</td>
              <td class="py-2 px-2 text-center text-xs font-bold text-emerald-700 bg-emerald-50">100%</td>
            </tr>

            <!-- Renglón 2: % Avance Período -->
            <tr class="bg-white font-bold border-b border-slate-200">
              <td colspan="6" class="py-1.5 px-3 font-bold text-right uppercase text-xs text-slate-600 font-sans">
                % Avance Período:
              </td>
              ${periods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td colspan="2" class="py-1.5 px-2 text-right font-bold text-blue-700 border-r border-slate-200 font-mono">
                    ${tot ? tot.pctPeriodo.toFixed(2) : '0.00'}%
                  </td>
                `;
              }).join('')}
              <td class="py-1.5 px-3 text-right font-bold text-blue-700 bg-blue-50/50 border-l border-blue-100">100.00%</td>
              <td class="py-1.5 px-2 text-center text-xs font-bold text-slate-400 bg-blue-50/50">---</td>
            </tr>

            <!-- Renglón 3: Total Acumulado ($) -->
            <tr class="bg-slate-50 font-bold border-b border-slate-200">
              <td colspan="6" class="py-2 px-3 font-bold text-right uppercase text-xs text-slate-700 font-sans">
                Total Acumulado ($):
              </td>
              ${periods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td colspan="2" class="py-2 px-2 text-right font-bold text-emerald-700 border-r border-slate-200 font-mono">
                    ${formatCurrency(tot ? tot.importeAcumulado : 0, currencySymbol)}
                  </td>
                `;
              }).join('')}
              <td class="py-2 px-3 text-right font-black text-emerald-700 bg-emerald-50 border-l border-emerald-200">${formatCurrency(grandTotalObra, currencySymbol)}</td>
              <td class="py-2 px-2 text-center text-xs font-bold text-slate-400 bg-emerald-50">---</td>
            </tr>

            <!-- Renglón 4: % Avance Acumulado (Curva S) -->
            <tr class="bg-white font-bold">
              <td colspan="6" class="py-1.5 px-3 font-bold text-right uppercase text-xs text-slate-700 font-sans">
                % Avance Acumulado:
              </td>
              ${periods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td colspan="2" class="py-1.5 px-2 text-right font-bold text-indigo-700 border-r border-slate-200 font-mono">
                    ${tot ? tot.pctAcumulado.toFixed(2) : '0.00'}%
                  </td>
                `;
              }).join('')}
              <td class="py-1.5 px-3 text-right font-black text-indigo-700 bg-indigo-50/60 border-l border-indigo-100">100.00%</td>
              <td class="py-1.5 px-2 text-center text-xs font-bold text-indigo-700 bg-indigo-50/60">100%</td>
            </tr>

          </tfoot>
        </table>

        <!-- LÍNEA Y PIN DE DÍA ACTUAL / CORTE EN PROGRAMA FINANCIERO -->
        <div id="financial-today-line-container" 
             class="absolute top-0 bottom-0 z-30 pointer-events-none"
             style="left: ${finTodayLeftPx}px;"
             data-today-date="${todayStr}">
          
          <!-- Pin / Marcador Superior Arrastrable -->
          <div id="financial-today-pin" 
               class="sticky top-1 -translate-x-1/2 pointer-events-auto cursor-ew-resize z-40 select-none group flex flex-col items-center"
               title="Día de Hoy / Fecha de Corte: ${todayStr}&#10;• Arrastra horizontalmente para mover a días anteriores o futuros&#10;• Doble clic para volver al día real"
               data-today-date="${todayStr}">
            
            <div class="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 active:bg-rose-400 text-white text-[9px] font-black uppercase tracking-wider shadow-md border border-rose-300 flex items-center gap-1 transition-transform group-hover:scale-105">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              <span>CORTE</span>
            </div>
            <div class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-rose-600 -mt-0.5 shadow-sm"></div>
          </div>

          <!-- Línea Vertical que atraviesa todas las filas de la tabla -->
          <div class="w-0.5 h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] -translate-x-1/2 opacity-90"></div>

          <!-- Etiqueta Flotante en la Base con la fecha de corte -->
          <div class="sticky bottom-2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-rose-600 border border-rose-700 text-white text-[9px] font-mono font-bold pointer-events-none shadow-sm">
            ${todayStr}
          </div>

        </div>

      </div>
    </div>
  `;
}

// ==========================================
// 3. VISTA CURVA "S" Y FLUJO DE EFECTIVO (FORMATO Y COLORES CATÁLOGO BASE)
// ==========================================
function renderCurvaSView(periods, scheduleData, currencySymbol) {
  const { periodTotals, grandTotalObra } = scheduleData;
  const n = periods.length;

  if (n === 0) {
    return `<div class="p-8 text-center text-slate-400">No hay períodos para generar la curva.</div>`;
  }

  // Generar puntos SVG para la Curva S (Ancho 960 x Alto 380 con margen inferior de 100px para fechas totalmente verticales)
  const W = 960;
  const H = 380;
  const padX = 70;
  const padTop = 40;
  const padBottom = 100;
  const chartW = W - padX * 2;
  const chartH = H - padTop - padBottom; // 240px de altura útil para la curva

  // Puntos del gráfico
  const points = [];
  periods.forEach((p, idx) => {
    const tot = periodTotals[p.key];
    const pct = tot ? tot.pctAcumulado : 0;
    const x = padX + (idx / Math.max(1, n - 1)) * chartW;
    const y = padTop + chartH - (pct / 100) * chartH;
    points.push({
      x,
      y,
      pct,
      label: p.label,
      fullLabel: p.fullLabel || p.label,
      shortLabel: p.shortLabel || p.label,
      importe: tot ? tot.importeAcumulado : 0,
      impMes: tot ? tot.importe : 0,
      pctPeriodo: tot ? tot.pctPeriodo : 0
    });
  });

  const polylineStr = points.map(pt => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
  const areaStr = `${points[0].x},${padTop + chartH} ` + polylineStr + ` ${points[points.length - 1].x},${padTop + chartH}`;

  // Cálculo de posición de la línea de Hoy / Corte en la Curva S
  const todayStr = getGanttTodayDate();
  const todayDate = parseDate(todayStr);
  const pStart0 = periods[0].startDate;
  const pEndLast = periods[n - 1].endDate;
  const totalDaysCurva = Math.max(1, diffDays(pStart0, pEndLast) + 1);
  const daysOffset = diffDays(pStart0, todayDate);
  const fraction = Math.max(0, Math.min(1, daysOffset / (totalDaysCurva - 1)));
  const todayX = padX + fraction * chartW;
  const night = isNightMode();
  const svgGridStroke = night ? '#334155' : '#cbd5e1';
  const svgAxisTextPrimary = night ? '#cbd5e1' : '#334155';
  const svgAxisTextSecondary = night ? '#94a3b8' : '#475569';
  const svgBaseLineStroke = night ? '#475569' : '#94a3b8';
  const svgCurveStroke = night ? '#3b82f6' : '#2563eb';
  const svgPointFill = night ? '#0f172a' : '#ffffff';
  const svgBadgeFill = night ? '#1e293b' : '#ffffff';
  const svgBadgeStroke = night ? '#60a5fa' : '#2563eb';
  const svgBadgeText = night ? '#93c5fd' : '#1d4ed8';
  const svgTickStroke = night ? '#64748b' : '#64748b';

  return `
    <div class="flex-1 overflow-auto p-4 sm:p-6 space-y-6 bg-white text-slate-800 custom-scroll calendario-premiere-scroll" id="curva-s-panel">
      
      <!-- Encabezado de la Curva S -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h3 class="font-extrabold text-sm text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-chart-line text-blue-600"></i> Curva "S" de Inversión y Avance Programado
          </h3>
          <p class="text-xs text-slate-500 mt-0.5">
            Proyección acumulada de erogaciones y porcentaje de avance físico/financiero a lo largo del tiempo.
          </p>
        </div>

        <div class="flex items-center gap-4 text-xs font-semibold">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-blue-600 inline-block"></span>
            <span class="text-slate-700">Avance Acumulado (%)</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-md bg-amber-500 inline-block"></span>
            <span class="text-slate-700">Erogación del Período ($)</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-rose-600 inline-block"></span>
            <span class="text-rose-700 font-bold">Corte (${todayStr})</span>
          </div>
        </div>
      </div>

      <!-- Gráfico SVG Interactivo con Fondo Claro estilo Catálogo Base -->
      <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-4 shadow-2xs relative overflow-hidden">
        <svg viewBox="0 0 ${W} ${H}" class="w-full h-84 sm:h-96 select-none" id="curva-s-svg">
          
          <defs>
            <linearGradient id="curvaGradientGlobal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${svgCurveStroke}" stop-opacity="${night ? '0.32' : '0.22'}"/>
              <stop offset="100%" stop-color="${svgCurveStroke}" stop-opacity="${night ? '0.04' : '0.02'}"/>
            </linearGradient>
          </defs>

          <!-- Líneas de cuadrícula horizontal con porcentajes y montos en ambos ejes (0%, 25%, 50%, 75%, 100%) -->
          ${[0, 25, 50, 75, 100].map(pct => {
            const y = padTop + chartH - (pct / 100) * chartH;
            return `
              <line x1="${padX}" y1="${y}" x2="${padX + chartW}" y2="${y}" stroke="${svgGridStroke}" stroke-dasharray="3,3" stroke-width="1"/>
              <!-- Eje Y Izquierdo: Porcentaje destacado -->
              <text x="${padX - 12}" y="${y + 4}" fill="${svgAxisTextPrimary}" font-size="11.5" font-family="monospace" font-weight="bold" text-anchor="end">${pct}%</text>
              <!-- Eje Y Derecho: Monto de Inversión Acumulada estimada -->
              <text x="${padX + chartW + 12}" y="${y + 4}" fill="${svgAxisTextSecondary}" font-size="10" font-family="monospace" text-anchor="start">${formatCurrency((pct / 100) * grandTotalObra, currencySymbol)}</text>
            `;
          }).join('')}

          <!-- Eje horizontal base -->
          <line x1="${padX}" y1="${padTop + chartH}" x2="${padX + chartW}" y2="${padTop + chartH}" stroke="${svgBaseLineStroke}" stroke-width="1.5"/>

          <!-- Barras de Inversión del Período -->
          ${periods.map((p, idx) => {
            const tot = periodTotals[p.key];
            const imp = tot ? tot.importe : 0;
            const maxImp = scheduleData.picoMonto > 0 ? scheduleData.picoMonto : 1;
            const barH = (imp / maxImp) * (chartH * 0.7);
            const x = padX + (idx / Math.max(1, n - 1)) * chartW - 14;
            const y = padTop + chartH - barH;
            return `
              <rect x="${x}" y="${y}" width="28" height="${barH}" fill="#f59e0b" opacity="0.85" rx="4">
                <title>${p.fullLabel || p.label}: ${formatCurrency(imp, currencySymbol)} (${tot ? tot.pctPeriodo.toFixed(1) : 0}%)</title>
              </rect>
            `;
          }).join('')}

          <!-- Área sombreada Curva S -->
          <polygon points="${areaStr}" fill="url(#curvaGradientGlobal)"/>

          <!-- Línea de Curva S -->
          <polyline fill="none" stroke="${svgCurveStroke}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="${polylineStr}"/>

          <!-- Puntos y Badges de Porcentaje Claramente Visibles -->
          ${points.map(pt => `
            <g class="cursor-pointer">
              <title>${pt.fullLabel}&#10;• Avance Acumulado: ${pt.pct.toFixed(2)}% (${formatCurrency(pt.importe, currencySymbol)})&#10;• Erogación Período: ${formatCurrency(pt.impMes, currencySymbol)} (${pt.pctPeriodo.toFixed(2)}%)</title>
              
              <!-- Círculo del punto en la curva -->
              <circle cx="${pt.x}" cy="${pt.y}" r="5.5" fill="${svgPointFill}" stroke="${svgCurveStroke}" stroke-width="3" />
              
              <!-- Badge flotante con porcentaje visible -->
              <g transform="translate(${pt.x}, ${pt.y - 18})" class="pointer-events-none select-none">
                <rect x="-24" y="-11" width="48" height="17" rx="5" 
                      fill="${svgBadgeFill}" stroke="${svgBadgeStroke}" stroke-width="1.5" 
                      filter="drop-shadow(0 1px 2px rgba(0,0,0,0.22))" />
                <text x="0" y="1" fill="${svgBadgeText}" font-size="10.5" font-family="monospace" font-weight="900" 
                      text-anchor="middle" dominant-baseline="middle">
                  ${pt.pct.toFixed(1)}%
                </text>
              </g>
            </g>
          `).join('')}

          <!-- Eje X: Marcas y Fechas TOTALMENTE VERTICALES (-90°) -->
          ${points.map((pt, idx) => {
            const isDense = n > 24;
            const showLabel = !isDense || (idx % 2 === 0) || (idx === n - 1);
            return `
              <!-- Marca de graduación en el eje X -->
              <line x1="${pt.x}" y1="${padTop + chartH}" x2="${pt.x}" y2="${padTop + chartH + 6}" stroke="${svgTickStroke}" stroke-width="1.5" />
              
              ${showLabel ? `
                <!-- Etiqueta de Fecha / Período Totalmente Vertical (-90°) -->
                <g transform="translate(${pt.x}, ${padTop + chartH + 12}) rotate(-90)">
                  <text x="-4" y="0" 
                        fill="${svgAxisTextPrimary}" font-size="10" font-family="monospace" font-weight="bold" 
                        text-anchor="end" dominant-baseline="central" class="select-none">
                    ${pt.label}
                  </text>
                </g>
              ` : ''}
            `;
          }).join('')}

          <!-- LÍNEA Y PIN DE CORTE EN CURVA S (INTERACTIVA Y ARRASTRABLE) -->
          <g id="curva-s-today-group" class="cursor-ew-resize select-none" data-today-date="${todayStr}">
            <!-- Línea vertical punteada -->
            <line id="curva-s-today-line" 
                  x1="${todayX.toFixed(1)}" y1="${padTop - 10}" 
                  x2="${todayX.toFixed(1)}" y2="${padTop + chartH + 8}" 
                  stroke="#e11d48" stroke-width="2.5" stroke-dasharray="5,3" />
            
            <!-- Pin / Marcador Superior Arrastrable (CORTE / HOY) -->
            <g id="curva-s-today-pin" class="cursor-ew-resize group" transform="translate(${todayX.toFixed(1)}, ${padTop - 12})">
              <title>Día de Hoy / Fecha de Corte: ${todayStr}&#10;• Arrastra para mover la fecha de corte a días anteriores o futuros&#10;• Doble clic para volver al día real</title>
              <rect x="-24" y="-18" width="48" height="18" rx="4" fill="#e11d48" stroke="#fda4af" stroke-width="1.5" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.25))" />
              <text x="0" y="-8.5" fill="#ffffff" font-size="9" font-family="sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="middle">
                CORTE
              </text>
              <polygon points="-5,0 5,0 0,6" fill="#e11d48" />
            </g>

            <!-- Badge de Fecha Flotante en la Base de la Línea de Corte -->
            <g id="curva-s-today-badge" transform="translate(${todayX.toFixed(1)}, ${padTop + chartH + 16})">
              <rect x="-32" y="0" width="64" height="17" rx="4" fill="#e11d48" stroke="#be123c" stroke-width="1" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.2))" />
              <text x="0" y="9" fill="#ffffff" font-size="9.5" font-family="monospace" font-weight="bold" text-anchor="middle" dominant-baseline="middle">
                ${todayStr}
              </text>
            </g>
          </g>

        </svg>
      </div>

      <!-- Tabla Resumen Ejecutivo de Erogaciones (Formato y colores de Catálogo Base) -->
      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <table class="w-full text-left text-xs font-mono">
          <thead class="bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200">
            <tr>
              <th class="p-2.5">Período de Obra</th>
              <th class="p-2.5 text-right">Erogación Período ($)</th>
              <th class="p-2.5 text-center">% Período</th>
              <th class="p-2.5 text-right">Inversión Acumulada ($)</th>
              <th class="p-2.5 text-center">% Acumulado</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-slate-700">
            ${periods.map(p => {
              const tot = periodTotals[p.key];
              const curvaRowKey = `curva_${p.key}`;
              const isSelectedCurva = String(selectedCalendarioRowId) === curvaRowKey;
              return `
                <tr data-curva-row="${curvaRowKey}" onclick="selectCalendarioRow('${curvaRowKey}', event)" class="${isSelectedCurva ? 'selected-row' : 'hover:bg-slate-50'} cursor-pointer transition">
                  <td class="p-2.5 font-bold text-slate-800 font-sans">${p.fullLabel || p.label}</td>
                  <td class="p-2.5 text-right text-amber-700 font-bold">${formatCurrency(tot ? tot.importe : 0, currencySymbol)}</td>
                  <td class="p-2.5 text-center text-slate-600">${tot ? tot.pctPeriodo.toFixed(2) : 0}%</td>
                  <td class="p-2.5 text-right font-bold text-emerald-700">${formatCurrency(tot ? tot.importeAcumulado : 0, currencySymbol)}</td>
                  <td class="p-2.5 text-center font-bold text-blue-700">${tot ? tot.pctAcumulado.toFixed(2) : 0}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

    </div>
  `;
}

// ==========================================
// CONTROLADORES DE EVENTOS DE USUARIO
// ==========================================

export function setCalendarioViewMode(mode) {
  saveScheduleSettings({ viewMode: mode });
  renderCalendarioObra();
}

export function setCalendarioTimeScale(scale) {
  saveScheduleSettings({ scale });
  renderCalendarioObra();
}

export function filterCalendarioPartida(partida) {
  saveScheduleSettings({ selectedPartida: partida });
  renderCalendarioObra();
}

export function changeProjectStartDate(newDateStr) {
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  if (!newDateStr) return;
  saveScheduleSettings({ userCustomStartDate: true });
  shiftProjectScheduleStart(newDateStr);
  showToast(`Fecha de inicio actualizada a: ${newDateStr}`);
  renderCalendarioObra();
}

export function changeGanttTodayDateAction(newDateStr) {
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  if (!newDateStr) return;
  setGanttTodayDate(newDateStr);
  showToast(`Fecha de hoy / corte establecida en: ${newDateStr}`);
  renderCalendarioObra();
}

export function resetGanttTodayDateAction(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  if (!guardTabUnlocked('calendario')) return;
  resetGanttTodayDate();
  showToast(`Fecha de corte restablecida al día de hoy real (${formatDate(new Date())})`);
  renderCalendarioObra();
}

export function onGanttDateInput(conceptId, startDateStr, durationDays) {
  selectedCalendarioRowId = String(conceptId);
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  const dur = Math.max(3, parseInt(durationDays, 10) || 3);
  const res = updateConceptDatesInModel(conceptId, startDateStr, dur);
  if (res && res.clampedByPredecessor) {
    const clavesTxt = (res.blockingClaves && res.blockingClaves.length > 0) ? res.blockingClaves.join(', ') : 'su predecesora';
    showToast(`🔒 Inicio ajustado a ${res.minAllowedDate}: no puede iniciar antes de que termine ${clavesTxt}.`, 'error');
  } else if (res && res.cascadedCount > 0) {
    showToast(`Fecha actualizada • ${res.cascadedCount} concepto(s) dependiente(s) actualizados en cascada.`);
  }
  renderCalendarioObra();
}

export function onGanttDurationInput(conceptId, startDateStr, durationDays) {
  selectedCalendarioRowId = String(conceptId);
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  const dur = Math.max(3, parseInt(durationDays, 10) || 3);
  const res = updateConceptDatesInModel(conceptId, startDateStr, dur);
  if (res && res.cascadedCount > 0) {
    showToast(`Duración actualizada (${dur}d) • ${res.cascadedCount} concepto(s) dependiente(s) recorridos automáticamente.`);
  }
  renderCalendarioObra();
}

export function onFinancialCellEdit(conceptId, periodKey, field, value) {
  selectedCalendarioRowId = String(conceptId);
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems(state.treeData);
  const periods = generateTimePeriods(rawItems, cfg.scale, cfg.startDate);

  updateConceptPeriodInModel(conceptId, periodKey, field, value, periods);
  renderCalendarioObra();
}

export function triggerAutoDistributeSchedule() {
  if (!guardTabUnlocked('calendario')) return;
  // ✨ Auto-Programar: abre la vista previa por proceso constructivo; al aplicar se re-renderiza el Gantt
  openAutoProgramModal({ onApplied: () => renderCalendarioObra() });
}

export function exportCurrentScheduleExcel() {
  if (!currentScheduleData) {
    showToast('No hay datos de calendario cargados para exportar.', false);
    return;
  }
  exportScheduleToExcel(currentScheduleData, state.settings);
}

export function printCalendarioObra() {
  printCalendarioObraFormat();
}

// ------------------------------------------
// AGRUPAR / DESAGRUPAR (PLEGAR / DESPLEGAR)
// ------------------------------------------
export function toggleCalendarioNodeGroup(nodeId, event) {
  if (event) event.stopPropagation();
  toggleCalendarioNodeExpand(nodeId);
  renderCalendarioObra();
}

export function toggleAllCalendarioGroups() {
  const items = extractScheduleItems(state.treeData);
  const parents = items.filter(it => it.isParent);
  const allCollapsed = parents.length > 0 && parents.every(p => p.expanded === false);
  if (allCollapsed) {
    expandAllCalendarioNodes();
    showToast('Se desagruparon todas las partidas y conceptos de obra.');
  } else {
    collapseAllCalendarioNodes();
    showToast('Se agruparon todas las partidas en niveles ejecutivos.');
  }
  renderCalendarioObra();
}

export function expandAllCalendarioGroups() {
  expandAllCalendarioNodes();
  showToast('Se desagruparon todas las partidas y conceptos de obra.');
  renderCalendarioObra();
}

export function collapseAllCalendarioGroups() {
  collapseAllCalendarioNodes();
  showToast('Se agruparon todas las partidas en niveles ejecutivos.');
  renderCalendarioObra();
}

export function cycleCalendarioRowViewMode() {
  const cfg = getScheduleSettings();
  const current = cfg.rowViewMode || (cfg.justifyConcepts ? 'justified' : 'normal');
  const nextMode = current === 'normal' ? 'justified' : (current === 'justified' ? 'compact' : 'normal');
  saveScheduleSettings({
    rowViewMode: nextMode,
    justifyConcepts: (nextMode === 'justified')
  });
  renderCalendarioObra();
  if (nextMode === 'justified') {
    showToast('Texto completo (Justificado) activado en Conceptos de Obra.');
  } else if (nextMode === 'compact') {
    showToast('Filas compactas en 1 línea activadas (mayor densidad visual).');
  } else {
    showToast('Vista normal (2 líneas con controles inline) activada.');
  }
  return nextMode;
}

export function toggleCalendarioJustifyText() {
  return cycleCalendarioRowViewMode();
}

export function toggleCalendarioCursorLens() {
  const cfg = getScheduleSettings();
  const nextVal = !(cfg.cursorLensEnabled !== false);
  saveScheduleSettings({ cursorLensEnabled: nextVal });
  if (!nextVal) hideCursorBarLens();
  renderCalendarioObra();
  showToast(nextVal
    ? '🔍 Lupa flotante activada al pasar el cursor sobre barras compactas o alejadas.'
    : 'Lupa flotante de barras desactivada.');
  return nextVal;
}

export function syncGanttJustifiedRowHeights() {
  const leftPanel = document.getElementById('gantt-left-scroll') || document.getElementById('gantt-left-panel');
  const rightPanel = document.getElementById('gantt-timeline-panel');
  if (!leftPanel || !rightPanel || typeof leftPanel.querySelectorAll !== 'function') return;

  const leftRows = leftPanel.querySelectorAll('[data-gantt-left-row]');
  if (!leftRows || leftRows.length === 0) return;

  const centerYMap = new Map();
  const rowHMap = new Map();
  let cumY = 0;

  leftRows.forEach(leftEl => {
    const rowId = leftEl.getAttribute && leftEl.getAttribute('data-gantt-left-row');
    if (!rowId) return;
    // Liberar height fija previa brevemente cuando el texto se expande o envuelve
    if (leftEl.style && leftEl.style.minHeight) {
      leftEl.style.height = 'auto';
    }
    const baseH = parseInt(leftEl.getAttribute('data-base-h'), 10) || 40;
    const h = Math.max(baseH, leftEl.offsetHeight || baseH);
    if (leftEl.style) leftEl.style.height = `${h}px`;

    const rightEl = rightPanel.querySelector(`[data-gantt-right-row="${CSS.escape ? CSS.escape(rowId) : rowId}"]`)
      || rightPanel.querySelector(`[data-gantt-right-row="${rowId}"]`);
    if (rightEl && rightEl.style) {
      rightEl.style.height = `${h}px`;
    }

    centerYMap.set(String(rowId), cumY + (h / 2));
    rowHMap.set(String(rowId), h);
    cumY += h;
  });

  const svgEl = document.getElementById('gantt-dependency-svg');
  if (svgEl) {
    svgEl.setAttribute('height', String(Math.max(40, cumY)));
    svgEl.querySelectorAll('[data-gantt-svg-link]').forEach(pathEl => {
      const predId = pathEl.getAttribute('data-pred-id');
      const succId = pathEl.getAttribute('data-succ-id');
      const lkType = pathEl.getAttribute('data-link-type') || 'FS';
      const x1 = parseFloat(pathEl.getAttribute('data-x1')) || 0;
      const x2 = parseFloat(pathEl.getAttribute('data-x2')) || 0;
      const y1 = centerYMap.get(String(predId));
      const y2 = centerYMap.get(String(succId));
      const succRowH = rowHMap.get(String(succId)) || 44;
      if (y1 !== undefined && y2 !== undefined) {
        pathEl.setAttribute('d', buildGanttSvgPathD(lkType, Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), succRowH));
      }
    });
  }
}

// ------------------------------------------
// ZOOM DEL DIAGRAMA DE GANTT (ACERCAR / ALEJAR)
// ------------------------------------------
export function changeGanttZoom(action) {
  const cfg = getScheduleSettings();
  const ZOOM_STEPS = [6, 10, 14, 18, 24, 28, 34, 44, 56, 72, 92];
  let current = cfg.dayWidth || 34;

  if (action === 'reset') {
    current = 34;
  } else if (action === 'in') {
    const next = ZOOM_STEPS.find(s => s > current);
    current = next || ZOOM_STEPS[ZOOM_STEPS.length - 1];
  } else if (action === 'out') {
    const prev = [...ZOOM_STEPS].reverse().find(s => s < current);
    current = prev || ZOOM_STEPS[0];
  } else if (typeof action === 'number') {
    current = Math.max(2, Math.min(120, action));
  }

  saveScheduleSettings({ dayWidth: current });
  renderCalendarioObra();
}

// ------------------------------------------
// DIVISOR ARRASTRABLE (SPLITTER ENTRE CONCEPTOS Y GANTT)
// ------------------------------------------
export function initGanttResizer() {
  const resizer = document.getElementById('gantt-resizer');
  const leftPanel = document.getElementById('gantt-left-panel');
  const rootContainer = document.getElementById('gantt-root-container');
  if (!resizer || !leftPanel || !rootContainer || !leftPanel.style) return;

  const cfg = getScheduleSettings();
  const savedW = cfg.panelWidth || parseInt(localStorage.getItem('calendario_gantt_split_w'), 10) || 500;
  leftPanel.style.width = `${savedW}px`;

  let isDragging = false;
  let startX = 0;
  let startW = savedW;

  function onStart(clientX) {
    isDragging = true;
    startX = clientX;
    startW = leftPanel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizer.classList.add('bg-blue-600', 'ring-2', 'ring-blue-400');
  }

  function onMove(clientX) {
    if (!isDragging) return;
    const dx = clientX - startX;
    const containerW = rootContainer.clientWidth;
    const minW = 240;
    const maxW = Math.max(300, Math.floor(containerW * 0.78));
    const newW = Math.max(minW, Math.min(maxW, startW + dx));
    leftPanel.style.width = `${newW}px`;
    syncGanttJustifiedRowHeights();
    updatePremiereZoomBarUI();
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    resizer.classList.remove('bg-blue-600', 'ring-2', 'ring-blue-400');
    const finalW = leftPanel.offsetWidth;
    saveScheduleSettings({ panelWidth: finalW });
    localStorage.setItem('calendario_gantt_split_w', finalW);
    syncGanttJustifiedRowHeights();
    updatePremiereZoomBarUI();
  }

  // Eventos de Mouse
  resizer.onmousedown = (e) => {
    e.preventDefault();
    onStart(e.clientX);

    function mouseMoveHandler(ev) {
      onMove(ev.clientX);
    }
    function mouseUpHandler() {
      onEnd();
      window.removeEventListener('mousemove', mouseMoveHandler);
      window.removeEventListener('mouseup', mouseUpHandler);
    }
    window.addEventListener('mousemove', mouseMoveHandler);
    window.addEventListener('mouseup', mouseUpHandler);
  };

  // Eventos Touch para pantallas táctiles
  resizer.ontouchstart = (e) => {
    if (e.touches && e.touches.length > 0) {
      onStart(e.touches[0].clientX);
    }
  };
  resizer.ontouchmove = (e) => {
    if (e.touches && e.touches.length > 0) {
      onMove(e.touches[0].clientX);
    }
  };
  resizer.ontouchend = () => {
    onEnd();
  };
}

// ------------------------------------------
// SCROLL SINCRONIZADO VERTICAL Y HORIZONTAL
// ------------------------------------------
export function syncGanttScroll() {
  const leftPanel = document.getElementById('gantt-left-scroll') || document.getElementById('gantt-left-panel');
  const rightPanel = document.getElementById('gantt-timeline-panel');
  if (!leftPanel || !rightPanel) return;

  let isSyncingLeft = false;
  let isSyncingRight = false;

  leftPanel.onscroll = () => {
    if (!isSyncingLeft) {
      isSyncingRight = true;
      rightPanel.scrollTop = leftPanel.scrollTop;
    }
    isSyncingLeft = false;
  };

  rightPanel.onscroll = () => {
    if (!isSyncingRight) {
      isSyncingLeft = true;
      leftPanel.scrollTop = rightPanel.scrollTop;
    }
    isSyncingRight = false;
    updatePremiereZoomBarUI();
  };
}

// ------------------------------------------
// ARRASTRE Y REDIMENSIONAMIENTO DE BARRAS DE GANTT (MOVER, ESTIRAR Y REDUCIR)
// ------------------------------------------
export function initGanttBarDrag() {
  if (isTabLocked('calendario') || !canCurrentUserEditProject(getActiveProjectId())) return;
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  if (!timelinePanel || !timelinePanel.querySelectorAll) return;

  const cfg = getScheduleSettings();
  let minDate = null;
  let maxDate = null;
  const rawItems = extractScheduleItems(state.treeData);
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || getProjectCreationDate());
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const scaleData = generateGanttTimeScale(minDate, maxDate, cfg.scale, cfg.dayWidth);
  const pxPerDay = scaleData.pxPerDay || 34;

  const bars = timelinePanel.querySelectorAll('.gantt-bar-concept');
  if (!bars || bars.length === 0) return;

  let tooltip = typeof document !== 'undefined' ? document.getElementById('gantt-drag-tooltip') : null;
  if (!tooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    tooltip = document.createElement('div');
    tooltip.id = 'gantt-drag-tooltip';
    tooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-xs px-3 py-1.5 rounded-xl border border-blue-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(tooltip);
  }

  function updateTooltip(clientX, clientY, textHtml) {
    if (!tooltip || !tooltip.style) return;
    tooltip.innerHTML = textHtml;
    tooltip.style.left = `${clientX + 14}px`;
    tooltip.style.top = `${clientY - 42}px`;
  }

  bars.forEach(bar => {
    if (!bar) return;

    bar.onmousedown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.stopPropagation) e.stopPropagation();
      if (e.preventDefault) e.preventDefault();

      const conceptId = bar.getAttribute('data-concept-id');
      const origStartStr = bar.getAttribute('data-start-date');
      const origDur = Math.max(3, parseInt(bar.getAttribute('data-duration'), 10) || 3);
      const clave = bar.getAttribute('data-clave') || 'CONC';
      const minStartStr = bar.getAttribute('data-min-start-date') || '';
      const predClavesStr = bar.getAttribute('data-pred-claves') || '';
      const origStartDate = parseDate(origStartStr);

      // Si está activo el Modo Vincular con Clic en Barras: conectar Predecesora -> Dependiente
      if (calendarioLinkClickMode) {
        handleCalendarioBarLinkClick(conceptId, clave);
        return;
      }

      const target = e.target || bar;
      const targetClass = (target.className && typeof target.className === 'string') ? target.className : '';
      const isLeft = targetClass.includes('gantt-handle-left');
      const isRight = targetClass.includes('gantt-handle-right');
      const mode = isLeft ? 'resize-left' : (isRight ? 'resize-right' : 'move');

      const startX = e.clientX || 0;
      const origLeftPx = parseFloat(bar.style.left) || 0;
      const origWidthPx = parseFloat(bar.style.width) || (origDur * pxPerDay);

      let currentDayDelta = 0;
      let finalStartDateStr = origStartStr;
      let finalDur = origDur;
      let wasBlockedByPred = false;
      let movedCursor = false;

      isDraggingGanttBar = true;
      closeCalendarioDatePickerPopover();
      hideCursorBarLens();

      if (document.body && document.body.style) {
        document.body.style.userSelect = 'none';
        document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
      }

      if (bar.classList && bar.classList.add) {
        if (mode === 'move') {
          bar.classList.add('ring-2', 'ring-white', 'shadow-2xl', 'opacity-90');
        } else {
          bar.classList.add('ring-2', 'ring-amber-400', 'shadow-2xl');
        }
      }

      if (tooltip && tooltip.classList) {
        tooltip.classList.remove('hidden');
      }

      function onMouseMove(ev) {
        const dx = (ev.clientX || 0) - startX;
        if (Math.abs(dx) >= 3) movedCursor = true;
        const dayDelta = Math.round(dx / pxPerDay);
        currentDayDelta = dayDelta;

        if (mode === 'move') {
          let newStart = addDays(origStartDate, dayDelta);
          let effectiveDelta = dayDelta;
          wasBlockedByPred = false;

          if (minStartStr) {
            const minStartDt = parseDate(minStartStr);
            if (diffDays(minStartDt, newStart) < 0) {
              newStart = minStartDt;
              effectiveDelta = diffDays(origStartDate, minStartDt);
              wasBlockedByPred = true;
            }
          }

          const newEnd = addDays(newStart, origDur - 1);
          finalStartDateStr = formatDate(newStart);
          finalDur = origDur;

          bar.style.left = `${origLeftPx + (effectiveDelta * pxPerDay)}px`;
          updateTooltip(ev.clientX, ev.clientY, wasBlockedByPred ? `
            <div class="font-bold text-amber-300 flex items-center gap-1.5">
              <i class="fa-solid fa-lock text-[10px]"></i> Inicio Bloqueado: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-amber-200">
              Debe terminar primero <strong>${predClavesStr || 'predecesora'}</strong> (mín. ${minStartStr})
            </div>
          ` : `
            <div class="font-bold text-blue-300 flex items-center gap-1.5">
              <i class="fa-solid fa-arrows-left-right text-[10px]"></i> Mover Período: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-slate-300">
              ${finalStartDateStr} <span class="text-slate-500">→</span> ${formatDate(newEnd)} <span class="text-amber-400 font-bold">(${origDur}d)</span>
            </div>
          `);
        } else if (mode === 'resize-right') {
          // Duración mínima estricta de 3 días
          const newDur = Math.max(3, origDur + dayDelta);
          finalStartDateStr = origStartStr;
          finalDur = newDur;
          const newEnd = addDays(origStartDate, newDur - 1);

          bar.style.width = `${newDur * pxPerDay}px`;
          updateTooltip(ev.clientX, ev.clientY, `
            <div class="font-bold text-amber-300 flex items-center gap-1.5">
              <i class="fa-solid fa-up-right-and-down-left-from-center text-[10px]"></i> Duración: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-slate-300">
              ${origStartStr} <span class="text-slate-500">→</span> ${formatDate(newEnd)} <span class="text-amber-400 font-bold">(${newDur} días)</span>
            </div>
          `);
        } else if (mode === 'resize-left') {
          // Cambiar inicio por extremo izquierdo (duración mínima >= 3 días y respetando predecesoras)
          const maxLeftDelta = origDur - 3;
          let cappedDelta = Math.min(dayDelta, maxLeftDelta);
          wasBlockedByPred = false;

          if (minStartStr) {
            const minAllowedDelta = diffDays(origStartDate, parseDate(minStartStr));
            if (cappedDelta < minAllowedDelta) {
              cappedDelta = minAllowedDelta;
              wasBlockedByPred = true;
            }
          }

          const newStart = addDays(origStartDate, cappedDelta);
          const newDur = Math.max(3, origDur - cappedDelta);
          finalStartDateStr = formatDate(newStart);
          finalDur = newDur;
          const newEnd = addDays(newStart, newDur - 1);

          bar.style.left = `${origLeftPx + (cappedDelta * pxPerDay)}px`;
          bar.style.width = `${newDur * pxPerDay}px`;
          updateTooltip(ev.clientX, ev.clientY, wasBlockedByPred ? `
            <div class="font-bold text-amber-300 flex items-center gap-1.5">
              <i class="fa-solid fa-lock text-[10px]"></i> Inicio Bloqueado: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-amber-200">
              Depende de terminar <strong>${predClavesStr || 'predecesora'}</strong> (${minStartStr})
            </div>
          ` : `
            <div class="font-bold text-emerald-300 flex items-center gap-1.5">
              <i class="fa-solid fa-calendar-day text-[10px]"></i> Inicio: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-slate-300">
              ${finalStartDateStr} <span class="text-slate-500">→</span> ${formatDate(newEnd)} <span class="text-emerald-400 font-bold">(${newDur} días)</span>
            </div>
          `);
        }
      }

      function onMouseUp() {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }

        isDraggingGanttBar = false;
        if (movedCursor) {
          barDraggedRecently = true;
          setTimeout(() => { barDraggedRecently = false; }, 120);
        }

        if (document.body && document.body.style) {
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
        }

        if (bar.classList && bar.classList.remove) {
          bar.classList.remove('ring-2', 'ring-white', 'ring-amber-400', 'shadow-2xl', 'opacity-90');
        }

        if (tooltip && tooltip.classList) {
          tooltip.classList.add('hidden');
        }

        if (wasBlockedByPred && finalStartDateStr === origStartStr && finalDur === origDur) {
          showToast(`🔒 ${clave} no puede iniciar antes de ${minStartStr} (depende de ${predClavesStr || 'su predecesora'}).`, 'error');
          renderCalendarioObra();
          return;
        }

        if (currentDayDelta !== 0 || finalDur !== origDur || finalStartDateStr !== origStartStr) {
          selectedCalendarioRowId = String(conceptId);
          const res = updateConceptDatesInModel(conceptId, finalStartDateStr, finalDur);
          if (res && res.cascadedCount > 0) {
            showToast(`Concepto ${clave} actualizado (${finalDur}d) • ${res.cascadedCount} dependiente(s) recorridos en cascada.`);
          } else {
            showToast(`Concepto ${clave} actualizado: ${finalStartDateStr} (${finalDur} días)`);
          }
          renderCalendarioObra();
        }
      }

      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      }
    };

    // Soporte táctil (Touch)
    bar.ontouchstart = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      const startX = touch.clientX;
      const conceptId = bar.getAttribute('data-concept-id');
      const origStartStr = bar.getAttribute('data-start-date');
      const origDur = Math.max(3, parseInt(bar.getAttribute('data-duration'), 10) || 3);
      const clave = bar.getAttribute('data-clave') || 'CONC';
      const origStartDate = parseDate(origStartStr);
      const origLeftPx = parseFloat(bar.style.left) || 0;

      let currentDayDelta = 0;
      let finalStartDateStr = origStartStr;
      let finalDur = origDur;

      function onTouchMove(ev) {
        if (!ev.touches || ev.touches.length === 0) return;
        const dx = ev.touches[0].clientX - startX;
        const dayDelta = Math.round(dx / pxPerDay);
        currentDayDelta = dayDelta;
        const newStart = addDays(origStartDate, dayDelta);
        finalStartDateStr = formatDate(newStart);
        finalDur = origDur;
        bar.style.left = `${origLeftPx + (dayDelta * pxPerDay)}px`;
      }

      function onTouchEnd() {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
        }
        if (currentDayDelta !== 0) {
          updateConceptDatesInModel(conceptId, finalStartDateStr, finalDur);
          showToast(`Concepto ${clave} actualizado: ${finalStartDateStr} (${finalDur} días)`);
          renderCalendarioObra();
        }
      }

      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
      }
    };
  });
}

// ==========================================
// BARRA DE DESPLAZAMIENTO Y ZOOM ESTILO ADOBE PREMIERE PRO
// ==========================================

export function updatePremiereZoomBarUI() {
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  const track = document.getElementById('gantt-premiere-track');
  const thumb = document.getElementById('gantt-premiere-thumb');
  if (!timelinePanel || !track || !thumb || !thumb.style) return;

  const trackW = track.clientWidth;
  const scrollW = timelinePanel.scrollWidth;
  const clientW = timelinePanel.clientWidth;
  const scrollL = timelinePanel.scrollLeft;

  if (trackW <= 0 || scrollW <= 0) return;

  // Proporción de contenido visible en el viewport
  const visibleRatio = Math.min(1, clientW / scrollW);
  const thumbW = Math.max(34, Math.min(trackW, Math.round(trackW * visibleRatio)));

  const maxScroll = Math.max(1, scrollW - clientW);
  const maxThumbL = Math.max(0, trackW - thumbW);

  const scrollRatio = maxScroll > 0 ? Math.max(0, Math.min(1, scrollL / maxScroll)) : 0;
  const thumbL = Math.round(scrollRatio * maxThumbL);

  thumb.style.width = `${thumbW}px`;
  thumb.style.left = `${thumbL}px`;
}

export function initPremiereZoomBar() {
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  const track = document.getElementById('gantt-premiere-track');
  const thumb = document.getElementById('gantt-premiere-thumb');
  if (!timelinePanel || !track || !thumb) return;

  // Actualizar tamaño y posición inicial del thumb (el listener onscroll se administra en syncGanttScroll)
  updatePremiereZoomBarUI();

  if (typeof window !== 'undefined' && window.addEventListener && !isPremiereResizeListenerAttached) {
    isPremiereResizeListenerAttached = true;
    window.addEventListener('resize', updatePremiereZoomBarUI);
  }

  // Soporte Alt+Rueda o Ctrl+Rueda estilo Premiere Pro para hacer zoom
  timelinePanel.onwheel = (e) => {
    if (e.altKey || e.ctrlKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 4 : -4;
      const cfg = getScheduleSettings();
      const currentDayWidth = cfg.dayWidth || 34;
      const newDayWidth = Math.max(2, Math.min(120, currentDayWidth + zoomDelta));
      if (newDayWidth !== currentDayWidth) {
        saveScheduleSettings({ dayWidth: newDayWidth });
        renderCalendarioObra();
      }
    }
  };

  // Tooltip flotante para el zoom estilo Premiere Pro
  let zoomTooltip = typeof document !== 'undefined' ? document.getElementById('gantt-premiere-zoom-tooltip') : null;
  if (!zoomTooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    zoomTooltip = document.createElement('div');
    zoomTooltip.id = 'gantt-premiere-zoom-tooltip';
    zoomTooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-[11px] px-2.5 py-1 rounded-lg border border-blue-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(zoomTooltip);
  }

  function showZoomTip(x, y, text) {
    if (!zoomTooltip || !zoomTooltip.style) return;
    zoomTooltip.innerHTML = text;
    zoomTooltip.style.left = `${x + 12}px`;
    zoomTooltip.style.top = `${y - 36}px`;
    zoomTooltip.classList.remove('hidden');
  }

  function hideZoomTip() {
    if (zoomTooltip && zoomTooltip.classList) {
      zoomTooltip.classList.add('hidden');
    }
  }

  // Control de arrastre del thumb (desplazar) y de las manijas laterales (zoom)
  thumb.onmousedown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const target = e.target || thumb;
    const targetId = target.id || '';
    const isLeftHandle = targetId === 'gantt-premiere-handle-left' || (target.closest && target.closest('#gantt-premiere-handle-left'));
    const isRightHandle = targetId === 'gantt-premiere-handle-right' || (target.closest && target.closest('#gantt-premiere-handle-right'));

    const mode = isLeftHandle ? 'zoom-left' : (isRightHandle ? 'zoom-right' : 'pan');

    const startX = e.clientX || 0;
    const trackW = track.clientWidth || 600;
    const startThumbL = parseFloat(thumb.style.left) || 0;
    const startThumbW = thumb.offsetWidth || 100;
    const scrollW = timelinePanel.scrollWidth || 1200;
    const clientW = timelinePanel.clientWidth || 800;

    const cfg = getScheduleSettings();
    const startDayWidth = cfg.dayWidth || 34;

    let targetDayWidth = startDayWidth;
    let hasChangedZoom = false;

    if (document.body && document.body.style) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = mode === 'pan' ? 'grabbing' : 'ew-resize';
    }

    if (mode === 'pan') {
      thumb.classList.add('ring-2', 'ring-blue-400');
    }

    function onMouseMove(ev) {
      const dx = (ev.clientX || 0) - startX;

      if (mode === 'pan') {
        // Desplazamiento horizontal directo del thumb y del timeline
        const maxThumbL = Math.max(0, trackW - startThumbW);
        const newThumbL = Math.max(0, Math.min(maxThumbL, startThumbL + dx));
        thumb.style.left = `${newThumbL}px`;

        const ratio = maxThumbL > 0 ? newThumbL / maxThumbL : 0;
        const maxScroll = Math.max(0, scrollW - clientW);
        timelinePanel.scrollLeft = ratio * maxScroll;

        const pct = Math.round(ratio * 100);
        showZoomTip(ev.clientX, ev.clientY, `<i class="fa-solid fa-arrows-left-right text-blue-400"></i> Desplazamiento: <span class="font-bold text-white">${pct}%</span>`);

      } else if (mode === 'zoom-right') {
        // Arrastrar extremo derecho: cambiar tamaño del thumb -> ZOOM
        // Hacia adentro (dx < 0) reduce el thumb -> ZOOM IN
        // Hacia afuera (dx > 0) agranda el thumb -> ZOOM OUT
        const maxW = Math.max(34, trackW - startThumbL);
        const newThumbW = Math.max(34, Math.min(maxW, startThumbW + dx));
        thumb.style.width = `${newThumbW}px`;

        const ratio = Math.max(0.1, newThumbW / startThumbW);
        targetDayWidth = Math.max(2, Math.min(120, Math.round(startDayWidth / ratio)));
        hasChangedZoom = (targetDayWidth !== startDayWidth);

        const zoomPct = Math.round((targetDayWidth / 34) * 100);
        showZoomTip(ev.clientX, ev.clientY, `<i class="fa-solid fa-magnifying-glass text-blue-400"></i> Zoom: <span class="font-bold text-white">${zoomPct}%</span> (${targetDayWidth}px/día)`);

      } else if (mode === 'zoom-left') {
        // Arrastrar extremo izquierdo: cambiar posición y tamaño -> ZOOM
        // Hacia adentro (dx > 0) reduce el thumb -> ZOOM IN
        // Hacia afuera (dx < 0) agranda el thumb -> ZOOM OUT
        const maxL = startThumbL + startThumbW - 34;
        const newThumbL = Math.max(0, Math.min(maxL, startThumbL + dx));
        const newThumbW = Math.max(34, startThumbW - (newThumbL - startThumbL));
        thumb.style.left = `${newThumbL}px`;
        thumb.style.width = `${newThumbW}px`;

        const ratio = Math.max(0.1, newThumbW / startThumbW);
        targetDayWidth = Math.max(2, Math.min(120, Math.round(startDayWidth / ratio)));
        hasChangedZoom = (targetDayWidth !== startDayWidth);

        const zoomPct = Math.round((targetDayWidth / 34) * 100);
        showZoomTip(ev.clientX, ev.clientY, `<i class="fa-solid fa-magnifying-glass text-blue-400"></i> Zoom: <span class="font-bold text-white">${zoomPct}%</span> (${targetDayWidth}px/día)`);
      }
    }

    function onMouseUp() {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      if (document.body && document.body.style) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      thumb.classList.remove('ring-2', 'ring-blue-400');
      hideZoomTip();

      if (hasChangedZoom && targetDayWidth !== startDayWidth) {
        saveScheduleSettings({ dayWidth: targetDayWidth });
        renderCalendarioObra();
      } else {
        updatePremiereZoomBarUI();
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };

  // Clic directo en la pista (Track): Centrar la vista en el punto cliqueado
  track.onclick = (e) => {
    if (e.target === thumb || (thumb.contains && thumb.contains(e.target))) return;

    const rect = track.getBoundingClientRect ? track.getBoundingClientRect() : { left: 0 };
    const clickX = (e.clientX || 0) - (rect.left || 0);
    const trackW = track.clientWidth || 600;
    const thumbW = thumb.offsetWidth || 100;

    const maxThumbL = Math.max(0, trackW - thumbW);
    const targetThumbL = Math.max(0, Math.min(maxThumbL, clickX - (thumbW / 2)));

    const ratio = maxThumbL > 0 ? targetThumbL / maxThumbL : 0;
    const maxScroll = Math.max(0, timelinePanel.scrollWidth - timelinePanel.clientWidth);
    timelinePanel.scrollLeft = ratio * maxScroll;
    updatePremiereZoomBarUI();
  };
}

// Desplazamiento por pasos suaves (botones ◀ y ▶)
export function scrollGanttTimelineStep(direction) {
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  if (!timelinePanel) return;
  const step = (direction || 1) * Math.max(80, Math.round(timelinePanel.clientWidth * 0.2));
  timelinePanel.scrollLeft += step;
  updatePremiereZoomBarUI();
}

// Ajustar escala para ver toda la obra en pantalla (Fit Timeline)
export function fitGanttTimelineEntireProject() {
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  if (!timelinePanel) return;

  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems(state.treeData);
  let minDate = null;
  let maxDate = null;
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || getProjectCreationDate());
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const scaleData = generateGanttTimeScale(minDate, maxDate, cfg.scale, 34);
  const totalDays = Math.max(1, diffDays(scaleData.timelineStart, scaleData.timelineEnd) + 1);
  const availableWidth = Math.max(320, (timelinePanel.clientWidth || 720) - 8);
  const targetPxPerDay = availableWidth / totalDays;

  let fittedDayWidth;
  if (cfg.scale === 'dias') {
    fittedDayWidth = Math.max(2, Math.min(92, Number(targetPxPerDay.toFixed(2))));
  } else if (cfg.scale === 'semanas') {
    fittedDayWidth = Math.max(2.5, Math.min(92, Number((targetPxPerDay / 0.45).toFixed(2))));
  } else {
    fittedDayWidth = Math.max(6, Math.min(92, Number((targetPxPerDay / 0.16).toFixed(2))));
  }

  saveScheduleSettings({ dayWidth: fittedDayWidth });
  showToast(`Escala ajustada a la pantalla: ${Math.round((fittedDayWidth / 34) * 100)}% (${Math.round(targetPxPerDay * 10) / 10}px/d)`);
  renderCalendarioObra();
  const nextPanel = document.getElementById('gantt-timeline-panel');
  if (nextPanel) nextPanel.scrollLeft = 0;
  updatePremiereZoomBarUI();
}

// ==========================================
// LUPA FLOTANTE AL PASAR SOBRE BARRAS ALEJADAS O COMPACTAS + HOVER SINCRONIZADO
// ==========================================
function hideCursorBarLens() {
  if (typeof document === 'undefined') return;
  const win = document.getElementById('gantt-cursor-zoom-window');
  if (win && win.classList) win.classList.add('hidden');
}

function positionCursorBarLens(clientX, clientY) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const win = document.getElementById('gantt-cursor-zoom-window');
  if (!win) return;
  const wasHidden = win.classList.contains('hidden');
  win.classList.remove('hidden');
  if (wasHidden) {
    win.classList.remove('zoom-pop-in');
    void win.offsetWidth;
    win.classList.add('zoom-pop-in');
  }
  const r = win.getBoundingClientRect();
  const pad = 12;
  let left = clientX + 18;
  let top = clientY - Math.round(r.height / 2);
  if (left + r.width > window.innerWidth - pad) left = clientX - r.width - 18;
  if (left < pad) left = pad;
  if (top + r.height > window.innerHeight - pad) top = window.innerHeight - r.height - pad;
  if (top < pad) top = pad;
  win.style.left = `${left}px`;
  win.style.top = `${top}px`;
}

function ensureCursorBarLensContainer() {
  if (typeof document === 'undefined') return null;
  let win = document.getElementById('gantt-cursor-zoom-window');
  if (!win && document.createElement && document.body) {
    win = document.createElement('div');
    win.id = 'gantt-cursor-zoom-window';
    win.className = 'hidden fixed z-50 w-[460px] max-w-[92vw] bg-white/95 backdrop-blur-md border-2 border-blue-500 rounded-xl shadow-2xl overflow-hidden pointer-events-none select-none zoom-pop-in';
    win.innerHTML = '<div id="gantt-cursor-zoom-inner"></div>';
    document.body.appendChild(win);
  }
  return win;
}

function renderCursorBarLens(item, itemById, succMap, currencySymbol, showCpm) {
  const win = ensureCursorBarLensContainer();
  const inner = win && win.querySelector('#gantt-cursor-zoom-inner');
  if (!inner || !item) return;

  if (item.isParent) {
    inner.innerHTML = `
      <div class="bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between text-xs">
        <span class="font-mono font-bold text-blue-400">${escapeCalHtml(item.clave || 'PART')} · PARTIDA</span>
        <span class="font-mono text-slate-300">${escapeCalHtml(item.startDate)} → ${escapeCalHtml(item.endDate)} (${item.durationDays || 0}d)</span>
      </div>
      <div class="p-2.5 text-xs">
        <div class="font-extrabold uppercase text-slate-900">${escapeCalHtml(item.descripcion)}</div>
        <div class="text-slate-600 font-mono mt-1">Total partida: <strong class="text-emerald-700">${formatCurrency(item.totalImporte, currencySymbol)}</strong></div>
      </div>
    `;
    return;
  }

  const predEdges = normalizeScheduleLinks(item.predecessors);
  const preds = predEdges.map(lk => itemById.get(String(lk.id))).filter(Boolean);
  const succEdges = succMap.get(String(item.id)) || [];
  const succs = succEdges.map(edge => itemById.get(String(edge.id))).filter(Boolean);
  const predSet = new Set(preds.map(p => String(p.id)));
  const effectiveHex = (showCpm && item.isCritical) ? '#dc2626' : (item.customColor || item.color?.bar || '#3b82f6');

  const sliceItems = [...preds.slice(0, 2), item, ...succs.slice(0, 2)].filter(x => x && x.startDate && x.endDate);
  if (sliceItems.length === 0) return;

  let minDt = parseDate(sliceItems[0].startDate);
  let maxDt = parseDate(sliceItems[0].endDate);
  sliceItems.forEach(x => {
    const s = parseDate(x.startDate);
    const e = parseDate(x.endDate);
    if (s < minDt) minDt = s;
    if (e > maxDt) maxDt = e;
  });
  minDt = addDays(minDt, -3);
  maxDt = addDays(maxDt, 3);
  const spanDays = Math.max(18, diffDays(minDt, maxDt) + 1);
  const toPct = (offsetD) => Math.max(0, Math.min(100, (offsetD / spanDays) * 100));

  const miniRowH = 54;
  const trackStartPx = 8;
  const trackSpanPx = 418;
  const barCenterOffset = 42;
  const toSvgX = (pct) => trackStartPx + (pct / 100) * trackSpanPx;
  const idxById = new Map(sliceItems.map((si, idx) => [String(si.id), idx]));
  const mainIdx = idxById.get(String(item.id));
  const miniSvgLines = [];

  if (mainIdx !== undefined) {
    const mStartOff = Math.max(0, diffDays(minDt, parseDate(item.startDate)));
    const mDur = Math.max(3, item.durationDays || (diffDays(item.startDate, item.endDate) + 1));
    const mLP = toPct(mStartOff);
    const mWP = Math.max(8, toPct(mStartOff + mDur) - mLP);
    const mL = toSvgX(mLP);
    const mR = toSvgX(Math.min(100, mLP + mWP));
    const mY = mainIdx * miniRowH + barCenterOffset;

    predEdges.slice(0, 2).forEach(lk => {
      const pr = itemById.get(String(lk.id));
      const pi = pr ? idxById.get(String(pr.id)) : undefined;
      if (pi === undefined) return;
      const pStartOff = Math.max(0, diffDays(minDt, parseDate(pr.startDate)));
      const pDur = Math.max(3, pr.durationDays || (diffDays(pr.startDate, pr.endDate) + 1));
      const pLP = toPct(pStartOff);
      const pWP = Math.max(8, toPct(pStartOff + pDur) - pLP);
      const pL = toSvgX(pLP);
      const pR = toSvgX(Math.min(100, pLP + pWP));
      const pY = pi * miniRowH + barCenterOffset;
      const isCrit = showCpm && pr.isCritical && item.isCritical;
      if (lk.type === 'SS') {
        const leftX = Math.max(4, Math.min(pL, mL) - 8);
        const pathD = `M ${pL} ${pY} L ${leftX} ${pY} L ${leftX} ${mY} L ${mL} ${mY}`;
        miniSvgLines.push(`<path d="${pathD}" fill="none" stroke="${isCrit ? '#e11d48' : '#0284c7'}" stroke-width="1.4" stroke-dasharray="4 2" opacity="0.9" />`);
      } else {
        const midX = Math.max(pR + 4, Math.min(mL - 4, (pR + mL) / 2));
        const pathD = mL >= pR + 6
          ? `M ${pR} ${pY} L ${midX} ${pY} L ${midX} ${mY} L ${mL} ${mY}`
          : `M ${pR} ${pY} L ${pR + 6} ${pY} L ${pR + 6} ${(pY + mY) / 2} L ${Math.max(4, mL - 6)} ${(pY + mY) / 2} L ${Math.max(4, mL - 6)} ${mY} L ${mL} ${mY}`;
        miniSvgLines.push(`<path d="${pathD}" fill="none" stroke="${isCrit ? '#e11d48' : '#64748b'}" stroke-width="${isCrit ? '1.6' : '1.2'}" opacity="0.85" />`);
      }
    });

    succEdges.slice(0, 2).forEach(edge => {
      const sc = itemById.get(String(edge.id));
      const si = sc ? idxById.get(String(sc.id)) : undefined;
      if (si === undefined) return;
      const sStartOff = Math.max(0, diffDays(minDt, parseDate(sc.startDate)));
      const sLP = toPct(sStartOff);
      const sL = toSvgX(sLP);
      const sY = si * miniRowH + barCenterOffset;
      const isCrit = showCpm && item.isCritical && sc.isCritical;
      if (edge.type === 'SS') {
        const leftX = Math.max(4, Math.min(mL, sL) - 8);
        const pathD = `M ${mL} ${mY} L ${leftX} ${mY} L ${leftX} ${sY} L ${sL} ${sY}`;
        miniSvgLines.push(`<path d="${pathD}" fill="none" stroke="${isCrit ? '#e11d48' : '#0284c7'}" stroke-width="1.4" stroke-dasharray="4 2" opacity="0.9" />`);
      } else {
        const midX = Math.max(mR + 4, Math.min(sL - 4, (mR + sL) / 2));
        const pathD = sL >= mR + 6
          ? `M ${mR} ${mY} L ${midX} ${mY} L ${midX} ${sY} L ${sL} ${sY}`
          : `M ${mR} ${mY} L ${mR + 6} ${mY} L ${mR + 6} ${(mY + sY) / 2} L ${Math.max(4, sL - 6)} ${(mY + sY) / 2} L ${Math.max(4, sL - 6)} ${sY} L ${sL} ${sY}`;
        miniSvgLines.push(`<path d="${pathD}" fill="none" stroke="${isCrit ? '#e11d48' : '#64748b'}" stroke-width="${isCrit ? '1.6' : '1.2'}" opacity="0.85" />`);
      }
    });
  }

  inner.innerHTML = `
    <div class="bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between gap-2 border-b border-blue-500/40 text-xs">
      <div class="flex items-center gap-2 min-w-0">
        <span class="px-1.5 py-0.5 rounded font-mono font-bold text-[11px] text-white shrink-0" style="background-color:${effectiveHex};">${escapeCalHtml(item.clave)}</span>
        <span class="text-[11px] font-mono text-slate-300">📅 ${escapeCalHtml(item.startDate)} → ${escapeCalHtml(item.endDate)} (${item.durationDays || 3}d)</span>
      </div>
      ${showCpm ? `
        <span class="text-[10.5px] font-bold shrink-0 ${item.isCritical ? 'text-rose-400' : 'text-emerald-400'}">
          ${item.isCritical ? '🔥 Ruta Crítica' : `✓ +${item.slackDays || 0}d`}
        </span>
      ` : ''}
    </div>
    <div class="p-2.5 space-y-2 text-xs">
      <div class="font-bold text-slate-900 leading-snug text-[12px] whitespace-normal">${escapeCalHtml(item.descripcion)}</div>
      <div class="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div class="bg-slate-100 border-b border-slate-200 px-2 py-1 flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase">
          <span>🔍 Zoom de barra (sin mover el fondo)</span>
          <span class="font-mono text-blue-700">${formatDate(minDt)} al ${formatDate(maxDt)}</span>
        </div>
        <div class="relative divide-y divide-slate-100 text-[10px]">
          <svg width="434" height="${sliceItems.length * miniRowH}" viewBox="0 0 434 ${sliceItems.length * miniRowH}" class="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
            ${miniSvgLines.join('')}
          </svg>
          ${sliceItems.map(si => {
            const isMain = String(si.id) === String(item.id);
            const siHex = (showCpm && si.isCritical) ? '#dc2626' : (si.customColor || si.color?.bar || '#3b82f6');
            const siStartOff = Math.max(0, diffDays(minDt, parseDate(si.startDate)));
            const siDur = Math.max(3, si.durationDays || (diffDays(si.startDate, si.endDate) + 1));
            const leftP = toPct(siStartOff);
            const widthP = Math.max(8, toPct(siStartOff + siDur) - leftP);
            const tag = isMain ? 'ACTUAL' : (predSet.has(String(si.id)) ? 'PREDEC.' : 'SUCESORA');
            return `
              <div class="px-2 pt-1 pb-0.5 ${isMain ? 'bg-blue-50/75' : 'bg-white'} flex flex-col justify-between" style="height:${miniRowH}px;">
                <div class="relative z-20 flex items-start justify-between gap-2 min-w-0 h-[25px] overflow-hidden rounded px-0.5 ${isMain ? 'bg-blue-50/90' : 'bg-white/90'}">
                  <span class="font-sans leading-[12px] text-[10px] ${isMain ? 'font-bold text-slate-900' : 'text-slate-700'} whitespace-normal">
                    <span class="font-mono text-[8.5px] px-1 py-[1px] rounded ${isMain ? 'bg-blue-600 text-white font-bold' : 'bg-slate-200 text-slate-700 font-semibold'} mr-1">${tag}</span>
                    <strong>${escapeCalHtml(si.clave)}</strong> · ${escapeCalHtml(si.descripcion)}
                  </span>
                  <span class="font-mono font-bold shrink-0 text-[9.5px] text-slate-700 whitespace-nowrap">${siDur}d</span>
                </div>
                <div class="h-5 bg-slate-50/85 border border-slate-200/80 rounded relative flex items-center"
                     style="background-image: linear-gradient(to right, rgba(203, 213, 225, 0.45) 1px, transparent 1px); background-size: 25% 100%;">
                  <div class="h-4 rounded flex items-center justify-between px-1.5 text-white font-bold text-[9.5px] shadow-xs absolute z-20"
                       style="left:${leftP}%; width:${widthP}%; background-color:${siHex};">
                    <span class="truncate">${escapeCalHtml(si.clave)}</span>
                    <span class="font-mono ml-1 text-[9px]">${siDur}d</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="text-[10.5px] text-slate-500 text-center">Clic en la barra o fila para seleccionarla y ampliar su texto en la tabla</div>
    </div>
  `;
}

export function initGanttCursorBarLens() {
  if (typeof document === 'undefined' || !currentScheduleData?.items) return;
  const cfg = getScheduleSettings();
  const rowViewMode = cfg.rowViewMode || (cfg.justifyConcepts ? 'justified' : 'normal');
  const dayWidth = cfg.dayWidth || 34;
  const lensSettingOn = (cfg.cursorLensEnabled !== false);
  const showCpm = isAdvancedCalendarioAllowed() && (cfg.showCriticalPath !== false);
  const currencySymbol = state.settings?.currencySymbol || '$';

  // Calcular pxPerDay activo aproximado
  const scale = cfg.scale || 'dias';
  const pxPerDay = scale === 'dias' ? Math.max(1.5, dayWidth) : (scale === 'semanas' ? Math.max(1.5, dayWidth * 0.45) : Math.max(1.2, dayWidth * 0.16));
  const isLensActiveForScale = lensSettingOn && (dayWidth < 20 || pxPerDay < 18 || rowViewMode === 'compact');

  const allItems = currentScheduleData.items || [];
  const itemById = new Map(allItems.map(it => [String(it.id), it]));
  const succMap = new Map();
  allItems.forEach(it => {
    if (!it.isParent) succMap.set(String(it.id), []);
  });
  allItems.forEach(it => {
    if (it.isParent) return;
    normalizeScheduleLinks(it.predecessors).forEach(lk => {
      if (succMap.has(String(lk.id))) succMap.get(String(lk.id)).push({ id: String(it.id), type: lk.type, lag: lk.lag });
    });
  });

  const rowsPanel = document.getElementById('gantt-timeline-rows');
  if (rowsPanel) {
    rowsPanel.onmouseleave = () => hideCursorBarLens();
  }

  document.querySelectorAll('#view-calendario [data-gantt-left-row], #view-calendario [data-gantt-right-row]').forEach(el => {
    const isRight = el.hasAttribute('data-gantt-right-row');
    const rid = el.getAttribute(isRight ? 'data-gantt-right-row' : 'data-gantt-left-row');
    if (!rid) return;

    el.onmouseenter = (ev) => {
      document.querySelectorAll(`#view-calendario [data-gantt-left-row="${rid}"], #view-calendario [data-gantt-right-row="${rid}"]`)
        .forEach(x => x.classList.add('gantt-row-hover'));
      if (!isDraggingGanttBar && isRight && isLensActiveForScale) {
        const it = itemById.get(String(rid));
        if (it) {
          renderCursorBarLens(it, itemById, succMap, currencySymbol, showCpm);
          positionCursorBarLens(ev.clientX, ev.clientY);
        }
      }
    };
    el.onmousemove = (ev) => {
      if (!isDraggingGanttBar && isRight && isLensActiveForScale) {
        positionCursorBarLens(ev.clientX, ev.clientY);
      }
    };
    el.onmouseleave = () => {
      document.querySelectorAll(`#view-calendario [data-gantt-left-row="${rid}"], #view-calendario [data-gantt-right-row="${rid}"]`)
        .forEach(x => x.classList.remove('gantt-row-hover'));
    };
  });
}

// ------------------------------------------
// ARRASTRE INTERACTIVO DE LA LÍNEA DEL DÍA DE HOY / FECHA DE CORTE
// ------------------------------------------
export function initGanttTodayLineDrag() {
  const pin = document.getElementById('gantt-today-pin');
  const lineContainer = document.getElementById('gantt-today-line-container');
  if (!pin || !lineContainer) return;

  const cfg = getScheduleSettings();
  let minDate = null;
  let maxDate = null;
  const rawItems = extractScheduleItems(state.treeData);
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || getProjectCreationDate());
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const scaleData = generateGanttTimeScale(minDate, maxDate, cfg.scale, cfg.dayWidth);
  const pxPerDay = scaleData.pxPerDay || 34;

  let todayTooltip = typeof document !== 'undefined' ? document.getElementById('gantt-today-drag-tooltip') : null;
  if (!todayTooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    todayTooltip = document.createElement('div');
    todayTooltip.id = 'gantt-today-drag-tooltip';
    todayTooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-xs px-3 py-1.5 rounded-xl border border-rose-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(todayTooltip);
  }

  function updateTooltip(clientX, clientY, textHtml) {
    if (!todayTooltip || !todayTooltip.style) return;
    todayTooltip.innerHTML = textHtml;
    todayTooltip.style.left = `${clientX + 14}px`;
    todayTooltip.style.top = `${clientY - 42}px`;
    todayTooltip.classList.remove('hidden');
  }

  function hideTooltip() {
    if (todayTooltip && todayTooltip.classList) {
      todayTooltip.classList.add('hidden');
    }
  }

  pin.ondblclick = (e) => {
    if (e.stopPropagation) e.stopPropagation();
    resetGanttTodayDateAction();
  };

  pin.onmousedown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();

    const startX = e.clientX || 0;
    const startLeftPx = parseFloat(lineContainer.style.left) || 0;
    const currentTodayStr = getGanttTodayDate();
    const origTodayDate = parseDate(currentTodayStr);

    let currentDayDelta = 0;
    let finalDateStr = currentTodayStr;

    if (document.body && document.body.style) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }

    if (pin.classList && pin.classList.add) {
      pin.classList.add('ring-2', 'ring-rose-400', 'scale-110');
    }

    function onMouseMove(ev) {
      const dx = (ev.clientX || 0) - startX;
      const dayDelta = Math.round(dx / pxPerDay);
      currentDayDelta = dayDelta;

      const newDate = addDays(origTodayDate, dayDelta);
      finalDateStr = formatDate(newDate);

      lineContainer.style.left = `${startLeftPx + (dayDelta * pxPerDay)}px`;

      const realTodayStr = formatDate(new Date());
      const isRealToday = (finalDateStr === realTodayStr);
      const deltaFromReal = diffDays(realTodayStr, finalDateStr);

      let deltaText = '';
      if (isRealToday) {
        deltaText = '<span class="text-rose-400 font-bold">(Hoy real)</span>';
      } else if (deltaFromReal > 0) {
        deltaText = `<span class="text-amber-400 font-bold">(+${deltaFromReal} días al futuro)</span>`;
      } else {
        deltaText = `<span class="text-blue-400 font-bold">(${deltaFromReal} días al pasado)</span>`;
      }

      updateTooltip(ev.clientX, ev.clientY, `
        <div class="font-bold text-rose-300 flex items-center gap-1.5">
          <i class="fa-solid fa-location-crosshairs text-[10px]"></i> Fecha de Corte: <span class="text-white">${finalDateStr}</span>
        </div>
        <div class="text-[10px] mt-0.5 text-slate-300">
          ${deltaText}
        </div>
      `);
    }

    function onMouseUp() {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      if (document.body && document.body.style) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      if (pin.classList && pin.classList.remove) {
        pin.classList.remove('ring-2', 'ring-rose-400', 'scale-110');
      }
      hideTooltip();

      if (currentDayDelta !== 0 && finalDateStr !== currentTodayStr) {
        setGanttTodayDate(finalDateStr);
        showToast(`Fecha de corte actualizada: ${finalDateStr}`);
        renderCalendarioObra();
      } else {
        lineContainer.style.left = `${startLeftPx}px`;
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };
}


// ------------------------------------------
// ARRASTRE INTERACTIVO DE LÍNEA DE CORTE EN PROGRAMA FINANCIERO
// ------------------------------------------
export function initFinancialTodayLineDrag() {
  const pin = typeof document !== 'undefined' ? document.getElementById('financial-today-pin') : null;
  const lineContainer = typeof document !== 'undefined' ? document.getElementById('financial-today-line-container') : null;
  const tablePanel = typeof document !== 'undefined' ? document.getElementById('financial-table-panel') : null;
  if (!pin || !lineContainer || !tablePanel) return;

  const currentTodayStr = getGanttTodayDate();
  const origTodayDate = parseDate(currentTodayStr);

  // Intentar ajustar la posición inicial de forma exacta al encabezado correspondiente
  const thCols = (typeof document !== 'undefined' && document.querySelectorAll) ? Array.from(document.querySelectorAll('th[id^="fin-col-"]')) : [];
  if (thCols.length > 0) {
    for (let i = 0; i < thCols.length; i++) {
      const th = thCols[i];
      const s = parseDate(th.dataset.periodStart);
      const e = parseDate(th.dataset.periodEnd);
      if (origTodayDate >= s && origTodayDate <= e) {
        const daysInP = Math.max(1, diffDays(s, e));
        const frac = diffDays(s, origTodayDate) / daysInP;
        const leftPx = th.offsetLeft + Math.round(frac * th.offsetWidth);
        lineContainer.style.left = `${leftPx}px`;
        break;
      }
    }
  }

  let todayTooltip = typeof document !== 'undefined' ? document.getElementById('gantt-today-drag-tooltip') : null;
  if (!todayTooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    todayTooltip = document.createElement('div');
    todayTooltip.id = 'gantt-today-drag-tooltip';
    todayTooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-xs px-3 py-1.5 rounded-xl border border-rose-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(todayTooltip);
  }

  function updateTooltip(clientX, clientY, textHtml) {
    if (!todayTooltip || !todayTooltip.style) return;
    todayTooltip.innerHTML = textHtml;
    todayTooltip.style.left = `${clientX + 14}px`;
    todayTooltip.style.top = `${clientY - 42}px`;
    todayTooltip.classList.remove('hidden');
  }

  function hideTooltip() {
    if (todayTooltip && todayTooltip.classList) {
      todayTooltip.classList.add('hidden');
    }
  }

  pin.ondblclick = (e) => {
    if (e.stopPropagation) e.stopPropagation();
    resetGanttTodayDateAction();
  };

  pin.onmousedown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();

    const startX = e.clientX || 0;
    const startLeftPx = parseFloat(lineContainer.style.left) || 676;
    let currentDayDelta = 0;
    let finalDateStr = currentTodayStr;

    if (document.body && document.body.style) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }

    if (pin.classList && pin.classList.add) {
      pin.classList.add('ring-2', 'ring-rose-400', 'scale-110');
    }

    const cols = (typeof document !== 'undefined' && document.querySelectorAll) ? Array.from(document.querySelectorAll('th[id^="fin-col-"]')) : [];
    const firstCol = cols[0];
    const lastCol = cols[cols.length - 1];
    const avgColWidth = cols.length > 0 && lastCol && firstCol ? (lastCol.offsetLeft + lastCol.offsetWidth - firstCol.offsetLeft) / cols.length : 144;
    let avgDaysPerPeriod = 30;
    if (cols.length > 0 && firstCol) {
      const s = parseDate(firstCol.dataset.periodStart);
      const e = parseDate(firstCol.dataset.periodEnd);
      avgDaysPerPeriod = Math.max(1, diffDays(s, e) + 1);
    }
    const pxPerDay = Math.max(1, avgColWidth / avgDaysPerPeriod);

    function onMouseMove(ev) {
      const dx = (ev.clientX || 0) - startX;
      const targetLeft = startLeftPx + dx;
      const dayDelta = Math.round(dx / pxPerDay);
      currentDayDelta = dayDelta;

      const newDate = addDays(origTodayDate, dayDelta);
      finalDateStr = formatDate(newDate);

      lineContainer.style.left = `${targetLeft}px`;

      const realTodayStr = formatDate(new Date());
      const isRealToday = (finalDateStr === realTodayStr);
      const deltaFromReal = diffDays(realTodayStr, finalDateStr);

      let deltaText = '';
      if (isRealToday) {
        deltaText = '<span class="text-rose-400 font-bold">(Hoy real)</span>';
      } else if (deltaFromReal > 0) {
        deltaText = `<span class="text-amber-400 font-bold">(+${deltaFromReal} días al futuro)</span>`;
      } else {
        deltaText = `<span class="text-blue-400 font-bold">(${deltaFromReal} días al pasado)</span>`;
      }

      updateTooltip(ev.clientX, ev.clientY, `
        <div class="font-bold text-rose-300 flex items-center gap-1.5">
          <i class="fa-solid fa-location-crosshairs text-[10px]"></i> Programa Financiero Corte: <span class="text-white">${finalDateStr}</span>
        </div>
        <div class="text-[10px] mt-0.5 text-slate-300">
          ${deltaText}
        </div>
      `);
    }

    function onMouseUp() {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      if (document.body && document.body.style) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      if (pin.classList && pin.classList.remove) {
        pin.classList.remove('ring-2', 'ring-rose-400', 'scale-110');
      }
      hideTooltip();

      if (currentDayDelta !== 0 && finalDateStr !== currentTodayStr) {
        setGanttTodayDate(finalDateStr);
        showToast(`Fecha de corte actualizada: ${finalDateStr}`);
        renderCalendarioObra();
      } else {
        lineContainer.style.left = `${startLeftPx}px`;
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };
}

// ------------------------------------------
// ARRASTRE INTERACTIVO DE LÍNEA DE CORTE EN CURVA "S" Y FLUJO
// ------------------------------------------
export function initCurvaSTodayLineDrag() {
  const pin = typeof document !== 'undefined' ? document.getElementById('curva-s-today-pin') : null;
  const line = typeof document !== 'undefined' ? document.getElementById('curva-s-today-line') : null;
  const badge = typeof document !== 'undefined' ? document.getElementById('curva-s-today-badge') : null;
  const group = typeof document !== 'undefined' ? document.getElementById('curva-s-today-group') : null;
  const svgEl = pin && pin.closest ? pin.closest('svg') : (typeof document !== 'undefined' ? document.getElementById('curva-s-svg') : null);
  if (!pin || !line || !svgEl) return;

  const currentTodayStr = getGanttTodayDate();
  const origTodayDate = parseDate(currentTodayStr);

  const cfg = getScheduleSettings();
  let minDate = null;
  let maxDate = null;
  const rawItems = extractScheduleItems(state.treeData);
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || getProjectCreationDate());
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const periods = generateTimePeriods(rawItems, cfg.scale, minDate ? formatDate(minDate) : cfg.startDate);
  if (!periods || periods.length === 0) return;

  const pStart0 = periods[0].startDate;
  const pEndLast = periods[periods.length - 1].endDate;
  const totalDays = Math.max(1, diffDays(pStart0, pEndLast) + 1);

  const W = 960;
  const padX = 70;
  const padTop = 40;
  const padBottom = 100;
  const chartW = W - padX * 2;
  const chartH = 380 - padTop - padBottom; // 240px

  let todayTooltip = typeof document !== 'undefined' ? document.getElementById('gantt-today-drag-tooltip') : null;
  if (!todayTooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    todayTooltip = document.createElement('div');
    todayTooltip.id = 'gantt-today-drag-tooltip';
    todayTooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-xs px-3 py-1.5 rounded-xl border border-rose-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(todayTooltip);
  }

  function updateTooltip(clientX, clientY, textHtml) {
    if (!todayTooltip || !todayTooltip.style) return;
    todayTooltip.innerHTML = textHtml;
    todayTooltip.style.left = `${clientX + 14}px`;
    todayTooltip.style.top = `${clientY - 42}px`;
    todayTooltip.classList.remove('hidden');
  }

  function hideTooltip() {
    if (todayTooltip && todayTooltip.classList) {
      todayTooltip.classList.add('hidden');
    }
  }

  pin.ondblclick = (e) => {
    if (e.stopPropagation) e.stopPropagation();
    resetGanttTodayDateAction();
  };

  const handleStart = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();

    const initialLineX = parseFloat(line.getAttribute('x1')) || padX;
    let finalDateStr = currentTodayStr;
    let didMove = false;

    if (document.body && document.body.style) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }

    function onMouseMove(ev) {
      didMove = true;
      const rect = svgEl.getBoundingClientRect();
      const scaleX = W / (rect.width || W);
      const mouseSvgX = ((ev.clientX || 0) - rect.left) * scaleX;
      const clampedX = Math.max(padX, Math.min(padX + chartW, mouseSvgX));

      line.setAttribute('x1', clampedX.toFixed(1));
      line.setAttribute('x2', clampedX.toFixed(1));
      pin.setAttribute('transform', `translate(${clampedX.toFixed(1)}, ${padTop - 12})`);
      if (badge) {
        badge.setAttribute('transform', `translate(${clampedX.toFixed(1)}, ${padTop + chartH + 16})`);
      }

      const fraction = (clampedX - padX) / chartW;
      const daysOffset = Math.round(fraction * (totalDays - 1));
      const newDate = addDays(pStart0, daysOffset);
      finalDateStr = formatDate(newDate);

      if (badge) {
        const textEl = badge.querySelector('text');
        if (textEl) textEl.textContent = finalDateStr;
      }

      const realTodayStr = formatDate(new Date());
      const isRealToday = (finalDateStr === realTodayStr);
      const deltaFromReal = diffDays(realTodayStr, finalDateStr);

      let deltaText = '';
      if (isRealToday) {
        deltaText = '<span class="text-rose-400 font-bold">(Hoy real)</span>';
      } else if (deltaFromReal > 0) {
        deltaText = `<span class="text-amber-400 font-bold">(+${deltaFromReal} días al futuro)</span>`;
      } else {
        deltaText = `<span class="text-blue-400 font-bold">(${deltaFromReal} días al pasado)</span>`;
      }

      updateTooltip(ev.clientX, ev.clientY, `
        <div class="font-bold text-rose-300 flex items-center gap-1.5">
          <i class="fa-solid fa-location-crosshairs text-[10px]"></i> Curva "S" Corte: <span class="text-white">${finalDateStr}</span>
        </div>
        <div class="text-[10px] mt-0.5 text-slate-300">
          ${deltaText}
        </div>
      `);
    }

    function onMouseUp() {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      if (document.body && document.body.style) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      hideTooltip();

      if (didMove && finalDateStr !== currentTodayStr) {
        setGanttTodayDate(finalDateStr);
        showToast(`Fecha de corte actualizada: ${finalDateStr}`);
        renderCalendarioObra();
      } else {
        line.setAttribute('x1', initialLineX.toFixed(1));
        line.setAttribute('x2', initialLineX.toFixed(1));
        pin.setAttribute('transform', `translate(${initialLineX.toFixed(1)}, ${padTop - 12})`);
        if (badge) {
          badge.setAttribute('transform', `translate(${initialLineX.toFixed(1)}, ${padTop + chartH + 16})`);
          const textEl = badge.querySelector('text');
          if (textEl) textEl.textContent = currentTodayStr;
        }
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };

  pin.onmousedown = handleStart;
  if (group) group.onmousedown = handleStart;
}

// ============================================================
// MODAL DE JORNADA LABORAL Y DÍAS INHÁBILES (FESTIVOS, LLUVIAS, DESCANSO)
// ============================================================

let currentJornadaModalConfig = null;
let currentJornadaActiveTab = 'semanal';

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_LETTERS_ES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export function openCalendarioJornadaModal() {
  if (!guardTabUnlocked('calendario')) return;
  const modal = document.getElementById('modal-calendario-jornada');
  if (!modal) return;

  // Cargar configuración actual de jornada
  currentJornadaModalConfig = JSON.parse(JSON.stringify(getWorkdaysSettings()));
  currentJornadaActiveTab = 'semanal';

  // Info del proyecto
  const prjName = state.projectInfo?.nombre || state.projectName || 'Proyecto Principal';
  const prjNameEl = document.getElementById('modal-jornada-project-name');
  if (prjNameEl) prjNameEl.textContent = prjName;

  // Plazo del proyecto
  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems();
  let minDate = null;
  let maxDate = null;
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || getProjectCreationDate());
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);
  const totalDias = Math.max(1, diffDays(minDate, maxDate) + 1);

  const plazoEl = document.getElementById('modal-jornada-plazo-txt');
  if (plazoEl) {
    plazoEl.textContent = `${totalDias} días naturales (${formatDate(minDate)} al ${formatDate(maxDate)})`;
  }

  // Prellenar fecha de hoy o inicio en inputs
  const inputFestivo = document.getElementById('input-festivo-date');
  if (inputFestivo) inputFestivo.value = formatDate(minDate);
  const inputLluvia = document.getElementById('input-lluvia-date');
  if (inputLluvia) inputLluvia.value = formatDate(minDate);

  // Renderizar vistas
  renderCalendarioJornadaModal();

  // Abrir modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeCalendarioJornadaModal() {
  const modal = document.getElementById('modal-calendario-jornada');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export function switchCalendarioJornadaTab(tabName) {
  currentJornadaActiveTab = tabName;
  const tabs = ['semanal', 'festivos', 'lluvias'];

  tabs.forEach(t => {
    const btn = document.getElementById(`tab-jornada-${t}`);
    const view = document.getElementById(`view-jornada-${t}`);
    if (btn) {
      if (t === tabName) {
        btn.className = 'py-2.5 px-4 text-xs font-bold border-b-2 border-blue-600 text-blue-600 flex items-center gap-2 transition cursor-pointer';
      } else {
        btn.className = 'py-2.5 px-4 text-xs font-semibold border-b-2 border-transparent text-slate-600 hover:text-slate-900 flex items-center gap-2 transition cursor-pointer';
      }
    }
    if (view) {
      if (t === tabName) {
        view.classList.remove('hidden');
      } else {
        view.classList.add('hidden');
      }
    }
  });

  renderCalendarioJornadaModal();
}

export function renderCalendarioJornadaModal() {
  if (!currentJornadaModalConfig) {
    currentJornadaModalConfig = JSON.parse(JSON.stringify(getWorkdaysSettings()));
  }

  renderJornadaWeekdaysGrid();
  renderJornadaFestivosTable();
  renderJornadaLluviasTable();
  updateJornadaModalSummary();
}

export function renderJornadaWeekdaysGrid() {
  const grid = document.getElementById('jornada-weekdays-grid');
  if (!grid || !currentJornadaModalConfig) return;

  const nonWorking = currentJornadaModalConfig.nonWorkingDaysOfWeek || [];
  // Orden amigable: Lunes a Domingo (1, 2, 3, 4, 5, 6, 0)
  const displayOrder = [1, 2, 3, 4, 5, 6, 0];

  grid.innerHTML = displayOrder.map(dayNum => {
    const isNonWorking = nonWorking.includes(dayNum);
    const dayName = DAY_NAMES_ES[dayNum];
    const dayLetter = DAY_LETTERS_ES[dayNum];

    return `
      <div onclick="toggleNonWorkingDayOfWeek(${dayNum})"
           class="p-3 rounded-xl border-2 cursor-pointer transition select-none flex flex-col items-center justify-between text-center gap-1.5 shadow-2xs ${
             isNonWorking
               ? 'bg-amber-500/10 border-amber-500 text-amber-900 hover:bg-amber-500/20'
               : 'bg-emerald-500/10 border-emerald-500 text-emerald-900 hover:bg-emerald-500/20'
           }">
        <div class="flex items-center justify-between w-full">
          <span class="w-6 h-6 rounded-full text-xs font-mono font-black flex items-center justify-center ${
            isNonWorking ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
          }">${dayLetter}</span>
          <span class="text-[10px] font-bold ${isNonWorking ? 'text-amber-700' : 'text-emerald-700'}">
            ${isNonWorking ? '<i class="fa-solid fa-moon"></i> Descanso' : '<i class="fa-solid fa-briefcase"></i> Laboral'}
          </span>
        </div>
        <span class="font-bold text-xs text-slate-800 mt-1">${dayName}</span>
        <span class="text-[9.5px] font-semibold mt-0.5 px-2 py-0.5 rounded-full ${
          isNonWorking ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
        }">
          ${isNonWorking ? 'Inhábil' : 'Hábil'}
        </span>
      </div>
    `;
  }).join('');
}

export function toggleNonWorkingDayOfWeek(dayNum) {
  if (!currentJornadaModalConfig) return;
  const list = currentJornadaModalConfig.nonWorkingDaysOfWeek || [];
  const idx = list.indexOf(dayNum);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(dayNum);
  }
  currentJornadaModalConfig.nonWorkingDaysOfWeek = list;
  renderJornadaWeekdaysGrid();
  updateJornadaModalSummary();
}

export function setNonWorkingDaysPreset(preset) {
  if (!currentJornadaModalConfig) return;
  if (preset === 'l-s') {
    currentJornadaModalConfig.nonWorkingDaysOfWeek = [0]; // Descanso Domingo
    showToast('Ajustado: Lunes a Sábado laborables (Descanso Domingo)');
  } else if (preset === 'l-v') {
    currentJornadaModalConfig.nonWorkingDaysOfWeek = [0, 6]; // Descanso Sábado y Domingo
    showToast('Ajustado: Lunes a Viernes laborables (Descanso Sábado y Domingo)');
  } else if (preset === 'todos') {
    currentJornadaModalConfig.nonWorkingDaysOfWeek = []; // 7 días laborables
    showToast('Ajustado: Todos los días laborables (Sin descansos semanales)');
  }
  renderJornadaWeekdaysGrid();
  updateJornadaModalSummary();
}

export function renderJornadaFestivosTable() {
  const tbody = document.getElementById('jornada-festivos-table-body');
  const countBadge = document.getElementById('modal-jornada-festivos-count');
  if (!currentJornadaModalConfig) return;

  const festivos = currentJornadaModalConfig.festivos || [];
  if (countBadge) countBadge.textContent = String(festivos.length);
  if (!tbody) return;

  if (festivos.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-slate-400 italic">
          No hay días festivos registrados en este proyecto. Puedes agregarlos con el formulario superior o hacer clic en "Cargar Festivos México (LFT)".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = festivos.map((f, idx) => {
    const dt = parseDate(f.date);
    const dayName = DAY_NAMES_ES[dt.getDay()];
    const parts = f.date.split('-');
    const formatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : f.date;

    return `
      <tr class="hover:bg-purple-50/40 transition">
        <td class="py-2 px-3 font-mono font-bold text-slate-800">${formatted}</td>
        <td class="py-2 px-3 text-slate-600 font-medium">${dayName}</td>
        <td class="py-2 px-3 text-slate-800 font-semibold flex items-center gap-1.5">
          <i class="fa-solid fa-star text-purple-500 text-[10px]"></i>
          <span>${f.name || 'Día Festivo'}</span>
        </td>
        <td class="py-2 px-3 text-center">
          <button type="button" onclick="removeFestivoFromModal(${idx})" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 cursor-pointer transition" title="Eliminar festivo">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

export function addFestivoFromModal() {
  const dateInput = document.getElementById('input-festivo-date');
  const nameInput = document.getElementById('input-festivo-name');
  if (!dateInput || !currentJornadaModalConfig) return;

  const dateVal = dateInput.value;
  if (!dateVal) {
    showToast('Selecciona una fecha para el festivo', 'error');
    return;
  }

  const nameVal = (nameInput?.value || '').trim() || 'Día Festivo';

  const list = currentJornadaModalConfig.festivos || [];
  const existingIdx = list.findIndex(f => f.date === dateVal);
  if (existingIdx >= 0) {
    list[existingIdx].name = nameVal;
  } else {
    list.push({ date: dateVal, name: nameVal });
  }

  list.sort((a, b) => a.date.localeCompare(b.date));
  currentJornadaModalConfig.festivos = list;

  if (nameInput) nameInput.value = '';
  renderJornadaFestivosTable();
  updateJornadaModalSummary();
  showToast(`Festivo agregado: ${nameVal} (${dateVal})`);
}

export function removeFestivoFromModal(index) {
  if (!currentJornadaModalConfig || !currentJornadaModalConfig.festivos) return;
  const removed = currentJornadaModalConfig.festivos.splice(index, 1);
  renderJornadaFestivosTable();
  updateJornadaModalSummary();
  if (removed && removed[0]) {
    showToast(`Festivo eliminado: ${removed[0].name}`);
  }
}

export function loadMexicanHolidaysToModal() {
  if (!currentJornadaModalConfig) return;
  const cfg = getScheduleSettings();
  const year = parseInt(cfg.startDate?.slice(0, 4), 10) || 2026;
  const mexHolidays = getMexicanHolidaysForYear(year);

  const currentList = currentJornadaModalConfig.festivos || [];
  let addedCount = 0;

  mexHolidays.forEach(mh => {
    if (!currentList.some(f => f.date === mh.date)) {
      currentList.push(mh);
      addedCount++;
    }
  });

  currentList.sort((a, b) => a.date.localeCompare(b.date));
  currentJornadaModalConfig.festivos = currentList;

  renderJornadaFestivosTable();
  updateJornadaModalSummary();
  showToast(`Se cargaron ${addedCount} días festivos oficiales de México (${year})`);
}

export function renderJornadaLluviasTable() {
  const tbody = document.getElementById('jornada-lluvias-table-body');
  const countBadge = document.getElementById('modal-jornada-lluvias-count');
  if (!currentJornadaModalConfig) return;

  const lluvias = currentJornadaModalConfig.lluvias || [];
  if (countBadge) countBadge.textContent = String(lluvias.length);
  if (!tbody) return;

  if (lluvias.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-slate-400 italic">
          No hay suspensiones por lluvia registradas en este proyecto. Puedes registrarlas arriba con la fecha y el motivo de la bitácora.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lluvias.map((ll, idx) => {
    const dt = parseDate(ll.date);
    const dayName = DAY_NAMES_ES[dt.getDay()];
    const parts = ll.date.split('-');
    const formatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : ll.date;

    return `
      <tr class="hover:bg-sky-50/40 transition">
        <td class="py-2 px-3 font-mono font-bold text-slate-800">${formatted}</td>
        <td class="py-2 px-3 text-slate-600 font-medium">${dayName}</td>
        <td class="py-2 px-3 text-slate-800 font-semibold flex items-center gap-1.5">
          <i class="fa-solid fa-cloud-rain text-sky-500 text-[10px]"></i>
          <span>${ll.reason || ll.name || 'Suspensión por lluvia'}</span>
        </td>
        <td class="py-2 px-3 text-center">
          <button type="button" onclick="removeLluviaFromModal(${idx})" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 cursor-pointer transition" title="Eliminar registro de lluvia">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

export function addLluviaFromModal() {
  const dateInput = document.getElementById('input-lluvia-date');
  const reasonInput = document.getElementById('input-lluvia-reason');
  if (!dateInput || !currentJornadaModalConfig) return;

  const dateVal = dateInput.value;
  if (!dateVal) {
    showToast('Selecciona una fecha de lluvia', 'error');
    return;
  }

  const reasonVal = (reasonInput?.value || '').trim() || 'Suspensión por lluvia';

  const list = currentJornadaModalConfig.lluvias || [];
  const existingIdx = list.findIndex(l => l.date === dateVal);
  if (existingIdx >= 0) {
    list[existingIdx].reason = reasonVal;
  } else {
    list.push({ date: dateVal, reason: reasonVal });
  }

  list.sort((a, b) => a.date.localeCompare(b.date));
  currentJornadaModalConfig.lluvias = list;

  if (reasonInput) reasonInput.value = '';
  renderJornadaLluviasTable();
  updateJornadaModalSummary();
  showToast(`Día de lluvia registrado: ${dateVal}`);
}

export function removeLluviaFromModal(index) {
  if (!currentJornadaModalConfig || !currentJornadaModalConfig.lluvias) return;
  const removed = currentJornadaModalConfig.lluvias.splice(index, 1);
  renderJornadaLluviasTable();
  updateJornadaModalSummary();
  if (removed && removed[0]) {
    showToast(`Día de lluvia eliminado: ${removed[0].date}`);
  }
}

export function updateJornadaModalSummary() {
  if (!currentJornadaModalConfig) return;

  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems();
  let minDate = null;
  let maxDate = null;
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || getProjectCreationDate());
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const summary = calculateWorkdaysSummary(minDate, maxDate, currentJornadaModalConfig);

  const elNaturales = document.getElementById('modal-sum-dias-naturales');
  if (elNaturales) elNaturales.textContent = String(summary.totalNaturalDays);

  const elDescanso = document.getElementById('modal-sum-dias-descanso');
  if (elDescanso) elDescanso.textContent = String(summary.weeklyRestDays);

  const elFestivos = document.getElementById('modal-sum-dias-festivos');
  if (elFestivos) elFestivos.textContent = String(summary.festivosCount);

  const elLluvia = document.getElementById('modal-sum-dias-lluvia');
  if (elLluvia) elLluvia.textContent = String(summary.lluviasCount);

  const elHabiles = document.getElementById('modal-sum-dias-habiles');
  if (elHabiles) elHabiles.textContent = String(summary.workingDays);
}

export function saveCalendarioJornadaModal() {
  if (!currentJornadaModalConfig) return;
  saveScheduleUndoSnapshot('Cambio en días inhábiles');
  saveWorkdaysSettings(currentJornadaModalConfig);
  closeCalendarioJornadaModal();
  showToast('Jornada laboral y días inhábiles guardados correctamente');
  renderCalendarioObra();
}

// ============================================================
// CONTROLADORES DE RUTA CRÍTICA (CPM), DEPENDENCIAS FIN-A-INICIO Y PROPUESTA IA
// ============================================================

export function toggleCalendarioCriticalPath() {
  const cfg = getScheduleSettings();
  const nextVal = !(cfg.showCriticalPath !== false);
  saveScheduleSettings({ showCriticalPath: nextVal });
  showToast(
    nextVal
      ? '🔥 Ruta Crítica activada: resaltando en rojo los conceptos con holgura 0 días.'
      : 'Vista estándar de colores por partida restablecida.'
  );
  renderCalendarioObra();
}

export function toggleCalendarioLinkMode() {
  calendarioLinkClickMode = !calendarioLinkClickMode;
  pendingLinkPredecessorId = null;
  if (calendarioLinkClickMode) {
    showToast('🔗 Modo Vincular activo: haz clic en el concepto predecesor y luego en el dependiente.');
  }
  renderCalendarioObra();
}

export function handleCalendarioBarLinkClick(clickedConceptId, clickedClave = '') {
  if (!clickedConceptId) return;

  if (!pendingLinkPredecessorId) {
    pendingLinkPredecessorId = String(clickedConceptId);
    showToast(`1° Predecesora seleccionada: ${clickedClave || clickedConceptId}. Ahora haz clic en el concepto que dependerá de ella.`);
    renderCalendarioObra();
    return;
  }

  if (String(pendingLinkPredecessorId) === String(clickedConceptId)) {
    pendingLinkPredecessorId = null;
    showToast('Selección de predecesora cancelada.');
    renderCalendarioObra();
    return;
  }

  const predId = pendingLinkPredecessorId;
  pendingLinkPredecessorId = null;
  const res = toggleConceptPredecessorInModel(clickedConceptId, predId);
  if (!res || !res.ok) {
    showToast(res?.error || 'No se pudo vincular el concepto.', 'error');
    renderCalendarioObra();
    return;
  }

  if (res.action === 'removed') {
    showToast(`Enlace eliminado entre ${res.predClave} y ${res.targetClave}.`);
  } else {
    showToast(`✓ Enlace creado: ${res.targetClave} iniciará el ${res.startDate} vinculado a ${res.predClave}.`);
  }
  renderCalendarioObra();
}

export function undoCalendarioScheduleAction() {
  if (!guardTabUnlocked('calendario')) return;
  const snap = undoLastScheduleChange();
  if (!snap) {
    showToast('No hay cambios por deshacer en el calendario.', 'error');
    return;
  }
  showToast(`↩ Deshacer: ${snap.label || 'cronograma previo'}.`);
  renderCalendarioObra();
}

export function redoCalendarioScheduleAction() {
  if (!guardTabUnlocked('calendario')) return;
  const snap = redoLastScheduleChange();
  if (!snap) {
    showToast('No hay cambios por rehacer en el calendario.', 'error');
    return;
  }
  showToast(`↪ Rehacer: ${snap.label || 'cambio reaplicado'}.`);
  renderCalendarioObra();
}

export function onGanttPredecessorSelect(conceptId, selectedValue) {
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  if (selectedValue === '__MULTI__') {
    openConceptDependenciesModal(conceptId);
    renderCalendarioObra();
    return;
  }

  const nextPreds = selectedValue ? [String(selectedValue)] : [];
  const res = setConceptPredecessorsInModel(conceptId, nextPreds);
  if (!res || !res.ok) {
    showToast(res?.error || 'No se pudo asignar la predecesora.', 'error');
    renderCalendarioObra();
    return;
  }

  if (nextPreds.length === 0) {
    showToast(`Dependencias liberadas en ${res.clave} (inicio libre).`);
  } else {
    showToast(`✓ ${res.clave} ahora inicia al terminar su predecesora (${res.startDate}).`);
  }
  renderCalendarioObra();
}

export function clearAllCalendarioLinksAction() {
  if (!guardTabUnlocked('calendario')) return;
  clearAllScheduleDependenciesInModel();
  closeCalendarioAiModal();
  showToast('Se eliminaron todos los enlaces de dependencia (puedes usar Deshacer si lo requieres).');
  renderCalendarioObra();
}

// ------------------------------------------------------------
// MODAL DE MÚLTIPLES PREDECESORAS POR CONCEPTO
// ------------------------------------------------------------
function ensureModalContainer(modalId) {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById(modalId);
  const needsAppend = !el;
  if (!el && document.createElement) {
    el = document.createElement('div');
    el.id = modalId;
  }
  if (el && needsAppend && document.body && document.body.appendChild) {
    document.body.appendChild(el);
  }
  return el;
}

// ------------------------------------------------------------
// VENTANA INTERACTIVA DE CALENDARIO EN TABLA IZQUIERDA (POPOVER)
// ------------------------------------------------------------
export function closeCalendarioDatePickerPopover() {
  openDatePickerConceptId = null;
  lastDatePickerAnchorRect = null;
  if (typeof document === 'undefined') return;
  const pop = document.getElementById('calendario-date-picker-popover');
  if (pop) pop.classList.add('hidden');
  document.querySelectorAll('#view-calendario [data-pick-date]').forEach(el => {
    el.classList.remove('ring-2', 'ring-blue-500', 'border-blue-500');
  });
}

function positionCalendarioDatePicker(pop, anchorRect) {
  if (!pop || !anchorRect || typeof window === 'undefined') return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = pop.offsetWidth || 284;
  const h = pop.offsetHeight || 348;
  let left = anchorRect.left;
  if (left + w > vw - 12) left = Math.max(12, vw - w - 12);
  let top = anchorRect.bottom + 6;
  if (top + h > vh - 12) {
    const aboveTop = anchorRect.top - h - 6;
    top = aboveTop >= 12 ? aboveTop : Math.max(12, vh - h - 12);
  }
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function ensureCalendarioGlobalListeners() {
  if (isCalendarioGlobalListenersAttached || typeof document === 'undefined') return;
  isCalendarioGlobalListenersAttached = true;

  document.addEventListener('click', (ev) => {
    if (!openDatePickerConceptId) return;
    if (ev.target && ev.target.closest && (ev.target.closest('#calendario-date-picker-popover') || ev.target.closest('[data-pick-date]'))) return;
    closeCalendarioDatePickerPopover();
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (openDatePickerConceptId) closeCalendarioDatePickerPopover();
        if (currentDepModalConceptId) closeConceptDependenciesModal();
        hideCursorBarLens();
      }
    });
  }
}

function ensureDatePickerContainer() {
  if (typeof document === 'undefined') return null;
  let pop = document.getElementById('calendario-date-picker-popover');
  if (!pop && document.createElement && document.body) {
    pop = document.createElement('div');
    pop.id = 'calendario-date-picker-popover';
    pop.className = 'hidden fixed z-[60] w-[284px] bg-white border border-slate-300 rounded-xl shadow-2xl overflow-hidden text-xs select-none';
    pop.addEventListener('click', (ev) => ev.stopPropagation());
    document.body.appendChild(pop);
  }
  return pop;
}

export function openCalendarioDatePickerPopover(conceptId, triggerEl = null) {
  if (!guardTabUnlocked('calendario')) return;
  if (!canCurrentUserEditProject(getActiveProjectId())) {
    showToast('Solo lectura: no tienes permisos de edición en este proyecto.', 'error');
    return;
  }
  ensureCalendarioGlobalListeners();
  const cid = String(conceptId);
  if (openDatePickerConceptId === cid) {
    closeCalendarioDatePickerPopover();
    return;
  }

  closeConceptDependenciesModal();
  closeCalendarioDatePickerPopover();

  const items = currentScheduleData?.items || extractScheduleItems(state.treeData);
  const item = items.find(it => it.tipo === 'concepto' && String(it.id) === cid);
  if (!item) return;

  const anchorBtn = triggerEl || document.querySelector(`#view-calendario [data-pick-date="${cid}"]`);
  const anchorRect = anchorBtn && anchorBtn.getBoundingClientRect ? anchorBtn.getBoundingClientRect() : { left: 260, top: 220, bottom: 242 };
  const curDate = parseDate(item.startDate);
  openDatePickerConceptId = cid;
  datePickerViewYear = curDate.getFullYear();
  datePickerViewMonth = curDate.getMonth();
  lastDatePickerAnchorRect = anchorRect;
  if (anchorBtn && anchorBtn.classList) {
    anchorBtn.classList.add('ring-2', 'ring-blue-500', 'border-blue-500');
  }
  renderCalendarioDatePickerPopover(cid, anchorRect);
}

function renderCalendarioDatePickerPopover(conceptId, anchorRect) {
  const pop = ensureDatePickerContainer();
  const items = currentScheduleData?.items || extractScheduleItems(state.treeData);
  const concepts = items.filter(it => it.tipo === 'concepto');
  const byId = new Map(concepts.map(c => [String(c.id), c]));
  const item = byId.get(String(conceptId));
  if (!pop || !item) { closeCalendarioDatePickerPopover(); return; }

  const cfg = getScheduleSettings();
  const workdaysCfg = getWorkdaysSettings();
  const respectWorkdays = cfg.respectWorkdays !== false;
  const predLinks = normalizeScheduleLinks(item.predecessors);
  const hasLock = predLinks.length > 0 && Boolean(item.minAllowedStartDate);
  const predClaves = predLinks.map(lk => byId.get(String(lk.id))?.clave).filter(Boolean);
  const projectStartStr = cfg.startDate || getProjectCreationDate();
  const minAllowedStr = hasLock && item.minAllowedStartDate > projectStartStr ? item.minAllowedStartDate : projectStartStr;
  const todayStr = getGanttTodayDate();
  const curDur = Math.max(3, item.durationDays || 3);

  const firstOfMonth = new Date(datePickerViewYear, datePickerViewMonth, 1);
  const startDow = firstOfMonth.getDay();
  const gridStart = new Date(datePickerViewYear, datePickerViewMonth, 1 - startDow);

  const cellsHtml = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const iso = formatDate(d);
    const inMonth = (d.getMonth() === datePickerViewMonth);
    const isSelected = (iso === item.startDate);
    const isToday = (iso === todayStr);
    const isMinStart = (hasLock && iso === minAllowedStr);
    const isBlocked = (iso < minAllowedStr);
    const wInfo = getDateWorkdayInfo(d, workdaysCfg);
    const isNonWork = respectWorkdays && !wInfo.isWorkingDay;

    let cls = '';
    if (isSelected) cls = 'dp-selected';
    else if (isBlocked) cls = inMonth ? 'dp-blocked' : 'dp-blocked-out';
    else if (isToday) cls = 'dp-today';
    else if (isMinStart) cls = 'dp-min';
    else if (isNonWork && inMonth) cls = 'dp-nonworking';
    else if (inMonth) cls = 'dp-regular';
    else cls = 'dp-out';

    const titleParts = [iso];
    if (isSelected) titleParts.push('Inicio actual');
    if (isToday) titleParts.push('HOY');
    if (isMinStart) titleParts.push(`Mínimo por ${predClaves.join(', ')}`);
    if (isBlocked) titleParts.push(`Bloqueado (mínimo ${minAllowedStr})`);
    if (wInfo.isFestivo) titleParts.push(`Festivo: ${wInfo.festivoName}`);
    else if (wInfo.isLluvia) titleParts.push(`Lluvia: ${wInfo.lluviaReason}`);
    else if (wInfo.isNonWorkingDayOfWeek) titleParts.push('Día inhábil semanal');

    const dotHtml = !isSelected && isToday
      ? '<span style="width:4px;height:4px;border-radius:9999px;background:#f43f5e;margin-top:2px;"></span>'
      : (!isSelected && isMinStart ? '<span style="width:4px;height:4px;border-radius:9999px;background:#f59e0b;margin-top:2px;"></span>' : '');

    cellsHtml.push(`
      <button type="button" data-dp-day="${iso}" data-dp-blocked="${isBlocked ? '1' : '0'}"
              class="dp-day-btn ${cls}"
              title="${escapeCalHtml(titleParts.join(' · '))}">
        <span>${d.getDate()}</span>
        ${dotHtml}
      </button>
    `);
  }

  const canPickToday = (todayStr >= minAllowedStr);

  pop.innerHTML = `
    <div class="bg-slate-900 text-white px-3 py-2 flex items-start justify-between gap-2">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <i class="fa-regular fa-calendar text-blue-400 text-xs shrink-0"></i>
          <span class="font-mono font-bold text-blue-300 text-[11px]">${escapeCalHtml(item.clave)}</span>
          <span class="font-bold text-white text-xs">Fecha de inicio</span>
        </div>
        <div class="text-[10px] text-slate-300 truncate mt-0.5" title="${escapeCalHtml(item.descripcion)}">${escapeCalHtml(item.descripcion)}</div>
      </div>
      <button type="button" id="dp-btn-close-x"
              class="text-slate-400 hover:text-white w-6 h-6 rounded-md hover:bg-slate-800 flex items-center justify-center text-sm leading-none shrink-0 cursor-pointer"
              title="Cerrar calendario">✕</button>
    </div>

    <div class="px-2.5 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
      <button type="button" id="dp-prev-month" class="dp-nav-btn" title="Mes anterior">◀</button>
      <span class="font-bold text-slate-800 text-xs tracking-tight">${MONTH_NAMES_ES[datePickerViewMonth]} ${datePickerViewYear}</span>
      <button type="button" id="dp-next-month" class="dp-nav-btn" title="Mes siguiente">▶</button>
    </div>

    <div class="dp-grid-7 dp-grid-weekdays px-2.5 pt-2 pb-1 text-center text-[10px] font-bold bg-white">
      <span class="text-slate-400">Dom</span>
      <span class="text-slate-500">Lun</span>
      <span class="text-slate-500">Mar</span>
      <span class="text-slate-500">Mié</span>
      <span class="text-slate-500">Jue</span>
      <span class="text-slate-500">Vie</span>
      <span class="text-slate-400">Sáb</span>
    </div>

    <div class="dp-grid-7 dp-grid-days px-2.5 pb-2 bg-white">
      ${cellsHtml.join('')}
    </div>

    ${hasLock ? `
      <div class="px-2.5 py-1.5 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-2 text-[10px]">
        <span class="text-amber-900 font-medium truncate" title="Depende de ${escapeCalHtml(predClaves.join(', '))}">🔒 Mín. <strong class="font-mono">${minAllowedStr}</strong> (${escapeCalHtml(predClaves.join(', '))})</span>
        ${item.startDate !== minAllowedStr ? `
          <button type="button" id="dp-jump-min" class="shrink-0 px-1.5 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer transition">Al mín.</button>
        ` : '<span class="shrink-0 text-amber-700 font-semibold">En mín.</span>'}
      </div>
    ` : `
      <div class="px-2.5 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-[10px] text-slate-600">
        <span>Inicio: <strong class="font-mono text-blue-700">${escapeCalHtml(item.startDate)}</strong> → <strong class="font-mono text-slate-800">${escapeCalHtml(item.endDate)}</strong></span>
        <span class="font-mono font-bold text-slate-700">${curDur}d</span>
      </div>
    `}

    <div class="px-2.5 py-1.5 bg-white border-t border-slate-200 flex items-center justify-between gap-1.5">
      <div class="flex items-center gap-1">
        <button type="button" id="dp-btn-today"
                class="px-2 py-1 rounded border text-[10.5px] font-semibold transition ${canPickToday ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 cursor-pointer' : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'}"
                title="${canPickToday ? `Mover inicio a HOY (${todayStr})` : `HOY (${todayStr}) es anterior al mínimo (${minAllowedStr})`}">Hoy</button>
        <button type="button" id="dp-btn-predec"
                class="px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[10.5px] font-semibold cursor-pointer transition"
                title="Abrir Predecesoras de ${escapeCalHtml(item.clave)}">🔗 Predec.</button>
      </div>
      <button type="button" id="dp-btn-close"
              class="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[10.5px] font-semibold cursor-pointer transition">Cerrar</button>
    </div>
  `;

  pop.classList.remove('hidden');
  positionCalendarioDatePicker(pop, anchorRect);

  function applyPickedDate(iso) {
    if (hasLock && iso < minAllowedStr) {
      showToast(`🔒 ${item.clave} depende de ${predClaves.join(', ')}: mínimo ${minAllowedStr}.`, 'error');
      return;
    }
    selectedCalendarioRowId = String(conceptId);
    closeCalendarioDatePickerPopover();
    const res = updateConceptDatesInModel(conceptId, iso, curDur);
    if (res && res.clampedByPredecessor) {
      showToast(`🔒 Inicio ajustado a ${res.minAllowedDate} por dependencia.`, 'error');
    } else if (res && res.cascadedCount > 0) {
      showToast(`📅 ${item.clave} inicia ${res.startDate} • ${res.cascadedCount} dependiente(s) actualizados.`);
    } else {
      showToast(`📅 ${item.clave} programado para iniciar el ${res?.startDate || iso}.`);
    }
    renderCalendarioObra();
  }

  document.getElementById('dp-btn-close-x').onclick = closeCalendarioDatePickerPopover;
  document.getElementById('dp-btn-close').onclick = closeCalendarioDatePickerPopover;
  document.getElementById('dp-prev-month').onclick = () => {
    if (datePickerViewMonth === 0) { datePickerViewMonth = 11; datePickerViewYear -= 1; }
    else { datePickerViewMonth -= 1; }
    renderCalendarioDatePickerPopover(conceptId, lastDatePickerAnchorRect || anchorRect);
  };
  document.getElementById('dp-next-month').onclick = () => {
    if (datePickerViewMonth === 11) { datePickerViewMonth = 0; datePickerViewYear += 1; }
    else { datePickerViewMonth += 1; }
    renderCalendarioDatePickerPopover(conceptId, lastDatePickerAnchorRect || anchorRect);
  };
  pop.querySelectorAll('[data-dp-day]').forEach(dayBtn => {
    dayBtn.onclick = () => {
      const iso = dayBtn.getAttribute('data-dp-day');
      if (dayBtn.getAttribute('data-dp-blocked') === '1') {
        showToast(`🔒 Bloqueado: depende de terminar ${predClaves.join(', ')} (mínimo ${minAllowedStr}).`, 'error');
        return;
      }
      applyPickedDate(iso);
    };
  });
  const jumpMinBtn = document.getElementById('dp-jump-min');
  if (jumpMinBtn) {
    jumpMinBtn.onclick = () => applyPickedDate(minAllowedStr);
  }
  document.getElementById('dp-btn-today').onclick = () => {
    if (!canPickToday) {
      showToast(`🔒 HOY (${todayStr}) es anterior al mínimo (${minAllowedStr}).`, 'error');
      return;
    }
    applyPickedDate(todayStr);
  };
  document.getElementById('dp-btn-predec').onclick = () => {
    closeCalendarioDatePickerPopover();
    openConceptDependenciesModal(conceptId);
  };
}

// ------------------------------------------------------------
// MODAL DE PREDECESORAS Y TRASLAPES (FI / II / ±DÍAS / INVERTIR ORDEN)
// ------------------------------------------------------------
export function openConceptDependenciesModal(conceptId) {
  if (!guardTabUnlocked('calendario')) return;
  if (!canCurrentUserEditProject(getActiveProjectId())) {
    showToast('Solo lectura: no tienes permisos de edición en este proyecto.', 'error');
    return;
  }
  closeCalendarioDatePickerPopover();
  ensureCalendarioGlobalListeners();
  const modal = ensureModalContainer('modal-calendario-dependencias');
  if (!modal) return;

  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems(state.treeData);
  ensureInitialDates(rawItems, cfg.startDate);
  const concepts = rawItems.filter(it => it.tipo === 'concepto');
  const target = concepts.find(c => String(c.id) === String(conceptId));
  if (!target) return;

  currentDepModalConceptId = String(target.id);
  depModalDraftLinks = normalizeScheduleLinks(target.predecessors).map(lk => ({ ...lk }));
  depModalFilterPartida = 'all';
  depModalSearch = '';

  renderConceptDependenciesModalBody();
}

function renderConceptDependenciesModalBody() {
  const modal = document.getElementById('modal-calendario-dependencias');
  if (!modal || !currentDepModalConceptId) return;

  const cfg = getScheduleSettings();
  const respectWorkdays = cfg.respectWorkdays !== false;
  const workdaysCfg = getWorkdaysSettings();
  const projectStartStr = cfg.startDate || getProjectCreationDate();

  const rawItems = extractScheduleItems(state.treeData);
  ensureInitialDates(rawItems, projectStartStr);
  const rootPartidas = rawItems.filter(it => it.isParent && it.level === 1);
  const allConcepts = rawItems.filter(it => it.tipo === 'concepto');
  const byId = new Map(allConcepts.map(c => [String(c.id), c]));
  const conceptId = String(currentDepModalConceptId);
  const item = byId.get(conceptId);
  if (!item) { closeConceptDependenciesModal(); return; }

  const draftMap = new Map(depModalDraftLinks.map(lk => [String(lk.id), lk]));
  const candidateConcepts = allConcepts.filter(c => String(c.id) !== conceptId);

  let previewMinDt = null;
  depModalDraftLinks.forEach(lk => {
    const pc = byId.get(String(lk.id));
    if (pc) {
      const dt = computeLinkMinStartDate(pc, lk, {
        projectStartDateStr: projectStartStr,
        workdaysCfg,
        respectWorkdays
      });
      if (!previewMinDt || dt > previewMinDt) previewMinDt = dt;
    }
  });
  const previewStartStr = previewMinDt ? formatDate(previewMinDt) : (item.startDate || projectStartStr);

  const q = depModalSearch.trim().toLowerCase();
  const filteredConcepts = candidateConcepts.filter(c => {
    if (depModalFilterPartida === '__selected__' && !draftMap.has(String(c.id))) return false;
    if (depModalFilterPartida !== 'all' && depModalFilterPartida !== '__selected__' && c.parentPartidaName !== depModalFilterPartida) return false;
    if (q && !String(c.clave || '').toLowerCase().includes(q) && !String(c.descripcion || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const listElPrev = document.getElementById('dep-modal-checklist');
  const prevScroll = listElPrev ? listElPrev.scrollTop : 0;

  const pillBtnCls = (active) => active
    ? 'px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-600 text-white border border-blue-700 cursor-pointer transition shrink-0'
    : 'px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer transition shrink-0';

  const selectedChipsHtml = depModalDraftLinks.length === 0
    ? `<span class="text-[11px] text-slate-500 italic">Ninguna seleccionada — este concepto arranca libre en la fecha que indiques.</span>`
    : depModalDraftLinks.map(lk => {
        const pc = byId.get(String(lk.id));
        if (!pc) return '';
        const isSS = lk.type === 'SS';
        return `
          <button type="button" data-dep-remove-chip="${escapeCalHtml(pc.id)}"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border ${isSS ? 'border-sky-300 text-sky-800' : 'border-blue-300 text-blue-800'} hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-[10.5px] font-mono font-bold cursor-pointer transition shadow-2xs"
                  title="Quitar ${escapeCalHtml(pc.clave)}: ${escapeCalHtml(pc.descripcion)}">
            <span>${isSS ? '∥' : '🔗'} ${escapeCalHtml(formatScheduleLinkTag(lk, pc.clave))}</span>
            <span class="font-bold ml-0.5">×</span>
          </button>
        `;
      }).join('');

  const groupBuckets = rootPartidas.length > 0
    ? rootPartidas.map(p => ({
        title: `${p.clave || 'PART'} · ${p.descripcion}`,
        items: filteredConcepts.filter(c => c.parentPartidaName === p.descripcion)
      }))
    : [{ title: 'Conceptos del Presupuesto', items: filteredConcepts }];

  const matchedSet = new Set();
  groupBuckets.forEach(gb => gb.items.forEach(it => matchedSet.add(String(it.id))));
  const orphanItems = filteredConcepts.filter(c => !matchedSet.has(String(c.id)));
  if (orphanItems.length > 0) {
    groupBuckets.push({ title: 'Otros conceptos', items: orphanItems });
  }

  const groupedHtml = groupBuckets.map(bucket => {
    if (bucket.items.length === 0) return '';
    return `
      <div class="space-y-1">
        <div class="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 bg-slate-100/90 border border-slate-200/80 rounded-md sticky top-0 z-10 flex items-center justify-between">
          <span class="truncate">${escapeCalHtml(bucket.title)}</span>
          <span class="font-mono text-slate-500 ml-2 shrink-0">${bucket.items.length}</span>
        </div>
        <div class="space-y-1.5">
          ${bucket.items.map(c => {
            const draftLink = draftMap.get(String(c.id));
            const isChecked = Boolean(draftLink);
            const isDownstream = !isChecked && wouldCreateScheduleCycle(conceptId, c.id, allConcepts);
            const isDirectSuccessor = isDownstream && normalizeScheduleLinks(c.predecessors).some(x => String(x.id) === conceptId);
            return `
              <div class="rounded-lg border transition ${
                isDownstream
                  ? 'bg-slate-100/80 border-slate-200'
                  : (isChecked
                      ? 'bg-blue-50/90 border-blue-300 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50')
              }">
                <div data-dep-toggle-pred="${escapeCalHtml(c.id)}" data-blocked="${isDownstream ? '1' : '0'}"
                     class="w-full text-left px-3 py-2 flex items-start gap-2.5 ${isDownstream ? 'opacity-70' : 'cursor-pointer'}">
                  <span class="mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    isChecked
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-300 text-transparent'
                  }">
                    <i class="fa-solid fa-check text-[9px]"></i>
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center justify-between gap-1">
                      <span class="font-mono font-bold text-[11px] ${isChecked ? 'text-blue-800' : 'text-blue-700'}">${escapeCalHtml(c.clave)}</span>
                      <div class="flex items-center gap-1.5 flex-wrap">
                        ${isDownstream ? `
                          <span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9.5px] font-semibold">
                            Ya va después de ${escapeCalHtml(item.clave)}
                          </span>
                          ${isDirectSuccessor ? `
                            <button type="button" data-dep-invert-pred="${escapeCalHtml(c.id)}"
                                    class="px-1.5 py-0.5 rounded bg-white hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-300 text-[9.5px] font-bold cursor-pointer transition"
                                    title="Quitar que ${escapeCalHtml(c.clave)} dependa de ${escapeCalHtml(item.clave)} para poder invertir el orden">
                              ⇄ Invertir orden
                            </button>
                          ` : ''}
                        ` : ''}
                        <span class="font-mono text-[10px] text-slate-500">${escapeCalHtml((c.startDate || '').slice(5))} → <strong class="text-slate-700">${escapeCalHtml((c.endDate || '').slice(5))}</strong> (${c.durationDays || 3}d)</span>
                      </div>
                    </div>
                    <div class="text-slate-800 text-[11.5px] leading-snug whitespace-normal mt-0.5 ${isChecked ? 'font-medium text-slate-900' : ''}">${escapeCalHtml(c.descripcion)}</div>
                  </div>
                </div>
                ${isChecked ? `
                  <div class="px-3 pb-2 pt-1.5 ml-6 mr-2 border-t border-blue-200/70 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
                    <div class="inline-flex items-center bg-white rounded-md p-0.5 border border-blue-200">
                      <button type="button" data-dep-link-type="${escapeCalHtml(c.id)}:FS"
                              class="px-2 py-0.5 rounded font-semibold cursor-pointer transition ${draftLink.type === 'FS' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}">
                        Al terminar (FI)
                      </button>
                      <button type="button" data-dep-link-type="${escapeCalHtml(c.id)}:SS"
                              class="px-2 py-0.5 rounded font-semibold cursor-pointer transition ${draftLink.type === 'SS' ? 'bg-sky-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}"
                              title="Ambas trabajan en paralelo arrancando al mismo tiempo (+ desfase opcional)">
                        ∥ En paralelo (II)
                      </button>
                    </div>
                    <div class="inline-flex items-center gap-1">
                      <span class="text-slate-600 font-medium">${draftLink.type === 'SS' ? 'Desfase inicio:' : 'Traslape / espera:'}</span>
                      <button type="button" data-dep-link-lag="${escapeCalHtml(c.id)}:-1" class="w-5 h-5 rounded border border-slate-300 bg-white hover:bg-slate-100 font-mono font-bold cursor-pointer">-</button>
                      <span class="min-w-[40px] text-center font-mono font-bold ${draftLink.lag < 0 ? 'text-amber-700' : (draftLink.lag > 0 ? 'text-blue-700' : 'text-slate-700')}">${draftLink.lag > 0 ? `+${draftLink.lag}d` : `${draftLink.lag}d`}</span>
                      <button type="button" data-dep-link-lag="${escapeCalHtml(c.id)}:1" class="w-5 h-5 rounded border border-slate-300 bg-white hover:bg-slate-100 font-mono font-bold cursor-pointer">+</button>
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('') || '<div class="p-6 text-center text-slate-400 text-xs">No se encontraron conceptos con ese filtro.</div>';

  modal.className = 'fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4';
  modal.onclick = (e) => {
    if (e.target === modal) closeConceptDependenciesModal();
  };
  modal.innerHTML = `
    <div id="dep-modal-card" class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-xs">
      <!-- Cabecera oscura estilo Cubikar -->
      <div class="bg-slate-900 text-white px-4 py-3 flex items-start justify-between gap-3 shrink-0">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-blue-600 font-mono font-bold text-[11px] text-white">${escapeCalHtml(item.clave)}</span>
            <span class="text-sm font-bold text-white">Predecesoras y Traslapes (Programa de Obra)</span>
            <span class="text-[11px] font-mono text-slate-300">${escapeCalHtml(item.startDate)} → ${escapeCalHtml(item.endDate)} (${item.durationDays || 3}d)</span>
          </div>
          <p class="text-[11.5px] text-slate-200 leading-snug mt-1.5 whitespace-normal">${escapeCalHtml(item.descripcion)}</p>
        </div>
        <button type="button" onclick="closeConceptDependenciesModal()" class="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white text-base font-bold cursor-pointer shrink-0 flex items-center justify-center">×</button>
      </div>

      <!-- Cómo funciona + Resumen de seleccionadas y fecha resultante -->
      <div class="bg-blue-50/90 border-b border-blue-200 px-4 py-2.5 space-y-2 shrink-0">
        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-blue-950">
          <span>Elige <strong>1 o más</strong> conceptos y define si <strong>${escapeCalHtml(item.clave)}</strong> espera <strong>Al terminar (FI)</strong> o corre <strong>En paralelo (II)</strong>:</span>
          <span class="font-mono font-bold px-2 py-0.5 rounded bg-white border border-blue-200 text-blue-800">
            ${depModalDraftLinks.length > 0 ? `📅 Podrá iniciar desde: ${previewStartStr}` : '📅 Inicio libre'}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          ${selectedChipsHtml}
        </div>
      </div>

      <!-- Buscador blanco explícito + Filtros por Partida -->
      <div class="bg-white border-b border-slate-200 px-4 py-2.5 space-y-2 shrink-0">
        <div class="relative">
          <i class="fa-solid fa-magnifying-glass text-slate-400 text-xs absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"></i>
          <input id="dep-modal-search-input" type="text" value="${escapeCalHtml(depModalSearch)}"
                 placeholder="Buscar por clave o palabra en la descripción completa (ej. firme, cableado, muro...)"
                 style="background-color:#ffffff; color:#1e293b;"
                 class="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          ${depModalSearch ? '<button id="dep-modal-clear-search" type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 font-bold cursor-pointer">×</button>' : ''}
        </div>
        <div class="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-0.5">
          <button type="button" data-dep-part-filter="all" class="${pillBtnCls(depModalFilterPartida === 'all')}">Todas (${candidateConcepts.length})</button>
          ${rootPartidas.map(p => `<button type="button" data-dep-part-filter="${escapeCalHtml(p.descripcion)}" class="${pillBtnCls(depModalFilterPartida === p.descripcion)}" title="${escapeCalHtml(p.descripcion)}">${escapeCalHtml(p.clave || p.descripcion.slice(0, 14))}</button>`).join('')}
          <button type="button" data-dep-part-filter="__selected__" class="${pillBtnCls(depModalFilterPartida === '__selected__')}">✓ Elegidas (${depModalDraftLinks.length})</button>
        </div>
      </div>

      <!-- Checklist espacioso agrupado por Partida -->
      <div id="dep-modal-checklist" class="flex-1 overflow-y-auto custom-scroll p-3 space-y-3 bg-slate-50/60" style="min-height: 220px; max-height: 44vh;">
        ${groupedHtml}
      </div>

      <!-- Pie con acciones -->
      <div class="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
        <button type="button" onclick="clearConceptDependenciesFromModal()" class="text-[11px] font-semibold text-rose-700 hover:text-rose-800 hover:underline cursor-pointer">
          Dejar inicio libre (sin predecesoras)
        </button>
        <div class="flex items-center gap-2">
          <button type="button" onclick="closeConceptDependenciesModal()" class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition">
            Cancelar
          </button>
          <button type="button" onclick="saveConceptDependenciesModal()" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer transition">
            Guardar Enlaces (${depModalDraftLinks.length})
          </button>
        </div>
      </div>
    </div>
  `;

  const newListEl = document.getElementById('dep-modal-checklist');
  if (newListEl) newListEl.scrollTop = prevScroll;

  const cardEl = document.getElementById('dep-modal-card');
  if (cardEl) cardEl.onclick = (ev) => ev.stopPropagation();

  const searchInp = document.getElementById('dep-modal-search-input');
  if (searchInp) {
    searchInp.oninput = (ev) => {
      depModalSearch = ev.target.value;
      const pos = ev.target.selectionStart;
      renderConceptDependenciesModalBody();
      const nb = document.getElementById('dep-modal-search-input');
      if (nb) { nb.focus(); nb.setSelectionRange(pos, pos); }
    };
  }
  const clearBtn = document.getElementById('dep-modal-clear-search');
  if (clearBtn) {
    clearBtn.onclick = () => {
      depModalSearch = '';
      renderConceptDependenciesModalBody();
      document.getElementById('dep-modal-search-input')?.focus();
    };
  }

  modal.querySelectorAll('[data-dep-part-filter]').forEach(btn => {
    btn.onclick = () => {
      depModalFilterPartida = btn.getAttribute('data-dep-part-filter') || 'all';
      renderConceptDependenciesModalBody();
    };
  });
  modal.querySelectorAll('[data-dep-remove-chip]').forEach(btn => {
    btn.onclick = () => {
      const rid = String(btn.getAttribute('data-dep-remove-chip'));
      depModalDraftLinks = depModalDraftLinks.filter(x => String(x.id) !== rid);
      renderConceptDependenciesModalBody();
    };
  });
  modal.querySelectorAll('[data-dep-invert-pred]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const succId = String(btn.getAttribute('data-dep-invert-pred'));
      const succItem = byId.get(succId);
      if (!succItem) return;
      const nextSuccLinks = normalizeScheduleLinks(succItem.predecessors).filter(x => String(x.id) !== conceptId);
      const resInv = setConceptPredecessorsInModel(succItem.id, nextSuccLinks);
      if (!resInv || !resInv.ok) {
        showToast(resInv?.error || 'No se pudo invertir la dependencia.', 'error');
        return;
      }
      if (!depModalDraftLinks.some(x => String(x.id) === succId)) {
        depModalDraftLinks = [...depModalDraftLinks, { id: succId, type: 'FS', lag: 0 }];
      }
      showToast(`⇄ Orden invertido: ${succItem.clave} liberado y elegido para ${item.clave}.`);
      renderConceptDependenciesModalBody();
      renderCalendarioObra();
    };
  });
  modal.querySelectorAll('[data-dep-toggle-pred]').forEach(rowEl => {
    rowEl.onclick = () => {
      if (rowEl.getAttribute('data-blocked') === '1') return;
      const pid = String(rowEl.getAttribute('data-dep-toggle-pred'));
      if (draftMap.has(pid)) depModalDraftLinks = depModalDraftLinks.filter(x => String(x.id) !== pid);
      else depModalDraftLinks = [...depModalDraftLinks, { id: pid, type: 'FS', lag: 0 }];
      renderConceptDependenciesModalBody();
    };
  });
  modal.querySelectorAll('[data-dep-link-type]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const [pid, nextType] = String(btn.getAttribute('data-dep-link-type')).split(':');
      depModalDraftLinks = depModalDraftLinks.map(x => String(x.id) === pid ? { ...x, type: nextType === 'SS' ? 'SS' : 'FS' } : x);
      renderConceptDependenciesModalBody();
    };
  });
  modal.querySelectorAll('[data-dep-link-lag]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const [pid, dStr] = String(btn.getAttribute('data-dep-link-lag')).split(':');
      const d = parseInt(dStr, 10) || 0;
      depModalDraftLinks = depModalDraftLinks.map(x => {
        if (String(x.id) !== pid) return x;
        const nextLag = Math.max(-15, Math.min(30, (parseInt(x.lag, 10) || 0) + d));
        return { ...x, lag: nextLag };
      });
      renderConceptDependenciesModalBody();
    };
  });
}

export function closeConceptDependenciesModal() {
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-dependencias') : null;
  if (!modal) return;
  modal.className = 'hidden';
  currentDepModalConceptId = null;
  depModalDraftLinks = [];
  depModalFilterPartida = 'all';
  depModalSearch = '';
}

export function clearConceptDependenciesFromModal() {
  if (!currentDepModalConceptId) return;
  const targetId = currentDepModalConceptId;
  selectedCalendarioRowId = String(targetId);
  closeConceptDependenciesModal();
  setConceptPredecessorsInModel(targetId, []);
  showToast('Se liberaron las predecesoras del concepto.');
  renderCalendarioObra();
}

export function saveConceptDependenciesModal() {
  if (!currentDepModalConceptId) return;
  const targetId = currentDepModalConceptId;
  const linksToSave = depModalDraftLinks.map(lk => ({ ...lk }));

  const res = setConceptPredecessorsInModel(targetId, linksToSave);
  if (!res || !res.ok) {
    showToast(res?.error || 'Error al guardar dependencias.', 'error');
    return;
  }

  selectedCalendarioRowId = String(targetId);
  closeConceptDependenciesModal();
  showToast(linksToSave.length > 0
    ? `✓ Dependencias actualizadas para ${res.clave} (${linksToSave.length} enlace${linksToSave.length === 1 ? '' : 's'}).`
    : `${res.clave} quedó con inicio libre.`);
  renderCalendarioObra();
}

// ------------------------------------------------------------
// MODAL ASISTENTE IA POR PROCESO CONSTRUCTIVO Y RUTA CRÍTICA
// ------------------------------------------------------------
export function openCalendarioAiModal() {
  if (!guardTabUnlocked('calendario')) return;
  const modal = ensureModalContainer('modal-calendario-ia');
  if (!modal) return;

  const cfg = getScheduleSettings();
  const detectedType = detectProjectWorkType();
  const savedApiKey = state.settings?.apiKey || '';

  modal.className = 'fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5';
  modal.onclick = (e) => {
    if (e.target === modal) closeCalendarioAiModal();
  };
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
      
      <!-- Cabecera Ejecutiva -->
      <div class="bg-gradient-to-r from-violet-700 via-indigo-700 to-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-amber-300 shadow-inner shrink-0">
            <i class="fa-solid fa-wand-magic-sparkles text-base"></i>
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold leading-tight">Asistente IA — Secuencia por Proceso Constructivo y Ruta Crítica</h3>
            <p class="text-[11px] text-indigo-100 mt-0.5">Analiza el Tipo de Obra, partidas, volúmenes APU y días inhábiles para proponer dependencias Fin-a-Inicio reales</p>
          </div>
        </div>
        <button type="button" onclick="closeCalendarioAiModal()" class="text-white/75 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <!-- Cuerpo Configurable + Vista Previa -->
      <div class="p-4 overflow-y-auto flex-1 space-y-3.5 custom-scroll text-xs">
        
        <!-- Parámetros Constructivos -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <label class="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">1. Tipo de Obra / Giro</label>
            <select id="ai-cal-worktype" onchange="refreshCalendarioAiPreview()" class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-500 cursor-pointer">
              ${Object.values(WORK_TYPE_PROFILES).map(p => `
                <option value="${p.id}" ${p.id === detectedType ? 'selected' : ''}>${p.label}</option>
              `).join('')}
            </select>
          </div>

          <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <label class="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">2. Estrategia de Frentes</label>
            <select id="ai-cal-strategy" onchange="refreshCalendarioAiPreview()" class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-500 cursor-pointer">
              <option value="parallel">⚡ Optimizada: Frentes simultáneos</option>
              <option value="serial">📏 Conservadora: En serie (1 cuadrilla)</option>
            </select>
          </div>

          <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between">
            <label class="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">3. Plazo Meta Opcional (días)</label>
            <div class="flex items-center gap-2">
              <input type="number" id="ai-cal-target-days" min="10" max="1500" placeholder="Auto (APU)" onchange="refreshCalendarioAiPreview()" class="w-28 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 outline-none focus:border-violet-500">
              <label class="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-700 cursor-pointer select-none" title="Respeta descansos semanales, festivos y lluvias configurados en Días Inhábiles">
                <input type="checkbox" id="ai-cal-respect-workdays" ${cfg.respectWorkdays !== false ? 'checked' : ''} onchange="refreshCalendarioAiPreview()" class="rounded text-violet-600 cursor-pointer">
                <span>Días hábiles</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Barra Opcional de Enriquecimiento con Google Gemini API -->
        <div class="bg-violet-50/70 border border-violet-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <i class="fa-solid fa-microchip text-violet-600 text-xs shrink-0"></i>
            <input type="password" id="ai-cal-api-key" value="${savedApiKey}" placeholder="API Key Gemini opcional (vacío = Motor Experto Constructivo instantáneo)" class="flex-1 min-w-[180px] bg-white border border-violet-200 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-700 outline-none focus:border-violet-500">
          </div>
          <button type="button" id="btn-ai-cal-gemini" onclick="runCalendarioGeminiAiProposal()" class="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-[11px] font-bold shadow-2xs transition cursor-pointer flex items-center gap-1.5 shrink-0">
            <i class="fa-solid fa-robot text-[10px] text-amber-200"></i>
            <span>Consultar con Gemini IA</span>
          </button>
        </div>

        <!-- Explicación del Proceso Constructivo y KPIs de la Propuesta -->
        <div id="ai-cal-summary-box" class="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3 space-y-2">
        </div>

        <!-- Tabla de Vista Previa de Conceptos, Etapas, Predecesoras y Ruta Crítica -->
        <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div class="bg-slate-100 border-b border-slate-200 px-3 py-2 flex items-center justify-between text-[10.5px] font-bold text-slate-600 uppercase">
            <span>Vista previa de secuencia constructiva propuesta</span>
            <span id="ai-cal-table-meta" class="font-mono text-slate-700"></span>
          </div>
          <div class="max-h-60 overflow-y-auto custom-scroll divide-y divide-slate-100" id="ai-cal-preview-list">
          </div>
        </div>

      </div>

      <!-- Pie de Modal -->
      <div class="px-5 py-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <button type="button" onclick="clearAllCalendarioLinksAction()" class="text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:underline cursor-pointer flex items-center gap-1">
          <i class="fa-solid fa-link-slash text-[10px]"></i> Quitar enlaces actuales
        </button>
        <div class="flex items-center gap-2">
          <button type="button" onclick="closeCalendarioAiModal()" class="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer">
            Cancelar
          </button>
          <button type="button" id="btn-ai-cal-apply" onclick="applyCalendarioAiProposal()" class="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5">
            <i class="fa-solid fa-check text-xs"></i>
            <span>Aplicar al Diagrama de Gantt</span>
          </button>
        </div>
      </div>

    </div>
  `;

  refreshCalendarioAiPreview();
}

export function closeCalendarioAiModal() {
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-ia') : null;
  if (!modal) return;
  modal.className = 'hidden';
}

function readAiModalOptions() {
  const cfg = getScheduleSettings();
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-ia') : null;
  const q = (sel, fallbackId) => (modal?.querySelector ? modal.querySelector(sel) : null) || (typeof document !== 'undefined' ? document.getElementById(fallbackId) : null);

  const wtEl = q('#ai-cal-worktype', 'ai-cal-worktype');
  const stEl = q('#ai-cal-strategy', 'ai-cal-strategy');
  const tdEl = q('#ai-cal-target-days', 'ai-cal-target-days');
  const rwEl = q('#ai-cal-respect-workdays', 'ai-cal-respect-workdays');
  const akEl = q('#ai-cal-api-key', 'ai-cal-api-key');

  return {
    workType: wtEl?.value || detectProjectWorkType(),
    strategy: stEl?.value || 'parallel',
    targetDays: parseInt(tdEl?.value, 10) || 0,
    respectWorkdays: rwEl ? Boolean(rwEl.checked) : (cfg.respectWorkdays !== false),
    apiKey: akEl?.value || state.settings?.apiKey || '',
    startDate: cfg.startDate || getProjectCreationDate()
  };
}

function renderProposalIntoAiModal(proposal) {
  currentAiProposalPreview = proposal;
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-ia') : null;
  const findEl = (id) => (modal?.querySelector ? modal.querySelector(`#${id}`) : null) || (typeof document !== 'undefined' ? document.getElementById(id) : null);

  const summaryBox = findEl('ai-cal-summary-box');
  const listBox = findEl('ai-cal-preview-list');
  const metaEl = findEl('ai-cal-table-meta');

  if (!proposal || !proposal.ok) {
    if (summaryBox) {
      summaryBox.innerHTML = `<p class="text-rose-600 font-semibold">${proposal?.error || 'No hay conceptos disponibles para generar una propuesta.'}</p>`;
    }
    if (listBox) listBox.innerHTML = '';
    return;
  }

  const byId = new Map();
  proposal.tasks.forEach(t => byId.set(String(t.id), t));

  if (summaryBox) {
    summaryBox.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-bold text-indigo-900 flex items-center gap-1.5">
          <i class="fa-solid fa-compass-drafting text-indigo-600"></i>
          <span>${proposal.modelUsed || 'Motor Constructivo'}</span>
        </span>
        <div class="flex items-center gap-1.5 flex-wrap">
          ${proposal.savingsDays > 0
            ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10.5px] font-bold">⚡ Optimiza ${proposal.savingsDays} días vs serie</span>`
            : `<span class="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10.5px] font-semibold">Secuencia lineal en serie</span>`
          }
          <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 text-[10.5px] font-bold">🔥 ${proposal.criticalCount} de ${proposal.tasks.length} críticos</span>
        </div>
      </div>
      <p class="text-[11.5px] text-slate-700 leading-relaxed">${proposal.reasoning}</p>
      <div class="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
        <div class="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100">
          <span class="text-[9.5px] text-slate-500 font-sans block uppercase font-bold">Inicio → Fin</span>
          <strong class="text-slate-800">${proposal.startDate} → ${proposal.endDate}</strong>
        </div>
        <div class="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100">
          <span class="text-[9.5px] text-slate-500 font-sans block uppercase font-bold">Plazo Total</span>
          <strong class="text-indigo-700">${proposal.totalNaturalDays}d nat. (${proposal.workingDays} háb.)</strong>
        </div>
        <div class="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100">
          <span class="text-[9.5px] text-slate-500 font-sans block uppercase font-bold">Enlaces Fin-a-Inicio</span>
          <strong class="text-emerald-700">${proposal.tasks.filter(t => t.predecessors.length > 0).length} dependencias</strong>
        </div>
      </div>
    `;
  }

  if (metaEl) {
    metaEl.textContent = `${proposal.tasks.length} conceptos • ${proposal.totalNaturalDays} días naturales`;
  }

  if (listBox) {
    listBox.innerHTML = proposal.tasks.map(t => {
      const predClaves = (t.predecessors || []).map(pid => byId.get(String(pid))?.clave || pid);
      return `
        <div class="px-3 py-2 flex items-center justify-between gap-2 text-[11px] ${t.isCritical ? 'bg-rose-50/40' : 'bg-white'} hover:bg-slate-50">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="font-mono font-bold ${t.isCritical ? 'text-rose-700' : 'text-blue-700'} w-14 shrink-0 truncate">${t.clave}</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[9.5px] font-semibold shrink-0 max-w-[140px] truncate" title="${t.stageName}">${t.stageName}</span>
            <span class="truncate text-slate-800" title="${t.descripcion}">${t.descripcion}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0 font-mono text-[10.5px]">
            <span class="px-1.5 py-0.5 rounded ${predClaves.length > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}" title="Predecesoras que deben terminar antes">
              ${predClaves.length > 0 ? `Tras: ${predClaves.join(', ')}` : 'Inicio día 1'}
            </span>
            <span class="w-10 text-center font-bold text-slate-800">${t.durationDays}d</span>
            ${t.isCritical
              ? `<span class="w-14 text-center px-1 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-300 font-bold text-[9.5px]">🔥 Crít.</span>`
              : `<span class="w-14 text-center px-1 py-0.5 rounded bg-slate-100 text-slate-600 text-[9.5px]">+${t.slackDays}d</span>`
            }
          </div>
        </div>
      `;
    }).join('');
  }
}

export function refreshCalendarioAiPreview() {
  const opts = readAiModalOptions();
  const proposal = generateLocalConstructiveProposal(opts);
  renderProposalIntoAiModal(proposal);
  return proposal;
}

export async function runCalendarioGeminiAiProposal() {
  const opts = readAiModalOptions();
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-ia') : null;
  const btn = (modal?.querySelector ? modal.querySelector('#btn-ai-cal-gemini') : null) || (typeof document !== 'undefined' ? document.getElementById('btn-ai-cal-gemini') : null);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-[10px]"></i> <span>Analizando con Gemini...</span>`;
  }

  try {
    const aiProposal = await generateGeminiConstructiveProposal(opts);
    renderProposalIntoAiModal(aiProposal);
    showToast(`✨ Propuesta generada con ${aiProposal.modelUsed}`);
  } catch (err) {
    showToast(err?.message || 'No se pudo consultar Gemini IA; se mantiene la propuesta experta constructiva.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-robot text-[10px] text-amber-200"></i> <span>Consultar con Gemini IA</span>`;
    }
  }
}

export function applyCalendarioAiProposal() {
  if (!currentAiProposalPreview || !currentAiProposalPreview.ok) {
    currentAiProposalPreview = refreshCalendarioAiPreview();
  }
  if (!currentAiProposalPreview || !currentAiProposalPreview.ok) {
    showToast('No hay una propuesta válida para aplicar.', 'error');
    return;
  }

  const prop = currentAiProposalPreview;
  saveScheduleSettings({ viewMode: 'gantt', showCriticalPath: true, respectWorkdays: prop.respectWorkdays });
  applyScheduleProposalToModel(prop.tasks, prop.startDate, { respectWorkdays: prop.respectWorkdays });
  closeCalendarioAiModal();

  showToast(`✓ Propuesta constructiva aplicada: ${prop.totalNaturalDays} días y ${prop.criticalCount} conceptos en Ruta Crítica.`);
  renderCalendarioObra();
}


