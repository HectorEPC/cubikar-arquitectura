import { state, persistLocalData } from '../../state/store.js?v=20261116_cf5';
import { saveState } from '../../state/history.js?v=20261116_cf5';
import { showToast } from '../../ui/notifications.js?v=20261116_cf5';
import { renderTAB1, closeApuPanel, highlightCatalogRowInPlace } from './catalogView.js?v=20261116_cf5';
import { renderInsumosGenerales } from '../insumosGenerales/insumosView.js?v=20261116_cf5';
import { getActiveProjectId, STORAGE_KEY_CLIPBOARD } from '../../config/constants.js?v=20261116_cf5';
import { getProjectById, canCurrentUserEditProject } from '../portal/projectService.js?v=20261116_cf5';
import { hasOwnCotizaciones, getEffectivePrecioUnitario, calculateProrrateoCascade, round2 } from '../../core/calculations.js?v=20261116_cf5';
import { guardTabUnlocked } from '../../ui/tabLockController.js?v=20261116_cf5';
import { AUTO_ROW_PALETTE } from '../../core/colors.js?v=20261116_cf5';
import { broadcastConceptChange, pushConceptUpdateToSupabase } from '../../core/realtimeSync.js?v=20261116_cf5';

function createNodeUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Buscar un nodo por su ID, UUID o Clave recursivamente
export function findNodeById(nodes, id) {
  if (!Array.isArray(nodes) || !id) return null;
  for (let n of nodes) {
    if (n.id === id || (n.uuid && n.uuid === id) || (n.clave && n.clave === id)) return n;
    if (n.children) {
      let found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Obtener contexto de un nodo (padre, arreglo contenedor, índice)
export function findNodeContext(nodes, id, parent = null, parentArray = null) {
  if (!parentArray) parentArray = nodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) {
      return {
        node: n,
        parent: parent,
        parentArray: nodes,
        index: i
      };
    }
    if (n.children && n.children.length > 0) {
      const found = findNodeContext(n.children, id, n, n.children);
      if (found) return found;
    }
  }
  return null;
}

// Obtener arreglo contenedor directo de un nodo
export function findParentArrayOfNode(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes;
    if (nodes[i].children) {
      let found = findParentArrayOfNode(nodes[i].children, id);
      if (found) return found;
    }
  }
  return null;
}

// Obtener la ruta jerárquica de descripciones para dar contexto completo a la IA
export function getNodeHierarchyPath(nodes, targetId, path = []) {
  for (let n of nodes) {
    const current = [...path, n.descripcion];
    if (n.id === targetId) return current;
    if (n.children && n.children.length > 0) {
      const res = getNodeHierarchyPath(n.children, targetId, current);
      if (res) return res;
    }
  }
  return null;
}

// Renumeración jerárquica de claves (1, 1.1, 1.1.1...)
export function recalculateClaves(nodes, parentClave = '') {
  nodes.forEach((node, idx) => {
    node.clave = parentClave ? `${parentClave}.${idx + 1}` : `${idx + 1}`;
    if (node.children && node.children.length > 0) {
      recalculateClaves(node.children, node.clave);
    }
  });
}

// Agregar partida raíz principal
export function addRootRow() {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para agregar partidas en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  saveState();
  const newId = createNodeUuid();
  const newPartida = {
    id: newId,
    uuid: newId,
    clave: '',
    descripcion: 'NUEVA PARTIDA PRINCIPAL',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    expanded: true,
    selected: false,
    children: []
  };
  state.treeData.push(newPartida);
  recalculateClaves(state.treeData);
  persistLocalData(true, {
    changeType: 'row_added',
    highlightId: newId,
    changeDescription: 'una partida principal',
    patch: { type: 'add_root_row', node: newPartida }
  });
  renderTAB1();
  showToast('Partida agregada', 'success');
}

