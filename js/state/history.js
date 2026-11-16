import { state, persistLocalData } from './store.js?v=20261116_cf3';
import { showToast } from '../ui/notifications.js?v=20261116_cf3';
import { isTabLocked, guardTabUnlocked } from '../ui/tabLockController.js?v=20261116_cf3';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261116_cf3';

export let undoStack = [];
export let redoStack = [];

let renderCallback = null;
export function setHistoryRenderCallback(cb) {
  renderCallback = cb;
}

export function saveState() {
  if (!canCurrentUserEditProject()) return;
  undoStack.push(JSON.stringify(state.treeData));
  if (undoStack.length > 20) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
  persistLocalData(false);
}

export function updateUndoRedoButtons() {
  const canEdit = canCurrentUserEditProject();
  const canUndo = canEdit && undoStack.length > 0;
  const canRedo = canEdit && redoStack.length > 0;
  const catLocked = isTabLocked('alcances');
  const insLocked = isTabLocked('presupuesto');

  // Actualizar botones de TAB1-CAT-BASE / Alcances
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = !canUndo || catLocked;
  if (redoBtn) redoBtn.disabled = !canRedo || catLocked;

  // Actualizar botones de Presupuesto / Insumos
  const undoBtnIns = document.getElementById('btn-undo-insumos');
  const redoBtnIns = document.getElementById('btn-redo-insumos');
  if (undoBtnIns) undoBtnIns.disabled = !canUndo || insLocked;
  if (redoBtnIns) redoBtnIns.disabled = !canRedo || insLocked;
}

function getActiveHistoryTabKey() {
  if (typeof document === 'undefined') return 'alcances';
  const viewPresupuesto = document.getElementById('view-presupuesto');
  const viewInsumos = document.getElementById('view-insumos');
  const isPresupuestoVisible =
    (viewPresupuesto && !viewPresupuesto.classList.contains('hidden')) ||
    (viewInsumos && !viewInsumos.classList.contains('hidden'));
  return isPresupuestoVisible ? 'presupuesto' : 'alcances';
}

export function undoAction() {
  if (!canCurrentUserEditProject()) {
    showToast('ðŸ”’ Modo lectura: tu rol no permite deshacer cambios.', 'warning');
    return;
  }
  const activeTabKey = getActiveHistoryTabKey();
  if (!guardTabUnlocked(activeTabKey)) return;
  if (undoStack.length === 0) return;
  redoStack.push(JSON.stringify(state.treeData));
  const prevState = undoStack.pop();
  state.treeData = JSON.parse(prevState);
  persistLocalData(true);
  if (renderCallback) renderCallback();
  updateUndoRedoButtons();
  showToast('Deshecho', 'info');
}

export function redoAction() {
  if (!canCurrentUserEditProject()) {
    showToast('ðŸ”’ Modo lectura: tu rol no permite rehacer cambios.', 'warning');
    return;
  }
  const activeTabKey = getActiveHistoryTabKey();
  if (!guardTabUnlocked(activeTabKey)) return;
  if (redoStack.length === 0) return;
  undoStack.push(JSON.stringify(state.treeData));
  const nextState = redoStack.pop();
  state.treeData = JSON.parse(nextState);
  persistLocalData(true);
  if (renderCallback) renderCallback();
  updateUndoRedoButtons();
  showToast('Rehecho', 'info');
}
