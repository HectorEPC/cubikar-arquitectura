import { state, persistLocalData, persistSettings } from '../state/store.js?v=20261116_cf22';
import { defaultTreeData } from '../config/defaultData.js?v=20261116_cf22';
import { saveState, updateUndoRedoButtons } from '../state/history.js?v=20261116_cf22';
import { showToast } from './notifications.js?v=20261116_cf22';
import { formatQty, round2, round5 } from '../core/formatters.js?v=20261116_cf22';
import {
  getDespachoGastosBreakdown,
  getNominaOficinaBreakdown,
  getUtilidadDespachoPct,
  getEjecutivoCostPlusFactor,
  updateSobrecostoBadge
} from '../core/calculations.js?v=20261116_cf22';
import { findNodeById, getNodeHierarchyPath, getSelectedLeafConcepts } from '../modules/catalog/treeService.js?v=20261116_cf22';
import { renderTAB1, closeApuPanel } from '../modules/catalog/catalogView.js?v=20261116_cf22';
import { renderInsumosGenerales } from '../modules/insumosGenerales/insumosView.js?v=20261116_cf22';
import { renderCalendarioObra } from '../modules/calendario/calendarioView.js?v=20261116_cf22';
import { renderEstimacionesView, switchEstimacionesSubView } from '../modules/estimaciones/estimacionesView.js?v=20261116_cf22';
import { getProjectPresupuestoConfig } from '../modules/presupuesto/presupuestoModel.js?v=20261116_cf22';
import { renderPresupuestoView } from '../modules/presupuesto/presupuestoView.js?v=20261116_cf22';
import { renderSeguimientoView } from '../modules/seguimiento/seguimientoView.js?v=20261116_cf22';
import { renderBrandingUI } from './brandingController.js?v=20261116_cf22';
import { canCurrentUserAccessTab, renderAllTabAssignedMembers } from '../modules/portal/portalController.js?v=20261116_cf22';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261116_cf22';
import { getActiveProjectId } from '../config/constants.js?v=20261116_cf22';
import { syncProjectChatDivisionWithTab } from '../modules/chat/projectChat.js?v=20261116_cf22';

// Modo de destino del modal Google IA: 'single' (solo concepto activo en matriz) o 'batch' (conceptos con casilla)
export let aiModalTargetMode = 'single';
export let aiModalSingleNodeId = null;

// Modal de Generación APU con Google Search Grounding
export function openAiGeneratorModal(singleSelectedOnly = false) {
  let node = null;
  const isSingle = Boolean(singleSelectedOnly);

  if (isSingle) {
    aiModalTargetMode = 'single';
    aiModalSingleNodeId = state.activeSelectedId;
    if (state.activeSelectedId) {
      node = findNodeById(state.treeData, state.activeSelectedId);
    }
    if (!node) {
      showToast('Selecciona primero un concepto en la tabla para ver y generar su matriz con Google IA.', 'warning');
      return;
    }
  } else {
    const checkedNodes = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
    if (checkedNodes.length === 0 && state.activeSelectedId) {
      const active = findNodeById(state.treeData, state.activeSelectedId);
      if (active && (!active.children || active.children.length === 0)) {
        node = active;
        aiModalTargetMode = 'single';
        aiModalSingleNodeId = active.id;
      }
    } else if (checkedNodes.length === 1) {
      node = checkedNodes[0];
      aiModalTargetMode = 'single';
      aiModalSingleNodeId = node.id;
      state.activeSelectedId = node.id;
    } else if (checkedNodes.length > 1) {
      node = checkedNodes[0];
      aiModalTargetMode = 'batch';
      aiModalSingleNodeId = null;
    }

    if (!node) {
      showToast('Selecciona con la casilla (checkbox) los conceptos que deseas generar con Google IA.', 'warning');
      return;
    }
  }

  const isParent = node.children && node.children.length > 0;
  if (isParent && aiModalTargetMode === 'single') {
    showToast('Selecciona un concepto final (hoja) de la tabla, no una partida agrupada', 'warning');
    return;
  }

  const modalPathEl = document.getElementById('ai-modal-path');
  const modalClaveEl = document.getElementById('ai-modal-clave');
  const modalDescEl = document.getElementById('ai-modal-desc');
  const modalUnidEl = document.getElementById('ai-modal-unid');
  const modalUnidHintEl = document.getElementById('ai-modal-unid-hint');
  const modalCantEl = document.getElementById('ai-modal-cant');
  const btnRun = document.getElementById('btn-ai-modal-run');

  if (aiModalTargetMode === 'batch') {
    const checkedNodes = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
    if (modalPathEl) modalPathEl.innerText = `Lote de ${checkedNodes.length} conceptos seleccionados con casilla`;
    if (modalClaveEl) modalClaveEl.innerText = `${checkedNodes.length} sel.`;
    if (modalDescEl) modalDescEl.innerText = checkedNodes.map(c => `[${c.clave || ''}] ${c.descripcion}`).slice(0, 4).join(', ') + (checkedNodes.length > 4 ? ` (+${checkedNodes.length - 4} más)` : '');
    if (modalUnidEl) modalUnidEl.innerText = 'Varias';
    if (modalUnidHintEl) modalUnidHintEl.innerText = 'cada concepto seleccionado';
    if (modalCantEl) modalCantEl.innerText = `${checkedNodes.length} conceptos`;
    if (btnRun) btnRun.innerHTML = `<i class="fa-brands fa-google text-[10px] text-amber-300"></i> Buscar en Google y Llenar ${checkedNodes.length} Matrices`;
  } else {
    const pathArr = getNodeHierarchyPath(state.treeData, node.id) || [];
    const parentPath = pathArr.length > 1 ? pathArr.slice(0, -1).join('  >  ') : 'Partida Principal';

    if (modalPathEl) modalPathEl.innerText = parentPath;
    if (modalClaveEl) modalClaveEl.innerText = node.clave || '---';
    if (modalDescEl) modalDescEl.innerText = node.descripcion || 'Sin descripción';
    if (modalUnidEl) modalUnidEl.innerText = node.unidad || 'pza';
    if (modalUnidHintEl) modalUnidHintEl.innerText = `1 ${node.unidad || 'pza'}`;
    if (modalCantEl) modalCantEl.innerText = formatQty(node.cantidad || 1);
    if (btnRun) btnRun.innerHTML = `<i class="fa-brands fa-google text-[10px] text-amber-300"></i> Buscar en Google y Llenar Matriz`;
  }
  
  const modalKeyEl = document.getElementById('ai-modal-api-key');
  if (modalKeyEl) modalKeyEl.value = state.settings.apiKey || '';

  const modalLoadingEl = document.getElementById('ai-modal-loading');
  if (modalLoadingEl) modalLoadingEl.classList.add('hidden');
  const modalErrorEl = document.getElementById('ai-modal-error');
  if (modalErrorEl) modalErrorEl.classList.add('hidden');

  if (btnRun) btnRun.disabled = false;

  const modalEl = document.getElementById('modal-ai-generator');
  if (modalEl) modalEl.classList.remove('hidden');
}

