// js/modules/calendario/calendarioAutoProgramService.js
// ✨ Auto-Programar: genera una propuesta de Programa de Obra a partir de la Base de Procesos Constructivos
// (procesosConstructivosDB.js) y la traduce al modelo de Cubikar (predecesoras Fin-a-Inicio + lagDays por concepto).
//
// Traducción de enlaces de la base al modelo:
//  - FI (FS) + espera  -> predecesora normal; lagDays = mayor espera de sus enlaces FI.
//  - II (SS) + desfase -> el modelo solo maneja Fin-a-Inicio, así que el inicio se ancla:
//      * si el concepto además tiene predecesoras FI: se ajusta lagDays para respetar el desfase II;
//      * si no tiene predecesoras FI: se fija su fecha de inicio (el usuario puede moverla después).
//  - Se conservan las duraciones capturadas y los avances (periods) de cada concepto.

import { state, persistLocalData } from '../../state/store.js?v=20261121_cf44';
import { getActiveProjectId } from '../../config/constants.js?v=20261121_cf44';
import { getProjectById } from '../portal/projectService.js?v=20261121_cf44';
import {
  extractScheduleItems,
  recalculateScheduleCPM,
  getScheduleSettings,
  saveScheduleSettings,
  getWorkdaysSettings,
  getNextWorkingDate,
  getProjectCreationDate,
  saveScheduleUndoSnapshot,
  parseDate,
  formatDate,
  addDays,
  diffDays
} from './calendarioModel.js?v=20261121_cf44';
import { estimateConceptDuration } from './calendarioAiService.js?v=20261121_cf44';
import {
  TIPOS_OBRA,
  normalizarTexto,
  detectarTipoPorConceptos,
  generarPropuesta
} from './procesosConstructivosDB.js?v=20261121_cf44';

export { TIPOS_OBRA };

function cloneTree(tree) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(tree);
  } catch (e) {}
  return JSON.parse(JSON.stringify(tree || []));
}

function buildConceptosDesdeItems(items) {
  return items
    .filter(it => it.tipo === 'concepto')
    .map(it => {
      const saved = parseInt(it.node?.schedule?.durationDays, 10);
      const dur = saved > 0 ? saved : estimateConceptDuration(it);
      return {
        id: String(it.id),
        clave: it.clave || '',
        descripcion: it.descripcion || '',
        partida: it.parentPartidaName || '',
        durationDays: Math.max(3, parseInt(dur, 10) || 3)
      };
    });
}

// Tipo de obra inicial: el elegido en el proyecto (selector "Tipo de Proyecto"); si no hay, se infiere del presupuesto.
export function getAutoProgramTipoInicial() {
  let proj = null;
  try { proj = getProjectById(getActiveProjectId()); } catch (e) {}
  const tipoTxt = normalizarTexto(proj?.tipoObra || '');
  if (tipoTxt) {
    const exacto = Object.values(TIPOS_OBRA).find(t =>
      normalizarTexto(t.valorSelector) === tipoTxt || t.id === tipoTxt || normalizarTexto(t.label) === tipoTxt);
    if (exacto) return { tipoId: exacto.id, origen: 'proyecto' };
  }
  const conceptos = buildConceptosDesdeItems(extractScheduleItems(state.treeData));
  const pista = `${proj?.tipoObra || ''} ${proj?.projectName || state.settings?.projectName || ''}`;
  return { tipoId: detectarTipoPorConceptos(conceptos, pista), origen: 'presupuesto' };
}

// Término actual del programa (sin modificar nada)
export function getCurrentScheduleEnd() {
  const items = extractScheduleItems(state.treeData).filter(it => it.tipo === 'concepto' && it.endDate);
  if (items.length === 0) return null;
  return items.reduce((max, it) => (it.endDate > max ? it.endDate : max), items[0].endDate);
}

