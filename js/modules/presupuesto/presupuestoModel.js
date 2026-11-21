// js/modules/presupuesto/presupuestoModel.js
// Modelo de datos, cálculos arancelarios FCARM/Cost-Plus y operaciones del árbol para la pestaña 1. Presupuesto

import { getSettingsKey } from '../../config/constants.js?v=20261121_cf44';
import { state, persistLocalData, persistSettings } from '../../state/store.js?v=20261121_cf44';
import { saveState } from '../../state/history.js?v=20261121_cf44';
import { round2, getCurrencyCode } from '../../core/formatters.js?v=20261121_cf44';
import {
  hasOwnCotizaciones,
  getOwnWinnerCotizacion,
  getEffectivePrecioUnitario,
  calculateProrrateoCascade,
  getDespachoGastosBreakdown,
  getNominaOficinaBreakdown,
  getUtilidadDespachoPct,
  getEjecutivoCostPlusFactor
} from '../../core/calculations.js?v=20261121_cf44';
import { findNodeById, findNodeContext } from '../catalog/treeService.js?v=20261121_cf44';
import { showToast } from '../../ui/notifications.js?v=20261121_cf44';
import { guardTabUnlocked } from '../../ui/tabLockController.js?v=20261121_cf44';

// Factores y Tabuladores Oficiales FCARM (Federación de Colegios de Arquitectos de la República Mexicana)
export const FCARM_TIPOLOGIAS = [
  { id: 'hab_unifamiliar', label: 'Habitacional Unifamiliar (Casa Habitación)', factorCg: 1.15, costoM2Ref: 14500 },
  { id: 'hab_residencial', label: 'Habitacional Residencial de Lujo', factorCg: 1.30, costoM2Ref: 24000 },
  { id: 'hab_plurifamiliar', label: 'Habitacional Multifamiliar / Departamentos', factorCg: 1.10, costoM2Ref: 16500 },
  { id: 'comercial', label: 'Comercial (Locales, Tiendas, Plazas)', factorCg: 1.12, costoM2Ref: 17500 },
  { id: 'oficinas', label: 'Corporativo / Oficinas', factorCg: 1.20, costoM2Ref: 19000 },
  { id: 'salud', label: 'Salud y Clínicas / Hospitales', factorCg: 1.45, costoM2Ref: 28000 },
  { id: 'educacion', label: 'Educación y Cultura (Colegios, Museos)', factorCg: 1.25, costoM2Ref: 18500 },
  { id: 'industrial', label: 'Naves Industriales y Bodegas', factorCg: 0.90, costoM2Ref: 9800 },
  { id: 'restaurante', label: 'Restaurantes, Bares y Recreativo', factorCg: 1.28, costoM2Ref: 21000 }
];

export const FCARM_FASES = [
  { id: 'anteproyecto', label: 'Anteproyecto y Esquemas Conceptuales', porcentaje: 20 },
  { id: 'ejecutivo', label: 'Proyecto Arquitectónico Ejecutivo (Planos y Memorias)', porcentaje: 50 },
  { id: 'ingenierias', label: 'Ingenierías (Cálculo Estructural e Instalaciones)', porcentaje: 20 },
  { id: 'coordinacion', label: 'Coordinación, Trámites y Licencias', porcentaje: 10 }
];

export const UNIDADES_PRESUPUESTO = [
  'm²',
  'lote',
  'plano',
  'estudio',
  'proyecto',
  'trámite',
  'juego',
  'render',
  'visita',
  'hr',
  'pza'
];

export const CATALOGO_TIPOS = [
  'Catálogo Original',
  'Presupuesto Base',
  'Catálogo Adicional',
  'Orden de Cambio',
  'Anteproyecto / Paramétrico'
];

function getTodayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrencyDisplayName(code) {
  const c = String(code || getCurrencyCode() || 'MXN').toUpperCase();
  if (c === 'MXN') return 'pesos mexicanos (MXN)';
  if (c === 'USD') return 'dólares americanos (USD)';
  if (c === 'EUR') return 'euros (EUR)';
  return c;
}

export function getDefaultPresupuestoNotas(cfg = {}) {
  const vigencia = Math.max(1, parseInt(cfg.vigenciaDias, 10) || 30);
  const moneda = getCurrencyDisplayName(getCurrencyCode());
  return [
    `Cotización realizada en ${moneda}.`,
    'El precio del proyecto ejecutivo está sujeto a la complejidad técnica y densidad de m² del proyecto.',
    `Esta cotización tendrá una vigencia de ${vigencia} días naturales a partir de la fecha de su expedición.`,
    'Las ingenierías y estudios adicionales requeridos para el trámite de licencia de construcción y permisos, así como el pago de derechos y licencias, no están incluidos en esta cotización y deberán ser cubiertos por el cliente.'
  ];
}

