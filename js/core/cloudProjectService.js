// js/core/cloudProjectService.js
// Servicio de persistencia y sincronización de Proyectos Arquitectónicos y Presupuestos con Supabase PostgreSQL
// Diseñado para operar en segundo plano con alta resiliencia y sincronización multiusuario en la nube.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js?v=20261116_cf5';
import { getCurrentUser, saveCurrentUser, getProjectsList, getUserPlanId } from '../modules/portal/projectService.js?v=20261116_cf5';
import { getSettingsKey } from '../config/constants.js?v=20261116_cf5';
import { fetchUserProfile, resolveUserDisplayName, resolveUserRoleLabel, buildFallbackAvatarSvg } from './authService.js?v=20261116_cf5';
import { showToast } from '../ui/notifications.js?v=20261116_cf5';

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
      if (n.id) out[String(n.id)] = meta;
      if (n.clave) out[String(n.clave)] = meta;
    }
    if (Array.isArray(n.children) && n.children.length > 0) {
      buildArqNodesMetaMap(n.children, out);
    }
  }
  return out;
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
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

  try {
    const { data: perfil } = await sb
      .from('perfiles')
      .select('id, empresa_id')
      .eq('id', user.id)
      .maybeSingle();

    if (perfil?.empresa_id && isValidUUID(perfil.empresa_id)) {
      user.empresaId = perfil.empresa_id;
      return perfil.empresa_id;
    }

    // Si aún no tiene empresa asignada, crear una por defecto
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
      await sb.from('perfiles').upsert({
        id: user.id,
        empresa_id: newEmpresa.id,
        nombre_completo: user.name || user.email,
        email: user.email,
        rol: 'owner'
      });
      return newEmpresa.id;
    }
  } catch (err) {
    console.warn('[CloudProjectService] Error resolviendo empresa_id:', err);
  }

  return null;
}

/**
 * Sincronizar un proyecto completo (datos generales, colaboradores y catálogo de conceptos) hacia Supabase PostgreSQL
 */
export async function syncProjectToCloud(project, settings = {}, treeData = null) {
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

    // Asegurar UUID válido para PostgreSQL
    const projectId = isValidUUID(project.id) ? project.id : (project.cloudId && isValidUUID(project.cloudId) ? project.cloudId : generateUUID());
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

    // 1. Guardar / Actualizar en tabla 'public.proyectos'
    const projectRecord = {
      id: projectId,
      empresa_id: empresaId || null,
      owner_email: ownerEmail,
      creado_por: user.id,
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
        const resolvedPlanId = project.ownerPlanId
          || safeSettings.ownerPlanId
          || (ownerEmail && typeof getUserPlanId === 'function' ? getUserPlanId(ownerEmail) : 'free')
          || 'free';
        const arqNodesMeta = Array.isArray(treeData)
          ? buildArqNodesMetaMap(treeData)
          : ((safeSettings.arqNodeMeta && typeof safeSettings.arqNodeMeta === 'object')
              ? safeSettings.arqNodeMeta
              : ((safeSettings.arqNodesMeta && typeof safeSettings.arqNodesMeta === 'object') ? safeSettings.arqNodesMeta : {}));
        const resolvedPresupuestoArq = project.presupuestoArq || settings?.presupuestoArq || safeSettings.presupuestoArq || null;
        return {
          ...safeSettings,
          ownerPlanId: resolvedPlanId,
          presupuestoArq: resolvedPresupuestoArq,
          arqNodeMeta: arqNodesMeta,
          arqNodesMeta,
          companyName: project.companyName || '',
          budgetSignatures: project.budgetSignatures || settings?.budgetSignatures || [],
          memberTabs: Array.isArray(project.members)
            ? project.members.reduce((acc, m) => {
                const em = (m?.email || '').toLowerCase().trim();
                if (em && Array.isArray(m.allowedTabs)) acc[em] = m.allowedTabs;
                return acc;
              }, { ...((safeSettings && safeSettings.memberTabs) || {}) })
            : ((safeSettings && safeSettings.memberTabs) || {})
        };
      })(),
      updated_at: new Date().toISOString()
    };

    const { error: projError } = await sb
      .from('proyectos')
      .upsert(projectRecord, { onConflict: 'id' });

    if (projError) {
      console.warn('[CloudProjectService] Error al guardar proyecto en Supabase:', projError.message);
      return { success: false, error: projError };
    }

    // 2. Registrar al propietario en 'public.proyecto_colaboradores' (garantiza acceso multiusuario)
    const ownerColab = {
      proyecto_id: projectId,
      email_colaborador: ownerEmail,
      nombre_colaborador: project.ownerName || user.name || 'Propietario',
      rol: 'owner',
      estado_invitacion: 'accepted',
      updated_at: new Date().toISOString()
    };
    await sb
      .from('proyecto_colaboradores')
      .upsert(ownerColab, { onConflict: 'proyecto_id,email_colaborador' });

    // 3. Sincronizar todos los colaboradores registrados en el proyecto
    if (Array.isArray(project.members) && project.members.length > 0) {
      for (const m of project.members) {
        const mEmail = (m.email || '').toLowerCase().trim();
        if (mEmail && mEmail !== ownerEmail) {
          const mRecord = {
            proyecto_id: projectId,
            email_colaborador: mEmail,
            nombre_colaborador: m.name || mEmail.split('@')[0],
            rol: m.role || 'editar',
            estado_invitacion: m.status === 'pending' ? 'pending' : 'accepted',
            updated_at: new Date().toISOString()
          };
          try {
            await sb
              .from('proyecto_colaboradores')
              .upsert(mRecord, { onConflict: 'proyecto_id,email_colaborador' });
          } catch (cErr) {
            console.warn('[CloudProjectService] Aviso upsert colaborador:', cErr);
          }
        }
      }
    }

    // 4. Si se proporcionó el árbol del catálogo, sincronizar partidas, conceptos, insumos y metadatos de arquitectura
    if (Array.isArray(treeData)) {
      await syncCatalogTreeToCloud(sb, projectId, treeData, { skipArqMeta: true });
    }

    return { success: true, projectId };
  } catch (err) {
    console.error('[CloudProjectService] Excepción al sincronizar proyecto con la nube:', err);
    return { success: false, error: err };
  }
}

