/**
 * js/modules/portal/projectPackageService.js
 * Servicio de exportación e importación de paquetes completos (.zip) para Cubikar Arquitectura.
 * Empaqueta configuración, presupuesto de honorarios, tabla de alcances y entregables,
 * seguimiento/bitácora, compras, proveedores, estimaciones, calendario, chat, candados,
 * enlaces externos y archivos/imágenes embebidos para restaurar tal cual en otra cuenta.
 */

import {
  getStorageKey,
  getSettingsKey
} from '../../config/constants.js?v=20261119_cf38';
import { defaultSettings } from '../../config/defaultData.js?v=20261119_cf38';
import { getSupabaseClient, isSupabaseConfigured } from '../../core/supabaseClient.js?v=20261119_cf38';
import {
  generateUUID,
  isValidUUID,
  resolveCloudProjectId,
  loadProjectTreeFromCloud,
  syncProjectToCloud,
  invalidateCloudProjectsCache
} from '../../core/cloudProjectService.js?v=20261119_cf38';
import {
  hydrateProjectModulesFromCloud,
  syncBitacoraNow,
  syncExpensesNow,
  syncEstimacionesNow,
  syncCronogramaNow,
  syncChatNow
} from '../../core/cloudModulesSyncService.js?v=20261119_cf38';
import {
  AVATARS_BY_SEX,
  getCurrentUser,
  getProjectsList,
  saveProjectsList,
  getProjectById,
  getUserPlanId,
  canUserCreateProject,
  resolveCleanHostName,
  calculateTreeTotal,
  countTreeConcepts,
  countTreePartidas
} from './projectService.js?v=20261119_cf38';
import { showToast } from '../../ui/notifications.js?v=20261119_cf38';

const PACKAGE_SCHEMA = 'cubikar.project.package';
const PACKAGE_FORMAT_VERSION = 1;
const SOURCE_APP_ID = 'arq';
const MODAL_ROOT_ID = 'cubikar-project-package-modal';
const PROGRESS_OVERLAY_ID = 'cubikar-project-package-progress';

const ALLOWED_MEDIA_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif', 'svg',
  'pdf', 'xml', 'xlsx', 'xls', 'csv', 'txt', 'json'
]);

const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  bmp: 'image/bmp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  xml: 'application/xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  txt: 'text/plain',
  json: 'application/json'
};

const NODE_REF_KEYS = new Set([
  'conceptId',
  'conceptoId',
  'partidaId',
  'nodeId',
  'entregableId',
  'parentId',
  'parent_id',
  'targetNodeId',
  'itemId',
  'alcanceId'
]);

const DICT_NODE_KEYS = new Set([
  'conceptos',
  'conceptPhotos',
  'fotos',
  'entregables',
  'scheduleMap',
  'nodesMeta',
  'nodeMeta',
  'avancePorNodo'
]);

const SUPPLIER_REF_KEYS = new Set([
  'supplierId',
  'proveedorId',
  'proveedorElegidoId'
]);

const SKIP_UUID_REMAP_KEYS = new Set([
  'mediaId',
  's3Key',
  'archivoId',
  'bucket',
  'cloudUuid'
]);

let packageOperationBusy = false;
let currentImportState = null;

const multiSelectState = {
  active: false,
  selectedIds: new Set(),
  escBound: false
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonParse(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

function formatBytesLocal(bytes, decimals = 1) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value === 0) return '0 KB';
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(decimals)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function slugifyFileName(str, fallback = 'proyecto') {
  const cleaned = String(str || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return cleaned || fallback;
}

function sanitizeZipSegment(str, fallback = 'archivo') {
  const cleaned = String(str || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 90);
  return cleaned || fallback;
}

function getFileExt(name = '') {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop().trim() : '';
}

function inferExtensionFromMime(mimeType = '') {
  const m = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/svg+xml') return 'svg';
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('xml')) return 'xml';
  if (m.includes('spreadsheetml') || m.includes('excel')) return 'xlsx';
  if (m === 'text/csv') return 'csv';
  if (m === 'application/json') return 'json';
  return 'bin';
}

function ensureSafeFileName(fileName, mimeType = '', fallbackBase = 'archivo') {
  const rawName = sanitizeZipSegment(fileName || fallbackBase, fallbackBase);
  let ext = getFileExt(rawName);
  if (!ext || !ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
    const inferred = inferExtensionFromMime(mimeType);
    ext = ALLOWED_MEDIA_EXTENSIONS.has(inferred) ? inferred : 'bin';
    return `${rawName.replace(/\.+$/, '')}.${ext}`;
  }
  return rawName;
}

function inferMimeType(fileName, explicitMime = '') {
  if (explicitMime && typeof explicitMime === 'string' && explicitMime.includes('/')) {
    return explicitMime.split(';')[0].trim();
  }
  return MIME_BY_EXTENSION[getFileExt(fileName)] || 'application/octet-stream';
}

function dataUrlToBlobLocal(dataUrl) {
  const str = String(dataUrl || '');
  const commaIdx = str.indexOf(',');
  if (commaIdx < 0) return new Blob([], { type: 'application/octet-stream' });
  const header = str.slice(0, commaIdx);
  const dataPart = str.slice(commaIdx + 1);
  const mimeMatch = /data:([^;,]+)/i.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  if (/;base64/i.test(header)) {
    const binary = atob(dataPart);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(dataPart)], { type: mime });
}

function blobToDataUrlLocal(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el recurso en navegador.'));
    reader.readAsDataURL(blob);
  });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
      a.remove();
    } catch (_) {}
  }, 1500);
}

function showPackageProgressOverlay({ title = 'Procesando paquete...', subtitle = '', pct = 5 } = {}) {
  let overlay = document.getElementById(PROGRESS_OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = PROGRESS_OVERLAY_ID;
    overlay.className = 'fixed inset-0 z-[10050] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
    document.body.appendChild(overlay);
  }
  const clamped = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  overlay.innerHTML = `
    <div class="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-file-zipper text-purple-400 animate-pulse"></i>
        </div>
        <div class="min-w-0">
          <h3 class="text-sm font-bold text-white truncate">${escapeHtml(title)}</h3>
          <p id="${PROGRESS_OVERLAY_ID}-sub" class="text-xs text-slate-400 truncate mt-0.5">${escapeHtml(subtitle)}</p>
        </div>
      </div>
      <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/70">
        <div id="${PROGRESS_OVERLAY_ID}-bar" class="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-200" style="width:${clamped}%"></div>
      </div>
      <div class="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>Empaquetado portátil Cubikar Arquitectura</span>
        <span id="${PROGRESS_OVERLAY_ID}-pct" class="font-mono text-purple-300 font-semibold">${clamped}%</span>
      </div>
    </div>
  `;
}

function updatePackageProgressOverlay(subtitle, pct) {
  const subEl = document.getElementById(`${PROGRESS_OVERLAY_ID}-sub`);
  const barEl = document.getElementById(`${PROGRESS_OVERLAY_ID}-bar`);
  const pctEl = document.getElementById(`${PROGRESS_OVERLAY_ID}-pct`);
  const clamped = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  if (subEl && subtitle !== undefined) subEl.textContent = String(subtitle);
  if (barEl) barEl.style.width = `${clamped}%`;
  if (pctEl) pctEl.textContent = `${clamped}%`;
}

function closePackageProgressOverlay() {
  const overlay = document.getElementById(PROGRESS_OVERLAY_ID);
  if (overlay) overlay.remove();
}

function calculateFactorFromSettingsObj(settingsObj) {
  if (!settingsObj || !settingsObj.applySobrecosto) return 1.0;
  const fInd = 1 + ((parseFloat(settingsObj.pctIndirectos) || 0) / 100);
  const fFin = 1 + ((parseFloat(settingsObj.pctFinanciamiento) || 0) / 100);
  const fUtil = 1 + ((parseFloat(settingsObj.pctUtilidad) || 0) / 100);
  const fCarg = 1 + ((parseFloat(settingsObj.pctAdicionales) || 0) / 100);
  const fSeg = 1 + ((parseFloat(settingsObj.pctSegurosFianzas) || 0) / 100);
  return fInd * fFin * fUtil * fCarg * fSeg;
}

/**
 * Hidrata desde Supabase el proyecto de Arquitectura (incluyendo presupuestoArq, arqNodesMeta
 * y módulos operativos) si aún no está completo en localStorage.
 */
