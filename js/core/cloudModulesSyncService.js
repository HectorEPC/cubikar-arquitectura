// js/core/cloudModulesSyncService.js
// Sincronización integral de módulos operativos con Supabase (ADM_ARQ):
// Seguimiento/Bitácora, Compras/Proveedores, Estimaciones, Cronograma/Calendario y Chat de Obra.

import { getActiveProjectId } from '../config/constants.js?v=20261116_cf9';
import { supabase, isSupabaseConfigured } from './supabaseClient.js?v=20261116_cf9';
import { isValidUUID } from './cloudProjectService.js?v=20261116_cf9';
import { getProjectById } from '../modules/portal/projectService.js?v=20261116_cf9';

const syncTimers = {
  bitacora: null,
  expenses: null,
  estimaciones: null,
  cronograma: null,
  chat: null
};

function resolveCloudProjectUuid(projectId = null) {
  const pid = projectId || getActiveProjectId();
  if (!pid || pid === 'default') return null;
  if (isValidUUID(pid)) return pid;
  const proj = getProjectById(pid);
  if (proj && isValidUUID(proj.cloudId)) return proj.cloudId;
  if (proj && isValidUUID(proj.id)) return proj.id;
  return null;
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

  const g = data.general || {};
  const extraDatos = stripInlineBinaryPayloads({
    ...data,
    general: g
  });
  delete extraDatos.notas;

  const configPayload = {
    proyecto_id: cloudId,
    director_responsable: g.directorResponsable || '',
    residente_obra: g.residenteObra || '',
    supervisor_cliente: g.supervisorCliente || '',
    numero_licencia: g.numeroLicencia || '',
    numero_contrato: g.numeroContrato || '',
    ubicacion_exacta: g.ubicacionExacta || '',
    datos_json: extraDatos,
    updated_at: new Date().toISOString()
  };

  await supabase.from('bitacora_config').upsert(configPayload, { onConflict: 'proyecto_id' });

  const notas = Array.isArray(data.notas) ? data.notas : [];
  const localIds = new Set();

  if (notas.length > 0) {
    const rows = notas.map(n => {
      const cleanNota = stripInlineBinaryPayloads(n);
      const rowId = `${cloudId}__${n.id}`;
      localIds.add(rowId);
      return {
        id: rowId,
        proyecto_id: cloudId,
        folio: Number(n.folio) || 1,
        fecha: n.fecha || '',
        hora: n.hora || '',
        autor: n.autor || '',
        cargo: n.cargo || '',
        clasificacion: n.clasificacion || 'apertura',
        titulo: n.titulo || '',
        clima: n.clima || 'soleado',
        temperatura: n.temperatura || '',
        fuerza_trabajo: n.fuerzaTrabajo || '',
        equipo_maquinaria: n.equipoMaquinaria || '',
        partidas_relacionadas: Array.isArray(n.partidasRelacionadas) ? n.partidasRelacionadas : [],
        descripcion: n.descripcion || '',
        acuerdos: n.acuerdos || '',
        estatus_firma: n.estatusFirma || 'firmada',
        creado_en: n.creadoEn || new Date().toISOString(),
        datos_json: cleanNota,
        updated_at: new Date().toISOString()
      };
    });
    await supabase.from('bitacora_notas').upsert(rows, { onConflict: 'id' });
  }

  // Eliminar notas borradas localmente
  try {
    const { data: existingRows } = await supabase
      .from('bitacora_notas')
      .select('id')
      .eq('proyecto_id', cloudId);
    if (Array.isArray(existingRows)) {
      const toDelete = existingRows.map(r => r.id).filter(id => !localIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('bitacora_notas').delete().eq('proyecto_id', cloudId).in('id', toDelete);
      }
    }
  } catch (_) {}

  return true;
}