export function getProjectPresupuestoConfig() {
  if (!state.settings) state.settings = {};
  if (!state.settings.presupuestoArq || typeof state.settings.presupuestoArq !== 'object') {
    state.settings.presupuestoArq = {};
  }

  const cfg = state.settings.presupuestoArq;
  if (cfg.superficieM2 === undefined) cfg.superficieM2 = 250;
  if (!cfg.tipologiaId) cfg.tipologiaId = 'hab_unifamiliar';
  if (cfg.costoParametricoM2 === undefined) cfg.costoParametricoM2 = 14500;

  // Normalización retrocompatible única de parámetros heredados de construcción -> Proyecto Ejecutivo
  if (!state.settings._execParamsV1) {
    if (cfg.margenUtilidadGlobal !== undefined && state.settings.pctUtilidad === 10 && cfg.margenUtilidadGlobal !== 10) {
      state.settings.pctUtilidad = Number(cfg.margenUtilidadGlobal);
    }
    if (state.settings.pctFasar === 70 && !cfg.applyNominaFactor) {
      state.settings.pctFasar = 0;
    }
    if (state.settings.pctSegurosFianzas === 1 && !state.settings.applySobrecosto) {
      state.settings.pctSegurosFianzas = 0;
    }
    state.settings._execParamsV1 = true;
  }

  // Migración única para garantizar que Opciones Avanzadas inicien desactivadas y en blanco por defecto
  if (!cfg._advOptsDefaultOffV1 && !state.settings._advOptsDefaultOffV1) {
    const prevTotalGastos =
      (parseFloat(state.settings.pctIndirectos) || 0) +
      (parseFloat(state.settings.pctFinanciamiento) || 0) +
      (parseFloat(state.settings.pctAdicionales) || 0);
    if (
      !state.settings.applyDesgloseIndirectos &&
      ((parseFloat(state.settings.pctFinanciamiento) || 0) > 0 || (parseFloat(state.settings.pctAdicionales) || 0) > 0)
    ) {
      state.settings.pctIndirectos = Math.round(prevTotalGastos * 100) / 100;
    }
    state.settings.applyDesgloseIndirectos = false;
    state.settings.pctFinanciamiento = 0;
    state.settings.pctAdicionales = 0;
    state.settings.pctFasar = 0;
    cfg.applyNominaFactor = false;
    cfg.aplicarRetenciones = false;
    cfg.retencionIsrPct = 0;
    cfg.retencionIvaPct = 0;
    state.settings._advOptsDefaultOffV1 = true;
    cfg._advOptsDefaultOffV1 = true;
    try {
      localStorage.setItem(getSettingsKey(), JSON.stringify(state.settings));
    } catch (_) {}
  } else {
    state.settings._advOptsDefaultOffV1 = true;
    cfg._advOptsDefaultOffV1 = true;
  }

  if (cfg.margenUtilidadGlobal === undefined) {
    const rootUtil = parseFloat(state.settings.pctUtilidad);
    cfg.margenUtilidadGlobal = !isNaN(rootUtil) ? Math.max(0, Math.min(95, rootUtil)) : 35;
  }
  if (cfg.costoHoraHombrePromedio === undefined) cfg.costoHoraHombrePromedio = 380;
  if (cfg.applyNominaFactor === undefined) cfg.applyNominaFactor = false;

  if (!cfg.fasesContratadas) {
    cfg.fasesContratadas = {
      anteproyecto: true,
      ejecutivo: true,
      ingenierias: true,
      coordinacion: true
    };
  }

  // Nuevos metadatos y configuración ejecutiva / fiscal (compatibles con proyectos existentes)
  if (!cfg.vistaModo) cfg.vistaModo = 'completo'; // 'ejecutivo' | 'completo' | 'costplus'
  if (cfg.mostrarPanelFcarm === undefined) cfg.mostrarPanelFcarm = true;
  if (cfg.mostrarMetaDoc === undefined) cfg.mostrarMetaDoc = true;
  if (cfg.clienteNombre === undefined) cfg.clienteNombre = '';
  if (!cfg.tipoCatalogo) cfg.tipoCatalogo = 'Catálogo Original';
  if (!cfg.revision) cfg.revision = 'Revisión 01';
  if (!cfg.fechaExpedicion) cfg.fechaExpedicion = getTodayIsoDate();
  if (cfg.vigenciaDias === undefined) cfg.vigenciaDias = 30;
  if (cfg.aplicarIva === undefined) cfg.aplicarIva = true;

  if (cfg.ivaPct === undefined) {
    const rootIva = state.settings.ivaPct !== undefined ? parseFloat(state.settings.ivaPct) : NaN;
    cfg.ivaPct = !isNaN(rootIva) ? Math.max(0, Math.min(100, rootIva)) : 16;
  }
  if (state.settings.ivaPct === undefined || isNaN(parseFloat(state.settings.ivaPct))) {
    state.settings.ivaPct = cfg.ivaPct;
  }

  if (cfg.aplicarRetenciones === undefined) cfg.aplicarRetenciones = false;
  if (cfg.retencionIsrPct === undefined) cfg.retencionIsrPct = 0;
  if (cfg.retencionIvaPct === undefined) cfg.retencionIvaPct = 0;

  if (!Array.isArray(cfg.notas)) {
    cfg.notas = getDefaultPresupuestoNotas(cfg);
  }

  return cfg;
}

export function computeFechaVencimiento(fechaExpedicion, vigenciaDias) {
  if (!fechaExpedicion) return '';
  const parts = String(fechaExpedicion).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '';
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + Math.max(0, parseInt(vigenciaDias, 10) || 0));
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Identificar si un nodo funciona como partida agrupadora (misma regla que Alcances: tiene hijos)
export function isSubtituloNode(node) {
  return Boolean(node && Array.isArray(node.children) && node.children.length > 0);
}

// Factor multiplicador vigente desde "Configuración del Sistema" (gastos operativos despacho + utilidad)
export function getPresupuestoFactor() {
  return getEjecutivoCostPlusFactor(state.settings);
}

// Desglose de porcentajes e impuestos vigentes desde "Configuración del Sistema"
export function getPresupuestoPorcentajesInfo() {
  const cfg = getProjectPresupuestoConfig();
  const gastos = getDespachoGastosBreakdown(state.settings);
  const utilidadPct = getUtilidadDespachoPct(state.settings);
  const factor = getEjecutivoCostPlusFactor(state.settings);
  const agregadoPct = round2((factor - 1) * 100);
  const aplicarIva = cfg.aplicarIva !== false;
  const rawIva = state.settings?.ivaPct ?? cfg.ivaPct;
  const parsedIva = parseFloat(rawIva);
  const ivaPct = Math.max(0, Math.min(100, isNaN(parsedIva) ? 16 : parsedIva));
  return {
    gastos,
    utilidadPct,
    factor,
    agregadoPct,
    aplicarIva,
    ivaPct
  };
}