async function ensureProjectDataHydratedForExport(project) {
  const pid = project.id;
  const cloudUuid = resolveCloudProjectId(pid);
  const canQueryCloud = isSupabaseConfigured() && (isValidUUID(cloudUuid) || project.isCloudSynced);

  let settings = safeJsonParse(localStorage.getItem(getSettingsKey(pid)), null);
  let treeData = safeJsonParse(localStorage.getItem(getStorageKey(pid)), null);

  if (canQueryCloud) {
    try {
      const sb = getSupabaseClient();
      const targetUuid = isValidUUID(cloudUuid) ? cloudUuid : pid;

      if (!Array.isArray(treeData) || treeData.length === 0) {
        const cloudTree = await loadProjectTreeFromCloud(targetUuid);
        if (Array.isArray(cloudTree) && cloudTree.length > 0) {
          treeData = cloudTree;
          try {
            localStorage.setItem(getStorageKey(pid), JSON.stringify(cloudTree));
          } catch (_) {}
          // Releer settings por si loadProjectTreeFromCloud inyectó presupuestoArq
          settings = safeJsonParse(localStorage.getItem(getSettingsKey(pid)), settings);
        }
      }

      if (sb && isValidUUID(targetUuid)) {
        const { data: projRow } = await sb
          .from('proyectos')
          .select('nombre, cliente, ubicacion, tipo_obra, moneda, simbolo_moneda, factor_sobrecosto, configuracion, created_at, updated_at')
          .eq('id', targetUuid)
          .maybeSingle();

        if (projRow) {
          const rawCfg = (projRow.configuracion && typeof projRow.configuracion === 'object') ? projRow.configuracion : {};
          const cloudSettings = (rawCfg.settings && typeof rawCfg.settings === 'object') ? rawCfg.settings : rawCfg;
          if (!settings) {
            settings = Object.assign({}, defaultSettings, cloudSettings, {
              projectName: cloudSettings.projectName || projRow.nombre || project.projectName,
              companyName: cloudSettings.companyName || projRow.cliente || project.companyName,
              projectLocation: cloudSettings.projectLocation || projRow.ubicacion || project.projectLocation,
              currency: cloudSettings.currency || projRow.moneda || project.currency || 'MXN',
              currencySymbol: cloudSettings.currencySymbol || projRow.simbolo_moneda || project.currencySymbol || '$',
              ...(rawCfg.presupuestoArq ? { presupuestoArq: rawCfg.presupuestoArq } : {})
            });
            try {
              localStorage.setItem(getSettingsKey(pid), JSON.stringify(settings));
            } catch (_) {}
          } else if (rawCfg.presupuestoArq && !settings.presupuestoArq) {
            settings.presupuestoArq = rawCfg.presupuestoArq;
          }
          if (rawCfg.tabLocks && !localStorage.getItem(`adm_arq_tab_locks_${pid}`)) {
            try {
              localStorage.setItem(`adm_arq_tab_locks_${pid}`, JSON.stringify(rawCfg.tabLocks));
            } catch (_) {}
          }
        }
      }

      await hydrateProjectModulesFromCloud(pid, { force: true });
    } catch (err) {
      console.warn('[ProjectPackage ARQ] Advertencia hidratando proyecto desde nube:', err?.message || err);
    }
  }

  return {
    settings: Object.assign({}, defaultSettings, settings || {}, {
      companyName: settings?.companyName || project.companyName || defaultSettings.companyName,
      companyLogo: settings?.companyLogo || project.companyLogo || '',
      projectName: settings?.projectName || project.projectName || 'Proyecto',
      projectLocation: settings?.projectLocation || project.projectLocation || '',
      currency: settings?.currency || project.currency || 'MXN',
      currencySymbol: settings?.currencySymbol || project.currencySymbol || '$'
    }),
    treeData: Array.isArray(treeData) ? treeData : []
  };
}

function collectModulePayloadsArq(pid) {
  const rawOrNull = (key) => safeJsonParse(localStorage.getItem(key), null);
  return {
    seguimiento: rawOrNull(`adm_arq_seguimiento_${pid}`),
    bitacoraArq: rawOrNull(`adm_arq_bitacora_${pid}`),
    bitacoraLegacy: rawOrNull(`bitacora_data_${pid}`),
    estimacionesArq: rawOrNull(`estimaciones_arq_data_${pid}`),
    estimacionesLegacy: rawOrNull(`estimaciones_data_${pid}`),
    expenses: rawOrNull(`expenses_control_${pid}`),
    comprasArq: rawOrNull(`adm_arq_compras_${pid}`),
    proveedoresArq: rawOrNull(`adm_arq_proveedores_${pid}`),
    calendarioArqCfg: rawOrNull(`calendario_arq_cfg_${pid}`),
    calendarioCfg: rawOrNull(`calendario_cfg_${pid}`),
    calendarioArqWorkdays: rawOrNull(`calendario_arq_workdays_${pid}`),
    calendarioWorkdays: rawOrNull(`calendario_workdays_${pid}`),
    chat: rawOrNull(`adm_arq_project_chat_${pid}`),
    tabLocks: rawOrNull(`adm_arq_tab_locks_${pid}`),
    signatures: rawOrNull(`adm_arq_signatures_${pid}`)
  };
}

function detectModuloFromPath(pathParts = []) {
  const joined = pathParts.join('.').toLowerCase();
  if (joined.includes('seguimiento') || joined.includes('bitacora')) return 'seguimiento';
  if (joined.includes('estimaciones')) return 'estimaciones';
  if (joined.includes('compras') || joined.includes('expenses')) return 'compras';
  if (joined.includes('chat')) return 'chat';
  if (joined.includes('logo') || joined.includes('branding') || joined.includes('settings')) return 'branding';
  return 'otros';
}

function isBinaryDataUrl(val) {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  if (!s.startsWith('data:')) return false;
  if (s.startsWith('data:image/svg+xml') && s.length < 16384) return false;
  return /^data:(image\/|application\/pdf|application\/xml|text\/xml|application\/vnd\.|text\/csv)/i.test(s);
}

/**
 * Escanea recursos embebidos (data URLs de logotipos, fotos o documentos) y enlaces externos (http/https)
 * dentro de toda la estructura del proyecto de Arquitectura.
 */
function scanArqAssets(rootsBySection) {
  const inlineDataMap = new Map();
  const externalLinks = [];

  const walk = (node, pathParts, parentKey = '') => {
    if (!node) return;
    if (typeof node === 'string') {
      if (isBinaryDataUrl(node)) {
        const semiIdx = node.indexOf(';');
        const mimeHeader = node.slice(5, semiIdx > 5 ? semiIdx : 64);
        const keyHint = `inline::${pathParts.join('.')}`;
        inlineDataMap.set(keyHint, {
          inlineKey: keyHint,
          pathParts: [...pathParts],
          dataUrl: node,
          modulo: detectModuloFromPath(pathParts),
          fileName: `${sanitizeZipSegment(pathParts[pathParts.length - 1] || 'archivo')}.${inferExtensionFromMime(mimeHeader)}`
        });
      } else if (/^https?:\/\//i.test(node.trim()) && (parentKey === 'archivoLink' || parentKey === 'url')) {
        externalLinks.push({ path: pathParts.join('.'), url: node.trim() });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, [...pathParts, String(idx)], parentKey));
      return;
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        walk(v, [...pathParts, k], k);
      }
    }
  };

  for (const [sectionName, payload] of Object.entries(rootsBySection)) {
    walk(payload, [sectionName]);
  }

  return { inlineDataMap, externalLinks };
}

function countArqSeguimientoItems(modules) {
  const seg = modules.seguimiento || modules.bitacoraArq || modules.bitacoraLegacy;
  if (!seg) return 0;
  if (Array.isArray(seg)) return seg.length;
  if (Array.isArray(seg.notes)) return seg.notes.length;
  if (Array.isArray(seg.bitacora)) return seg.bitacora.length;
  if (Array.isArray(seg.items)) return seg.items.length;
  return 0;
}

function countArqEstimacionesItems(modules) {
  const est = modules.estimacionesArq || modules.estimacionesLegacy;
  if (!est) return 0;
  if (Array.isArray(est)) return est.length;
  if (Array.isArray(est.estimaciones)) return est.estimaciones.length;
  return 0;
}

function countArqComprasItems(modules) {
  if (Array.isArray(modules.expenses?.records) && modules.expenses.records.length > 0) {
    return modules.expenses.records.length;
  }
  if (Array.isArray(modules.comprasArq)) return modules.comprasArq.length;
  if (Array.isArray(modules.comprasArq?.records)) return modules.comprasArq.records.length;
  return 0;
}

/**
 * Genera el Blob .zip completo y portátil para un proyecto de Cubikar Arquitectura.
 */
