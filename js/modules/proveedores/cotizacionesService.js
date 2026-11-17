import { state, persistLocalData } from '../../state/store.js?v=20261116_cf13';
import { findNodeById } from '../catalog/treeService.js?v=20261116_cf13';
import { renderTAB1 } from '../catalog/catalogView.js?v=20261116_cf13';
import { showToast } from '../../ui/notifications.js?v=20261116_cf13';
import { formatMoney } from '../../core/formatters.js?v=20261116_cf13';
import { round2, hasOwnCotizaciones, getOwnWinnerCotizacion, calculateParentTotal, calculateProrrateoCascade } from '../../core/calculations.js?v=20261116_cf13';
import { renderCotizacionesSidePanel } from './proveedoresView.js?v=20261116_cf13';
import { canCurrentUserEditProject } from '../portal/projectService.js?v=20261116_cf13';
import { guardTabUnlocked } from '../../ui/tabLockController.js?v=20261116_cf13';

/**
 * Devuelve la ruta jerárquica de nodos desde Nivel 1 hasta el nodo objetivo.
 * @param {Array} nodes
 * @param {string} targetId
 * @param {Array} trail
 * @returns {Array|null}
 */
export function findNodeLineage(nodes, targetId, trail = []) {
  if (!Array.isArray(nodes) || !targetId) return null;
  for (const node of nodes) {
    const nextTrail = [...trail, node];
    if (String(node.id) === String(targetId)) return nextTrail;
    if (Array.isArray(node.children) && node.children.length > 0) {
      const found = findNodeLineage(node.children, targetId, nextTrail);
      if (found) return found;
    }
  }
  return null;
}

function collectDescendantQuoteInfo(node, info = null) {
  const acc = info || {
    descendantsWithQuotes: [],
    selectedDescendantQuotes: [],
    descendantPendingWinner: []
  };
  if (!node || !Array.isArray(node.children)) return acc;

  for (const child of node.children) {
    if (hasOwnCotizaciones(child)) {
      acc.descendantsWithQuotes.push(child);
      const winner = getOwnWinnerCotizacion(child);
      if (winner) {
        acc.selectedDescendantQuotes.push({
          node: child,
          cotizacion: winner,
          conceptTotal: calculateParentTotal(child)
        });
      } else {
        acc.descendantPendingWinner.push(child);
      }
    }
    if (Array.isArray(child.children) && child.children.length > 0) {
      collectDescendantQuoteInfo(child, acc);
    }
  }
  return acc;
}

/**
 * Evalúa las reglas jerárquicas de cotización de un concepto (Nivel 1 vs subconceptos).
 * @param {string|Object} nodeOrId
 */
export function getCotizacionHierarchyStatus(nodeOrId) {
  const targetId = (nodeOrId && typeof nodeOrId === 'object') ? nodeOrId.id : nodeOrId;
  const lineage = findNodeLineage(state.treeData, targetId);
  const node = (lineage && lineage.length > 0)
    ? lineage[lineage.length - 1]
    : ((nodeOrId && typeof nodeOrId === 'object') ? nodeOrId : findNodeById(state.treeData, targetId));

  if (!node) {
    return {
      node: null,
      lineage: [],
      isParent: false,
      isLevel1: false,
      ownCotizaciones: [],
      ownWinner: null,
      blockingAncestor: null,
      descendantsWithQuotes: [],
      selectedDescendantQuotes: [],
      descendantPendingWinner: [],
      blockReason: null,
      canAddCotizacion: false
    };
  }

  const effectiveLineage = lineage || [node];
  const strictAncestors = effectiveLineage.slice(0, -1);
  const blockingAncestor = strictAncestors.find(anc => hasOwnCotizaciones(anc)) || null;
  const {
    descendantsWithQuotes,
    selectedDescendantQuotes,
    descendantPendingWinner
  } = collectDescendantQuoteInfo(node);

  const ownCotizaciones = Array.isArray(node.cotizaciones) ? node.cotizaciones : [];
  const ownWinner = getOwnWinnerCotizacion(node);
  const blockReason = blockingAncestor
    ? 'ancestor_has_quotes'
    : (descendantsWithQuotes.length > 0 ? 'descendant_has_quotes' : null);

  return {
    node,
    lineage: effectiveLineage,
    isParent: Boolean(node.children && node.children.length > 0),
    isLevel1: effectiveLineage.length === 1,
    ownCotizaciones,
    ownWinner,
    blockingAncestor,
    descendantsWithQuotes,
    selectedDescendantQuotes,
    descendantPendingWinner,
    blockReason,
    canAddCotizacion: blockReason === null
  };
}