// Calcula la propuesta. Con apply=false trabaja sobre una copia del árbol (vista previa sin efectos).
function computeAutoProgram(tipoId, apply = false) {
  const tree = apply ? state.treeData : cloneTree(state.treeData);
  const items = extractScheduleItems(tree);
  const concepts = items.filter(it => it.tipo === 'concepto');
  const conceptos = buildConceptosDesdeItems(items);
  const propuesta = generarPropuesta(conceptos, tipoId);

  const cfg = getScheduleSettings();
  const respectWorkdays = cfg.respectWorkdays !== false;
  const workdaysCfg = getWorkdaysSettings();
  const baseStartDt = getNextWorkingDate(cfg.startDate || getProjectCreationDate(), workdaysCfg, respectWorkdays);
  const baseStartStr = formatDate(baseStartDt);

  const byId = new Map(concepts.map(c => [String(c.id), c]));
  const filaById = new Map(propuesta.filas.map(f => [String(f.id), f]));

  // 1. Estructura base: predecesoras FI + espera máxima
  propuesta.filas.forEach(f => {
    const it = byId.get(String(f.id));
    if (!it) return;
    const fs = f.links.filter(l => l.type === 'FS');
    const preds = [...new Set(fs.map(l => String(l.id)))];
    const lag = fs.reduce((m, l) => Math.max(m, parseInt(l.lag, 10) || 0), 0);
    const dur = f.concepto.durationDays;
    const prev = it.node.schedule || {};
    it.node.schedule = {
      ...prev,
      startDate: baseStartStr,
      endDate: formatDate(addDays(baseStartDt, dur - 1)),
      durationDays: dur,
      predecessors: preds,
      lagDays: lag,
      isManual: false,
      periods: prev.periods || {}
    };
  });

  // 2. Respetar los enlaces en paralelo (II + desfase) iterando con el motor CPM real de Cubikar
  let summary = recalculateScheduleCPM(items, { respectWorkdays, workdaysCfg });
  const maxPasses = Math.max(4, concepts.length + 2);
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    propuesta.filas.forEach(f => {
      const ss = f.links.filter(l => l.type === 'SS');
      if (ss.length === 0) return;
      const it = byId.get(String(f.id));
      if (!it) return;
      let requiredDt = null;
      ss.forEach(l => {
        const pred = byId.get(String(l.id));
        if (!pred || !pred.startDate) return;
        const cand = getNextWorkingDate(addDays(pred.startDate, parseInt(l.lag, 10) || 0), workdaysCfg, respectWorkdays);
        if (!requiredDt || cand > requiredDt) requiredDt = cand;
      });
      if (!requiredDt || parseDate(it.startDate) >= requiredDt) return;
      const hasFsPreds = (it.node.schedule.predecessors || []).length > 0;
      if (hasFsPreds && it.minAllowedStartDate) {
        it.node.schedule.lagDays = Math.max(0, diffDays(it.minAllowedStartDate, requiredDt));
      } else {
        it.node.schedule.startDate = formatDate(requiredDt);
        it.node.schedule.endDate = formatDate(addDays(requiredDt, f.concepto.durationDays - 1));
      }
      changed = true;
    });
    if (!changed) break;
    summary = recalculateScheduleCPM(items, { respectWorkdays, workdaysCfg });
  }

  const filas = propuesta.filas.map(f => {
    const it = byId.get(String(f.id));
    return {
      ...f,
      startDate: it?.startDate || '',
      endDate: it?.endDate || '',
      durationDays: it?.durationDays || f.concepto.durationDays,
      isCritical: Boolean(it?.isCritical)
    };
  });

  return {
    tipo: TIPOS_OBRA[propuesta.tipoId],
    filas,
    resumenEtapas: propuesta.resumenEtapas,
    startDate: baseStartStr,
    endDate: summary?.projectEndDate || '',
    criticalCount: summary?.criticalCount || 0,
    linkedCount: summary?.linkedCount || 0,
    heredados: filas.filter(f => f.heredada).length,
    totalConceptos: filas.length,
    _filaById: filaById
  };
}

export function previewAutoProgram(tipoId) {
  return computeAutoProgram(tipoId, false);
}

export function applyAutoProgram(tipoId) {
  const tipo = TIPOS_OBRA[tipoId];
  saveScheduleUndoSnapshot(`Auto-Programar: ${tipo ? tipo.valorSelector : tipoId}`);
  saveScheduleSettings({ showCriticalPath: true });
  const result = computeAutoProgram(tipoId, true);
  persistLocalData(true);
  return result;
}