async function buildProjectPackageZipBlob(projectId, { onProgress } = {}) {
  const report = (sub, pct) => {
    if (typeof onProgress === 'function') onProgress(sub, pct);
  };

  if (typeof window === 'undefined' || typeof window.JSZip !== 'function') {
    throw new Error('JSZip no está disponible en el navegador. Recarga la página.');
  }
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error('No se encontró el proyecto seleccionado.');
  }

  report('Hidratando alcances, presupuesto y módulos desde la nube...', 10);
  const zip = new window.JSZip();
  const { settings, treeData } = await ensureProjectDataHydratedForExport(project);
  const modules = collectModulePayloadsArq(project.id);

  report('Analizando logotipos, imágenes, enlaces y entregables...', 32);
  const { inlineDataMap, externalLinks } = scanArqAssets({
    project: { companyLogo: project.companyLogo || '' },
    settings,
    treeData,
    modules
  });

  const usedArchivePaths = new Set();
  const allocateUniqueZipPath = (modulo, fileName, mimeType) => {
    const safeMod = sanitizeZipSegment(modulo || 'otros', 'otros');
    const safeName = ensureSafeFileName(fileName, mimeType, 'archivo');
    let candidate = `media/${safeMod}/${safeName}`;
    let counter = 2;
    while (usedArchivePaths.has(candidate)) {
      const dotIdx = safeName.lastIndexOf('.');
      const base = dotIdx > 0 ? safeName.slice(0, dotIdx) : safeName;
      const ext = dotIdx > 0 ? safeName.slice(dotIdx) : '';
      candidate = `media/${safeMod}/${base}_${counter}${ext}`;
      counter += 1;
    }
    usedArchivePaths.add(candidate);
    return candidate;
  };

  const inlineManifest = [];
  let processedCount = 0;
  for (const inlineItem of inlineDataMap.values()) {
    processedCount += 1;
    report(
      `Extrayendo recurso (${processedCount}/${inlineDataMap.size}): ${inlineItem.fileName}`,
      35 + Math.round((processedCount / Math.max(1, inlineDataMap.size)) * 35)
    );
    const blob = dataUrlToBlobLocal(inlineItem.dataUrl);
    if (!blob || blob.size === 0) continue;
    const archivePath = allocateUniqueZipPath(inlineItem.modulo, inlineItem.fileName, blob.type);
    const mimeType = inferMimeType(archivePath, blob.type);
    zip.file(archivePath, blob, { binary: true });
    inlineManifest.push({
      kind: 'inline_data',
      inlineKey: inlineItem.inlineKey,
      pathParts: inlineItem.pathParts,
      archivePath,
      modulo: inlineItem.modulo,
      fileName: ensureSafeFileName(inlineItem.fileName, mimeType),
      mimeType,
      bytes: blob.size
    });
  }

  const cleanProjectMeta = {
    id: project.id,
    companyName: settings.companyName || project.companyName || '',
    companyLogo: settings.companyLogo || project.companyLogo || '',
    projectName: settings.projectName || project.projectName || 'Proyecto',
    projectLocation: settings.projectLocation || project.projectLocation || '',
    tipoObra: project.tipoObra || 'Diseño y Proyecto Ejecutivo',
    currency: settings.currency || project.currency || 'MXN',
    currencySymbol: settings.currencySymbol || project.currencySymbol || '$',
    factorSobrecosto: calculateFactorFromSettingsObj(settings) || project.factorSobrecosto || 1,
    totalPresupuesto: calculateTreeTotal(treeData) || project.totalPresupuesto || 0,
    conceptCount: countTreeConcepts(treeData),
    partidasCount: countTreePartidas(treeData),
    ...(settings.presupuestoArq ? { presupuestoArq: settings.presupuestoArq } : (project.presupuestoArq ? { presupuestoArq: project.presupuestoArq } : {})),
    createdAt: project.createdAt || new Date().toISOString().slice(0, 10)
  };

  const totalMediaBytes = inlineManifest.reduce((acc, m) => acc + (Number(m.bytes) || 0), 0);

  const manifest = {
    schema: PACKAGE_SCHEMA,
    formatVersion: PACKAGE_FORMAT_VERSION,
    sourceApp: SOURCE_APP_ID,
    sourceAppLabel: 'Cubikar Arquitectura',
    exportedAt: new Date().toISOString(),
    project: cleanProjectMeta,
    stats: {
      partidasCount: cleanProjectMeta.partidasCount,
      conceptCount: cleanProjectMeta.conceptCount,
      totalPresupuesto: cleanProjectMeta.totalPresupuesto,
      seguimientoCount: countArqSeguimientoItems(modules),
      estimacionesCount: countArqEstimacionesItems(modules),
      comprasCount: countArqComprasItems(modules),
      chatMessagesCount: Array.isArray(modules.chat) ? modules.chat.length : 0,
      mediaCount: inlineManifest.length,
      totalMediaBytes,
      externalLinksCount: externalLinks.length
    },
    media: [],
    inlineDataRefs: inlineManifest,
    externalLinks
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('project.json', JSON.stringify(cleanProjectMeta, null, 2));
  zip.file('settings.json', JSON.stringify(settings, null, 2));
  zip.file('treeData.json', JSON.stringify(treeData, null, 2));

  const modulesFolder = zip.folder('modules');
  Object.entries(modules).forEach(([modKey, payload]) => {
    if (payload !== null && payload !== undefined) {
      modulesFolder.file(`${modKey}.json`, JSON.stringify(payload, null, 2));
    }
  });

  const readmeLines = [
    'PAQUETE PORTATIL DE PROYECTO - CUBIKAR ARQUITECTURA',
    '===================================================',
    `Proyecto: ${cleanProjectMeta.projectName}`,
    `Despacho / Empresa: ${cleanProjectMeta.companyName || 'N/A'}`,
    `Ubicación: ${cleanProjectMeta.projectLocation || 'N/A'}`,
    `Exportado: ${manifest.exportedAt}`,
    `Entregables: ${cleanProjectMeta.conceptCount} | Capítulos / Partidas: ${cleanProjectMeta.partidasCount}`,
    `Archivos/Imágenes embebidos en media/: ${inlineManifest.length} (${formatBytesLocal(totalMediaBytes)})`,
    `Enlaces externos conservados como URL: ${externalLinks.length}`,
    '',
    'Para restaurarlo en otra cuenta:',
    '1. Inicia sesión en arq.cubikar.app con la cuenta receptora.',
    '2. En "Mis proyectos", haz clic en "Importar (.zip)".',
    '3. Selecciona este archivo .zip (o varios a la vez) y confirma la importación.'
  ];
  zip.file('LEEME.txt', readmeLines.join('\n'));

  report('Comprimiendo paquete portátil .zip...', 80);
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    },
    (meta) => {
      const pct = 80 + Math.round((Number(meta?.percent || 0) / 100) * 19);
      report('Generando archivo .zip comprimido...', pct);
    }
  );

  const dateTag = new Date().toISOString().slice(0, 10);
  const fileName = `${slugifyFileName(cleanProjectMeta.projectName)}_Cubikar_ARQ_${dateTag}.zip`;

  return {
    zipBlob,
    fileName,
    inlineCount: inlineManifest.length,
    externalLinksCount: externalLinks.length
  };
}

/**
 * Empaqueta y descarga un proyecto completo de Cubikar Arquitectura en formato .zip portátil.
 */
export async function exportFullProjectZipAction(projectId, event = null) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  const menuEl = document.getElementById(`menu-card-${projectId}`);
  if (menuEl) menuEl.classList.add('hidden');

  if (packageOperationBusy) {
    showToast('Ya hay una operación de paquete en curso. Espera un momento.', 'info');
    return;
  }

  const project = getProjectById(projectId);
  if (!project) {
    showToast('No se encontró el proyecto seleccionado.', 'error');
    return;
  }

  packageOperationBusy = true;
  showPackageProgressOverlay({
    title: `Exportando "${project.projectName || 'Proyecto'}"`,
    subtitle: 'Iniciando exportación...',
    pct: 5
  });

  try {
    const { zipBlob, fileName, inlineCount, externalLinksCount } = await buildProjectPackageZipBlob(projectId, {
      onProgress: (sub, pct) => updatePackageProgressOverlay(sub, pct)
    });
    triggerBlobDownload(zipBlob, fileName);
    updatePackageProgressOverlay('¡Paquete listo!', 100);

    showToast(
      `Proyecto completo descargado en "${fileName}" (${inlineCount} recurso(s) embebidos y ${externalLinksCount} enlace(s)).`,
      'success',
      5000
    );
  } catch (err) {
    console.error('[ProjectPackage ARQ] Error exportando proyecto:', err);
    showToast(`No se pudo generar el paquete .zip: ${err?.message || err}`, 'error', 5500);
  } finally {
    packageOperationBusy = false;
    closePackageProgressOverlay();
  }
}

// ==========================================
// MODO SELECCIÓN TEMPORAL (FORMA B - GOOGLE DRIVE)
// ==========================================

function getVisibleProjectElements() {
  const cards = Array.from(document.querySelectorAll('.project-card[data-project-id]')).filter(el => (
    el.style.display !== 'none' && !el.classList.contains('hidden')
  ));
  const rows = Array.from(document.querySelectorAll('.table-project-row[data-project-id]')).filter(el => (
    el.style.display !== 'none' && !el.classList.contains('hidden')
  ));
  return { cards, rows };
}

function getVisibleProjectIds() {
  const { cards, rows } = getVisibleProjectElements();
  const ids = new Set();
  const listView = document.getElementById('projectsTable');
  const isTableVisible = listView && !listView.classList.contains('hidden');
  (isTableVisible && rows.length ? rows : cards).forEach((el) => {
    const pid = el.getAttribute('data-project-id');
    if (pid) ids.add(pid);
  });
  return Array.from(ids);
}

function handleMultiSelectEscKey(e) {
  if (e.key === 'Escape' && multiSelectState.active && !packageOperationBusy) {
    exitProjectMultiSelectMode();
  }
}

function renderFloatingMultiSelectBar() {
  const existing = document.getElementById('cubikar-multiselect-bar');
  if (!multiSelectState.active) {
    if (existing) existing.remove();
    return;
  }

  let bar = existing;
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cubikar-multiselect-bar';
    document.body.appendChild(bar);
  }

  const visibleIds = getVisibleProjectIds();
  const selectedCount = multiSelectState.selectedIds.size;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => multiSelectState.selectedIds.has(id));

  bar.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[9990] max-w-[95vw] px-4 py-2.5 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl flex flex-wrap items-center justify-center gap-2.5 text-xs';
  bar.innerHTML = `
    <span class="font-bold text-white flex items-center gap-2 pr-1">
      <span class="min-w-[22px] h-[22px] px-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center font-mono text-[11px]">${selectedCount}</span>
      <span>seleccionado${selectedCount === 1 ? '' : 's'}</span>
    </span>
    <div class="h-4 w-px bg-slate-700 hidden sm:block"></div>
    <button type="button" onclick="selectAllVisibleProjectsAction()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 transition cursor-pointer">
      ${allVisibleSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
    </button>
    <button type="button" onclick="downloadSelectedProjectsZipAction()" ${selectedCount === 0 ? 'disabled' : ''} class="px-3.5 py-1.5 rounded-xl ${selectedCount > 0 ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 cursor-pointer' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} font-bold flex items-center gap-1.5 transition">
      <i class="fa-solid fa-file-zipper"></i>
      <span>Descargar por separado (.zip)</span>
    </button>
    <button type="button" onclick="exitProjectMultiSelectMode()" class="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-medium border border-slate-700/80 transition cursor-pointer">
      Cancelar
    </button>
  `;
}