// Precio Unitario base directamente de Alcances (cotización ganadora o prorrateado; 0 si no tiene)
export function getAlcancesBasePU(node) {
  if (!node) return 0;
  return getEffectivePrecioUnitario(node);
}

// Importe base en Alcances (Cantidad × P.U. base sin sobrecosto ni utilidad)
export function getAlcancesBaseImporte(node) {
  if (!node) return 0;
  if (node.importe_calculado !== undefined && node.importe_calculado !== null && Number(node.importe_calculado) > 0) {
    return round2(node.importe_calculado);
  }
  const cant = round2(node.cantidad || 0);
  return round2(cant * getAlcancesBasePU(node));
}

// Precio Unitario efectivo al cliente en Presupuesto: Precio de Alcances + porcentajes de Configuración del Sistema
export function getEffectiveConceptPU(node) {
  if (!node) return 0;
  const basePu = getAlcancesBasePU(node);
  if (basePu <= 0) return 0;
  return round2(basePu * getPresupuestoFactor());
}

// Importe efectivo al cliente de un nodo cotizado (Cantidad × P.U. con porcentajes)
export function getConceptImporte(node) {
  if (!node) return 0;
  const cant = round2(node.cantidad || 0);
  const pu = getEffectiveConceptPU(node);
  return round2(cant * pu);
}

// Calcular arancel sugerido FCARM
export function calcularArancelFCARM() {
  const cfg = getProjectPresupuestoConfig();
  const tipo = FCARM_TIPOLOGIAS.find(t => t.id === cfg.tipologiaId) || FCARM_TIPOLOGIAS[0];
  const m2 = Math.max(1, parseFloat(cfg.superficieM2) || 1);
  const costoM2 = Math.max(100, parseFloat(cfg.costoParametricoM2) || tipo.costoM2Ref);

  const montoObra = m2 * costoM2;

  let porcentajeBase = 0.085;
  if (montoObra < 1000000) {
    porcentajeBase = 0.100;
  } else if (montoObra < 3000000) {
    porcentajeBase = 0.088;
  } else if (montoObra < 8000000) {
    porcentajeBase = 0.076;
  } else if (montoObra < 20000000) {
    porcentajeBase = 0.065;
  } else {
    porcentajeBase = 0.055;
  }

  const porcentajeAjustado = porcentajeBase * (tipo.factorCg || 1.0);
  const honorarioTotal100 = montoObra * porcentajeAjustado;

  let pctContratado = 0;
  FCARM_FASES.forEach(f => {
    if (cfg.fasesContratadas && cfg.fasesContratadas[f.id]) {
      pctContratado += f.porcentaje;
    }
  });

  const honorarioSugeridoFCARM = honorarioTotal100 * (pctContratado / 100);

  return {
    montoObra,
    porcentajeAjustado: (porcentajeAjustado * 100).toFixed(2),
    pctContratado,
    honorarioTotal100,
    honorarioSugeridoFCARM
  };
}

// Cálculo financiero unificado por concepto (Horas-Hombre + Factor Nómina + Subcontrato + Gastos Despacho + Cost-Plus)
export function computeConceptFinancials(node, cfg = getProjectPresupuestoConfig(), overrides = {}) {
  const tarifaDefault = overrides.tarifaHrDefault ?? Math.max(1, parseFloat(cfg.costoHoraHombrePromedio) || 380);
  const nomina = overrides.nomina ?? getNominaOficinaBreakdown();
  const gastos = overrides.gastos ?? getDespachoGastosBreakdown();
  const margenPct = overrides.margenPct ?? getUtilidadDespachoPct();
  const margenDecimal = overrides.margenDecimal ?? (margenPct / 100);

  const subc = round2(node?.costoSubcontrato || 0);
  const hh = Number(node?.horasHombre) || 0;
  const tarifaBase = Number(node?.costoHoraPersonalizado) || tarifaDefault;
  const tarifaEfectiva = round2(tarifaBase * nomina.factor);
  const costoHoras = round2(hh * tarifaEfectiva);
  const costoBase = round2(subc + costoHoras);
  const cargosDespacho = gastos.apply ? round2(costoBase * (gastos.pctTotal / 100)) : 0;
  const costoOperativo = round2(costoBase + cargosDespacho);

  const cant = round2(node?.cantidad || 0);
  const basePu = getAlcancesBasePU(node);
  const baseImporte = getAlcancesBaseImporte(node);
  const pu = getEffectiveConceptPU(node);
  const importe = getConceptImporte(node);
  const sugeridoTotal = round2(
    margenDecimal < 0.99 ? costoOperativo / (1 - margenDecimal) : costoOperativo * (1 + margenDecimal)
  );
  const puSugerido = round2(sugeridoTotal / Math.max(0.01, cant));

  return {
    subcontratos: subc,
    horasHombre: hh,
    tarifaBase,
    tarifaEfectiva,
    costoHoras,
    costoBase,
    cargosDespacho,
    costoInterno: costoOperativo,
    costoOperativo,
    basePu,
    baseImporte,
    importe,
    pu,
    sugeridoCostPlus: sugeridoTotal,
    puSugerido,
    margenPct
  };
}

