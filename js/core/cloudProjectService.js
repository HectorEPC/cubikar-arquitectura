// js/core/cloudProjectService.js
// Servicio de persistencia y sincronización de Proyectos Arquitectónicos y Presupuestos con Supabase PostgreSQL
// Diseñado para operar en segundo plano con alta resiliencia y sincronización multiusuario en la nube.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js?v=20261119_cf35';
import { getCurrentUser, saveCurrentUser, getProjectsList, getUserPlanId, unmarkProjectTrashedLocal, markProjectTrashedLocal } from '../modules/portal/projectService.js?v=20261119_cf35';
import { getSettingsKey } from '../config/constants.js?v=20261119_cf35';
import { fetchUserProfile, resolveUserDisplayName, resolveUserRoleLabel, buildFallbackAvatarSvg } from './authService.js?v=20261119_cf35';
import { showToast } from '../ui/notifications.js?v=20261119_cf35';

function extractArqNodeMeta(node, conceptUuid) {
  if (!node || typeof node !== 'object') return null;
  const meta = {};
  if (node.id && String(node.id) !== String(conceptUuid)) meta.localId = String(node.id);
  if (node.clave !== undefined && node.clave !== null) meta.clave = String(node.clave);
  if (node.alcance !== undefined) meta.alcance = node.alcance;
  if (node.entregables !== undefined) meta.entregables = node.entregables;
  if (node.Modalidad !== undefined) meta.Modalidad = node.Modalidad;
  if (node.modalidad !== undefined) meta.modalidad = node.modalidad;
  if (node.complejidad !== undefined) meta.complejidad = node.complejidad;
  if (node.unidadTiempo !== undefined) meta.unidadTiempo = node.unidadTiempo;
  if (node.horasEstimadas !== undefined) meta.horasEstimadas = node.horasEstimadas;
  if (node.factoresGlobales !== undefined) meta.factoresGlobales = node.factoresGlobales;
  if (node.horasHombre !== undefined) meta.horasHombre = node.horasHombre;
  if (node.costoSubcontrato !== undefined) meta.costoSubcontrato = node.costoSubcontrato;
  if (node.costoHoraPersonalizado !== undefined) meta.costoHoraPersonalizado = node.costoHoraPersonalizado;
  if (node.archivoLink !== undefined) meta.archivoLink = node.archivoLink;
  if (node.esSubtitulo !== undefined) meta.esSubtitulo = node.esSubtitulo;
  if (Array.isArray(node.cotizaciones) && node.cotizaciones.length > 0) meta.cotizaciones = node.cotizaciones;
  if (node.costo_proveedor !== undefined && node.costo_proveedor !== null) meta.costo_proveedor = node.costo_proveedor;
  if (node.proveedorElegidoId) meta.proveedorElegidoId = node.proveedorElegidoId;
  if (node.proveedorElegidoNombre) meta.proveedorElegidoNombre = node.proveedorElegidoNombre;
  if (node.importe_calculado !== undefined && node.importe_calculado !== null) meta.importe_calculado = node.importe_calculado;
  if (node.porcentaje_relativo !== undefined && node.porcentaje_relativo !== null) meta.porcentaje_relativo = node.porcentaje_relativo;
  if (node.porcentaje_global !== undefined && node.porcentaje_global !== null) meta.porcentaje_global = node.porcentaje_global;
  if (node.schedule && typeof node.schedule === 'object') meta.schedule = node.schedule;
  if (node.avancePorcentaje !== undefined && node.avancePorcentaje !== null) meta.avancePorcentaje = node.avancePorcentaje;
  if (node.estatus) meta.estatus = node.estatus;
  if (node.responsableEmail) meta.responsableEmail = node.responsableEmail;
  if (Array.isArray(node.responsableEmails) && node.responsableEmails.length > 0) meta.responsableEmails = node.responsableEmails;
  if (node.userClearedMatrix) meta.userClearedMatrix = true;
  if (node.isMatrixCustomized) meta.isMatrixCustomized = true;
  if (node.aiTips) meta.aiTips = node.aiTips;
  if (Array.isArray(node.googleSearchQueries) && node.googleSearchQueries.length > 0) meta.googleSearchQueries = node.googleSearchQueries;
  if (Array.isArray(node.googleSources) && node.googleSources.length > 0) meta.googleSources = node.googleSources;
  return Object.keys(meta).length > 0 ? meta : null;
}

function buildArqNodesMetaMap(nodes, out = {}) {
  if (!Array.isArray(nodes)) return out;
  for (const n of nodes) {
    if (!n) continue;
    const conceptId = (n.uuid && isValidUUID(n.uuid)) ? n.uuid : (isValidUUID(n.id) ? n.id : generateUUID());
    n.uuid = conceptId;
    const meta = extractArqNodeMeta(n, conceptId);
    if (meta) {
      out[conceptId] = meta;
    }
    if (Array.isArray(n.children) && n.children.length > 0) {
      buildArqNodesMetaMap(n.children, out);
    }
  }
  return out;
}

const knownCloudConceptIdsByProject = new Map();
const tombstonedConceptIdsByProject = new Map();
const syncQueueByProject = new Map();
const projectSyncSlots = new Map();
const conceptMutationQueueByProject = new Map();
const inFlightEmpresaResolveByUser = new Map();
const empresaResolveFailUntilByUser = new Map();
const inFlightTreeLoadByProject = new Map();
let inFlightFetchCloudProjectsPromise = null;
let cachedCloudProjectsList = null;
let cachedCloudProjectsAt = 0;
let cloudProjectsFailUntil = 0;
let cachedTrashedCloudProjects = [];
let trashedCloudProjectIds = new Set();

export function getTrashedCloudProjectIds() {
  return new Set(trashedCloudProjectIds);
}

export function getCachedTrashedCloudProjects() {
  return Array.isArray(cachedTrashedCloudProjects) ? [...cachedTrashedCloudProjects] : [];
}

export function invalidateCloudProjectsCache() {
  cachedCloudProjectsList = null;
  cachedCloudProjectsAt = 0;
  cloudProjectsFailUntil = 0;
}

function enqueueConceptMutation(projectUuid, taskFn) {
  const key = String(projectUuid || '').trim() || '__default__';
  const prev = conceptMutationQueueByProject.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(taskFn);
  const tracked = next.finally(() => {
    if (conceptMutationQueueByProject.get(key) === tracked) conceptMutationQueueByProject.delete(key);
  });
  conceptMutationQueueByProject.set(key, tracked);
  return next;
}

function resolveTrackingKey(projectId) {
  const cloud = resolveCloudProjectId(projectId);
  return cloud || String(projectId || '').trim();
}

export function addKnownCloudConceptIds(projectId, ids) {
  const key = resolveTrackingKey(projectId);
  if (!key || !ids) return;
  if (!knownCloudConceptIdsByProject.has(key)) knownCloudConceptIdsByProject.set(key, new Set());
  const set = knownCloudConceptIdsByProject.get(key);
  const tomb = tombstonedConceptIdsByProject.get(key);
  const arr = Array.isArray(ids) ? ids : [ids];
  arr.forEach((raw) => {
    const id = String(raw || '').trim();
    if (isValidUUID(id)) {
      set.add(id);
      if (tomb) tomb.delete(id);
    }
  });
}

export function markLocalConceptsDeleted(projectId, ids) {
  const key = resolveTrackingKey(projectId);
  if (!key || !ids) return;
  if (!tombstonedConceptIdsByProject.has(key)) tombstonedConceptIdsByProject.set(key, new Set());
  const tomb = tombstonedConceptIdsByProject.get(key);
  const known = knownCloudConceptIdsByProject.get(key);
  const arr = Array.isArray(ids) ? ids : [ids];
  arr.forEach((raw) => {
    const id = String(raw || '').trim();
    if (isValidUUID(id)) {
      tomb.add(id);
      if (known) known.delete(id);
    }
  });
}

export function isConceptConfirmedInCloud(projectId, uuid) {
  const key = resolveTrackingKey(projectId);
  const id = String(uuid || '').trim();
  if (!key || !isValidUUID(id)) return false;
  return Boolean(knownCloudConceptIdsByProject.get(key)?.has(id));
}

function enqueueProjectCloudSync(projectUuid, taskFn) {
  const key = String(projectUuid || '').trim() || '__default__';
  const prev = syncQueueByProject.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(taskFn);
  const tracked = next.finally(() => {
    if (syncQueueByProject.get(key) === tracked) syncQueueByProject.delete(key);
  });
  syncQueueByProject.set(key, tracked);
  return next;
}

function mergeArqMetaSafe(prevMeta = {}, localMeta = {}, projectKey = '', localTree = null) {
  const tomb = tombstonedConceptIdsByProject.get(projectKey) || new Set();
  const merged = { ...prevMeta };
  Object.keys(merged).forEach((k) => {
    if (tomb.has(k)) delete merged[k];
  });
  const localNodeMap = new Map();
  if (Array.isArray(localTree)) {
    const walk = (arr) => arr.forEach((n) => {
      if (!n) return;
      if (n.uuid) localNodeMap.set(n.uuid, n);
      if (Array.isArray(n.children)) walk(n.children);
    });
    walk(localTree);
  }
  for (const [uid, lEntry] of Object.entries(localMeta)) {
    if (tomb.has(uid)) continue;
    const pEntry = (prevMeta[uid] && typeof prevMeta[uid] === 'object') ? prevMeta[uid] : {};
    const combined = { ...pEntry, ...lEntry };
    const localNode = localNodeMap.get(uid);
    // Preservar cotizaciones concurrentes de otro usuario si este nodo local no tiene cotizaciones propias aún
    if ((!Array.isArray(lEntry?.cotizaciones) || lEntry.cotizaciones.length === 0) && Array.isArray(pEntry?.cotizaciones) && pEntry.cotizaciones.length > 0 && !localNode?._deletedAllCotizaciones) {
      combined.cotizaciones = pEntry.cotizaciones;
      if (pEntry.proveedorElegidoId && !combined.proveedorElegidoId) combined.proveedorElegidoId = pEntry.proveedorElegidoId;
      if (pEntry.proveedorElegidoNombre && !combined.proveedorElegidoNombre) combined.proveedorElegidoNombre = pEntry.proveedorElegidoNombre;
      if (pEntry.costo_proveedor !== undefined && combined.costo_proveedor === undefined) combined.costo_proveedor = pEntry.costo_proveedor;
    }
    // Preservar userClearedMatrix remoto si este cliente no ha regenerado insumos propios encima
    if (pEntry?.userClearedMatrix && !lEntry?.userClearedMatrix && (!localNode?.isMatrixCustomized || !localNode?.insumos?.length)) {
      combined.userClearedMatrix = true;
    }
    merged[uid] = combined;
  }
  return merged;
}

export function resolveCloudProjectId(projectId) {
  const raw = String(projectId || '').trim();
  if (!raw) return '';
  if (isValidUUID(raw)) return raw;
  try {
    const list = typeof getProjectsList === 'function' ? getProjectsList() : [];
    const found = Array.isArray(list) ? list.find(p => p && (p.id === raw || p.cloudId === raw)) : null;
    if (found?.cloudId && isValidUUID(found.cloudId)) return found.cloudId;
    if (found?.id && isValidUUID(found.id)) return found.id;
  } catch (_) {}
  return '';
}

export function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str.trim());
}

export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Obtener o resolver la empresa_id del usuario conectado
 */