// Agregar sub-concepto / sub-renglón
export function addChildRow(parentId, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para agregar conceptos en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  const parent = findNodeById(state.treeData, parentId);
  if (!parent) return;

  saveState();
  if (!parent.children) parent.children = [];
  parent.unidad = 'lote';
  const newId = createNodeUuid();
  const newNode = {
    id: newId,
    uuid: newId,
    clave: '',
    descripcion: 'Nuevo Sub-concepto',
    unidad: 'm2',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    expanded: true,
    selected: false,
    children: []
  };
  parent.children.push(newNode);
  parent.expanded = true;

  recalculateClaves(state.treeData);
  persistLocalData(true, {
    changeType: 'row_added',
    highlightId: newId,
    changeDescription: 'un nuevo concepto',
    patch: { type: 'add_child_row', parentId, node: newNode }
  });
  renderTAB1();
  showToast('Sub-renglón agregado', 'success');
}

// Duplicar un nodo
export function duplicarNode(id, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para duplicar renglones.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  saveState();
  const nodeToDuplicate = findNodeById(state.treeData, id);
  if (!nodeToDuplicate) return;

  function cloneNode(node) {
    return {
      id: '_' + Math.random().toString(36).substr(2, 9),
      clave: '',
      descripcion: node.descripcion + ' (Copia)',
      unidad: node.unidad,
      cantidad: node.cantidad,
      precioUnitario: 0,
      costoDirecto: 0,
      expanded: node.expanded,
      selected: node.selected,
      color: node.color || null,
      googleSearchQueries: node.googleSearchQueries ? [...node.googleSearchQueries] : [],
      googleSources: node.googleSources ? [...node.googleSources] : [],
      aiTips: node.aiTips || '',
      insumos: JSON.parse(JSON.stringify(node.insumos || [])),
      children: (node.children || []).map(child => cloneNode(child))
    };
  }

  const cloned = cloneNode(nodeToDuplicate);
  const parentList = findParentArrayOfNode(state.treeData, id);
  if (parentList) {
    const index = parentList.findIndex(n => n.id === id);
    parentList.splice(index + 1, 0, cloned);
    recalculateClaves(state.treeData);
    persistLocalData(true, {
      changeType: 'row_added',
      highlightId: cloned.id,
      changeDescription: 'renglón duplicado',
      patch: { type: 'duplicate_node', id, clonedNode: cloned }
    });
    renderTAB1();
    showToast('Renglón duplicado', 'success');
  }
}

export function duplicarSelectedRow() {
  if (!state.activeSelectedId) {
    showToast('Selecciona una fila primero', 'warning');
    return;
  }
  duplicarNode(state.activeSelectedId);
}

// ==========================================
// PORTAPAPELES UNIVERSAL (ENTRE PROYECTOS)
// ==========================================

export function getClipboardData() {
  if (state.clipboardNode) {
    return {
      node: state.clipboardNode,
      meta: state.clipboardMeta || {
        sourceProjectId: null,
        sourceProjectName: 'Proyecto',
        insumosCount: Array.isArray(state.clipboardNode.insumos) ? state.clipboardNode.insumos.length : 0
      }
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLIPBOARD);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.clipboardNode = parsed.concept || parsed;
      state.clipboardMeta = {
        sourceProjectId: parsed.sourceProjectId || null,
        sourceProjectName: parsed.sourceProjectName || 'Otro Proyecto',
        insumosCount: parsed.insumosCount || (parsed.concept?.insumos?.length || 0),
        copiedAt: parsed.copiedAt || null
      };
      return {
        node: state.clipboardNode,
        meta: state.clipboardMeta
      };
    }
  } catch (e) {
    console.warn('Error al leer portapapeles compartido:', e);
  }

  return null;
}

// Copiar concepto con su respectiva matriz APU al portapapeles universal
export function copiarNode(id, e) {
  if (e) e.stopPropagation();
  const node = findNodeById(state.treeData, id);
  if (!node) return;

  const currentProjId = getActiveProjectId();
  const currentProj = currentProjId ? getProjectById(currentProjId) : null;
  const projectName = currentProj ? currentProj.projectName : (state.settings.projectName || 'Proyecto Actual');

  const clonedNode = JSON.parse(JSON.stringify(node));
  const insumosCount = Array.isArray(clonedNode.insumos) ? clonedNode.insumos.length : 0;

  const payload = {
    concept: clonedNode,
    sourceProjectId: currentProjId || 'default',
    sourceProjectName: projectName,
    insumosCount: insumosCount,
    copiedAt: new Date().toISOString()
  };

  state.clipboardNode = clonedNode;
  state.clipboardMeta = payload;

  try {
    localStorage.setItem(STORAGE_KEY_CLIPBOARD, JSON.stringify(payload));
  } catch (err) {
    console.error('Error al persistir en portapapeles compartido:', err);
  }

  updateClipboardUI();

  const matrizInfo = insumosCount > 0 
    ? ` con su matriz APU (${insumosCount} insumo${insumosCount === 1 ? '' : 's'})` 
    : ' (sin insumos)';
  const claveTxt = node.clave ? `[${node.clave}] ` : '';
  showToast(`Copiado: ${claveTxt}"${node.descripcion.slice(0, 35)}..."${matrizInfo}. Listo para pegar en este u otro proyecto.`);
}