// Calcular totales recursivos de un nodo (Alcances + porcentajes de Configuración del Sistema)
export function computeNodeMetrics(node, tarifaHrDefault, margenDecimal, options = {}) {
  const { onlySelected = true } = options;
  const empty = {
    subcontratos: 0,
    horasHombre: 0,
    costoHoras: 0,
    costoBase: 0,
    cargosDespacho: 0,
    costoInterno: 0,
    costoOperativo: 0,
    baseImporte: 0,
    importe: 0,
    sugeridoCostPlus: 0,
    conceptosCount: 0
  };
  if (!node) return empty;

  const hasOwnQuote = hasOwnCotizaciones(node);

  if (!hasOwnQuote && isSubtituloNode(node)) {
    const acc = { ...empty };
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      const m = computeNodeMetrics(child, tarifaHrDefault, margenDecimal, options);
      acc.subcontratos = round2(acc.subcontratos + m.subcontratos);
      acc.horasHombre += m.horasHombre;
      acc.costoHoras = round2(acc.costoHoras + m.costoHoras);
      acc.costoBase = round2(acc.costoBase + m.costoBase);
      acc.cargosDespacho = round2(acc.cargosDespacho + m.cargosDespacho);
      acc.costoInterno = round2(acc.costoInterno + m.costoInterno);
      acc.costoOperativo = acc.costoInterno;
      acc.baseImporte = round2(acc.baseImporte + m.baseImporte);
      acc.importe = round2(acc.importe + m.importe);
      acc.sugeridoCostPlus = round2(acc.sugeridoCostPlus + m.sugeridoCostPlus);
      acc.conceptosCount += m.conceptosCount;
    }
    return acc;
  }

  // Si sólo se calculan los seleccionados para impresión y este concepto o partida está desmarcado:
  if (onlySelected && node.selected === false) {
    return empty;
  }

  const cfg = getProjectPresupuestoConfig();
  const overrides = {};
  if (tarifaHrDefault !== undefined) overrides.tarifaHrDefault = tarifaHrDefault;
  if (margenDecimal !== undefined) {
    overrides.margenDecimal = margenDecimal;
    overrides.margenPct = round2(margenDecimal * 100);
  }
  const f = computeConceptFinancials(node, cfg, overrides);

  return {
    subcontratos: f.subcontratos,
    horasHombre: f.horasHombre,
    costoHoras: f.costoHoras,
    costoBase: f.costoBase,
    cargosDespacho: f.cargosDespacho,
    costoInterno: f.costoOperativo,
    costoOperativo: f.costoOperativo,
    baseImporte: f.baseImporte,
    importe: f.importe,
    sugeridoCostPlus: f.sugeridoCostPlus,
    conceptosCount: 1
  };
}

// Resumen financiero completo del presupuesto (Alcances + porcentajes de Configuración del Sistema + IVA)
export function calcularResumenPresupuesto(options = {}) {
  const { onlySelected = true } = options;
  if (Array.isArray(state.treeData)) {
    calculateProrrateoCascade(state.treeData);
  }
  const tree = state.treeData || [];
  const cfg = getProjectPresupuestoConfig();
  const tarifaHr = Math.max(1, parseFloat(cfg.costoHoraHombrePromedio) || 380);
  const pctInfo = getPresupuestoPorcentajesInfo();
  const margenPct = pctInfo.utilidadPct;
  const margenDecimal = margenPct / 100;
  const gastosDespacho = pctInfo.gastos;
  const nominaOficina = getNominaOficinaBreakdown();

  const aplicarIva = pctInfo.aplicarIva;
  const ivaPct = pctInfo.ivaPct;
  const aplicarRetenciones = Boolean(cfg.aplicarRetenciones);
  const retencionIsrPct = Math.max(0, Math.min(100, parseFloat(cfg.retencionIsrPct) || 0));
  const retencionIvaPct = Math.max(0, Math.min(100, parseFloat(cfg.retencionIvaPct) || 0));

  let totalSubcontratos = 0;
  let totalHorasHombre = 0;
  let costoHorasHombre = 0;
  let costoBaseTotal = 0;
  let totalCargosDespacho = 0;
  let costoTotalProduccion = 0;
  let subtotalBaseAlcances = 0;
  let subtotalVenta = 0;
  let precioSugeridoCostPlus = 0;
  let totalConceptos = 0;

  let totalConceptosProyecto = 0;
  let totalConceptosSeleccionados = 0;

  function countConcepts(nodes) {
    for (const n of nodes) {
      if (isSubtituloNode(n)) {
        if (Array.isArray(n.children)) countConcepts(n.children);
      } else {
        totalConceptosProyecto++;
        if (n.selected !== false) totalConceptosSeleccionados++;
      }
    }
  }
  countConcepts(tree);

  const subtitulosResumen = [];

  for (const root of tree) {
    const m = computeNodeMetrics(root, tarifaHr, margenDecimal, { onlySelected });
    totalSubcontratos = round2(totalSubcontratos + m.subcontratos);
    totalHorasHombre += m.horasHombre;
    costoHorasHombre = round2(costoHorasHombre + m.costoHoras);
    costoBaseTotal = round2(costoBaseTotal + m.costoBase);
    totalCargosDespacho = round2(totalCargosDespacho + m.cargosDespacho);
    costoTotalProduccion = round2(costoTotalProduccion + m.costoInterno);
    subtotalBaseAlcances = round2(subtotalBaseAlcances + m.baseImporte);
    subtotalVenta = round2(subtotalVenta + m.importe);
    precioSugeridoCostPlus = round2(precioSugeridoCostPlus + m.sugeridoCostPlus);
    totalConceptos += m.conceptosCount;

    const utilidad = round2(m.importe - m.costoInterno);
    const margenRealPct = m.importe > 0 && m.costoInterno > 0
      ? ((m.importe - m.costoInterno) / m.importe) * 100
      : null;

    subtitulosResumen.push({
      id: root.id,
      clave: root.clave || '',
      descripcion: root.descripcion || 'Partida sin título',
      color: root.color || '#334155',
      baseImporte: m.baseImporte,
      importe: m.importe,
      costoBase: m.costoBase,
      cargosDespacho: m.cargosDespacho,
      costoInterno: m.costoInterno,
      sugeridoCostPlus: m.sugeridoCostPlus,
      utilidad,
      margenRealPct,
      conceptosCount: m.conceptosCount,
      hasOwnQuote: hasOwnCotizaciones(root),
      selected: root.selected !== false
    });
  }

  // Calcular % de incidencia de cada Subtítulo sobre el subtotal total
  subtitulosResumen.forEach(item => {
    item.incidenciaPct = subtotalVenta > 0 ? (item.importe / subtotalVenta) * 100 : 0;
  });

  const utilidadCostPlus = round2(precioSugeridoCostPlus - costoTotalProduccion);
  const utilidadReal = round2(subtotalVenta - costoTotalProduccion);
  const margenRealPct = subtotalVenta > 0 && costoTotalProduccion > 0
    ? ((subtotalVenta - costoTotalProduccion) / subtotalVenta) * 100
    : null;

  const montoIva = aplicarIva ? round2(subtotalVenta * (ivaPct / 100)) : 0;
  const montoRetIsr = aplicarRetenciones ? round2(subtotalVenta * (retencionIsrPct / 100)) : 0;
  const montoRetIva = aplicarRetenciones ? round2(subtotalVenta * (retencionIvaPct / 100)) : 0;
  const totalRetenciones = round2(montoRetIsr + montoRetIva);
  const granTotal = round2(subtotalVenta + montoIva - totalRetenciones);

  const superficieM2 = Math.max(1, parseFloat(cfg.superficieM2) || 1);
  const precioPorM2 = round2(subtotalVenta / superficieM2);

  return {
    totalSubcontratos,
    totalHorasHombre,
    costoHorasHombre,
    costoBaseTotal,
    totalCargosDespacho,
    costoTotalProduccion,
    gastosDespacho,
    nominaOficina,
    gastosPct: gastosDespacho.pctTotal,
    margenPct,
    factorSobrecosto: pctInfo.factor,
    porcentajeAgregadoPct: pctInfo.agregadoPct,
    subtotalBaseAlcances,
    precioSugeridoCostPlus,
    utilidadCostPlus,
    // Alias compatible con API previa:
    precioVentaCliente: subtotalVenta,
    utilidadProyectada: utilidadCostPlus,
    // Métricas reales de venta (Alcances + porcentajes Configuración del Sistema) e impuestos:
    subtotalVenta,
    utilidadReal,
    margenRealPct,
    aplicarIva,
    ivaPct,
    montoIva,
    aplicarRetenciones,
    retencionIsrPct,
    retencionIvaPct,
    montoRetIsr,
    montoRetIva,
    totalRetenciones,
    granTotal,
    superficieM2,
    precioPorM2,
    totalConceptos,
    totalConceptosProyecto,
    totalConceptosSeleccionados,
    subtitulosResumen
  };
}