export async function resolveUserEmpresaId(sb, user) {
  if (!user || !user.id) return null;
  if (user.empresaId && isValidUUID(user.empresaId)) {
    return user.empresaId;
  }

  const uid = String(user.id).trim();
  const failUntil = empresaResolveFailUntilByUser.get(uid) || 0;
  if (failUntil > Date.now()) {
    return null;
  }
  if (inFlightEmpresaResolveByUser.has(uid)) {
    return inFlightEmpresaResolveByUser.get(uid);
  }

  const reqPromise = (async () => {
    try {
      const { data: perfil, error: perfilErr } = await sb
        .from('perfiles')
        .select('id, empresa_id')
        .eq('id', uid)
        .maybeSingle();

      // Si hubo error de red o consulta, NO asumir falta de empresa ni crear registros duplicados
      if (perfilErr) {
        empresaResolveFailUntilByUser.set(uid, Date.now() + 8000);
        return null;
      }

      if (perfil?.empresa_id && isValidUUID(perfil.empresa_id)) {
        user.empresaId = perfil.empresa_id;
        try { saveCurrentUser(user); } catch (_) {}
        return perfil.empresa_id;
      }

      // Solo si perfiles respondió sin error y realmente no tiene empresa asignada, crear una por defecto
      const { data: newEmpresa, error: empErr } = await sb
        .from('empresas')
        .insert({
          nombre: (user.name || user.email || 'Mi Taller') + ' - Arquitectura',
          plan: 'free',
          estado_suscripcion: 'trialing'
        })
        .select('id')
        .single();

      if (!empErr && newEmpresa?.id) {
        user.empresaId = newEmpresa.id;
        try { saveCurrentUser(user); } catch (_) {}
        await sb.from('perfiles').upsert({
          id: uid,
          empresa_id: newEmpresa.id,
          nombre_completo: user.name || user.email,
          email: user.email,
          rol: 'owner'
        });
        return newEmpresa.id;
      }
      if (empErr) {
        empresaResolveFailUntilByUser.set(uid, Date.now() + 8000);
      }
    } catch (err) {
      empresaResolveFailUntilByUser.set(uid, Date.now() + 8000);
      console.warn('[CloudProjectService] Error resolviendo empresa_id:', err);
    }
    return null;
  })();

  inFlightEmpresaResolveByUser.set(uid, reqPromise);
  try {
    return await reqPromise;
  } finally {
    inFlightEmpresaResolveByUser.delete(uid);
  }
}

function resolveProjectSyncKey(project) {
  if (isValidUUID(project?.id)) return project.id;
  if (isValidUUID(project?.cloudId)) return project.cloudId;
  return String(project?.id || '').trim() || '__default__';
}

function hasSettingsPayload(settings) {
  return Boolean(settings && typeof settings === 'object' && Object.keys(settings).length > 0);
}

function mergeQueuedSyncArgs(queued, [project, settings, treeData, opts]) {
  if (typeof opts?.onHeaderSynced === 'function') queued.headerCallbacks.push(opts.onHeaderSynced);
  const [, prevSettings, prevTree, prevOpts] = queued.args;
  queued.args = [
    project,
    hasSettingsPayload(settings) ? settings : prevSettings,
    Array.isArray(treeData) ? treeData : prevTree,
    { ...(prevOpts || {}), ...(opts || {}) }
  ];
}

/**
 * Sincronizar un proyecto completo (datos generales, colaboradores y catálogo de conceptos) hacia Supabase PostgreSQL.
 * Las llamadas para el mismo proyecto se serializan: una llamada que llega mientras otra está en curso
 * espera y se ejecuta una sola vez con los argumentos más recientes.
 */
export function syncProjectToCloud(project, settings = {}, treeData = null, opts = {}) {
  const key = resolveProjectSyncKey(project);
  let slot = projectSyncSlots.get(key);
  if (!slot) {
    slot = { tail: Promise.resolve(), queued: null };
    projectSyncSlots.set(key, slot);
  }
  if (slot.queued) {
    mergeQueuedSyncArgs(slot.queued, [project, settings, treeData, opts]);
    return slot.queued.promise;
  }
  const queued = { args: [project, settings, treeData, opts], headerCallbacks: [] };
  if (typeof opts?.onHeaderSynced === 'function') queued.headerCallbacks.push(opts.onHeaderSynced);
  queued.promise = slot.tail.then(() => {
    if (slot.queued === queued) slot.queued = null;
    const [p, s, t, o] = queued.args;
    const onHeaderSynced = (projectId) => queued.headerCallbacks.forEach((cb) => {
      try { cb(projectId); } catch (_) {}
    });
    return performProjectSync(p, s, t, { ...(o || {}), onHeaderSynced });
  });
  slot.queued = queued;
  const tail = queued.promise.catch(() => {});
  slot.tail = tail;
  tail.then(() => {
    if (slot.tail === tail && !slot.queued) projectSyncSlots.delete(key);
  });
  return queued.promise;
}

async function readCloudProjectOwnership(sb, projectId) {
  try {
    const { data, error } = await sb
      .from('proyectos')
      .select('id, owner_email, creado_por')
      .eq('id', projectId)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch (_) {
    return null;
  }
}

function isCloudRowOwnedBy(row, user) {
  if (!row || !user) return false;
  const myEmail = (user.email || '').toLowerCase().trim();
  const rowOwner = (row.owner_email || '').toLowerCase().trim();
  return Boolean((myEmail && rowOwner === myEmail) || (row.creado_por && row.creado_por === user.id));
}

async function performProjectSync(project, settings = {}, treeData = null, opts = {}) {
  const sb = getSupabaseClient();
  let user = getCurrentUser();

  if (!isSupabaseConfigured() || !sb) {
    return { success: false, reason: 'Supabase no está configurado' };
  }

  // Si el usuario local no tiene un UUID válido, intentar obtener el usuario autenticado real de Supabase
  if (!user || !isValidUUID(user.id)) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) {
        const existingLocal = user;
        const perfil = await fetchUserProfile(session.user.id);
        const resolvedName = resolveUserDisplayName({ perfil, authUser: session.user, existingUser: existingLocal });
        const resolvedRole = perfil?.rol || existingLocal?.role || 'admin';
        const resolvedAvatar = perfil?.avatar_url || session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || existingLocal?.avatar || buildFallbackAvatarSvg(resolvedName, session.user.email);
        user = {
          ...(existingLocal || {}),
          id: session.user.id,
          empresaId: perfil?.empresa_id || existingLocal?.empresaId || null,
          name: resolvedName,
          email: session.user.email,
          avatar: resolvedAvatar,
          role: resolvedRole,
          roleLabel: resolveUserRoleLabel({ roleLabel: existingLocal?.roleLabel, role: resolvedRole, isAuthenticated: true }),
          user_metadata: session.user.user_metadata ? { ...session.user.user_metadata } : (existingLocal?.user_metadata || {})
        };
        saveCurrentUser(user);
      }
    } catch (_) {}
  }

  if (!user?.id || !isValidUUID(user.id)) {
    return { success: false, reason: 'Sin sesión activa en Supabase. Inicia sesión con tu correo y contraseña.' };
  }

  try {
    const empresaId = await resolveUserEmpresaId(sb, user);

    // Asegurar UUID válido para PostgreSQL y bloquear si está eliminado o en papelera
    const projectId = isValidUUID(project.id) ? project.id : (project.cloudId && isValidUUID(project.cloudId) ? project.cloudId : generateUUID());
    try {
      const rawDel = typeof localStorage !== 'undefined' ? localStorage.getItem('cubikar_deleted_projects_v1') : null;
      const delList = rawDel ? JSON.parse(rawDel) : [];
      if (Array.isArray(delList) && (delList.includes(project.id) || delList.includes(projectId))) {
        return { success: false, reason: 'Proyecto eliminado' };
      }
      const rawTrashed = typeof localStorage !== 'undefined' ? localStorage.getItem('cubikar_trashed_project_ids_v1') : null;
      const trashList = rawTrashed ? JSON.parse(rawTrashed) : [];
      if (Array.isArray(trashList) && (trashList.includes(project.id) || trashList.includes(projectId))) {
        return { success: false, reason: 'Proyecto en papelera' };
      }
    } catch (_) {}
    project.cloudId = projectId;

    const ownerEmail = (project.ownerEmail || user.email || '').toLowerCase().trim();

    const rawIva = settings?.ivaPct ?? settings?.presupuestoArq?.ivaPct ?? project.ivaPct;
    const resolvedIvaPct = rawIva !== undefined && rawIva !== null && !isNaN(Number(rawIva))
      ? Math.max(0, Math.min(100, Number(rawIva)))
      : 16.0;
    const rawFasar = settings?.pctFasar ?? project.pctFasar;
    const resolvedFasar = rawFasar !== undefined && rawFasar !== null && !isNaN(Number(rawFasar))
      ? Math.max(0, Number(rawFasar))
      : 0;

    let existingCloudProj = null;
    try {
      let { data: ep, error: epErr } = await sb
        .from('proyectos')
        .select('id, empresa_id, owner_email, creado_por, configuracion, deleted_at')
        .eq('id', projectId)
        .maybeSingle();
      if (epErr && (epErr.code === '42703' || /deleted_at/i.test(String(epErr.message || '')))) {
        const retryRes = await sb
          .from('proyectos')
          .select('id, empresa_id, owner_email, creado_por, configuracion')
          .eq('id', projectId)
          .maybeSingle();
        ep = retryRes.data;
        epErr = retryRes.error;
      }
      if (epErr && epErr.code !== 'PGRST116') {
        console.warn('[CloudProjectService] Consulta previa de proyecto interrumpida (abortando para proteger configuración remota):', epErr.message || epErr);
        return { success: false, error: epErr };
      }
      existingCloudProj = ep || null;
      if (existingCloudProj?.deleted_at) {
        return { success: false, reason: 'Proyecto en papelera' };
      }
    } catch (epCatchErr) {
      return { success: false, error: epCatchErr };
    }

    const prevCloudCfg = (existingCloudProj?.configuracion && typeof existingCloudProj.configuracion === 'object')
      ? existingCloudProj.configuracion
      : {};
    const currentActorEmail = (user.email || '').toLowerCase().trim();
    let effectiveOwnerEmail = (existingCloudProj?.owner_email || ownerEmail || '').toLowerCase().trim();
    let canManageMembers = Boolean(currentActorEmail) && currentActorEmail === effectiveOwnerEmail;

    // 1. Guardar / Actualizar en tabla 'public.proyectos' preservando configuraciones concurrentes
    const projectRecord = {
      id: projectId,
      empresa_id: existingCloudProj?.empresa_id || empresaId || null,
      owner_email: existingCloudProj?.owner_email || ownerEmail,
      creado_por: existingCloudProj?.creado_por || user.id,
      clave: (project.clave || project.id || '').slice(0, 50),
      nombre: project.projectName || 'Proyecto sin título',
      cliente: project.client || '',
      ubicacion: project.projectLocation || '',
      tipo_obra: project.tipoObra || 'Diseño y Proyecto Ejecutivo',
      moneda: project.currency || settings?.currency || 'MXN',
      simbolo_moneda: project.currencySymbol || settings?.currencySymbol || '$',
      aplica_sobrecosto: Boolean(settings?.applySobrecosto ?? project.applySobrecosto),
      pct_indirectos: Number(settings?.pctIndirectos ?? project.pctIndirectos) || 0,
      pct_financiamiento: Number(settings?.pctFinanciamiento ?? project.pctFinanciamiento) || 0,
      pct_utilidad: Number(settings?.pctUtilidad ?? project.pctUtilidad) || 0,
      pct_adicionales: Number(settings?.pctAdicionales ?? project.pctAdicionales) || 0,
      pct_seguros_fianzas: Number(settings?.pctSegurosFianzas ?? project.pctSegurosFianzas ?? 0) || 0,
      pct_fasar: resolvedFasar,
      anticipo_pct: Number(settings?.anticipoPct ?? 30.0),
      iva_pct: resolvedIvaPct,
      configuracion: (() => {
        const safeSettings = { ...((settings && typeof settings === 'object') ? settings : {}) };
        delete safeSettings.apiKey;
        if (!canManageMembers) {
          delete safeSettings.collaborators;
          delete safeSettings.memberTabs;
        }
        const resolvedPlanId = project.ownerPlanId
          || safeSettings.ownerPlanId
          || prevCloudCfg.ownerPlanId
          || (ownerEmail && typeof getUserPlanId === 'function' ? getUserPlanId(ownerEmail) : 'free')
          || 'free';
        const prevArqMeta = {
          ...((prevCloudCfg.arqNodeMeta && typeof prevCloudCfg.arqNodeMeta === 'object') ? prevCloudCfg.arqNodeMeta : {}),
          ...((prevCloudCfg.arqNodesMeta && typeof prevCloudCfg.arqNodesMeta === 'object') ? prevCloudCfg.arqNodesMeta : {})
        };
        const rawLocalMeta = Array.isArray(treeData)
          ? buildArqNodesMetaMap(treeData)
          : ((safeSettings.arqNodesMeta && typeof safeSettings.arqNodesMeta === 'object') ? safeSettings.arqNodesMeta : {});
        const arqNodesMeta = mergeArqMetaSafe(prevArqMeta, rawLocalMeta, projectId, treeData);
        const clearedMatrixSet = new Set([
          ...(Array.isArray(prevCloudCfg.clearedMatrixIds) ? prevCloudCfg.clearedMatrixIds : []),
          ...Object.keys(arqNodesMeta).filter(k => arqNodesMeta[k]?.userClearedMatrix)
        ]);
        const tomb = tombstonedConceptIdsByProject.get(projectId);
        if (tomb) tomb.forEach(d => clearedMatrixSet.delete(d));
        const clearedMatrixIds = Array.from(clearedMatrixSet);
        const resolvedPresupuestoArq = project.presupuestoArq || settings?.presupuestoArq || safeSettings.presupuestoArq || prevCloudCfg.presupuestoArq || null;
        return {
          ...prevCloudCfg,
          ...safeSettings,
          ownerPlanId: resolvedPlanId,
          presupuestoArq: resolvedPresupuestoArq,
          clearedMatrixIds,
          arqNodeMeta: arqNodesMeta,
          arqNodesMeta,
          ownerName: project.ownerName || prevCloudCfg.ownerName || (ownerEmail === (user.email || '').toLowerCase().trim() ? (user.name || '') : ''),
          companyName: project.companyName || prevCloudCfg.companyName || '',
          budgetSignatures: project.budgetSignatures || settings?.budgetSignatures || prevCloudCfg.budgetSignatures || [],
          collaborators: (canManageMembers && Array.isArray(project.members))
            ? project.members
                .filter(m => m && m.email && (m.status || '').toLowerCase().trim() !== 'rejected')
                .map(m => ({
                  email: (m.email || '').toLowerCase().trim(),
                  name: m.name || (m.email || '').split('@')[0],
                  role: m.role || 'editar',
                  status: (m.status || '').toLowerCase().trim() === 'pending' ? 'pending' : 'accepted'
                }))
            : (Array.isArray(prevCloudCfg?.collaborators) ? prevCloudCfg.collaborators : []),
          memberTabs: !canManageMembers
            ? (prevCloudCfg.memberTabs || {})
            : Array.isArray(project.members)
              ? project.members.reduce((acc, m) => {
                  const em = (m?.email || '').toLowerCase().trim();
                  if (em && Array.isArray(m.allowedTabs)) acc[em] = m.allowedTabs;
                  return acc;
                }, { ...((prevCloudCfg && prevCloudCfg.memberTabs) || {}), ...((safeSettings && safeSettings.memberTabs) || {}) })
              : ((safeSettings && safeSettings.memberTabs) || prevCloudCfg.memberTabs || {})
        };
      })(),
      updated_at: new Date().toISOString()
    };

    let projError = null;
    if (existingCloudProj) {
      const { id: _ignoredId, creado_por: _ignoredCreator, ...updateRecord } = projectRecord;
      ({ error: projError } = await sb
        .from('proyectos')
        .update(updateRecord)
        .eq('id', projectId));
    } else {
      ({ error: projError } = await sb
        .from('proyectos')
        .insert(projectRecord));
    }

    if (projError && (isRlsError(projError) || projError.code === '23505')) {
      const cloudRow = await readCloudProjectOwnership(sb, projectId);
      if (isCloudRowOwnedBy(cloudRow, user)) {
        effectiveOwnerEmail = (cloudRow.owner_email || effectiveOwnerEmail || '').toLowerCase().trim();
        canManageMembers = Boolean(currentActorEmail) && currentActorEmail === effectiveOwnerEmail;
        const { id: _ignoredId, creado_por: _ignoredCreator, ...retryUpdate } = {
          ...projectRecord,
          owner_email: cloudRow.owner_email || projectRecord.owner_email
        };
        ({ error: projError } = await sb
          .from('proyectos')
          .update(retryUpdate)
          .eq('id', projectId));
        if (projError) {
          console.warn('[CloudProjectService] Reintento de subida de proyecto propio rechazado:', projError.message || projError);
          return { success: false, triggerBlocked: isP0001TriggerError(projError), error: projError };
        }
      } else {
        const foreignOwner = (cloudRow?.owner_email || '').toLowerCase().trim();
        if (foreignOwner && foreignOwner !== currentActorEmail) {
          console.info('[CloudProjectService] Proyecto perteneciente a otra cuenta; se omite la subida como propio:', projectId);
          return { success: false, rlsBlocked: true, existingOwnerEmail: foreignOwner, error: projError };
        }
        console.warn('[CloudProjectService] Subida rechazada por RLS sin propietario verificable; se reintentará más tarde:', projectId);
        return { success: false, error: projError };
      }
    }

    if (projError && isP0001TriggerError(projError)) {
      const msg = String(projError.message || '');
      if (/papelera/i.test(msg)) {
        try { markProjectTrashedLocal(projectId); } catch (_) {}
        return { success: false, trashedInCloud: true, error: projError };
      }
      console.warn('[CloudProjectService] Actualización restringida por regla de seguridad (P0001):', msg);
      return { success: false, triggerBlocked: true, error: projError };
    }

    if (projError) {
      console.warn('[CloudProjectService] Error al guardar proyecto en Supabase:', projError.message);
      return { success: false, error: projError };
    }
    project.isCloudSynced = true;
    project.lastCloudSyncAt = Date.now();
    invalidateCloudProjectsCache();

    if (typeof opts?.onHeaderSynced === 'function') {
      try {
        opts.onHeaderSynced(projectId);
      } catch (_) {}
    }

    // 2. Solo el propietario sincroniza filas de 'public.proyecto_colaboradores'
    if (canManageMembers) {
      const { error: ownerColabErr } = await sb
        .from('proyecto_colaboradores')
        .upsert({
          proyecto_id: projectId,
          email_colaborador: effectiveOwnerEmail,
          nombre_colaborador: project.ownerName || user.name || 'Propietario',
          rol: 'owner',
          estado_invitacion: 'accepted',
          updated_at: new Date().toISOString()
        }, { onConflict: 'proyecto_id,email_colaborador' });
      if (ownerColabErr) {
        console.warn('[CloudProjectService] Aviso al registrar propietario en proyecto_colaboradores:', ownerColabErr.message || ownerColabErr);
      }
      await insertMissingCollaboratorRows(sb, projectId, project.members, effectiveOwnerEmail, !existingCloudProj);
    }

    // 3. Si se proporcionó el árbol del catálogo, sincronizar partidas, conceptos, insumos y metadatos de arquitectura
    if (Array.isArray(treeData)) {
      await syncCatalogTreeToCloud(sb, projectId, treeData, { skipArqMeta: true });
    }

    return { success: true, projectId };
  } catch (err) {
    console.error('[CloudProjectService] Excepción al sincronizar proyecto con la nube:', err);
    return { success: false, error: err };
  }
}

