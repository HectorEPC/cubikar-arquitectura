import { getStorageKey, getSettingsKey, getActiveProjectId, STORAGE_KEY_CLIPBOARD } from '../config/constants.js';
import { defaultTreeData, defaultSettings } from '../config/defaultData.js';
import { syncActiveProjectSummary, getProjectById } from '../modules/portal/projectService.js';
import { syncProjectToCloud, loadProjectTreeFromCloud } from '../core/cloudProjectService.js';
import { broadcastProjectMutation } from '../core/realtimeSync.js';
import { sanitizeCatalogNodes } from '../core/textSanitizer.js';
import { CASA_LAURA_PROJECT } from '../modules/io/casaLauraData.js';

// Estado global reactivo y centralizado de la aplicación
export const state = {
  treeData: [],
  settings: Object.assign({}, defaultSettings),
  activeSelectedId: null,
  currentFilter: 'Todos',
  currentMatrizFilter: 'Todos',
  clipboardNode: null,
  clipboardMeta: null
};

// Sincronizar portapapeles compartido entre proyectos desde localStorage
export function syncClipboardFromStorage() {
  try {
    const rawClip = localStorage.getItem(STORAGE_KEY_CLIPBOARD);
    if (rawClip) {
      const parsed = JSON.parse(rawClip);
      state.clipboardNode = parsed.concept || parsed;
      state.clipboardMeta = {
        sourceProjectId: parsed.sourceProjectId || null,
        sourceProjectName: parsed.sourceProjectName || '',
        insumosCount: parsed.insumosCount || (parsed.concept?.insumos?.length || 0),
        copiedAt: parsed.copiedAt || null
      };
    } else {
      state.clipboardNode = null;
      state.clipboardMeta = null;
    }
  } catch (e) {
    state.clipboardNode = null;
    state.clipboardMeta = null;
  }
}

const LEGACY_DEFAULT_UNQUOTED_PRICES = {
  '1.1': 12500,
  '1.2': 22000,
  '2.1': 9500,
  '2.2': 16000,
  '2.3': 15000,
  '3.1': 21000,
  '3.2': 12000,
  '3.3': 10500,
  '3.4': 14500,
  '4.2': 22000,
  '4.3': 19500,
  '5.1': 8000,
  '5.2': 12000
};

function clearLegacyUnquotedDefaultPrices(nodes) {
  if (!Array.isArray(nodes)) return false;
  let changed = false;
  nodes.forEach(n => {
    const hasQuotes = Array.isArray(n.cotizaciones) && n.cotizaciones.length > 0;
    const legacyPu = LEGACY_DEFAULT_UNQUOTED_PRICES[String(n.id)];
    if (!hasQuotes && legacyPu !== undefined && Number(n.precioUnitario) === legacyPu) {
      n.precioUnitario = 0;
      n.costoDirecto = 0;
      changed = true;
    }
    if (Array.isArray(n.children) && n.children.length > 0) {
      if (clearLegacyUnquotedDefaultPrices(n.children)) changed = true;
    }
  });
  return changed;
}