// Compatibilidad retroactiva
export function calcularCostosProduccionEntregables() {
  return calcularResumenPresupuesto();
}

// ---------------------------------------------------------------------------
// Mutaciones del presupuesto sincronizadas con state.treeData
// ---------------------------------------------------------------------------

function generateNodeId(prefix = 'p_') {
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getNextRootClave() {
  const tree = state.treeData || [];
  let maxNum = 0;
  for (const n of tree) {
    const raw = String(n.clave || '').trim();
    const match = raw.match(/^(\d+)/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val > maxNum) maxNum = val;
    }
  }
  const next = maxNum > 0 ? maxNum + 1 : tree.length + 1;
  // Si las claves existentes usan formato X.10 (ej. 1.10, 2.10), respetarlo
  const usesDecimalPartida = tree.some(n => /^\d+\.\d{2}$/.test(String(n.clave || '').trim()));
  return usesDecimalPartida ? `${next}.10` : `${next}`;
}

export function getNextChildClave(parent) {
  const children = Array.isArray(parent?.children) ? parent.children : [];
  const pClave = String(parent?.clave || '').trim();
  // Si el padre es 1.10, los hijos son 1.1.1, 1.1.2...; si es 1.20, 1.2.1...; si es 1, 1.1...
  const matchZeroSuffix = pClave.match(/^(\d+\.\d)0$/);
  const basePrefix = matchZeroSuffix ? matchZeroSuffix[1] : pClave;
  const nextIdx = children.length + 1;
  return basePrefix ? `${basePrefix}.${nextIdx}` : `${nextIdx}`;
}

export function addPresupuestoSubtitulo() {
  if (!guardTabUnlocked('presupuesto')) return false;
  saveState();
  if (!Array.isArray(state.treeData)) state.treeData = [];

  const palette = ['#3b82f6', '#6366f1', '#0ea5e9', '#a855f7', '#10b981', '#f59e0b', '#ec4899'];
  const color = palette[state.treeData.length % palette.length];
  const clave = getNextRootClave();

  state.treeData.push({
    id: generateNodeId('sub_'),
    clave,
    descripcion: 'NUEVO SUBTÍTULO / PARTIDA',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    color,
    expanded: true,
    selected: true,
    esSubtitulo: true,
    children: []
  });

  persistLocalData();
  showToast(`Subtítulo [${clave}] agregado al presupuesto.`, 'success');
  return true;
}

export function addPresupuestoConcepto(parentId) {
  if (!guardTabUnlocked('presupuesto')) return false;
  const parent = findNodeById(state.treeData || [], parentId);
  if (!parent) return false;

  saveState();
  if (!Array.isArray(parent.children)) parent.children = [];
  parent.esSubtitulo = true;
  parent.expanded = true;

  const clave = getNextChildClave(parent);
  parent.children.push({
    id: generateNodeId('con_'),
    clave,
    descripcion: 'Nuevo concepto o entregable',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    costoSubcontrato: 0,
    horasHombre: 0,
    estatus: 'pendiente',
    avancePorcentaje: 0,
    selected: true
  });

  persistLocalData();
  showToast(`Concepto [${clave}] agregado.`, 'success');
  return true;
}