export function closeAiGeneratorModal() {
  const modalEl = document.getElementById('modal-ai-generator');
  if (modalEl) modalEl.classList.add('hidden');
}

export function toggleAiModalKeyVisibility() {
  const input = document.getElementById('ai-modal-api-key');
  const icon = document.getElementById('ai-key-eye-icon');
  if (!input || !icon) return;
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash text-xs';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye text-xs';
  }
}

// Modal de Configuración General
export function openSettingsModal(tab = 'informacion') {
  let targetTab = tab;
  if (!targetTab || targetTab === 'general' || targetTab === 'empresa') {
    targetTab = 'informacion';
  }
  const modalEl = document.getElementById('settings-modal');
  if (modalEl) modalEl.classList.remove('hidden');

  const cfg = getProjectPresupuestoConfig();
  const nomina = getNominaOficinaBreakdown();

  const applyEl = document.getElementById('cfg-apply-sobrecosto');
  if (applyEl) applyEl.checked = Boolean(state.settings.applySobrecosto);
  const applyDesglose = Boolean(state.settings.applyDesgloseIndirectos);
  const indVal = Number(state.settings.pctIndirectos ?? 0);
  const finVal = Number(state.settings.pctFinanciamiento ?? 0);
  const adiVal = Number(state.settings.pctAdicionales ?? 0);
  const utiEl = document.getElementById('cfg-utilidad');
  if (utiEl) utiEl.value = Number(getUtilidadDespachoPct()).toFixed(2);

  const gastosTotalEl = document.getElementById('cfg-gastos-total');
  if (gastosTotalEl) {
    delete gastosTotalEl.dataset.prevSimple;
    gastosTotalEl.value = (indVal + finVal + adiVal).toFixed(2);
  }

  // Opciones avanzadas: todos los apartados inician en blanco y desactivados salvo los ya implementados
  syncAdvancedBlockUI('desglose', applyDesglose, true);
  if (applyDesglose) {
    const indEl = document.getElementById('cfg-indirectos');
    if (indEl) indEl.value = indVal > 0 ? indVal.toFixed(2) : '';
    const finEl = document.getElementById('cfg-financiamiento');
    if (finEl) finEl.value = finVal > 0 ? finVal.toFixed(2) : '';
    const adiEl = document.getElementById('cfg-adicionales');
    if (adiEl) adiEl.value = adiVal > 0 ? adiVal.toFixed(2) : '';
  }

  // Cerrar opciones avanzadas por defecto para evitar sobrecarga visual
  toggleSettingsAdvancedSection(false);

  const applyNomina = Boolean(cfg.applyNominaFactor);
  syncAdvancedBlockUI('nomina', applyNomina, true);
  if (applyNomina) {
    const fasarEl = document.getElementById('cfg-fasar');
    if (fasarEl) fasarEl.value = nomina.pct > 0 ? Number(nomina.pct).toFixed(2) : '';
  }

  const applyIvaEl = document.getElementById('cfg-aplicar-iva');
  if (applyIvaEl) applyIvaEl.checked = cfg.aplicarIva !== false;
  const ivaEl = document.getElementById('cfg-iva-pct');
  const resolvedIva = cfg.ivaPct !== undefined ? Number(cfg.ivaPct) : Number(state.settings.ivaPct ?? 16.00);
  if (ivaEl) ivaEl.value = (isNaN(resolvedIva) ? 16.00 : resolvedIva).toFixed(2);

  const applyRet = Boolean(cfg.aplicarRetenciones);
  syncAdvancedBlockUI('retenciones', applyRet, true);
  if (applyRet) {
    const isrVal = Number(cfg.retencionIsrPct || 0);
    const ivaRetVal = Number(cfg.retencionIvaPct || 0);
    const retIsrEl = document.getElementById('cfg-ret-isr');
    if (retIsrEl) retIsrEl.value = isrVal > 0 ? isrVal.toFixed(2) : '';
    const retIvaEl = document.getElementById('cfg-ret-iva');
    if (retIvaEl) {
      const isTwoDecimals = Math.round(ivaRetVal * 100) / 100 === ivaRetVal;
      retIvaEl.value = ivaRetVal > 0 ? (isTwoDecimals ? ivaRetVal.toFixed(2) : ivaRetVal.toFixed(4)) : '';
    }
  }

  const keyEl = document.getElementById('cfg-api-key');
  if (keyEl) keyEl.value = state.settings.apiKey || '';

  // Configuración de Moneda
  const curSelect = document.getElementById('cfg-currency-select');
  const curSymbol = document.getElementById('cfg-currency-symbol');
  const curCode = document.getElementById('cfg-currency-code');
  const curShowCode = document.getElementById('cfg-show-currency-code');

  const curr = state.settings.currency || 'MXN';
  if (curSelect) {
    let found = false;
    for (let i = 0; i < curSelect.options.length; i++) {
      if (curSelect.options[i].value === curr) {
        curSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) curSelect.value = 'CUSTOM';
  }

  if (curSymbol) curSymbol.value = state.settings.currencySymbol || '$';
  if (curCode) curCode.value = state.settings.currency || 'MXN';
  if (curShowCode) curShowCode.checked = state.settings.showCurrencyCode ?? false;

  const customCurFields = document.getElementById('cfg-currency-custom-fields');
  if (customCurFields && curSelect) {
    customCurFields.classList.toggle('hidden', curSelect.value !== 'CUSTOM');
  }

  updateCurrencyPreview();
  updateCalculatedFactorPreview();
  updateFasarPreview();
  renderBrandingUI();
  switchSettingsTab(targetTab);
}

const ADVANCED_BLOCKS = {
  desglose: {
    checkboxId: 'cfg-apply-desglose',
    inputIds: ['cfg-indirectos', 'cfg-financiamiento', 'cfg-adicionales'],
    focusId: 'cfg-indirectos'
  },
  nomina: {
    checkboxId: 'cfg-apply-nomina',
    inputIds: ['cfg-fasar'],
    focusId: 'cfg-fasar'
  },
  retenciones: {
    checkboxId: 'cfg-aplicar-retenciones',
    inputIds: ['cfg-ret-isr', 'cfg-ret-iva'],
    focusId: 'cfg-ret-isr'
  }
};

function setGastosTotalReadOnlyState(isBreakdownActive) {
  const totalEl = document.getElementById('cfg-gastos-total');
  const hintEl = document.getElementById('cfg-gastos-total-hint');
  if (!totalEl) return;
  totalEl.readOnly = Boolean(isBreakdownActive);
  totalEl.classList.toggle('bg-slate-100', Boolean(isBreakdownActive));
  totalEl.classList.toggle('text-slate-500', Boolean(isBreakdownActive));
  totalEl.classList.toggle('cursor-not-allowed', Boolean(isBreakdownActive));
  totalEl.classList.toggle('bg-white', !isBreakdownActive);
  if (hintEl) {
    hintEl.textContent = isBreakdownActive
      ? 'Calculado desde Desglose en Opciones avanzadas.'
      : 'Oficina, licencias, imprevistos.';
  }
}

function syncAdvancedBlockUI(blockKey, isActive, clearWhenInactive = true) {
  const def = ADVANCED_BLOCKS[blockKey];
  if (!def) return;
  const active = Boolean(isActive);

  const chk = document.getElementById(def.checkboxId);
  if (chk) {
    chk.checked = active;
    chk.dataset.active = active ? 'true' : 'false';
  }

  def.inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !active;
    if (!active && clearWhenInactive) {
      el.value = '';
    }
  });

  if (blockKey === 'desglose') {
    setGastosTotalReadOnlyState(active);
  }
}

