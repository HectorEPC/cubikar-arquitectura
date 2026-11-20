// js/ui/tabLockController.js
// Controlador de Candado de Bloqueo por Pestaña (Alcances, Presupuesto, Seguimiento, Calendario)
// y por Estimación Individual en la pestaña Estimaciones.
// Cuando está bloqueado, solo permite consultar e imprimir la información (sin cambiar, mover ni editar).

import { getActiveProjectId } from '../config/constants.js?v=20261119_cf38';
import { showToast } from './notifications.js?v=20261119_cf38';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf38';
import { isEstimacionLocked, toggleActiveEstimacionLockState, setEstimacionLocked } from '../modules/estimaciones/estimacionesModel.js?v=20261119_cf38';
import { scheduleCronogramaCloudSync } from '../core/cloudModulesSyncService.js?v=20261119_cf38';

const STORAGE_KEY_TAB_LOCKS_PREFIX = 'adm_arq_tab_locks_';

const TAB_LABELS = {
  alcances: 'Alcances',
  presupuesto: 'Presupuesto',
  seguimiento: 'Seguimiento',
  calendario: 'Calendario',
  estimaciones: 'Estimaciones',
  cat: 'Alcances',
  insumos: 'Presupuesto'
};

let lockRenderCallback = null;

export function setTabLockRenderCallback(cb) {
  lockRenderCallback = cb;
}

export function getTabLocksStorageKey(projectId = null) {
  const pId = projectId || getActiveProjectId() || 'default';
  return `${STORAGE_KEY_TAB_LOCKS_PREFIX}${pId}`;
}

export function loadProjectTabLocks(projectId = null) {
  try {
    const raw = localStorage.getItem(getTabLocksStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        alcances: Boolean(parsed?.alcances ?? parsed?.cat),
        presupuesto: Boolean(parsed?.presupuesto ?? parsed?.insumos),
        seguimiento: Boolean(parsed?.seguimiento),
        calendario: Boolean(parsed?.calendario)
      };
    }
  } catch (err) {
    console.warn('Error al leer bloqueo de pestañas:', err);
  }
  return { alcances: false, presupuesto: false, seguimiento: false, calendario: false };
}

export function saveProjectTabLocks(locks, projectId = null) {
  try {
    const clean = {
      alcances: Boolean(locks?.alcances ?? locks?.cat),
      presupuesto: Boolean(locks?.presupuesto ?? locks?.insumos),
      seguimiento: Boolean(locks?.seguimiento),
      calendario: Boolean(locks?.calendario)
    };
    localStorage.setItem(getTabLocksStorageKey(projectId), JSON.stringify(clean));
    scheduleCronogramaCloudSync(projectId);
    return clean;
  } catch (err) {
    console.warn('Error al guardar bloqueo de pestañas:', err);
    return { alcances: false, presupuesto: false, seguimiento: false, calendario: false };
  }
}

export function isTabLocked(tabKey) {
  if (!canCurrentUserEditProject(getActiveProjectId())) {
    return true;
  }
  const key = tabKey === 'cat' ? 'alcances' : tabKey === 'insumos' ? 'presupuesto' : tabKey;
  if (key === 'estimaciones') {
    return isEstimacionLocked();
  }
  const locks = loadProjectTabLocks();
  return Boolean(locks[key]);
}

export function isActiveTabLocked(tabKey = 'alcances') {
  return isTabLocked(tabKey);
}

export function setTabLocked(tabKey, locked, { notify = true, rerender = true } = {}) {
  const key = tabKey === 'cat' ? 'alcances' : tabKey === 'insumos' ? 'presupuesto' : tabKey;
  if (!canCurrentUserEditProject()) {
    if (notify) {
      showToast('🔒 Modo solo lectura: no tienes permisos para bloquear o desbloquear pestañas.', 'warning');
    }
    return isTabLocked(key);
  }
  const isLocked = Boolean(locked);

  if (key === 'estimaciones') {
    setEstimacionLocked(null, isLocked);
  } else {
    const locks = loadProjectTabLocks();
    locks[key] = isLocked;
    saveProjectTabLocks(locks);
  }

  if (rerender && typeof lockRenderCallback === 'function') {
    lockRenderCallback(key, isLocked);
  }
  applyTabLocksToDOM();

  if (notify) {
    const label = TAB_LABELS[key] || key;
    if (isLocked) {
      showToast(`🔒 ${label} bloqueada: modo solo consulta e impresión`, 'warning');
    } else {
      showToast(`🔓 ${label} desbloqueada: edición habilitada`, 'info');
    }
  }

  return isLocked;
}