export function copiarSelectedRow() {
  if (!state.activeSelectedId) {
    showToast('Selecciona un concepto primero para copiarlo.', 'warning');
    return;
  }
  copiarNode(state.activeSelectedId);
}

// Pegar concepto copiado (con su respectiva matriz APU) en la ubicación seleccionada
export function pegarNode(targetId, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para pegar conceptos en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;

  const clip = getClipboardData();
  if (!clip || !clip.node) {
    showToast('No hay ningún concepto copiado en el portapapeles. Copia un concepto primero.', 'warning');
    return;
  }

  saveState();

  const { node: sourceNode, meta } = clip;
  const isDifferentProject = meta && meta.sourceProjectId && meta.sourceProjectId !== getActiveProjectId();

  // Buscar lista de destino
  let parentList = null;
  let insertIndex = -1;

  if (targetId) {
    parentList = findParentArrayOfNode(state.treeData, targetId);
    if (parentList) {
      insertIndex = parentList.findIndex(n => n.id === targetId);
    }
  }

  if (!parentList) {
    parentList = state.treeData;
    insertIndex = parentList.length - 1;
  }

  // Renovación recursiva de IDs únicos y preservación íntegra de la Matriz APU
  function renewNodeDeep(n) {
    n.id = '_' + Math.random().toString(36).substr(2, 9);
    n.selected = true;

    // Clonar matriz de insumos sin mutar referencias
    if (Array.isArray(n.insumos)) {
      n.insumos = JSON.parse(JSON.stringify(n.insumos));
    } else {
      n.insumos = [];
    }

    // Sin cotizaciones agregadas, el precio unitario y costo directo parten en 0.00
    if (hasOwnCotizaciones(n)) {
      n.precioUnitario = getEffectivePrecioUnitario(n);
    } else {
      n.precioUnitario = 0;
      n.costoDirecto = 0;
    }

    if (Array.isArray(n.children)) {
      n.children.forEach(c => renewNodeDeep(c));
    }
  }

  const pastedNode = JSON.parse(JSON.stringify(sourceNode));
  renewNodeDeep(pastedNode);

  // Si se pega dentro del mismo proyecto, agregar distintivo "(Copia)"; si viene de otro proyecto, conservar limpio
  if (!isDifferentProject) {
    pastedNode.descripcion = pastedNode.descripcion.endsWith('(Copia)')
      ? pastedNode.descripcion
      : `${pastedNode.descripcion} (Copia)`;
  }

  const position = insertIndex >= 0 ? insertIndex + 1 : parentList.length;
  parentList.splice(position, 0, pastedNode);

  recalculateClaves(state.treeData);
  persistLocalData();
  renderTAB1();

  // Resaltar la fila pegada en la tabla (el panel lateral solo se abre con el botón de fila)
  highlightCatalogRowInPlace(pastedNode.id);

  const insCount = Array.isArray(pastedNode.insumos) ? pastedNode.insumos.length : 0;
  const originStr = (meta && meta.sourceProjectName) ? ` desde "${meta.sourceProjectName}"` : '';
  showToast(`¡Concepto pegado con su Matriz APU (${insCount} insumo${insCount === 1 ? '' : 's'})${originStr}!`, 'success');
}

export function pegarSelectedRow() {
  const clip = getClipboardData();
  if (!clip || !clip.node) {
    showToast('No hay ningún concepto copiado en el portapapeles.', 'warning');
    return;
  }
  const targetId = state.activeSelectedId || (state.treeData.length > 0 ? state.treeData[state.treeData.length - 1].id : null);
  pegarNode(targetId);
}