export function toggleAdvancedBlock(blockKey, forceState = null) {
  const def = ADVANCED_BLOCKS[blockKey];
  if (!def) return;
  const chk = document.getElementById(def.checkboxId);
  const wasActive = chk?.dataset.active === 'true';
  const nextActive = typeof forceState === 'boolean' ? forceState : !wasActive;

  if (blockKey === 'desglose') {
    const totalEl = document.getElementById('cfg-gastos-total');
    if (totalEl) {
      if (nextActive && !wasActive) {
        totalEl.dataset.prevSimple = totalEl.value || '0.00';
      } else if (!nextActive && wasActive && totalEl.dataset.prevSimple !== undefined) {
        totalEl.value = totalEl.dataset.prevSimple;
        delete totalEl.dataset.prevSimple;
      }
    }
  }

  syncAdvancedBlockUI(blockKey, nextActive, true);

  if (blockKey === 'desglose' && nextActive && !wasActive) {
    onBreakdownGastosInput();
  }

  if (nextActive && !wasActive && def.focusId) {
    const focusEl = document.getElementById(def.focusId);
    if (focusEl) focusEl.focus();
  }

  updateFasarPreview();
  updateCalculatedFactorPreview();
}

// Expandir o colapsar las opciones avanzadas en Configuración -> % Despacho, IVA y Moneda
export function toggleSettingsAdvancedSection(forceState = null) {
  const sec = document.getElementById('cfg-advanced-section');
  const chev = document.getElementById('cfg-advanced-chevron');
  if (!sec) return;
  const shouldOpen = typeof forceState === 'boolean' ? forceState : sec.classList.contains('hidden');
  sec.classList.toggle('hidden', !shouldOpen);
  if (chev) {
    chev.classList.toggle('rotate-90', shouldOpen);
  }
}

// Al editar el campo único simple "% Gastos Indirectos", recalcular sin llenar Opciones avanzadas
export function onSimpleGastosInput() {
  updateCalculatedFactorPreview();
}

// Al editar cualquiera de los 3 campos del desglose avanzado, recalcular el campo único simple
export function onBreakdownGastosInput() {
  const ind = Math.max(0, parseFloat(document.getElementById('cfg-indirectos')?.value) || 0);
  const fin = Math.max(0, parseFloat(document.getElementById('cfg-financiamiento')?.value) || 0);
  const adi = Math.max(0, parseFloat(document.getElementById('cfg-adicionales')?.value) || 0);
  const totalEl = document.getElementById('cfg-gastos-total');
  if (totalEl) totalEl.value = (ind + fin + adi).toFixed(2);
  updateCalculatedFactorPreview();
}

// Actualizar campos al cambiar el selector de moneda
export function onCurrencySelectChange(val) {
  const select = document.getElementById('cfg-currency-select');
  const symbolInput = document.getElementById('cfg-currency-symbol');
  const codeInput = document.getElementById('cfg-currency-code');
  const customFields = document.getElementById('cfg-currency-custom-fields');
  if (!select) return;

  if (customFields) {
    customFields.classList.toggle('hidden', val !== 'CUSTOM');
  }

  const opt = select.options[select.selectedIndex];
  if (!opt) return;

  if (val !== 'CUSTOM') {
    if (symbolInput) symbolInput.value = opt.dataset.symbol || '$';
    if (codeInput) codeInput.value = opt.dataset.code || val;
  }
  updateCurrencyPreview();
}

// Vista previa dinámica del formato de moneda
export function updateCurrencyPreview() {
  const symbol = (document.getElementById('cfg-currency-symbol')?.value || '$').trim();
  const code = (document.getElementById('cfg-currency-code')?.value || 'MXN').trim();
  const showCode = document.getElementById('cfg-show-currency-code')?.checked ?? false;
  const preview = document.getElementById('cfg-currency-preview');

  if (preview) {
    const codeStr = showCode ? ` ${code}` : '';
    preview.innerText = `${symbol}1,250.00${codeStr}`;
  }
}

export function closeSettingsModal() {
  const modalEl = document.getElementById('settings-modal');
  if (modalEl) modalEl.classList.add('hidden');
}

