// js/core/cloudModulesSyncService.js
// Sincronización integral de módulos operativos con Supabase (ADM_ARQ):
// Seguimiento/Bitácora, Compras/Proveedores, Estimaciones, Cronograma/Calendario y Chat de Obra.
// Alineado 100% al esquema real PostgreSQL de Cubikar.

import { getActiveProjectId } from '../config/constants.js?v=20261117_cf25';
import { supabase, isSupabaseConfigured } from './supabaseClient.js?v=20261117_cf25';
import { isValidUUID } from './cloudProjectService.js?v=20261117_cf25';
import { getProjectById, getCurrentUser } from '../modules/portal/projectService.js?v=20261117_cf25';

const syncTimers = {
  bitacora: null,
  expenses: null,
  estimaciones: null,
  cronograma: null,
  chat: null
};
const inFlightModuleHydrateByProject = new Map();
const lastModuleHydrateAtByProject = new Map();
const MODULE_HYDRATE_COOLDOWN_MS = 6000;
const CHAT_MENSAJES_BASE_COLS = ['id', 'proyecto_id', 'autor_nombre', 'autor_email', 'mensaje', 'created_at'];
const missingChatMensajeColumns = new Set();

async function upsertChatRowsResilient(sb, rows) {
  if (!sb || !Array.isArray(rows) || rows.length === 0) return { error: null };
  const stripMissing = (list) => list.map((r) => {
    const clean = { ...r };
    missingChatMensajeColumns.forEach((col) => { delete clean[col]; });
    return clean;
  });
  let payload = stripMissing(rows);
  for (let attempt = 0; attempt < 9; attempt++) {
    const res = await sb.from('chat_mensajes').upsert(payload, { onConflict: 'id' });
    if (!res?.error) return res;
    const msg = String(res.error.message || '');
    const m = msg.match(/Could not find the ['"]([^'"]+)['"] column/i)
      || msg.match(/column\s+["']?([a-z0-9_]+)["']?(?:\s+of\s+relation)?\s+does not exist/i);
    if (m && m[1] && !CHAT_MENSAJES_BASE_COLS.includes(m[1])) {
      missingChatMensajeColumns.add(m[1]);
      payload = stripMissing(payload);
      continue;
    }
    if ((res.error.code === 'PGRST204' || res.error.code === '42703') && attempt < 8) {
      payload = rows.map((r) => {
        const minRow = {};
        CHAT_MENSAJES_BASE_COLS.forEach((c) => { if (r[c] !== undefined) minRow[c] = r[c]; });
        return minRow;
      });
      continue;
    }
    return res;
  }
  return { error: new Error('No se pudo persistir chat_mensajes') };
}

function resolveCloudProjectUuid(projectId = null) {
  const pid = projectId || getActiveProjectId();
  if (!pid || pid === 'default') return null;
  if (isValidUUID(pid)) return pid;
  const proj = getProjectById(pid);
  if (proj && isValidUUID(proj.cloudId)) return proj.cloudId;
  if (proj && isValidUUID(proj.id)) return proj.id;
  return null;
}

function getContextMetadata(pid) {
  const proj = getProjectById(pid);
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return {
    empresaId: user?.empresaId && isValidUUID(user.empresaId) ? user.empresaId : null,
    ownerEmail: String(proj?.ownerEmail || user?.email || '').toLowerCase().trim()
  };
}

/**
 * Generar un UUID determinístico estable para claves compuestas (ej. estimaciones.id UUID NOT NULL).
 */
function deterministicUuid(seedStr) {
  const str = String(seedStr || '');
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ (ch * 31), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ (ch + 7), 0x27d4eb2f) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  const raw = hex(h1) + hex(h2) + hex(h3) + hex(h4);
  const p3 = '4' + raw.slice(13, 16);
  const p4 = ((parseInt(raw[16], 16) & 0x3) | 0x8).toString(16) + raw.slice(17, 20);
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${p3}-${p4}-${raw.slice(20, 32)}`;
}

function toIsoDateOrNull(val) {
  if (!val) return null;
  const s = String(val).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toRequiredIsoDate(val, fallback = null) {
  return toIsoDateOrNull(val) || fallback || new Date().toISOString().slice(0, 10);
}

/**
 * Elimina cadenas Base64 pesadas (> 2048 chars) para no exceder límites de payload en PostgreSQL.
 */
export function stripInlineBinaryPayloads(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripInlineBinaryPayloads);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.startsWith('data:') && v.length > 2048) {
      out[k] = '';
    } else if (v && typeof v === 'object') {
      out[k] = stripInlineBinaryPayloads(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function normalizeChatId(rawId) {
  return String(rawId || '').replace(/^.*?(?:__|::)/, '');
}

// ==========================================
// 1. SEGUIMIENTO Y BITÁCORA DE OBRA
// ==========================================
export function scheduleBitacoraCloudSync(projectId = null) {
  if (!isSupabaseConfigured()) return;
  const pid = projectId || getActiveProjectId();
  if (syncTimers.bitacora) clearTimeout(syncTimers.bitacora);
  syncTimers.bitacora = setTimeout(() => {
    syncTimers.bitacora = null;
    syncBitacoraNow(pid).catch(err => console.warn('[CloudModulesSync] Error sync bitacora:', err));
  }, 900);
}

export async function syncBitacoraNow(projectId = null) {
  if (!isSupabaseConfigured()) return false;
  const pid = projectId || getActiveProjectId();
  const cloudId = resolveCloudProjectUuid(pid);
  if (!cloudId) return false;

  const raw = localStorage.getItem(`adm_arq_seguimiento_${pid}`)
    || localStorage.getItem(`adm_arq_bitacora_${pid}`)
    || localStorage.getItem(`bitacora_data_${pid}`);
  if (!raw) return false;

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return false;
  }
  if (!data || typeof data !== 'object') return false;

  const { empresaId, ownerEmail } = getContextMetadata(pid);
  const general = (data.general && typeof data.general === 'object') ? data.general : {};
  const extraDatos = stripInlineBinaryPayloads({
    ...data,
    notas: undefined
  });

  const configPayload = {
    proyecto_id: cloudId,
    empresa_id: empresaId,
    owner_email: ownerEmail,
    titulo_obra: general.nombreObra || general.tituloObra || '',
    contrato_num: String(general.numeroContrato || '').slice(0, 100),
    contratista: general.directorResponsable || general.contratista || '',
    supervision: general.ubicacionExacta || general.supervision || '',
    residente_nombre: String(general.residenteObra || '').slice(0, 255),
    supervisor_nombre: String(general.supervisorCliente || '').slice(0, 255),
    folio_actual: Math.max(1, parseInt(data.folioActual || general.folioActual || 1, 10) || 1),
    config_json: extraDatos,
    updated_at: new Date().toISOString()
  };

  await supabase.from('bitacora_config').upsert(configPayload, { onConflict: 'proyecto_id' });

  const notas = Array.isArray(data.notas) ? data.notas : [];
  const localRowIds = new Set();
  if (notas.length > 0) {
    const rows = notas.map((n, idx) => {
      const cleanNota = stripInlineBinaryPayloads(n);
      const rawId = cleanNota.id || `nota_${idx}_${cleanNota.folio || idx + 1}`;
      cleanNota.id = rawId;
      const rowId = `${cloudId}__${rawId}`.slice(0, 120);
      localRowIds.add(rowId);
      return {
        id: rowId,
        proyecto_id: cloudId,
        empresa_id: empresaId,
        owner_email: ownerEmail,
        folio: parseInt(cleanNota.folio, 10) || (idx + 1),
        fecha: toIsoDateOrNull(cleanNota.fecha),
        tipo: String(cleanNota.tipo || 'seguimiento').slice(0, 60),
        clasificacion: String(cleanNota.clasificacion || 'apertura').slice(0, 60),
        titulo: cleanNota.titulo || '',
        contenido: cleanNota.descripcion || cleanNota.contenido || '',
        autor_nombre: String(cleanNota.autor || cleanNota.autorNombre || '').slice(0, 255),
        autor_email: String(cleanNota.autorEmail || '').slice(0, 255),
        estado: String(cleanNota.estatusFirma || cleanNota.estado || 'firmada').slice(0, 40),
        fotos: Array.isArray(cleanNota.evidencias) ? cleanNota.evidencias : (Array.isArray(cleanNota.fotos) ? cleanNota.fotos : []),
        sello_json: cleanNota.sello && typeof cleanNota.sello === 'object' ? cleanNota.sello : {},
        payload_json: cleanNota,
        updated_at: new Date().toISOString()
      };
    });
    await supabase.from('bitacora_notas').upsert(rows, { onConflict: 'id' });
  }

  try {
    const { data: existingNotes } = await supabase
      .from('bitacora_notas')
      .select('id')
      .eq('proyecto_id', cloudId);
    if (Array.isArray(existingNotes)) {
      const toDelete = existingNotes.map(r => r.id).filter(id => !localRowIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('bitacora_notas').delete().eq('proyecto_id', cloudId).in('id', toDelete);
      }
    }
  } catch (_) {}

  return true;
}

// ==========================================
// 2. COMPRAS / GASTOS Y PROVEEDORES
// ==========================================
export function scheduleExpensesCloudSync(projectId = null) {
  if (!isSupabaseConfigured()) return;
  const pid = projectId || getActiveProjectId();
  if (syncTimers.expenses) clearTimeout(syncTimers.expenses);
  syncTimers.expenses = setTimeout(() => {
    syncTimers.expenses = null;
    syncExpensesNow(pid).catch(err => console.warn('[CloudModulesSync] Error sync expenses:', err));
  }, 900);
}

export async function syncExpensesNow(projectId = null) {
  if (!isSupabaseConfigured()) return false;
  const pid = projectId || getActiveProjectId();
  const cloudId = resolveCloudProjectUuid(pid);
  if (!cloudId) return false;

  const rawCompras = localStorage.getItem(`adm_arq_compras_${pid}`);
  const rawProveedores = localStorage.getItem(`adm_arq_proveedores_${pid}`);
  const rawCombined = localStorage.getItem(`expenses_control_${pid}`);

  let comprasList = null;
  let proveedoresList = null;

  try {
    if (rawCompras) {
      const parsed = JSON.parse(rawCompras);
      comprasList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.expenses) ? parsed.expenses : []);
    }
  } catch (_) {}

  try {
    if (rawProveedores) {
      const parsed = JSON.parse(rawProveedores);
      proveedoresList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.proveedores) ? parsed.proveedores : []);
    }
  } catch (_) {}

  if ((!comprasList || !proveedoresList) && rawCombined) {
    try {
      const parsed = JSON.parse(rawCombined);
      if (!comprasList && Array.isArray(parsed?.expenses)) comprasList = parsed.expenses;
      if (!proveedoresList && Array.isArray(parsed?.proveedores)) proveedoresList = parsed.proveedores;
    } catch (_) {}
  }

  const { empresaId, ownerEmail } = getContextMetadata(pid);
  const localExpIds = new Set();
  if (Array.isArray(comprasList) && comprasList.length > 0) {
    const expRows = comprasList.map((e, idx) => {
      const cleanExp = stripInlineBinaryPayloads(e);
      const rawId = cleanExp.id || `exp_${idx}_${Date.now()}`;
      cleanExp.id = rawId;
      const rowId = `${cloudId}__${rawId}`.slice(0, 120);
      localExpIds.add(rowId);
      return {
        id: rowId,
        proyecto_id: cloudId,
        empresa_id: empresaId,
        owner_email: ownerEmail,
        proveedor_id: String(cleanExp.proveedorId || cleanExp.proveedor || '').slice(0, 120),
        concepto_id: String(cleanExp.partidaId || cleanExp.conceptoId || 'general'),
        fecha: toIsoDateOrNull(cleanExp.fecha),
        tipo: String(cleanExp.tipo || 'compra').slice(0, 60),
        categoria: String(cleanExp.categoria || 'Materiales').slice(0, 100),
        descripcion: cleanExp.concepto || cleanExp.descripcion || '',
        folio_factura: String(cleanExp.folio || cleanExp.folioFactura || '').slice(0, 120),
        subtotal: Number(cleanExp.subtotal) || 0,
        iva: Number(cleanExp.iva) || 0,
        total: Number(cleanExp.total ?? cleanExp.montoTotal ?? 0) || 0,
        metodo_pago: String(cleanExp.metodoPago || 'Transferencia').slice(0, 60),
        estado: String(cleanExp.estatus || cleanExp.estado || 'pagado').slice(0, 40),
        evidencia_json: cleanExp.comprobante && typeof cleanExp.comprobante === 'object' ? cleanExp.comprobante : {},
        payload_json: cleanExp,
        updated_at: new Date().toISOString()
      };
    });
    await supabase.from('compras_gastos').upsert(expRows, { onConflict: 'id' });
  }

  if (Array.isArray(comprasList)) {
    try {
      const { data: existingExp } = await supabase.from('compras_gastos').select('id').eq('proyecto_id', cloudId);
      if (Array.isArray(existingExp)) {
        const toDelete = existingExp.map(r => r.id).filter(id => !localExpIds.has(id));
        if (toDelete.length > 0) await supabase.from('compras_gastos').delete().eq('proyecto_id', cloudId).in('id', toDelete);
      }
    } catch (_) {}
  }

  const localProvIds = new Set();
  if (Array.isArray(proveedoresList) && proveedoresList.length > 0) {
    const provRows = proveedoresList.map((p, idx) => {
      const cleanProv = stripInlineBinaryPayloads(p);
      const rawId = cleanProv.id || `prov_${idx}_${Date.now()}`;
      cleanProv.id = rawId;
      const rowId = `${cloudId}__${rawId}`.slice(0, 120);
      localProvIds.add(rowId);
      return {
        id: rowId,
        proyecto_id: cloudId,
        empresa_id: empresaId,
        owner_email: ownerEmail,
        nombre: String(cleanProv.nombre || cleanProv.razonSocial || 'Proveedor').slice(0, 255),
        rfc: String(cleanProv.rfc || '').slice(0, 30),
        categoria: String(cleanProv.especialidad || cleanProv.categoria || 'Materiales').slice(0, 100),
        telefono: String(cleanProv.telefono || '').slice(0, 50),
        email: String(cleanProv.email || '').slice(0, 255),
        notas: cleanProv.notas || '',
        payload_json: cleanProv,
        updated_at: new Date().toISOString()
      };
    });
    await supabase.from('proveedores').upsert(provRows, { onConflict: 'id' });
  }

  if (Array.isArray(proveedoresList)) {
    try {
      const { data: existingProv } = await supabase.from('proveedores').select('id').eq('proyecto_id', cloudId);
      if (Array.isArray(existingProv)) {
        const toDelete = existingProv.map(r => r.id).filter(id => !localProvIds.has(id));
        if (toDelete.length > 0) await supabase.from('proveedores').delete().eq('proyecto_id', cloudId).in('id', toDelete);
      }
    } catch (_) {}
  }

  return true;
}

// ==========================================
// 3. ESTIMACIONES DE OBRA
// ==========================================
export function scheduleEstimacionesCloudSync(projectId = null) {
  if (!isSupabaseConfigured()) return;
  const pid = projectId || getActiveProjectId();
  if (syncTimers.estimaciones) clearTimeout(syncTimers.estimaciones);
  syncTimers.estimaciones = setTimeout(() => {
    syncTimers.estimaciones = null;
    syncEstimacionesNow(pid).catch(err => console.warn('[CloudModulesSync] Error sync estimaciones:', err));
  }, 900);
}

export async function syncEstimacionesNow(projectId = null) {
  if (!isSupabaseConfigured()) return false;
  const pid = projectId || getActiveProjectId();
  const cloudId = resolveCloudProjectUuid(pid);
  if (!cloudId) return false;

  const raw = localStorage.getItem(`estimaciones_arq_data_${pid}`)
    || localStorage.getItem(`estimaciones_data_${pid}`);
  if (!raw) return false;

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return false;
  }
  if (!data || typeof data !== 'object') return false;

  const validStates = new Set(['borrador', 'presentada', 'aprobada', 'pagada']);
  const normalizeEstState = (s) => {
    const clean = String(s || 'borrador').toLowerCase().trim();
    return validStates.has(clean) ? clean : 'borrador';
  };

  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  const localRowIds = new Set();

  const cfgUuid = deterministicUuid(`${cloudId}__EST_CONFIG__0`);
  localRowIds.add(cfgUuid);
  rows.push({
    id: cfgUuid,
    proyecto_id: cloudId,
    numero: 0,
    nombre: '__CONFIG__',
    fecha_inicio: today,
    fecha_fin: today,
    fecha_corte: today,
    notas: data.notasGenerales || '',
    estado: 'borrador',
    fotos: [],
    locked: false,
    resumen: {
      isConfigRow: true,
      anticipoPct: Number(data.anticipoPct ?? 30),
      retencionPct: Number(data.retencionPct ?? 0),
      anticipoPagado: Number(data.anticipoPagado ?? 0),
      notasGenerales: data.notasGenerales || ''
    },
    detalles_json: {},
    updated_at: new Date().toISOString()
  });

  const estList = Array.isArray(data.estimaciones) ? data.estimaciones : [];
  estList.forEach((est, idx) => {
    const cleanEst = stripInlineBinaryPayloads(est);
    const estNum = Math.max(1, parseInt(cleanEst.numero || (idx + 1), 10) || (idx + 1));
    const rowUuid = isValidUUID(String(cleanEst.cloudUuid || cleanEst.id || ''))
      ? String(cleanEst.cloudUuid || cleanEst.id)
      : deterministicUuid(`${cloudId}__EST__${estNum}`);
    cleanEst.cloudUuid = rowUuid;
    localRowIds.add(rowUuid);
    const fechaIni = toRequiredIsoDate(cleanEst.periodoInicio || cleanEst.fechaInicio, today);
    const fechaFin = toRequiredIsoDate(cleanEst.periodoFin || cleanEst.fechaCorte, fechaIni);
    rows.push({
      id: rowUuid,
      proyecto_id: cloudId,
      numero: estNum,
      nombre: String(cleanEst.titulo || cleanEst.nombre || `Estimación #${estNum}`).slice(0, 100),
      fecha_inicio: fechaIni,
      fecha_fin: fechaFin,
      fecha_corte: fechaFin,
      notas: cleanEst.observaciones || cleanEst.notas || '',
      estado: normalizeEstState(cleanEst.estado || cleanEst.estatus),
      fotos: Array.isArray(cleanEst.fotos) ? cleanEst.fotos : [],
      locked: Boolean(cleanEst.locked),
      resumen: {
        montoTotal: Number(cleanEst.montoTotal ?? cleanEst.total ?? 0) || 0,
        anticipoPct: Number(cleanEst.anticipoPct ?? data.anticipoPct ?? 30),
        retencionPct: Number(cleanEst.retencionPct ?? data.retencionPct ?? 0)
      },
      detalles_json: cleanEst,
      updated_at: new Date().toISOString()
    });
  });

  if (rows.length > 0) {
    await supabase.from('estimaciones').upsert(rows, { onConflict: 'proyecto_id,numero' });
  }

  try {
    const { data: existingEst } = await supabase.from('estimaciones').select('id').eq('proyecto_id', cloudId);
    if (Array.isArray(existingEst)) {
      const toDelete = existingEst.map(r => r.id).filter(id => !localRowIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('estimaciones').delete().eq('proyecto_id', cloudId).in('id', toDelete);
      }
    }
  } catch (_) {}

  return true;
}