// Limpiar portapapeles
export function limpiarPortapapeles() {
  state.clipboardNode = null;
  state.clipboardMeta = null;
  try {
    localStorage.removeItem(STORAGE_KEY_CLIPBOARD);
  } catch (e) {}
  updateClipboardUI();
  showToast('Portapapeles vaciado.');
}

// Actualizar el indicador visual de concepto copiado en la interfaz
export function updateClipboardUI() {
  const clip = getClipboardData();
  const indicator = document.getElementById('clipboard-indicator');
  const btnPegar = document.getElementById('btn-toolbar-pegar');

  if (btnPegar) {
    if (clip && clip.node) {
      btnPegar.classList.remove('opacity-40');
      btnPegar.title = `Pegar concepto copiado: [${clip.node.clave || ''}] ${clip.node.descripcion.slice(0, 30)}... (${clip.meta?.insumosCount || 0} insumos)`;
    } else {
      btnPegar.title = 'No hay ningún concepto copiado en el portapapeles';
    }
  }

  if (indicator) {
    indicator.innerHTML = '';
    indicator.classList.add('hidden');
    indicator.classList.remove('flex');
  }
}

// Mover nodo arriba o abajo
export function moverNode(id, direction, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para mover filas en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  const ctx = findNodeContext(state.treeData, id);
  if (!ctx) return;

  saveState();

  const { node, parent, parentArray, index } = ctx;
  const hasChildren = node.children && node.children.length > 0;

  if (direction === 'up') {
    if (index > 0) {
      const prevSibling = parentArray[index - 1];
      if (!hasChildren && prevSibling.children && prevSibling.children.length > 0) {
        parentArray.splice(index, 1);
        prevSibling.children.push(node);
        prevSibling.expanded = true;
      } else {
        parentArray[index] = prevSibling;
        parentArray[index - 1] = node;
      }
    } else {
      if (parent) {
        const grandCtx = findNodeContext(state.treeData, parent.id);
        if (grandCtx) {
          parentArray.splice(index, 1);
          grandCtx.parentArray.splice(grandCtx.index, 0, node);
        }
      } else {
        showToast('Ya está en la primera posición', 'info');
        return;
      }
    }
  } else if (direction === 'down') {
    if (index < parentArray.length - 1) {
      const nextSibling = parentArray[index + 1];
      if (!hasChildren && nextSibling.children && nextSibling.children.length > 0) {
        parentArray.splice(index, 1);
        nextSibling.children.unshift(node);
        nextSibling.expanded = true;
      } else {
        parentArray[index] = nextSibling;
        parentArray[index + 1] = node;
      }
    } else {
      if (parent) {
        const grandCtx = findNodeContext(state.treeData, parent.id);
        if (grandCtx) {
          parentArray.splice(index, 1);
          grandCtx.parentArray.splice(grandCtx.index + 1, 0, node);
        }
      } else {
        showToast('Ya está en la última posición', 'info');
        return;
      }
    }
  }

  recalculateClaves(state.treeData);
  const newCtx = findNodeContext(state.treeData, id);
  persistLocalData(true, {
    changeType: 'row_moved',
    highlightId: id,
    changeDescription: 'orden de filas',
    patch: {
      type: 'move_node',
      id,
      direction,
      targetParentId: newCtx?.parent?.id || null,
      newIndex: newCtx ? newCtx.index : 0
    }
  });
  renderTAB1();

  if (state.activeSelectedId === id) {
    const selNode = findNodeById(state.treeData, id);
    if (selNode) {
      const apuClave = document.getElementById('apu-clave');
      if (apuClave) apuClave.innerText = selNode.clave;
    }
  }

  setTimeout(() => {
    const selectedEl = document.querySelector('.selected-row');
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, 40);
}

export function moverSelectedRow(direction) {
  if (!state.activeSelectedId) {
    showToast('Selecciona una fila primero', 'warning');
    return;
  }
  moverNode(state.activeSelectedId, direction);
}

// Eliminar nodo individual
export function deleteNode(id, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para eliminar filas en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  saveState();
  function removeRecursive(nodes) {
    return nodes.filter(node => {
      if (node.id === id) return false;
      if (node.children) node.children = removeRecursive(node.children);
      return true;
    });
  }
  state.treeData = removeRecursive(state.treeData);
  if (state.activeSelectedId === id) closeApuPanel();
  recalculateClaves(state.treeData);
  persistLocalData(true, {
    changeType: 'row_deleted',
    changeDescription: 'una fila del catálogo',
    patch: { type: 'delete_node', id }
  });
  renderTAB1();
  showToast('Fila eliminada', 'info');
}

// Eliminar filas marcadas o fila seleccionada
export function deleteSelectedRow() {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para eliminar filas en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  function countCheckedNodes(nodes) {
    let count = 0;
    nodes.forEach(n => {
      if (n.selected) count++;
      if (n.children) count += countCheckedNodes(n.children);
    });
    return count;
  }

  const checkedTotal = countCheckedNodes(state.treeData);

  if (checkedTotal > 0) {
    if (!confirm(`¿Deseas eliminar las ${checkedTotal} filas marcadas con Checkbox?`)) return;
    saveState();

    const deletedIds = [];
    function collectCheckedIds(nodes) {
      nodes.forEach(n => {
        if (n.selected) deletedIds.push(n.id);
        if (n.children) collectCheckedIds(n.children);
      });
    }
    collectCheckedIds(state.treeData);

    function filterOutChecked(nodes) {
      return nodes.filter(n => {
        if (n.selected) return false;
        if (n.children) n.children = filterOutChecked(n.children);
        return true;
      });
    }

    state.treeData = filterOutChecked(state.treeData);

    if (state.activeSelectedId) {
      const stillExists = findNodeById(state.treeData, state.activeSelectedId);
      if (!stillExists) closeApuPanel();
    }

    recalculateClaves(state.treeData);
    persistLocalData(true, {
      changeType: 'row_deleted',
      changeDescription: `${checkedTotal} fila(s) del catálogo`,
      patch: { type: 'delete_nodes', ids: deletedIds }
    });
  renderTAB1();
  showToast(`${checkedTotal} filas eliminadas`, 'info');
  } else if (state.activeSelectedId) {
    if (confirm('¿Deseas eliminar la fila seleccionada actual?')) {
      deleteNode(state.activeSelectedId);
    }
  } else {
    showToast('Selecciona una fila o marca casillas para eliminar', 'warning');
  }
}

// Actualizar un campo de un nodo (descripcion, unidad, cantidad, precioUnitario, porcentaje_relativo, costo_proveedor)
export function updateNode(id, field, value) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para editar conceptos en este proyecto.', 'warning');
    renderTAB1();
    return;
  }
  if (!guardTabUnlocked('cat')) {
    renderTAB1();
    return;
  }
  const node = findNodeById(state.treeData, id);
  if (node) {
    if (field === 'cantidad' || field === 'precioUnitario' || field === 'costoDirecto' || field === 'costo_proveedor') {
      node[field] = Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
    } else if (field === 'porcentaje_relativo') {
      const parsed = Math.max(0, Math.min(100, Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100));
      node.porcentaje_relativo = parsed;
    } else {
      node[field] = value;
    }
    calculateProrrateoCascade(state.treeData);
    try {
      broadcastConceptChange(node);
      pushConceptUpdateToSupabase(node);
    } catch (_) {}
    persistLocalData(true, {
      changeType: 'text_edit',
      highlightId: node.id,
      changeDescription: `el concepto "${node.clave || ''}"`,
      patch: {
        type: 'update_field',
        id: node.id,
        uuid: node.uuid || node.id,
        clave: node.clave || '',
        field,
        value: node[field]
      },
      skipFullCloudSync: field !== 'porcentaje_relativo'
    });
    renderTAB1();
  }
}