export function switchSettingsTab(tab) {
  let activeTab = tab;
  if (!activeTab || activeTab === 'general' || activeTab === 'empresa' || activeTab === 'ia') {
    activeTab = 'informacion';
  }
  const tabs = ['informacion', 'sobrecosto', 'datos'];
  tabs.forEach(t => {
    const view = document.getElementById(`modal-view-${t}`);
    const btn = document.getElementById(`modal-tab-${t}`);
    if (t === activeTab) {
      if (view) view.classList.remove('hidden');
      if (btn) btn.className = "py-2 px-3 border-b-2 border-blue-600 text-blue-600 flex items-center gap-1.5";
    } else {
      if (view) view.classList.add('hidden');
      if (btn) btn.className = "py-2 px-3 border-b-2 border-transparent text-slate-600 hover:text-slate-900 flex items-center gap-1.5";
    }
  });
}

export function setSettingsPreset(inputId, val) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const num = Number(val);
  el.value = (isNaN(num) ? 0 : num).toFixed(2);
  if (inputId === 'cfg-iva-pct' && num > 0) {
    const chkIva = document.getElementById('cfg-aplicar-iva');
    if (chkIva) chkIva.checked = true;
  }
  updateCalculatedFactorPreview();
}

export function updateCalculatedFactorPreview() {
  const apply = document.getElementById('cfg-apply-sobrecosto')?.checked ?? false;
  const applyDesglose = document.getElementById('cfg-apply-desglose')?.checked ?? false;

  let ind = 0;
  let fin = 0;
  let adi = 0;
  if (applyDesglose) {
    ind = Math.max(0, parseFloat(document.getElementById('cfg-indirectos')?.value) || 0);
    fin = Math.max(0, parseFloat(document.getElementById('cfg-financiamiento')?.value) || 0);
    adi = Math.max(0, parseFloat(document.getElementById('cfg-adicionales')?.value) || 0);
  } else {
    ind = Math.max(0, parseFloat(document.getElementById('cfg-gastos-total')?.value) || 0);
  }

  const utiParsed = parseFloat(document.getElementById('cfg-utilidad')?.value);
  const uti = isNaN(utiParsed) ? 0 : Math.max(0, Math.min(95, utiParsed));

  const applyNomina = document.getElementById('cfg-apply-nomina')?.checked ?? false;
  const fasarRaw = parseFloat(document.getElementById('cfg-fasar')?.value);
  const fasarVal = applyNomina && !isNaN(fasarRaw) ? Math.max(0, fasarRaw) : 0;

  const applyIva = document.getElementById('cfg-aplicar-iva')?.checked ?? true;
  const ivaFieldsEl = document.getElementById('cfg-iva-fields');
  if (ivaFieldsEl) {
    ivaFieldsEl.classList.toggle('hidden', !applyIva);
  }
  const ivaParsed = parseFloat(document.getElementById('cfg-iva-pct')?.value);
  const ivaVal = isNaN(ivaParsed) ? 16 : Math.max(0, Math.min(100, ivaParsed));

  const applyRet = document.getElementById('cfg-aplicar-retenciones')?.checked ?? false;
  const retIsr = applyRet ? Math.max(0, parseFloat(document.getElementById('cfg-ret-isr')?.value) || 0) : 0;
  const retIva = applyRet ? Math.max(0, parseFloat(document.getElementById('cfg-ret-iva')?.value) || 0) : 0;

  const ratesGrid = document.getElementById('cfg-simple-rates-grid');
  if (ratesGrid) {
    ratesGrid.classList.toggle('opacity-50', !apply);
  }

  const advTags = [];
  if (applyDesglose) advTags.push('Desglose');
  if (applyNomina) advTags.push('Nómina H.H.');
  if (applyRet) advTags.push('Retenciones');
  const advPill = document.getElementById('cfg-advanced-active-pill');
  if (advPill) {
    if (advTags.length > 0) {
      advPill.textContent = advTags.join(' · ');
      advPill.classList.remove('hidden');
    } else {
      advPill.textContent = '';
      advPill.classList.add('hidden');
    }
  }

  const previewSettings = {
    applySobrecosto: apply,
    pctIndirectos: ind,
    pctFinanciamiento: fin,
    pctUtilidad: uti,
    pctAdicionales: adi,
    pctFasar: fasarVal,
    presupuestoArq: {
      margenUtilidadGlobal: uti,
      applyNominaFactor: applyNomina
    }
  };

  const gastos = getDespachoGastosBreakdown(previewSettings);
  const nomina = getNominaOficinaBreakdown(previewSettings);
  const factor = getEjecutivoCostPlusFactor(previewSettings);
  const pct = ((factor - 1) * 100).toFixed(2);

  const previewEl = document.getElementById('cfg-factor-preview');
  if (previewEl) previewEl.innerText = `${factor.toFixed(4)} (+${pct}%)`;

  const simpleFactorEl = document.getElementById('cfg-simple-factor-badge');
  if (simpleFactorEl) {
    simpleFactorEl.innerText = apply ? `×${factor.toFixed(2)} (+${pct}%)` : `Solo Utilidad ×${factor.toFixed(2)}`;
  }

  const breakdownEl = document.getElementById('cfg-sobrecosto-breakdown');
  if (breakdownEl) {
    const ivaStr = applyIva ? `IVA: ${ivaVal}%` : 'IVA: Desactivado';
    const retStr = applyRet ? ` · Ret: -${(retIsr + retIva).toFixed(2)}%` : '';
    const nominaStr = nomina.apply ? `×${nomina.factor.toFixed(2)} activo` : 'Desactivado';
    breakdownEl.innerHTML = `
      <span>Gastos Operativos: +${gastos.pctTotal.toFixed(2)}% (×${gastos.factor.toFixed(4)}) · Utilidad: ${uti.toFixed(1)}%</span>
      <span>H.H. Nómina: ${nominaStr} · ${ivaStr}${retStr}</span>
    `;
  }
}

// Vista previa dinámica del Factor de Nómina / Prestaciones de Oficina (antes FASAR)
export function updateFasarPreview() {
  const el = document.getElementById('cfg-fasar');
  const badge = document.getElementById('cfg-fasar-badge');
  const applyEl = document.getElementById('cfg-apply-nomina');
  const hintEl = document.getElementById('cfg-nomina-status-hint');
  if (!el || !badge) return;

  const isActive = applyEl ? applyEl.checked : false;
  if (!isActive) {
    badge.classList.add('hidden');
    if (hintEl) {
      hintEl.innerText = 'Desactivado';
      hintEl.className = 'text-[10px] font-medium text-slate-400 shrink-0';
    }
    return;
  }

  badge.classList.remove('hidden');
  const rawStr = (el.value || '').trim();
  if (!rawStr) {
    badge.innerText = '1.00x';
    if (hintEl) {
      hintEl.innerText = 'Activo (ingresa %)';
      hintEl.className = 'text-[10px] font-bold text-indigo-700 shrink-0';
    }
    return;
  }

  const val = parseFloat(rawStr);
  const num = isNaN(val) ? 0 : Math.max(0, val);
  const factor = (num > 0 && num < 5.0) ? num : (1 + (num / 100));
  badge.innerText = `${factor.toFixed(2)}x`;

  if (hintEl) {
    hintEl.innerText = `Activo (×${factor.toFixed(2)} en H.H.)`;
    hintEl.className = 'text-[10px] font-bold text-indigo-700 shrink-0';
  }
}