function isRlsError(err) {
  return err?.code === '42501' || /row-level security/i.test(String(err?.message || ''));
}

function isP0001TriggerError(err) {
  return String(err?.code || '').toUpperCase() === 'P0001';
}

/**
 * Inserta solo las filas de colaboradores que faltan (nunca actualiza filas existentes ni promueve
 * pending→accepted). En una subida inicial se insertan todos los miembros; después, solo los marcados
 * con pendingCloudAdd (invitación cuya inserción en la nube aún no se confirmó).
 */
async function insertMissingCollaboratorRows(sb, projectId, members, ownerEmail, isInitialUpload) {
  if (!Array.isArray(members) || members.length === 0) return;
  const nowIso = new Date().toISOString();
  const rows = members
    .filter(m => {
      const mEmail = (m?.email || '').toLowerCase().trim();
      const st = (m?.status || '').toLowerCase().trim();
      return mEmail && mEmail !== ownerEmail && st !== 'rejected' && (isInitialUpload || m.pendingCloudAdd === true);
    })
    .map(m => {
      const mEmail = m.email.toLowerCase().trim();
      return {
        proyecto_id: projectId,
        email_colaborador: mEmail,
        nombre_colaborador: m.name || mEmail.split('@')[0],
        rol: ['editar', 'escribir', 'leer'].includes(m.role) ? m.role : 'editar',
        estado_invitacion: (m.status || '').toLowerCase().trim() === 'pending' ? 'pending' : 'accepted',
        updated_at: nowIso
      };
    });
  if (rows.length === 0) return;
  try {
    const { error } = await sb
      .from('proyecto_colaboradores')
      .upsert(rows, { onConflict: 'proyecto_id,email_colaborador', ignoreDuplicates: true });
    if (error) console.warn('[CloudProjectService] Aviso al registrar colaboradores faltantes:', error.message || error);
  } catch (cErr) {
    console.warn('[CloudProjectService] Aviso al registrar colaboradores faltantes:', cErr);
  }
}

/**
 * Sube solo el catálogo (conceptos, insumos y metadatos de arquitectura) de un proyecto que ya existe en la nube,
 * sin volver a escribir su encabezado en public.proyectos.
 */
export async function syncProjectCatalogToCloud(project, treeData) {
  const sb = getSupabaseClient();
  const projectId = resolveProjectSyncKey(project);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(projectId) || !Array.isArray(treeData)) {
    return { success: false };
  }
  try {
    await syncCatalogTreeToCloud(sb, projectId, treeData);
    return { success: true, projectId };
  } catch (err) {
    console.warn('[CloudProjectService] Error al sincronizar catálogo:', err);
    return { success: false, error: err };
  }
}

/**
 * Aplanar y sincronizar el árbol jerárquico a 'public.catalogo_conceptos' y 'public.insumos_apu'
 */
