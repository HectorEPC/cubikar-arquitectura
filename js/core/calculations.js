import { state } from '../state/store.js?v=20261119_cf41';
import { formatMoney, round2, round5 } from './formatters.js?v=20261119_cf41';

export { round2, round5 };

// Cálculo del Factor de Sobrecosto (FSR/Indirectos/Financiamiento/Utilidad/Seguros y Fianzas)
export function getFactorSobrecosto() {
  if (!state.settings.applySobrecosto) return 1.0;
  const fInd = 1 + ((parseFloat(state.settings.pctIndirectos) || 0) / 100);
  const fFin = 1 + ((parseFloat(state.settings.pctFinanciamiento) || 0) / 100);
  const fUtil = 1 + ((parseFloat(state.settings.pctUtilidad) || 0) / 100);
  const fCarg = 1 + ((parseFloat(state.settings.pctAdicionales) || 0) / 100);
  const fSeg = 1 + ((parseFloat(state.settings.pctSegurosFianzas) || 0) / 100);
  return fInd * fFin * fUtil * fCarg * fSeg;
}

// Desglose y factor de gastos operativos del despacho (Indirectos Oficina/Software + Reserva Cambios + Impresiones/Visitas)
export function getDespachoGastosBreakdown(settings = state.settings) {
  const apply = Boolean(settings?.applySobrecosto);
  const pctIndirectos = Math.max(0, parseFloat(settings?.pctIndirectos) || 0);
  const pctReserva = Math.max(0, parseFloat(settings?.pctFinanciamiento) || 0);
  const pctImpresiones = Math.max(0, parseFloat(settings?.pctAdicionales) || 0);
  const pctTotal = apply ? round2(pctIndirectos + pctReserva + pctImpresiones) : 0;
  const factor = 1 + (pctTotal / 100);
  return { apply, pctIndirectos, pctReserva, pctImpresiones, pctTotal, factor };
}

export function getDespachoGastosPct(settings = state.settings) {
  return getDespachoGastosBreakdown(settings).pctTotal;
}

export function getDespachoGastosFactor(settings = state.settings) {
  return getDespachoGastosBreakdown(settings).factor;
}

// Factor opcional de Nómina / Prestaciones de Oficina sobre Tarifa Hora-Hombre
export function getNominaOficinaBreakdown(settings = state.settings) {
  const apply = Boolean(settings?.presupuestoArq?.applyNominaFactor);
  const raw = parseFloat(settings?.pctFasar);
  const validPct = isNaN(raw) ? 0 : Math.max(0, raw);
  if (!apply) {
    return {
      apply: false,
      pct: validPct < 5 && validPct >= 1 ? round2((validPct - 1) * 100) : validPct,
      factor: 1.0
    };
  }
  if (validPct <= 0) {
    return { apply: true, pct: 0, factor: 1.0 };
  }
  if (validPct < 5.0) {
    return { apply: true, pct: round2((validPct - 1) * 100), factor: validPct };
  }
  return { apply: true, pct: validPct, factor: 1 + (validPct / 100) };
}

export function getNominaOficinaFactor(settings = state.settings) {
  return getNominaOficinaBreakdown(settings).factor;
}

export function getUtilidadDespachoPct(settings = state.settings) {
  const raw = settings?.presupuestoArq?.margenUtilidadGlobal ?? settings?.pctUtilidad;
  const parsed = parseFloat(raw);
  const val = isNaN(parsed) ? 35 : parsed;
  return Math.max(0, Math.min(95, val));
}

// Multiplicador completo Cost-Plus desde Costo Base (con gastos operativos del despacho + utilidad del despacho)
export function getEjecutivoCostPlusFactor(settings = state.settings) {
  if (settings?.applySobrecosto === false) return 1;
  const gastosFactor = getDespachoGastosFactor(settings);
  const utilDecimal = getUtilidadDespachoPct(settings) / 100;
  return utilDecimal < 0.99 ? (gastosFactor / (1 - utilDecimal)) : (gastosFactor * (1 + utilDecimal));
}