export function syncProjectMultiSelectUI() {
  const { cards, rows } = getVisibleProjectElements();

  cards.forEach((card) => {
    const pid = card.getAttribute('data-project-id');
    const existingBadge = card.querySelector('.cubikar-ms-card-badge');

    if (!multiSelectState.active) {
      if (existingBadge) existingBadge.remove();
      card.classList.remove('ring-2', 'ring-emerald-400', 'border-emerald-500/80', 'cursor-pointer');
      return;
    }

    const isSelected = Boolean(pid && multiSelectState.selectedIds.has(pid));
    if (!card.dataset.msBound) {
      card.dataset.msBound = '1';
      card.addEventListener('click', (e) => {
        if (!multiSelectState.active) return;
        if (e.target.closest('button, a, input, select, label, [id^="menu-card-"]')) return;
        e.preventDefault();
        e.stopPropagation();
        toggleProjectMultiSelect(card.getAttribute('data-project-id'));
      });
    }

    card.classList.add('cursor-pointer');
    card.classList.toggle('ring-2', isSelected);
    card.classList.toggle('ring-emerald-400', isSelected);
    card.classList.toggle('border-emerald-500/80', isSelected);

    let badge = existingBadge;
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'cubikar-ms-card-badge absolute -top-2.5 -left-2.5 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center shadow-lg transition cursor-pointer';
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProjectMultiSelect(pid);
      });
      card.appendChild(badge);
    }
    badge.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    badge.className = `cubikar-ms-card-badge absolute -top-2.5 -left-2.5 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center shadow-lg transition cursor-pointer ${
      isSelected
        ? 'bg-emerald-500 border-emerald-300 text-slate-950 scale-105'
        : 'bg-slate-900/95 border-slate-500 text-transparent hover:border-emerald-400'
    }`;
    badge.innerHTML = isSelected ? '<i class="fa-solid fa-check text-[11px] font-bold"></i>' : '';
  });

  rows.forEach((row) => {
    const pid = row.getAttribute('data-project-id');
    const firstCell = row.querySelector('td');
    const existingRowBadge = row.querySelector('.cubikar-ms-row-badge');
    if (!multiSelectState.active) {
      if (existingRowBadge) existingRowBadge.remove();
      row.classList.remove('bg-emerald-950/25');
      return;
    }
    const isSelected = Boolean(pid && multiSelectState.selectedIds.has(pid));
    row.classList.toggle('bg-emerald-950/25', isSelected);
    if (firstCell) {
      let badge = existingRowBadge;
      if (!badge) {
        badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'cubikar-ms-row-badge inline-flex w-5 h-5 mr-2 rounded-md border items-center justify-center align-middle transition cursor-pointer';
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleProjectMultiSelect(pid);
        });
        firstCell.prepend(badge);
      }
      badge.className = `cubikar-ms-row-badge inline-flex w-5 h-5 mr-2 rounded-md border items-center justify-center align-middle transition cursor-pointer ${
        isSelected ? 'bg-emerald-500 border-emerald-300 text-slate-950' : 'bg-slate-900 border-slate-600 text-transparent'
      }`;
      badge.innerHTML = isSelected ? '<i class="fa-solid fa-check text-[10px]"></i>' : '';
    }
  });

  renderFloatingMultiSelectBar();
}

export function enterProjectMultiSelectMode(initialProjectId = null, event = null) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if (initialProjectId) {
    const menuEl = document.getElementById(`menu-card-${initialProjectId}`);
    if (menuEl) menuEl.classList.add('hidden');
  }
  multiSelectState.active = true;
  if (initialProjectId) {
    multiSelectState.selectedIds.add(String(initialProjectId));
  }
  if (!multiSelectState.escBound && typeof document !== 'undefined') {
    multiSelectState.escBound = true;
    document.addEventListener('keydown', handleMultiSelectEscKey);
  }
  syncProjectMultiSelectUI();
}

export function exitProjectMultiSelectMode() {
  multiSelectState.active = false;
  multiSelectState.selectedIds.clear();
  if (multiSelectState.escBound && typeof document !== 'undefined') {
    multiSelectState.escBound = false;
    document.removeEventListener('keydown', handleMultiSelectEscKey);
  }
  syncProjectMultiSelectUI();
}

export function toggleProjectMultiSelect(projectId) {
  if (!projectId) return;
  const key = String(projectId);
  if (multiSelectState.selectedIds.has(key)) {
    multiSelectState.selectedIds.delete(key);
  } else {
    multiSelectState.selectedIds.add(key);
  }
  syncProjectMultiSelectUI();
}

export function selectAllVisibleProjectsAction() {
  const visibleIds = getVisibleProjectIds();
  if (visibleIds.length === 0) return;
  const allSelected = visibleIds.every(id => multiSelectState.selectedIds.has(id));
  if (allSelected) {
    visibleIds.forEach(id => multiSelectState.selectedIds.delete(id));
  } else {
    visibleIds.forEach(id => multiSelectState.selectedIds.add(id));
  }
  syncProjectMultiSelectUI();
}

/**
 * Descarga los proyectos seleccionados como paquetes .zip individuales (directo a carpeta elegida cuando el
 * navegador soporta showDirectoryPicker, o en descargas secuenciales individuales como respaldo).
 */
export async function downloadSelectedProjectsZipAction() {
  if (packageOperationBusy) {
    showToast('Ya hay una operación de paquete en curso. Espera un momento.', 'info');
    return;
  }

  const selectedIds = Array.from(multiSelectState.selectedIds).filter(id => Boolean(getProjectById(id)));
  if (selectedIds.length === 0) {
    showToast('Selecciona al menos un proyecto para descargar.', 'warning');
    return;
  }

  let dirHandle = null;
  if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      if (err?.name === 'AbortError') {
        showToast('Descarga múltiple cancelada.', 'info');
        return;
      }
      dirHandle = null;
    }
  }

  packageOperationBusy = true;
  showPackageProgressOverlay({
    title: `Exportando ${selectedIds.length} proyecto(s) por separado`,
    subtitle: dirHandle ? 'Guardando paquetes individuales en la carpeta seleccionada...' : 'Preparando descargas secuenciales...',
    pct: 2
  });

  const usedBatchNames = new Set();
  const makeUniqueBatchName = (fileName) => {
    let candidate = fileName;
    let idx = 2;
    while (usedBatchNames.has(candidate)) {
      candidate = fileName.replace(/\.zip$/i, `_${idx}.zip`);
      idx += 1;
    }
    usedBatchNames.add(candidate);
    return candidate;
  };

  let okCount = 0;
  const failedProjects = [];

  try {
    for (let i = 0; i < selectedIds.length; i++) {
      const pid = selectedIds[i];
      const proj = getProjectById(pid);
      const projTitle = proj?.projectName || `Proyecto ${i + 1}`;

      try {
        const { zipBlob, fileName } = await buildProjectPackageZipBlob(pid, {
          onProgress: (sub, innerPct) => {
            const overall = Math.min(99, Math.round(((i + (Number(innerPct || 0) / 100)) / selectedIds.length) * 100));
            updatePackageProgressOverlay(`[${i + 1}/${selectedIds.length}] ${projTitle}: ${sub}`, overall);
          }
        });

        const uniqueFileName = makeUniqueBatchName(fileName);
        if (dirHandle) {
          const fileHandle = await dirHandle.getFileHandle(uniqueFileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(zipBlob);
          await writable.close();
        } else {
          triggerBlobDownload(zipBlob, uniqueFileName);
          if (i < selectedIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 650));
          }
        }
        okCount += 1;
      } catch (err) {
        console.error(`[ProjectPackage ARQ] Error exportando "${projTitle}":`, err);
        failedProjects.push(projTitle);
      }
    }

    updatePackageProgressOverlay('¡Exportación múltiple completada!', 100);
    exitProjectMultiSelectMode();

    if (failedProjects.length > 0) {
      showToast(`Se exportaron ${okCount} de ${selectedIds.length} proyectos. Fallaron: ${failedProjects.join(', ')}.`, 'warning', 6500);
    } else {
      showToast(
        `¡Se ${dirHandle ? 'guardaron en tu carpeta' : 'descargaron'} ${okCount} proyecto(s) en paquetes .zip separados!`,
        'success',
        5500
      );
    }
  } finally {
    packageOperationBusy = false;
    closePackageProgressOverlay();
  }
}