// ==========================================
// 4. CRONOGRAMA / CALENDARIO Y CANDADOS DE PESTAÑAS
// ==========================================
export function scheduleCronogramaCloudSync(projectId = null) {
  if (!isSupabaseConfigured()) return;
  const pid = projectId || getActiveProjectId();
  if (syncTimers.cronograma) clearTimeout(syncTimers.cronograma);
  syncTimers.cronograma = setTimeout(() => {
    syncTimers.cronograma = null;
    syncCronogramaNow(pid).catch(err => console.warn('[CloudModulesSync] Error sync cronograma:', err));
  }, 900);
}

export async function syncCronogramaNow(projectId = null) {
  if (!isSupabaseConfigured()) return false;
  const pid = projectId || getActiveProjectId();
  const cloudId = resolveCloudProjectUuid(pid);
  if (!cloudId) return false;

  let scheduleCfg = {};
  let workdaysCfg = {};
  let tabLocks = {};

  try {
    const sRaw = localStorage.getItem(`calendario_arq_cfg_${pid}`)
      || localStorage.getItem(`calendario_cfg_${pid}`);
    if (sRaw) scheduleCfg = JSON.parse(sRaw);
  } catch (_) {}

  try {
    const wRaw = localStorage.getItem(`calendario_arq_workdays_${pid}`)
      || localStorage.getItem(`calendario_workdays_${pid}`);
    if (wRaw) workdaysCfg = JSON.parse(wRaw);
  } catch (_) {}

  try {
    const lRaw = localStorage.getItem(`adm_arq_tab_locks_${pid}`);
    if (lRaw) tabLocks = JSON.parse(lRaw);
  } catch (_) {}

  const { empresaId, ownerEmail } = getContextMetadata(pid);
  await supabase.from('cronograma_config').upsert({
    proyecto_id: cloudId,
    empresa_id: empresaId,
    owner_email: ownerEmail,
    config_json: {
      schedule_cfg: scheduleCfg || {},
      workdays_cfg: workdaysCfg || {},
      tab_locks: tabLocks || {}
    },
    updated_at: new Date().toISOString()
  }, { onConflict: 'proyecto_id' });

  return true;
}