// Repartir 100% equitativamente entre los subconceptos de un grupo
export function repartirEquitativamente(parentId, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  if (!guardTabUnlocked('cat')) return;
  const parent = findNodeById(state.treeData, parentId);
  if (!parent || !Array.isArray(parent.children) || parent.children.length === 0) return;

  saveState();
  const n = parent.children.length;
  const baseShare = Math.floor((100 / n) * 100) / 100;
  let runningTotal = 0;
  parent.children.forEach((c, idx) => {
    if (idx === n - 1) {
      c.porcentaje_relativo = round2(100 - runningTotal);
    } else {
      c.porcentaje_relativo = baseShare;
      runningTotal = round2(runningTotal + baseShare);
    }
  });

  calculateProrrateoCascade(state.treeData);
  persistLocalData();
  renderTAB1();
  showToast(`Ponderación 100% repartida equitativamente entre los ${n} subconceptos de [${parent.clave || ''}].`, 'success');
}

// Plegar / desplegar hijos de un nodo
export function toggleExpand(id, e) {
  if (e) e.stopPropagation();
  const node = findNodeById(state.treeData, id);
  if (node) {
    node.expanded = !node.expanded;
    persistLocalData();
    renderTAB1();
  }
}

// Agrupar (colapsar) todas las partidas del Catálogo Base
export function collapseAllCatalogNodes() {
  function collapseRecursive(nodes) {
    nodes.forEach(n => {
      if (n.children && n.children.length > 0) {
        n.expanded = false;
        collapseRecursive(n.children);
      }
    });
  }
  collapseRecursive(state.treeData);
  persistLocalData();
  renderTAB1();
  showToast('Se han agrupado todas las partidas del catálogo', 'info');
}

