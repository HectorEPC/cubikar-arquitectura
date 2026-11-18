// js/modules/estimaciones/estimacionesModel.js
// Modelo de datos y lógica de cálculo para ESTIMACIONES DE OBRA
// Sincronizado reactivamente con state.treeData (Catálogo Base)

import { state } from '../../state/store.js?v=20261117_cf27';
import { getActiveProjectId, getStorageKey } from '../../config/constants.js?v=20261117_cf27';
import { formatDate, parseDate, addDays, diffDays } from '../calendario/calendarioModel.js?v=20261117_cf27';
import { hasOwnCotizaciones, getEffectivePrecioUnitario, calculateProrrateoCascade } from '../../core/calculations.js?v=20261117_cf27';
import { canCurrentUserEditProject } from '../portal/projectService.js?v=20261117_cf27';
import { showToast } from '../../ui/notifications.js?v=20261117_cf27';
import { scheduleEstimacionesCloudSync } from '../../core/cloudModulesSyncService.js?v=20261117_cf27';

const STORAGE_KEY_ARQ_PREFIX = 'estimaciones_arq_data_';
const STORAGE_KEY_PREFIX = 'estimaciones_data_';

export function getEstimacionesStorageKeyForProject(projectId = null) {
  const pId = projectId || getActiveProjectId();
  return `${STORAGE_KEY_ARQ_PREFIX}${pId}`;
}

function getEstimacionesLegacyKeyForProject(projectId = null) {
  const pId = projectId || getActiveProjectId();
  return `${STORAGE_KEY_PREFIX}${pId}`;
}

function getEstimacionesStorageKey() {
  return getEstimacionesStorageKeyForProject();
}

// Estructura predeterminada para un nuevo proyecto (Modelo Panorama Real)
function getDefaultEstimacionesState() {
  const todayStr = formatDate(new Date());
  const endStr = formatDate(addDays(new Date(), 14));
  const rawSettingsIva = state?.settings?.presupuestoArq?.aplicarIva === false
    ? 0
    : (state?.settings?.ivaPct !== undefined && !isNaN(Number(state.settings.ivaPct))
      ? Number(state.settings.ivaPct)
      : (state?.settings?.presupuestoArq?.ivaPct !== undefined && !isNaN(Number(state.settings.presupuestoArq.ivaPct))
        ? Number(state.settings.presupuestoArq.ivaPct)
        : 16));
  const defaultIvaPct = Math.max(0, Math.min(100, rawSettingsIva));

  return {
    activeSubView: 'cobranza', // 'cobranza' | 'especialistas'
    activeEstimacionId: 'est_1',
    anticipoPct: 30, // Porcentaje de anticipo pactado por defecto (30%)
    ivaPct: defaultIvaPct,      // Inicializado desde la configuración económica del proyecto
    specialists: {},            // { [nodeId]: { proveedorName, notas, pagos: [...] } }
    estimaciones: [
      {
        id: 'est_1',
        numero: 1,
        semanaNo: 1,
        nombre: 'Estimación No. 1',
        fechaInicio: todayStr,
        fechaFin: endStr,
        fechaCorte: endStr,
        partidaNombre: 'PROYECTO EJECUTIVO',
        razonSocial: state?.settings?.companyName || '',
        direccion: state?.settings?.projectLocation || '',
        contacto: state?.settings?.projectContact || '',
        telefono: state?.settings?.projectPhone || '',
        notas: '',
        conceptos: {}, // { [conceptId]: pctAvance }
        fotos: {}
      }
    ]
  };
}

// Cargar estado de estimaciones desde localStorage
export function loadEstimacionesData() {
  try {
    const raw = localStorage.getItem(getEstimacionesStorageKey())
      || localStorage.getItem(getEstimacionesLegacyKeyForProject());
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.estimaciones) && data.estimaciones.length > 0) {
        if (!data.activeEstimacionId || !data.estimaciones.some(e => e.id === data.activeEstimacionId)) {
          data.activeEstimacionId = data.estimaciones[0].id;
        }
        data.anticipoPct = (data.anticipoPct !== undefined && data.anticipoPct !== null && !isNaN(Number(data.anticipoPct)))
          ? Number(data.anticipoPct)
          : 30;
        if (typeof data.ivaPct !== 'number' || isNaN(data.ivaPct)) {
          data.ivaPct = 16; // Predeterminado 16%
        }
        if (!data.activeSubView || (data.activeSubView !== 'cobranza' && data.activeSubView !== 'especialistas')) {
          data.activeSubView = 'cobranza';
        }
        if (!data.specialists || typeof data.specialists !== 'object' || Array.isArray(data.specialists)) {
          data.specialists = {};
        }
        return data;
      }
    }
  } catch (e) {
    console.error('Error al cargar datos de estimaciones:', e);
  }
  return getDefaultEstimacionesState();
}

// Guardar estado de estimaciones en localStorage
export function saveEstimacionesData(data) {
  try {
    const pId = getActiveProjectId();
    const json = JSON.stringify(data);
    localStorage.setItem(getEstimacionesStorageKeyForProject(pId), json);
    localStorage.setItem(getEstimacionesLegacyKeyForProject(pId), json);
    scheduleEstimacionesCloudSync(pId);
  } catch (e) {
    console.error('Error al guardar datos de estimaciones:', e);
  }
}

// Configurar porcentaje de anticipo pactado
export function setEstimacionesAnticipoPct(pct) {
  const data = loadEstimacionesData();
  const active = data.estimaciones.find(e => e.id === data.activeEstimacionId) || data.estimaciones[0];
  if (active && active.locked) return data.anticipoPct;
  const val = Math.max(0, Math.min(100, Number(pct) || 0));
  data.anticipoPct = Math.round((val + Number.EPSILON) * 100) / 100;
  saveEstimacionesData(data);
  return data.anticipoPct;
}

// Configurar porcentaje de IVA aplicable
export function setEstimacionesIvaPct(pct) {
  const data = loadEstimacionesData();
  const active = data.estimaciones.find(e => e.id === data.activeEstimacionId) || data.estimaciones[0];
  if (active && active.locked) return data.ivaPct;
  const val = Math.max(0, Math.min(100, Number(pct) || 0));
  data.ivaPct = Math.round((val + Number.EPSILON) * 100) / 100;
  saveEstimacionesData(data);
  return data.ivaPct;
}