export function saveSettings() {
  if (!canCurrentUserEditProject(getActiveProjectId())) {
    showToast('🔒 Modo solo lectura: no tienes permisos para guardar ajustes del proyecto.', 'warning');
    return;
  }
  const cfg = getProjectPresupuestoConfig();

  state.settings.applySobrecosto = document.getElementById('cfg-apply-sobrecosto')?.checked ?? false;
  const applyDesglose = document.getElementById('cfg-apply-desglose')?.checked ?? false;
  state.settings.applyDesgloseIndirectos = Boolean(applyDesglose);

  if (applyDesglose) {
    state.settings.pctIndirectos = parseFloat(Math.max(0, parseFloat(document.getElementById('cfg-indirectos')?.value) || 0).toFixed(2));
    state.settings.pctFinanciamiento = parseFloat(Math.max(0, parseFloat(document.getElementById('cfg-financiamiento')?.value) || 0).toFixed(2));
    state.settings.pctAdicionales = parseFloat(Math.max(0, parseFloat(document.getElementById('cfg-adicionales')?.value) || 0).toFixed(2));
  } else {
    state.settings.pctIndirectos = parseFloat(Math.max(0, parseFloat(document.getElementById('cfg-gastos-total')?.value) || 0).toFixed(2));
    state.settings.pctFinanciamiento = 0;
    state.settings.pctAdicionales = 0;
  }

  const rawUti = parseFloat(document.getElementById('cfg-utilidad')?.value);
  const safeUti = isNaN(rawUti) ? 35 : Math.max(0, Math.min(95, rawUti));
  state.settings.pctUtilidad = parseFloat(safeUti.toFixed(2));
  state.settings.pctSegurosFianzas = 0;

  const applyNomina = document.getElementById('cfg-apply-nomina')?.checked ?? false;
  const rawFasar = parseFloat(document.getElementById('cfg-fasar')?.value);
  state.settings.pctFasar = applyNomina
    ? parseFloat((isNaN(rawFasar) ? 0 : Math.max(0, rawFasar)).toFixed(2))
    : 0;

  const applyIvaEl = document.getElementById('cfg-aplicar-iva');
  const applyIva = applyIvaEl ? applyIvaEl.checked : true;
  const rawIva = parseFloat(document.getElementById('cfg-iva-pct')?.value);
  const safeIva = isNaN(rawIva) ? 16 : Math.max(0, Math.min(100, rawIva));

  const applyRet = document.getElementById('cfg-aplicar-retenciones')?.checked ?? false;
  const rawRetIsr = parseFloat(document.getElementById('cfg-ret-isr')?.value);
  const rawRetIva = parseFloat(document.getElementById('cfg-ret-iva')?.value);

  state.settings.ivaPct = parseFloat(safeIva.toFixed(2));
  state.settings._execParamsV1 = true;

  // Sincronización bidireccional con PRESUPUESTO (Cost-Plus, Nómina e Impuestos)
  cfg.margenUtilidadGlobal = Math.round(state.settings.pctUtilidad * 100) / 100;
  cfg.applyNominaFactor = Boolean(applyNomina);
  cfg.aplicarIva = Boolean(applyIva);
  cfg.ivaPct = state.settings.ivaPct;
  cfg.aplicarRetenciones = Boolean(applyRet);
  cfg.retencionIsrPct = applyRet && !isNaN(rawRetIsr) ? Math.max(0, Math.min(100, rawRetIsr)) : 0;
  cfg.retencionIvaPct = applyRet && !isNaN(rawRetIva) ? Math.max(0, Math.min(100, rawRetIva)) : 0;

  const keyInput = document.getElementById('cfg-api-key');
  if (keyInput) {
    state.settings.apiKey = (keyInput.value || '').trim();
  }

  // Guardar Moneda de Trabajo
  const newCurrency = (document.getElementById('cfg-currency-code')?.value || 'MXN').trim().toUpperCase();
  const newSymbol = (document.getElementById('cfg-currency-symbol')?.value || '$').trim();
  const showCode = document.getElementById('cfg-show-currency-code')?.checked ?? false;

  state.settings.currency = newCurrency;
  state.settings.currencySymbol = newSymbol;
  state.settings.showCurrencyCode = showCode;

  // Guardar Datos de Empresa, Proyecto, Ubicación y Logo
  const compName = (document.getElementById('cfg-company-name')?.value || '').trim();
  if (compName) state.settings.companyName = compName;
  const projName = (document.getElementById('cfg-project-name')?.value || '').trim();
  if (projName) state.settings.projectName = projName;
  const projLoc = (document.getElementById('cfg-project-location')?.value || '').trim();
  if (projLoc) state.settings.projectLocation = projLoc;
  const compSubEl = document.getElementById('cfg-company-subtitle');
  if (compSubEl) {
    state.settings.companySubtitle = (compSubEl.value || '').trim() || state.settings.companySubtitle || '';
  }
  renderBrandingUI();
  persistSettings();
  updateSobrecostoBadge();

  // Recalcular precios unitarios de conceptos heredados con insumos APU si existen (Cost-Plus)
  const factor = getEjecutivoCostPlusFactor();
  function applyFactorRecursive(nodes) {
    nodes.forEach(n => {
      const hasWinnerQuote = Array.isArray(n.cotizaciones) && n.cotizaciones.some(c => Boolean(c.isGanador));
      if (!hasWinnerQuote && n.insumos && n.insumos.length > 0) {
        const cd = round2(n.insumos.reduce((s, i) => s + round2(round5(i.cantidad || 0) * round2(i.costoUnitario || 0)), 0));
        n.costoDirecto = cd;
        n.precioUnitario = round2(cd * factor);
      }
      if (n.children && n.children.length > 0) {
        applyFactorRecursive(n.children);
      }
    });
  }
  applyFactorRecursive(state.treeData);

  closeSettingsModal();
  persistLocalData();

  renderTAB1();

  if (document.getElementById('view-presupuesto')) {
    renderPresupuestoView();
  }

  const viewInsumosEl = document.getElementById('view-insumos');
  if (viewInsumosEl && !viewInsumosEl.classList.contains('hidden')) {
    renderInsumosGenerales();
  }

  const viewEstimacionesEl = document.getElementById('view-estimaciones');
  if (viewEstimacionesEl && !viewEstimacionesEl.classList.contains('hidden')) {
    renderEstimacionesView();
  }

  showToast(`✅ Configuración del despacho guardada. Moneda: ${newSymbol} (${newCurrency}) · IVA: ${applyIva ? `${state.settings.ivaPct}%` : 'Inactivo'}`, 'success');
}