export async function syncCatalogTreeToCloud(sb, projectId, treeData, options = {}) {
  if (!sb || !projectId || !Array.isArray(treeData)) return;
  return enqueueProjectCloudSync(projectId, async () => {
    const flatConcepts = [];
    const flatInsumos = [];

    function walk(nodes, parentId = null, depth = 1) {
      nodes.forEach((n, idx) => {
        const conceptId = (n.uuid && isValidUUID(n.uuid)) ? n.uuid : (isValidUUID(n.id) ? n.id : generateUUID());
        n.uuid = conceptId;

        const isParent = Array.isArray(n.children) && n.children.length > 0;
        let tipo = 'concepto';
        if (isParent) {
          tipo = depth === 1 ? 'partida' : 'subpartida';
        }

        flatConcepts.push({
          id: conceptId,
          proyecto_id: projectId,
          parent_id: parentId,
          tipo: tipo,
          clave: String(n.clave || `C-${idx + 1}`).slice(0, 50),
          descripcion: n.descripcion || '',
          unidad: String(n.unidad || (isParent ? 'lote' : 'pza')).slice(0, 30),
          cantidad: Number(n.cantidad) || 0,
          precio_unitario: Number(n.precioUnitario) || 0,
          costo_directo: Number(n.costoDirecto) || 0,
          color: n.color || null,
          orden: idx,
          expanded: n.expanded !== false,
          selected: n.selected !== false,
          insumos: Array.isArray(n.insumos) ? n.insumos : [],
          updated_at: new Date().toISOString()
        });

        // Procesar insumos de la matriz APU para compatibilidad relacional
        if (Array.isArray(n.insumos) && n.insumos.length > 0) {
          n.insumos.forEach((ins, insIdx) => {
            const insumoId = (ins.uuid && isValidUUID(ins.uuid)) ? ins.uuid : (isValidUUID(ins.id) ? ins.id : generateUUID());
            ins.uuid = insumoId;

            let cleanTipo = ins.tipo || 'Material';
            if (cleanTipo === 'Herramienta' || cleanTipo === 'Maquinaria') {
              cleanTipo = 'Equipo';
            }
            if (!['Material', 'Mano de Obra', 'Equipo', 'Subcontrato'].includes(cleanTipo)) {
              cleanTipo = 'Material';
            }

            flatInsumos.push({
              id: insumoId,
              concepto_id: conceptId,
              tipo: cleanTipo,
              clave: String(ins.clave || `INS-${insIdx + 1}`).slice(0, 50),
              descripcion: ins.descripcion || '',
              unidad: String(ins.unidad || 'pza').slice(0, 30),
              cantidad: Number(ins.cantidad) || 0,
              costo_unitario: Number(ins.costoUnitario) || 0,
              orden: insIdx,
              updated_at: new Date().toISOString()
            });
          });
        }

        if (isParent) {
          walk(n.children, conceptId, depth + 1);
        }
      });
    }

    walk(treeData);

    const keepConceptIds = new Set(flatConcepts.map(c => c.id));
    const keepInsumoIds = new Set(flatInsumos.map(i => i.id));
    const BATCH_SIZE = 500;
    const tombSet = tombstonedConceptIdsByProject.get(projectId) || new Set();
    const knownSet = knownCloudConceptIdsByProject.get(projectId) || new Set();

    // 1. Depurar ÚNICAMENTE conceptos eliminados por este cliente (nunca filas recién creadas por otros usuarios)
    let existingDbMap = new Map();
    try {
      const { data: existingConcepts } = await sb
        .from('catalogo_conceptos')
        .select('id')
        .eq('proyecto_id', projectId);

      const staleConceptIds = (Array.isArray(existingConcepts) ? existingConcepts : [])
        .map(r => r?.id)
        .filter((id) => {
          if (!id) return false;
          existingDbMap.set(id, true);
          return !keepConceptIds.has(id) && (tombSet.has(id) || knownSet.has(id));
        });

      for (let i = 0; i < staleConceptIds.length; i += BATCH_SIZE) {
        const staleChunk = staleConceptIds.slice(i, i + BATCH_SIZE);
        await sb.from('insumos_apu').delete().in('concepto_id', staleChunk);
        await sb.from('catalogo_conceptos').delete().in('id', staleChunk).eq('proyecto_id', projectId);
        staleChunk.forEach((id) => {
          tombSet.delete(id);
          knownSet.delete(id);
        });
      }
    } catch (delErr) {
      console.warn('[CloudProjectService] Aviso al depurar conceptos eliminados:', delErr?.message || delErr);
    }

    // 1B. No pisar filas cuya matriz fue vaciada remotamente mientras este usuario no había recargado
    let clearedRemoteIds = new Set();
    let prevProjCfg = {};
    if (isValidUUID(projectId)) {
      try {
        const { data: pCfgRow } = await sb
          .from('proyectos')
          .select('configuracion')
          .eq('id', projectId)
          .maybeSingle();
        prevProjCfg = (pCfgRow?.configuracion && typeof pCfgRow.configuracion === 'object') ? pCfgRow.configuracion : {};
        if (Array.isArray(prevProjCfg.clearedMatrixIds)) {
          prevProjCfg.clearedMatrixIds.forEach(id => clearedRemoteIds.add(id));
        }
        const metaObj = prevProjCfg.arqNodesMeta || prevProjCfg.arqNodeMeta || {};
        Object.keys(metaObj).forEach(k => { if (metaObj[k]?.userClearedMatrix) clearedRemoteIds.add(k); });
      } catch (_) {}
    }

    const conceptsToUpsert = flatConcepts.map((c) => {
      if (clearedRemoteIds.has(c.id)) {
        const localNode = flatConcepts.find(x => x.id === c.id);
        if (localNode && localNode.insumos.length > 0) {
          // Verificar si este nodo local realmente fue editado o solo conserva caché previa
          return c;
        }
      }
      return c;
    });

    if (typeof window !== 'undefined' && typeof window.markLocalConceptsPushed === 'function') {
      window.markLocalConceptsPushed(conceptsToUpsert.map(c => c.id));
    }

    // 2. Guardar conceptos en lotes
    for (let i = 0; i < conceptsToUpsert.length; i += BATCH_SIZE) {
      const chunk = conceptsToUpsert.slice(i, i + BATCH_SIZE);
      const { error: cErr } = await sb
        .from('catalogo_conceptos')
        .upsert(chunk, { onConflict: 'id' });
      if (cErr) {
        console.warn('[CloudProjectService] Aviso al sincronizar lote de conceptos:', cErr.message);
      }
    }
    addKnownCloudConceptIds(projectId, conceptsToUpsert.map(c => c.id));

    // 3. Guardar insumos en lotes y depurar huérfanos
    for (let i = 0; i < flatInsumos.length; i += BATCH_SIZE) {
      const chunk = flatInsumos.slice(i, i + BATCH_SIZE);
      const { error: insErr } = await sb
        .from('insumos_apu')
        .upsert(chunk, { onConflict: 'id' });
      if (insErr) {
        console.warn('[CloudProjectService] Aviso al sincronizar lote de insumos:', insErr.message);
      }
    }

    try {
      const activeConceptIds = Array.from(keepConceptIds);
      for (let i = 0; i < activeConceptIds.length; i += BATCH_SIZE) {
        const cChunk = activeConceptIds.slice(i, i + BATCH_SIZE);
        const { data: existingIns } = await sb
          .from('insumos_apu')
          .select('id')
          .in('concepto_id', cChunk);

        const staleInsIds = (Array.isArray(existingIns) ? existingIns : [])
          .map(r => r?.id)
          .filter(id => id && !keepInsumoIds.has(id));

        for (let j = 0; j < staleInsIds.length; j += BATCH_SIZE) {
          await sb.from('insumos_apu').delete().in('id', staleInsIds.slice(j, j + BATCH_SIZE));
        }
      }
    } catch (_) {}

    // 4. Persistir campos específicos de Arquitectura sin sobrescribir cotizaciones/limpiezas concurrentes de otros usuarios
    if (!options?.skipArqMeta && isValidUUID(projectId)) {
      try {
        const localMeta = buildArqNodesMetaMap(treeData);
        const { data: projRow } = await sb
          .from('proyectos')
          .select('configuracion')
          .eq('id', projectId)
          .maybeSingle();
        if (projRow) {
          const freshPrevCfg = (projRow.configuracion && typeof projRow.configuracion === 'object') ? projRow.configuracion : prevProjCfg;
          const freshPrevMeta = {
            ...((freshPrevCfg.arqNodeMeta && typeof freshPrevCfg.arqNodeMeta === 'object') ? freshPrevCfg.arqNodeMeta : {}),
            ...((freshPrevCfg.arqNodesMeta && typeof freshPrevCfg.arqNodesMeta === 'object') ? freshPrevCfg.arqNodesMeta : {})
          };
          const arqNodesMeta = mergeArqMetaSafe(freshPrevMeta, localMeta, projectId, treeData);
          const clearedMatrixIds = Array.from(new Set([
            ...(Array.isArray(freshPrevCfg.clearedMatrixIds) ? freshPrevCfg.clearedMatrixIds : []),
            ...Object.keys(arqNodesMeta).filter(k => arqNodesMeta[k]?.userClearedMatrix)
          ])).filter(id => !tombSet.has(id));
          const nextCfg = { ...freshPrevCfg, clearedMatrixIds, arqNodeMeta: arqNodesMeta, arqNodesMeta };
          delete nextCfg.apiKey;
          await sb.from('proyectos').update({ configuracion: nextCfg }).eq('id', projectId);
        }
      } catch (_) {}
    }
  });
}

/**
 * Consultar los proyectos disponibles en Supabase para el usuario actual.
 * Utiliza RLS en PostgreSQL: devuelve todos los proyectos donde el usuario es
 * Propietario (owner_email) O Colaborador Invitado (proyecto_colaboradores).
 */
export async function fetchCloudProjects(opts = {}) {
  const sb = getSupabaseClient();
  const user = getCurrentUser();

  if (!isSupabaseConfigured() || !sb || !user?.id) {
    return null;
  }

  const force = Boolean(opts?.force);
  const now = Date.now();
  if (!force && cachedCloudProjectsList && (now - cachedCloudProjectsAt) < 4000) {
    return cachedCloudProjectsList;
  }
  if (!force && cloudProjectsFailUntil > now) {
    return null;
  }
  if (inFlightFetchCloudProjectsPromise) {
    return inFlightFetchCloudProjectsPromise;
  }

  inFlightFetchCloudProjectsPromise = (async () => {
  try {
    const myEmail = (user.email || '').toLowerCase().trim();

    // Consulta con join a proyecto_colaboradores (sin filtro por empresa_id para permitir colaboración inter-cuentas)
    const { data: cloudList, error } = await sb
      .from('proyectos')
      .select('*, proyecto_colaboradores(*)')
      .order('updated_at', { ascending: false });

    if (error) {
      cloudProjectsFailUntil = Date.now() + 2500;
      console.warn('[CloudProjectService] Error al obtener proyectos de la nube:', error.message);
      return null;
    }

    if (!Array.isArray(cloudList)) return null;

    let deletedList = [];
    try {
      if (typeof localStorage !== 'undefined') {
        const rawDel = localStorage.getItem('cubikar_deleted_projects_v1');
        if (rawDel) deletedList = JSON.parse(rawDel);
      }
    } catch (_) {}

    const cloudDeletedIds = new Set();
    try {
      const { data: delRows } = await sb
        .from('proyectos_eliminados')
        .select('proyecto_id');
      if (Array.isArray(delRows)) {
        const mergedLocal = Array.isArray(deletedList) ? [...deletedList] : [];
        let changed = false;
        for (const r of delRows) {
          const did = r?.proyecto_id ? String(r.proyecto_id).trim() : '';
          if (did) {
            cloudDeletedIds.add(did);
            if (!mergedLocal.includes(did)) {
              mergedLocal.push(did);
              changed = true;
            }
          }
        }
        if (changed && typeof localStorage !== 'undefined') {
          deletedList = mergedLocal;
          localStorage.setItem('cubikar_deleted_projects_v1', JSON.stringify(mergedLocal.slice(-200)));
        }
      }
    } catch (_) {}

    const activeRows = cloudList.filter(cp => cp && !cp.deleted_at);
    const trashedRows = cloudList.filter(cp => cp && Boolean(cp.deleted_at));

    const nextTrashedIds = new Set();
    const nextTrashedList = [];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    for (const tp of trashedRows) {
      const tid = tp?.id ? String(tp.id).trim() : '';
      if (!tid || cloudDeletedIds.has(tid)) continue;
      const tpOwner = (tp.owner_email || '').toLowerCase().trim();
      const isHostOwner = tpOwner ? (tpOwner === myEmail) : (tp.creado_por && tp.creado_por === user.id);
      if (!isHostOwner) continue;
      const deletedMs = tp.deleted_at ? new Date(tp.deleted_at).getTime() : nowMs;
      if (deletedMs > 0 && (nowMs - deletedMs) > sevenDaysMs) continue;
      nextTrashedIds.add(tid);
      const rawCfg = (tp.configuracion && typeof tp.configuracion === 'object') ? tp.configuracion : {};
      nextTrashedList.push({
        id: tid,
        cloudId: tid,
        isCloudSynced: true,
        projectName: tp.nombre || 'Proyecto sin título',
        companyName: rawCfg.companyName || tp.cliente || 'Taller de Arquitectura',
        companyLogo: rawCfg.companyLogo || '',
        ownerEmail: tpOwner || myEmail,
        ownerName: rawCfg.ownerName || user.name || '',
        projectLocation: tp.ubicacion || '',
        tipoObra: tp.tipo_obra || 'Diseño y Proyecto Ejecutivo',
        currency: tp.moneda || 'MXN',
        currencySymbol: tp.simbolo_moneda || '$',
        deletedAt: tp.deleted_at,
        deletedByEmail: tp.deleted_by_email || tpOwner || myEmail,
        expiresAt: new Date(deletedMs + sevenDaysMs).toISOString(),
        createdAt: tp.created_at ? tp.created_at.slice(0, 10) : '',
        updatedAt: tp.updated_at || tp.deleted_at
      });
    }
    trashedCloudProjectIds = nextTrashedIds;
    cachedTrashedCloudProjects = nextTrashedList;

    // Si un proyecto existe activamente en public.proyectos (deleted_at IS NULL) y NO está en public.proyectos_eliminados,
    // limpiar cualquier lápida local espuria o marca temporal de papelera.
    const activeInProyectosSet = new Set(
      activeRows
        .map(cp => cp?.id ? String(cp.id).trim() : '')
        .filter(id => id && !cloudDeletedIds.has(id))
    );
    activeInProyectosSet.forEach(id => {
      try { unmarkProjectTrashedLocal(id); } catch (_) {}
    });
    if (activeInProyectosSet.size > 0 && Array.isArray(deletedList) && deletedList.some(id => activeInProyectosSet.has(String(id || '').trim()))) {
      deletedList = deletedList.filter(id => !activeInProyectosSet.has(String(id || '').trim()));
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cubikar_deleted_projects_v1', JSON.stringify(deletedList));
        }
      } catch (_) {}
      try {
        if (user?.user_metadata?.cubikar_cloud_state_v2 && Array.isArray(user.user_metadata.cubikar_cloud_state_v2.deletedProjectIds)) {
          user.user_metadata.cubikar_cloud_state_v2.deletedProjectIds =
            user.user_metadata.cubikar_cloud_state_v2.deletedProjectIds.filter(id => !activeInProyectosSet.has(String(id || '').trim()));
          saveCurrentUser(user);
        }
      } catch (_) {}
    }

    const isDeleted = (id) => {
      const sid = String(id || '').trim();
      return cloudDeletedIds.has(sid);
    };

    const mapped = activeRows
      .filter(cp => !isDeleted(cp.id))
      .map(cp => {
        const ind = parseFloat(cp.pct_indirectos) || 0;
        const fin = parseFloat(cp.pct_financiamiento) || 0;
        const uti = parseFloat(cp.pct_utilidad) || 0;
        const adi = parseFloat(cp.pct_adicionales) || 0;
        const seg = parseFloat(cp.pct_seguros_fianzas ?? 0) || 0;
        const f = cp.aplica_sobrecosto
          ? (1 + ind / 100) * (1 + fin / 100) * (1 + uti / 100) * (1 + adi / 100) * (1 + seg / 100)
          : 1.0;

        const rawCfg = (cp.configuracion && typeof cp.configuracion === 'object') ? cp.configuracion : {};
        const cfg = { ...rawCfg };
        delete cfg.apiKey;
        const memberTabsMap = (cfg.memberTabs && typeof cfg.memberTabs === 'object') ? cfg.memberTabs : {};
        const defaultTabs = ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'];

        const rawColabs = Array.isArray(cp.proyecto_colaboradores) ? cp.proyecto_colaboradores : [];
        const reconstructedMembers = rawColabs.map(c => {
          const cEmail = (c.email_colaborador || '').toLowerCase().trim();
          return {
            id: c.id,
            name: c.nombre_colaborador || c.email_colaborador.split('@')[0],
            email: cEmail,
            role: c.rol || 'editar',
            status: c.estado_invitacion || 'accepted',
            allowedTabs: Array.isArray(memberTabsMap[cEmail]) ? memberTabsMap[cEmail] : defaultTabs
          };
        });
        if (Array.isArray(cfg.collaborators)) {
          cfg.collaborators.forEach(cm => {
            const cEmail = (cm?.email || '').toLowerCase().trim();
            if (!cEmail || (cm?.status || '').toLowerCase().trim() === 'rejected') return;
            if (!reconstructedMembers.some(m => m.email === cEmail)) {
              reconstructedMembers.push({
                id: `cfg-${cEmail}`,
                name: cm.name || cEmail.split('@')[0],
                email: cEmail,
                role: cm.role || 'editar',
                status: cm.status || 'accepted',
                allowedTabs: Array.isArray(memberTabsMap[cEmail]) ? memberTabsMap[cEmail] : defaultTabs
              });
            }
          });
        }
        Object.keys(memberTabsMap).forEach(kEmail => {
          const cEmail = (kEmail || '').toLowerCase().trim();
          if (!cEmail || !cEmail.includes('@')) return;
          if (!reconstructedMembers.some(m => m.email === cEmail)) {
            reconstructedMembers.push({
              id: `tab-${cEmail}`,
              name: cEmail.split('@')[0],
              email: cEmail,
              role: 'editar',
              status: 'accepted',
              allowedTabs: Array.isArray(memberTabsMap[kEmail]) ? memberTabsMap[kEmail] : defaultTabs
            });
          }
        });

        const ownerColab = rawColabs.find(c => c.rol === 'owner');
        const ownerEmail = (cp.owner_email || ownerColab?.email_colaborador || (cp.creado_por && cp.creado_por === user.id ? myEmail : '') || '').toLowerCase().trim();
        const isMyOwn = ownerEmail === myEmail || (cp.creado_por && cp.creado_por === user.id);
        const isMyCollab = reconstructedMembers.some(c => (c.email || '').toLowerCase().trim() === myEmail && c.status !== 'rejected');
        if (!isMyOwn && !isMyCollab) {
          return null;
        }
        const ownerName = cfg.ownerName || ownerColab?.nombre_colaborador || (ownerEmail === myEmail ? (user.name || 'Propietario') : (ownerEmail ? ownerEmail.split('@')[0] : 'Propietario'));
        const resolvedOwnerPlanId = cfg.ownerPlanId || (isMyOwn ? getUserPlanId(user) : 'pro');

        if (cfg.presupuestoArq && typeof localStorage !== 'undefined') {
          try {
            const sKey = getSettingsKey(cp.id);
            const rawS = localStorage.getItem(sKey);
            const curS = rawS ? JSON.parse(rawS) : {};
            if (!curS.presupuestoArq) {
              curS.presupuestoArq = cfg.presupuestoArq;
              localStorage.setItem(sKey, JSON.stringify(curS));
            }
          } catch (_) {}
        }

        return {
          id: cp.id,
          cloudId: cp.id,
          isCloudSynced: true,
          projectName: cp.nombre,
          companyName: cfg.companyName || cp.cliente || 'Taller de Arquitectura',
          ownerEmail: ownerEmail,
          ownerName: ownerName,
          ownerPlanId: resolvedOwnerPlanId,
          presupuestoArq: cfg.presupuestoArq || null,
          projectLocation: cp.ubicacion || '',
          tipoObra: cp.tipo_obra || 'Diseño y Proyecto Ejecutivo',
          currency: cp.moneda || 'MXN',
          currencySymbol: cp.simbolo_moneda || '$',
          applySobrecosto: cp.aplica_sobrecosto,
          pctIndirectos: ind,
          pctFinanciamiento: fin,
          pctUtilidad: uti,
          pctAdicionales: adi,
          pctSegurosFianzas: seg,
          pctFasar: Number(cp.pct_fasar ?? 0),
          factorSobrecosto: f,
          budgetSignatures: cfg.budgetSignatures || [],
          createdAt: cp.created_at ? cp.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          updatedAt: cp.updated_at || new Date().toISOString(),
          members: reconstructedMembers
        };
      })
      .filter(Boolean);
    cachedCloudProjectsList = mapped;
    cachedCloudProjectsAt = Date.now();
    cloudProjectsFailUntil = 0;
    return mapped;
  } catch (err) {
    cloudProjectsFailUntil = Date.now() + 2500;
    console.error('[CloudProjectService] Excepción al consultar proyectos en la nube:', err);
    return null;
  }
  })();

  try {
    return await inFlightFetchCloudProjectsPromise;
  } finally {
    inFlightFetchCloudProjectsPromise = null;
  }
}