// ==========================================
// 2. COMPRAS, GASTOS Y PROVEEDORES
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

  if (!rawCompras && !rawProveedores && !rawCombined) return false;

  let expenses = [];
  let proveedores = [];

  try {
    if (rawCompras) {
      const parsedC = JSON.parse(rawCompras);
      expenses = Array.isArray(parsedC) ? parsedC : (Array.isArray(parsedC?.expenses) ? parsedC.expenses : []);
    } else if (rawCombined) {
      const parsedComb = JSON.parse(rawCombined);
      expenses = Array.isArray(parsedComb?.expenses) ? parsedComb.expenses : [];
    }
  } catch (_) {}

  try {
    if (rawProveedores) {
      const parsedP = JSON.parse(rawProveedores);
      proveedores = Array.isArray(parsedP) ? parsedP : (Array.isArray(parsedP?.proveedores) ? parsedP.proveedores : []);
    } else if (rawCombined) {
      const parsedComb = JSON.parse(rawCombined);
      proveedores = Array.isArray(parsedComb?.proveedores) ? parsedComb.proveedores : [];
    }
  } catch (_) {}

  const localExpIds = new Set();
  if (expenses.length > 0) {
    const expRows = expenses.map(e => {
      const cleanExp = stripInlineBinaryPayloads(e);
      const rowId = `${cloudId}__${e.id}`;
      localExpIds.add(rowId);
      return {
        id: rowId,
        proyecto_id: cloudId,
        fecha: e.fecha || '',
        folio: e.folio || '',
        proveedor: e.proveedor || '',
        rfc: e.rfc || '',
        concepto: e.concepto || '',
        categoria: e.categoria || 'Materiales',
        partida_id: e.partidaId || 'general',
        partida_nombre: e.partidaNombre || 'Gasto General de Obra',
        metodo_pago: e.metodoPago || 'Transferencia',
        estatus: e.estatus || 'Pagado',
        subtotal: Number(e.subtotal) || 0,
        iva: Number(e.iva) || 0,
        total: Number(e.total) || 0,
        notas: e.notas || '',
        creado_en: e.creadoEn || new Date().toISOString(),
        datos_json: cleanExp,
        updated_at: new Date().toISOString()
      };
    });
    await supabase.from('compras_gastos').upsert(expRows, { onConflict: 'id' });
  }

  try {
    const { data: existingExp } = await supabase
      .from('compras_gastos')
      .select('id')
      .eq('proyecto_id', cloudId);
    if (Array.isArray(existingExp)) {
      const toDelete = existingExp.map(r => r.id).filter(id => !localExpIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('compras_gastos').delete().eq('proyecto_id', cloudId).in('id', toDelete);
      }
    }
  } catch (_) {}

  const localProvIds = new Set();
  if (proveedores.length > 0) {
    const provRows = proveedores.map(p => {
      const cleanProv = stripInlineBinaryPayloads(p);
      const rowId = `${cloudId}__${p.id}`;
      localProvIds.add(rowId);
      return {
        id: rowId,
        proyecto_id: cloudId,
        nombre: p.nombre || p.proveedor || '',
        razon_social: p.razonSocial || '',
        rfc: p.rfc || '',
        especialidad: p.especialidad || 'Materiales',
        contacto: p.contacto || '',
        telefono: p.telefono || '',
        email: p.email || '',
        direccion: p.direccion || '',
        banco: p.banco || '',
        clabe: p.clabe || '',
        cuenta: p.cuenta || '',
        dias_credito: Number(p.diasCredito) || 0,
        limite_credito: Number(p.limiteCredito) || 0,
        calificacion: Number(p.calificacion) || 5,
        estatus: p.estatus || 'Activo',
        notas: p.notas || '',
        creado_en: p.creadoEn || new Date().toISOString(),
        datos_json: cleanProv,
        updated_at: new Date().toISOString()
      };
    });
    await supabase.from('proveedores').upsert(provRows, { onConflict: 'id' });
  }

  try {
    const { data: existingProv } = await supabase
      .from('proveedores')
      .select('id')
      .eq('proyecto_id', cloudId);
    if (Array.isArray(existingProv)) {
      const toDelete = existingProv.map(r => r.id).filter(id => !localProvIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('proveedores').delete().eq('proyecto_id', cloudId).in('id', toDelete);
      }
    }
  } catch (_) {}

  return true;
}