// Desagrupar (expandir) todas las partidas del Catálogo Base
export function expandAllCatalogNodes() {
  function expandRecursive(nodes) {
    nodes.forEach(n => {
      if (n.children && n.children.length > 0) {
        n.expanded = true;
        expandRecursive(n.children);
      }
    });
  }
  expandRecursive(state.treeData);
  persistLocalData();
  renderTAB1();
  showToast('Se han desagrupado y mostrado todos los conceptos', 'info');
}

// Acción de barra de herramientas: Agrupar conceptos
export function agruparCatalogoConceptos() {
  if (state.activeSelectedId) {
    const selectedNode = findNodeById(state.treeData, state.activeSelectedId);
    if (selectedNode && selectedNode.children && selectedNode.children.length > 0) {
      selectedNode.expanded = false;
      persistLocalData();
      renderTAB1();
      showToast(`Partida ${selectedNode.clave || ''} agrupada`, 'info');
      return;
    }
  }
  collapseAllCatalogNodes();
}

// Acción de barra de herramientas: Desagrupar conceptos
export function desagruparCatalogoConceptos() {
  if (state.activeSelectedId) {
    const selectedNode = findNodeById(state.treeData, state.activeSelectedId);
    if (selectedNode && selectedNode.children && selectedNode.children.length > 0) {
      selectedNode.expanded = true;
      persistLocalData();
      renderTAB1();
      showToast(`Partida ${selectedNode.clave || ''} desagrupada`, 'info');
      return;
    }
  }
  expandAllCatalogNodes();
}

// Actualizar color propio de un nodo
export function updateNodeColor(id, newColor, event) {
  if (event) event.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para editar colores en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) {
    renderTAB1();
    return;
  }
  const node = findNodeById(state.treeData, id);
  if (!node) return;
  saveState();
  node.color = newColor;
  persistLocalData(false, { changeType: 'color_updated', highlightId: id, changeDescription: `color de ${node.clave || 'partida'}` });
  renderTAB1();
  showToast(`Color asignado a ${node.clave || 'partida'}`, 'success');
}

// Quitar color propio de un nodo
export function clearNodeColor(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!guardTabUnlocked('cat')) return;
  const node = findNodeById(state.treeData, id);
  if (!node) return;
  saveState();
  delete node.color;
  persistLocalData();
  renderTAB1();
  showToast(`Color restablecido en ${node.clave || 'partida'}`, 'info');
}