export function deletePresupuestoNode(nodeId) {
  if (!guardTabUnlocked('presupuesto')) return false;
  const ctx = findNodeContext(state.treeData || [], nodeId);
  if (!ctx) return false;

  const hasChildren = Array.isArray(ctx.node.children) && ctx.node.children.length > 0;
  if (hasChildren) {
    const label = ctx.node.descripcion || ctx.node.clave || 'este subtítulo';
    if (!window.confirm(`¿Eliminar el subtítulo "${label}" junto con sus ${ctx.node.children.length} concepto(s)?`)) {
      return false;
    }
  }

  saveState();
  ctx.parentArray.splice(ctx.index, 1);
  persistLocalData();
  showToast('Renglón eliminado del presupuesto.', 'info');
  return true;
}

export function togglePresupuestoSubtituloExpand(nodeId) {
  const node = findNodeById(state.treeData || [], nodeId);
  if (!node) return false;
  node.expanded = node.expanded === false ? true : false;
  persistLocalData();
  return true;
}

export function updatePresupuestoNodeField(nodeId, field, rawValue) {
  if (!guardTabUnlocked('presupuesto')) return false;
  const node = findNodeById(state.treeData || [], nodeId);
  if (!node) return false;

  saveState();

  if (field === 'clave' || field === 'descripcion' || field === 'unidad') {
    node[field] = String(rawValue ?? '').trim();
    if (field === 'unidad' && !node.unidad) node.unidad = 'lote';
  } else if (field === 'cantidad') {
    node.cantidad = Math.max(0, round2(parseFloat(rawValue) || 0));
  } else if (field === 'precioUnitario') {
    if (hasOwnCotizaciones(node)) {
      showToast('Este concepto tiene una cotización ganadora vinculada en Alcances.', 'warning');
      return false;
    }
    node.precioUnitario = Math.max(0, round2(parseFloat(rawValue) || 0));
  } else if (field === 'importe') {
    if (hasOwnCotizaciones(node)) {
      showToast('Este concepto tiene una cotización ganadora vinculada en Alcances.', 'warning');
      return false;
    }
    const targetImporte = Math.max(0, round2(parseFloat(rawValue) || 0));
    let cant = round2(node.cantidad || 0);
    if (cant <= 0) {
      cant = 1;
      node.cantidad = 1;
    }
    node.precioUnitario = round2(targetImporte / cant);
  } else if (field === 'costoSubcontrato') {
    node.costoSubcontrato = Math.max(0, round2(parseFloat(rawValue) || 0));
  } else if (field === 'horasHombre') {
    node.horasHombre = Math.max(0, round2(parseFloat(rawValue) || 0));
  }

  persistLocalData();
  return true;
}

function applyCostPlusComputedPrice(node, financials) {
  let cant = round2(node.cantidad || 0);
  if (cant <= 0) {
    cant = 1;
    node.cantidad = 1;
  }
  node.precioUnitario = round2(financials.sugeridoCostPlus / cant);
  node.costoDirecto = round2(financials.costoOperativo / cant);
}

// Aplicar precio sugerido Cost-Plus a un concepto específico
export function applyCostPlusToNode(nodeId) {
  if (!guardTabUnlocked('presupuesto')) return false;
  const node = findNodeById(state.treeData || [], nodeId);
  if (!node || isSubtituloNode(node)) return false;

  if (hasOwnCotizaciones(node)) {
    showToast('Este concepto toma su P.U. de la cotización ganadora en Alcances.', 'warning');
    return false;
  }

  const cfg = getProjectPresupuestoConfig();
  const fin = computeConceptFinancials(node, cfg);

  if (fin.costoOperativo <= 0) {
    showToast('Captura primero un costo de Subcontrato o Horas Hombre en este concepto.', 'info');
    return false;
  }

  saveState();
  applyCostPlusComputedPrice(node, fin);
  persistLocalData();
  showToast(`P.U. calculado con ${fin.margenPct}% de utilidad del despacho.`, 'success');
  return true;
}

// Aplicar Cost-Plus a todos los conceptos que tengan costos internos capturados
export function applyCostPlusToAllNodes() {
  if (!guardTabUnlocked('presupuesto')) return false;
  const cfg = getProjectPresupuestoConfig();

  let updatedCount = 0;
  saveState();

  function walk(nodes) {
    for (const node of nodes) {
      if (isSubtituloNode(node)) {
        walk(node.children || []);
      } else if (!hasOwnCotizaciones(node)) {
        const fin = computeConceptFinancials(node, cfg);
        if (fin.costoOperativo > 0) {
          applyCostPlusComputedPrice(node, fin);
          updatedCount++;
        }
      }
    }
  }

  walk(state.treeData || []);
  persistLocalData();

  if (updatedCount === 0) {
    showToast('Ningún concepto editable tiene costos internos (Subcontrato o HH) capturados.', 'info');
    return false;
  }
  showToast(`Se actualizó el P.U. Cost-Plus en ${updatedCount} concepto(s).`, 'success');
  return true;
}

// Sincronizar cotización ganadora a Subcontrato para análisis de margen
export function syncWinnerQuoteToSubcontrato(nodeId) {
  if (!guardTabUnlocked('presupuesto')) return false;
  const node = findNodeById(state.treeData || [], nodeId);
  if (!node || !hasOwnCotizaciones(node)) return false;
  const winner = getOwnWinnerCotizacion(node);
  if (!winner) return false;

  saveState();
  const cant = Math.max(1, round2(node.cantidad || 1));
  node.costoSubcontrato = round2((winner.monto || 0) * cant);
  persistLocalData();
  showToast('Monto de cotización ganadora copiado a Subcontrato.', 'success');
  return true;
}