// ==========================================
// 3. ESTIMACIONES Y AVANCE FINANCIERO
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

  const anticipoPct = data.anticipoPct !== undefined && data.anticipoPct !== null ? Number(data.anticipoPct) : 30;
  const retencionPct = data.retencionPct !== undefined && data.retencionPct !== null ? Number(data.retencionPct) : 0;

  const rows = [];
  const localRowIds = new Set();

  // Fila maestra de configuración de estimaciones
  const cfgId = `__CONFIG__${cloudId}`;
  localRowIds.add(cfgId);
  rows.push({
    id: cfgId,
    proyecto_id: cloudId,
    numero: 0,
    titulo: '__CONFIG__',
    estatus: 'config',
    anticipo_pct: anticipoPct,
    retencion_pct: retencionPct,
    datos_json: {
      isConfig: true,
      anticipoPct,
      retencionPct,
      anticipoPagado: Number(data.anticipoPagado) || 0,
      notasGenerales: data.notasGenerales || ''
    },
    updated_at: new Date().toISOString()
  });

  const list = Array.isArray(data.estimaciones) ? data.estimaciones : [];
  list.forEach(est => {
    const cleanEst = stripInlineBinaryPayloads(est);
    const rowId = `${cloudId}__${est.id}`;
    localRowIds.add(rowId);
    rows.push({
      id: rowId,
      proyecto_id: cloudId,
      numero: Number(est.numero) || 1,
      titulo: est.titulo || `Estimación #${est.numero || 1}`,
      fecha_inicio: est.periodoInicio || est.fechaInicio || '',
      fecha_corte: est.periodoFin || est.fechaCorte || '',
      estatus: est.estatus || est.estado || 'borrador',
      notas: est.observaciones || est.notas || '',
      anticipo_pct: anticipoPct,
      retencion_pct: retencionPct,
      conceptos_avance: est.avances || est.items || {},
      datos_json: cleanEst,
      creado_en: est.fechaCreacion || est.creadoEn || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  });

  await supabase.from('estimaciones').upsert(rows, { onConflict: 'id' });

  try {
    const { data: existingEst } = await supabase
      .from('estimaciones')
      .select('id')
      .eq('proyecto_id', cloudId);
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

  await supabase.from('cronograma_config').upsert({
    proyecto_id: cloudId,
    schedule_cfg: scheduleCfg || {},
    workdays_cfg: workdaysCfg || {},
    tab_locks: tabLocks || {},
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

  const localRowIds = new Set();
  const localRawIds = new Set();

  if (list.length > 0) {
    const rows = list.map(m => {
      const cleanMsg = stripInlineBinaryPayloads(m);
      const cleanId = normalizeChatId(m.id);
      cleanMsg.id = cleanId;
      const rowId = `${cloudId}__${cleanId}`;
      localRowIds.add(rowId);
      localRawIds.add(cleanId);
      return {
        id: rowId,
        proyecto_id: cloudId,
        partida_id: m.partidaId || '__GENERAL__',
        partida_clave: m.partidaClave || 'GENERAL',
        partida_nombre: m.partidaNombre || 'General de Obra',
        autor_email: m.authorEmail || '',
        autor_nombre: m.authorName || '',
        autor_avatar: (m.authorAvatar && !String(m.authorAvatar).startsWith('data:')) ? m.authorAvatar : '',
        texto: m.text || '',
        menciones: Array.isArray(m.mentions) ? m.mentions : [],
        adjuntos: Array.isArray(cleanMsg.attachments) ? cleanMsg.attachments : [],
        datos_json: cleanMsg,
        creado_en: m.createdAt || new Date(m.time || Date.now()).toISOString()
      };
    });
    await supabase.from('chat_mensajes').upsert(rows, { onConflict: 'id' });
  }

  try {
    const { data: existingChat } = await supabase
      .from('chat_mensajes')
      .select('id')
      .eq('proyecto_id', cloudId);
    if (Array.isArray(existingChat)) {
      const toDelete = existingChat
        .map(r => r.id)
        .filter(id => !localRowIds.has(id) && !localRawIds.has(normalizeChatId(id)));
      if (toDelete.length > 0) {
        await supabase.from('chat_mensajes').delete().eq('proyecto_id', cloudId).in('id', toDelete);
      }
    }
  } catch (_) {}

  return true;
}

// ==========================================
// 6. HIDRATACIÓN INTEGRAL DESDE SUPABASE AL ABRIR PROYECTO
// ==========================================
export async function hydrateProjectModulesFromCloud(projectId = null) {
  if (!isSupabaseConfigured()) return false;
  const pid = projectId || getActiveProjectId();
  const cloudId = resolveCloudProjectUuid(pid);
  if (!cloudId) return false;

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
      supabase.from('chat_mensajes').select('*').eq('proyecto_id', cloudId).order('creado_en', { ascending: true })
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

      const cfgJson = (hasBitCfg && bitCfgRes.data.datos_json && typeof bitCfgRes.data.datos_json === 'object')
        ? bitCfgRes.data.datos_json
        : {};

      if (hasBitCfg) {
        const c = bitCfgRes.data;
        localBit = {
          ...localBit,
          ...cfgJson,
          general: {
            ...(localBit.general || {}),
            ...(cfgJson.general || {}),
            directorResponsable: c.director_responsable || cfgJson.general?.directorResponsable || localBit.general?.directorResponsable || '',
            residenteObra: c.residente_obra || cfgJson.general?.residenteObra || localBit.general?.residenteObra || '',
            supervisorCliente: c.supervisor_cliente || cfgJson.general?.supervisorCliente || localBit.general?.supervisorCliente || '',
            numeroLicencia: c.numero_licencia || cfgJson.general?.numeroLicencia || localBit.general?.numeroLicencia || '',
            numeroContrato: c.numero_contrato || cfgJson.general?.numeroContrato || localBit.general?.numeroContrato || '',
            ubicacionExacta: c.ubicacion_exacta || cfgJson.general?.ubicacionExacta || localBit.general?.ubicacionExacta || ''
          }
        };
      }

      if (hasBitNotas) {
        const localMap = new Map((localBit.notas || []).map(n => [String(n.id), n]));
        localBit.notas = bitNotasRes.data.map(row => {
          const base = (row.datos_json && typeof row.datos_json === 'object') ? row.datos_json : {};
          const rawId = base.id || String(row.id).replace(`${cloudId}__`, '');
          const prev = localMap.get(String(rawId)) || {};
          return {
            ...prev,
            ...base,
            id: rawId,
            folio: row.folio ?? base.folio ?? 1,
            fecha: row.fecha || base.fecha || '',
            hora: row.hora || base.hora || '',
            autor: row.autor || base.autor || '',
            cargo: row.cargo || base.cargo || '',
            clasificacion: row.clasificacion || base.clasificacion || 'apertura',
            titulo: row.titulo || base.titulo || '',
            clima: row.clima || base.clima || 'soleado',
            temperatura: row.temperatura || base.temperatura || '',
            fuerzaTrabajo: row.fuerza_trabajo || base.fuerzaTrabajo || '',
            equipoMaquinaria: row.equipo_maquinaria || base.equipoMaquinaria || '',
            partidasRelacionadas: Array.isArray(row.partidas_relacionadas) ? row.partidas_relacionadas : (base.partidasRelacionadas || []),
            descripcion: row.descripcion || base.descripcion || '',
            acuerdos: row.acuerdos || base.acuerdos || '',
            estatusFirma: row.estatus_firma || base.estatusFirma || 'firmada',
            evidencias: (Array.isArray(prev.evidencias) && prev.evidencias.length > 0) ? prev.evidencias : (base.evidencias || [])
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
          const base = (row.datos_json && typeof row.datos_json === 'object') ? row.datos_json : {};
          const rawId = base.id || String(row.id).replace(`${cloudId}__`, '');
          const prev = localExpMap.get(String(rawId)) || {};
          return {
            ...prev,
            ...base,
            id: rawId,
            fecha: row.fecha || base.fecha || '',
            folio: row.folio || base.folio || '',
            proveedor: row.proveedor || base.proveedor || '',
            rfc: row.rfc || base.rfc || '',
            concepto: row.concepto || base.concepto || '',
            categoria: row.categoria || base.categoria || 'Materiales',
            partidaId: row.partida_id || base.partidaId || 'general',
            partidaNombre: row.partida_nombre || base.partidaNombre || 'Gasto General de Obra',
            metodoPago: row.metodo_pago || base.metodoPago || 'Transferencia',
            estatus: row.estatus || base.estatus || 'Pagado',
            subtotal: Number(row.subtotal ?? base.subtotal ?? 0),
            iva: Number(row.iva ?? base.iva ?? 0),
            total: Number(row.total ?? base.total ?? 0),
            notas: row.notas || base.notas || '',
            comprobante: prev.comprobante || base.comprobante || null
          };
        });
        localStorage.setItem(`adm_arq_compras_${pid}`, JSON.stringify(localCompras));
      }

      if (hasProv) {
        const localProvMap = new Map(localProveedores.map(p => [String(p.id), p]));
        localProveedores = provRes.data.map(row => {
          const base = (row.datos_json && typeof row.datos_json === 'object') ? row.datos_json : {};
          const rawId = base.id || String(row.id).replace(`${cloudId}__`, '');
          const prev = localProvMap.get(String(rawId)) || {};
          return {
            ...prev,
            ...base,
            id: rawId,
            nombre: row.nombre || base.nombre || '',
            razonSocial: row.razon_social || base.razonSocial || '',
            rfc: row.rfc || base.rfc || '',
            especialidad: row.especialidad || base.especialidad || 'Materiales',
            contacto: row.contacto || base.contacto || '',
            telefono: row.telefono || base.telefono || '',
            email: row.email || base.email || '',
            direccion: row.direccion || base.direccion || '',
            banco: row.banco || base.banco || '',
            clabe: row.clabe || base.clabe || '',
            cuenta: row.cuenta || base.cuenta || '',
            diasCredito: Number(row.dias_credito ?? base.diasCredito ?? 0),
            limiteCredito: Number(row.limite_credito ?? base.limiteCredito ?? 0),
            calificacion: Number(row.calificacion ?? base.calificacion ?? 5),
            estatus: row.estatus || base.estatus || 'Activo',
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

      const cfgRow = estRes.data.find(r => r.id === `__CONFIG__${cloudId}` || r.titulo === '__CONFIG__');
      if (cfgRow) {
        localEst.anticipoPct = cfgRow.anticipo_pct !== undefined && cfgRow.anticipo_pct !== null
          ? Number(cfgRow.anticipo_pct)
          : (cfgRow.datos_json?.anticipoPct ?? 30);
        localEst.retencionPct = cfgRow.retencion_pct !== undefined && cfgRow.retencion_pct !== null
          ? Number(cfgRow.retencion_pct)
          : (cfgRow.datos_json?.retencionPct ?? 0);
        if (cfgRow.datos_json?.anticipoPagado !== undefined) {
          localEst.anticipoPagado = Number(cfgRow.datos_json.anticipoPagado) || 0;
        }
        if (cfgRow.datos_json?.notasGenerales !== undefined) {
          localEst.notasGenerales = cfgRow.datos_json.notasGenerales || '';
        }
      }

      const estRows = estRes.data.filter(r => r.id !== `__CONFIG__${cloudId}` && r.titulo !== '__CONFIG__');
      localEst.estimaciones = estRows.map(row => {
        const base = (row.datos_json && typeof row.datos_json === 'object') ? row.datos_json : {};
        const rawId = base.id || String(row.id).replace(`${cloudId}__`, '');
        return {
          ...base,
          id: rawId,
          numero: Number(row.numero ?? base.numero ?? 1),
          titulo: row.titulo || base.titulo || `Estimación #${row.numero || 1}`,
          periodoInicio: row.fecha_inicio || base.periodoInicio || base.fechaInicio || '',
          periodoFin: row.fecha_corte || base.periodoFin || base.fechaCorte || '',
          fechaInicio: row.fecha_inicio || base.fechaInicio || base.periodoInicio || '',
          fechaCorte: row.fecha_corte || base.fechaCorte || base.periodoFin || '',
          estado: row.estatus || base.estado || base.estatus || 'borrador',
          estatus: row.estatus || base.estatus || base.estado || 'borrador',
          observaciones: row.notas || base.observaciones || base.notas || '',
          notas: row.notas || base.notas || base.observaciones || '',
          avances: (row.conceptos_avance && typeof row.conceptos_avance === 'object' && !Array.isArray(row.conceptos_avance))
            ? row.conceptos_avance
            : (base.avances || {}),
          items: Array.isArray(base.items)
            ? base.items
            : (Array.isArray(row.conceptos_avance) ? row.conceptos_avance : [])
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
      const c = cronoRes.data;
      if (c.schedule_cfg && Object.keys(c.schedule_cfg).length > 0) {
        const sJson = JSON.stringify(c.schedule_cfg);
        localStorage.setItem(`calendario_arq_cfg_${pid}`, sJson);
        localStorage.setItem(`calendario_cfg_${pid}`, sJson);
        changed = true;
      }
      if (c.workdays_cfg && Object.keys(c.workdays_cfg).length > 0) {
        const wJson = JSON.stringify(c.workdays_cfg);
        localStorage.setItem(`calendario_arq_workdays_${pid}`, wJson);
        localStorage.setItem(`calendario_workdays_${pid}`, wJson);
        changed = true;
      }
      if (c.tab_locks && Object.keys(c.tab_locks).length > 0) {
        localStorage.setItem(`adm_arq_tab_locks_${pid}`, JSON.stringify(c.tab_locks));
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

      const localMap = new Map(localChat.map(m => [normalizeChatId(m.id), m]));
      const merged = chatRes.data.map(row => {
        const base = (row.datos_json && typeof row.datos_json === 'object') ? row.datos_json : {};
        const rawId = normalizeChatId(base.id || row.id);
        const prev = localMap.get(rawId) || {};
        return {
          ...prev,
          ...base,
          id: rawId,
          partidaId: row.partida_id || base.partidaId || '__GENERAL__',
          partidaClave: row.partida_clave || base.partidaClave || 'GENERAL',
          partidaNombre: row.partida_nombre || base.partidaNombre || 'General de Obra',
          authorEmail: row.autor_email || base.authorEmail || '',
          authorName: row.autor_nombre || base.authorName || '',
          authorAvatar: prev.authorAvatar || row.autor_avatar || base.authorAvatar || '',
          text: row.texto ?? base.text ?? '',
          mentions: Array.isArray(row.menciones) ? row.menciones : (base.mentions || []),
          attachments: (Array.isArray(prev.attachments) && prev.attachments.length > 0)
            ? prev.attachments
            : (Array.isArray(row.adjuntos) ? row.adjuntos : (base.attachments || [])),
          createdAt: row.creado_en || base.createdAt || new Date().toISOString()
        };
      });

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
}