/**
 * Aplanar y sincronizar el árbol jerárquico a 'public.catalogo_conceptos' y 'public.insumos_apu'
 */
export async function syncCatalogTreeToCloud(sb, projectId, treeData, options = {}) {
  if (!sb || !projectId || !Array.isArray(treeData)) return;

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

  // 1. Depurar conceptos/partidas eliminados localmente en Supabase
  try {
    const { data: existingConcepts } = await sb
      .from('catalogo_conceptos')
      .select('id')
      .eq('proyecto_id', projectId);

    const staleConceptIds = (Array.isArray(existingConcepts) ? existingConcepts : [])
      .map(r => r?.id)
      .filter(id => id && !keepConceptIds.has(id));

    for (let i = 0; i < staleConceptIds.length; i += BATCH_SIZE) {
      const staleChunk = staleConceptIds.slice(i, i + BATCH_SIZE);
      await sb.from('insumos_apu').delete().in('concepto_id', staleChunk);
      await sb.from('catalogo_conceptos').delete().in('id', staleChunk).eq('proyecto_id', projectId);
    }
  } catch (delErr) {
    console.warn('[CloudProjectService] Aviso al depurar conceptos eliminados:', delErr?.message || delErr);
  }

  // 2. Guardar conceptos en lotes de 100
  for (let i = 0; i < flatConcepts.length; i += BATCH_SIZE) {
    const chunk = flatConcepts.slice(i, i + BATCH_SIZE);
    const { error: cErr } = await sb
      .from('catalogo_conceptos')
      .upsert(chunk, { onConflict: 'id' });
    if (cErr) {
      console.warn('[CloudProjectService] Aviso al sincronizar lote de conceptos:', cErr.message);
    }
  }

  // 3. Guardar insumos en lotes de 100 y depurar huérfanos
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

  // 4. Persistir campos específicos de Arquitectura (cotizaciones, costo_proveedor, importe_calculado, schedule, avancePorcentaje, IDs locales)
  if (!options?.skipArqMeta && isValidUUID(projectId)) {
    try {
      const arqNodesMeta = buildArqNodesMetaMap(treeData);
      const { data: projRow } = await sb
        .from('proyectos')
        .select('configuracion')
        .eq('id', projectId)
        .maybeSingle();
      if (projRow) {
        const nextCfg = { ...(projRow.configuracion || {}), arqNodesMeta };
        delete nextCfg.apiKey;
        await sb.from('proyectos').update({ configuracion: nextCfg }).eq('id', projectId);
      }
    } catch (_) {}
  }
}

/**
 * Consultar los proyectos disponibles en Supabase para el usuario actual.
 * Utiliza RLS en PostgreSQL: devuelve todos los proyectos donde el usuario es
 * Propietario (owner_email) O Colaborador Invitado (proyecto_colaboradores).
 */