/**
 * Descargar y reconstruir el árbol de catálogo desde Supabase PostgreSQL
 */
export async function loadProjectTreeFromCloud(projectId) {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid)) return null;

  if (inFlightTreeLoadByProject.has(targetUuid)) {
    return inFlightTreeLoadByProject.get(targetUuid);
  }

  const reqPromise = (async () => {
  try {
    // 1. Obtener conceptos y metadatos extendidos de Arquitectura (cotizaciones, cronograma, IDs locales)
    const [{ data: concepts, error: cErr }, { data: projRow }] = await Promise.all([
      sb.from('catalogo_conceptos').select('*').eq('proyecto_id', targetUuid).order('orden', { ascending: true }),
      sb.from('proyectos').select('configuracion').eq('id', targetUuid).maybeSingle()
    ]);

    if (cErr || !Array.isArray(concepts)) {
      return null;
    }

    if (projRow?.configuracion?.presupuestoArq && typeof localStorage !== 'undefined') {
      try {
        const sKeys = Array.from(new Set([getSettingsKey(projectId), getSettingsKey(targetUuid)]));
        sKeys.forEach(sKey => {
          const rawS = localStorage.getItem(sKey);
          const curS = rawS ? JSON.parse(rawS) : {};
          curS.presupuestoArq = projRow.configuracion.presupuestoArq;
          localStorage.setItem(sKey, JSON.stringify(curS));
        });
      } catch (_) {}
    }

    if (concepts.length === 0) {
      return projRow ? [] : null;
    }

    const arqNodesMeta = {
      ...((projRow?.configuracion?.arqNodesMeta && typeof projRow.configuracion.arqNodesMeta === 'object') ? projRow.configuracion.arqNodesMeta : {}),
      ...((projRow?.configuracion?.arqNodeMeta && typeof projRow.configuracion.arqNodeMeta === 'object') ? projRow.configuracion.arqNodeMeta : {})
    };

    // 2. Si los conceptos no traen su insumos JSONB poblado (y la matriz no fue vaciada), consultar insumos_apu relacional
    let insumosMap = new Map();
    const candidateConceptIds = concepts
      .filter(c => !arqNodesMeta[c.id]?.userClearedMatrix && (!Array.isArray(c.insumos) || c.insumos.length === 0))
      .map(c => c.id);

    if (candidateConceptIds.length > 0) {
      const { data: insumos } = await sb
        .from('insumos_apu')
        .select('*')
        .in('concepto_id', candidateConceptIds)
        .order('orden', { ascending: true });

      if (Array.isArray(insumos)) {
        insumos.forEach(ins => {
          if (!insumosMap.has(ins.concepto_id)) insumosMap.set(ins.concepto_id, []);
          insumosMap.get(ins.concepto_id).push({
            id: ins.id,
            uuid: ins.id,
            tipo: ins.tipo,
            clave: ins.clave,
            descripcion: ins.descripcion,
            unidad: ins.unidad,
            cantidad: Number(ins.cantidad) || 0,
            costoUnitario: Number(ins.costo_unitario) || 0
          });
        });
      }
    }

    // 3. Mapear conceptos restaurando IDs locales originales y campos específicos de Arquitectura
    const map = new Map();
    const roots = [];

    const clearedCfgIds = new Set(Array.isArray(projRow?.configuracion?.clearedMatrixIds) ? projRow.configuracion.clearedMatrixIds : []);
    addKnownCloudConceptIds(targetUuid, concepts.map(c => c.id));

    concepts.forEach(c => {
      const rawMeta = arqNodesMeta[c.id] || (arqNodesMeta[String(c.clave)] && Object.keys(arqNodesMeta).every(k => !isValidUUID(k)) ? arqNodesMeta[String(c.clave)] : null);
      const meta = (rawMeta && typeof rawMeta === 'object') ? rawMeta : {};
      const isCleared = Boolean(meta.userClearedMatrix) || clearedCfgIds.has(c.id);
      const cInsumos = isCleared
        ? []
        : ((Array.isArray(c.insumos) && c.insumos.length > 0) ? c.insumos : (insumosMap.get(c.id) || []));

      const node = {
        id: meta.localId || c.id,
        uuid: c.id,
        clave: c.clave,
        descripcion: c.descripcion,
        unidad: c.unidad,
        cantidad: Number(c.cantidad) || 0,
        precioUnitario: Number(c.precio_unitario) || 0,
        costoDirecto: Number(c.costo_directo) || 0,
        color: c.color || null,
        expanded: c.expanded !== false,
        selected: c.selected !== false,
        insumos: cInsumos,
        children: []
      };

      if (meta.alcance !== undefined) node.alcance = meta.alcance;
      if (meta.entregables !== undefined) node.entregables = meta.entregables;
      if (meta.Modalidad !== undefined) node.Modalidad = meta.Modalidad;
      if (meta.modalidad !== undefined) node.modalidad = meta.modalidad;
      if (meta.complejidad !== undefined) node.complejidad = meta.complejidad;
      if (meta.unidadTiempo !== undefined) node.unidadTiempo = meta.unidadTiempo;
      if (meta.horasEstimadas !== undefined) node.horasEstimadas = meta.horasEstimadas;
      if (meta.factoresGlobales !== undefined) node.factoresGlobales = meta.factoresGlobales;
      if (meta.horasHombre !== undefined) node.horasHombre = meta.horasHombre;
      if (meta.costoSubcontrato !== undefined) node.costoSubcontrato = meta.costoSubcontrato;
      if (meta.costoHoraPersonalizado !== undefined) node.costoHoraPersonalizado = meta.costoHoraPersonalizado;
      if (meta.archivoLink !== undefined) node.archivoLink = meta.archivoLink;
      if (meta.esSubtitulo !== undefined) node.esSubtitulo = meta.esSubtitulo;
      if (isCleared) node.userClearedMatrix = true;
      if (meta.isMatrixCustomized || cInsumos.length > 0) node.isMatrixCustomized = true;
      if (Array.isArray(meta.cotizaciones)) node.cotizaciones = meta.cotizaciones;
      if (meta.costo_proveedor !== undefined) node.costo_proveedor = meta.costo_proveedor;
      if (meta.proveedorElegidoId) node.proveedorElegidoId = meta.proveedorElegidoId;
      if (meta.proveedorElegidoNombre) node.proveedorElegidoNombre = meta.proveedorElegidoNombre;
      if (meta.importe_calculado !== undefined) node.importe_calculado = meta.importe_calculado;
      if (meta.porcentaje_relativo !== undefined) node.porcentaje_relativo = meta.porcentaje_relativo;
      if (meta.porcentaje_global !== undefined) node.porcentaje_global = meta.porcentaje_global;
      if (meta.schedule && typeof meta.schedule === 'object') node.schedule = meta.schedule;
      if (meta.avancePorcentaje !== undefined) node.avancePorcentaje = meta.avancePorcentaje;
      if (meta.estatus) node.estatus = meta.estatus;
      if (meta.responsableEmail) node.responsableEmail = meta.responsableEmail;
      if (Array.isArray(meta.responsableEmails)) node.responsableEmails = meta.responsableEmails;
      if (meta.aiTips) node.aiTips = meta.aiTips;
      if (Array.isArray(meta.googleSearchQueries)) node.googleSearchQueries = meta.googleSearchQueries;
      if (Array.isArray(meta.googleSources)) node.googleSources = meta.googleSources;

      map.set(c.id, node);
    });

    // 4. Reconstruir la jerarquía de árbol
    concepts.forEach(c => {
      const node = map.get(c.id);
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  } catch (err) {
    console.error('[CloudProjectService] Excepción al descargar árbol de conceptos:', err);
    return null;
  }
  })();

  inFlightTreeLoadByProject.set(targetUuid, reqPromise);
  try {
    return await reqPromise;
  } finally {
    inFlightTreeLoadByProject.delete(targetUuid);
  }
}

/**
 * Registrar o actualizar un colaborador en la nube
 */
export async function addCollaboratorToCloud(projectId, email, role = 'editar', status = 'accepted') {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid) || !email) return { success: false };

  try {
    const cleanEmail = email.toLowerCase().trim();
    const curUser = getCurrentUser();
    const myEmail = (curUser?.email || '').toLowerCase().trim();

    // Si el colaborador está aceptando su propia invitación, actualizar estado sin modificar/escalar rol
    if (myEmail && cleanEmail === myEmail && status === 'accepted') {
      const { data: updatedRows, error: updErr } = await sb
        .from('proyecto_colaboradores')
        .update({ estado_invitacion: 'accepted', updated_at: new Date().toISOString() })
        .eq('proyecto_id', targetUuid)
        .eq('email_colaborador', cleanEmail)
        .select();
      if (updErr) {
        console.warn('[CloudProjectService] Error aceptando invitación de colaborador en la nube:', updErr.message || updErr);
        return { success: false, triggerBlocked: isP0001TriggerError(updErr), error: updErr };
      }
      if (Array.isArray(updatedRows) && updatedRows.length > 0) {
        return { success: true, data: updatedRows[0] };
      }
    }

    const record = {
      proyecto_id: targetUuid,
      email_colaborador: cleanEmail,
      nombre_colaborador: cleanEmail.split('@')[0],
      rol: role,
      estado_invitacion: status,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
      .from('proyecto_colaboradores')
      .upsert(record, { onConflict: 'proyecto_id,email_colaborador' })
      .select()
      .single();

    if (error) {
      console.warn('[CloudProjectService] Error agregando colaborador en la nube:', error.message);
      return { success: false, triggerBlocked: isP0001TriggerError(error), error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[CloudProjectService] Excepción agregando colaborador:', err);
    return { success: false, error: err };
  }
}

export async function updateCollaboratorRoleInCloud(projectId, email, role) {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid) || !email || !role) return { success: false };

  try {
    const cleanEmail = email.toLowerCase().trim();
    const { data, error } = await sb
      .from('proyecto_colaboradores')
      .update({ rol: role, updated_at: new Date().toISOString() })
      .eq('proyecto_id', targetUuid)
      .eq('email_colaborador', cleanEmail)
      .select();

    if (error) {
      console.warn('[CloudProjectService] Error actualizando rol de colaborador:', error.message);
      return { success: false, triggerBlocked: isP0001TriggerError(error), error };
    }
    if (Array.isArray(data) && data.length === 0) {
      return await addCollaboratorToCloud(targetUuid, cleanEmail, role, 'accepted');
    }
    return { success: true, data: data?.[0] || null };
  } catch (err) {
    return { success: false, error: err };
  }
}