// Verificar si una estimación (o la estimación activa) se encuentra bloqueada con candado
export function isEstimacionLocked(estId = null) {
  const data = loadEstimacionesData();
  const targetId = estId || data.activeEstimacionId;
  const est = data.estimaciones.find(e => e.id === targetId) || data.estimaciones[0];
  return Boolean(est && est.locked);
}

// Establecer estado de bloqueo en una estimación específica (o la activa)
export function setEstimacionLocked(estId = null, locked = true) {
  const data = loadEstimacionesData();
  const targetId = estId || data.activeEstimacionId;
  const est = data.estimaciones.find(e => e.id === targetId) || data.estimaciones[0];
  if (!est) return false;
  est.locked = Boolean(locked);
  saveEstimacionesData(data);
  return est.locked;
}

// Alternar el candado de bloqueo de la estimación activa actual
export function toggleActiveEstimacionLockState() {
  const data = loadEstimacionesData();
  const est = data.estimaciones.find(e => e.id === data.activeEstimacionId) || data.estimaciones[0];
  if (!est) return { locked: false, est: null };
  est.locked = !est.locked;
  saveEstimacionesData(data);
  return { locked: est.locked, est };
}

// Obtener estimación activa actual
export function getActiveEstimacion() {
  const data = loadEstimacionesData();
  const current = data.estimaciones.find(e => e.id === data.activeEstimacionId);
  return current || data.estimaciones[0];
}

// Cambiar la estimación activa
export function setActiveEstimacionId(estimacionId) {
  const data = loadEstimacionesData();
  if (data.estimaciones.some(e => e.id === estimacionId)) {
    data.activeEstimacionId = estimacionId;
    saveEstimacionesData(data);
  }
}

// Crear una nueva estimación secuencial (Estimación No. N+1 - Formato Panorama Real)
export function createNewEstimacion(customName = null, fechaInicio = null, fechaFin = null, semanaNo = null) {
  const data = loadEstimacionesData();
  const nextNum = data.estimaciones.length + 1;
  const newId = `est_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const last = data.estimaciones[data.estimaciones.length - 1];
  
  let sDate = fechaInicio;
  let eDate = fechaFin;
  
  if (!sDate) {
    if (last && last.fechaFin) {
      const d = parseDate(last.fechaFin);
      sDate = formatDate(addDays(d, 1));
      eDate = formatDate(addDays(d, 15));
    } else {
      sDate = formatDate(new Date());
      eDate = formatDate(addDays(new Date(), 14));
    }
  }
  if (!eDate) {
    eDate = formatDate(addDays(parseDate(sDate), 14));
  }

  const nextSemana = semanaNo !== null && !isNaN(Number(semanaNo))
    ? Number(semanaNo)
    : (last && last.semanaNo ? Number(last.semanaNo) + 1 : nextNum);

  const newEst = {
    id: newId,
    numero: nextNum,
    semanaNo: nextSemana,
    nombre: customName || `Estimación No. ${nextNum}`,
    fechaInicio: sDate,
    fechaFin: eDate,
    fechaCorte: eDate,
    partidaNombre: (last && last.partidaNombre) || 'PROYECTO EJECUTIVO',
    razonSocial: (last && last.razonSocial) || state?.settings?.companyName || 'DESARROLLADORA PANORAMA REAL',
    direccion: (last && last.direccion) || state?.settings?.projectLocation || '',
    contacto: (last && last.contacto) || state?.settings?.projectContact || '',
    telefono: (last && last.telefono) || state?.settings?.projectPhone || '',
    notas: '',
    conceptos: {},
    fotos: {}
  };

  data.estimaciones.push(newEst);
  data.activeEstimacionId = newId;
  saveEstimacionesData(data);
  return newEst;
}

// Actualizar datos generales de una estimación (fechas, nombre, notas)
export function updateEstimacionMeta(estId, updates) {
  const data = loadEstimacionesData();
  const est = data.estimaciones.find(e => e.id === estId);
  if (!est || est.locked) return false;
  Object.assign(est, updates);
  saveEstimacionesData(data);
  return true;
}

// Eliminar una estimación
export function deleteEstimacion(estId) {
  const data = loadEstimacionesData();
  if (data.estimaciones.length <= 1) {
    return false; // Al menos debe quedar una estimación
  }
  const target = data.estimaciones.find(e => e.id === estId);
  if (target && target.locked) {
    return false; // No permitir eliminar una estimación bloqueada
  }
  data.estimaciones = data.estimaciones.filter(e => e.id !== estId);
  // Re-enumerar secuencialmente
  data.estimaciones.forEach((e, idx) => {
    e.numero = idx + 1;
  });
  if (data.activeEstimacionId === estId) {
    data.activeEstimacionId = data.estimaciones[0].id;
  }
  saveEstimacionesData(data);
  return true;
}

// Actualizar el porcentaje de avance ejecutado (% Avance Actual) de un concepto en la estimación activa
export function setConceptoAvancePct(conceptId, pctAvance) {
  const data = loadEstimacionesData();
  const current = data.estimaciones.find(e => e.id === data.activeEstimacionId);
  if (!current || current.locked) return false;

  if (!current.conceptos) current.conceptos = {};
  const val = Number(pctAvance);
  if (isNaN(val) || val <= 0) {
    delete current.conceptos[conceptId];
  } else {
    current.conceptos[conceptId] = Math.round((val + Number.EPSILON) * 100) / 100;
  }
  saveEstimacionesData(data);
  return true;
}

// Mantener retrocompatibilidad para llamadas a setConceptoCantidadEjecutada
export function setConceptoCantidadEjecutada(conceptId, cantEje) {
  return setConceptoAvancePct(conceptId, cantEje);
}

// Normalizar enlaces compartidos desde Google Drive, OneDrive o Dropbox para que se visualicen e impriman directamente en <img>
export function normalizeCloudImageUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';

  // 1. Google Drive: https://drive.google.com/file/d/FILE_ID/view... o ?id=FILE_ID
  const gdriveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i)
    || url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i)
    || url.match(/drive\.google\.com\/uc\?(?:export=[a-z]+&)?id=([a-zA-Z0-9_-]+)/i)
    || url.match(/drive\.google\.com\/thumbnail\?id=([a-zA-Z0-9_-]+)/i);
  if (gdriveFileMatch && gdriveFileMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${gdriveFileMatch[1]}&sz=w1600`;
  }

  // 2. Dropbox: convertir ?dl=0 a ?raw=1
  if (/dropbox\.com/i.test(url)) {
    if (url.includes('?dl=0')) return url.replace('?dl=0', '?raw=1');
    if (!url.includes('raw=1')) return url + (url.includes('?') ? '&raw=1' : '?raw=1');
  }

  // 3. OneDrive: convertir /embed? a /download? cuando sea enlace embed de OneDrive
  if (/onedrive\.live\.com\/embed\?/i.test(url)) {
    return url.replace(/\/embed\?/i, '/download?');
  }

  return url;
}