/**
 * Construye el mensaje descriptivo cuando no está permitido agregar cotizaciones a un concepto.
 * @param {Object} status
 * @returns {string}
 */
export function getCotizacionBlockMessage(status) {
  if (!status || status.canAddCotizacion) return '';
  if (status.blockReason === 'ancestor_has_quotes' && status.blockingAncestor) {
    const ancClave = status.blockingAncestor.clave || 'Nivel 1';
    return `No se pueden agregar cotizaciones a este subconcepto porque [${ancClave}] ya tiene cotizaciones registradas.`;
  }
  return 'No se pueden agregar cotizaciones directas en este concepto porque sus subconceptos ya tienen cotizaciones registradas.';
}

function clearNodeWinnerSelection(node) {
  if (!node) return;
  node.proveedorElegidoId = null;
  node.proveedorElegidoNombre = null;
  node.precioUnitario = 0;
  node.costoDirecto = 0;
  node.costo_proveedor = null;
  delete node.importe_calculado;
}

/**
 * Limpia y normaliza el número de teléfono para generar un enlace de WhatsApp directo
 * @param {string} phone 
 * @returns {string} Dígitos limpios con código de país
 */
export function cleanPhoneForWhatsApp(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.length === 10) {
    // Si tiene 10 dígitos (formato estándar México / Norteamérica), agregar lada +52
    cleaned = '52' + cleaned;
  }
  return cleaned;
}

/**
 * Obtiene las cotizaciones asociadas a un nodo/concepto
 * @param {string} nodeId 
 * @returns {Array} Lista de cotizaciones
 */
export function getCotizaciones(nodeId) {
  const node = findNodeById(state.treeData, nodeId);
  if (!node || !Array.isArray(node.cotizaciones)) return [];
  return node.cotizaciones;
}

/**
 * Agrega una nueva cotización a un concepto
 * @param {string} nodeId 
 * @param {Object} data 
 * @returns {Object|null}
 */
function guardCotizacionMutation() {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo lectura: tu rol no permite modificar cotizaciones ni proveedores.', 'warning');
    return false;
  }
  if (typeof document !== 'undefined') {
    const viewPres = document.getElementById('view-presupuesto') || document.getElementById('view-insumos');
    if (viewPres && !viewPres.classList.contains('hidden')) {
      return guardTabUnlocked('presupuesto');
    }
  }
  return guardTabUnlocked('alcances');
}

function buildCotizacionPatch(node) {
  if (!node) return null;
  const cloneQuotes = (stripHugeData = false) => (Array.isArray(node.cotizaciones) ? node.cotizaciones : []).map(c => {
    const copy = { ...c };
    if (stripHugeData && typeof copy.archivoData === 'string' && copy.archivoData.length > 4000) {
      copy.archivoData = '';
    }
    return copy;
  });
  const basePatch = {
    type: 'update_cotizaciones',
    id: node.id,
    uuid: node.uuid || null,
    clave: node.clave || null,
    cotizaciones: cloneQuotes(false),
    proveedorElegidoId: node.proveedorElegidoId || null,
    proveedorElegidoNombre: node.proveedorElegidoNombre || null,
    costo_proveedor: node.costo_proveedor ?? null,
    precioUnitario: Number(node.precioUnitario) || 0,
    costoDirecto: Number(node.costoDirecto) || 0,
    cantidad: Number(node.cantidad) || 0,
    unidad: node.unidad || 'pza',
    importe_calculado: node.importe_calculado ?? null,
    deferAttachmentToCloud: false
  };
  try {
    if (JSON.stringify(basePatch).length > 150000) {
      basePatch.cotizaciones = cloneQuotes(true);
      basePatch.deferAttachmentToCloud = true;
    }
  } catch (_) {}
  return basePatch;
}

function finalizeCotizacionMutation(node, changeDescription) {
  calculateProrrateoCascade(state.treeData);
  persistLocalData(true, {
    changeType: 'cotizacion_updated',
    highlightId: node?.id || null,
    changeDescription: changeDescription || `cotización de ${node?.clave || 'concepto'}`,
    patch: buildCotizacionPatch(node),
    skipFullCloudSync: true
  });
  renderTAB1();
  renderCotizacionesSidePanel(node);
}