// Asignar colores automáticamente a las filas de Nivel 1 (propagándose progresivamente a sus sub-filas)
export function autoAssignCatalogColors(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!guardTabUnlocked('cat')) return;

  const roots = Array.isArray(state.treeData) ? state.treeData : [];
  if (roots.length === 0) {
    showToast('No hay filas en Alcances para asignar color.', 'warning');
    return;
  }

  saveState();
  const uncoloredRoots = roots.filter(root => !root.color);

  if (uncoloredRoots.length > 0) {
    let paletteIdx = 0;
    const usedCount = new Map();
    roots.forEach(r => {
      if (r.color) {
        const hex = String(r.color).toLowerCase();
        usedCount.set(hex, (usedCount.get(hex) || 0) + 1);
      }
    });

    roots.forEach((root, idx) => {
      if (root.color) return;
      const prevColor = idx > 0 && roots[idx - 1].color ? String(roots[idx - 1].color).toLowerCase() : '';
      const nextColor = idx + 1 < roots.length && roots[idx + 1].color ? String(roots[idx + 1].color).toLowerCase() : '';
      let chosen = null;

      for (let attempt = 0; attempt < AUTO_ROW_PALETTE.length; attempt++) {
        const cand = AUTO_ROW_PALETTE[(paletteIdx + attempt) % AUTO_ROW_PALETTE.length];
        const candLow = cand.toLowerCase();
        if (!usedCount.has(candLow) && candLow !== prevColor && candLow !== nextColor) {
          chosen = cand;
          paletteIdx = (paletteIdx + attempt + 1) % AUTO_ROW_PALETTE.length;
          break;
        }
      }

      if (!chosen) {
        for (let attempt = 0; attempt < AUTO_ROW_PALETTE.length; attempt++) {
          const cand = AUTO_ROW_PALETTE[(paletteIdx + attempt) % AUTO_ROW_PALETTE.length];
          const candLow = cand.toLowerCase();
          if (candLow !== prevColor && candLow !== nextColor) {
            chosen = cand;
            paletteIdx = (paletteIdx + attempt + 1) % AUTO_ROW_PALETTE.length;
            break;
          }
        }
      }

      root.color = chosen || AUTO_ROW_PALETTE[idx % AUTO_ROW_PALETTE.length];
      const finalLow = root.color.toLowerCase();
      usedCount.set(finalLow, (usedCount.get(finalLow) || 0) + 1);
    });
  } else {
    const firstHex = String(roots[0].color || '').toLowerCase();
    const firstIdx = AUTO_ROW_PALETTE.findIndex(c => c.toLowerCase() === firstHex);
    const startOffset = firstIdx >= 0 ? (firstIdx + 1) % AUTO_ROW_PALETTE.length : 1;
    roots.forEach((root, idx) => {
      root.color = AUTO_ROW_PALETTE[(idx + startOffset) % AUTO_ROW_PALETTE.length];
    });
  }

  persistLocalData();
  renderTAB1();
  showToast('Colores asignados automáticamente a filas y sub-filas', 'success');
}

// Checkbox individual de fila (con propagación a hijos)
export function toggleSelectNode(id, isChecked, e) {
  if (e) e.stopPropagation();
  if (!guardTabUnlocked('cat')) {
    renderTAB1();
    return;
  }
  const node = findNodeById(state.treeData, id);
  if (!node) return;

  function setSelectRecursive(targetNode, val) {
    targetNode.selected = val;
    if (targetNode.children) {
      targetNode.children.forEach(child => setSelectRecursive(child, val));
    }
  }

  setSelectRecursive(node, isChecked);
  persistLocalData();
  renderTAB1();

  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
}

// Seleccionar o deseleccionar todas las filas
export function toggleSelectAll(isChecked) {
  if (!guardTabUnlocked('cat')) {
    renderTAB1();
    return;
  }
  function setSelectAllRecursive(nodes, val) {
    nodes.forEach(n => {
      n.selected = val;
      if (n.children) setSelectAllRecursive(n.children, val);
    });
  }
  setSelectAllRecursive(state.treeData, isChecked);
  persistLocalData();
  renderTAB1();

  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
}

// Obtener todos los conceptos hoja que tienen la casilla (checkbox) seleccionada
export function getSelectedLeafConcepts() {
  const selected = [];
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      const isLeaf = !n.children || n.children.length === 0;
      if (n.selected && isLeaf) {
        selected.push(n);
      }
      if (n.children && n.children.length > 0) {
        walk(n.children);
      }
    }
  }
  walk(state.treeData);
  return selected;
}