// Obtener los enlaces de fotos (1 o 2) asociados a un concepto en una estimación
export function getConceptoFotosEstimacion(conceptId, estId = null) {
  const data = loadEstimacionesData();
  const targetId = estId || data.activeEstimacionId;
  const est = data.estimaciones.find(e => e.id === targetId) || data.estimaciones[0];
  if (!est || !est.fotos || !Array.isArray(est.fotos[conceptId])) return [];
  return est.fotos[conceptId]
    .filter(f => f && String(f.url || '').trim().length > 0)
    .slice(0, 2)
    .map(f => ({
      url: String(f.url || '').trim(),
      displayUrl: normalizeCloudImageUrl(f.url),
      nota: String(f.nota || '').trim()
    }));
}

// Guardar los enlaces de fotos (máximo 2) de un concepto en la estimación activa
export function setConceptoFotosEstimacion(conceptId, fotosList = []) {
  const data = loadEstimacionesData();
  const current = data.estimaciones.find(e => e.id === data.activeEstimacionId);
  if (!current || current.locked) return false;

  if (!current.fotos) current.fotos = {};
  const cleaned = (Array.isArray(fotosList) ? fotosList : [])
    .map(item => ({
      url: String(item?.url || '').trim(),
      nota: String(item?.nota || '').trim()
    }))
    .filter(item => item.url.length > 0)
    .slice(0, 2);

  if (cleaned.length === 0) {
    delete current.fotos[conceptId];
  } else {
    current.fotos[conceptId] = cleaned;
  }
  saveEstimacionesData(data);
  return true;
}

// Helpers de formateo para vista ejecutiva tipo Panorama Real
export function formatDDMMAAAA(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    } else if (parts[2].length === 4) {
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
  }
  return str;
}

export function formatDuracion(durDays, customDurStr = '') {
  if (customDurStr && String(customDurStr).trim()) return String(customDurStr).trim();
  const d = Number(durDays) || 0;
  if (d <= 0) return '';
  const w = Math.round((d / 7) * 10) / 10;
  if (w >= 1) {
    return Number.isInteger(w) ? `${w} semanas` : `${w.toFixed(1)} sem`;
  }
  return `${d} días`;
}