export function toggleTabLock(tabKey) {
  const key = tabKey === 'cat' ? 'alcances' : tabKey === 'insumos' ? 'presupuesto' : tabKey;
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: no tienes permisos para bloquear o desbloquear pestañas.', 'warning');
    return isTabLocked(key);
  }
  if (key === 'estimaciones') {
    const { locked, est } = toggleActiveEstimacionLockState();
    if (typeof lockRenderCallback === 'function') {
      lockRenderCallback('estimaciones', locked);
    }
    applyTabLocksToDOM();
    const estName = est?.nombre || 'Estimación';
    if (locked) {
      showToast(`🔒 ${estName} bloqueada: solo consulta e impresión`, 'warning');
    } else {
      showToast(`🔓 ${estName} desbloqueada: edición habilitada`, 'info');
    }
    return locked;
  }

  const nextState = !isTabLocked(key);
  return setTabLocked(key, nextState, { notify: true, rerender: true });
}

export function guardTabUnlocked(tabKey, customMessage = null) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: tu rol no permite modificar este proyecto.', 'warning');
    return false;
  }
  const key = tabKey === 'cat' ? 'alcances' : tabKey === 'insumos' ? 'presupuesto' : tabKey;
  if (!isTabLocked(key)) return true;
  const label = TAB_LABELS[key] || key;
  const msg = customMessage || (
    key === 'estimaciones'
      ? '🔒 Esta estimación está bloqueada (solo consulta e impresión). Desbloquee el candado para editar.'
      : `🔒 La pestaña "${label}" está bloqueada (solo consulta e impresión). Desbloquee el candado para realizar cambios.`
  );
  showToast(msg, 'warning');
  return false;
}

function updateStaticLockButtonUI(btnId, locked, tabLabel) {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById(btnId);
  if (!btn) return;

  if (locked) {
    btn.className = 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-700 text-[11px] px-2.5 py-1 rounded flex items-center justify-center font-bold shadow-sm transition active:scale-95 cursor-pointer shrink-0';
    btn.innerHTML = '<i class="fa-solid fa-lock text-[11px] text-white"></i>';
    btn.title = `🔒 ${tabLabel} bloqueada (Solo consulta e impresión) — Haz clic para desbloquear`;
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('data-locked', 'true');
    }
  } else {
    btn.className = 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] px-2.5 py-1 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer shrink-0';
    btn.innerHTML = '<i class="fa-solid fa-lock-open text-[11px] text-slate-600"></i>';
    btn.title = `Bloquear ${tabLabel} (Permitir solo consulta e impresión)`;
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('data-locked', 'false');
    }
  }
}

export function applyTabLocksToDOM() {
  if (typeof document === 'undefined') return;

  const locks = loadProjectTabLocks();
  const estLocked = isEstimacionLocked();
  const readOnly = !canCurrentUserEditProject();

  // 1. Botones de bloqueo estáticos
  updateStaticLockButtonUI('btn-lock-alcances', locks.alcances, 'Alcances');
  updateStaticLockButtonUI('btn-lock-cat', locks.alcances, 'Alcances');
  updateStaticLockButtonUI('btn-lock-presupuesto', locks.presupuesto, 'Presupuesto');
  updateStaticLockButtonUI('btn-lock-insumos', locks.presupuesto, 'Presupuesto');
  updateStaticLockButtonUI('btn-lock-seguimiento', locks.seguimiento, 'Seguimiento');

  // 2. data-tab-locked en contenedores (soportando ambos IDs #view-presupuesto y #view-insumos)
  ['view-alcances', 'view-cat'].forEach(id => {
    const el = document.getElementById(id);
    if (el && typeof el.setAttribute === 'function') {
      el.setAttribute('data-tab-locked', (locks.alcances || readOnly) ? 'true' : 'false');
    }
  });
  ['view-presupuesto', 'view-insumos'].forEach(id => {
    const el = document.getElementById(id);
    if (el && typeof el.setAttribute === 'function') {
      el.setAttribute('data-tab-locked', (locks.presupuesto || readOnly) ? 'true' : 'false');
    }
  });
  const viewSeguimiento = document.getElementById('view-seguimiento');
  if (viewSeguimiento && typeof viewSeguimiento.setAttribute === 'function') {
    viewSeguimiento.setAttribute('data-tab-locked', (locks.seguimiento || readOnly) ? 'true' : 'false');
  }
  const viewCalendario = document.getElementById('view-calendario');
  if (viewCalendario && typeof viewCalendario.setAttribute === 'function') {
    viewCalendario.setAttribute('data-tab-locked', (locks.calendario || readOnly) ? 'true' : 'false');
  }
  const viewEstimaciones = document.getElementById('view-estimaciones');
  if (viewEstimaciones && typeof viewEstimaciones.setAttribute === 'function') {
    viewEstimaciones.setAttribute('data-tab-locked', (estLocked || readOnly) ? 'true' : 'false');
  }

  // 3. Bloquear campos de encabezado en Alcances (mantener select-all-checkbox habilitado para consulta)
  const headerInputs = ['header-project-name', 'header-project-location'];
  headerInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = locks.alcances || readOnly;
  });
}