// Factor multiplicador de Salario Real (FASAR / IMSS-INFONAVIT) para compatibilidad APU/IA heredada
export function getFasarFactor() {
  const p = parseFloat(state.settings?.pctFasar);
  if (isNaN(p) || p <= 0) return 1.70;
  if (p < 5.0) return p; // Por si fue capturado como multiplicador directo (ej. 1.70)
  return 1 + (p / 100);
}

// Actualizar indicador visual de Sobrecosto / Factores del Despacho en cabecera lateral
export function updateSobrecostoBadge() {
  const badge = document.getElementById('badge-sobrecosto');
  const label = document.getElementById('label-factor-sobrecosto');
  const cdContainer = document.getElementById('costo-directo-total-container');

  if (!badge || !label) return;

  if (state.settings.applySobrecosto) {
    const gastos = getDespachoGastosBreakdown();
    const utilPct = getUtilidadDespachoPct();
    const multVenta = getEjecutivoCostPlusFactor();
    badge.className = "w-11 h-11 rounded-xl border border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex flex-col items-center justify-center transition font-mono shadow-xs cursor-pointer group";
    label.innerText = `+${gastos.pctTotal.toFixed(1)}%`;
    badge.setAttribute(
      'title',
      `Factores Despacho Activos: Gastos +${gastos.pctTotal.toFixed(2)}% | Utilidad ${utilPct}% (Mult. Cost-Plus ${multVenta.toFixed(2)}x) — Clic para configurar`
    );
    if (cdContainer) cdContainer.classList.remove('hidden');
  } else {
    badge.className = "w-11 h-11 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 hover:bg-slate-850 hover:text-slate-200 hover:border-slate-700 flex flex-col items-center justify-center transition cursor-pointer group shadow-2xs";
    label.innerText = "Inactivo";
    badge.setAttribute('title', "Factores del Despacho: Inactivos (Solo costo base + margen Cost-Plus. Clic para activar/configurar)");
    if (cdContainer) cdContainer.classList.add('hidden');
  }
}

export function hasOwnCotizaciones(node) {
  return Boolean(node && Array.isArray(node.cotizaciones) && node.cotizaciones.length > 0);
}

export function getOwnWinnerCotizacion(node) {
  if (!hasOwnCotizaciones(node)) return null;
  return node.cotizaciones.find(c => Boolean(c.isGanador)) || null;
}

export function hasDescendantCotizaciones(node) {
  if (!node || !Array.isArray(node.children) || node.children.length === 0) return false;
  return node.children.some(child => hasOwnCotizaciones(child) || hasDescendantCotizaciones(child));
}

/**
 * Resuelve el presupuesto del paquete para un nodo (Top-Down):
 * 1. Cotización ganadora del nodo en el panel lateral.
 * 2. `costo_proveedor` explícito si fue capturado.
 */
export function resolveNodePackageBudget(node) {
  if (!node) return null;
  if (hasOwnCotizaciones(node)) {
    const winner = getOwnWinnerCotizacion(node);
    if (winner) {
      const winnerQty = (winner.cantidad !== undefined && winner.cantidad !== null && winner.cantidad !== '')
        ? (parseFloat(winner.cantidad) || 1)
        : 1;
      const winnerCost = (winner.costo !== undefined && winner.costo !== null)
        ? Number(winner.costo)
        : round2(Number(winner.monto || 0) * (winnerQty > 0 ? winnerQty : 1));
      if (winnerCost > 0) return round2(winnerCost);
    }
  }
  if (node.costo_proveedor !== undefined && node.costo_proveedor !== null && Number(node.costo_proveedor) > 0) {
    return round2(Number(node.costo_proveedor));
  }
  return null;
}

/**
 * Garantiza que todo grupo de subconceptos cuente con porcentajes relativos asignados.
 * Si un grupo aún no tiene porcentajes relativos, reparte el 100% equitativamente para iniciar balanceado.
 */