export async function syncProjectMemberTabsToCloud(projectId, memberEmailOrMap, allowedTabs = null) {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid)) return { success: false };

  try {
    const { data: row } = await sb
      .from('proyectos')
      .select('configuracion')
      .eq('id', targetUuid)
      .maybeSingle();

    const prevCfg = (row?.configuracion && typeof row.configuracion === 'object') ? row.configuracion : {};
    const prevTabs = (prevCfg.memberTabs && typeof prevCfg.memberTabs === 'object') ? prevCfg.memberTabs : {};
    const nextTabs = { ...prevTabs };

    if (memberEmailOrMap && typeof memberEmailOrMap === 'object') {
      Object.entries(memberEmailOrMap).forEach(([em, tabs]) => {
        const cleanEm = String(em || '').toLowerCase().trim();
        if (cleanEm && Array.isArray(tabs)) nextTabs[cleanEm] = tabs;
      });
    } else if (typeof memberEmailOrMap === 'string' && memberEmailOrMap.trim()) {
      const cleanEm = memberEmailOrMap.toLowerCase().trim();
      nextTabs[cleanEm] = Array.isArray(allowedTabs) ? allowedTabs : [];
    }

    const nextCfg = { ...prevCfg, memberTabs: nextTabs };
    const { error } = await sb
      .from('proyectos')
      .update({ configuracion: nextCfg, updated_at: new Date().toISOString() })
      .eq('id', targetUuid);

    if (error) {
      console.warn('[CloudProjectService] Error actualizando pestañas de colaborador:', error.message);
      return { success: false, error, triggerBlocked: isP0001TriggerError(error) };
    }
    return { success: true, memberTabs: nextTabs };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Eliminar un colaborador de un proyecto en la nube
 */
export async function removeCollaboratorFromCloud(projectId, email) {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid) || !email) return;

  try {
    const cleanEmail = email.toLowerCase().trim();
    await sb
      .from('proyecto_colaboradores')
      .delete()
      .eq('proyecto_id', targetUuid)
      .eq('email_colaborador', cleanEmail);
    try {
      const { data: row } = await sb
        .from('proyectos')
        .select('configuracion')
        .eq('id', targetUuid)
        .maybeSingle();
      if (row?.configuracion && typeof row.configuracion === 'object') {
        const nextCfg = { ...row.configuracion };
        let cfgChanged = false;
        if (nextCfg.memberTabs && typeof nextCfg.memberTabs === 'object' && Object.prototype.hasOwnProperty.call(nextCfg.memberTabs, cleanEmail)) {
          const nextTabs = { ...nextCfg.memberTabs };
          delete nextTabs[cleanEmail];
          nextCfg.memberTabs = nextTabs;
          cfgChanged = true;
        }
        if (Array.isArray(nextCfg.collaborators)) {
          const filteredCols = nextCfg.collaborators.filter(c => (c?.email || '').toLowerCase().trim() !== cleanEmail);
          if (filteredCols.length !== nextCfg.collaborators.length) {
            nextCfg.collaborators = filteredCols;
            cfgChanged = true;
          }
        }
        if (cfgChanged) {
          await sb
            .from('proyectos')
            .update({ configuracion: nextCfg, updated_at: new Date().toISOString() })
            .eq('id', targetUuid);
        }
      }
    } catch (_) {}
  } catch (err) {
    console.warn('[CloudProjectService] Error removiendo colaborador en la nube:', err);
  }
}

async function resolveConceptUuidsFromPatch(sb, projectUuid, patchOrConcept) {
  const uuids = new Set();
  const missingClaves = new Set();
  const addRef = (val) => {
    if (isValidUUID(String(val || ''))) uuids.add(String(val).trim());
  };

  addRef(patchOrConcept?.uuid);
  addRef(patchOrConcept?.id);
  if (Array.isArray(patchOrConcept?.uuids)) patchOrConcept.uuids.forEach(addRef);
  if (Array.isArray(patchOrConcept?.ids)) patchOrConcept.ids.forEach(addRef);
  if (Array.isArray(patchOrConcept?.descendantUuids)) patchOrConcept.descendantUuids.forEach(addRef);
  if (Array.isArray(patchOrConcept?.targets)) {
    patchOrConcept.targets.forEach((t) => {
      if (!t) return;
      const before = uuids.size;
      addRef(t.uuid);
      addRef(t.id);
      if (uuids.size === before && t.clave) {
        missingClaves.add(String(t.clave).slice(0, 50));
      }
    });
  } else if (uuids.size === 0 && patchOrConcept?.clave) {
    missingClaves.add(String(patchOrConcept.clave).slice(0, 50));
  }

  if (missingClaves.size > 0) {
    try {
      const { data } = await sb
        .from('catalogo_conceptos')
        .select('id')
        .eq('proyecto_id', projectUuid)
        .in('clave', Array.from(missingClaves));
      if (Array.isArray(data)) {
        data.forEach(r => addRef(r?.id));
      }
    } catch (_) {}
  }

  return Array.from(uuids);
}

async function updateArqNodesMetaInConfig(sb, projectUuid, opts = {}) {
  return enqueueProjectCloudSync(projectUuid, async () => {
    const { deleteKeys = [], clearUuids = [], unclearUuids = [], metaFieldPatch = null, cotPatch = null, cotTargetUuid = '' } = opts;
    try {
    const { data: projRow } = await sb
      .from('proyectos')
      .select('configuracion')
      .eq('id', projectUuid)
      .maybeSingle();
    if (!projRow) return;
    const prevCfg = (projRow.configuracion && typeof projRow.configuracion === 'object') ? projRow.configuracion : {};
    const mergedMeta = {
      ...((prevCfg.arqNodeMeta && typeof prevCfg.arqNodeMeta === 'object') ? prevCfg.arqNodeMeta : {}),
      ...((prevCfg.arqNodesMeta && typeof prevCfg.arqNodesMeta === 'object') ? prevCfg.arqNodesMeta : {})
    };
    const clearedSet = new Set(Array.isArray(prevCfg.clearedMatrixIds) ? prevCfg.clearedMatrixIds : []);

    deleteKeys.forEach((k) => {
      if (k) {
        delete mergedMeta[String(k)];
        clearedSet.delete(String(k));
      }
    });

    clearUuids.forEach((uid) => {
      const prev = (mergedMeta[uid] && typeof mergedMeta[uid] === 'object') ? mergedMeta[uid] : {};
      mergedMeta[uid] = { ...prev, userClearedMatrix: true, isMatrixCustomized: true };
      clearedSet.add(uid);
    });

    unclearUuids.forEach((uid) => {
      const prev = (mergedMeta[uid] && typeof mergedMeta[uid] === 'object') ? mergedMeta[uid] : {};
      delete prev.userClearedMatrix;
      mergedMeta[uid] = { ...prev, isMatrixCustomized: true };
      clearedSet.delete(uid);
    });

    if (metaFieldPatch && metaFieldPatch.uuid) {
      const uid = String(metaFieldPatch.uuid);
      const prev = (mergedMeta[uid] && typeof mergedMeta[uid] === 'object') ? mergedMeta[uid] : {};
      mergedMeta[uid] = { ...prev, [metaFieldPatch.field]: metaFieldPatch.value };
    }

    if (cotPatch) {
      const targetKey = cotTargetUuid || (isValidUUID(String(cotPatch.uuid || '')) ? String(cotPatch.uuid) : (isValidUUID(String(cotPatch.id || '')) ? String(cotPatch.id) : ''));
      const keysToUpdate = [targetKey].filter(Boolean).map(String);
      keysToUpdate.forEach((k) => {
        const prev = (mergedMeta[k] && typeof mergedMeta[k] === 'object') ? mergedMeta[k] : {};
        const nextEntry = { ...prev };
        if (Array.isArray(cotPatch.cotizaciones)) {
          if (cotPatch.cotizaciones.length > 0) nextEntry.cotizaciones = cotPatch.cotizaciones;
          else delete nextEntry.cotizaciones;
        }
        if (cotPatch.costo_proveedor !== undefined && cotPatch.costo_proveedor !== null) nextEntry.costo_proveedor = cotPatch.costo_proveedor;
        else delete nextEntry.costo_proveedor;
        if (cotPatch.proveedorElegidoId) nextEntry.proveedorElegidoId = cotPatch.proveedorElegidoId;
        else delete nextEntry.proveedorElegidoId;
        if (cotPatch.proveedorElegidoNombre) nextEntry.proveedorElegidoNombre = cotPatch.proveedorElegidoNombre;
        else delete nextEntry.proveedorElegidoNombre;
        if (cotPatch.importe_calculado !== undefined && cotPatch.importe_calculado !== null) nextEntry.importe_calculado = cotPatch.importe_calculado;
        else delete nextEntry.importe_calculado;
        mergedMeta[k] = nextEntry;
      });
    }

    const nextCfg = {
      ...prevCfg,
      clearedMatrixIds: Array.from(clearedSet),
      arqNodeMeta: mergedMeta,
      arqNodesMeta: mergedMeta
    };
    delete nextCfg.apiKey;
    await sb.from('proyectos').update({ configuracion: nextCfg, updated_at: new Date().toISOString() }).eq('id', projectUuid);
    } catch (_) {}
  });
}