// ---------------------------------------------------------------------------
// Plantillas de Referencia Mejoradas (opcionales bajo demanda del usuario)
// ---------------------------------------------------------------------------

export const PRESUPUESTO_PLANTILLAS = [
  {
    id: 'comercial_referencia',
    titulo: 'Proyecto Comercial / Plaza + Ingenierías + Gestoría',
    descripcion: 'Estructura ejecutiva por zonas (Tienda, Plaza Comercial, Estacionamiento y Trámites) basada en tu formato de referencia con unidades en m², ingenierías completas, IVA 16% y notas comerciales mejoradas.',
    badge: 'Basado en tu referencia',
    superficieSugerida: 14071,
    tipologiaSugerida: 'comercial',
    buildTree: () => [
      {
        id: generateNodeId('sub_'),
        clave: '1.10',
        descripcion: 'TIENDA — PROYECTO EJECUTIVO ARQUITECTÓNICO',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#2563eb',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '1.1.1',
            descripcion: 'Proyecto Ejecutivo Arquitectónico — Área Tienda (planos ejecutivos, detalles y especificaciones)',
            unidad: 'm²',
            cantidad: 7000,
            precioUnitario: 320,
            costoDirecto: 208,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          }
        ]
      },
      {
        id: generateNodeId('sub_'),
        clave: '1.20',
        descripcion: 'TIENDA — INGENIERÍAS Y ESPECIALIDADES',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#4f46e5',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '1.2.1',
            descripcion: 'Ingeniería de Cimentación, Estructural, Muros y Detalles de Albañilería',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 207000,
            costoDirecto: 134550,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '1.2.2',
            descripcion: 'Ingeniería Hidrosanitaria y Pluvial',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 87400,
            costoDirecto: 56810,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '1.2.3',
            descripcion: 'Ingeniería Eléctrica e Iluminación',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 83950,
            costoDirecto: 54567.5,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '1.2.4',
            descripcion: 'Ingeniería de Gas (L.P. / Natural)',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 24150,
            costoDirecto: 15697.5,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '1.2.5',
            descripcion: 'Ingeniería de Instalaciones Especiales (control de acceso, CCTV, alarma perimetral y detección contra incendios)',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 54050,
            costoDirecto: 35132.5,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '1.2.6',
            descripcion: 'Ingeniería de Sistema Contra Incendios (red hidráulica y rociadores)',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 59800,
            costoDirecto: 38870,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '1.2.7',
            descripcion: 'Ingeniería de Aire Acondicionado y Ventilación (HVAC)',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 82800,
            costoDirecto: 53820,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          }
        ]
      },
      {
        id: generateNodeId('sub_'),
        clave: '2.10',
        descripcion: 'PLAZA COMERCIAL — PROYECTO EJECUTIVO ARQUITECTÓNICO',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#0284c7',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '2.1.1',
            descripcion: 'Proyecto Ejecutivo Arquitectónico — Plaza Comercial y Locales',
            unidad: 'm²',
            cantidad: 7071,
            precioUnitario: 160,
            costoDirecto: 104,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          }
        ]
      },
      {
        id: generateNodeId('sub_'),
        clave: '2.20',
        descripcion: 'PLAZA COMERCIAL — INGENIERÍAS Y ESPECIALIDADES',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#7c3aed',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '2.2.1',
            descripcion: 'Ingeniería de Cimentación, Estructural, Muros y Detalles de Albañilería',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 63639,
            costoDirecto: 41365.35,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '2.2.2',
            descripcion: 'Ingeniería Hidrosanitaria y Pluvial',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 17677.5,
            costoDirecto: 11490.38,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '2.2.3',
            descripcion: 'Ingeniería Eléctrica e Iluminación',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 16970.4,
            costoDirecto: 11030.76,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '2.2.4',
            descripcion: 'Ingeniería de Gas (L.P. / Natural)',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 4949.7,
            costoDirecto: 3217.31,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '2.2.5',
            descripcion: 'Ingeniería de Instalaciones Especiales (control de acceso, CCTV, alarma perimetral y detección contra incendios)',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 11313.6,
            costoDirecto: 7353.84,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '2.2.6',
            descripcion: 'Ingeniería de Sistema Contra Incendios',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 12727.8,
            costoDirecto: 8273.07,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '2.2.7',
            descripcion: 'Ingeniería de Aire Acondicionado y Ventilación (HVAC)',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 16970.4,
            costoDirecto: 11030.76,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          }
        ]
      },
      {
        id: generateNodeId('sub_'),
        clave: '3.10',
        descripcion: 'ESTACIONAMIENTO — PROYECTO EJECUTIVO ARQUITECTÓNICO',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#0d9488',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '3.1.1',
            descripcion: 'Proyecto Ejecutivo Arquitectónico — Estacionamiento, Vialidades y Señalética',
            unidad: 'm²',
            cantidad: 9378,
            precioUnitario: 15,
            costoDirecto: 9.75,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          }
        ]
      },
      {
        id: generateNodeId('sub_'),
        clave: '3.20',
        descripcion: 'ESTACIONAMIENTO — INGENIERÍAS',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#059669',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '3.2.2',
            descripcion: 'Ingeniería Hidrosanitaria y Drenaje Pluvial',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 19500,
            costoDirecto: 12675,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '3.2.3',
            descripcion: 'Ingeniería Eléctrica y Alumbrado Exterior',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 19500,
            costoDirecto: 12675,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '3.2.5',
            descripcion: 'Ingeniería de Instalaciones Especiales (control de acceso vehicular, CCTV y alarma perimetral)',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 7800,
            costoDirecto: 5070,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          }
        ]
      },
      {
        id: generateNodeId('sub_'),
        clave: '4.10',
        descripcion: 'TRÁMITES Y GESTORÍA',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#d97706',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '4.1.1',
            descripcion: 'Trámites y gestión de permisos para la obtención de Licencia de Construcción (no incluye pago de derechos ni estudios extraordinarios)',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 0,
            costoDirecto: 0,
            costoSubcontrato: 0,
            horasHombre: 0,
            estatus: 'pendiente',
            avancePorcentaje: 0,
            selected: true
          }
        ]
      }
    ]
  },
  {
    id: 'residencial_ejecutivo',
    titulo: 'Casa Habitación / Proyecto Ejecutivo Integral',
    descripcion: 'Estructura base para proyectos habitacionales con Estudios Preliminares, Anteproyecto, Proyecto Ejecutivo por m², Ingenierías y Trámites.',
    badge: 'Residencial',
    superficieSugerida: 280,
    tipologiaSugerida: 'hab_unifamiliar',
    buildTree: () => [
      {
        id: generateNodeId('sub_'),
        clave: '1.10',
        descripcion: 'ESTUDIOS PRELIMINARES Y ANTEPROYECTO',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#6366f1',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '1.1.1',
            descripcion: 'Levantamiento topográfico planimétrico y altimétrico',
            unidad: 'estudio',
            cantidad: 1,
            precioUnitario: 12500,
            costoDirecto: 8500,
            costoSubcontrato: 8500,
            horasHombre: 4,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '1.1.2',
            descripcion: 'Anteproyecto arquitectónico, zonificación, modelo 3D y 4 renders',
            unidad: 'm²',
            cantidad: 280,
            precioUnitario: 145,
            costoDirecto: 95,
            costoSubcontrato: 6000,
            horasHombre: 45,
            selected: true
          }
        ]
      },
      {
        id: generateNodeId('sub_'),
        clave: '1.20',
        descripcion: 'PROYECTO EJECUTIVO ARQUITECTÓNICO',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#0ea5e9',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '1.2.1',
            descripcion: 'Planos arquitectónicos ejecutivos, cortes, fachadas, albañilerías y acabados',
            unidad: 'm²',
            cantidad: 280,
            precioUnitario: 310,
            costoDirecto: 200,
            costoSubcontrato: 0,
            horasHombre: 96,
            selected: true
          }
        ]
      },
      {
        id: generateNodeId('sub_'),
        clave: '1.30',
        descripcion: 'INGENIERÍAS Y ESPECIALIDADES',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#a855f7',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '1.3.1',
            descripcion: 'Cálculo estructural, planos de cimentación y memoria de diseño',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 38000,
            costoDirecto: 25000,
            costoSubcontrato: 24000,
            horasHombre: 8,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '1.3.2',
            descripcion: 'Ingeniería Eléctrica e Iluminación',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 22000,
            costoDirecto: 15000,
            costoSubcontrato: 14000,
            horasHombre: 6,
            selected: true
          },
          {
            id: generateNodeId('con_'),
            clave: '1.3.3',
            descripcion: 'Ingeniería Hidrosanitaria y Pluvial',
            unidad: 'lote',
            cantidad: 1,
            precioUnitario: 19500,
            costoDirecto: 13000,
            costoSubcontrato: 12000,
            horasHombre: 6,
            selected: true
          }
        ]
      },
      {
        id: generateNodeId('sub_'),
        clave: '1.40',
        descripcion: 'TRÁMITES Y GESTORÍA MUNICIPAL',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        color: '#10b981',
        expanded: true,
        selected: true,
        esSubtitulo: true,
        children: [
          {
            id: generateNodeId('con_'),
            clave: '1.4.1',
            descripcion: 'Integración de expediente y gestión para Licencia de Construcción',
            unidad: 'trámite',
            cantidad: 1,
            precioUnitario: 16500,
            costoDirecto: 10500,
            costoSubcontrato: 5500,
            horasHombre: 12,
            selected: true
          }
        ]
      }
    ]
  }
];