export function ensureNodeProrrateoDefaults(nodes) {
  if (!Array.isArray(nodes)) return;
  nodes.forEach(node => {
    if (Array.isArray(node.children) && node.children.length > 0) {
      const hasAnyPct = node.children.some(c => c.porcentaje_relativo !== undefined && c.porcentaje_relativo !== null && Number(c.porcentaje_relativo) > 0);
      if (!hasAnyPct) {
        const n = node.children.length;
        const baseShare = Math.floor((100 / n) * 100) / 100;
        let runningTotal = 0;
        node.children.forEach((c, idx) => {
          if (idx === n - 1) {
            c.porcentaje_relativo = round2(100 - runningTotal);
          } else {
            c.porcentaje_relativo = baseShare;
            runningTotal = round2(runningTotal + baseShare);
          }
        });
      }
      ensureNodeProrrateoDefaults(node.children);
    }
  });
}

/**
 * Evalúa el semáforo de validación para un grupo de subconceptos hermanos directos.
 * Devuelve sum, status ('valid' | 'under' | 'over'), y la diferencia respecto a 100%.
 */
export function getGroupProrrateoStatus(children) {
  if (!Array.isArray(children) || children.length === 0) {
    return { sum: 0, status: 'empty', diff: 100 };
  }
  const sum = round2(children.reduce((acc, c) => acc + (parseFloat(c.porcentaje_relativo) || 0), 0));
  const diff = round2(100 - sum);
  if (Math.abs(diff) < 0.01) {
    return { sum: 100.00, status: 'valid', diff: 0 };
  } else if (sum < 100) {
    return { sum, status: 'under', diff };
  } else {
    return { sum, status: 'over', diff: round2(sum - 100) };
  }
}

/**
 * Motor de Ponderación Relativa y Prorrateo Porcentual en Cascada (Top-Down y Bottom-Up híbrido):
 * - Si un nodo padre tiene presupuesto de paquete (cotización ganadora o costo_proveedor),
 *   propaga el monto hacia abajo multiplicando por (porcentaje_relativo / 100).
 * - Si el nodo no tiene paquete asignado, su monto se forma por la suma de sus hijos (Bottom-Up).
 * - Calcula el Gran Total del proyecto y asigna a cada nodo su porcentaje_global.
 * @param {Array} nodes
 * @returns {number} Gran Total del proyecto
 */
export function calculateProrrateoCascade(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return 0;

  // Paso 1: Asegurar porcentajes por defecto en grupos
  ensureNodeProrrateoDefaults(nodes);

  // Paso 2: Calcular importes recursivamente
  function processNode(node, inheritedBudget = null) {
    const isParent = Array.isArray(node.children) && node.children.length > 0;
    const cant = node.cantidad !== undefined && node.cantidad !== '' ? Number(node.cantidad) : 1;

    if (inheritedBudget !== null && inheritedBudget !== undefined) {
      // Cascada Top-Down desde el presupuesto del padre
      const pctRel = Number(node.porcentaje_relativo) || 0;
      node.importe_calculado = round2(inheritedBudget * (pctRel / 100));
    } else {
      // Nodo raíz o independiente
      const ownPackageBudget = resolveNodePackageBudget(node);
      if (ownPackageBudget !== null) {
        node.importe_calculado = ownPackageBudget;
      } else if (!isParent) {
        // Concepto hoja con precio unitario directo
        const effectivePU = hasOwnCotizaciones(node)
          ? (getOwnWinnerCotizacion(node)?.monto ? round2(getOwnWinnerCotizacion(node).monto) : 0)
          : round2(node.precioUnitario || 0);
        node.precioUnitario = effectivePU;
        node.importe_calculado = round2(cant * effectivePU);
      }
    }

    if (isParent) {
      const budgetForChildren = resolveNodePackageBudget(node) ?? (inheritedBudget !== null ? node.importe_calculado : null);

      if (budgetForChildren !== null) {
        // Cascada hacia los hijos
        node.children.forEach(child => processNode(child, budgetForChildren));
        node.importe_calculado = budgetForChildren;
      } else {
        // Suma ascendente Bottom-Up
        node.children.forEach(child => processNode(child, null));
        const sumHijos = node.children.reduce((acc, c) => acc + (Number(c.importe_calculado) || 0), 0);
        node.importe_calculado = round2(sumHijos);
      }
    }

    return node.importe_calculado;
  }

  nodes.forEach(root => processNode(root, null));

  // Paso 3: Gran Total
  const grandTotal = round2(nodes.reduce((acc, root) => acc + (Number(root.importe_calculado) || 0), 0));

  // Paso 4: Asignar porcentaje_global para cada nodo
  function assignGlobalPct(nodeList) {
    nodeList.forEach(n => {
      const imp = Number(n.importe_calculado) || 0;
      n.porcentaje_global = grandTotal > 0 ? round2((imp / grandTotal) * 100) : 0;
      if (Array.isArray(n.children) && n.children.length > 0) {
        assignGlobalPct(n.children);
      }
    });
  }
  assignGlobalPct(nodes);

  return grandTotal;
}