// Aplanar el árbol de catálogo respetando jerarquía y calcular subtotales de estimación (Modelo Panorama Real)
export function getEstimacionesCalculatedData() {
  const estData = loadEstimacionesData();
  let allEstimaciones = Array.isArray(estData.estimaciones) && estData.estimaciones.length > 0
    ? estData.estimaciones
    : getDefaultEstimacionesState().estimaciones;
  let activeEst = allEstimaciones.find(e => e.id === estData.activeEstimacionId) || allEstimaciones[0];
  if (!activeEst) {
    const defState = getDefaultEstimacionesState();
    allEstimaciones = defState.estimaciones;
    activeEst = allEstimaciones[0];
    estData.estimaciones = allEstimaciones;
    estData.activeEstimacionId = activeEst.id;
  }
  if (!activeEst.conceptos || typeof activeEst.conceptos !== 'object') {
    activeEst.conceptos = {};
  }
  if (!activeEst.fotos || typeof activeEst.fotos !== 'object') {
    activeEst.fotos = {};
  }

  // Sincronizar importes prorrateados y porcentaje global desde Alcances
  if (state && Array.isArray(state.treeData)) {
    calculateProrrateoCascade(state.treeData);
  }

  // Encontrar todas las estimaciones anteriores a la activa para calcular el acumulado anterior
  const activeNumero = Number(activeEst.numero) || 1;
  const priorEstimaciones = allEstimaciones.filter(e => Number(e.numero) < activeNumero);

  let grandTotalBase = 0;
  let grandTotalEjecutado = 0;
  let grandTotalAnterior = 0;
  let grandTotalAcumulado = 0;
  let grandTotalSaldo = 0;
  const puMap = new Map();
  const importeMap = new Map();

  function traverseNode(node, level = 1, parentPartidaLabel = '', inheritedColor = null) {
    const isParent = Array.isArray(node.children) && node.children.length > 0;
    const activeColor = node.color || inheritedColor || '#3b82f6';
    const color = typeof activeColor === 'object' ? activeColor : { bar: activeColor };
    const expanded = node.expanded !== false;

    if (!isParent) {
      // Concepto final ejecutable
      const cantBase = Math.round(((Number(node.cantidad) || 0) + Number.EPSILON) * 100) / 100;
      const pu = getEffectivePrecioUnitario(node);
      const importeBase = node.importe_calculado !== undefined && node.importe_calculado !== null
        ? Math.round((Number(node.importe_calculado) + Number.EPSILON) * 100) / 100
        : Math.round((cantBase * pu) * 100) / 100;
      const pctPonderacion = Number(node.porcentaje_global) || 0;

      puMap.set(node.id, pu);
      importeMap.set(node.id, importeBase);

      // Fechas y Duración
      const sched = node.schedule || {};
      let sDate = sched.startDate || node.fechaInicio || '';
      let eDate = sched.endDate || node.fechaFin || '';
      let durDays = Number(sched.durationDays) || Number(node.duracionDias) || 0;
      if ((!durDays || durDays <= 0) && sDate && eDate) {
        try {
          durDays = Math.max(1, diffDays(sDate, eDate) + 1);
        } catch (e) {}
      }
      const duracionStr = formatDuracion(durDays, node.duracion);
      const fechaInicioStr = formatDDMMAAAA(sDate);
      const fechaFinStr = formatDDMMAAAA(eDate);

      // Avance Anterior (% e Importe)
      let pctAnt = 0;
      priorEstimaciones.forEach(pe => {
        if (pe.conceptos && pe.conceptos[node.id] !== undefined) {
          pctAnt += Number(pe.conceptos[node.id]) || 0;
        }
      });
      pctAnt = Math.round((pctAnt + Number.EPSILON) * 100) / 100;
      const importeAnt = Math.round(((importeBase * (pctAnt / 100)) + Number.EPSILON) * 100) / 100;

      // Esta Estimación (% e Importe)
      const pctEje = (activeEst.conceptos && activeEst.conceptos[node.id] !== undefined)
        ? Number(activeEst.conceptos[node.id]) || 0
        : 0;
      const totalEje = Math.round(((importeBase * (pctEje / 100)) + Number.EPSILON) * 100) / 100;

      // Acumulado Actual (% e Importe)
      const pctAcum = Math.round(((pctAnt + pctEje) + Number.EPSILON) * 100) / 100;
      const totalAcum = Math.round(((importeAnt + totalEje) + Number.EPSILON) * 100) / 100;

      // Saldo Pendiente (% e Importe)
      const pctSaldo = Math.max(0, Math.round(((100 - pctAcum) + Number.EPSILON) * 100) / 100);
      const totalSaldo = Math.max(0, Math.round(((importeBase - totalAcum) + Number.EPSILON) * 100) / 100);
      const isExceeded = pctAcum > 100;

      const rawFotos = (activeEst.fotos && Array.isArray(activeEst.fotos[node.id])) ? activeEst.fotos[node.id] : [];
      const fotos = rawFotos
        .filter(f => f && String(f.url || '').trim().length > 0)
        .slice(0, 2)
        .map(f => ({
          url: String(f.url || '').trim(),
          displayUrl: normalizeCloudImageUrl(f.url),
          nota: String(f.nota || '').trim()
        }));

      grandTotalBase += importeBase;
      grandTotalEjecutado += totalEje;
      grandTotalAnterior += importeAnt;
      grandTotalAcumulado += totalAcum;
      grandTotalSaldo += totalSaldo;

      return [{
        id: node.id,
        clave: node.clave || '',
        descripcion: node.descripcion || '',
        unidad: node.unidad || 'LOTE',
        partidaNombre: parentPartidaLabel,
        fotos,
        isParent: false,
        level,
        color,
        expanded: true,
        duracionStr,
        fechaInicioStr,
        fechaFinStr,
        rawStartDate: sDate,
        rawEndDate: eDate,
        pctPonderacion,
        importeTotal: importeBase,
        cantBase,
        pu,
        importeBase,
        pctAnt,
        cantAnt: pctAnt,
        importeAnt,
        pctEje,
        cantEje: pctEje,
        importeEje: totalEje,
        totalEje,
        pctAcum,
        cantAcum: pctAcum,
        importeAcum: totalAcum,
        totalAcum,
        pctAvanceEsta: pctEje,
        pctAvanceAcum: pctAcum,
        pctSaldo,
        cantSaldo: pctSaldo,
        importeSaldo: totalSaldo,
        totalSaldo,
        isExceeded,
        porcentaje_relativo: Number(node.porcentaje_relativo) || 0,
        porcentaje_global: pctPonderacion,
        importe_calculado: importeBase
      }];
    }

    // Partida / Agrupador
    const currentPartidaLabel = `${node.clave || ''} ${node.descripcion || ''}`.trim() || parentPartidaLabel;
    const childrenRows = [];
    let partImporteBase = 0;
    let partPctPonderacion = 0;
    let partImporteAnt = 0;
    let partTotalEje = 0;
    let partTotalAcum = 0;
    let partTotalSaldo = 0;
    let descendantCount = 0;
    let minDate = null;
    let maxDate = null;

    (node.children || []).forEach(child => {
      const rows = traverseNode(child, level + 1, currentPartidaLabel, activeColor);
      rows.forEach(r => {
        childrenRows.push(r);
        if (!r.isParent) {
          descendantCount++;
          partImporteBase += r.importeBase;
          partPctPonderacion += r.pctPonderacion;
          partImporteAnt += r.importeAnt;
          partTotalEje += r.totalEje;
          partTotalAcum += r.totalAcum;
          partTotalSaldo += r.totalSaldo;
          if (r.rawStartDate) {
            if (!minDate || r.rawStartDate < minDate) minDate = r.rawStartDate;
          }
          if (r.rawEndDate) {
            if (!maxDate || r.rawEndDate > maxDate) maxDate = r.rawEndDate;
          }
        }
      });
    });

    partImporteBase = Math.round((partImporteBase + Number.EPSILON) * 100) / 100;
    partPctPonderacion = Math.round((partPctPonderacion + Number.EPSILON) * 100) / 100;
    partImporteAnt = Math.round((partImporteAnt + Number.EPSILON) * 100) / 100;
    partTotalEje = Math.round((partTotalEje + Number.EPSILON) * 100) / 100;
    partTotalAcum = Math.round((partTotalAcum + Number.EPSILON) * 100) / 100;
    partTotalSaldo = Math.round((partTotalSaldo + Number.EPSILON) * 100) / 100;

    const partPctAnt = partImporteBase > 0 ? Math.round((((partImporteAnt / partImporteBase) * 100) + Number.EPSILON) * 100) / 100 : 0;
    const partPctAvanceEsta = partImporteBase > 0 ? Math.round((((partTotalEje / partImporteBase) * 100) + Number.EPSILON) * 100) / 100 : 0;
    const partPctAvanceAcum = partImporteBase > 0 ? Math.round((((partTotalAcum / partImporteBase) * 100) + Number.EPSILON) * 100) / 100 : 0;
    const partPctSaldo = partImporteBase > 0 ? Math.max(0, Math.round((((partTotalSaldo / partImporteBase) * 100) + Number.EPSILON) * 100) / 100) : 0;

    let parentDurDays = 0;
    if (minDate && maxDate) {
      try {
        parentDurDays = Math.max(1, diffDays(minDate, maxDate) + 1);
      } catch (e) {}
    }
    const parentDuracionStr = formatDuracion(parentDurDays, node.duracion);
    const parentFechaInicioStr = formatDDMMAAAA(minDate || node.fechaInicio);
    const parentFechaFinStr = formatDDMMAAAA(maxDate || node.fechaFin);

    const parentRow = {
      id: node.id,
      clave: node.clave || '',
      descripcion: node.descripcion || '',
      unidad: '',
      isParent: true,
      level,
      color,
      expanded,
      descendantCount,
      duracionStr: parentDuracionStr,
      fechaInicioStr: parentFechaInicioStr,
      fechaFinStr: parentFechaFinStr,
      pctPonderacion: partPctPonderacion,
      importeTotal: partImporteBase,
      cantBase: 0,
      pu: 0,
      importeBase: partImporteBase,
      pctAnt: partPctAnt,
      cantAnt: partPctAnt,
      importeAnt: partImporteAnt,
      pctEje: partPctAvanceEsta,
      cantEje: partPctAvanceEsta,
      importeEje: partTotalEje,
      totalEje: partTotalEje,
      pctAcum: partPctAvanceAcum,
      cantAcum: partPctAvanceAcum,
      importeAcum: partTotalAcum,
      totalAcum: partTotalAcum,
      pctAvanceEsta: partPctAvanceEsta,
      pctAvanceAcum: partPctAvanceAcum,
      pctSaldo: partPctSaldo,
      cantSaldo: partPctSaldo,
      importeSaldo: partTotalSaldo,
      totalSaldo: partTotalSaldo,
      isExceeded: partTotalAcum > partImporteBase,
      porcentaje_relativo: Number(node.porcentaje_relativo) || 0,
      porcentaje_global: partPctPonderacion,
      importe_calculado: partImporteBase
    };

    return [parentRow, ...childrenRows];
  }

  const allRows = [];
  (state.treeData || []).forEach(root => {
    allRows.push(...traverseNode(root, 1));
  });

  grandTotalBase = Math.round((grandTotalBase + Number.EPSILON) * 100) / 100;
  grandTotalEjecutado = Math.round((grandTotalEjecutado + Number.EPSILON) * 100) / 100;
  grandTotalAnterior = Math.round((grandTotalAnterior + Number.EPSILON) * 100) / 100;
  grandTotalAcumulado = Math.round((grandTotalAcumulado + Number.EPSILON) * 100) / 100;
  grandTotalSaldo = Math.round((grandTotalSaldo + Number.EPSILON) * 100) / 100;

  const pctAvanceAnterior = grandTotalBase > 0 ? Math.round((((grandTotalAnterior / grandTotalBase) * 100) + Number.EPSILON) * 100) / 100 : 0;
  const pctAvanceEstaEstimacion = grandTotalBase > 0 ? Math.round((((grandTotalEjecutado / grandTotalBase) * 100) + Number.EPSILON) * 100) / 100 : 0;
  const pctAvanceGlobal = grandTotalBase > 0 ? Math.round((((grandTotalAcumulado / grandTotalBase) * 100) + Number.EPSILON) * 100) / 100 : 0;
  const pctSaldoGlobal = grandTotalBase > 0 ? Math.max(0, Math.round((((grandTotalSaldo / grandTotalBase) * 100) + Number.EPSILON) * 100) / 100) : 0;

  // ============================================================
  // CÁLCULO DE ANTICIPO Y AMORTIZACIÓN PROGRESIVA HASTA EL 100%
  // ============================================================
  const anticipoPct = estData.anticipoPct !== undefined && estData.anticipoPct !== null ? Number(estData.anticipoPct) : 30;
  const totalAnticipoContratado = Math.round(((grandTotalBase * (anticipoPct / 100)) + Number.EPSILON) * 100) / 100;

  // Ordenar cronológicamente todas las estimaciones para simular la amortización estricta acumulada
  const sortedEsts = [...allEstimaciones].sort((a, b) => a.numero - b.numero);

  let saldoAnticipoDisponible = totalAnticipoContratado;
  let amortizadoAnterior = 0;
  let amortizacionEsta = 0;

  sortedEsts.forEach(est => {
    let estTotal = 0;
    if (est.conceptos) {
      Object.entries(est.conceptos).forEach(([cId, pctVal]) => {
        const impBase = importeMap.get(cId) || ((puMap.get(cId) || 0) * (Number(pctVal) || 0));
        estTotal += impBase * ((Number(pctVal) || 0) / 100);
      });
    }
    estTotal = Math.round((estTotal + Number.EPSILON) * 100) / 100;

    // Amortización teórica proporcional al % de anticipo
    const amortTeorica = Math.round(((estTotal * (anticipoPct / 100)) + Number.EPSILON) * 100) / 100;
    // La amortización real se limita a no sobrepasar el saldo disponible de anticipo (hasta cubrir el 100%)
    const amortReal = Math.min(amortTeorica, saldoAnticipoDisponible);
    saldoAnticipoDisponible = Math.max(0, Math.round(((saldoAnticipoDisponible - amortReal) + Number.EPSILON) * 100) / 100);

    if (est.numero < activeEst.numero) {
      amortizadoAnterior += amortReal;
    } else if (est.numero === activeEst.numero) {
      amortizacionEsta = amortReal;
    }
  });

  amortizadoAnterior = Math.round((amortizadoAnterior + Number.EPSILON) * 100) / 100;
  amortizacionEsta = Math.round((amortizacionEsta + Number.EPSILON) * 100) / 100;
  const amortizadoAcumulado = Math.round(((amortizadoAnterior + amortizacionEsta) + Number.EPSILON) * 100) / 100;
  const saldoAnticipoPendiente = Math.max(0, Math.round(((totalAnticipoContratado - amortizadoAcumulado) + Number.EPSILON) * 100) / 100);
  const pctAnticipoAmortizado = totalAnticipoContratado > 0 
    ? Math.min(100, Math.round((((amortizadoAcumulado / totalAnticipoContratado) * 100) + Number.EPSILON) * 100) / 100) 
    : 100;
  const is100Covered = saldoAnticipoPendiente <= 0 || pctAnticipoAmortizado >= 100;
  const netoEstaEstimacion = Math.max(0, Math.round(((grandTotalEjecutado - amortizacionEsta) + Number.EPSILON) * 100) / 100);

  // ============================================================
  // CÁLCULO DE IVA Y TOTAL FACTURABLE (OPCIÓN 16% / PERSONALIZADO)
  // ============================================================
  const ivaPct = typeof estData.ivaPct === 'number' ? estData.ivaPct : 16;
  const ivaTotalContratado = Math.round(((grandTotalBase * (ivaPct / 100)) + Number.EPSILON) * 100) / 100;
  const ivaEstaEstimacion = Math.round(((netoEstaEstimacion * (ivaPct / 100)) + Number.EPSILON) * 100) / 100;
  const totalFacturadoConIva = Math.round(((netoEstaEstimacion + ivaEstaEstimacion) + Number.EPSILON) * 100) / 100;

  return {
    activeEst,
    estimacionesList: allEstimaciones,
    rows: allRows,
    kpis: {
      grandTotalBase,
      grandTotalEjecutado,
      pctAvanceEstaEstimacion,
      grandTotalAnterior,
      pctAvanceAnterior,
      grandTotalAcumulado,
      pctAvanceGlobal,
      grandTotalSaldo,
      pctSaldoGlobal,
      anticipo: {
        pct: anticipoPct,
        totalContratado: totalAnticipoContratado,
        amortizadoAnterior,
        amortizacionEsta,
        amortizadoAcumulado,
        saldoPendiente: saldoAnticipoPendiente,
        pctAmortizado: pctAnticipoAmortizado,
        is100Covered,
        netoEstaEstimacion
      },
      iva: {
        pct: ivaPct,
        totalContratado: ivaTotalContratado,
        estaEstimacion: ivaEstaEstimacion,
        totalConIva: totalFacturadoConIva
      }
    }
  };
}