async function upsertConceptSubtreeToCloud(sb, projectUuid, rootNode, { parentId = null, orden = 0 } = {}) {
  if (!sb || !isValidUUID(projectUuid) || !rootNode || typeof rootNode !== 'object') return;
  const flatConcepts = [];
  const flatInsumos = [];

  function walkSub(node, pId, idx) {
    const conceptUuid = (node.uuid && isValidUUID(node.uuid))
      ? String(node.uuid).trim()
      : (isValidUUID(String(node.id || '')) ? String(node.id).trim() : generateUUID());
    node.uuid = conceptUuid;
    const isParent = Array.isArray(node.children) && node.children.length > 0;
    const tipo = isParent ? (pId ? 'subpartida' : 'partida') : 'concepto';

    flatConcepts.push({
      id: conceptUuid,
      proyecto_id: projectUuid,
      parent_id: pId,
      tipo,
      clave: String(node.clave || `C-${idx + 1}`).slice(0, 50),
      descripcion: node.descripcion || '',
      unidad: String(node.unidad || (isParent ? 'lote' : 'pza')).slice(0, 30),
      cantidad: Number(node.cantidad) || 0,
      precio_unitario: Number(node.precioUnitario) || 0,
      costo_directo: Number(node.costoDirecto) || 0,
      color: node.color || null,
      orden: idx,
      expanded: node.expanded !== false,
      selected: node.selected !== false,
      insumos: Array.isArray(node.insumos) ? node.insumos : [],
      updated_at: new Date().toISOString()
    });

    if (Array.isArray(node.insumos)) {
      node.insumos.forEach((ins, insIdx) => {
        if (!ins || typeof ins !== 'object') return;
        const insUuid = (ins.uuid && isValidUUID(ins.uuid))
          ? String(ins.uuid).trim()
          : (isValidUUID(String(ins.id || '')) ? String(ins.id).trim() : generateUUID());
        ins.uuid = insUuid;
        let cleanTipo = ins.tipo || 'Material';
        if (cleanTipo === 'Herramienta' || cleanTipo === 'Maquinaria') cleanTipo = 'Equipo';
        if (!['Material', 'Mano de Obra', 'Equipo', 'Subcontrato'].includes(cleanTipo)) cleanTipo = 'Material';
        flatInsumos.push({
          id: insUuid,
          concepto_id: conceptUuid,
          tipo: cleanTipo,
          clave: String(ins.clave || `INS-${insIdx + 1}`).slice(0, 50),
          descripcion: ins.descripcion || '',
          unidad: String(ins.unidad || 'pza').slice(0, 30),
          cantidad: Number(ins.cantidad) || 0,
          costo_unitario: Number(ins.costoUnitario) || 0,
          orden: insIdx,
          updated_at: new Date().toISOString()
        });
      });
    }

    if (isParent) {
      node.children.forEach((c, cIdx) => walkSub(c, conceptUuid, cIdx));
    }
  }

  walkSub(rootNode, isValidUUID(String(parentId || '')) ? String(parentId).trim() : null, orden);

  const conceptUuids = flatConcepts.map(c => c.id);
  if (typeof window !== 'undefined' && typeof window.markLocalConceptsPushed === 'function') {
    window.markLocalConceptsPushed(conceptUuids);
  }
  addKnownCloudConceptIds(projectUuid, conceptUuids);

  const { error: upErr } = await sb.from('catalogo_conceptos').upsert(flatConcepts, { onConflict: 'id' });
  if (upErr) console.warn('[CloudProjectService] Error al insertar subárbol en la nube:', upErr.message);

  if (flatInsumos.length > 0) {
    const { error: insErr } = await sb.from('insumos_apu').upsert(flatInsumos, { onConflict: 'id' });
    if (insErr) console.warn('[CloudProjectService] Error al insertar insumos de subárbol:', insErr.message);
  }
}

/**
 * Actualizar, limpiar o eliminar un concepto granular en Supabase (Persistencia de edición en vivo)
 */
