import { getStorageKey, getSettingsKey, getActiveProjectId, STORAGE_KEY_CLIPBOARD } from '../config/constants.js?v=20261121_cf45';
import { defaultTreeData, defaultSettings } from '../config/defaultData.js?v=20261121_cf45';
import { syncActiveProjectSummary, getProjectById, getProjectsList, saveProjectsList, isProjectMarkedDeleted, canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261121_cf45';
import { syncProjectToCloud, loadProjectTreeFromCloud } from '../core/cloudProjectService.js?v=20261121_cf45';
import { broadcastProjectMutation } from '../core/realtimeSync.js?v=20261121_cf45';
import { sanitizeCatalogNodes } from '../core/textSanitizer.js?v=20261121_cf45';
import { CASA_LAURA_PROJECT } from '../modules/io/casaLauraData.js?v=20261121_cf45';

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

let localTreeMutationSeq = 0;
export function bumpLocalTreeMutationSeq() {
  localTreeMutationSeq++;
  return localTreeMutationSeq;
}
export function getLocalTreeMutationSeq() {
  return localTreeMutationSeq;
}

function ensureLocalTreeUuids(nodes) {
  let mutated = false;
  const genUuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((n) => {
      if (!n || typeof n !== 'object') return;
      if (!n.uuid || !/^[0-9a-f]{8}-/i.test(String(n.uuid))) {
        n.uuid = (n.id && /^[0-9a-f]{8}-/i.test(String(n.id))) ? n.id : genUuid();
        mutated = true;
      }
      if (Array.isArray(n.insumos)) {
        n.insumos.forEach((ins) => {
          if (!ins || typeof ins !== 'object') return;
          if (!ins.uuid || !/^[0-9a-f]{8}-/i.test(String(ins.uuid))) {
            ins.uuid = (ins.id && /^[0-9a-f]{8}-/i.test(String(ins.id))) ? ins.id : genUuid();
            mutated = true;
          }
        });
      }
      if (Array.isArray(n.children)) walk(n.children);
    });
  };
  walk(nodes);
  return mutated;
}

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
    const activePId = getActiveProjectId();
    const savedData = localStorage.getItem(getStorageKey());
    if (savedData) {
      state.treeData = JSON.parse(savedData);
    } else if (!activePId) {
      state.treeData = JSON.parse(JSON.stringify(defaultTreeData));
    } else {
      state.treeData = [];
    }
    if (Array.isArray(state.treeData) && ensureLocalTreeUuids(state.treeData) && activePId) {
      try { localStorage.setItem(getStorageKey(activePId), JSON.stringify(state.treeData)); } catch (_) {}
    }

    // Si el proyecto está activo, sincronizar con Supabase SIN pisar mutaciones locales concurrentes durante la carga
    if (activePId) {
      syncActiveProjectFromCloud(activePId, { hadSavedSettings, hasSavedData: Boolean(savedData) });
    }
  } catch (e) {
    console.error('Error cargando treeData:', e);
    state.treeData = [];
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
let pendingLargeTreeBroadcast = false;
let pendingLargeTreeMeta = {};

function checkIfLargeTree(tree) {
  try {
    return Array.isArray(tree) && JSON.stringify(tree).length >= 180000;
  } catch (_) {
    return false;
  }
}

const TREE_SYNC_FINGERPRINT_PREFIX = 'cubikar_tree_sync_fp_';
const SETTINGS_SYNC_FINGERPRINT_PREFIX = 'cubikar_settings_sync_fp_';
const memorySyncFingerprints = new Map();

function fnv1aFingerprint(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${str.length}:${(hash >>> 0).toString(36)}`;
}

export function fingerprintTree(tree) {
  try {
    return fnv1aFingerprint(JSON.stringify(Array.isArray(tree) ? tree : []));
  } catch (_) {
    return '';
  }
}

function canonicalStringify(val) {
  if (Array.isArray(val)) return '[' + val.map(canonicalStringify).join(',') + ']';
  if (val && typeof val === 'object') {
    const keys = Object.keys(val).sort();
    return '{' + keys
      .filter(k => val[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + canonicalStringify(val[k]))
      .join(',') + '}';
  }
  return JSON.stringify(val);
}

export function fingerprintSettings(settings) {
  try {
    return fnv1aFingerprint(canonicalStringify(settings && typeof settings === 'object' ? settings : {}));
  } catch (_) {
    return '';
  }
}

function readSyncFingerprint(prefix, projectId) {
  const key = `${prefix}${projectId}`;
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(key) || '';
    }
  } catch (_) {}
  return memorySyncFingerprints.get(key) || '';
}

function rememberSyncFingerprint(prefix, projectId, fp) {
  if (!projectId || !fp) return;
  const key = `${prefix}${projectId}`;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, fp);
      return;
    }
  } catch (_) {}
  memorySyncFingerprints.set(key, fp);
}

function hasPendingInitialUpload(projectId) {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(`cubikar_pending_initial_upload_${projectId}`) === '1';
  } catch (_) {
    return false;
  }
}

export function markCatalogTreeSynced(projectId, treeOrFingerprint) {
  if (!projectId) return;
  const fp = typeof treeOrFingerprint === 'string' ? treeOrFingerprint : fingerprintTree(treeOrFingerprint);
  rememberSyncFingerprint(TREE_SYNC_FINGERPRINT_PREFIX, projectId, fp);
}

export function markSettingsSynced(projectId, settingsOrFingerprint) {
  if (!projectId) return;
  const fp = typeof settingsOrFingerprint === 'string' ? settingsOrFingerprint : fingerprintSettings(settingsOrFingerprint);
  rememberSyncFingerprint(SETTINGS_SYNC_FINGERPRINT_PREFIX, projectId, fp);
}

export function resolveTreeDataForCloudSync(projectId, project, treeData) {
  const fingerprint = fingerprintTree(treeData);
  const wasCloudSynced = Boolean(project?.isCloudSynced);
  const lastFp = readSyncFingerprint(TREE_SYNC_FINGERPRINT_PREFIX, projectId);
  const treeChanged = !wasCloudSynced || hasPendingInitialUpload(projectId) || !fingerprint || lastFp !== fingerprint;
  return {
    treeToUpload: treeChanged ? treeData : null,
    fingerprint,
    treeChanged
  };
}

export function resolveSettingsForCloudSync(projectId, project, settings) {
  const fingerprint = fingerprintSettings(settings);
  const wasCloudSynced = Boolean(project?.isCloudSynced);
  const lastFp = readSyncFingerprint(SETTINGS_SYNC_FINGERPRINT_PREFIX, projectId);
  const settingsChanged = !wasCloudSynced || !fingerprint || lastFp !== fingerprint;
  return { fingerprint, settingsChanged };
}


// ============================================================================
// BANDERA PERSISTENTE DE CAMBIOS PENDIENTES DE SUBIR A LA NUBE
// Si la pestaña se cierra antes de sincronizar, al volver se sube lo local en vez de
// reemplazarlo por una copia más antigua de la nube.
// ============================================================================
const CLOUD_DIRTY_PREFIX = 'cubikar_dirty_';
const SETTINGS_DIRTY_PREFIX = 'cubikar_settings_dirty_';
let pendingCloudSyncTask = null;
let pendingHeaderSync = false;
let pendingBroadcastHeader = false;
let inFlightCloudRefresh = null;
let lastCloudRefreshAt = 0;

function markCloudDirty(projectId) {
  if (!projectId) return;
  // Solo quien puede editar genera cambios por subir (los invitados de solo lectura siempre reciben la nube)
  try { if (typeof canCurrentUserEditProject === 'function' && !canCurrentUserEditProject()) return; } catch (_) { return; }
  try { localStorage.setItem(CLOUD_DIRTY_PREFIX + projectId, String(Date.now())); } catch (_) {}
}

function clearCloudDirty(projectId) {
  if (!projectId) return;
  try { localStorage.removeItem(CLOUD_DIRTY_PREFIX + projectId); } catch (_) {}
}

export function isCloudDirty(projectId) {
  if (!projectId) return false;
  try {
    const ts = Number(localStorage.getItem(CLOUD_DIRTY_PREFIX + projectId) || 0);
    // Vigencia de 12 h: evita bloquear indefinidamente la descarga si la subida nunca se pudo completar
    return ts > 0 && (Date.now() - ts) < 12 * 60 * 60 * 1000;
  } catch (_) { return false; }
}

function markSettingsDirty(projectId) {
  if (!projectId) return;
  try { if (typeof canCurrentUserEditProject === 'function' && !canCurrentUserEditProject()) return; } catch (_) { return; }
  try { localStorage.setItem(SETTINGS_DIRTY_PREFIX + projectId, String(Date.now())); } catch (_) {}
}

function clearSettingsDirty(projectId) {
  if (!projectId) return;
  try { localStorage.removeItem(SETTINGS_DIRTY_PREFIX + projectId); } catch (_) {}
}

function isSettingsDirty(projectId) {
  if (!projectId) return false;
  try {
    const ts = Number(localStorage.getItem(SETTINGS_DIRTY_PREFIX + projectId) || 0);
    return ts > 0 && (Date.now() - ts) < 12 * 60 * 60 * 1000;
  } catch (_) { return false; }
}

function getSettingsDirtyTimestamp(projectId) {
  if (!projectId) return 0;
  try { return Number(localStorage.getItem(SETTINGS_DIRTY_PREFIX + projectId) || 0) || 0; } catch (_) { return 0; }
}

function refreshWorkspaceUiAfterCloudHydration(recalcProrrateo = true) {
  if (recalcProrrateo && typeof window !== 'undefined' && typeof window.calculateProrrateoCascade === 'function') {
    try { window.calculateProrrateoCascade(state.treeData); } catch (_) {}
  }
  if (typeof window !== 'undefined') {
    if (typeof window.renderBrandingUI === 'function') window.renderBrandingUI();
    if (typeof window.updateSobrecostoBadge === 'function') window.updateSobrecostoBadge();
    if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
    if (typeof window.renderTAB1 === 'function') window.renderTAB1();
  }
}

function syncActiveProjectFromCloud(activePId, { hadSavedSettings = true, hasSavedData = true } = {}) {
  if (!activePId) return Promise.resolve(false);
  const bootMutationSeq = localTreeMutationSeq;
  const prevSettingsRaw = typeof localStorage !== 'undefined' ? (localStorage.getItem(getSettingsKey(activePId)) || '') : '';
  return loadProjectTreeFromCloud(activePId).then(cloudTree => {
    let didSettingsChange = false;
    try {
      const rawS = localStorage.getItem(getSettingsKey(activePId));
      if (rawS && (rawS !== prevSettingsRaw || !hadSavedSettings)) {
        const parsedS = JSON.parse(rawS);
        state.settings = Object.assign({}, defaultSettings, parsedS);
        didSettingsChange = true;
      }
    } catch (_) {}

    if (isSettingsDirty(activePId)) {
      triggerDebouncedCloudSync({ syncHeader: true, broadcastHeader: true });
    }

    if (localTreeMutationSeq !== bootMutationSeq) {
      if (didSettingsChange) refreshWorkspaceUiAfterCloudHydration(true);
      triggerDebouncedCloudSync();
      return didSettingsChange;
    }

    let treeChanged = false;
    if (Array.isArray(cloudTree)) {
      const currentProjMeta = getProjectById(activePId);
      const localHasNodes = hasSavedData && Array.isArray(state.treeData) && state.treeData.length > 0;
      if (localHasNodes && isCloudDirty(activePId)) {
        if (didSettingsChange) refreshWorkspaceUiAfterCloudHydration(true);
        triggerDebouncedCloudSync();
        return didSettingsChange;
      }
      if ((hasPendingInitialUpload(activePId) || !currentProjMeta?.isCloudSynced) && localHasNodes && cloudTree.length < state.treeData.length) {
        if (didSettingsChange) refreshWorkspaceUiAfterCloudHydration(true);
        triggerDebouncedCloudSync();
        return didSettingsChange;
      }
      if (cloudTree.length > 0) {
        clearLegacyUnquotedDefaultPrices(cloudTree);
      }
      const currentJson = JSON.stringify(state.treeData || []);
      const incomingJson = JSON.stringify(cloudTree);
      treeChanged = currentJson !== incomingJson && (cloudTree.length > 0 || !hasSavedData);
      if (treeChanged) {
        state.treeData = cloudTree;
        localStorage.setItem(getStorageKey(activePId), incomingJson);
        if (currentProjMeta?.isCloudSynced && !hasPendingInitialUpload(activePId)) {
          markCatalogTreeSynced(activePId, state.treeData);
        }
      } else if (cloudTree.length === 0 && Array.isArray(state.treeData) && state.treeData.length > 0) {
        triggerDebouncedCloudSync();
      } else if (currentJson === incomingJson && currentProjMeta?.isCloudSynced && !hasPendingInitialUpload(activePId)) {
        markCatalogTreeSynced(activePId, state.treeData);
      }
      if (treeChanged || didSettingsChange) {
        refreshWorkspaceUiAfterCloudHydration(true);
      }
    } else if (didSettingsChange) {
      refreshWorkspaceUiAfterCloudHydration(true);
    }
    return treeChanged || didSettingsChange;
  }).catch(err => {
    console.warn('[CloudSync] Fallo al refrescar árbol desde la nube:', err);
    return false;
  });
}

export function refreshActiveProjectFromCloud(opts = {}) {
  const activePId = getActiveProjectId();
  if (!activePId) return Promise.resolve(false);
  const now = Date.now();
  if (opts?.fromRealtime) {
    const dirtyTs = getSettingsDirtyTimestamp(activePId);
    if (dirtyTs > 0 && (now - dirtyTs) < 8000) return Promise.resolve(false);
  }
  if (!opts?.force && (now - lastCloudRefreshAt) < 3500) {
    return inFlightCloudRefresh || Promise.resolve(false);
  }
  if (inFlightCloudRefresh) return inFlightCloudRefresh;
  lastCloudRefreshAt = now;
  const hasSavedSettings = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(getSettingsKey(activePId)));
  const hasSavedTree = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(getStorageKey(activePId)));
  inFlightCloudRefresh = syncActiveProjectFromCloud(activePId, {
    hadSavedSettings: hasSavedSettings,
    hasSavedData: hasSavedTree
  }).finally(() => {
    inFlightCloudRefresh = null;
  });
  return inFlightCloudRefresh;
}

if (typeof window !== 'undefined') {
  window.refreshActiveProjectFromCloud = refreshActiveProjectFromCloud;
}

function notifyLocalStorageQuota(err) {
  const isQuota = err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message || '')));
  if (!isQuota) return;
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast('⚠️ El almacenamiento local del navegador está lleno. Tus cambios se están respaldando directamente en la nube; libera espacio (fotos/adjuntos) para seguir trabajando sin conexión.', 'warning');
    }
  } catch (_) {}
}

export function flushPendingCloudSync() {
  if (cloudSyncTimer && pendingCloudSyncTask) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
    const task = pendingCloudSyncTask;
    pendingCloudSyncTask = null;
    try { task(); } catch (_) {}
  }
}

export function triggerDebouncedCloudSync(opts = {}) {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  const activePid = getActiveProjectId();
  if (!opts?.skipMarkTreeDirty) {
    markCloudDirty(activePid);
  }
  if (opts?.syncHeader) pendingHeaderSync = true;
  if (opts?.broadcastHeader) pendingBroadcastHeader = true;
  const runSyncTask = async () => {
    cloudSyncTimer = null;
    const projectId = getActiveProjectId();
    if (!projectId) return;
    if (typeof isProjectMarkedDeleted === 'function' && isProjectMarkedDeleted(projectId)) return;
    const project = getProjectById(projectId);
    if (!project) return;
    if (typeof isProjectMarkedDeleted === 'function' && project.cloudId && isProjectMarkedDeleted(project.cloudId)) return;
    const syncHeaderNow = Boolean(pendingHeaderSync || isSettingsDirty(projectId));
    const broadcastHeaderNow = Boolean(pendingBroadcastHeader);
    pendingHeaderSync = false;
    pendingBroadcastHeader = false;
    const { treeToUpload, fingerprint: treeFp, treeChanged } = resolveTreeDataForCloudSync(projectId, project, state.treeData);
    const { fingerprint: settingsFp, settingsChanged } = resolveSettingsForCloudSync(projectId, project, state.settings);
    if (project.isCloudSynced && !treeChanged && !settingsChanged && !syncHeaderNow && !hasPendingInitialUpload(projectId)) {
      clearCloudDirty(projectId);
      return;
    }
    let syncSuccess = false;
    try {
      const syncRes = await syncProjectToCloud(project, state.settings, treeToUpload, { syncHeader: syncHeaderNow });
      if (syncRes && syncRes.success) {
        syncSuccess = true;
        clearCloudDirty(projectId);
        if (syncHeaderNow && !syncRes.headerSkippedRls) {
          clearSettingsDirty(projectId);
          if (syncRes.projectId && syncRes.projectId !== projectId) clearSettingsDirty(syncRes.projectId);
        }
        if (treeChanged) {
          markCatalogTreeSynced(projectId, treeFp);
        }
        markSettingsSynced(projectId, settingsFp);
        try { sessionStorage.removeItem(`cubikar_pending_initial_upload_${projectId}`); } catch (_) {}
        const list = getProjectsList();
        const idx = list.findIndex(p => p.id === project.id || (syncRes.projectId && p.cloudId === syncRes.projectId));
        if (idx !== -1) {
          list[idx].isCloudSynced = true;
          list[idx].cloudId = syncRes.projectId || list[idx].cloudId || list[idx].id;
          list[idx].lastCloudSyncAt = Date.now();
          saveProjectsList(list, { skipCloudSync: true });
        }
        if (broadcastHeaderNow && !syncRes.headerSkippedRls && typeof broadcastProjectMutation === 'function') {
          broadcastProjectMutation({
            projectId,
            treeData: state.treeData,
            settings: state.settings,
            immediate: false,
            changeType: 'settings_updated',
            changeDescription: 'parámetros del proyecto y sobrecosto'
          });
        }
      }
    } catch (e) {
      console.warn('[CloudSync] Fallo silencioso en autosincronización:', e);
    }
    if (syncSuccess && pendingLargeTreeBroadcast) {
      pendingLargeTreeBroadcast = false;
      const committedMeta = pendingLargeTreeMeta || {};
      pendingLargeTreeMeta = {};
      if (typeof broadcastProjectMutation === 'function') {
        broadcastProjectMutation({
          projectId,
          treeData: state.treeData,
          settings: state.settings,
          immediate: true,
          changeType: committedMeta.changeType || 'cloud_tree_synced',
          highlightId: committedMeta.highlightId || null,
          changeDescription: committedMeta.changeDescription || 'cambios en el catálogo',
          postCloudSync: true
        });
      }
    }
  };
  pendingCloudSyncTask = runSyncTask;
  cloudSyncTimer = setTimeout(() => { pendingCloudSyncTask = null; runSyncTask(); }, 1200);
}

// Persistencia de configuración en localStorage y emisión en tiempo real
export function persistSettings(meta = {}) {
  const projectId = getActiveProjectId();
  try {
    if (state.settings && typeof state.settings === 'object') {
      state.settings._settingsUpdatedAt = Date.now();
    }
    localStorage.setItem(getSettingsKey(), JSON.stringify(state.settings));
    syncActiveProjectSummary(projectId, state.treeData, state.settings);
    markSettingsDirty(projectId);
    triggerDebouncedCloudSync({ syncHeader: true, skipMarkTreeDirty: true });

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
  localTreeMutationSeq++;
  const projectId = getActiveProjectId();
  const flushPersist = () => {
    try {
      ensureLocalTreeUuids(state.treeData);
      localStorage.setItem(getStorageKey(), JSON.stringify(state.treeData));
      syncActiveProjectSummary(projectId, state.treeData, state.settings);
      if (!meta?.patch && checkIfLargeTree(state.treeData)) {
        pendingLargeTreeBroadcast = true;
        pendingLargeTreeMeta = {
          changeType: meta?.changeType || 'general',
          highlightId: meta?.highlightId || null,
          changeDescription: meta?.changeDescription || 'cambios en el catálogo'
        };
      }
      const projMeta = projectId ? getProjectById(projectId) : null;
      const shouldSkipFullSync = Boolean(meta?.skipFullCloudSync) && Boolean(projMeta?.isCloudSynced);
      if (!shouldSkipFullSync) {
        triggerDebouncedCloudSync();
      }

      if (!meta?.skipBroadcast && typeof broadcastProjectMutation === 'function') {
        broadcastProjectMutation({
          projectId,
          treeData: state.treeData,
          settings: state.settings,
          immediate: Boolean(immediate),
          ...meta
        });
      }
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
      notifyLocalStorageQuota(e);
      try { triggerDebouncedCloudSync(); } catch (_) {}
    }
  };
  if (immediate) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    flushPersist();
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    flushPersist();
    persistTimer = null;
  }, 300);
}

// Guardado forzado al cerrar o recargar ventana (solo si había escritura pendiente)
window.addEventListener('beforeunload', () => {
  if (persistTimer) persistLocalData(true);
});

// Al ocultar/cerrar la pestaña: guardar lo pendiente y enviar a la nube sin esperar el debounce
const flushOnHide = () => {
  try { if (persistTimer) persistLocalData(true); } catch (_) {}
  try { flushPendingCloudSync(); } catch (_) {}
};
window.addEventListener('pagehide', flushOnHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnHide();
});