export function applyPresupuestoTemplate(templateId, mode = 'replace') {
  if (!guardTabUnlocked('presupuesto')) return false;
  const tpl = PRESUPUESTO_PLANTILLAS.find(t => t.id === templateId);
  if (!tpl) return false;

  saveState();
  const newNodes = tpl.buildTree();

  if (mode === 'append' && Array.isArray(state.treeData) && state.treeData.length > 0) {
    state.treeData = [...state.treeData, ...newNodes];
  } else {
    state.treeData = newNodes;
    const cfg = getProjectPresupuestoConfig();
    if (tpl.superficieSugerida) cfg.superficieM2 = tpl.superficieSugerida;
    if (tpl.tipologiaSugerida) {
      cfg.tipologiaId = tpl.tipologiaSugerida;
      const tipo = FCARM_TIPOLOGIAS.find(t => t.id === tpl.tipologiaSugerida);
      if (tipo) cfg.costoParametricoM2 = tipo.costoM2Ref;
    }
    if (!Array.isArray(cfg.notas) || cfg.notas.length === 0) {
      cfg.notas = getDefaultPresupuestoNotas(cfg);
    }
    persistSettings();
  }

  persistLocalData();
  showToast(
    mode === 'append'
      ? `Partidas de "${tpl.titulo}" agregadas al presupuesto.`
      : `Plantilla "${tpl.titulo}" aplicada correctamente.`,
    'success'
  );
  return true;
}

// Re-export helper for settings saving
export function savePresupuestoSettings() {
  persistSettings();
}