export function toggleApiKeyVisibility() {
  const input = document.getElementById('cfg-api-key');
  const icon = document.getElementById('eye-icon');
  if (!input || !icon) return;
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash text-xs';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye text-xs';
  }
}

export function resetToDemoData() {
  if (!confirm('¿Restablecer el catálogo al ejemplo demo? Se sobrescribirán los datos actuales.')) return;
  state.treeData = JSON.parse(JSON.stringify(defaultTreeData));
  saveState();
  closeSettingsModal();
  closeApuPanel();
  // closeApuPanel() ya limpia activeSelectedId y ejecuta renderTAB1() una sola vez
  showToast('Catálogo demo restablecido', 'info');
}

export function clearAllData() {
  if (!confirm('¿Estás seguro de vaciar todo el catálogo de obra?')) return;
  state.treeData = [];
  saveState();
  closeSettingsModal();
  closeApuPanel();
  // closeApuPanel() ya limpia activeSelectedId y ejecuta renderTAB1() una sola vez
  showToast('Presupuesto vaciado', 'warning');
}

// Cambio de pestañas principales del proyecto de arquitectura:
// Alcances vs Presupuesto vs Seguimiento vs Calendario vs Estimaciones
export function switchTab(tab) {
  // Mapear compatibilidad de nombres
  if (tab === 'cat') tab = 'alcances';
  if (tab === 'insumos') tab = 'presupuesto';
  let requestedSubView = null;
  if (tab === 'especialistas') {
    tab = 'estimaciones';
    requestedSubView = 'especialistas';
  }

  if (typeof canCurrentUserAccessTab === 'function' && !canCurrentUserAccessTab(tab)) {
    const tabNames = {
      alcances: 'Alcances',
      presupuesto: 'Presupuesto',
      seguimiento: 'Seguimiento',
      calendario: 'Calendario',
      estimaciones: 'Estimaciones'
    };
    showToast(`🔒 No tienes permiso asignado para acceder a la pestaña "${tabNames[tab] || tab}". Esta pestaña está restringida solo a los miembros autorizados por el administrador.`, 'warning');
    return;
  }

  const views = {
    alcances: document.getElementById('view-alcances') || document.getElementById('view-cat'),
    presupuesto: document.getElementById('view-presupuesto') || document.getElementById('view-insumos'),
    seguimiento: document.getElementById('view-seguimiento'),
    calendario: document.getElementById('view-calendario'),
    estimaciones: document.getElementById('view-estimaciones')
  };

  const btns = {
    alcances: document.getElementById('tab-btn-alcances') || document.getElementById('tab-btn-cat'),
    presupuesto: document.getElementById('tab-btn-presupuesto') || document.getElementById('tab-btn-insumos'),
    seguimiento: document.getElementById('tab-btn-seguimiento'),
    calendario: document.getElementById('tab-btn-calendario'),
    estimaciones: document.getElementById('tab-btn-estimaciones')
  };

  const activeClass = "px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap";
  const inactiveClass = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap";

  // Ocultar todas las vistas y desactivar botones
  Object.keys(views).forEach(key => {
    if (views[key]) views[key].classList.add('hidden');
    if (btns[key]) btns[key].className = inactiveClass;
  });

  // Activar pestaña solicitada
  if (views[tab]) views[tab].classList.remove('hidden');
  if (btns[tab]) btns[tab].className = activeClass;

  // Renderizadores específicos de cada vista
  if (tab === 'alcances') {
    renderTAB1();
  } else if (tab === 'presupuesto') {
    renderPresupuestoView();
  } else if (tab === 'seguimiento') {
    renderSeguimientoView();
  } else if (tab === 'calendario') {
    renderCalendarioObra();
  } else if (tab === 'estimaciones') {
    renderEstimacionesView();
    if (requestedSubView) {
      try { switchEstimacionesSubView(requestedSubView); } catch (_) {}
    }
  }

  updateUndoRedoButtons();
  if (typeof renderAllTabAssignedMembers === 'function') {
    renderAllTabAssignedMembers();
  }
  syncProjectChatDivisionWithTab(tab);
}

// =========================================================================
// GESTOR UNIVERSAL DE CIERRE DE VENTANAS FLOTANTES AL CLIC EXTERIOR (BACKDROP)
// =========================================================================

export function closeAdminDualLoginModal() {
  if (typeof window._adminChoiceCommon === 'function') {
    window._adminChoiceCommon();
  } else {
    const modal = document.getElementById('modal-admin-dual-login');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.classList.remove('flex');
    }
  }
}