// Cargar estado inicial desde localStorage
export function initStore() {
  // Sincronizar portapapeles compartido de conceptos entre proyectos
  syncClipboardFromStorage();

  // Cargar configuración
  try {
    const savedSettings = localStorage.getItem(getSettingsKey());
    if (savedSettings) {
      state.settings = Object.assign({}, defaultSettings, JSON.parse(savedSettings));
    } else {
      const projMeta = getProjectById(getActiveProjectId());
      const cloudOverrides = {};
      if (projMeta && typeof projMeta === 'object') {
        const metaKeys = [
          'companyName', 'companyLogo', 'projectName', 'projectLocation',
          'currency', 'currencySymbol', 'applySobrecosto',
          'pctIndirectos', 'pctFinanciamiento', 'pctUtilidad',
          'pctAdicionales', 'pctSegurosFianzas', 'pctFasar', 'ivaPct', 'createdAt'
        ];
        metaKeys.forEach(k => {
          if (projMeta[k] !== undefined) cloudOverrides[k] = projMeta[k];
        });
        if (projMeta.presupuestoArq && typeof projMeta.presupuestoArq === 'object') {
          cloudOverrides.presupuestoArq = JSON.parse(JSON.stringify(projMeta.presupuestoArq));
        }
      }
      state.settings = Object.assign({}, defaultSettings, cloudOverrides);
    }

    if (!state.settings.createdAt) {
      const projMeta = getProjectById(getActiveProjectId());
      if (projMeta && projMeta.createdAt) {
        state.settings.createdAt = projMeta.createdAt;
      }
    }
  } catch (e) {
    console.error('Error cargando configuración:', e);
    state.settings = Object.assign({}, defaultSettings);
  }

  // Cargar árbol de catálogo
  try {
    const savedData = localStorage.getItem(getStorageKey());
    if (savedData) {
      state.treeData = JSON.parse(savedData);
    } else {
      state.treeData = JSON.parse(JSON.stringify(defaultTreeData));
      // Si no existe localmente, intentar cargar desde la nube Supabase
      const activePId = getActiveProjectId();
      if (activePId) {
        loadProjectTreeFromCloud(activePId).then(cloudTree => {
          if (Array.isArray(cloudTree) && cloudTree.length > 0) {
            clearLegacyUnquotedDefaultPrices(cloudTree);
            state.treeData = cloudTree;
            localStorage.setItem(getStorageKey(), JSON.stringify(cloudTree));
            if (typeof window !== 'undefined' && typeof window.renderTAB1 === 'function') {
              window.renderTAB1();
            }
          }
        }).catch(err => console.warn('[CloudSync] Fallo al cargar árbol de la nube:', err));
      }
    }
  } catch (e) {
    console.error('Error cargando treeData:', e);
    state.treeData = JSON.parse(JSON.stringify(defaultTreeData));
  }

  // Quitar sub-filas heredadas o almacenadas en insumos de matrices
  function stripSubInsumos(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(n => {
      if (Array.isArray(n.insumos)) {
        n.insumos.forEach(ins => {
          if (ins.subInsumos) delete ins.subInsumos;
          if (ins.expanded !== undefined) delete ins.expanded;
        });
      }
      if (Array.isArray(n.children)) {
        stripSubInsumos(n.children);
      }
    });
  }
  stripSubInsumos(state.treeData);

  // Sanitizar todos los números para asegurar estrictamente 2 decimales
  function roundNodesTo2Decimals(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(n => {
      if (n.cantidad !== undefined) {
        n.cantidad = Math.round(((Number(n.cantidad) || 0) + Number.EPSILON) * 100) / 100;
      }
      if (n.precioUnitario !== undefined) {
        n.precioUnitario = Math.round(((Number(n.precioUnitario) || 0) + Number.EPSILON) * 100) / 100;
      }
      if (n.costoDirecto !== undefined) {
        n.costoDirecto = Math.round(((Number(n.costoDirecto) || 0) + Number.EPSILON) * 100) / 100;
      }
      if (Array.isArray(n.insumos)) {
        n.insumos.forEach(ins => {
          if (ins.cantidad !== undefined) {
            // Las cantidades de las matrices APU consideran estrictamente 5 decimales
            ins.cantidad = Math.round(((Number(ins.cantidad) || 0) + Number.EPSILON) * 100000) / 100000;
          }
          if (ins.costoUnitario !== undefined) {
            ins.costoUnitario = Math.round(((Number(ins.costoUnitario) || 0) + Number.EPSILON) * 100) / 100;
          }
        });
      }
      if (Array.isArray(n.children)) {
        roundNodesTo2Decimals(n.children);
      }
    });
  }
  roundNodesTo2Decimals(state.treeData);
  
  // Sincronizar automáticamente matrices con el catálogo exacto de Opus 2014
  function syncOpusExactMatrices(nodes) {
    if (!Array.isArray(nodes) || !CASA_LAURA_PROJECT) return;
    const exactMap = new Map();
    let hasOpusConcepts = false;
    CASA_LAURA_PROJECT.forEach(p => {
      (p.children || []).forEach(c => {
        if (c.clave && Array.isArray(c.insumos) && c.insumos.length > 0) {
          exactMap.set(c.clave.trim().toUpperCase(), c);
        }
      });
    });

    function walk(list) {
      list.forEach(n => {
        if (n.clave) {
          const exact = exactMap.get(n.clave.trim().toUpperCase());
          if (exact) {
            hasOpusConcepts = true;
            // Solo sincronizar con Opus si el nodo aún no ha sido personalizado por el usuario y carece de matriz
            if (!n.isMatrixCustomized && !n.userClearedMatrix && (!Array.isArray(n.insumos) || n.insumos.length === 0)) {
              n.insumos = JSON.parse(JSON.stringify(exact.insumos));
              n.precioUnitario = exact.precioUnitario;
              n.costoDirecto = exact.costoDirecto;
              n.unidad = exact.unidad || n.unidad;
              if (exact.descripcion && (!n.descripcion || n.descripcion.length < 10)) {
                n.descripcion = exact.descripcion;
              }
            }
          }
        }
        if (Array.isArray(n.children)) walk(n.children);
      });
    }
    walk(nodes);

    // Si el proyecto actual es Casa Laura o contiene conceptos Opus, desactivar sobrecosto para reflejar el catálogo exacto de Opus
    const projName = (state.settings.projectName || '').toLowerCase();
    if (hasOpusConcepts && (projName.includes('laura') || projName.includes('opus'))) {
      state.settings.applySobrecosto = false;
    }
  }
  syncOpusExactMatrices(state.treeData);

  if (clearLegacyUnquotedDefaultPrices(state.treeData)) {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state.treeData));
      syncActiveProjectSummary(getActiveProjectId(), state.treeData, state.settings);
    } catch (e) {}
  }

  sanitizeCatalogNodes(state.treeData);
}