// ==========================================
// 5. CHAT DE OBRA (SINCRONIZACIÓN Y BORRADO)
// ==========================================
export function scheduleChatCloudSync(projectId = null) {
  if (!isSupabaseConfigured()) return;
  const pid = projectId || getActiveProjectId();
  if (syncTimers.chat) clearTimeout(syncTimers.chat);
  syncTimers.chat = setTimeout(() => {
    syncTimers.chat = null;
    syncChatNow(pid).catch(err => console.warn('[CloudModulesSync] Error sync chat:', err));
  }, 900);
}

export async function syncChatNow(projectId = null) {
  if (!isSupabaseConfigured()) return false;
  const pid = projectId || getActiveProjectId();
  const cloudId = resolveCloudProjectUuid(pid);
  if (!cloudId) return false;

  const raw = localStorage.getItem(`adm_arq_project_chat_${pid}`);
  if (!raw) return false;

  let list;
  try {
    list = JSON.parse(raw);
  } catch (_) {
    return false;
  }
  if (!Array.isArray(list)) return false;

  const filteredList = list.filter(m => m && m.id && !String(m.id).startsWith('seed_msg_') && !String(m.id).startsWith('__'));
  if (filteredList.length > 0) {
    const rows = filteredList.map(m => {
      const cleanMsg = stripInlineBinaryPayloads(m);
      const cleanId = normalizeChatId(m.id);
      cleanMsg.id = cleanId;
      delete cleanMsg.localReadBy;
      delete cleanMsg.localDismissedBy;
      cleanMsg.perUserRead = true;
      cleanMsg.isRead = false;
      cleanMsg.dismissed = false;
      cleanMsg.readBy = [];
      const rowId = `${cloudId}__${cleanId}`;
      return {
        id: rowId,
        proyecto_id: cloudId,
        autor_nombre: String(m.authorName || '').slice(0, 255),
        autor_email: String(m.authorEmail || '').slice(0, 255),
        autor_avatar: (m.authorAvatar && !String(m.authorAvatar).startsWith('data:')) ? m.authorAvatar : '',
        autor_avatar_url: (m.authorAvatar && !String(m.authorAvatar).startsWith('data:')) ? m.authorAvatar : '',
        mensaje: m.text || '',
        partida_id: m.partidaId ? String(m.partidaId).slice(0, 100) : null,
        etiquetas: Array.isArray(m.mentions) ? m.mentions : [],
        adjuntos: Array.isArray(cleanMsg.attachments) ? cleanMsg.attachments : [],
        payload_json: cleanMsg,
        created_at: m.createdAt || new Date(m.time || Date.now()).toISOString(),
        updated_at: new Date().toISOString()
      };
    });
    await upsertChatRowsResilient(supabase, rows);
  }

  return true;
}