const estimacionesSummaryCache = new Map();

function fingerprintRaw(raw) {
  if (!raw) return '0';
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${raw.length}:${(hash >>> 0).toString(36)}`;
}

function parseArrayOrEmpty(raw, pick = (v) => v) {
  if (!raw) return [];
  try {
    const value = pick(JSON.parse(raw));
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function computeEstimacionesSummary(treeNodes, estimaciones, fallbackTotalPresupuesto) {
  let grandTotalBase = 0;
  let grandTotalEstimado = 0;

  function walkNodes(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(node => {
      const isParent = Array.isArray(node.children) && node.children.length > 0;
      if (isParent) {
        walkNodes(node.children);
      } else {
        const cantBase = Math.round(((Number(node.cantidad) || 0) + Number.EPSILON) * 100) / 100;
        const pu = getEffectivePrecioUnitario(node);
        const importeBase = node.importe_calculado !== undefined && node.importe_calculado !== null
          ? Number(node.importe_calculado)
          : Math.round((cantBase * pu) * 100) / 100;

        let pctTotalEst = 0;
        estimaciones.forEach(est => {
          if (est && est.conceptos && est.conceptos[node.id] !== undefined) {
            pctTotalEst += Number(est.conceptos[node.id]) || 0;
          }
        });
        pctTotalEst = Math.round((pctTotalEst + Number.EPSILON) * 100) / 100;
        const importeTotalEst = Math.round(((importeBase * (pctTotalEst / 100)) + Number.EPSILON) * 100) / 100;

        grandTotalBase += importeBase;
        grandTotalEstimado += importeTotalEst;
      }
    });
  }

  walkNodes(treeNodes);

  grandTotalBase = Math.round((grandTotalBase + Number.EPSILON) * 100) / 100;
  grandTotalEstimado = Math.round((grandTotalEstimado + Number.EPSILON) * 100) / 100;

  const baseForPct = grandTotalBase > 0 ? grandTotalBase : (Number(fallbackTotalPresupuesto) || 0);
  const pctAvance = baseForPct > 0
    ? Math.round((((grandTotalEstimado / baseForPct) * 100) + Number.EPSILON) * 100) / 100
    : 0;
  const barWidthPct = Math.max(0, Math.min(100, pctAvance));

  return {
    totalBase: baseForPct,
    totalEstimado: grandTotalEstimado,
    pctAvance,
    barWidthPct,
    estimacionesCount: estimaciones.length
  };
}

// Calcular el avance estimado real de cualquier proyecto sumando TODAS sus Estimaciones registradas.
// Para proyectos no activos en memoria, cachea el resultado por id + huella de cadenas crudas en localStorage.
export function calculateProjectTotalEstimacionesSummary(projectId, fallbackTotalPresupuesto = 0) {
  let rawPrimary = null;
  let rawLegacy = null;
  try {
    if (typeof localStorage !== 'undefined') {
      rawPrimary = localStorage.getItem(getEstimacionesStorageKeyForProject(projectId));
      if (!rawPrimary) {
        rawLegacy = localStorage.getItem(getEstimacionesLegacyKeyForProject(projectId));
      }
    }
  } catch (_) {}
  const rawEst = rawPrimary || rawLegacy;
  const parseEstimaciones = () => parseArrayOrEmpty(rawEst, parsed => parsed?.estimaciones);

  const isActiveInMemory = projectId && projectId === getActiveProjectId() && Array.isArray(state.treeData) && state.treeData.length > 0;
  if (isActiveInMemory) {
    return computeEstimacionesSummary(state.treeData, parseEstimaciones(), fallbackTotalPresupuesto);
  }

  let rawTree = null;
  try {
    rawTree = typeof localStorage !== 'undefined' ? localStorage.getItem(getStorageKey(projectId)) : null;
  } catch (_) {}

  const cacheKey = `${fingerprintRaw(rawTree)}|${rawPrimary ? 'p' : 'l'}:${fingerprintRaw(rawEst)}|${Number(fallbackTotalPresupuesto) || 0}`;
  const cached = estimacionesSummaryCache.get(projectId);
  if (cached && cached.key === cacheKey) {
    return { ...cached.result };
  }

  if (estimacionesSummaryCache.size > 500) {
    estimacionesSummaryCache.clear();
  }
  const result = computeEstimacionesSummary(parseArrayOrEmpty(rawTree), parseEstimaciones(), fallbackTotalPresupuesto);
  estimacionesSummaryCache.set(projectId, { key: cacheKey, result });
  return { ...result };
}

// =========================================================================
// GESTIÓN DE SUB-VISTAS: COBRANZA AL CLIENTE vs PAGOS A ESPECIALISTAS
// =========================================================================

export function getEstimacionesSubView() {
  const data = loadEstimacionesData();
  return data.activeSubView || 'cobranza';
}

export function setEstimacionesSubView(subView) {
  const data = loadEstimacionesData();
  data.activeSubView = (subView === 'especialistas') ? 'especialistas' : 'cobranza';
  saveEstimacionesData(data);
  return data.activeSubView;
}

// =========================================================================
// MÓDULO DE PAGOS A ESPECIALISTAS Y SUBCONTRATOS (CUENTAS POR PAGAR)
// =========================================================================

const SPECIALTY_KEYWORDS = [
  'estudio', 'topograf', 'suelo', 'geotecni', 'ingenier', 'estructur',
  'instalaci', 'hidrosanitari', 'hidraulic', 'sanitari', 'electri', 'gas',
  'clima', 'aire acondicionad', 'hvac', 'render', '3d', 'peritaj', 'licencia',
  'tramite', 'gestor', 'subcontrat'
];

function isSpecialtyOrStudyNode(node, parentTitle = '') {
  if (!node) return false;
  if (Number(node.costoSubcontrato) > 0) return true;
  if (Array.isArray(node.cotizaciones) && node.cotizaciones.length > 0) return true;
  if (node.proveedorElegidoNombre && String(node.proveedorElegidoNombre).trim().length > 0) return true;

  const textToCheck = `${node.clave || ''} ${node.descripcion || ''} ${parentTitle || ''}`.toLowerCase();
  return SPECIALTY_KEYWORDS.some(kw => textToCheck.includes(kw));
}

// Obtener la lista consolidada de contratos de ingenierías y estudios desde ALCANCES
export function getSpecialistsContractsData() {
  const data = loadEstimacionesData();
  const specialistsStore = data.specialists || {};
  const treeNodes = (state && Array.isArray(state.treeData)) ? state.treeData : [];

  const contracts = [];
  const processedNodeIds = new Set();

  function scanNode(node, parentTitle = '', level = 1) {
    if (!node) return;
    const isParent = Array.isArray(node.children) && node.children.length > 0;
    const currentTitle = `${node.clave || ''} ${node.descripcion || ''}`.trim();

    // Solo agregar o mostrar las filas de los conceptos o especialidades que tengan cotizaciones
    const hasQuotes = Array.isArray(node.cotizaciones) && node.cotizaciones.some(c => c && (Number(c.monto) > 0 || (c.proveedor && String(c.proveedor).trim().length > 0)));
    const hasRegisteredPayments = Boolean(specialistsStore[node.id] && Array.isArray(specialistsStore[node.id].pagos) && specialistsStore[node.id].pagos.length > 0);
    const isContractCandidate = hasQuotes || hasRegisteredPayments;

    if (isContractCandidate && !processedNodeIds.has(node.id)) {
      processedNodeIds.add(node.id);

      // Calcular monto contratado
      let totalContratado = 0;
      let winnerCotizacion = null;

      if (hasQuotes) {
        winnerCotizacion = node.cotizaciones.find(c => c.isGanador || c.seleccionada) || node.cotizaciones[0];
        if (winnerCotizacion && Number(winnerCotizacion.monto) > 0) {
          const cant = Number(node.cantidad) || 1;
          totalContratado = (node.importe_calculado !== undefined && Number(node.importe_calculado) > 0)
            ? Number(node.importe_calculado)
            : Math.round(((cant * Number(winnerCotizacion.monto)) + Number.EPSILON) * 100) / 100;
        }
      }

      if (totalContratado <= 0 && winnerCotizacion && Number(winnerCotizacion.monto) > 0) {
        totalContratado = Number(winnerCotizacion.monto);
      }

      if (totalContratado <= 0 && Number(node.costoSubcontrato) > 0) {
        totalContratado = Number(node.costoSubcontrato);
      }

      if (totalContratado <= 0 && node.importe_calculado !== undefined && Number(node.importe_calculado) > 0) {
        totalContratado = Number(node.importe_calculado);
      }

      if (totalContratado <= 0) {
        if (isParent) {
          // Sumar importe base de sus hijos
          let sumHijos = 0;
          function sumLeafs(n) {
            if (Array.isArray(n.children) && n.children.length > 0) {
              n.children.forEach(sumLeafs);
            } else {
              const cant = Number(n.cantidad) || 1;
              const pu = getEffectivePrecioUnitario(n);
              const imp = n.importe_calculado !== undefined && n.importe_calculado !== null
                ? Number(n.importe_calculado)
                : (Number(n.costoSubcontrato) || (cant * pu));
              sumHijos += imp;
            }
          }
          sumLeafs(node);
          totalContratado = sumHijos;
        } else {
          const cant = Number(node.cantidad) || 1;
          const pu = getEffectivePrecioUnitario(node);
          totalContratado = node.importe_calculado !== undefined && node.importe_calculado !== null
            ? Number(node.importe_calculado)
            : (cant * pu);
        }
      }

      const stored = specialistsStore[node.id] || {};
      if (stored.totalContratadoOverride !== undefined && !isNaN(Number(stored.totalContratadoOverride))) {
        totalContratado = Number(stored.totalContratadoOverride);
      }
      totalContratado = Math.round((totalContratado + Number.EPSILON) * 100) / 100;

      // Proveedor asignado
      let proveedorName = '';
      if (stored.proveedorName && stored.proveedorName.trim().length > 0) {
        proveedorName = stored.proveedorName.trim();
      } else if (node.proveedorElegidoNombre && node.proveedorElegidoNombre.trim().length > 0) {
        proveedorName = node.proveedorElegidoNombre.trim();
      } else if (winnerCotizacion && winnerCotizacion.proveedor && winnerCotizacion.proveedor.trim().length > 0) {
        proveedorName = winnerCotizacion.proveedor.trim();
      }

      // Pagos registrados
      const pagosRaw = Array.isArray(stored.pagos) ? stored.pagos : [];
      const pagos = [...pagosRaw].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const totalPagado = Math.round((pagos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0) + Number.EPSILON) * 100) / 100;
      const saldoPendiente = Math.max(0, Math.round(((totalContratado - totalPagado) + Number.EPSILON) * 100) / 100);
      const pctPagado = totalContratado > 0
        ? Math.min(100, Math.round((((totalPagado / totalContratado) * 100) + Number.EPSILON) * 100) / 100)
        : (totalPagado > 0 ? 100 : 0);

      const ultimoPago = pagos.length > 0 ? pagos[0] : null;

      contracts.push({
        nodeId: node.id,
        clave: node.clave || '',
        descripcion: node.descripcion || 'Servicio Profesional',
        especialidad: node.descripcion || 'Servicio Profesional',
        partidaNombre: parentTitle || 'GENERAL',
        color: node.color || '#6366f1',
        proveedor: proveedorName,
        proveedorName,
        totalContratado,
        totalPagado,
        saldoPendiente,
        pctPagado,
        ultimoPago,
        pagos,
        pagosCount: pagos.length,
        isLiquidated: totalContratado > 0 && saldoPendiente <= 0
      });
    }

    if (isParent) {
      node.children.forEach(child => scanNode(child, currentTitle || parentTitle, level + 1));
    }
  }

  treeNodes.forEach(rootNode => scanNode(rootNode, '', 1));

  // Ordenar por clave lógica
  contracts.sort((a, b) => {
    return String(a.clave).localeCompare(String(b.clave), undefined, { numeric: true, sensitivity: 'base' });
  });

  return contracts;
}

// Registrar un nuevo pago a un especialista
export function addSpecialistPayment(nodeId, paymentData) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo lectura: tu rol no permite registrar pagos a especialistas.', 'warning');
    return null;
  }
  const data = loadEstimacionesData();
  if (!data.specialists) data.specialists = {};
  if (!data.specialists[nodeId]) {
    data.specialists[nodeId] = {
      proveedorName: '',
      notas: '',
      pagos: []
    };
  }
  if (!Array.isArray(data.specialists[nodeId].pagos)) {
    data.specialists[nodeId].pagos = [];
  }

  const paymentId = `pago_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const monto = Math.round(((Number(paymentData.monto) || 0) + Number.EPSILON) * 100) / 100;
  
  const newPago = {
    id: paymentId,
    monto,
    fecha: paymentData.fecha || formatDate(new Date()),
    concepto: (paymentData.concepto || 'Pago a especialista').trim(),
    metodo: paymentData.metodo || 'Transferencia SPEI',
    referencia: (paymentData.referencia || '').trim(),
    createdAt: Date.now()
  };

  data.specialists[nodeId].pagos.push(newPago);

  if (paymentData.proveedorName && paymentData.proveedorName.trim().length > 0) {
    data.specialists[nodeId].proveedorName = paymentData.proveedorName.trim();
  }
  saveEstimacionesData(data);
  return newPago;
}