export async function updateCloudConcept(projectId, patchOrConcept) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId || !patchOrConcept) return;

  const targetUuid = resolveCloudProjectId(projectId);
  if (!isValidUUID(targetUuid)) return;

  const patchType = patchOrConcept.type || '';
  const rawConceptId = (patchOrConcept.uuid && isValidUUID(patchOrConcept.uuid))
    ? String(patchOrConcept.uuid).trim()
    : (isValidUUID(String(patchOrConcept.id || '')) ? String(patchOrConcept.id).trim() : '');

  // Pre-registrar IDs síncronamente para evitar disparar syncs redundantes antes de terminar el upsert
  if (patchType === 'add_root_row' || patchType === 'add_child_row' || patchType === 'paste_node') {
    const preNode = patchOrConcept.node;
    if (preNode) addKnownCloudConceptIds(targetUuid, [preNode.uuid || preNode.id]);
  } else if (patchType === 'duplicate_node' && patchOrConcept.clonedNode) {
    addKnownCloudConceptIds(targetUuid, [patchOrConcept.clonedNode.uuid || patchOrConcept.clonedNode.id]);
  }

  return enqueueConceptMutation(targetUuid, async () => {
    try {
    if (patchType === 'update_field') {
      const targetUid = rawConceptId || (await resolveConceptUuidsFromPatch(sb, targetUuid, patchOrConcept))[0] || '';
      if (['costo_proveedor', 'porcentaje_relativo', 'porcentaje_global'].includes(patchOrConcept.field)) {
        if (targetUid) {
          await updateArqNodesMetaInConfig(sb, targetUuid, {
            metaFieldPatch: { uuid: targetUid, field: patchOrConcept.field, value: patchOrConcept.value }
          });
        } else if (typeof window !== 'undefined' && typeof window.triggerDebouncedCloudSync === 'function') {
          window.triggerDebouncedCloudSync();
        }
        return;
      }
      const fieldMap = {
        cantidad: 'cantidad',
        precioUnitario: 'precio_unitario',
        costoDirecto: 'costo_directo',
        descripcion: 'descripcion',
        clave: 'clave',
        unidad: 'unidad',
        color: 'color'
      };
      const dbField = fieldMap[patchOrConcept.field];
      if (dbField && targetUid) {
        if (typeof window !== 'undefined' && typeof window.markLocalConceptsPushed === 'function') {
          window.markLocalConceptsPushed([targetUid]);
        }
        const { data: updRows, error } = await sb
          .from('catalogo_conceptos')
          .update({ [dbField]: patchOrConcept.value, updated_at: new Date().toISOString() })
          .eq('id', targetUid)
          .eq('proyecto_id', targetUuid)
          .select('id');
        if (error) {
          console.warn('[CloudProjectService] Error al actualizar campo de concepto:', error.message);
        } else if (Array.isArray(updRows) && updRows.length === 0) {
          // Si el concepto aún no existía en DB (p.ej. recién duplicado/creado), forzar autosincronización completa
          if (typeof window !== 'undefined' && typeof window.triggerDebouncedCloudSync === 'function') {
            window.triggerDebouncedCloudSync();
          }
        }
      } else if (!targetUid && typeof window !== 'undefined' && typeof window.triggerDebouncedCloudSync === 'function') {
        const projMeta = (typeof getProjectsList === 'function' ? getProjectsList() : []).find(p => p && (p.id === projectId || p.cloudId === targetUuid));
        if (!projMeta?.isCloudSynced) {
          window.triggerDebouncedCloudSync();
        }
      }
      return;
    }

    if (patchType === 'add_root_row' && patchOrConcept.node) {
      await upsertConceptSubtreeToCloud(sb, targetUuid, patchOrConcept.node, {
        parentId: null,
        orden: Number(patchOrConcept.orden) || 0
      });
      return;
    }

    if (patchType === 'add_child_row' && patchOrConcept.node) {
      let resolvedParentUuid = isValidUUID(String(patchOrConcept.parentUuid || ''))
        ? String(patchOrConcept.parentUuid).trim()
        : (isValidUUID(String(patchOrConcept.parentId || '')) ? String(patchOrConcept.parentId).trim() : '');
      if (!resolvedParentUuid && patchOrConcept.parentClave) {
        const { data: pRows } = await sb
          .from('catalogo_conceptos')
          .select('id')
          .eq('proyecto_id', targetUuid)
          .eq('clave', String(patchOrConcept.parentClave).slice(0, 50))
          .limit(1);
        resolvedParentUuid = pRows?.[0]?.id || '';
      }
      await upsertConceptSubtreeToCloud(sb, targetUuid, patchOrConcept.node, {
        parentId: resolvedParentUuid || null,
        orden: Number(patchOrConcept.orden) || 0
      });
      return;
    }

    if (patchType === 'duplicate_node' && patchOrConcept.clonedNode) {
      let resolvedParentUuid = isValidUUID(String(patchOrConcept.parentUuid || ''))
        ? String(patchOrConcept.parentUuid).trim()
        : (isValidUUID(String(patchOrConcept.parentId || '')) ? String(patchOrConcept.parentId).trim() : null);
      if (!resolvedParentUuid && rawConceptId) {
        const { data: siblingRow } = await sb
          .from('catalogo_conceptos')
          .select('parent_id')
          .eq('id', rawConceptId)
          .maybeSingle();
        resolvedParentUuid = siblingRow?.parent_id || null;
      }
      await upsertConceptSubtreeToCloud(sb, targetUuid, patchOrConcept.clonedNode, {
        parentId: resolvedParentUuid,
        orden: Number(patchOrConcept.position) || 0
      });
      return;
    }

    if (patchType === 'paste_node' && patchOrConcept.node) {
      let resolvedParentUuid = isValidUUID(String(patchOrConcept.parentUuid || ''))
        ? String(patchOrConcept.parentUuid).trim()
        : (isValidUUID(String(patchOrConcept.parentId || '')) ? String(patchOrConcept.parentId).trim() : null);
      await upsertConceptSubtreeToCloud(sb, targetUuid, patchOrConcept.node, {
        parentId: resolvedParentUuid,
        orden: Number(patchOrConcept.position) || 0
      });
      return;
    }

    if (patchType === 'update_insumos') {
      const targetUuids = rawConceptId ? [rawConceptId] : await resolveConceptUuidsFromPatch(sb, targetUuid, patchOrConcept);
      const resolvedUid = targetUuids[0] || '';
      if (!resolvedUid) return;
      if (typeof window !== 'undefined' && typeof window.markLocalConceptsPushed === 'function') {
        window.markLocalConceptsPushed([resolvedUid]);
      }
      addKnownCloudConceptIds(targetUuid, [resolvedUid]);
      const insumosList = Array.isArray(patchOrConcept.insumos) ? patchOrConcept.insumos : [];
      const flatInsRows = insumosList.map((ins, insIdx) => {
        const insUuid = (ins?.uuid && isValidUUID(ins.uuid))
          ? String(ins.uuid).trim()
          : (isValidUUID(String(ins?.id || '')) ? String(ins.id).trim() : generateUUID());
        if (ins && typeof ins === 'object') ins.uuid = insUuid;
        let cleanTipo = ins?.tipo || 'Material';
        if (cleanTipo === 'Herramienta' || cleanTipo === 'Maquinaria') cleanTipo = 'Equipo';
        if (!['Material', 'Mano de Obra', 'Equipo', 'Subcontrato'].includes(cleanTipo)) cleanTipo = 'Material';
        return {
          id: insUuid,
          concepto_id: resolvedUid,
          tipo: cleanTipo,
          clave: String(ins?.clave || `INS-${insIdx + 1}`).slice(0, 50),
          descripcion: ins?.descripcion || '',
          unidad: String(ins?.unidad || 'pza').slice(0, 30),
          cantidad: Number(ins?.cantidad) || 0,
          costo_unitario: Number(ins?.costoUnitario) || 0,
          orden: insIdx,
          updated_at: new Date().toISOString()
        };
      });

      const { error: uErr } = await sb
        .from('catalogo_conceptos')
        .update({
          insumos: insumosList,
          precio_unitario: Number(patchOrConcept.precioUnitario) || 0,
          costo_directo: Number(patchOrConcept.costoDirecto) || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', resolvedUid)
        .eq('proyecto_id', targetUuid);
      if (uErr) console.warn('[CloudProjectService] Error actualizando insumos de concepto:', uErr.message);

      try {
        const { data: existingIns } = await sb.from('insumos_apu').select('id').eq('concepto_id', resolvedUid);
        const keepSet = new Set(flatInsRows.map(r => r.id));
        const delIds = (Array.isArray(existingIns) ? existingIns : []).map(r => r?.id).filter(id => id && !keepSet.has(id));
        if (delIds.length > 0) await sb.from('insumos_apu').delete().in('id', delIds);
        if (flatInsRows.length > 0) await sb.from('insumos_apu').upsert(flatInsRows, { onConflict: 'id' });
      } catch (_) {}

      if (patchOrConcept.userClearedMatrix) {
        await updateArqNodesMetaInConfig(sb, targetUuid, { clearUuids: [resolvedUid] });
      } else {
        await updateArqNodesMetaInConfig(sb, targetUuid, { unclearUuids: [resolvedUid] });
      }
      return;
    }

    if (patchType === 'update_color') {
      const targetUuids = rawConceptId ? [rawConceptId] : await resolveConceptUuidsFromPatch(sb, targetUuid, patchOrConcept);
      if (targetUuids.length === 0) return;
      if (typeof window !== 'undefined' && typeof window.markLocalConceptsPushed === 'function') {
        window.markLocalConceptsPushed(targetUuids);
      }
      const { error } = await sb
        .from('catalogo_conceptos')
        .update({ color: patchOrConcept.color ?? null, updated_at: new Date().toISOString() })
        .in('id', targetUuids)
        .eq('proyecto_id', targetUuid);
      if (error) console.warn('[CloudProjectService] Error al actualizar color de concepto:', error.message);
      return;
    }

    if (patchType === 'delete_node' || patchType === 'delete_nodes') {
      const targetUuids = await resolveConceptUuidsFromPatch(sb, targetUuid, patchOrConcept);
      const deleteKeys = [
        ...targetUuids,
        patchOrConcept.id,
        patchOrConcept.clave,
        ...(Array.isArray(patchOrConcept.ids) ? patchOrConcept.ids : []),
        ...(Array.isArray(patchOrConcept.targets) ? patchOrConcept.targets.flatMap(t => [t?.id, t?.uuid, t?.clave]) : [])
      ].filter(Boolean);
      if (targetUuids.length === 0) return;

      const allToDelete = new Set(targetUuids);
      try {
        let frontier = [...targetUuids];
        while (frontier.length > 0) {
          const { data: children } = await sb
            .from('catalogo_conceptos')
            .select('id')
            .eq('proyecto_id', targetUuid)
            .in('parent_id', frontier);
          frontier = [];
          if (Array.isArray(children)) {
            children.forEach((c) => {
              if (c?.id && !allToDelete.has(c.id)) {
                allToDelete.add(c.id);
                frontier.push(c.id);
              }
            });
          }
        }
      } catch (_) {}

      const deleteList = Array.from(allToDelete);
      if (typeof window !== 'undefined' && typeof window.markLocalConceptsPushed === 'function') {
        window.markLocalConceptsPushed(deleteList);
      }
      await sb.from('insumos_apu').delete().in('concepto_id', deleteList);
      const { error: delErr } = await sb
        .from('catalogo_conceptos')
        .delete()
        .in('id', deleteList)
        .eq('proyecto_id', targetUuid);
      if (delErr) {
        console.warn('[CloudProjectService] Error al eliminar conceptos en la nube:', delErr.message);
      }
      await updateArqNodesMetaInConfig(sb, targetUuid, { deleteKeys: [...deleteKeys, ...deleteList] });
      return;
    }

    if (patchType === 'clear_matrix' || patchType === 'clear_matrices') {
      const targetUuids = await resolveConceptUuidsFromPatch(sb, targetUuid, patchOrConcept);
      if (targetUuids.length === 0) return;
      if (typeof window !== 'undefined' && typeof window.markLocalConceptsPushed === 'function') {
        window.markLocalConceptsPushed(targetUuids);
      }
      await sb.from('insumos_apu').delete().in('concepto_id', targetUuids);
      const { error: clrErr } = await sb
        .from('catalogo_conceptos')
        .update({
          insumos: [],
          precio_unitario: 0,
          costo_directo: 0,
          updated_at: new Date().toISOString()
        })
        .eq('proyecto_id', targetUuid)
        .in('id', targetUuids);
      if (clrErr) {
        console.warn('[CloudProjectService] Error al limpiar matriz en la nube:', clrErr.message);
      }
      await updateArqNodesMetaInConfig(sb, targetUuid, { clearUuids: targetUuids });
      return;
    }

    if (patchType === 'update_cotizaciones') {
      const targetUuids = rawConceptId ? [rawConceptId] : await resolveConceptUuidsFromPatch(sb, targetUuid, patchOrConcept);
      const resolvedUid = targetUuids[0] || '';
      if (resolvedUid) {
        if (typeof window !== 'undefined' && typeof window.markLocalConceptsPushed === 'function') {
          window.markLocalConceptsPushed([resolvedUid]);
        }
        const updateCols = {
          precio_unitario: Number(patchOrConcept.precioUnitario) || 0,
          costo_directo: Number(patchOrConcept.costoDirecto) || 0,
          updated_at: new Date().toISOString()
        };
        if (patchOrConcept.cantidad !== undefined) updateCols.cantidad = Number(patchOrConcept.cantidad) || 0;
        if (patchOrConcept.unidad) updateCols.unidad = String(patchOrConcept.unidad).slice(0, 30);
        const { error: cotErr } = await sb
          .from('catalogo_conceptos')
          .update(updateCols)
          .eq('id', resolvedUid)
          .eq('proyecto_id', targetUuid);
        if (cotErr) console.warn('[CloudProjectService] Error al actualizar cotización de concepto:', cotErr.message);
      }
      if (!patchOrConcept.deferAttachmentToCloud) {
        await updateArqNodesMetaInConfig(sb, targetUuid, { cotPatch: patchOrConcept, cotTargetUuid: resolvedUid });
      }
      return;
    }

    // Parches estructurales locales (altas/duplicados/movimientos): la autosincronización de árbol guarda orden y parent_id
    if (patchType) {
      return;
    }

    if (rawConceptId) {
      if (typeof window !== 'undefined' && typeof window.markLocalConceptsPushed === 'function') {
        window.markLocalConceptsPushed([rawConceptId]);
      }
      const { error } = await sb
        .from('catalogo_conceptos')
        .upsert({
          id: rawConceptId,
          proyecto_id: targetUuid,
          clave: patchOrConcept.clave || '',
          descripcion: patchOrConcept.descripcion || '',
          unidad: patchOrConcept.unidad || 'pza',
          cantidad: Number(patchOrConcept.cantidad) || 0,
          precio_unitario: Number(patchOrConcept.precioUnitario) || 0,
          costo_directo: Number(patchOrConcept.costoDirecto) || 0,
          color: patchOrConcept.color || null,
          insumos: Array.isArray(patchOrConcept.insumos) ? patchOrConcept.insumos : [],
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      if (error) console.warn('[CloudProjectService] Error al hacer upsert de concepto:', error.message);
      if (patchOrConcept.userClearedMatrix || (Array.isArray(patchOrConcept.insumos) && patchOrConcept.insumos.length === 0)) {
        await sb
          .from('insumos_apu')
          .delete()
          .eq('concepto_id', rawConceptId);
      }
    }
    } catch (err) {
      console.warn('[CloudProjectService] Error al actualizar concepto en Supabase:', err);
    }
  });
}

/**
 * Eliminar un proyecto en la nube y registrar tombstone persistente en Supabase (solo tablas reales de ADM_ARQ)
 */
export async function deleteProjectFromCloud(projectId, opts = {}) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId) {
    return { success: false, skipped: true };
  }

  try {
    const rawId = String(projectId).trim();
    const list = typeof getProjectsList === 'function' ? getProjectsList() : [];
    const proj = (opts?.project && typeof opts.project === 'object')
      ? opts.project
      : (Array.isArray(list) ? list.find(p => p && (p.id === rawId || p.cloudId === rawId)) : null);

    const resolvedUuid = resolveCloudProjectId(rawId);
    const targetUuid = resolvedUuid || (opts?.cloudId && isValidUUID(String(opts.cloudId)) ? String(opts.cloudId).trim() : '');
    const textIds = Array.from(new Set([rawId, targetUuid].filter(Boolean)));

    const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const deletedByEmail = String(opts?.deletedByEmail || currentUser?.email || '').toLowerCase().trim();
    const ownerEmail = String(opts?.ownerEmail || proj?.ownerEmail || deletedByEmail || '').toLowerCase().trim();
    const collabEmails = Array.from(new Set([
      ...(Array.isArray(proj?.members) ? proj.members.map(m => String(m?.email || '').toLowerCase().trim()) : []),
      ...(Array.isArray(opts?.collaboratorEmails) ? opts.collaboratorEmails.map(e => String(e || '').toLowerCase().trim()) : [])
    ].filter(Boolean)));

    const nowIso = new Date().toISOString();
    const tombstoneIds = Array.from(new Set([targetUuid, rawId].filter(Boolean)));
    if (tombstoneIds.length > 0) {
      const tombstoneRows = tombstoneIds.map(id => ({
        proyecto_id: id,
        owner_email: ownerEmail || deletedByEmail || null,
        deleted_by_email: deletedByEmail || ownerEmail || null,
        collaborator_emails: collabEmails,
        deleted_at: nowIso
      }));
      const { error: tombErr } = await sb
        .from('proyectos_eliminados')
        .upsert(tombstoneRows, { onConflict: 'proyecto_id' });
      if (tombErr) {
        console.warn('[CloudProjectService] Aviso guardando tombstone en proyectos_eliminados:', tombErr.message);
      }
    }

    await sb.from('chat_mensajes').delete().in('proyecto_id', textIds);

    if (isValidUUID(targetUuid)) {
      try {
        const { data: estRows } = await sb
          .from('estimaciones')
          .select('id')
          .eq('proyecto_id', targetUuid);
        const estIds = Array.isArray(estRows) ? estRows.map(r => r?.id).filter(Boolean) : [];
        if (estIds.length > 0) {
          await sb.from('estimacion_detalles').delete().in('estimacion_id', estIds);
        }
      } catch (_) {}

      try {
        const { data: cRows } = await sb
          .from('catalogo_conceptos')
          .select('id')
          .eq('proyecto_id', targetUuid);
        const cIds = Array.isArray(cRows) ? cRows.map(r => r?.id).filter(Boolean) : [];
        if (cIds.length > 0) {
          await sb.from('insumos_apu').delete().in('concepto_id', cIds);
        }
      } catch (_) {}

      const uuidTables = [
        'catalogo_conceptos',
        'proyecto_colaboradores',
        'estimaciones',
        'cronograma_actividades',
        'invitaciones'
      ];
      await Promise.allSettled(
        uuidTables.map(tbl => sb.from(tbl).delete().eq('proyecto_id', targetUuid))
      );

      const { error: delProjErr } = await sb.from('proyectos').delete().eq('id', targetUuid);
      if (delProjErr) {
        console.warn('[CloudProjectService] Error eliminando fila de proyectos:', delProjErr.message || delProjErr);
        return { success: false, error: delProjErr };
      }
    }

    invalidateCloudProjectsCache();
    return { success: true, deletedId: targetUuid || rawId };
  } catch (err) {
    console.warn('[CloudProjectService] Error al eliminar proyecto en la nube:', err);
    return { success: false, error: err };
  }
}

if (typeof window !== 'undefined') {
  window.syncProjectToCloud = syncProjectToCloud;
  window.fetchCloudProjects = fetchCloudProjects;
  window.invalidateCloudProjectsCache = invalidateCloudProjectsCache;
  window.getTrashedCloudProjectIds = getTrashedCloudProjectIds;
  window.getCachedTrashedCloudProjects = getCachedTrashedCloudProjects;
  window.loadProjectTreeFromCloud = loadProjectTreeFromCloud;
  window.addCollaboratorToCloud = addCollaboratorToCloud;
  window.updateCollaboratorRoleInCloud = updateCollaboratorRoleInCloud;
  window.syncProjectMemberTabsToCloud = syncProjectMemberTabsToCloud;
  window.removeCollaboratorFromCloud = removeCollaboratorFromCloud;
  window.updateCloudConcept = updateCloudConcept;
  window.deleteProjectFromCloud = deleteProjectFromCloud;
  window.addKnownCloudConceptIds = addKnownCloudConceptIds;
  window.markLocalConceptsDeleted = markLocalConceptsDeleted;
  window.isConceptConfirmedInCloud = isConceptConfirmedInCloud;
}