export function addCotizacion(nodeId, data) {
  if (!guardCotizacionMutation()) return null;
  const status = getCotizacionHierarchyStatus(nodeId);
  const node = status.node;
  if (!node) {
    showToast('Concepto no encontrado.', 'error');
    return null;
  }

  if (!status.canAddCotizacion) {
    showToast(getCotizacionBlockMessage(status), 'warning');
    return null;
  }

  if (!Array.isArray(node.cotizaciones)) {
    node.cotizaciones = [];
  }

  const cotId = 'cot_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const isWinner = Boolean(data.isGanador);
  const montoNum = round2(parseFloat(data.monto) || 0);
  const cantidadNum = data.cantidad !== undefined && data.cantidad !== null && data.cantidad !== ''
    ? round2(parseFloat(data.cantidad) || 0)
    : round2(parseFloat(node.cantidad) || 1);
  const unidadVal = (data.unidad !== undefined ? String(data.unidad).trim() : '') || node.unidad || 'pza';
  const costoNum = data.costo !== undefined && data.costo !== null
    ? round2(parseFloat(data.costo) || 0)
    : round2(montoNum * (cantidadNum > 0 ? cantidadNum : 1));

  const newCot = {
    id: cotId,
    proveedor: (data.proveedor || '').trim() || 'Proveedor sin nombre',
    telefono: (data.telefono || '').trim(),
    email: (data.email || '').trim(),
    monto: montoNum,
    cantidad: cantidadNum,
    unidad: unidadVal,
    costo: costoNum,
    total: costoNum,
    tiempoEntrega: (data.tiempoEntrega || '').trim(),
    archivoNombre: data.archivoNombre || '',
    archivoData: data.archivoData || '',
    archivoSize: data.archivoSize || '',
    driveUrl: data.driveUrl || '',
    notas: (data.notas || '').trim(),
    fecha: data.fecha || new Date().toISOString().split('T')[0],
    isGanador: isWinner
  };

  const isParent = Array.isArray(node.children) && node.children.length > 0;

  if (isWinner) {
    node.cotizaciones.forEach(c => { c.isGanador = false; });
    node.proveedorElegidoId = newCot.id;
    node.proveedorElegidoNombre = newCot.proveedor;
    node.costo_proveedor = newCot.costo;
    node.precioUnitario = newCot.monto;
    if (!isParent) {
      if (newCot.cantidad > 0) node.cantidad = newCot.cantidad;
      if (newCot.unidad) node.unidad = newCot.unidad;
      node.importe_calculado = newCot.costo;
    }
  } else if (!node.cotizaciones.some(c => Boolean(c.isGanador))) {
    // Mientras no exista una cotización seleccionada como ganadora, el importe del concepto permanece en 0
    clearNodeWinnerSelection(node);
  }

  node.cotizaciones.push(newCot);

  finalizeCotizacionMutation(node, `cotización de ${node.clave || 'concepto'}`);

  showToast(`Cotización de "${newCot.proveedor}" registrada con éxito.`, 'success');
  return newCot;
}

/**
 * Actualiza una cotización existente
 * @param {string} nodeId 
 * @param {string} cotId 
 * @param {Object} data 
 */
export function updateCotizacion(nodeId, cotId, data) {
  if (!guardCotizacionMutation()) return;
  const node = findNodeById(state.treeData, nodeId);
  if (!node || !Array.isArray(node.cotizaciones)) return;

  const cot = node.cotizaciones.find(c => c.id === cotId);
  if (!cot) return;

  if (data.proveedor !== undefined) cot.proveedor = data.proveedor.trim();
  if (data.telefono !== undefined) cot.telefono = data.telefono.trim();
  if (data.email !== undefined) cot.email = data.email.trim();
  if (data.monto !== undefined) cot.monto = round2(parseFloat(data.monto) || 0);
  if (data.cantidad !== undefined) cot.cantidad = round2(parseFloat(data.cantidad) || 0);
  if (data.unidad !== undefined) cot.unidad = String(data.unidad).trim() || (node.unidad || 'pza');

  const cotQty = (cot.cantidad > 0) ? cot.cantidad : 1;
  cot.costo = data.costo !== undefined && data.costo !== null
    ? round2(parseFloat(data.costo) || 0)
    : round2(cot.monto * cotQty);
  cot.total = cot.costo;

  if (data.tiempoEntrega !== undefined) cot.tiempoEntrega = data.tiempoEntrega.trim();
  if (data.notas !== undefined) cot.notas = data.notas.trim();
  if (data.archivoNombre !== undefined) cot.archivoNombre = data.archivoNombre;
  if (data.archivoData !== undefined) cot.archivoData = data.archivoData;
  if (data.archivoSize !== undefined) cot.archivoSize = data.archivoSize;
  if (data.driveUrl !== undefined) cot.driveUrl = data.driveUrl;

  const isParent = Array.isArray(node.children) && node.children.length > 0;

  if (data.isGanador !== undefined) {
    if (data.isGanador) {
      node.cotizaciones.forEach(c => { c.isGanador = (c.id === cotId); });
      node.proveedorElegidoId = cotId;
      node.proveedorElegidoNombre = cot.proveedor;
      node.costo_proveedor = cot.costo;
      node.precioUnitario = cot.monto;
      if (!isParent) {
        if (cot.cantidad > 0) node.cantidad = cot.cantidad;
        if (cot.unidad) node.unidad = cot.unidad;
        node.importe_calculado = cot.costo;
      }
    } else if (cot.isGanador) {
      cot.isGanador = false;
      clearNodeWinnerSelection(node);
    }
  } else if (cot.isGanador) {
    // Si ya era ganador y cambió el monto o cantidad, actualizar nodo
    node.proveedorElegidoNombre = cot.proveedor;
    node.costo_proveedor = cot.costo;
    node.precioUnitario = cot.monto;
    if (!isParent) {
      if (cot.cantidad > 0) node.cantidad = cot.cantidad;
      if (cot.unidad) node.unidad = cot.unidad;
      node.importe_calculado = cot.costo;
    }
  }

  finalizeCotizacionMutation(node, `cotización de ${node.clave || 'concepto'}`);
  showToast('Cotización actualizada.', 'success');
}