// Actualizar un pago existente
export function updateSpecialistPayment(nodeId, paymentId, paymentData) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo lectura: tu rol no permite modificar pagos a especialistas.', 'warning');
    return false;
  }
  const data = loadEstimacionesData();
  const spec = data.specialists?.[nodeId];
  if (!spec || !Array.isArray(spec.pagos)) return false;
  const pago = spec.pagos.find(p => p.id === paymentId);
  if (!pago) return false;

  if (paymentData.monto !== undefined) {
    pago.monto = Math.round(((Number(paymentData.monto) || 0) + Number.EPSILON) * 100) / 100;
  }
  if (paymentData.fecha) pago.fecha = paymentData.fecha;
  if (paymentData.concepto) pago.concepto = paymentData.concepto.trim();
  if (paymentData.metodo) pago.metodo = paymentData.metodo;
  if (paymentData.referencia !== undefined) pago.referencia = paymentData.referencia.trim();

  saveEstimacionesData(data);
  return true;
}

// Eliminar un pago
export function deleteSpecialistPayment(nodeId, paymentId) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo lectura: tu rol no permite eliminar pagos a especialistas.', 'warning');
    return false;
  }
  const data = loadEstimacionesData();
  const spec = data.specialists?.[nodeId];
  if (!spec || !Array.isArray(spec.pagos)) return false;
  spec.pagos = spec.pagos.filter(p => p.id !== paymentId);
  saveEstimacionesData(data);
  return true;
}