function getPackageModalContainer() {
  let el = document.getElementById(MODAL_ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = MODAL_ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

export function closeImportProjectZipModal() {
  if (packageOperationBusy) return;
  currentImportState = null;
  const el = document.getElementById(MODAL_ROOT_ID);
  if (el) el.remove();
}

function renderImportModalShell(bodyHtml) {
  const root = getPackageModalContainer();
  root.className = 'fixed inset-0 z-[10040] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto';
  root.onclick = (e) => {
    if (e.target === root) closeImportProjectZipModal();
  };
  root.innerHTML = `
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 my-auto" onclick="event.stopPropagation()">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <i class="fa-solid fa-file-zipper text-purple-400"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-white">Importar Proyecto Completo (.zip)</h2>
            <p class="text-xs text-slate-400">Restaura alcances, presupuesto ARQ, seguimiento, compras, calendario, chat y logotipos</p>
          </div>
        </div>
        <button type="button" onclick="closeImportProjectZipModal()" class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer" aria-label="Cerrar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="p-6">${bodyHtml}</div>
    </div>
  `;
}

function computeRemainingSlots(projectCheck) {
  if (!projectCheck || !projectCheck.allowed) return 0;
  const raw = Number(projectCheck.maxProjects || 0) - Number(projectCheck.currentProjects || 0);
  return raw > 0 ? raw : 999;
}

/**
 * Abre el modal unificado para seleccionar e inspeccionar 1 o varios paquetes .zip de Cubikar Arquitectura.
 */
export function openImportProjectZipModal(scopeOverride = null) {
  const user = getCurrentUser();
  if (!user || !user.email) {
    showToast('Debes iniciar sesión para importar un proyecto.', 'warning');
    return;
  }
  const targetScope = scopeOverride || 'owned';
  currentImportState = { mode: 'idle', targetScope, zip: null, manifest: null, items: [] };

  renderImportModalShell(`
    <label id="cubikar-import-dropzone" class="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-purple-500/60 bg-slate-950/50 rounded-2xl p-7 text-center cursor-pointer transition group">
      <input id="cubikar-import-zip-input" type="file" accept=".zip,application/zip" multiple class="hidden">
      <div class="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center mb-2.5 group-hover:scale-105 transition">
        <i class="fa-solid fa-cloud-arrow-up text-xl text-purple-400"></i>
      </div>
      <p class="text-sm font-semibold text-white">Haz clic o arrastra uno o varios paquetes <span class="text-purple-400 font-mono">.zip</span></p>
      <p class="text-xs text-slate-400 mt-1 max-w-md">Si eliges 1 verás su vista previa detallada; si eliges varios se mostrarán en cola para importarlos juntos.</p>
    </label>
    <div id="cubikar-import-preview" class="mt-4"></div>
  `);

  const input = document.getElementById('cubikar-import-zip-input');
  const dropzone = document.getElementById('cubikar-import-dropzone');
  if (input) {
    input.addEventListener('change', (e) => {
      const files = Array.from(e.target?.files || []);
      if (files.length > 0) inspectSelectedProjectZips(files);
    });
  }
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-purple-500', 'bg-purple-500/10');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-purple-500', 'bg-purple-500/10');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-purple-500', 'bg-purple-500/10');
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) inspectSelectedProjectZips(files);
    });
  }
}

async function parseSinglePackageCandidate(file) {
  try {
    const zip = await window.JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return { fileName: file.name, valid: false, incompatible: false, error: 'Sin manifest.json válido de Cubikar.' };
    }
    const manifest = safeJsonParse(await manifestFile.async('string'), null);
    if (!manifest || manifest.schema !== PACKAGE_SCHEMA) {
      return { fileName: file.name, valid: false, incompatible: false, error: 'Formato .zip no reconocido.' };
    }
    if (manifest.sourceApp !== SOURCE_APP_ID) {
      const originLabel = manifest.sourceApp === 'const' ? 'Cubikar Construcción' : (manifest.sourceAppLabel || manifest.sourceApp);
      return {
        fileName: file.name,
        valid: false,
        incompatible: true,
        manifest,
        desiredName: manifest.project?.projectName || file.name.replace(/\.zip$/i, ''),
        error: `Pertenece a ${originLabel}`
      };
    }

    const inlineList = Array.isArray(manifest.inlineDataRefs) ? manifest.inlineDataRefs : [];
    const totalInlineBytes = inlineList.reduce((sum, r) => sum + (Number(r?.bytes) || 0), 0);

    return {
      fileName: file.name,
      valid: true,
      incompatible: false,
      error: '',
      zip,
      manifest,
      stats: manifest.stats || {},
      inlineList,
      totalInlineBytes,
      desiredName: (manifest.project?.projectName || file.name.replace(/\.zip$/i, '') || 'Proyecto Importado').trim(),
      selected: true,
      status: 'ready'
    };
  } catch (err) {
    return {
      fileName: file.name,
      valid: false,
      incompatible: false,
      error: err?.message || 'Archivo .zip inválido o dañado.'
    };
  }
}

async function inspectSelectedProjectZips(fileList) {
  const previewEl = document.getElementById('cubikar-import-preview');
  if (!previewEl) return;

  if (typeof window === 'undefined' || typeof window.JSZip !== 'function') {
    previewEl.innerHTML = `<div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">JSZip no está disponible en el navegador.</div>`;
    return;
  }

  const files = Array.from(fileList || []).filter(Boolean);
  if (files.length === 0) return;

  if (files.length === 1) {
    return inspectSingleProjectZip(files[0], previewEl);
  }

  previewEl.innerHTML = `
    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300 flex items-center gap-3">
      <i class="fa-solid fa-spinner fa-spin text-purple-400"></i>
      <span>Analizando <strong>${files.length} paquetes .zip</strong>...</span>
    </div>
  `;

  try {
    const user = getCurrentUser();
    const targetScope = currentImportState?.targetScope || 'owned';
    const projectCheck = canUserCreateProject(user, targetScope);
    const items = [];
    for (const f of files) {
      items.push(await parseSinglePackageCandidate(f));
    }

    currentImportState = {
      mode: 'batch',
      targetScope,
      projectCheck,
      remainingSlots: computeRemainingSlots(projectCheck),
      items
    };

    renderBatchImportPreview();
  } catch (err) {
    console.error('[ProjectPackage ARQ] Error analizando lote:', err);
    previewEl.innerHTML = `
      <div class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200">
        No se pudieron analizar los archivos .zip: ${escapeHtml(err?.message || err)}
      </div>
    `;
  }
}

function getBatchRowStatusBadgeHtml(item) {
  if (item.status === 'importing') {
    return `<span class="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-semibold"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Importando</span>`;
  }
  if (item.status === 'done') {
    return `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold"><i class="fa-solid fa-check mr-1"></i>Importado</span>`;
  }
  if (item.status === 'error' || !item.valid) {
    return `<span class="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-semibold">${escapeHtml(item.incompatible ? 'Otra app' : 'Omitido')}</span>`;
  }
  return `<span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-medium">En cola</span>`;
}

function renderBatchImportPreview() {
  const previewEl = document.getElementById('cubikar-import-preview');
  const st = currentImportState;
  if (!previewEl || !st || st.mode !== 'batch') return;

  const { items, projectCheck, remainingSlots, importing, completed } = st;
  const selectedItems = items.filter(it => it.valid && it.selected);
  const selectedCount = selectedItems.length;
  const totalBytes = selectedItems.reduce((sum, it) => sum + (Number(it.totalInlineBytes) || 0), 0);

  const slotsExceeded = selectedCount > remainingSlots;
  const projectBlocked = !projectCheck.allowed || slotsExceeded;
  const canConfirm = !importing && !completed && selectedCount > 0 && !projectBlocked;

  previewEl.innerHTML = `
    <div class="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div>
          <span class="text-xs font-bold text-white">${items.length} paquetes detectados</span>
          <span class="text-[11px] text-slate-400 ml-2">(${selectedCount} seleccionado${selectedCount === 1 ? '' : 's'})</span>
        </div>
        <div class="text-[11px] text-slate-300">
          Obras disponibles en tu plan: <strong class="${slotsExceeded ? 'text-rose-400' : 'text-emerald-400'}">${remainingSlots >= 999 ? 'Ilimitado' : remainingSlots}</strong>
          <span class="text-slate-400">• Recursos: ${escapeHtml(formatBytesLocal(totalBytes))}</span>
        </div>
      </div>

      <div class="max-h-64 overflow-y-auto space-y-2 pr-1">
        ${items.map((it, idx) => `
          <div id="cubikar-batch-row-${idx}" class="p-2.5 rounded-xl bg-slate-900/90 border ${!it.valid ? 'border-rose-500/30 opacity-75' : (it.selected ? 'border-purple-500/40' : 'border-slate-800')} flex items-center gap-3 text-xs">
            <input type="checkbox"
                   ${it.selected ? 'checked' : ''}
                   ${(!it.valid || importing || completed) ? 'disabled' : ''}
                   onchange="toggleBatchImportItem(${idx})"
                   class="w-4 h-4 rounded accent-emerald-500 cursor-pointer shrink-0">
            <div class="flex-1 min-w-0">
              ${it.valid ? `
                <input type="text"
                       value="${escapeHtml(it.desiredName)}"
                       ${(importing || completed) ? 'disabled' : ''}
                       oninput="updateBatchImportItemName(${idx}, this.value)"
                       class="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-semibold text-white focus:border-purple-500 focus:outline-none">
              ` : `
                <div class="font-semibold text-slate-300 truncate">${escapeHtml(it.desiredName || it.fileName)}</div>
              `}
              <div class="text-[11px] ${it.valid ? 'text-slate-400' : 'text-rose-300'} mt-0.5 truncate">
                ${it.valid
                  ? `${escapeHtml(it.stats?.conceptCount || 0)} entregables • ${it.inlineList?.length || 0} archivo(s) (${escapeHtml(formatBytesLocal(it.totalInlineBytes))}) • ${escapeHtml(it.fileName)}`
                  : `${escapeHtml(it.error || 'Archivo inválido')} • ${escapeHtml(it.fileName)}`}
              </div>
            </div>
            <div id="cubikar-batch-badge-${idx}" class="shrink-0">${getBatchRowStatusBadgeHtml(it)}</div>
          </div>
        `).join('')}
      </div>

      ${projectBlocked ? `
        <div class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
          <span><i class="fa-solid fa-lock mr-1 text-rose-400"></i>${
            !projectCheck.allowed
              ? escapeHtml(projectCheck.reason)
              : `Seleccionaste ${selectedCount} proyectos pero solo quedan ${remainingSlots} espacio(s) disponible(s) en tu plan.`
          }</span>
          ${!projectCheck.isHostContext ? `<button type="button" onclick="closeImportProjectZipModal(); openSubscriptionModal?.();" class="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-semibold hover:bg-amber-500/30 cursor-pointer">Mejorar Plan</button>` : ''}
        </div>
      ` : ''}

      <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
        ${completed ? `
          <button type="button" onclick="closeImportProjectZipModal()" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">
            Listo (Cerrar)
          </button>
        ` : `
          <button type="button" ${importing ? 'disabled' : ''} onclick="closeImportProjectZipModal()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer">
            Cancelar
          </button>
          <button id="cubikar-confirm-import-btn" type="button" ${canConfirm ? '' : 'disabled'}
                  onclick="executeConfirmedBatchZipImport()"
                  class="px-5 py-2 rounded-xl ${canConfirm ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 cursor-pointer' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} text-xs font-bold flex items-center gap-2 transition">
            <i class="fa-solid ${importing ? 'fa-spinner fa-spin' : 'fa-file-import'}"></i>
            <span>${importing ? 'Importando lote...' : `Importar ${selectedCount} proyecto${selectedCount === 1 ? '' : 's'}`}</span>
          </button>
        `}
      </div>
    </div>
  `;
}