/**
 * Elimina una cotización
 * @param {string} nodeId 
 * @param {string} cotId 
 */
export function deleteCotizacion(nodeId, cotId) {
  if (!guardCotizacionMutation()) return;
  const node = findNodeById(state.treeData, nodeId);
  if (!node || !Array.isArray(node.cotizaciones)) return;

  const cot = node.cotizaciones.find(c => c.id === cotId);
  if (!cot) return;

  const wasWinner = cot.isGanador;
  node.cotizaciones = node.cotizaciones.filter(c => c.id !== cotId);

  if (wasWinner || !hasOwnCotizaciones(node)) {
    clearNodeWinnerSelection(node);
  }

  finalizeCotizacionMutation(node, `cotización eliminada en ${node.clave || 'concepto'}`);
  showToast('Cotización eliminada.', 'info');
}

/**
 * Selecciona una cotización como ganadora y asigna su precio a la Tabla de Alcances
 * @param {string} nodeId 
 * @param {string} cotId 
 */
export function setCotizacionGanadora(nodeId, cotId) {
  if (!guardCotizacionMutation()) return;
  const node = findNodeById(state.treeData, nodeId);
  if (!node || !Array.isArray(node.cotizaciones)) return;

  const chosen = node.cotizaciones.find(c => c.id === cotId);
  if (!chosen) return;

  const chosenQty = (chosen.cantidad !== undefined && chosen.cantidad !== null && chosen.cantidad !== '')
    ? (parseFloat(chosen.cantidad) || 1)
    : 1;
  const chosenCost = (chosen.costo !== undefined && chosen.costo !== null)
    ? Number(chosen.costo)
    : round2(Number(chosen.monto || 0) * (chosenQty > 0 ? chosenQty : 1));

  chosen.costo = chosenCost;
  chosen.total = chosenCost;

  node.cotizaciones.forEach(c => {
    c.isGanador = (c.id === cotId);
  });

  node.proveedorElegidoId = cotId;
  node.proveedorElegidoNombre = chosen.proveedor;
  node.costo_proveedor = chosenCost;
  node.precioUnitario = round2(chosen.monto);

  const isParent = Array.isArray(node.children) && node.children.length > 0;
  if (!isParent) {
    if (chosen.cantidad > 0) node.cantidad = chosen.cantidad;
    if (chosen.unidad) node.unidad = chosen.unidad;
    node.importe_calculado = chosenCost;
  }

  finalizeCotizacionMutation(node, `proveedor ganador en ${node.clave || 'concepto'}`);

  showToast(`Proveedor seleccionado: ${chosen.proveedor} (${formatMoney(chosenCost)}) trasladado a Tabla de Alcances`, 'success');
}

/**
 * Desmarca la cotización ganadora
 * @param {string} nodeId 
 * @param {string} cotId 
 */
export function unsetCotizacionGanadora(nodeId, cotId) {
  if (!guardCotizacionMutation()) return;
  const node = findNodeById(state.treeData, nodeId);
  if (!node || !Array.isArray(node.cotizaciones)) return;

  const cot = node.cotizaciones.find(c => c.id === cotId);
  if (cot) cot.isGanador = false;

  if (node.proveedorElegidoId === cotId || !node.cotizaciones.some(c => Boolean(c.isGanador))) {
    clearNodeWinnerSelection(node);
  }

  finalizeCotizacionMutation(node, `selección de proveedor en ${node.clave || 'concepto'}`);
  showToast('Se retiró la selección de proveedor ganador.', 'info');
}