export function closeComparisonModal() {
  const modal = document.getElementById('comparisonModal');
  if (modal && !modal.classList.contains('hidden')) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Modal de Información de la Plataforma (Hero, Funciones Estrella y Comparativo)
export function openPlatformInfoModal() {
  const modal = document.getElementById('modal-platform-info');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

export function closePlatformInfoModal() {
  const modal = document.getElementById('modal-platform-info');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function handlePlatformInfoEmpiezaGratis() {
  closePlatformInfoModal();
  const user = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
  if (!user) {
    if (typeof window.renderPortalAuth === 'function') {
      window.renderPortalAuth('register');
    }
  } else {
    if (typeof window.openNuevoProyectoModal === 'function') {
      window.openNuevoProyectoModal();
    } else if (typeof window.renderPortalDashboard === 'function') {
      window.renderPortalDashboard();
    }
  }
}

export function handlePlatformInfoVerPlanes() {
  closePlatformInfoModal();
  if (typeof window.openSubscriptionModal === 'function') {
    window.openSubscriptionModal();
  }
}

export const MODAL_CLOSE_MAP = {
  'modal-platform-info': () => closePlatformInfoModal(),
  'cubikar-tutorial-hub-modal': () => (typeof window.closeTutorialHubModal === 'function' ? window.closeTutorialHubModal() : null),
  'settings-modal': () => (typeof window.closeSettingsModal === 'function' ? window.closeSettingsModal() : null),
  'logo-adjuster-modal': () => (typeof window.closeLogoAdjusterModal === 'function' ? window.closeLogoAdjusterModal() : null),
  'universal-import-modal': () => (typeof window.closeImportModal === 'function' ? window.closeImportModal() : null),
  'catalog-export-modal': () => (typeof window.closeExportModal === 'function' ? window.closeExportModal() : null),
  'catalog-print-modal': () => (typeof window.closeCatalogPrintModal === 'function' ? window.closeCatalogPrintModal() : null),
  'master-catalog-modal': () => (typeof window.closeMasterCatalogModal === 'function' ? window.closeMasterCatalogModal() : null),
  'modal-combinar-insumos': () => (typeof window.closeCombinarModal === 'function' ? window.closeCombinarModal() : null),
  'modal-google-auth': () => (typeof window.closeGoogleAuthModal === 'function' ? window.closeGoogleAuthModal() : null),
  'comparisonModal': () => (typeof window.closeComparisonModal === 'function' ? window.closeComparisonModal() : (typeof window.toggleComparisonModal === 'function' ? window.toggleComparisonModal() : null)),
  'modal-nuevo-proyecto': () => (typeof window.closeNuevoProyectoModal === 'function' ? window.closeNuevoProyectoModal() : null),
  'modal-perfil-usuario': () => (typeof window.closeProfileModal === 'function' ? window.closeProfileModal() : null),
  'modal-asignar-miembros-pestana': () => (typeof window.closeTabMembersAssignModal === 'function' ? window.closeTabMembersAssignModal() : null),
  'modal-calendario-jornada': () => (typeof window.closeCalendarioJornadaModal === 'function' ? window.closeCalendarioJornadaModal() : null),
  'modal-invitaciones-plan': () => (typeof window.closePlanInviteModal === 'function' ? window.closePlanInviteModal() : null),
  'modal-invitar-usuario': () => (typeof window.closeInviteModal === 'function' ? window.closeInviteModal() : null),
  'modal-copiar-de-otro-proyecto': () => (typeof window.closeImportConceptsModal === 'function' ? window.closeImportConceptsModal() : null),
  'modal-suscripcion-usuario': () => (typeof window.closeSubscriptionModal === 'function' ? window.closeSubscriptionModal() : null),
  'modal-admin-dual-login': () => (typeof window.closeAdminDualLoginModal === 'function' ? window.closeAdminDualLoginModal() : null),
  'modal-admin-cubikar': () => (typeof window.closeCubikarAdminModal === 'function' ? window.closeCubikarAdminModal() : null),
  'modal-admin-coadmins': () => (typeof window.closeCoAdminsModal === 'function' ? window.closeCoAdminsModal() : null),
  'modal-admin-market-rates': () => (typeof window.closeMarketRatesModal === 'function' ? window.closeMarketRatesModal() : null),
  'modal-cotizacion-proveedor': () => (typeof window.closeCotizacionModal === 'function' ? window.closeCotizacionModal() : null),
  'modal-calendario-dependencias': () => (typeof window.closeConceptDependenciesModal === 'function' ? window.closeConceptDependenciesModal() : null),
  'modal-calendario-ia': () => (typeof window.closeCalendarioAiModal === 'function' ? window.closeCalendarioAiModal() : null),
  'estimacion-fotos-modal': () => (typeof window.closeEstimacionConceptPhotosModal === 'function' ? window.closeEstimacionConceptPhotosModal() : null),
  'modal-ai-generator': () => (typeof window.closeAiGeneratorModal === 'function' ? window.closeAiGeneratorModal() : null),
  'apu-reference-modal': () => (typeof window.closeApuReferenceModal === 'function' ? window.closeApuReferenceModal() : null),
  'matriz-modal': () => (typeof window.closeMatrizModal === 'function' ? window.closeMatrizModal() : null),
  'project-chat-print-modal': () => (typeof window.closeProjectChatPrintModal === 'function' ? window.closeProjectChatPrintModal() : null),
  'modal-firmas-responsables': () => (typeof window.closeFirmasResponsablesModal === 'function' ? window.closeFirmasResponsablesModal() : null)
};

export function closeModalElement(modalEl) {
  if (!modalEl || !(modalEl instanceof HTMLElement)) return false;
  const modalId = modalEl.id;

  // 1. Invocar función registrada en MODAL_CLOSE_MAP si existe
  if (modalId && MODAL_CLOSE_MAP[modalId]) {
    try {
      MODAL_CLOSE_MAP[modalId]();
      return true;
    } catch (e) {
      console.warn(`[ModalBackdrop] Aviso al invocar cierre para ${modalId}:`, e);
    }
  }

  // 2. Intentar buscar y hacer clic en el botón de cerrar interno
  const closeBtn = modalEl.querySelector('button[onclick*="close"], button[onclick*="Close"], button[onclick*="toggleComparisonModal"]');
  if (closeBtn && typeof closeBtn.click === 'function') {
    closeBtn.click();
    return true;
  }

  // 3. Fallback genérico para cualquier modal no contemplado
  modalEl.classList.add('hidden');
  modalEl.classList.remove('flex');
  modalEl.style.display = 'none';
  return true;
}

export function isModalBackdropElement(el) {
  if (!el || !(el instanceof HTMLElement)) return false;

  // Ignorar contenedor de toasts o elementos no interactivos
  if (el.id === 'toast-container' || el.classList.contains('pointer-events-none')) return false;

  // Verificar si está visible
  if (el.classList.contains('hidden') || el.style.display === 'none') return false;

  // Si está registrado en el mapa de modales
  if (el.id && MODAL_CLOSE_MAP[el.id]) return true;

  // Si tiene clases de backdrop de modal flotante fijo de pantalla completa
  const hasFixedInset = el.classList.contains('fixed') && el.classList.contains('inset-0');
  const looksLikeModal = (el.id && (el.id.includes('modal') || el.id.includes('Modal'))) ||
                         (el.className && (el.className.includes('backdrop') || el.className.includes('bg-slate-900') || el.className.includes('bg-slate-950') || el.className.includes('bg-black')));

  return hasFixedInset && looksLikeModal;
}

export function getTopmostOpenModal() {
  const allModals = Array.from(document.querySelectorAll('.fixed.inset-0')).filter(el => {
    return isModalBackdropElement(el);
  });
  if (allModals.length === 0) return null;

  allModals.sort((a, b) => {
    const za = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
    const zb = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
    return za - zb;
  });
  return allModals[allModals.length - 1];
}

// Variable para prevenir cierre involuntario al soltar selección de texto arrastrada fuera del modal
let modalMouseDownTarget = null;
let isUniversalModalBackdropInitialized = false;

export function initUniversalModalBackdrop() {
  if (typeof document === 'undefined' || isUniversalModalBackdropInitialized) return;
  isUniversalModalBackdropInitialized = true;

  // Rastrear dónde inició el mousedown
  document.addEventListener('mousedown', (e) => {
    modalMouseDownTarget = e.target;
  }, true);

  // Al hacer clic, solo cerrar si el clic inició y terminó en el mismo fondo exterior
  document.addEventListener('click', (e) => {
    if (!modalMouseDownTarget || modalMouseDownTarget !== e.target) {
      modalMouseDownTarget = null;
      return;
    }
    modalMouseDownTarget = null;
    const target = e.target;
    if (isModalBackdropElement(target)) {
      closeModalElement(target);
    }
  });

  // Atajo universal: tecla Escape cierra el modal superior abierto
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Si hay un menú dropdown abierto, permitir que se cierre primero
      if (document.querySelector('.dropdown-menu.show')) {
        return;
      }
      const topModal = getTopmostOpenModal();
      if (topModal) {
        closeModalElement(topModal);
      }
    }
  });
}