export function toggleBatchImportItem(index) {
  if (!currentImportState || currentImportState.mode !== 'batch' || currentImportState.importing) return;
  const item = currentImportState.items[index];
  if (!item || !item.valid) return;
  item.selected = !item.selected;
  renderBatchImportPreview();
}

export function updateBatchImportItemName(index, value) {
  if (!currentImportState || currentImportState.mode !== 'batch' || currentImportState.importing) return;
  const item = currentImportState.items[index];
  if (item) item.desiredName = String(value || '');
}

async function inspectSingleProjectZip(file, previewEl) {
  previewEl.innerHTML = `
    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300 flex items-center gap-3">
      <i class="fa-solid fa-spinner fa-spin text-purple-400"></i>
      <span>Analizando paquete <strong>${escapeHtml(file.name)}</strong> (${escapeHtml(formatBytesLocal(file.size))})...</span>
    </div>
  `;

  try {
    const zip = await window.JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('El archivo .zip no contiene manifest.json válido de Cubikar.');
    }
    const manifest = safeJsonParse(await manifestFile.async('string'), null);
    if (!manifest || manifest.schema !== PACKAGE_SCHEMA) {
      throw new Error('El paquete no corresponde al formato portátil oficial de Cubikar.');
    }

    if (manifest.sourceApp !== SOURCE_APP_ID) {
      const originLabel = manifest.sourceApp === 'const' ? 'Cubikar Construcción' : (manifest.sourceAppLabel || manifest.sourceApp);
      previewEl.innerHTML = `
        <div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 space-y-2">
          <div class="font-bold flex items-center gap-2 text-amber-300">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>Paquete incompatible con Cubikar Arquitectura</span>
          </div>
          <p>Este archivo fue exportado desde <strong>${escapeHtml(originLabel)}</strong> (${escapeHtml(manifest.project?.projectName || 'Proyecto')}). Ábrelo e impórtalo directamente dentro de esa aplicación.</p>
        </div>
      `;
      return;
    }

    const user = getCurrentUser();
    const targetScope = currentImportState?.targetScope || 'owned';
    const projectCheck = canUserCreateProject(user, targetScope);
    const projectBlocked = !projectCheck.allowed;

    const stats = manifest.stats || {};
    const inlineList = Array.isArray(manifest.inlineDataRefs) ? manifest.inlineDataRefs : [];
    const totalInlineBytes = inlineList.reduce((sum, r) => sum + (Number(r?.bytes) || 0), 0);
    const extLinksCount = Array.isArray(manifest.externalLinks) ? manifest.externalLinks.length : (stats.externalLinksCount || 0);

    currentImportState = {
      mode: 'single',
      targetScope,
      zip,
      manifest,
      projectCheck
    };

    const moduleBadges = [
      { label: 'Entregables', count: stats.conceptCount || 0, icon: 'fa-sitemap', color: 'text-purple-400' },
      { label: 'Seguimiento/Bit.', count: stats.seguimientoCount || 0, icon: 'fa-compass-drafting', color: 'text-amber-400' },
      { label: 'Estimaciones', count: stats.estimacionesCount || 0, icon: 'fa-file-invoice-dollar', color: 'text-emerald-400' },
      { label: 'Compras/Gastos', count: stats.comprasCount || 0, icon: 'fa-receipt', color: 'text-blue-400' },
      { label: 'Mensajes Chat', count: stats.chatMessagesCount || 0, icon: 'fa-comments', color: 'text-pink-400' },
      { label: 'Enlaces URL', count: extLinksCount, icon: 'fa-link', color: 'text-cyan-400' }
    ];

    const projMeta = manifest.project || {};
    previewEl.innerHTML = `
      <div class="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              <i class="fa-solid fa-drafting-compass"></i> ${escapeHtml(manifest.sourceAppLabel || 'Cubikar Arquitectura')}
            </span>
            <p class="text-[11px] text-slate-400 mt-1">Exportado el ${escapeHtml((manifest.exportedAt || '').slice(0, 16).replace('T', ' '))} • ${escapeHtml(projMeta.companyName || 'Sin despacho')} • ${escapeHtml(projMeta.projectLocation || 'Sin ubicación')}</p>
          </div>
          <div class="text-right">
            <div class="text-[11px] text-slate-400">Recursos incluidos</div>
            <div class="text-sm font-bold text-white">${inlineList.length} archivo(s) <span class="text-xs font-normal text-slate-400">(${escapeHtml(formatBytesLocal(totalInlineBytes))})</span></div>
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">Nombre del proyecto al importar</label>
          <input id="cubikar-import-project-name" type="text" value="${escapeHtml(projMeta.projectName || 'Proyecto Importado')}"
                 class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-purple-500 focus:outline-none">
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          ${moduleBadges.map(b => `
            <div class="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
              <span class="flex items-center gap-1.5 text-slate-300"><i class="fa-solid ${b.icon} ${b.color}"></i> ${b.label}</span>
              <span class="font-bold text-white">${b.count}</span>
            </div>
          `).join('')}
        </div>

        ${projectBlocked ? `
          <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-3">
            <span><i class="fa-solid fa-lock mr-1.5 text-rose-400"></i>${escapeHtml(projectCheck.reason)}</span>
            ${!projectCheck.isHostContext ? `<button type="button" onclick="closeImportProjectZipModal(); openSubscriptionModal?.();" class="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-semibold hover:bg-amber-500/30 cursor-pointer">Mejorar Plan</button>` : ''}
          </div>
        ` : ''}

        <div class="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/25 text-[11px] text-purple-200">
          <i class="fa-solid fa-shield-halved mr-1 text-purple-400"></i>
          Se generarán nuevos identificadores internos y la propiedad pasará a tu cuenta sin heredar colaboradores previos.
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
          <button type="button" onclick="closeImportProjectZipModal()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer">
            Cancelar
          </button>
          <button id="cubikar-confirm-import-btn" type="button" ${projectBlocked ? 'disabled' : ''}
                  onclick="executeConfirmedProjectZipImport()"
                  class="px-5 py-2 rounded-xl ${!projectBlocked ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 cursor-pointer' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} text-xs font-bold flex items-center gap-2 transition">
            <i class="fa-solid fa-file-import"></i>
            <span>Confirmar e Importar Proyecto</span>
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('[ProjectPackage ARQ] Error leyendo zip:', err);
    previewEl.innerHTML = `
      <div class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200">
        <i class="fa-solid fa-circle-exclamation mr-1.5 text-rose-400"></i>
        No se pudo leer el paquete: ${escapeHtml(err?.message || 'Archivo .zip inválido o dañado.')}
      </div>
    `;
  }
}

function cloneTreeAssigningFreshIds(nodes, nodeIdMap) {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(n => n && typeof n === 'object').map((node) => {
    const freshId = generateUUID();
    [node.id, node.uuid].forEach((oldId) => {
      if (oldId !== undefined && oldId !== null && String(oldId).trim()) {
        nodeIdMap.set(String(oldId).trim(), freshId);
      }
    });
    const copy = { ...node, id: freshId, uuid: freshId };
    if (Array.isArray(node.insumos)) {
      copy.insumos = node.insumos.map((ins) => {
        if (!ins || typeof ins !== 'object') return ins;
        const insId = generateUUID();
        return { ...ins, id: insId, uuid: insId };
      });
    }
    if (Array.isArray(node.children)) {
      copy.children = cloneTreeAssigningFreshIds(node.children, nodeIdMap);
    }
    return copy;
  });
}

function remapDictionaryKeys(dict, idMap) {
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return dict;
  const out = {};
  for (const [k, v] of Object.entries(dict)) {
    const mappedKey = idMap.get(String(k)) || k;
    out[mappedKey] = v;
  }
  return out;
}

function remapStructuralIdsRecursive(obj, nodeIdMap, supplierIdMap = new Map(), parentKey = '') {
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (trimmed.length >= 8 && !SKIP_UUID_REMAP_KEYS.has(parentKey) && nodeIdMap.has(trimmed)) {
      return nodeIdMap.get(trimmed);
    }
    return obj;
  }
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => remapStructuralIdsRecursive(item, nodeIdMap, supplierIdMap, parentKey));
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (NODE_REF_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
      const mapped = nodeIdMap.get(String(v).trim());
      out[k] = mapped || v;
    } else if (SUPPLIER_REF_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
      const mappedSup = supplierIdMap.get(String(v).trim());
      out[k] = mappedSup || v;
    } else if (DICT_NODE_KEYS.has(k) && v && typeof v === 'object' && !Array.isArray(v)) {
      const remappedDict = remapDictionaryKeys(v, nodeIdMap);
      out[k] = remapStructuralIdsRecursive(remappedDict, nodeIdMap, supplierIdMap, k);
    } else {
      out[k] = remapStructuralIdsRecursive(v, nodeIdMap, supplierIdMap, k);
    }
  }
  return out;
}

function refreshArqModuleEntityIds(modules) {
  const supplierIdMap = new Map();

  const refreshSuppliersList = (list) => list.map((sup) => {
    if (!sup || typeof sup !== 'object') return sup;
    const freshId = generateUUID();
    if (sup.id) supplierIdMap.set(String(sup.id), freshId);
    return { ...sup, id: freshId, cloudUuid: freshId };
  });

  if (Array.isArray(modules.proveedoresArq)) {
    modules.proveedoresArq = refreshSuppliersList(modules.proveedoresArq);
  }
  if (modules.expenses && Array.isArray(modules.expenses.suppliers)) {
    modules.expenses.suppliers = refreshSuppliersList(modules.expenses.suppliers);
  }

  const refreshExpenseArray = (list) => list.map((rec) => {
    if (!rec || typeof rec !== 'object') return rec;
    const freshId = generateUUID();
    const mappedSup = rec.supplierId
      ? (supplierIdMap.get(String(rec.supplierId)) || rec.supplierId)
      : (rec.proveedorId ? (supplierIdMap.get(String(rec.proveedorId)) || rec.proveedorId) : undefined);
    const out = { ...rec, id: freshId, cloudUuid: freshId };
    if (rec.supplierId !== undefined) out.supplierId = mappedSup;
    if (rec.proveedorId !== undefined) out.proveedorId = mappedSup;
    return out;
  });

  if (modules.expenses && Array.isArray(modules.expenses.records)) {
    modules.expenses.records = refreshExpenseArray(modules.expenses.records);
  }
  if (Array.isArray(modules.comprasArq)) {
    modules.comprasArq = refreshExpenseArray(modules.comprasArq);
  } else if (modules.comprasArq && Array.isArray(modules.comprasArq.records)) {
    modules.comprasArq.records = refreshExpenseArray(modules.comprasArq.records);
  }

  const refreshNotesList = (list) => list.map((n) => {
    if (!n || typeof n !== 'object') return n;
    const freshId = generateUUID();
    return { ...n, id: freshId, cloudUuid: freshId };
  });

  [modules.seguimiento, modules.bitacoraArq, modules.bitacoraLegacy].forEach((target) => {
    if (!target) return;
    if (Array.isArray(target)) {
      const updated = refreshNotesList(target);
      target.length = 0;
      target.push(...updated);
    } else if (Array.isArray(target.notes)) {
      target.notes = refreshNotesList(target.notes);
    } else if (Array.isArray(target.bitacora)) {
      target.bitacora = refreshNotesList(target.bitacora);
    }
  });

  const refreshEstimacionesContainer = (container) => {
    if (!container) return;
    const list = Array.isArray(container) ? container : (Array.isArray(container.estimaciones) ? container.estimaciones : null);
    if (!list) return;
    list.forEach((est) => {
      if (!est || typeof est !== 'object') return;
      est.cloudUuid = generateUUID();
    });
  };
  refreshEstimacionesContainer(modules.estimacionesArq);
  refreshEstimacionesContainer(modules.estimacionesLegacy);

  if (Array.isArray(modules.chat)) {
    modules.chat = modules.chat.map((msg) => (!msg || typeof msg !== 'object') ? msg : { ...msg, id: generateUUID() });
  }

  return { supplierIdMap };
}

function setValueAtPath(root, pathParts, newValue) {
  if (!root || !Array.isArray(pathParts) || pathParts.length === 0) return;
  let cur = root;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    if (!cur || typeof cur !== 'object') return;
    cur = cur[key];
  }
  const lastKey = pathParts[pathParts.length - 1];
  if (cur && typeof cur === 'object') {
    cur[lastKey] = newValue;
  }
}

/**
 * Lógica nuclear reutilizable para importar un paquete completo en Cubikar Arquitectura.
 */
async function importSingleZipPackageIntoAccount({
  zip,
  manifest,
  desiredName,
  finalProjectCheck,
  user,
  onProgress,
  skipUiRefresh = false
}) {
  const report = (sub, pct) => {
    if (typeof onProgress === 'function') onProgress(sub, pct);
  };

  const readZipJson = async (path, fallback) => {
    const f = zip.file(path);
    if (!f) return fallback;
    const text = await f.async('string');
    return safeJsonParse(text, fallback);
  };

  report('Generando identificadores y restaurando entregables...', 12);
  const origProject = (await readZipJson('project.json', manifest.project || {})) || {};
  const rawSettings = Object.assign({}, defaultSettings, (await readZipJson('settings.json', {})) || {});
  const rawTree = (await readZipJson('treeData.json', [])) || [];

  const rawModules = {
    seguimiento: await readZipJson('modules/seguimiento.json', null),
    bitacoraArq: await readZipJson('modules/bitacoraArq.json', null),
    bitacoraLegacy: await readZipJson('modules/bitacoraLegacy.json', null),
    estimacionesArq: await readZipJson('modules/estimacionesArq.json', null),
    estimacionesLegacy: await readZipJson('modules/estimacionesLegacy.json', null),
    expenses: await readZipJson('modules/expenses.json', null),
    comprasArq: await readZipJson('modules/comprasArq.json', null),
    proveedoresArq: await readZipJson('modules/proveedoresArq.json', null),
    calendarioArqCfg: await readZipJson('modules/calendarioArqCfg.json', null),
    calendarioCfg: await readZipJson('modules/calendarioCfg.json', null),
    calendarioArqWorkdays: await readZipJson('modules/calendarioArqWorkdays.json', null),
    calendarioWorkdays: await readZipJson('modules/calendarioWorkdays.json', null),
    chat: await readZipJson('modules/chat.json', null),
    tabLocks: await readZipJson('modules/tabLocks.json', null),
    signatures: await readZipJson('modules/signatures.json', null)
  };

  const newProjectId = generateUUID();
  const nodeIdMap = new Map();
  const freshTree = cloneTreeAssigningFreshIds(rawTree, nodeIdMap);
  const { supplierIdMap } = refreshArqModuleEntityIds(rawModules);

  const finalSettings = remapStructuralIdsRecursive(deepClone(rawSettings), nodeIdMap, supplierIdMap);
  finalSettings.projectName = desiredName;

  const finalModules = {};
  for (const [k, val] of Object.entries(rawModules)) {
    finalModules[k] = val ? remapStructuralIdsRecursive(deepClone(val), nodeIdMap, supplierIdMap) : null;
  }

  const uEmail = (user.email || '').toLowerCase().trim();
  const isHostContext = Boolean(finalProjectCheck.isHostContext && finalProjectCheck.hostEmail);
  const targetOwnerEmail = isHostContext ? finalProjectCheck.hostEmail.toLowerCase().trim() : uEmail;
  const targetOwnerName = isHostContext
    ? resolveCleanHostName(targetOwnerEmail, finalProjectCheck.hostName || '', null, uEmail)
    : resolveCleanHostName(uEmail, user.name || '', null, uEmail);
  const targetOwnerPlanId = isHostContext
    ? (finalProjectCheck.planId || getUserPlanId(targetOwnerEmail))
    : getUserPlanId(user);

  const freshMembers = [
    {
      id: 'mem-' + targetOwnerEmail,
      name: targetOwnerName || (isHostContext ? 'Propietario' : (user.name || 'Administrador')),
      email: targetOwnerEmail,
      avatar: (!isHostContext && user.avatar) ? user.avatar : AVATARS_BY_SEX['Masculino'],
      role: 'editar',
      status: 'active'
    }
  ];
  if (isHostContext && uEmail !== targetOwnerEmail) {
    freshMembers.push({
      id: 'mem-' + uEmail,
      name: user.name || 'Editor',
      email: uEmail,
      avatar: user.avatar || AVATARS_BY_SEX['Masculino'],
      role: 'editar',
      status: 'active'
    });
  }

  const newProjectEntry = {
    id: newProjectId,
    cloudId: newProjectId,
    isCloudSynced: false,
    companyName: finalSettings.companyName || origProject.companyName || 'Taller de Arquitectura',
    companyLogo: finalSettings.companyLogo || origProject.companyLogo || '',
    projectName: desiredName,
    projectLocation: finalSettings.projectLocation || origProject.projectLocation || '',
    tipoObra: origProject.tipoObra || 'Diseño y Proyecto Ejecutivo',
    currency: finalSettings.currency || origProject.currency || 'MXN',
    currencySymbol: finalSettings.currencySymbol || origProject.currencySymbol || '$',
    factorSobrecosto: calculateFactorFromSettingsObj(finalSettings) || Number(origProject.factorSobrecosto) || 1,
    totalPresupuesto: calculateTreeTotal(freshTree),
    conceptCount: countTreeConcepts(freshTree),
    partidasCount: countTreePartidas(freshTree),
    ...(finalSettings.presupuestoArq ? { presupuestoArq: finalSettings.presupuestoArq } : {}),
    ownerEmail: targetOwnerEmail,
    ownerName: targetOwnerName,
    ownerPlanId: targetOwnerPlanId,
    createdByEmail: uEmail,
    members: freshMembers,
    createdAt: origProject.createdAt || new Date().toISOString().slice(0, 10)
  };

  const inlineDataRefs = Array.isArray(manifest.inlineDataRefs) ? manifest.inlineDataRefs : [];
  const restoreTargets = { project: newProjectEntry, settings: finalSettings, treeData: freshTree, modules: finalModules };
  let restoredAssets = 0;
  for (const inlineRef of inlineDataRefs) {
    restoredAssets += 1;
    report(
      `Restaurando recurso (${restoredAssets}/${inlineDataRefs.length}): ${inlineRef.fileName}`,
      35 + Math.round((restoredAssets / Math.max(1, inlineDataRefs.length)) * 35)
    );
    const zipEntry = zip.file(inlineRef.archivePath);
    if (!zipEntry) continue;
    const rawBuf = await zipEntry.async('arraybuffer');
    const restoredMime = inferMimeType(inlineRef.archivePath, inlineRef.mimeType);
    const blob = new Blob([rawBuf], { type: restoredMime });
    const dataUrl = await blobToDataUrlLocal(blob);
    setValueAtPath(restoreTargets, inlineRef.pathParts, dataUrl);
  }

  finalSettings.projectName = desiredName;
  newProjectEntry.companyLogo = finalSettings.companyLogo || newProjectEntry.companyLogo || '';

  report('Guardando tablas y configuración...', 76);
  localStorage.setItem(getSettingsKey(newProjectId), JSON.stringify(finalSettings));
  localStorage.setItem(getStorageKey(newProjectId), JSON.stringify(freshTree));

  const moduleStorageMap = [
    ['seguimiento', `adm_arq_seguimiento_${newProjectId}`],
    ['bitacoraArq', `adm_arq_bitacora_${newProjectId}`],
    ['bitacoraLegacy', `bitacora_data_${newProjectId}`],
    ['estimacionesArq', `estimaciones_arq_data_${newProjectId}`],
    ['estimacionesLegacy', `estimaciones_data_${newProjectId}`],
    ['expenses', `expenses_control_${newProjectId}`],
    ['comprasArq', `adm_arq_compras_${newProjectId}`],
    ['proveedoresArq', `adm_arq_proveedores_${newProjectId}`],
    ['calendarioArqCfg', `calendario_arq_cfg_${newProjectId}`],
    ['calendarioCfg', `calendario_cfg_${newProjectId}`],
    ['calendarioArqWorkdays', `calendario_arq_workdays_${newProjectId}`],
    ['calendarioWorkdays', `calendario_workdays_${newProjectId}`],
    ['chat', `adm_arq_project_chat_${newProjectId}`],
    ['tabLocks', `adm_arq_tab_locks_${newProjectId}`],
    ['signatures', `adm_arq_signatures_${newProjectId}`]
  ];
  moduleStorageMap.forEach(([modKey, storageKey]) => {
    if (finalModules[modKey] !== null && finalModules[modKey] !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(finalModules[modKey]));
    }
  });

  const listNow = getProjectsList();
  listNow.unshift(newProjectEntry);
  saveProjectsList(listNow, { skipCloudSync: true });

  if (isSupabaseConfigured()) {
    report('Sincronizando proyecto y módulos en la nube Supabase...', 86);
    try {
      const cloudProjRes = await syncProjectToCloud(newProjectEntry, finalSettings, freshTree, { immediate: true });
      if (cloudProjRes?.success) {
        newProjectEntry.isCloudSynced = true;
        newProjectEntry.lastCloudSyncAt = new Date().toISOString();
        const refreshed = getProjectsList();
        const rIdx = refreshed.findIndex(p => p.id === newProjectId);
        if (rIdx >= 0) {
          refreshed[rIdx] = newProjectEntry;
          saveProjectsList(refreshed, { skipCloudSync: true });
        }

        await Promise.allSettled([
          (finalModules.seguimiento || finalModules.bitacoraArq || finalModules.bitacoraLegacy) ? syncBitacoraNow(newProjectId) : Promise.resolve(),
          (finalModules.expenses || finalModules.comprasArq || finalModules.proveedoresArq) ? syncExpensesNow(newProjectId) : Promise.resolve(),
          (finalModules.estimacionesArq || finalModules.estimacionesLegacy) ? syncEstimacionesNow(newProjectId) : Promise.resolve(),
          (finalModules.calendarioArqCfg || finalModules.calendarioCfg || finalModules.calendarioArqWorkdays || finalModules.calendarioWorkdays) ? syncCronogramaNow(newProjectId) : Promise.resolve(),
          Array.isArray(finalModules.chat) && finalModules.chat.length > 0 ? syncChatNow(newProjectId) : Promise.resolve()
        ]);
      }
      invalidateCloudProjectsCache();
    } catch (syncErr) {
      console.warn('[ProjectPackage ARQ] Error sincronizando a nube:', syncErr?.message || syncErr);
    }
  }

  if (!skipUiRefresh) {
    report('Actualizando tablero de proyectos...', 98);
    if (typeof window !== 'undefined' && typeof window.renderPortalDashboard === 'function') {
      window.renderPortalDashboard();
    }
  }

  return { projectEntry: newProjectEntry, inlineCount: inlineDataRefs.length };
}

/**
 * Ejecuta la importación confirmada de un único paquete en Cubikar Arquitectura.
 */
export async function executeConfirmedProjectZipImport() {
  if (packageOperationBusy) return;
  if (!currentImportState || !currentImportState.zip || !currentImportState.manifest) {
    showToast('Selecciona un archivo .zip válido primero.', 'warning');
    return;
  }

  const stateSnap = currentImportState;
  const user = getCurrentUser();
  if (!user || !user.email) {
    showToast('Debes iniciar sesión para importar.', 'warning');
    return;
  }

  const nameInput = document.getElementById('cubikar-import-project-name');
  const desiredName = (nameInput?.value || stateSnap.manifest.project?.projectName || 'Proyecto Importado').trim();
  const targetScope = stateSnap.targetScope || 'owned';

  const finalProjectCheck = canUserCreateProject(user, targetScope);
  if (!finalProjectCheck.allowed) {
    showToast(finalProjectCheck.reason || 'Límite de proyectos alcanzado.', 'warning');
    return;
  }

  packageOperationBusy = true;
  closeImportProjectZipModal();
  showPackageProgressOverlay({
    title: `Importando "${desiredName}"`,
    subtitle: 'Iniciando restauración...',
    pct: 5
  });

  try {
    const res = await importSingleZipPackageIntoAccount({
      zip: stateSnap.zip,
      manifest: stateSnap.manifest,
      desiredName,
      finalProjectCheck,
      user,
      onProgress: (sub, pct) => updatePackageProgressOverlay(sub, pct)
    });

    showToast(
      `¡Proyecto "${desiredName}" importado tal cual con todos sus módulos${res.inlineCount ? ` y ${res.inlineCount} recurso(s)` : ''}!`,
      'success',
      5500
    );
  } catch (err) {
    console.error('[ProjectPackage ARQ] Error en importación:', err);
    showToast(`No se pudo completar la importación: ${err?.message || err}`, 'error', 6000);
  } finally {
    packageOperationBusy = false;
    currentImportState = null;
    closePackageProgressOverlay();
  }
}

/**
 * Ejecuta la importación secuencial de múltiples paquetes .zip seleccionados en el modal unificado.
 */
export async function executeConfirmedBatchZipImport() {
  if (packageOperationBusy) return;
  if (!currentImportState || currentImportState.mode !== 'batch') return;

  const user = getCurrentUser();
  if (!user || !user.email) {
    showToast('Debes iniciar sesión para importar.', 'warning');
    return;
  }

  const st = currentImportState;
  const selectedIndices = [];
  st.items.forEach((it, idx) => {
    if (it.valid && it.selected) selectedIndices.push(idx);
  });
  if (selectedIndices.length === 0) return;

  const initialCheck = canUserCreateProject(user, st.targetScope);
  if (!initialCheck.allowed || selectedIndices.length > computeRemainingSlots(initialCheck)) {
    showToast('Los proyectos seleccionados exceden el límite disponible de tu plan.', 'warning');
    return;
  }

  packageOperationBusy = true;
  st.importing = true;
  renderBatchImportPreview();

  let successCount = 0;
  let errorCount = 0;

  try {
    for (const idx of selectedIndices) {
      const item = st.items[idx];
      item.status = 'importing';
      const badgeEl = document.getElementById(`cubikar-batch-badge-${idx}`);
      if (badgeEl) badgeEl.innerHTML = getBatchRowStatusBadgeHtml(item);

      try {
        const freshCheck = canUserCreateProject(user, st.targetScope);
        if (!freshCheck.allowed) {
          throw new Error(freshCheck.reason || 'Límite de proyectos alcanzado.');
        }
        const desiredName = (item.desiredName || item.manifest?.project?.projectName || 'Proyecto Importado').trim();
        await importSingleZipPackageIntoAccount({
          zip: item.zip,
          manifest: item.manifest,
          desiredName,
          finalProjectCheck: freshCheck,
          user,
          skipUiRefresh: true
        });
        item.status = 'done';
        item.zip = null;
        successCount += 1;
      } catch (err) {
        console.error(`[ProjectPackage ARQ] Error importando "${item.desiredName}":`, err);
        item.status = 'error';
        item.error = err?.message || 'Error al importar';
        errorCount += 1;
      }

      const doneBadgeEl = document.getElementById(`cubikar-batch-badge-${idx}`);
      if (doneBadgeEl) doneBadgeEl.innerHTML = getBatchRowStatusBadgeHtml(item);
    }

    st.completed = true;
    if (typeof window !== 'undefined' && typeof window.renderPortalDashboard === 'function') {
      window.renderPortalDashboard();
    }

    if (errorCount > 0) {
      showToast(`Lote finalizado: ${successCount} importado(s), ${errorCount} con error.`, 'warning', 6000);
    } else {
      showToast(`¡Se importaron ${successCount} proyecto(s) correctamente!`, 'success', 5500);
    }
  } finally {
    st.importing = false;
    packageOperationBusy = false;
    renderBatchImportPreview();
  }
}