export async function fetchCloudProjects() {
  const sb = getSupabaseClient();
  const user = getCurrentUser();

  if (!isSupabaseConfigured() || !sb || !user?.id) {
    return [];
  }

  try {
    const myEmail = (user.email || '').toLowerCase().trim();

    // Consulta con join a proyecto_colaboradores (sin filtro por empresa_id para permitir colaboración inter-cuentas)
    const { data: cloudList, error } = await sb
      .from('proyectos')
      .select('*, proyecto_colaboradores(*)')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[CloudProjectService] Error al obtener proyectos de la nube:', error.message);
      return [];
    }

    if (!Array.isArray(cloudList)) return [];

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

    const isDeleted = (id) => {
      const sid = String(id || '').trim();
      return (Array.isArray(deletedList) && deletedList.includes(sid)) || cloudDeletedIds.has(sid);
    };

    return cloudList
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

        const ownerColab = rawColabs.find(c => c.rol === 'owner');
        const ownerEmail = (cp.owner_email || ownerColab?.email_colaborador || (cp.creado_por && cp.creado_por === user.id ? myEmail : '') || '').toLowerCase().trim();
        const isMyOwn = ownerEmail === myEmail || (cp.creado_por && cp.creado_por === user.id);
        const isMyCollab = rawColabs.some(c => (c.email_colaborador || '').toLowerCase().trim() === myEmail && c.estado_invitacion !== 'rejected');
        if (!isMyOwn && !isMyCollab) {
          return null;
        }
        const ownerName = ownerColab?.nombre_colaborador || (ownerEmail === myEmail ? (user.name || 'Propietario') : (ownerEmail ? ownerEmail.split('@')[0] : 'Propietario'));
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
  } catch (err) {
    console.error('[CloudProjectService] Excepción al consultar proyectos en la nube:', err);
    return [];
  }
}

/**
 * Descargar y reconstruir el árbol de catálogo desde Supabase PostgreSQL
 */
export async function loadProjectTreeFromCloud(projectId) {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid)) return null;

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

    concepts.forEach(c => {
      const rawMeta = arqNodesMeta[c.id] || (c.clave ? arqNodesMeta[String(c.clave)] : null);
      const meta = (rawMeta && typeof rawMeta === 'object') ? rawMeta : {};
      const isCleared = Boolean(meta.userClearedMatrix);
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
      return { success: false, error };
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
      return { success: false, error };
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
      return { success: false, error };
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
    await sb
      .from('proyecto_colaboradores')
      .delete()
      .eq('proyecto_id', targetUuid)
      .eq('email_colaborador', email.toLowerCase().trim());
  } catch (err) {
    console.warn('[CloudProjectService] Error removiendo colaborador en la nube:', err);
  }
}

/**
 * Actualizar una celda o concepto específico en Supabase (Persistencia de edición granular en vivo)
 */
export async function updateCloudConcept(projectId, patchOrConcept) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId || !patchOrConcept) return;

  const targetUuid = resolveCloudProjectId(projectId);
  if (!isValidUUID(targetUuid)) return;

  const rawConceptId = (patchOrConcept.uuid && isValidUUID(patchOrConcept.uuid))
    ? String(patchOrConcept.uuid).trim()
    : String(patchOrConcept.id || '').trim();
  if (!isValidUUID(rawConceptId)) return;

  try {
    if (patchOrConcept.type === 'update_field' && rawConceptId) {
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
      if (dbField) {
        const { error } = await sb
          .from('catalogo_conceptos')
          .update({ [dbField]: patchOrConcept.value, updated_at: new Date().toISOString() })
          .eq('id', rawConceptId)
          .eq('proyecto_id', targetUuid);
        if (error) console.warn('[CloudProjectService] Error al actualizar campo de concepto:', error.message);
      }
    } else if (rawConceptId) {
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

    return { success: true, deletedId: targetUuid || rawId };
  } catch (err) {
    console.warn('[CloudProjectService] Error al eliminar proyecto en la nube:', err);
    return { success: false, error: err };
  }
}

if (typeof window !== 'undefined') {
  window.syncProjectToCloud = syncProjectToCloud;
  window.fetchCloudProjects = fetchCloudProjects;
  window.loadProjectTreeFromCloud = loadProjectTreeFromCloud;
  window.addCollaboratorToCloud = addCollaboratorToCloud;
  window.updateCollaboratorRoleInCloud = updateCollaboratorRoleInCloud;
  window.syncProjectMemberTabsToCloud = syncProjectMemberTabsToCloud;
  window.removeCollaboratorFromCloud = removeCollaboratorFromCloud;
  window.updateCloudConcept = updateCloudConcept;
  window.deleteProjectFromCloud = deleteProjectFromCloud;
}