// Asignar o actualizar el nombre del proveedor para una especialidad
export function updateSpecialistProveedor(nodeId, proveedorName) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo lectura: tu rol no permite editar el proveedor de la especialidad.', 'warning');
    return false;
  }
  const data = loadEstimacionesData();
  if (!data.specialists) data.specialists = {};
  if (!data.specialists[nodeId]) {
    data.specialists[nodeId] = {
      proveedorName: '',
      notas: '',
      pagos: []
    };
  }
  data.specialists[nodeId].proveedorName = (proveedorName || '').trim();
  saveEstimacionesData(data);
  return true;
}

// Resumen financiero global de flujo de caja en tiempo real
export function getCashFlowSummary(existingCalc = null) {
  const estimacionesCalc = existingCalc || getEstimacionesCalculatedData();
  const kpis = estimacionesCalc?.kpis || {};
  const specialists = getSpecialistsContractsData();

  const totalCobradoCliente = Math.round(((Number(kpis.grandTotalAcumulado) || 0) + Number.EPSILON) * 100) / 100;
  const totalContratadoCliente = Math.round(((Number(kpis.grandTotalBase) || 0) + Number.EPSILON) * 100) / 100;
  const pctCobradoCliente = Number(kpis.pctAvanceGlobal) || 0;

  let totalContratadoEspecialistas = 0;
  let totalPagadoEspecialistas = 0;
  let totalSaldoEspecialistas = 0;

  specialists.forEach(s => {
    totalContratadoEspecialistas += (Number(s.totalContratado) || 0);
    totalPagadoEspecialistas += (Number(s.totalPagado) || 0);
    totalSaldoEspecialistas += (Number(s.saldoPendiente) || 0);
  });

  totalContratadoEspecialistas = Math.round((totalContratadoEspecialistas + Number.EPSILON) * 100) / 100;
  totalPagadoEspecialistas = Math.round((totalPagadoEspecialistas + Number.EPSILON) * 100) / 100;
  totalSaldoEspecialistas = Math.round((totalSaldoEspecialistas + Number.EPSILON) * 100) / 100;

  const pctPagadoEspecialistas = totalContratadoEspecialistas > 0
    ? Math.round((((totalPagadoEspecialistas / totalContratadoEspecialistas) * 100) + Number.EPSILON) * 100) / 100
    : 0;

  // Saldo en Banco / Margen Disponible = Total Cobrado al Cliente menos Total Pagado a Especialistas
  const saldoEnBanco = Math.round(((totalCobradoCliente - totalPagadoEspecialistas) + Number.EPSILON) * 100) / 100;
  const isPositive = saldoEnBanco >= 0;

  return {
    totalCobradoCliente,
    totalContratadoCliente,
    pctCobradoCliente,
    totalContratadoEspecialistas,
    totalPagadoEspecialistas,
    pctPagadoEspecialistas,
    totalSaldoEspecialistas,
    saldoEnBanco,
    isPositive,
    specialistsCount: specialists.length,
    activeSpecialistsCount: specialists.filter(s => s.saldoPendiente > 0.01).length,
    liquidatedSpecialistsCount: specialists.filter(s => s.totalContratado > 0 && s.saldoPendiente <= 0.01).length
  };
}