/**
 * Devuelve el Precio Unitario efectivo de un concepto según prorrateo, cotizaciones o subconceptos.
 * @param {Object} node
 * @returns {number}
 */
export function getEffectivePrecioUnitario(node) {
  if (!node) return 0;
  if (node.importe_calculado !== undefined && node.importe_calculado !== null) {
    const cant = node.cantidad !== undefined && node.cantidad !== '' ? Number(node.cantidad) : 1;
    return cant > 0 ? round2(node.importe_calculado / cant) : round2(node.precioUnitario || 0);
  }
  if (hasOwnCotizaciones(node)) {
    const winner = getOwnWinnerCotizacion(node);
    return winner ? round2(winner.monto || 0) : 0;
  }
  if (node.children && node.children.length > 0) {
    const totalHijos = node.children.reduce((acc, child) => acc + calculateParentTotal(child), 0);
    const cant = Number(node.cantidad) || 1;
    return round2(totalHijos / (cant > 0 ? cant : 1));
  }
  return round2(node.precioUnitario || 0);
}

// Total de una partida recursiva (sumatoria de hijos o concepto)
export function calculateParentTotal(node) {
  if (!node) return 0;
  if (node.importe_calculado !== undefined && node.importe_calculado !== null) {
    return round2(node.importe_calculado);
  }
  const cant = round2(node.cantidad || 0);

  if (hasOwnCotizaciones(node)) {
    return round2(cant * getEffectivePrecioUnitario(node));
  }

  if (!node.children || !Array.isArray(node.children) || node.children.length === 0) {
    return round2(cant * getEffectivePrecioUnitario(node));
  }

  const sum = node.children.reduce((acc, child) => acc + calculateParentTotal(child), 0);
  return round2(sum);
}

// Costo directo de una partida recursiva
export function calculateParentDirectTotal(node) {
  if (!node) return 0;
  const cant = round2(node.cantidad || 0);

  if (hasOwnCotizaciones(node)) {
    const winner = getOwnWinnerCotizacion(node);
    if (!winner) {
      // Sin ganadora el concepto vale 0; si es agrupador, sus subconceptos conservan su propio costo
      if (Array.isArray(node.children) && node.children.length > 0) {
        return round2(node.children.reduce((acc, child) => acc + calculateParentDirectTotal(child), 0));
      }
      return 0;
    }
    // El costo directo de un concepto cotizado es exactamente el costo total de su cotización ganadora
    return round2(resolveNodePackageBudget(node) ?? 0);
  }

  if (!node.children || !Array.isArray(node.children) || node.children.length === 0) {
    const cdVal = (node.costoDirecto !== undefined && node.costoDirecto > 0)
      ? node.costoDirecto
      : (node.importe_calculado !== undefined && node.importe_calculado !== null ? node.importe_calculado / (cant > 0 ? cant : 1) : (node.precioUnitario || 0));
    return round2(cant * round2(cdVal || 0));
  }

  const sum = node.children.reduce((acc, child) => acc + calculateParentDirectTotal(child), 0);
  return round2(sum);
}

// Actualizar totales generales en barra superior
export function updateGrandTotal() {
  const grandTotal = calculateProrrateoCascade(state.treeData);
  const grandEl = document.getElementById('grand-total');
  if (grandEl) grandEl.innerText = formatMoney(grandTotal);

  const directTotal = round2(state.treeData.reduce((sum, root) => sum + calculateParentDirectTotal(root), 0));
  const directEl = document.getElementById('direct-total');
  if (directEl) directEl.innerText = formatMoney(directTotal);
}