// ==========================================
// 6. HIDRATACIÓN INTEGRAL DESDE SUPABASE AL ABRIR PROYECTO
// ==========================================
export async function hydrateProjectModulesFromCloud(projectId = null, opts = {}) {
  if (!isSupabaseConfigured()) return false;
  const pid = projectId || getActiveProjectId();
  const cloudId = resolveCloudProjectUuid(pid);
  if (!cloudId) return false;

  const cacheKey = `${pid}:${cloudId}`;
  const inFlight = inFlightModuleHydrateByProject.get(cacheKey);
  if (inFlight) return inFlight;
  const now = Date.now();
  const lastAt = lastModuleHydrateAtByProject.get(cacheKey) || 0;
  if (!opts?.force && (now - lastAt) < MODULE_HYDRATE_COOLDOWN_MS) {
    return false;
  }
  lastModuleHydrateAtByProject.set(cacheKey, now);

  const runPromise = (async () => {
    try {
    const [
      bitCfgRes,
      bitNotasRes,
      expRes,
      provRes,
      estRes,
      cronoRes,
      chatRes
    ] = await Promise.all([
      supabase.from('bitacora_config').select('*').eq('proyecto_id', cloudId).maybeSingle(),
      supabase.from('bitacora_notas').select('*').eq('proyecto_id', cloudId).order('folio', { ascending: false }),
      supabase.from('compras_gastos').select('*').eq('proyecto_id', cloudId),
      supabase.from('proveedores').select('*').eq('proyecto_id', cloudId),
      supabase.from('estimaciones').select('*').eq('proyecto_id', cloudId).order('numero', { ascending: true }),
      supabase.from('cronograma_config').select('*').eq('proyecto_id', cloudId).maybeSingle(),
      supabase.from('chat_mensajes').select('*').eq('proyecto_id', cloudId).order('created_at', { ascending: true })
    ]);

    let changed = false;

    // 1. Seguimiento / Bitácora
    const hasBitCfg = bitCfgRes.data && !bitCfgRes.error;
    const hasBitNotas = Array.isArray(bitNotasRes.data) && bitNotasRes.data.length > 0;
    if (hasBitCfg || hasBitNotas) {
      let localBit = { general: {}, notas: [] };
      try {
        const rawB = localStorage.getItem(`adm_arq_seguimiento_${pid}`)
          || localStorage.getItem(`adm_arq_bitacora_${pid}`);
        if (rawB) localBit = JSON.parse(rawB);
      } catch (_) {}

      const cfgJson = (hasBitCfg && bitCfgRes.data.config_json && typeof bitCfgRes.data.config_json === 'object')
        ? bitCfgRes.data.config_json
        : {};

      if (hasBitCfg) {
        const c = bitCfgRes.data;
        localBit = {
          ...localBit,
          ...cfgJson,
          general: {
            ...(localBit.general || {}),
            ...(cfgJson.general || {}),
            nombreObra: c.titulo_obra || cfgJson.general?.nombreObra || localBit.general?.nombreObra || '',
            directorResponsable: c.contratista || cfgJson.general?.directorResponsable || localBit.general?.directorResponsable || '',
            residenteObra: c.residente_nombre || cfgJson.general?.residenteObra || localBit.general?.residenteObra || '',
            supervisorCliente: c.supervisor_nombre || cfgJson.general?.supervisorCliente || localBit.general?.supervisorCliente || '',
            numeroContrato: c.contrato_num || cfgJson.general?.numeroContrato || localBit.general?.numeroContrato || '',
            ubicacionExacta: c.supervision || cfgJson.general?.ubicacionExacta || localBit.general?.ubicacionExacta || ''
          }
        };
      }

      if (hasBitNotas) {
        const localMap = new Map((localBit.notas || []).map(n => [String(n.id), n]));
        localBit.notas = bitNotasRes.data.map(row => {
          const base = (row.payload_json && typeof row.payload_json === 'object') ? row.payload_json : {};
          const rawId = base.id || String(row.id).replace(`${cloudId}__`, '');
          const prev = localMap.get(String(rawId)) || {};
          return {
            ...prev,
            ...base,
            id: rawId,
            folio: row.folio ?? base.folio ?? 1,
            fecha: row.fecha || base.fecha || '',
            autor: row.autor_nombre || base.autor || '',
            clasificacion: row.clasificacion || base.clasificacion || 'apertura',
            titulo: row.titulo || base.titulo || '',
            descripcion: row.contenido || base.descripcion || '',
            estatusFirma: row.estado || base.estatusFirma || 'firmada',
            evidencias: (Array.isArray(prev.evidencias) && prev.evidencias.length > 0)
              ? prev.evidencias
              : (Array.isArray(row.fotos) ? row.fotos : (base.evidencias || []))
          };
        });
      }

      const serializedBit = JSON.stringify(localBit);
      localStorage.setItem(`adm_arq_seguimiento_${pid}`, serializedBit);
      localStorage.setItem(`adm_arq_bitacora_${pid}`, serializedBit);
      changed = true;
    } else if (localStorage.getItem(`adm_arq_seguimiento_${pid}`) || localStorage.getItem(`adm_arq_bitacora_${pid}`)) {
      syncBitacoraNow(pid).catch(() => {});
    }

    // 2. Compras y Proveedores
    const hasExp = Array.isArray(expRes.data) && expRes.data.length > 0;
    const hasProv = Array.isArray(provRes.data) && provRes.data.length > 0;
    if (hasExp || hasProv) {
      let localCompras = [];
      let localProveedores = [];
      try {
        const rawC = localStorage.getItem(`adm_arq_compras_${pid}`);
        if (rawC) {
          const parsedC = JSON.parse(rawC);
          localCompras = Array.isArray(parsedC) ? parsedC : (Array.isArray(parsedC?.expenses) ? parsedC.expenses : []);
        }
      } catch (_) {}
      try {
        const rawP = localStorage.getItem(`adm_arq_proveedores_${pid}`);
        if (rawP) {
          const parsedP = JSON.parse(rawP);
          localProveedores = Array.isArray(parsedP) ? parsedP : (Array.isArray(parsedP?.proveedores) ? parsedP.proveedores : []);
        }
      } catch (_) {}

      if (hasExp) {
        const localExpMap = new Map(localCompras.map(e => [String(e.id), e]));
        localCompras = expRes.data.map(row => {
          const base = (row.payload_json && typeof row.payload_json === 'object') ? row.payload_json : {};
          const rawId = base.id || String(row.id).replace(`${cloudId}__`, '');
          const prev = localExpMap.get(String(rawId)) || {};
          return {
            ...prev,
            ...base,
            id: rawId,
            fecha: row.fecha || base.fecha || '',
            folio: row.folio_factura || base.folio || '',
            proveedor: base.proveedor || row.proveedor_id || '',
            concepto: row.descripcion || base.concepto || '',
            categoria: row.categoria || base.categoria || 'Materiales',
            partidaId: row.concepto_id || base.partidaId || 'general',
            metodoPago: row.metodo_pago || base.metodoPago || 'Transferencia',
            estatus: row.estado || base.estatus || 'Pagado',
            subtotal: Number(row.subtotal ?? base.subtotal ?? 0),
            iva: Number(row.iva ?? base.iva ?? 0),
            total: Number(row.total ?? base.total ?? 0),
            comprobante: prev.comprobante || base.comprobante || row.evidencia_json || null
          };
        });
        localStorage.setItem(`adm_arq_compras_${pid}`, JSON.stringify(localCompras));
      }

      if (hasProv) {
        const localProvMap = new Map(localProveedores.map(p => [String(p.id), p]));
        localProveedores = provRes.data.map(row => {
          const base = (row.payload_json && typeof row.payload_json === 'object') ? row.payload_json : {};
          const rawId = base.id || String(row.id).replace(`${cloudId}__`, '');
          const prev = localProvMap.get(String(rawId)) || {};
          return {
            ...prev,
            ...base,
            id: rawId,
            nombre: row.nombre || base.nombre || '',
            rfc: row.rfc || base.rfc || '',
            especialidad: row.categoria || base.especialidad || 'Materiales',
            telefono: row.telefono || base.telefono || '',
            email: row.email || base.email || '',
            notas: row.notas || base.notas || ''
          };
        });
        localStorage.setItem(`adm_arq_proveedores_${pid}`, JSON.stringify(localProveedores));
      }

      localStorage.setItem(`expenses_control_${pid}`, JSON.stringify({
        expenses: localCompras,
        proveedores: localProveedores
      }));
      changed = true;
    } else if (localStorage.getItem(`adm_arq_compras_${pid}`) || localStorage.getItem(`adm_arq_proveedores_${pid}`)) {
      syncExpensesNow(pid).catch(() => {});
    }

    // 3. Estimaciones
    if (Array.isArray(estRes.data) && estRes.data.length > 0) {
      let localEst = { anticipoPct: 30, retencionPct: 0, estimaciones: [] };
      try {
        const rawEst = localStorage.getItem(`estimaciones_arq_data_${pid}`)
          || localStorage.getItem(`estimaciones_data_${pid}`);
        if (rawEst) localEst = JSON.parse(rawEst);
      } catch (_) {}

      const cfgRow = estRes.data.find(r => r.numero === 0 || r.nombre === '__CONFIG__' || r.resumen?.isConfigRow);
      if (cfgRow) {
        const resCfg = (cfgRow.resumen && typeof cfgRow.resumen === 'object') ? cfgRow.resumen : {};
        localEst.anticipoPct = resCfg.anticipoPct !== undefined ? Number(resCfg.anticipoPct) : 30;
        localEst.retencionPct = resCfg.retencionPct !== undefined ? Number(resCfg.retencionPct) : 0;
        if (resCfg.anticipoPagado !== undefined) localEst.anticipoPagado = Number(resCfg.anticipoPagado) || 0;
        if (cfgRow.notas || resCfg.notasGenerales) localEst.notasGenerales = cfgRow.notas || resCfg.notasGenerales || '';
      }

      const estRows = estRes.data.filter(r => r.numero !== 0 && r.nombre !== '__CONFIG__' && !r.resumen?.isConfigRow);
      localEst.estimaciones = estRows.map(row => {
        const base = (row.detalles_json && typeof row.detalles_json === 'object') ? row.detalles_json : {};
        const rawId = base.id || row.id;
        return {
          ...base,
          id: rawId,
          cloudUuid: row.id,
          numero: Number(row.numero ?? base.numero ?? 1),
          titulo: row.nombre || base.titulo || `Estimación #${row.numero || 1}`,
          periodoInicio: row.fecha_inicio || base.periodoInicio || base.fechaInicio || '',
          periodoFin: row.fecha_corte || row.fecha_fin || base.periodoFin || base.fechaCorte || '',
          fechaInicio: row.fecha_inicio || base.fechaInicio || base.periodoInicio || '',
          fechaCorte: row.fecha_corte || row.fecha_fin || base.fechaCorte || base.periodoFin || '',
          estado: row.estado || base.estado || base.estatus || 'borrador',
          estatus: row.estado || base.estatus || base.estado || 'borrador',
          observaciones: row.notas || base.observaciones || base.notas || '',
          notas: row.notas || base.notas || base.observaciones || '',
          locked: Boolean(row.locked ?? base.locked),
          avances: base.avances || {},
          items: Array.isArray(base.items) ? base.items : []
        };
      });

      const serializedEst = JSON.stringify(localEst);
      localStorage.setItem(`estimaciones_arq_data_${pid}`, serializedEst);
      localStorage.setItem(`estimaciones_data_${pid}`, serializedEst);
      changed = true;
    } else if (localStorage.getItem(`estimaciones_arq_data_${pid}`) || localStorage.getItem(`estimaciones_data_${pid}`)) {
      syncEstimacionesNow(pid).catch(() => {});
    }

    // 4. Cronograma y Candados de Pestañas
    if (cronoRes.data && !cronoRes.error) {
      const cfg = (cronoRes.data.config_json && typeof cronoRes.data.config_json === 'object') ? cronoRes.data.config_json : {};
      if (cfg.schedule_cfg && Object.keys(cfg.schedule_cfg).length > 0) {
        const sJson = JSON.stringify(cfg.schedule_cfg);
        localStorage.setItem(`calendario_arq_cfg_${pid}`, sJson);
        localStorage.setItem(`calendario_cfg_${pid}`, sJson);
        changed = true;
      }
      if (cfg.workdays_cfg && Object.keys(cfg.workdays_cfg).length > 0) {
        const wJson = JSON.stringify(cfg.workdays_cfg);
        localStorage.setItem(`calendario_arq_workdays_${pid}`, wJson);
        localStorage.setItem(`calendario_workdays_${pid}`, wJson);
        changed = true;
      }
      if (cfg.tab_locks && Object.keys(cfg.tab_locks).length > 0) {
        localStorage.setItem(`adm_arq_tab_locks_${pid}`, JSON.stringify(cfg.tab_locks));
        changed = true;
      }
    } else if (
      localStorage.getItem(`calendario_arq_cfg_${pid}`)
      || localStorage.getItem(`calendario_cfg_${pid}`)
      || localStorage.getItem(`calendario_arq_workdays_${pid}`)
      || localStorage.getItem(`calendario_workdays_${pid}`)
    ) {
      syncCronogramaNow(pid).catch(() => {});
    }

    // 5. Chat de Obra
    if (Array.isArray(chatRes.data) && chatRes.data.length > 0) {
      let localChat = [];
      try {
        const rawChat = localStorage.getItem(`adm_arq_project_chat_${pid}`);
        if (rawChat) localChat = JSON.parse(rawChat);
        if (!Array.isArray(localChat)) localChat = [];
      } catch (_) {
        localChat = [];
      }

      const localMap = new Map();
      localChat.forEach(m => {
        if (!m || !m.id) return;
        const cid = normalizeChatId(m.id);
        if (!cid || cid.startsWith('seed_msg_')) return;
        localMap.set(cid, { ...m, id: cid });
      });

      const mergedMap = new Map();
      chatRes.data.forEach(row => {
        if (!row || (row.id && String(row.id).startsWith('__'))) return;
        const base = (row.payload_json && typeof row.payload_json === 'object') ? row.payload_json : {};
        const rawId = normalizeChatId(base.id || row.id);
        if (!rawId || rawId.startsWith('seed_msg_')) return;
        const prev = localMap.get(rawId) || null;
        const cleanBase = { ...base };
        if (cleanBase.perUserRead) {
          delete cleanBase.isRead;
          delete cleanBase.dismissed;
          delete cleanBase.readBy;
        }
        const remoteMentions = (Array.isArray(base.mentions) && base.mentions.length > 0)
          ? base.mentions
          : (Array.isArray(row.etiquetas) ? row.etiquetas : []);

        const combined = {
          ...cleanBase,
          id: rawId,
          partidaId: row.partida_id ?? base.partidaId ?? null,
          partidaClave: base.partidaClave || 'GENERAL',
          partidaNombre: base.partidaNombre || 'General de Obra',
          authorEmail: row.autor_email || base.authorEmail || '',
          authorName: row.autor_nombre || base.authorName || '',
          authorAvatar: (prev && prev.authorAvatar) || row.autor_avatar_url || row.autor_avatar || base.authorAvatar || '',
          text: row.mensaje ?? base.text ?? '',
          mentions: remoteMentions,
          attachments: (prev && Array.isArray(prev.attachments) && prev.attachments.length > 0)
            ? prev.attachments
            : (Array.isArray(row.adjuntos) ? row.adjuntos : (base.attachments || [])),
          createdAt: row.created_at || base.createdAt || new Date().toISOString(),
          perUserRead: Boolean((prev && prev.perUserRead) || base.perUserRead),
          isRead: prev ? Boolean(prev.isRead) : (base.perUserRead ? false : Boolean(base.isRead)),
          dismissed: prev ? Boolean(prev.dismissed) : (base.perUserRead ? false : Boolean(base.dismissed)),
          readBy: prev
            ? (Array.isArray(prev.readBy) ? prev.readBy.filter(r => r !== '__all__') : [])
            : (!base.perUserRead && Array.isArray(base.readBy) ? base.readBy : []),
          ...(prev && prev.localReadBy ? { localReadBy: prev.localReadBy } : {}),
          ...(prev && prev.localDismissedBy ? { localDismissedBy: prev.localDismissedBy } : {})
        };
        mergedMap.set(rawId, combined);
      });

      for (const [mId, m] of localMap.entries()) {
        if (!mergedMap.has(mId)) mergedMap.set(mId, m);
      }

      const merged = Array.from(mergedMap.values()).sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      localStorage.setItem(`adm_arq_project_chat_${pid}`, JSON.stringify(merged));
      changed = true;
    } else if (localStorage.getItem(`adm_arq_project_chat_${pid}`)) {
      syncChatNow(pid).catch(() => {});
    }

    if (changed && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cubikar:cloud-modules-hydrated', { detail: { projectId: pid, cloudId } }));
    }

    return changed;
  } catch (err) {
    console.warn('[CloudModulesSync] Error hidratando módulos desde Supabase:', err);
    return false;
  }
  })();
  inFlightModuleHydrateByProject.set(cacheKey, runPromise);
  try {
    return await runPromise;
  } finally {
    inFlightModuleHydrateByProject.delete(cacheKey);
  }
}