// Inicializar listener inmediatamente
initUniversalModalBackdrop();

let floatingOutsideCloseBound = false;
let lastFloatingPointerDownTarget = null;

function isFloatingPopoverVisible(el) {
  if (!el || !el.isConnected || el.classList.contains('hidden')) return false;
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function isTargetOrOriginInsidePopoverSelector(target, downTarget, selector) {
  const toElement = (node) => (node instanceof Element ? node : node?.parentElement || null);
  const check = (node) => {
    const el = toElement(node);
    return Boolean(el && el.closest(selector));
  };
  return check(target) || check(downTarget);
}

function isClickInsideFloatingElement(target, downTarget, containerEl) {
  if (!containerEl) return false;
  return (target instanceof Node && containerEl.contains(target)) ||
    (downTarget instanceof Node && containerEl.contains(downTarget));
}

const SINGLE_POPOVER_CLOSE_RULES = [
  {
    isOpen: () =>
      isFloatingPopoverVisible(document.getElementById('portal-notifications-popover')) ||
      isFloatingPopoverVisible(document.getElementById('sidebar-notifications-popover')),
    allowedSelector: '#portal-notifications-wrapper, #sidebar-notifications-wrapper',
    close: () => window.closeMentionNotificationsPopover?.()
  },
  {
    isOpen: () => isFloatingPopoverVisible(document.getElementById('workspace-user-dropdown')),
    allowedSelector: '#user-menu-wrapper',
    close: () => window.closeUserDropdown?.()
  },
  {
    isOpen: () => isFloatingPopoverVisible(document.getElementById('portal-user-dropdown')),
    allowedSelector: '#portal-user-menu-wrapper',
    close: () => window.closePortalUserDropdown?.()
  },
  {
    isOpen: () =>
      isFloatingPopoverVisible(document.getElementById('project-chat-dock')),
    allowedSelector: '#project-chat-dock, #sidebar-project-chat-wrapper, #btn-sidebar-project-chat, [onclick*="openProjectChatForPartida"], [onclick*="toggleProjectChatDock"]',
    close: () => window.toggleProjectChatDock?.(false)
  }
];

function closeOpenNonModalPopovers(target, downTarget) {
  SINGLE_POPOVER_CLOSE_RULES.forEach((rule) => {
    if (rule.isOpen() && !isTargetOrOriginInsidePopoverSelector(target, downTarget, rule.allowedSelector)) {
      rule.close();
    }
  });

  document.querySelectorAll('[id^="menu-card-"]:not(.hidden)').forEach((menuEl) => {
    if (!isClickInsideFloatingElement(target, downTarget, menuEl.parentElement || menuEl)) {
      menuEl.classList.add('hidden');
    }
  });

  document.querySelectorAll('.dropdown-menu.show').forEach((menuEl) => {
    const container = menuEl.closest('.dropdown-container') || menuEl;
    if (!isClickInsideFloatingElement(target, downTarget, container)) {
      menuEl.classList.remove('show', 'dropdown-menu-up');
      if (container !== menuEl) container.classList.remove('is-open');
    }
  });
}

export function initFloatingWindowOutsideClose() {
  if (floatingOutsideCloseBound || typeof document === 'undefined') return;
  floatingOutsideCloseBound = true;

  document.addEventListener('pointerdown', (e) => {
    lastFloatingPointerDownTarget = e.target;
  }, true);

  document.addEventListener('click', (e) => {
    const downTarget = lastFloatingPointerDownTarget;
    lastFloatingPointerDownTarget = null;
    if (e.target instanceof Element && e.target.closest('#toast-container')) return;
    if (getTopmostOpenModal()) return;
    closeOpenNonModalPopovers(e.target, downTarget);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || getTopmostOpenModal()) return;
    SINGLE_POPOVER_CLOSE_RULES.forEach((rule) => {
      if (rule.isOpen()) rule.close();
    });
  });
}

initFloatingWindowOutsideClose();

// Exponer funciones globales
if (typeof window !== 'undefined') {
  window.closeAdminDualLoginModal = closeAdminDualLoginModal;
  window.closeComparisonModal = closeComparisonModal;
  window.openPlatformInfoModal = openPlatformInfoModal;
  window.closePlatformInfoModal = closePlatformInfoModal;
  window.handlePlatformInfoEmpiezaGratis = handlePlatformInfoEmpiezaGratis;
  window.handlePlatformInfoVerPlanes = handlePlatformInfoVerPlanes;
  window.MODAL_CLOSE_MAP = MODAL_CLOSE_MAP;
  window.closeModalElement = closeModalElement;
  window.initUniversalModalBackdrop = initUniversalModalBackdrop;
  window.initFloatingWindowOutsideClose = initFloatingWindowOutsideClose;
}