// Sincronización automática en segundo plano con Supabase PostgreSQL (Debounce 1.2s)
let cloudSyncTimer = null;
export function triggerDebouncedCloudSync() {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    cloudSyncTimer = null;
    const projectId = getActiveProjectId();
    if (!projectId) return;
    const project = getProjectById(projectId);
    if (!project) return;
    try {
      await syncProjectToCloud(project, state.settings, state.treeData);
    } catch (e) {
      console.warn('[CloudSync] Fallo silencioso en autosincronización:', e);
    }
  }, 1200);
}

// Persistencia de configuración en localStorage y emisión en tiempo real
export function persistSettings(meta = {}) {
  const projectId = getActiveProjectId();
  try {
    localStorage.setItem(getSettingsKey(), JSON.stringify(state.settings));
    syncActiveProjectSummary(projectId, state.treeData, state.settings);
    triggerDebouncedCloudSync();

    if (typeof broadcastProjectMutation === 'function') {
      broadcastProjectMutation({
        projectId,
        treeData: state.treeData,
        settings: state.settings,
        immediate: false,
        changeType: 'settings_updated',
        changeDescription: 'parámetros del proyecto y sobrecosto',
        ...meta
      });
    }
  } catch (e) {
    console.error('Error guardando configuración:', e);
  }
}

// Persistencia en localStorage con debounce de 300ms y emisión en vivo vía WebSockets
let persistTimer = null;
export function persistLocalData(immediate = false, meta = {}) {
  const projectId = getActiveProjectId();
  if (immediate) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state.treeData));
      syncActiveProjectSummary(projectId, state.treeData, state.settings);
      triggerDebouncedCloudSync();

      if (typeof broadcastProjectMutation === 'function') {
        broadcastProjectMutation({
          projectId,
          treeData: state.treeData,
          settings: state.settings,
          immediate: true,
          ...meta
        });
      }
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
    }
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state.treeData));
      syncActiveProjectSummary(projectId, state.treeData, state.settings);
      triggerDebouncedCloudSync();

      if (typeof broadcastProjectMutation === 'function') {
        broadcastProjectMutation({
          projectId,
          treeData: state.treeData,
          settings: state.settings,
          immediate: false,
          ...meta
        });
      }
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
    }
    persistTimer = null;
  }, 300);
}

// Guardado forzado al cerrar o recargar ventana
window.addEventListener('beforeunload', () => persistLocalData(true));
