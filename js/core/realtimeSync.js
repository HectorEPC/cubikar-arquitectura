// js/core/realtimeSync.js
// Sincronización en tiempo real vía WebSockets (Supabase Realtime) y Colaboración en vivo

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js?v=20261119_cf39';
import { state } from '../state/store.js?v=20261119_cf39';
import {
  getCurrentUser,
  getStoredInvitations,
  saveStoredInvitations,
  getStoredPlanInvitations,
  saveStoredPlanInvitations,
  getProjectsList,
  saveProjectsList,
  countTreeConcepts,
  countTreePartidas,
  calculateTreeTotal,
  markProjectDeleted,
  unmarkProjectDeleted,
  isProjectMarkedDeleted,
  markProjectTrashedLocal,
  unmarkProjectTrashedLocal,
  isProjectTrashedLocal,
  saveCurrentUser
} from '../modules/portal/projectService.js?v=20261119_cf39';
import { getActiveProjectId, getStorageKey, getSettingsKey } from '../config/constants.js?v=20261119_cf39';
import { findNodeById, recalculateClaves } from '../modules/catalog/treeService.js?v=20261119_cf39';
import { showToast } from '../ui/notifications.js?v=20261119_cf39';

let activeChannel = null;
let currentSubscribedProjectId = null;
let broadcastDebounceTimer = null;

let lastToastTime = 0;
let lastToastAuthor = '';
function showThrottledToast(message, type = 'info', author = '') {
  const now = Date.now();
  if (author && author === lastToastAuthor && now - lastToastTime < 4000) {
    return;
  }
  lastToastTime = now;
  lastToastAuthor = author;
  showToast(message, type);
}

let onRemoteConceptUpdated = null;
let onPresenceSyncCallback = null;

// Canal de transmisión local de baja latencia (0ms) entre pestañas y ventanas del mismo navegador
export const localBroadcastChannel = (typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function')
  ? new window.BroadcastChannel('cubikar_realtime_local_v1')
  : null;

if (localBroadcastChannel) {
  localBroadcastChannel.onmessage = (event) => {
    if (!event || !event.data) return;
    const { type, payload } = event.data;
    if (type === 'proyecto_actualizado') {
      handleIncomingProjectUpdate(payload);
    } else if (type === 'proyecto_eliminado') {
      handleIncomingProjectDeleted(payload);
    } else if (type === 'proyecto_en_papelera') {
      handleIncomingProjectTrashed(payload);
    } else if (type === 'proyecto_restaurado') {
      handleIncomingProjectRestored(payload);
    } else if (type === 'colaborador_removido') {
      handleIncomingCollaboratorRemoved(payload);
    } else if (type === 'chat_mensaje_nuevo') {
      handleIncomingChatMessage(payload);
    } else if (type === 'chat_mensaje_eliminado') {
      handleIncomingChatDelete(payload);
    }
  };
}

/**
 * Aplicar mutación granular a un árbol de conceptos en memoria o almacenamiento local
 */
export function applyTreePatch(tree, patch) {
  if (!Array.isArray(tree) || !patch || typeof patch !== 'object') return false;

  const type = patch.type;
  if (type === 'update_field') {
    const node = findNodeById(tree, patch.id)
      || (patch.uuid ? findNodeById(tree, patch.uuid) : null)
      || (patch.clave ? findNodeById(tree, patch.clave) : null);
    if (!node) return false;
    const f = patch.field;
    if (f === 'cantidad' || f === 'precioUnitario' || f === 'costoDirecto' || f === 'costo_proveedor' || f === 'porcentaje_relativo') {
      node[f] = Math.round(((Number(patch.value) || 0) + Number.EPSILON) * 100) / 100;
    } else {
      node[f] = patch.value;
    }
    return true;
  }

  if (type === 'add_root_row') {
    if (patch.node && patch.node.id) {
      const exists = tree.some(n => n.id === patch.node.id || (patch.node.uuid && n.uuid === patch.node.uuid));
      if (!exists) {
        tree.push(patch.node);
        if (typeof window !== 'undefined' && typeof window.addKnownCloudConceptIds === 'function') {
          window.addKnownCloudConceptIds(currentSubscribedProjectId, [patch.node.uuid || patch.node.id]);
        }
        return true;
      }
    }
    return false;
  }

  if (type === 'add_child_row') {
    const parent = (patch.parentUuid ? findNodeById(tree, patch.parentUuid) : null)
      || findNodeById(tree, patch.parentId)
      || (patch.parentClave ? findNodeById(tree, patch.parentClave) : null);
    if (parent && patch.node && patch.node.id) {
      if (!Array.isArray(parent.children)) parent.children = [];
      const exists = parent.children.some(n => n.id === patch.node.id || (patch.node.uuid && n.uuid === patch.node.uuid));
      if (!exists) {
        parent.children.push(patch.node);
        parent.expanded = true;
        if (typeof window !== 'undefined' && typeof window.addKnownCloudConceptIds === 'function') {
          window.addKnownCloudConceptIds(currentSubscribedProjectId, [patch.node.uuid || patch.node.id]);
        }
        return true;
      }
    }
    return false;
  }

function matchesPatchRef(node, ref) {
  if (!node || !ref) return false;
  if (ref.id && (node.id === ref.id || node.uuid === ref.id)) return true;
  if (ref.uuid && (node.uuid === ref.uuid || node.id === ref.uuid)) return true;
  if (ref.clave && node.clave === ref.clave) return true;
  return false;
}

function findPatchTargetNode(tree, patch) {
  return findNodeById(tree, patch.id)
    || (patch.uuid ? findNodeById(tree, patch.uuid) : null)
    || (patch.clave ? findNodeById(tree, patch.clave) : null);
}

function applyClearMatrixToNode(node) {
  if (!node || typeof node !== 'object') return;
  node.insumos = [];
  node.isMatrixCustomized = true;
  node.userClearedMatrix = true;
  node.costoDirecto = 0;
  node.precioUnitario = 0;
  node.aiTips = '';
  node.googleSources = [];
  node.googleSearchQueries = [];
  node._generationMode = null;
}

  if (type === 'delete_node') {
    function removeRecursive(nodes) {
      const idx = nodes.findIndex(n => matchesPatchRef(n, patch));
      if (idx !== -1) {
        nodes.splice(idx, 1);
        return true;
      }
      for (let n of nodes) {
        if (Array.isArray(n.children) && removeRecursive(n.children)) return true;
      }
      return false;
    }
    return removeRecursive(tree);
  }

  if (type === 'delete_nodes') {
    const refSet = new Set([
      ...(Array.isArray(patch.ids) ? patch.ids : []),
      ...(Array.isArray(patch.uuids) ? patch.uuids : [])
    ].filter(Boolean));
    const targets = Array.isArray(patch.targets) ? patch.targets : [];
    function removeMultiple(nodes) {
      let changed = false;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const cur = nodes[i];
        const hit = refSet.has(cur.id)
          || (cur.uuid && refSet.has(cur.uuid))
          || targets.some(t => matchesPatchRef(cur, t));
        if (hit) {
          nodes.splice(i, 1);
          changed = true;
        } else if (Array.isArray(cur.children)) {
          if (removeMultiple(cur.children)) changed = true;
        }
      }
      return changed;
    }
    return removeMultiple(tree);
  }

  if (type === 'clear_matrix') {
    const node = findPatchTargetNode(tree, patch);
    if (!node) return false;
    applyClearMatrixToNode(node);
    return true;
  }

  if (type === 'clear_matrices') {
    const refSet = new Set([
      ...(Array.isArray(patch.ids) ? patch.ids : []),
      ...(Array.isArray(patch.uuids) ? patch.uuids : [])
    ].filter(Boolean));
    const targets = Array.isArray(patch.targets) ? patch.targets : [];
    let changed = false;
    function clearWalk(nodes) {
      for (const n of nodes) {
        if (!n) continue;
        const hit = refSet.has(n.id)
          || (n.uuid && refSet.has(n.uuid))
          || targets.some(t => matchesPatchRef(n, t));
        if (hit) {
          applyClearMatrixToNode(n);
          changed = true;
        }
        if (Array.isArray(n.children)) clearWalk(n.children);
      }
    }
    clearWalk(tree);
    return changed;
  }

  if (type === 'update_cotizaciones') {
    const node = findPatchTargetNode(tree, patch);
    if (!node) return false;
    const prevById = new Map((Array.isArray(node.cotizaciones) ? node.cotizaciones : []).map(c => [c?.id, c]));
    if (Array.isArray(patch.cotizaciones)) {
      node.cotizaciones = patch.cotizaciones.map(c => {
        const copy = { ...c };
        if (patch.deferAttachmentToCloud && !copy.archivoData && prevById.get(copy.id)?.archivoData) {
          copy.archivoData = prevById.get(copy.id).archivoData;
        }
        return copy;
      });
    }
    if (patch.proveedorElegidoId) node.proveedorElegidoId = patch.proveedorElegidoId;
    else delete node.proveedorElegidoId;
    if (patch.proveedorElegidoNombre) node.proveedorElegidoNombre = patch.proveedorElegidoNombre;
    else delete node.proveedorElegidoNombre;
    if (patch.costo_proveedor !== undefined && patch.costo_proveedor !== null) node.costo_proveedor = patch.costo_proveedor;
    else delete node.costo_proveedor;
    if (patch.precioUnitario !== undefined) node.precioUnitario = Number(patch.precioUnitario) || 0;
    if (patch.costoDirecto !== undefined) node.costoDirecto = Number(patch.costoDirecto) || 0;
    if (patch.cantidad !== undefined && Number(patch.cantidad) > 0) node.cantidad = Number(patch.cantidad);
    if (patch.unidad) node.unidad = patch.unidad;
    if (patch.importe_calculado !== undefined && patch.importe_calculado !== null) node.importe_calculado = patch.importe_calculado;
    else delete node.importe_calculado;
    if (typeof window !== 'undefined' && typeof window.calculateProrrateoCascade === 'function') {
      try { window.calculateProrrateoCascade(tree); } catch (_) {}
    }
    return true;
  }

  if (type === 'duplicate_node') {
    if (!patch.clonedNode) return false;
    const clonedUid = patch.clonedNode.uuid || patch.clonedNode.id;
    if (findNodeById(tree, clonedUid) || findNodeById(tree, patch.clonedNode.id)) return false;
    function insertCloned(nodes) {
      const idx = nodes.findIndex(n => matchesPatchRef(n, patch));
      if (idx !== -1) {
        nodes.splice(idx + 1, 0, JSON.parse(JSON.stringify(patch.clonedNode)));
        if (typeof window !== 'undefined' && typeof window.addKnownCloudConceptIds === 'function') {
          window.addKnownCloudConceptIds(currentSubscribedProjectId, [clonedUid]);
        }
        return true;
      }
      for (let n of nodes) {
        if (Array.isArray(n.children) && insertCloned(n.children)) return true;
      }
      return false;
    }
    if (insertCloned(tree)) return true;
    const parentFallback = (patch.parentUuid ? findNodeById(tree, patch.parentUuid) : null)
      || (patch.parentId ? findNodeById(tree, patch.parentId) : null);
    const targetList = parentFallback ? (parentFallback.children = parentFallback.children || []) : tree;
    targetList.push(JSON.parse(JSON.stringify(patch.clonedNode)));
    return true;
  }

  if (type === 'paste_node') {
    if (!patch.node) return false;
    const pastedUid = patch.node.uuid || patch.node.id;
    if (findNodeById(tree, pastedUid) || findNodeById(tree, patch.node.id)) return false;
    const pastedCopy = JSON.parse(JSON.stringify(patch.node));
    const targetRef = { id: patch.targetId, uuid: patch.targetUuid, clave: patch.targetClave };
    function insertAfterTarget(nodes) {
      const idx = nodes.findIndex(n => matchesPatchRef(n, targetRef));
      if (idx !== -1) {
        nodes.splice(idx + 1, 0, pastedCopy);
        return true;
      }
      for (const n of nodes) {
        if (Array.isArray(n.children) && insertAfterTarget(n.children)) return true;
      }
      return false;
    }
    let inserted = (patch.targetId || patch.targetUuid || patch.targetClave) ? insertAfterTarget(tree) : false;
    if (!inserted) {
      const pNode = (patch.parentUuid ? findNodeById(tree, patch.parentUuid) : null)
        || (patch.parentId ? findNodeById(tree, patch.parentId) : null);
      const list = pNode ? (pNode.children = pNode.children || []) : tree;
      const pos = (typeof patch.position === 'number' && patch.position >= 0 && patch.position <= list.length)
        ? patch.position
        : list.length;
      list.splice(pos, 0, pastedCopy);
    }
    if (typeof window !== 'undefined' && typeof window.addKnownCloudConceptIds === 'function') {
      window.addKnownCloudConceptIds(currentSubscribedProjectId, [pastedUid]);
    }
    try { recalculateClaves(tree); } catch (_) {}
    return true;
  }

  if (type === 'update_insumos') {
    const node = findPatchTargetNode(tree, patch);
    if (!node) return false;
    node.insumos = Array.isArray(patch.insumos) ? JSON.parse(JSON.stringify(patch.insumos)) : [];
    if (patch.precioUnitario !== undefined) node.precioUnitario = Number(patch.precioUnitario) || 0;
    if (patch.costoDirecto !== undefined) node.costoDirecto = Number(patch.costoDirecto) || 0;
    if (patch.userClearedMatrix !== undefined) node.userClearedMatrix = Boolean(patch.userClearedMatrix);
    if (patch.isMatrixCustomized !== undefined) node.isMatrixCustomized = Boolean(patch.isMatrixCustomized);
    if (typeof window !== 'undefined' && typeof window.calculateProrrateoCascade === 'function') {
      try { window.calculateProrrateoCascade(tree); } catch (_) {}
    }
    return true;
  }

  if (type === 'move_node') {
    if (patch.targetParentId !== undefined || patch.newIndex !== undefined) {
      let movedNode = null;
      function extractNode(nodes) {
        const idx = nodes.findIndex(n => n.id === patch.id);
        if (idx !== -1) {
          movedNode = nodes.splice(idx, 1)[0];
          return true;
        }
        for (let n of nodes) {
          if (Array.isArray(n.children) && extractNode(n.children)) return true;
        }
        return false;
      }
      if (!extractNode(tree) || !movedNode) return false;
      let targetList = tree;
      if (patch.targetParentId) {
        const parentNode = findNodeById(tree, patch.targetParentId);
        if (!parentNode) return false;
        if (!Array.isArray(parentNode.children)) parentNode.children = [];
        parentNode.expanded = true;
        targetList = parentNode.children;
      }
      const insertIdx = typeof patch.newIndex === 'number'
        ? Math.max(0, Math.min(patch.newIndex, targetList.length))
        : targetList.length;
      targetList.splice(insertIdx, 0, movedNode);
      return true;
    }
    function moveInArray(nodes) {
      const idx = nodes.findIndex(n => n.id === patch.id);
      if (idx !== -1) {
        if (patch.direction === 'up' && idx > 0) {
          const temp = nodes[idx - 1];
          nodes[idx - 1] = nodes[idx];
          nodes[idx] = temp;
          return true;
        } else if (patch.direction === 'down' && idx < nodes.length - 1) {
          const temp = nodes[idx + 1];
          nodes[idx + 1] = nodes[idx];
          nodes[idx] = temp;
          return true;
        }
        return false;
      }
      for (let n of nodes) {
        if (Array.isArray(n.children) && moveInArray(n.children)) return true;
      }
      return false;
    }
    return moveInArray(tree);
  }

  if (type === 'update_color') {
    const node = findPatchTargetNode(tree, patch);
    if (node) {
      if (patch.color) node.color = patch.color;
      else delete node.color;
      return true;
    }
  }

  return false;
}

export function registerRealtimeCallbacks({ onConceptUpdate, onPresenceSync }) {
  if (onConceptUpdate) onRemoteConceptUpdated = onConceptUpdate;
  if (onPresenceSync) onPresenceSyncCallback = onPresenceSync;
}

/**
 * Actualiza los avatares e indicador visual de presencia en la cabecera
 */
export function updateRealtimePresenceUI(activeUsers = []) {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('header-supabase-realtime');
  const label = document.getElementById('header-supabase-realtime-label');
  const avatarsEl = document.getElementById('header-realtime-active-avatars');

  if (!badge) return;

  const count = activeUsers.length;
  if (label) {
    label.textContent = count > 1 ? `En Vivo (${count})` : 'En Vivo';
  }

  if (avatarsEl) {
    avatarsEl.innerHTML = activeUsers.slice(0, 4).map(u => {
      const name = u.name || u.email || 'Usuario';
      const initial = name.charAt(0).toUpperCase();
      if (u.avatar) {
        return `<img src="${u.avatar}" title="${name} (activo ahora)" class="w-4 h-4 rounded-full border border-slate-900 object-cover">`;
      }
      return `<div title="${name} (activo ahora)" class="w-4 h-4 rounded-full bg-blue-600 border border-slate-900 text-[8px] font-bold text-white flex items-center justify-center">${initial}</div>`;
    }).join('');
  }
}

/**
 * Conectar al canal en tiempo real de una obra en particular
 */
export function subscribeToProjectRealtime(projectId) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId) {
    return;
  }

  const allProjects = getProjectsList();
  const proj = allProjects.find(p => p.id === projectId || p.cloudId === projectId);
  const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || '').trim());
  const canonicalCloudId = (proj?.cloudId && isUuid(proj.cloudId))
    ? String(proj.cloudId).trim()
    : (isUuid(proj?.id) ? String(proj.id).trim() : String(projectId).trim());

  // Evitar suscripciones duplicadas al mismo proyecto (por ID local o cloudId)
  if (activeChannel && (currentSubscribedProjectId === projectId || currentSubscribedProjectId === canonicalCloudId)) {
    return;
  }

  unsubscribeFromProjectRealtime();
  currentSubscribedProjectId = projectId;
  const channelName = `obra_${canonicalCloudId}`;

  activeChannel = sb.channel(channelName, {
    config: {
      // Canal privado: Supabase valida en realtime.messages que el usuario sea miembro de la obra
      private: CUBIKAR_PRIVATE_REALTIME,
      broadcast: { ack: true },
      presence: {
        key: getCurrentUser()?.id || `user_${Math.random().toString(36).substring(2, 7)}`
      }
    }
  });

  // 1. Escuchar actualizaciones completas del proyecto en tiempo real (P2P < 30ms)
  activeChannel.on('broadcast', { event: 'proyecto_actualizado' }, (payload) => {
    if (payload?.payload) {
      handleIncomingProjectUpdate(payload.payload);
    }
  });

  // Escuchar transmisiones directas de un concepto editado
  activeChannel.on('broadcast', { event: 'concepto_editado' }, (payload) => {
    if (payload?.payload) {
      handleIncomingConceptUpdate(payload.payload);
    }
  });

  // Escuchar mensajes de chat del proyecto en tiempo real (<30ms)
  activeChannel.on('broadcast', { event: 'chat_mensaje_nuevo' }, (payload) => {
    if (payload?.payload) {
      handleIncomingChatMessage(payload.payload);
    }
  });

  // Escuchar eliminación de mensajes de chat en tiempo real
  activeChannel.on('broadcast', { event: 'chat_mensaje_eliminado' }, (payload) => {
    if (payload?.payload) {
      handleIncomingChatDelete(payload.payload);
    }
  });

  // Escuchar eliminación de este proyecto en tiempo real
  activeChannel.on('broadcast', { event: 'proyecto_eliminado' }, (payload) => {
    if (payload?.payload) {
      handleVerifiedProjectRemoval(payload.payload, handleIncomingProjectDeleted);
    }
  });

  // Escuchar remoción de colaboradores en tiempo real
  activeChannel.on('broadcast', { event: 'colaborador_removido' }, (payload) => {
    if (payload?.payload) {
      handleVerifiedCollaboratorRemoved(payload.payload);
    }
  });

  // 2. Escuchar cambios de base de datos en 'catalogo_conceptos' (Postgres CDC solo si hay UUID válido)
  if (isUuid(canonicalCloudId)) {
    activeChannel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'catalogo_conceptos',
        filter: `proyecto_id=eq.${canonicalCloudId}`
      },
      (payload) => {
        if (payload?.eventType === 'DELETE') {
          const oldId = payload?.old?.id;
          if (oldId && !isRecentlyPushedLocally(oldId)) {
            if (applyTreePatch(state.treeData, { type: 'delete_node', id: oldId, uuid: oldId })) {
              try {
                const activePId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;
                if (activePId) localStorage.setItem(getStorageKey(activePId), JSON.stringify(state.treeData));
              } catch (_) {}
              if (typeof window.recalculateClaves === 'function') {
                try { window.recalculateClaves(state.treeData); } catch (_) {}
              }
              if (typeof window.calculateProrrateoCascade === 'function') {
                try { window.calculateProrrateoCascade(state.treeData); } catch (_) {}
              }
              if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
              if (typeof window.renderTAB1 === 'function') window.renderTAB1();
            }
          }
          return;
        }
        if (payload?.new && payload.new.id) {
          handleIncomingConceptUpdate(payload.new, payload.eventType);
        }
      }
    );
  }

  // 3. Escuchar cambios en matrices de insumos APU
  activeChannel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'insumos_apu'
    },
    (payload) => {
      window.dispatchEvent(new CustomEvent('remote-apu-change', { detail: payload }));
    }
  );

  // 3B. Escuchar mensajes de chat directos en 'chat_mensajes' (Postgres CDC)
  const handleChatCdcPayload = (payload) => {
    const stripPrefix = (rawVal) => String(rawVal || '').replace(/^.*?(?:__|::)/, '');
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new;
      if (!row || (row.proyecto_id && String(row.proyecto_id).startsWith('__'))) return;
      const rawJson = (row.payload_json && typeof row.payload_json === 'object')
        ? row.payload_json
        : ((row.datos_json && typeof row.datos_json === 'object') ? row.datos_json : null);
      const cleanMsgId = stripPrefix(rawJson?.id || row.id);
      if (
        rawJson?.senderSessionId === LOCAL_CLIENT_SESSION_ID ||
        isRecentlyPushedLocally(cleanMsgId) ||
        isRecentlyPushedLocally(row.id)
      ) {
        return;
      }
      const msg = rawJson && (rawJson.id || cleanMsgId)
        ? {
            ...rawJson,
            id: cleanMsgId,
            mentions: (Array.isArray(rawJson.mentions) && rawJson.mentions.length > 0)
              ? rawJson.mentions
              : (Array.isArray(row.etiquetas) ? row.etiquetas : [])
          }
        : {
            id: cleanMsgId,
            text: row.mensaje || row.texto || '',
            mentions: Array.isArray(row.etiquetas) ? row.etiquetas : [],
            authorName: row.autor_nombre || 'Colaborador',
            authorEmail: row.autor_email || '',
            authorAvatar: row.autor_avatar_url || row.autor_avatar || '',
            createdAt: row.created_at || row.creado_en || new Date().toISOString()
          };
      handleIncomingChatMessage({
        projectId: row.proyecto_id || canonicalCloudId || projectId,
        senderSessionId: msg.senderSessionId || null,
        author: {
          email: row.autor_email || msg.authorEmail || '',
          name: row.autor_nombre || msg.authorName || 'Colaborador',
          avatar: row.autor_avatar_url || row.autor_avatar || msg.authorAvatar || ''
        },
        message: msg
      });
    } else if (payload.eventType === 'DELETE' && payload.old?.id) {
      handleIncomingChatDelete({
        projectId: payload.old.proyecto_id || canonicalCloudId || projectId,
        messageId: stripPrefix(payload.old.id)
      });
    }
  };

  const chatCdcIds = Array.from(new Set([canonicalCloudId, projectId].filter(Boolean)));
  chatCdcIds.forEach((cid) => {
    activeChannel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_mensajes',
        filter: `proyecto_id=eq.${cid}`
      },
      handleChatCdcPayload
    );
  });

  // 4. Sincronización de presencia de usuarios (quién está en la obra)
  activeChannel.on('presence', { event: 'sync' }, () => {
    if (!activeChannel) return;
    const presenceState = activeChannel.presenceState();
    const activeUsers = Object.values(presenceState).flat();
    updateRealtimePresenceUI(activeUsers);
    if (onPresenceSyncCallback) {
      onPresenceSyncCallback(activeUsers);
    }
  });

  const channelRef = activeChannel;
  channelRef.subscribe(async (status) => {
    if (activeChannel !== channelRef || !activeChannel) return;
    if (status === 'SUBSCRIBED') {
      console.info(`[Realtime] Conectado al canal WebSocket de la obra: ${canonicalCloudId}`);
      setTimeout(() => { hydrateProjectChatFromCloud(projectId); }, 350);
      const user = getCurrentUser();
      if (user && activeChannel === channelRef && typeof activeChannel.track === 'function') {
        await activeChannel.track({
          userId: user.id || user.email,
          name: user.name || 'Usuario de Obra',
          email: user.email || '',
          avatar: user.avatar || '',
          joinedAt: new Date().toISOString()
        });
      }
    }
  });
}

/**
 * Emitir broadcast de mutación de proyecto en tiempo real (cambio de texto, adición, eliminación de fila, APU)
 * a todos los colaboradores y anfitriones conectados al canal de la obra y global.
 */
export function broadcastProjectMutation({
  projectId,
  treeData,
  settings,
  immediate = false,
  changeType = 'general',
  highlightId = null,
  changeDescription = 'cambios en el catálogo',
  patch = null,
  postCloudSync = false
} = {}) {
  const pId = projectId || currentSubscribedProjectId || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null);
  if (!pId) return;

  const currentUser = getCurrentUser();
  const author = {
    id: currentUser?.id || null,
    name: currentUser?.name || 'Colaborador',
    email: (currentUser?.email || '').toLowerCase().trim(),
    avatar: currentUser?.avatar || ''
  };

  const sendPayload = () => {
    let safeTreeData = null;
    let treeTooLarge = false;
    let treePendingCloudSync = false;
    // Nunca enviar árbol completo en mutaciones con patch ni en cambios de solo settings
    if (!patch && changeType !== 'settings_updated' && Array.isArray(treeData)) {
      try {
        const raw = JSON.stringify(treeData);
        if (raw.length < 180000) {
          safeTreeData = treeData;
        } else if (postCloudSync) {
          treeTooLarge = true;
        } else {
          treePendingCloudSync = true;
        }
      } catch (_) {}
    }

    const payload = {
      projectId: pId,
      treeData: safeTreeData,
      treeTooLarge,
      treePendingCloudSync,
      postCloudSync: Boolean(postCloudSync),
      patch: patch || null,
      settings: settings && typeof settings === 'object' ? settings : null,
      summary: {
        totalPresupuesto: typeof calculateTreeTotal === 'function' && Array.isArray(treeData) ? calculateTreeTotal(treeData) : 0,
        conceptCount: typeof countTreeConcepts === 'function' && Array.isArray(treeData) ? countTreeConcepts(treeData) : 0,
        partidasCount: typeof countTreePartidas === 'function' && Array.isArray(treeData) ? countTreePartidas(treeData) : 0,
        factorSobrecosto: settings?.applySobrecosto ? (Number(settings?.factorSobrecosto) || 1.2584) : 1.0
      },
      changeType,
      highlightId,
      changeDescription,
      author,
      senderSessionId: LOCAL_CLIENT_SESSION_ID,
      timestamp: Date.now()
    };

    // 0. Enviar localmente a otras pestañas/ventanas del navegador (0ms latencia)
    if (localBroadcastChannel) {
      try {
        localBroadcastChannel.postMessage({
          type: 'proyecto_actualizado',
          payload
        });
      } catch (_) {}
    }

    const sb = getSupabaseClient();
    if (!isSupabaseConfigured() || !sb) return;

    // 1. Enviar vía canal de la obra activa (latencia < 30ms para quienes tienen la obra abierta)
    if (activeChannel) {
      try {
        activeChannel.send({
          type: 'broadcast',
          event: 'proyecto_actualizado',
          payload
        });
      } catch (err) {
        console.warn('[Realtime] Aviso al emitir en canal de obra:', err);
      }
    }

    // 2. Enviar vía canal global solo metadata ligera para el dashboard (nunca enviamos safeTreeData al canal global si estamos editando)
    if (!globalSyncChannel) initGlobalRealtimeSync();
    if (globalSyncChannel) {
      try {
        const globalPayload = Object.assign({}, payload, { treeData: null });
        globalSyncChannel.send({
          type: 'broadcast',
          event: 'proyecto_actualizado_global',
          payload: globalPayload
        });
      } catch (err) {
        console.warn('[Realtime] Aviso al emitir en canal global:', err);
      }
    }

    // 3. Si el cambio incluye un patch granular, persistir en Supabase PostgreSQL
    if (patch) {
      try {
        if (typeof window !== 'undefined' && typeof window.updateCloudConcept === 'function') {
          window.updateCloudConcept(pId, patch);
        }
      } catch (_) {}
    }
  };

  if (immediate) {
    if (broadcastDebounceTimer) {
      clearTimeout(broadcastDebounceTimer);
      broadcastDebounceTimer = null;
    }
    sendPayload();
    return;
  }

  if (broadcastDebounceTimer) clearTimeout(broadcastDebounceTimer);
  broadcastDebounceTimer = setTimeout(() => {
    broadcastDebounceTimer = null;
    sendPayload();
  }, 300);
}

const recentlyHandledProjectMutations = new Map();

/**
 * Procesar actualización entrante de proyecto emitida por otro usuario en tiempo real
 */
export function handleIncomingProjectUpdate(data) {
  if (!data || !data.projectId) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const authorEmail = (data.author?.email || '').toLowerCase().trim();

  // Si el cambio fue emitido por esta misma pestaña/sesión, ignorar para evitar bucles de actualización
  if (data.senderSessionId && data.senderSessionId === LOCAL_CLIENT_SESSION_ID) {
    return;
  }

  // Evitar doble ejecución cuando llega simultáneamente por canal de obra y canal global
  if (data.senderSessionId && data.timestamp) {
    const dedupeKey = `${data.senderSessionId}:${data.timestamp}:${data.changeType || ''}:${data.postCloudSync ? '1' : '0'}`;
    const now = Date.now();
    if (recentlyHandledProjectMutations.has(dedupeKey)) {
      return;
    }
    recentlyHandledProjectMutations.set(dedupeKey, now);
    if (recentlyHandledProjectMutations.size > 100) {
      for (const [k, t] of recentlyHandledProjectMutations.entries()) {
        if (now - t > 15000) recentlyHandledProjectMutations.delete(k);
      }
    }
  }

  const projectId = data.projectId;
  if (
    (typeof isProjectMarkedDeleted === 'function' && (isProjectMarkedDeleted(projectId) || (data.project?.cloudId && isProjectMarkedDeleted(data.project.cloudId))))
  ) {
    return;
  }

  const isAuthorizedProject = (p) => {
    if (!p) return false;
    const oEmail = (p.ownerEmail || '').toLowerCase().trim();
    if (oEmail === myEmail) return true;
    return Array.isArray(p.members) && p.members.some(m => (m?.email || '').toLowerCase().trim() === myEmail && m.status !== 'rejected');
  };

  const currentPId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;

  const allProjects = getProjectsList();
  let projIdx = allProjects.findIndex(p => p.id === projectId || (p.cloudId && p.cloudId === projectId));

  // Solo aceptar un proyecto nuevo por realtime si pertenece al usuario actual o si ya lo tiene abierto en el área de trabajo
  if (projIdx < 0) {
    if (data.project && data.project.id && isAuthorizedProject(data.project)) {
      allProjects.unshift(data.project);
      projIdx = 0;
    } else if (!currentPId || currentPId !== projectId) {
      return;
    }
  }

  let proj = projIdx >= 0 ? allProjects[projIdx] : null;
  if (proj && !isAuthorizedProject(proj) && currentPId !== projectId && currentPId !== proj.id && currentPId !== proj.cloudId) {
    return;
  }
  const effectiveStorageId = proj?.id || projectId;

  // Actualizar resumen en la lista de proyectos
  if (proj) {
    if (data.summary) {
      if (data.summary.totalPresupuesto !== undefined) proj.totalPresupuesto = data.summary.totalPresupuesto;
      if (data.summary.conceptCount !== undefined) proj.conceptCount = data.summary.conceptCount;
      if (data.summary.partidasCount !== undefined) proj.partidasCount = data.summary.partidasCount;
      if (data.summary.factorSobrecosto !== undefined) proj.factorSobrecosto = data.summary.factorSobrecosto;
    }
    proj.updatedAt = new Date().toISOString();
    saveProjectsList(allProjects, { skipCloudSync: true });
  }

  const isCurrentActive = Boolean(currentPId && (currentPId === projectId || (proj && (currentPId === proj.id || currentPId === proj.cloudId))));

  // 1. Aplicar mutación al árbol local (memoria y localStorage)
  let treeMutated = false;
  if (data.patch) {
    if (isCurrentActive && Array.isArray(state.treeData)) {
      treeMutated = applyTreePatch(state.treeData, data.patch);
    }
    try {
      const storageKey = getStorageKey(effectiveStorageId);
      const rawTree = localStorage.getItem(storageKey);
      if (rawTree) {
        const parsedTree = JSON.parse(rawTree);
        if (Array.isArray(parsedTree)) {
          if (applyTreePatch(parsedTree, data.patch)) {
            localStorage.setItem(storageKey, JSON.stringify(parsedTree));
          }
        }
      }
    } catch (_) {}
  }

  if (!data.patch && data.changeType !== 'settings_updated' && Array.isArray(data.treeData)) {
    try {
      localStorage.setItem(getStorageKey(effectiveStorageId), JSON.stringify(data.treeData));
    } catch (_) {}
    if (isCurrentActive) {
      state.treeData = JSON.parse(JSON.stringify(data.treeData));
      treeMutated = true;
    }
  } else if (data.treeTooLarge && !data.patch && data.postCloudSync !== false && typeof window !== 'undefined' && typeof window.loadProjectTreeFromCloud === 'function') {
    window.loadProjectTreeFromCloud(effectiveStorageId).then((cloudTree) => {
      if (Array.isArray(cloudTree)) {
        try {
          localStorage.setItem(getStorageKey(effectiveStorageId), JSON.stringify(cloudTree));
        } catch (_) {}
        if (isCurrentActive) {
          state.treeData = JSON.parse(JSON.stringify(cloudTree));
          if (typeof window.calculateProrrateoCascade === 'function') {
            try { window.calculateProrrateoCascade(state.treeData); } catch (_) {}
          }
          if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
          if (typeof window.renderTAB1 === 'function') window.renderTAB1();
          if (state.activeSelectedId) {
            const sel = typeof findNodeById === 'function' ? findNodeById(state.treeData, state.activeSelectedId) : null;
            if (sel) {
              if (typeof window.renderAPUInsumos === 'function') window.renderAPUInsumos(sel, { skipPersist: true });
              if (typeof window.renderInsumosUnitarios === 'function') window.renderInsumosUnitarios(sel);
              if (typeof window.renderCotizacionesSidePanel === 'function') window.renderCotizacionesSidePanel(sel);
            } else if (typeof window.closeApuPanel === 'function') {
              window.closeApuPanel();
            }
          }
        }
      }
    }).catch(() => {});
  }

  if (data.settings && typeof data.settings === 'object') {
    try {
      localStorage.setItem(getSettingsKey(effectiveStorageId), JSON.stringify(data.settings));
    } catch (_) {}
    if (isCurrentActive) {
      state.settings = Object.assign({}, state.settings, data.settings);
    }
  }

  // Si el usuario tiene actualmente abierta esta misma obra en el espacio de trabajo
  const isStructuralChange = (
    ['row_added', 'row_deleted', 'row_moved', 'partida_added', 'concept_added', 'node_deleted', 'tree_replaced', 'import'].includes(String(data.changeType || ''))
    || ['add_root_row', 'add_child_row', 'add_node', 'delete_node', 'delete_nodes', 'duplicate_node', 'paste_node', 'move_node', 'replace_tree', 'insert_node'].includes(String(data.patch?.type || ''))
  );
  if (isCurrentActive) {
    if (isStructuralChange && typeof window.recalculateClaves === 'function' && Array.isArray(state.treeData)) {
      try { window.recalculateClaves(state.treeData); } catch (_) {}
    }
    if (typeof window.calculateProrrateoCascade === 'function' && Array.isArray(state.treeData)) {
      try { window.calculateProrrateoCascade(state.treeData); } catch (_) {}
    }
    if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
    if (typeof window.renderTAB1 === 'function') window.renderTAB1();

    const targetHighlight = data.highlightId || (data.patch && data.patch.id);
    if (targetHighlight && typeof window.highlightCatalogRowInPlace === 'function') {
      window.highlightCatalogRowInPlace(targetHighlight);
    }

    if (state.activeSelectedId) {
      const stillExists = typeof findNodeById === 'function' ? findNodeById(state.treeData, state.activeSelectedId) : null;
      if (stillExists) {
        if (typeof window.renderAPUInsumos === 'function') window.renderAPUInsumos(stillExists, { skipPersist: true });
        if (typeof window.renderInsumosUnitarios === 'function') window.renderInsumosUnitarios(stillExists);
        if (typeof window.renderCotizacionesSidePanel === 'function') window.renderCotizacionesSidePanel(stillExists);
      } else {
        if (typeof window.closeApuPanel === 'function') window.closeApuPanel();
      }
    }
  }

  if (typeof window.refreshProjectsGridUI === 'function') {
    window.refreshProjectsGridUI();
  }

  const authorName = data.author?.name || data.author?.email || 'Un colaborador';
  const desc = data.changeDescription || 'cambios en el catálogo';
  showThrottledToast(`🔄 ${authorName} actualizó ${desc} en tiempo real`, 'info', authorEmail);
}

const LOCAL_CLIENT_SESSION_ID = (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const recentLocalConceptPushes = new Map();

function markLocalConceptPush(id) {
  const key = String(id || '').trim();
  if (!key) return;
  recentLocalConceptPushes.set(key, Date.now());
  if (recentLocalConceptPushes.size > 100) {
    const now = Date.now();
    for (const [k, ts] of recentLocalConceptPushes.entries()) {
      if (now - ts > 15000) recentLocalConceptPushes.delete(k);
    }
  }
}

function isRecentlyPushedLocally(id, windowMs = 8000) {
  const key = String(id || '').trim();
  if (!key) return false;
  const ts = recentLocalConceptPushes.get(key);
  if (!ts) return false;
  if (Date.now() - ts <= windowMs) return true;
  recentLocalConceptPushes.delete(key);
  return false;
}

/**
 * Emitir broadcast instantáneo a otros usuarios conectados a la misma obra
 */
export function broadcastConceptChange(concept) {
  if (!activeChannel || !concept) return;

  markLocalConceptPush(concept.id);
  if (concept.uuid) markLocalConceptPush(concept.uuid);
  if (concept.clave) markLocalConceptPush(concept.clave);

  const currentUser = getCurrentUser();
  const payload = {
    id: concept.id,
    uuid: concept.uuid || concept.id,
    clave: concept.clave,
    descripcion: concept.descripcion,
    unidad: concept.unidad,
    cantidad: concept.cantidad,
    precioUnitario: concept.precioUnitario,
    costoDirecto: concept.costoDirecto,
    autor: currentUser?.name || 'Colaborador',
    autorId: currentUser?.id || null,
    senderSessionId: LOCAL_CLIENT_SESSION_ID,
    timestamp: Date.now()
  };

  activeChannel.send({
    type: 'broadcast',
    event: 'concepto_editado',
    payload: payload
  });
}

/**
 * Actualizar nodo local cuando otro usuario modifica un concepto en la nube
 */
function handleIncomingConceptUpdate(data, eventType = 'UPDATE') {
  if (!data || !data.id) return;

  const isUuidVal = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || '').trim());
  const dataIsUuid = isUuidVal(data.id);

  // Si el cambio fue emitido por esta misma sesión o recién enviado desde este dispositivo, ignorar
  if (data.senderSessionId && data.senderSessionId === LOCAL_CLIENT_SESSION_ID) {
    return;
  }
  if (isRecentlyPushedLocally(data.id) || (data.uuid && isRecentlyPushedLocally(data.uuid)) || (!dataIsUuid && data.clave && isRecentlyPushedLocally(data.clave))) {
    return;
  }

  let matchedNodeId = null;
  function findAndMutate(nodes) {
    if (!Array.isArray(nodes)) return false;
    for (let node of nodes) {
      const nodeHasOwnUuid = isUuidVal(node.uuid) || isUuidVal(node.id);
      const idOrUuidMatch = node.id === data.id
        || (node.uuid && node.uuid === data.id)
        || (data.uuid && (node.id === data.uuid || node.uuid === data.uuid));
      // Solo recurrir a clave si ni el nodo ni el evento tienen UUID
      const safeClaveMatch = !dataIsUuid && !nodeHasOwnUuid && data.clave && node.clave === data.clave;

      if (idOrUuidMatch || safeClaveMatch) {
        if (dataIsUuid) {
          node.uuid = String(data.id);
        }
        if (data.cantidad !== undefined) node.cantidad = Number(data.cantidad) || 0;
        if (data.precioUnitario !== undefined) node.precioUnitario = Number(data.precioUnitario) || 0;
        if (data.precio_unitario !== undefined) node.precioUnitario = Number(data.precio_unitario) || 0;
        if (data.costoDirecto !== undefined) node.costoDirecto = Number(data.costoDirecto) || 0;
        if (data.costo_directo !== undefined) node.costoDirecto = Number(data.costo_directo) || 0;
        if (data.descripcion !== undefined) node.descripcion = data.descripcion;
        if (data.unidad !== undefined) node.unidad = data.unidad;
        if (data.color !== undefined) {
          if (data.color) node.color = data.color;
          else delete node.color;
        }
        if (Array.isArray(data.insumos)) node.insumos = data.insumos;
        matchedNodeId = node.id;
        return true;
      }
      if (Array.isArray(node.children) && findAndMutate(node.children)) {
        return true;
      }
    }
    return false;
  }

  let updated = findAndMutate(state.treeData);
  // Si Postgres CDC INSERT reporta un concepto nuevo que no llegó por broadcast aún, insertarlo sin duplicar
  if (!updated && eventType === 'INSERT' && dataIsUuid) {
    const newNode = {
      id: data.id,
      uuid: data.id,
      clave: data.clave || '',
      descripcion: data.descripcion || '',
      unidad: data.unidad || (data.tipo === 'concepto' ? 'pza' : 'lote'),
      cantidad: Number(data.cantidad) || 0,
      precioUnitario: Number(data.precio_unitario) || 0,
      costoDirecto: Number(data.costo_directo) || 0,
      color: data.color || null,
      expanded: data.expanded !== false,
      selected: data.selected !== false,
      insumos: Array.isArray(data.insumos) ? data.insumos : [],
      children: []
    };
    const parentNode = data.parent_id ? findNodeById(state.treeData, data.parent_id) : null;
    if (parentNode) {
      if (!Array.isArray(parentNode.children)) parentNode.children = [];
      parentNode.children.push(newNode);
      updated = true;
    } else if (!data.parent_id && Array.isArray(state.treeData)) {
      state.treeData.push(newNode);
      updated = true;
    }
    if (updated && typeof window !== 'undefined' && typeof window.addKnownCloudConceptIds === 'function') {
      window.addKnownCloudConceptIds(currentSubscribedProjectId, [data.id]);
    }
  }
  if (updated) {
    if (eventType === 'INSERT' && typeof window.recalculateClaves === 'function' && Array.isArray(state.treeData)) {
      try { window.recalculateClaves(state.treeData); } catch (_) {}
    }
    if (typeof window.calculateProrrateoCascade === 'function' && Array.isArray(state.treeData)) {
      try { window.calculateProrrateoCascade(state.treeData); } catch (_) {}
    }
    try {
      const activePId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;
      if (activePId) {
        localStorage.setItem(getStorageKey(activePId), JSON.stringify(state.treeData));
      }
    } catch (_) {}
    // Recalcular y refrescar la tabla si la función global está disponible
    if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
    if (typeof window.renderTAB1 === 'function') window.renderTAB1();
    if (typeof window.highlightCatalogRowInPlace === 'function') window.highlightCatalogRowInPlace(matchedNodeId || data.id);

    const autorNombre = data.autor || 'Otro usuario';
    showThrottledToast(`🔄 Concepto "${data.clave || ''}" actualizado en vivo por ${autorNombre}`, 'info', autorNombre);

    if (onRemoteConceptUpdated) {
      onRemoteConceptUpdated(data);
    }
  }
}

/**
 * Enviar actualización de un concepto a Supabase en la tabla catalogo_conceptos
 */
export async function pushConceptUpdateToSupabase(concept) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !concept) return;

  const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || '').trim());
  const rawId = (concept.uuid && isUuid(concept.uuid)) ? String(concept.uuid).trim() : String(concept.id || '').trim();

  markLocalConceptPush(rawId);
  if (concept.id && concept.id !== rawId) markLocalConceptPush(concept.id);
  if (!isUuid(rawId) && concept.clave) markLocalConceptPush(concept.clave);

  const updateFields = {
    descripcion: concept.descripcion || '',
    unidad: String(concept.unidad || 'pza').slice(0, 30),
    cantidad: Number(concept.cantidad) || 0,
    precio_unitario: Number(concept.precioUnitario) || 0,
    costo_directo: Number(concept.costoDirecto) || 0,
    updated_at: new Date().toISOString()
  };

  try {
    if (isUuid(rawId)) {
      const { error } = await sb
        .from('catalogo_conceptos')
        .update(updateFields)
        .eq('id', rawId);
      if (error) {
        console.warn('[Realtime] Error en pushConceptUpdateToSupabase:', error.message);
      }
      return;
    }

    if (concept.clave) {
      const activePId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : currentSubscribedProjectId;
      const allProjects = getProjectsList();
      const proj = allProjects.find(p => p.id === activePId || p.cloudId === activePId);
      const cloudPid = (proj?.cloudId && isUuid(proj.cloudId))
        ? String(proj.cloudId).trim()
        : (isUuid(activePId) ? String(activePId).trim() : '');
      if (cloudPid) {
        const { data } = await sb
          .from('catalogo_conceptos')
          .update(updateFields)
          .eq('proyecto_id', cloudPid)
          .eq('clave', String(concept.clave).slice(0, 50))
          .select('id');
        if (Array.isArray(data) && data.length > 0 && data[0]?.id) {
          concept.uuid = data[0].id;
          markLocalConceptPush(concept.uuid);
        }
      }
    }
  } catch (err) {
    console.warn('[Realtime] Fallo en pushConceptUpdateToSupabase:', err);
  }
}

/**
 * Desconectar del canal en tiempo real
 */
export function unsubscribeFromProjectRealtime() {
  const sb = getSupabaseClient();
  if (activeChannel && sb) {
    sb.removeChannel(activeChannel);
    activeChannel = null;
    currentSubscribedProjectId = null;
  }
}

// =========================================================================
// CANAL GLOBAL DE INVITACIONES Y COLABORACIÓN EN TIEMPO REAL
// =========================================================================
// Canales privados de Realtime: se activan después de aplicar en Supabase
// MIGRACION_AISLAMIENTO_CONFIDENCIALIDAD_2026_11_19.sql (políticas RLS en realtime.messages).
const CUBIKAR_PRIVATE_REALTIME = true;

let globalSyncChannel = null;

// =========================================================================
// ENRUTAMIENTO SEGURO DE NOTIFICACIONES (BUZÓN PRIVADO POR USUARIO)
// Cada evento "global" se entrega únicamente a los miembros de la obra involucrada
// (dueño + colaboradores) y a los demás dispositivos del propio usuario.
// =========================================================================
function getUserInboxTopic(email) {
  return `cubikar_user_${String(email || '').toLowerCase().trim()}`;
}

const outboundInboxChannels = new Map();

function getOutboundInboxChannel(sb, email) {
  const topic = getUserInboxTopic(email);
  if (outboundInboxChannels.has(topic)) return outboundInboxChannels.get(topic);
  try {
    const ch = sb.channel(topic, { config: { private: CUBIKAR_PRIVATE_REALTIME, broadcast: { self: false } } });
    outboundInboxChannels.set(topic, ch);
    if (outboundInboxChannels.size > 60) {
      const oldestKey = outboundInboxChannels.keys().next().value;
      const oldest = outboundInboxChannels.get(oldestKey);
      outboundInboxChannels.delete(oldestKey);
      try { sb.removeChannel(oldest); } catch (_) {}
    }
    return ch;
  } catch (_) {
    return null;
  }
}

function normalizeEmailCandidate(val) {
  const e = String(val || '').toLowerCase().trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}

function collectProjectAudienceEmails(projectIds) {
  const out = new Set();
  const ids = new Set((projectIds || []).map(v => String(v || '').trim()).filter(Boolean));
  if (ids.size === 0) return out;
  let list = [];
  try { list = getProjectsList() || []; } catch (_) { list = []; }
  list.forEach(p => {
    if (!p || !(ids.has(String(p.id || '')) || ids.has(String(p.cloudId || '')))) return;
    [p.ownerEmail, p.createdByEmail].forEach(e => { const n = normalizeEmailCandidate(e); if (n) out.add(n); });
    (Array.isArray(p.members) ? p.members : []).forEach(m => {
      const n = normalizeEmailCandidate(m?.email);
      if (n && String(m?.status || '').toLowerCase() !== 'rejected') out.add(n);
    });
  });
  return out;
}

function resolveSecureBroadcastRecipients(event, payload) {
  // La sincronización entre dispositivos del mismo usuario nunca sale de su propio buzón
  if (event === 'solicitar_sincronizacion_peer' || event === 'responder_sincronizacion_peer') return new Set();
  const data = payload || {};
  const projectIds = [
    data.projectId, data.cloudId, data.projectCloudId, data.project?.id, data.project?.cloudId,
    data.invitation?.projectId, data.invitation?.cloudId
  ];
  const recipients = collectProjectAudienceEmails(projectIds);
  [
    data.ownerEmail, data.email, data.targetEmail, data.removedEmail, data.collaboratorEmail,
    data.invitation?.email, data.invitation?.ownerEmail, data.project?.ownerEmail
  ].forEach(e => { const n = normalizeEmailCandidate(e); if (n) recipients.add(n); });
  (Array.isArray(data.project?.members) ? data.project.members : []).forEach(m => {
    const n = normalizeEmailCandidate(m?.email);
    if (n) recipients.add(n);
  });
  (Array.isArray(data.collaboratorEmails) ? data.collaboratorEmails : []).forEach(e => {
    const n = normalizeEmailCandidate(e);
    if (n) recipients.add(n);
  });
  return recipients;
}

function installSecureInboxRouting(sb, channel, myEmail) {
  if (!channel || channel.__cubikarSecureRouting) return;
  const rawSend = channel.send.bind(channel);
  channel.__cubikarSecureRouting = true;
  channel.__cubikarInboxEmail = myEmail;
  channel.send = (msg = {}) => {
    const tasks = [];
    // Otros dispositivos/pestañas del mismo usuario
    tasks.push(Promise.resolve().then(() => rawSend(msg)).catch(() => 'error'));
    const recipients = resolveSecureBroadcastRecipients(msg.event, msg.payload);
    recipients.forEach(email => {
      if (!email || email === myEmail) return;
      const ch = getOutboundInboxChannel(sb, email);
      if (!ch) return;
      tasks.push(Promise.resolve().then(() => (
        typeof ch.httpSend === 'function' ? ch.httpSend(msg.event, msg.payload) : ch.send(msg)
      )).catch(() => 'error'));
    });
    return Promise.all(tasks).then(() => 'ok');
  };
}

export function initGlobalRealtimeSync() {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) return null;

  const inboxEmail = String(getCurrentUser()?.email || '').toLowerCase().trim();
  if (!inboxEmail) return null;

  if (globalSyncChannel) {
    if (globalSyncChannel.__cubikarInboxEmail === inboxEmail) return globalSyncChannel;
    // Cambio de cuenta en el mismo navegador: nunca reutilizar el buzón del usuario anterior
    try { sb.removeChannel(globalSyncChannel); } catch (_) {}
    globalSyncChannel = null;
  }

  // Buzón personal privado (antes: canal global compartido por todos los usuarios).
  // Solo el titular puede escucharlo y solo usuarios que comparten obra con él pueden escribirle.
  globalSyncChannel = sb.channel(getUserInboxTopic(inboxEmail), {
    config: {
      private: CUBIKAR_PRIVATE_REALTIME,
      broadcast: { self: false }
    }
  });
  installSecureInboxRouting(sb, globalSyncChannel, inboxEmail);

  // 1. Escuchar invitaciones en tiempo real
  globalSyncChannel.on('broadcast', { event: 'nueva_invitacion' }, (payload) => {
    if (!payload?.payload) return;
    handleIncomingInvitation(payload.payload);
  });

  // 2. Escuchar aceptación de invitaciones
  globalSyncChannel.on('broadcast', { event: 'invitacion_aceptada' }, (payload) => {
    if (!payload?.payload) return;
    handleIncomingInvitationAccepted(payload.payload);
  });

  // 3. Escuchar rechazo o eliminación de invitaciones
  globalSyncChannel.on('broadcast', { event: 'invitacion_rechazada' }, (payload) => {
    if (!payload?.payload) return;
    handleIncomingInvitationRejected(payload.payload);
  });

  // 4. Escuchar creación de nuevos proyectos
  globalSyncChannel.on('broadcast', { event: 'nuevo_proyecto' }, (payload) => {
    if (!payload?.payload) return;
    handleIncomingNewProject(payload.payload);
  });

  // 5. Escuchar peticiones de sincronización peer
  globalSyncChannel.on('broadcast', { event: 'solicitar_sincronizacion_peer' }, (payload) => {
    if (!payload?.payload) return;
    handlePeerSyncRequest(payload.payload);
  });

  // 6. Escuchar respuesta de sincronización peer
  globalSyncChannel.on('broadcast', { event: 'responder_sincronizacion_peer' }, (payload) => {
    if (!payload?.payload) return;
    handlePeerSyncResponse(payload.payload);
  });

  // 7. Escuchar actualizaciones completas de proyectos en tiempo real (P2P global)
  globalSyncChannel.on('broadcast', { event: 'proyecto_actualizado_global' }, (payload) => {
    if (payload?.payload) {
      handleIncomingProjectUpdate(payload.payload);
    }
  });

  // 8. Escuchar mensajes de chat globales (notificaciones y sincronización de fondo)
  globalSyncChannel.on('broadcast', { event: 'chat_mensaje_global' }, (payload) => {
    if (payload?.payload) {
      handleIncomingChatMessage(payload.payload);
    }
  });

  // 9. Escuchar eliminación global de mensajes de chat
  globalSyncChannel.on('broadcast', { event: 'chat_mensaje_eliminado_global' }, (payload) => {
    if (payload?.payload) {
      handleIncomingChatDelete(payload.payload);
    }
  });

  // 10. Escuchar eliminación global de proyectos en tiempo real
  globalSyncChannel.on('broadcast', { event: 'proyecto_eliminado_global' }, (payload) => {
    if (payload?.payload) {
      handleVerifiedProjectRemoval(payload.payload, handleIncomingProjectDeleted);
    }
  });

  // 10B. Escuchar movimiento a papelera y restauración global en tiempo real
  globalSyncChannel.on('broadcast', { event: 'proyecto_en_papelera_global' }, (payload) => {
    if (payload?.payload) {
      handleVerifiedProjectRemoval(payload.payload, handleIncomingProjectTrashed);
    }
  });
  globalSyncChannel.on('broadcast', { event: 'proyecto_restaurado_global' }, (payload) => {
    if (payload?.payload) {
      handleIncomingProjectRestored(payload.payload);
    }
  });

  // 11. Escuchar remoción de colaboradores en tiempo real
  globalSyncChannel.on('broadcast', { event: 'colaborador_removido' }, (payload) => {
    if (payload?.payload) {
      handleVerifiedCollaboratorRemoved(payload.payload);
    }
  });

  // 12. Escuchar eliminación directa y cambios de papelera en Supabase PostgreSQL (CDC en tiempo real)
  globalSyncChannel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'proyectos'
    },
    (payload) => {
      if (payload.eventType === 'DELETE' && payload?.old?.id) {
        handleIncomingProjectDeleted({ projectId: payload.old.id });
      } else if (payload.eventType === 'UPDATE' && payload?.new?.id) {
        const hadDeletedAt = Boolean(payload.old?.deleted_at);
        const hasDeletedAt = Boolean(payload.new?.deleted_at);
        if (hasDeletedAt && !hadDeletedAt) {
          handleIncomingProjectTrashed({
            projectId: payload.new.id,
            ownerEmail: payload.new.owner_email || '',
            deletedBy: payload.new.deleted_by_email || ''
          });
        } else if (!hasDeletedAt && hadDeletedAt) {
          handleIncomingProjectRestored({
            projectId: payload.new.id,
            ownerEmail: payload.new.owner_email || ''
          });
        }
      }
    }
  );

  // 12B. Escuchar lápidas en public.proyectos_eliminados (CDC garantizada entre múltiples PCs)
  globalSyncChannel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'proyectos_eliminados'
    },
    (payload) => {
      const row = payload?.new;
      if (row?.proyecto_id) {
        handleIncomingProjectDeleted({
          projectId: row.proyecto_id,
          deletedBy: row.deleted_by_email || '',
          ownerEmail: row.owner_email || ''
        });
      }
    }
  );

  // 13. Escuchar remoción o cambios de colaboradores en Supabase PostgreSQL (CDC en tiempo real)
  globalSyncChannel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'proyecto_colaboradores'
    },
    (payload) => {
      const user = getCurrentUser();
      const myEmail = (user?.email || '').toLowerCase().trim();
      if (!myEmail) return;

      if (payload.eventType === 'DELETE') {
        const oldEmail = (payload.old?.email_colaborador || '').toLowerCase().trim();
        // Solo expulsar si el registro eliminado explícitamente pertenece a este usuario.
        // Nunca expulsar por registros con email vacío o de otros usuarios.
        if (oldEmail && oldEmail === myEmail) {
          handleIncomingCollaboratorRemoved({
            projectId: payload.old?.proyecto_id,
            email: myEmail
          });
        }
      } else if (payload.eventType === 'UPDATE') {
        const newEmail = (payload.new?.email_colaborador || '').toLowerCase().trim();
        if (newEmail === myEmail) {
          const estado = (payload.new?.estado_invitacion || '').toLowerCase().trim();
          if (estado === 'rejected' || estado === 'revoked') {
            handleIncomingCollaboratorRemoved({
              projectId: payload.new?.proyecto_id,
              email: myEmail
            });
          } else {
            if (typeof window.fetchCloudProjects === 'function') {
              window.fetchCloudProjects().then(() => {
                if (typeof window.refreshProjectsGridUI === 'function') window.refreshProjectsGridUI();
              });
            }
          }
        }
      }
    }
  );

  // 13B. Escuchar nuevos mensajes/eliminaciones de chat globales en Supabase Postgres (CDC)
  globalSyncChannel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'chat_mensajes'
    },
    (payload) => {
      const stripPrefix = (rawVal) => String(rawVal || '').replace(/^.*?(?:__|::)/, '');
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const row = payload.new;
        if (!row || !row.proyecto_id || String(row.proyecto_id).startsWith('__')) return;
        const rawJson = (row.payload_json && typeof row.payload_json === 'object')
          ? row.payload_json
          : ((row.datos_json && typeof row.datos_json === 'object') ? row.datos_json : null);
        const cleanMsgId = stripPrefix(rawJson?.id || row.id);
        if (
          !cleanMsgId ||
          cleanMsgId.startsWith('seed_msg_') ||
          rawJson?.senderSessionId === LOCAL_CLIENT_SESSION_ID ||
          isRecentlyPushedLocally(cleanMsgId) ||
          isRecentlyPushedLocally(row.id)
        ) {
          return;
        }
        const msg = rawJson && (rawJson.id || cleanMsgId)
          ? {
              ...rawJson,
              id: cleanMsgId,
              mentions: (Array.isArray(rawJson.mentions) && rawJson.mentions.length > 0)
                ? rawJson.mentions
                : (Array.isArray(row.etiquetas) ? row.etiquetas : [])
            }
          : {
              id: cleanMsgId,
              text: row.mensaje || row.texto || '',
              mentions: Array.isArray(row.etiquetas) ? row.etiquetas : [],
              authorName: row.autor_nombre || 'Colaborador',
              authorEmail: row.autor_email || '',
              authorAvatar: row.autor_avatar_url || row.autor_avatar || '',
              createdAt: row.created_at || row.creado_en || new Date().toISOString()
            };
        handleIncomingChatMessage({
          projectId: row.proyecto_id,
          senderSessionId: msg.senderSessionId || null,
          author: {
            email: row.autor_email || msg.authorEmail || '',
            name: row.autor_nombre || msg.authorName || 'Colaborador',
            avatar: row.autor_avatar_url || row.autor_avatar || msg.authorAvatar || ''
          },
          message: msg
        });
      } else if (payload.eventType === 'DELETE' && payload.old?.id) {
        if (payload.old.proyecto_id && String(payload.old.proyecto_id).startsWith('__')) return;
        handleIncomingChatDelete({
          projectId: payload.old.proyecto_id || '',
          messageId: stripPrefix(payload.old.id)
        });
      }
    }
  );

  globalSyncChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.info('[Realtime] Canal global WebSocket conectado exitosamente.');
      requestPeerSync();
      hydrateAllUserProjectsChatFromCloud().catch(() => {});
    }
  });

  return globalSyncChannel;
}

/**
 * Emitir broadcast de una nueva invitación a un colaborador
 */
export function broadcastNewInvitation(invitation, project) {
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (!globalSyncChannel || !invitation) return;

  globalSyncChannel.send({
    type: 'broadcast',
    event: 'nueva_invitacion',
    payload: {
      invitation,
      project: project ? {
        id: project.id,
        projectName: project.projectName,
        companyName: project.companyName,
        companyLogo: project.companyLogo,
        projectLocation: project.projectLocation,
        tipoObra: project.tipoObra,
        currency: project.currency,
        currencySymbol: project.currencySymbol,
        factorSobrecosto: project.factorSobrecosto,
        totalPresupuesto: project.totalPresupuesto,
        conceptCount: project.conceptCount,
        partidasCount: project.partidasCount,
        ownerEmail: project.ownerEmail,
        ownerPlanId: project.ownerPlanId,
        members: project.members,
        createdAt: project.createdAt
      } : null
    }
  });
}

function handleIncomingInvitation({ invitation, project }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email || !invitation) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const targetEmail = (invitation.email || '').toLowerCase().trim();

  // Si la invitación no es para mí, ignorar
  if (myEmail !== targetEmail) return;

  // 1. Guardar la invitación en el almacenamiento local del invitado
  const invs = getStoredInvitations();
  const exists = invs.some(i => i.id === invitation.id || (i.projectId === invitation.projectId && (i.email || '').toLowerCase() === myEmail));
  if (!exists) {
    invs.unshift(invitation);
    saveStoredInvitations(invs);
  }

  // 2. Si viene el proyecto adjunto, guardar o actualizar sus metadatos en la lista local
  if (project && project.id) {
    const cleanProject = stripProjectPayload(project);
    const list = getProjectsList();
    const pIdx = list.findIndex(p => p.id === cleanProject.id);
    if (pIdx >= 0) {
      list[pIdx] = Object.assign({}, list[pIdx], cleanProject);
    } else {
      list.unshift(cleanProject);
    }
    saveProjectsList(list);
  }

  // 3. Notificar al usuario
  showToast(`🔔 ¡Has recibido una invitación de ${invitation.ownerName || 'un anfitrión'} para colaborar en "${invitation.projectName}"!`, 'info');

  // 4. Refrescar interfaz de notificaciones y dashboard
  if (typeof window.renderSidebarNotificationsUI === 'function') {
    window.renderSidebarNotificationsUI();
  }
  if (typeof window.refreshProjectsGridUI === 'function') {
    window.refreshProjectsGridUI();
  }
}

/**
 * Emitir broadcast cuando una invitación es aceptada
 */
export function broadcastInvitationAccepted(invitation, user) {
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (!globalSyncChannel || !invitation) return;

  globalSyncChannel.send({
    type: 'broadcast',
    event: 'invitacion_aceptada',
    payload: {
      invitationId: invitation.id,
      projectId: invitation.projectId,
      projectName: invitation.projectName,
      ownerEmail: invitation.ownerEmail,
      user: {
        name: user?.name || invitation.name,
        email: user?.email || invitation.email,
        avatar: user?.avatar || ''
      }
    }
  });
}

function handleIncomingInvitationAccepted({ projectId, projectName, ownerEmail, user }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const targetOwner = (ownerEmail || '').toLowerCase().trim();

  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj) return;

  if ((proj.ownerEmail || '').toLowerCase().trim() === myEmail || myEmail === targetOwner) {
    if (Array.isArray(proj.members)) {
      const mem = proj.members.find(m => (m.email || '').toLowerCase().trim() === (user.email || '').toLowerCase().trim());
      if (mem) {
        mem.status = 'active';
        mem.name = user.name || mem.name;
        mem.avatar = user.avatar || mem.avatar;
      } else {
        proj.members.push({
          id: 'mem-' + Date.now(),
          name: user.name || 'Colaborador',
          email: user.email,
          avatar: user.avatar || '',
          role: 'editar',
          status: 'active'
        });
      }
      saveProjectsList(list);
    }

    showToast(`👤 ${user.name || user.email} ha aceptado la invitación al proyecto "${projectName}"`, 'info');

    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
    if (typeof window.renderHeaderCollaborators === 'function') {
      window.renderHeaderCollaborators();
    }
  }
}

/**
 * Emitir broadcast cuando se rechaza una invitación
 */
export function broadcastInvitationRejected(invitation, user) {
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (!globalSyncChannel || !invitation) return;

  globalSyncChannel.send({
    type: 'broadcast',
    event: 'invitacion_rechazada',
    payload: {
      invitationId: invitation.id,
      projectId: invitation.projectId,
      ownerEmail: invitation.ownerEmail,
      email: user?.email || invitation.email
    }
  });
}

function handleIncomingInvitationRejected({ projectId, email }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const targetEmail = (email || '').toLowerCase().trim();

  // Si soy el usuario rechazado, eliminar de mis invitaciones
  if (myEmail === targetEmail) {
    const invs = getStoredInvitations().filter(i => i.projectId !== projectId);
    saveStoredInvitations(invs);
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
    return;
  }

  // Si soy el anfitrión, actualizar el miembro del proyecto
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (proj && Array.isArray(proj.members)) {
    proj.members = proj.members.filter(m => (m.email || '').toLowerCase().trim() !== targetEmail);
    saveProjectsList(list);

    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
  }
}

/**
 * Emitir broadcast cuando un usuario crea un nuevo proyecto
 */
export function broadcastNewProject(project) {
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (!globalSyncChannel || !project) return;

  const currentUser = getCurrentUser();
  globalSyncChannel.send({
    type: 'broadcast',
    event: 'nuevo_proyecto',
    payload: {
      project,
      creatorName: currentUser?.name || 'Editor',
      creatorEmail: currentUser?.email || ''
    }
  });
}

function handleIncomingNewProject({ project, creatorName, creatorEmail }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email || !project) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const ownerEmail = (project.ownerEmail || '').toLowerCase().trim();
  const isMember = Array.isArray(project.members) && project.members.some(m => (m.email || '').toLowerCase().trim() === myEmail);

  // Si soy el dueño o un miembro del proyecto
  if (ownerEmail === myEmail || isMember) {
    const list = getProjectsList();
    const exists = list.some(p => p.id === project.id);
    if (!exists) {
      list.unshift(stripProjectPayload(project));
      saveProjectsList(list);

      showToast(`🏢 ¡Nuevo proyecto "${project.projectName}" creado por ${creatorName || creatorEmail}!`, 'info');

      if (typeof window.refreshProjectsGridUI === 'function') {
        window.refreshProjectsGridUI();
      }
    }
  }
}

const PROJECT_PAYLOAD_FIELDS = ['treeData', 'settings', 'chatMessages'];
const REMOVED_COLLABORATOR_STATES = new Set(['rejected', 'revoked']);

function normalizeEmail(value) {
  return String(value || '').toLowerCase().trim();
}

function getMyEmail() {
  return normalizeEmail(getCurrentUser()?.email);
}

function isProjectOwnedBy(project, email) {
  return Boolean(email) && normalizeEmail(project?.ownerEmail) === email;
}

function findProjectIndex(list, ids) {
  const wanted = ids.filter(Boolean).map(v => String(v).trim());
  return list.findIndex(p => p && (wanted.includes(p.id) || (p.cloudId && wanted.includes(p.cloudId))));
}

function findLocalProject(list, ...ids) {
  const idx = findProjectIndex(list, ids);
  return idx >= 0 ? list[idx] : null;
}

function resolveCloudProjectId(localProject, projectId) {
  return String(localProject?.cloudId || projectId || '').trim();
}

function readLocalJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function toTimestamp(value) {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
}

export function stripProjectPayload(project) {
  if (!project || typeof project !== 'object') return project;
  const clean = { ...project };
  PROJECT_PAYLOAD_FIELDS.forEach((field) => { delete clean[field]; });
  return clean;
}

export function isIncomingSettingsNewer(incomingSettings, localSettings) {
  if (!incomingSettings || typeof incomingSettings !== 'object') return false;
  if (!localSettings) return true;
  const localTs = toTimestamp(localSettings.updatedAt);
  return localTs > 0 && toTimestamp(incomingSettings.updatedAt) > localTs;
}

async function getVerifiedCloudClient() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb.auth.getSession();
  return !error && data?.session ? sb : null;
}

export async function verifyProjectGoneInCloud(projectId) {
  try {
    const cloudId = resolveCloudProjectId(findLocalProject(getProjectsList(), projectId), projectId);
    const sb = cloudId ? await getVerifiedCloudClient() : null;
    if (!sb) return false;
    const [projectRes, tombstoneRes] = await Promise.all([
      sb.from('proyectos').select('id, deleted_at').eq('id', cloudId).limit(1),
      sb.from('proyectos_eliminados').select('proyecto_id').eq('proyecto_id', cloudId).limit(1)
    ]);
    if (projectRes.error || tombstoneRes.error) return false;
    if ((tombstoneRes.data || []).length > 0) return true;
    const row = (projectRes.data || [])[0];
    return !row || Boolean(row.deleted_at);
  } catch (_) {
    return false;
  }
}

export async function verifyCollaboratorRemovedInCloud(projectId, email) {
  try {
    const targetEmail = normalizeEmail(email);
    const localProject = findLocalProject(getProjectsList(), projectId);
    if (!targetEmail || isProjectOwnedBy(localProject, getMyEmail())) return false;
    const cloudId = resolveCloudProjectId(localProject, projectId);
    const sb = cloudId ? await getVerifiedCloudClient() : null;
    if (!sb) return false;
    const { data, error } = await sb
      .from('proyecto_colaboradores')
      .select('email_colaborador, estado_invitacion')
      .eq('proyecto_id', cloudId)
      .ilike('email_colaborador', targetEmail);
    if (error) return false;
    const row = (data || []).find(r => normalizeEmail(r.email_colaborador) === targetEmail);
    return !row || REMOVED_COLLABORATOR_STATES.has(normalizeEmail(row.estado_invitacion));
  } catch (_) {
    return false;
  }
}

async function handleVerifiedProjectRemoval(data, applyRemoval) {
  if (!data?.projectId) return;
  if (await verifyProjectGoneInCloud(data.projectId)) {
    applyRemoval(data);
  }
}

async function handleVerifiedCollaboratorRemoved(data) {
  if (!data?.projectId || !data?.email) return;
  const targetsMe = normalizeEmail(data.email) === getMyEmail();
  if (targetsMe && !(await verifyCollaboratorRemovedInCloud(data.projectId, data.email))) return;
  handleIncomingCollaboratorRemoved(data);
}

function emitProjectLifecycleEvent(localType, projectEvent, globalEvent, projectId, ownerEmail = null) {
  if (!projectId) return;
  const currentUser = getCurrentUser();
  const payload = {
    projectId,
    ownerEmail: (ownerEmail || currentUser?.email || '').toLowerCase().trim(),
    deletedBy: (currentUser?.email || '').toLowerCase().trim(),
    timestamp: Date.now()
  };

  if (localBroadcastChannel) {
    try {
      localBroadcastChannel.postMessage({ type: localType, payload });
    } catch (_) {}
  }

  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) return;

  if (activeChannel && currentSubscribedProjectId === projectId && projectEvent) {
    try {
      activeChannel.send({ type: 'broadcast', event: projectEvent, payload });
    } catch (err) {
      console.warn(`[Realtime] Aviso al emitir ${projectEvent} en canal de obra:`, err);
    }
  }

  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (globalSyncChannel) {
    try {
      globalSyncChannel.send({ type: 'broadcast', event: globalEvent, payload });
    } catch (err) {
      console.warn(`[Realtime] Aviso al emitir ${globalEvent} en canal global:`, err);
    }
  }
}

function applyIncomingProjectRemoval(data, { isPermanentDelete = true, toastMessage = '⚠️ Este proyecto fue eliminado.' } = {}) {
  if (!data || !data.projectId) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const projectId = String(data.projectId).trim();
  const currentPId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;
  const allProjects = getProjectsList();
  const targetProj = allProjects.find(p => p.id === projectId || p.cloudId === projectId);
  const idsToPurge = Array.from(new Set([projectId, targetProj?.id, targetProj?.cloudId].filter(Boolean)));

  const checkMarkedFn = isPermanentDelete ? isProjectMarkedDeleted : isProjectTrashedLocal;
  const allAlreadyMarked = typeof checkMarkedFn === 'function' && idsToPurge.every(id => checkMarkedFn(id));
  const stillInList = allProjects.some(p => idsToPurge.includes(p.id) || (p.cloudId && idsToPurge.includes(p.cloudId)));
  const isCurrentOpen = Boolean(currentPId && idsToPurge.includes(currentPId));
  if (allAlreadyMarked && !stillInList && !isCurrentOpen) {
    return;
  }

  idsToPurge.forEach((pid) => {
    if (isPermanentDelete) {
      if (typeof unmarkProjectTrashedLocal === 'function') unmarkProjectTrashedLocal(pid);
      if (typeof markProjectDeleted === 'function') {
        markProjectDeleted(pid);
      } else {
        try {
          const raw = localStorage.getItem('cubikar_deleted_projects_v1');
          let list = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(list)) list = [];
          if (!list.includes(pid)) {
            list.push(pid);
            localStorage.setItem('cubikar_deleted_projects_v1', JSON.stringify(list));
          }
        } catch (_) {}
      }
    } else if (typeof markProjectTrashedLocal === 'function') {
      markProjectTrashedLocal(pid);
    }
  });

  const filtered = allProjects.filter(p => !idsToPurge.includes(p.id) && !(p.cloudId && idsToPurge.includes(p.cloudId)));
  if (filtered.length !== allProjects.length) {
    saveProjectsList(filtered);
  }

  idsToPurge.forEach((pid) => {
    try {
      localStorage.removeItem(getSettingsKey(pid));
      localStorage.removeItem(getStorageKey(pid));
      localStorage.removeItem(`estimaciones_data_${pid}`);
      localStorage.removeItem(`expenses_control_${pid}`);
      localStorage.removeItem(`calendario_cfg_${pid}`);
      localStorage.removeItem(`calendario_workdays_${pid}`);
      localStorage.removeItem(resolveChatStorageKey(pid));
      localStorage.removeItem(`adm_arq_project_chat_${pid}`);
      localStorage.removeItem(`adm_const_project_chat_${pid}`);
      localStorage.removeItem(`adm_arq_chat_${pid}`);
      localStorage.removeItem(`control_obra_chat_${pid}`);
      localStorage.removeItem(`adm_arq_signatures_${pid}`);
      localStorage.removeItem(`adm_arq_bitacora_${pid}`);
      localStorage.removeItem(`adm_arq_expenses_${pid}`);
      localStorage.removeItem(`adm_arq_suppliers_${pid}`);
    } catch (_) {}
  });

  try {
    const curInvs = getStoredInvitations();
    const cleanedInvs = curInvs.filter(i => !idsToPurge.includes(i.projectId));
    if (cleanedInvs.length !== curInvs.length) {
      saveStoredInvitations(cleanedInvs);
    }
    const curPlanInvs = getStoredPlanInvitations();
    const cleanedPlan = curPlanInvs.filter(pi => !idsToPurge.includes(pi.projectId));
    if (cleanedPlan.length !== curPlanInvs.length) {
      saveStoredPlanInvitations(cleanedPlan);
    }
  } catch (_) {}

  if (currentUser.user_metadata?.cubikar_cloud_state_v2) {
    const cs = currentUser.user_metadata.cubikar_cloud_state_v2;
    let modified = false;
    if (Array.isArray(cs.collaboratedProjects) && cs.collaboratedProjects.length > 0) {
      cs.collaboratedProjects = [];
      modified = true;
    }
    if (Array.isArray(cs.ownedProjects) && cs.ownedProjects.length > 0) {
      cs.ownedProjects = [];
      modified = true;
    }
    if (modified) {
      saveCurrentUser(currentUser);
      if (typeof window !== 'undefined' && typeof window.syncUserCollaborationToCloud === 'function') {
        window.syncUserCollaborationToCloud(currentUser);
      }
    }
  }

  if (isCurrentOpen) {
    if (typeof showToast === 'function') {
      showToast(toastMessage, 'warning');
    }
    setTimeout(() => {
      if (typeof window.exitProjectToPortal === 'function') {
        window.exitProjectToPortal();
      } else {
        window.location.reload();
      }
    }, 600);
  }

  if (typeof window !== 'undefined') {
    if (typeof window.invalidateCloudProjectsCache === 'function') {
      window.invalidateCloudProjectsCache();
    }
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
    if (typeof window.updateTrashBadgeUI === 'function') {
      window.updateTrashBadgeUI();
    }
  }
}

export function broadcastProjectDeleted(projectId, ownerEmail = null) {
  emitProjectLifecycleEvent('proyecto_eliminado', 'proyecto_eliminado', 'proyecto_eliminado_global', projectId, ownerEmail);
}

export function handleIncomingProjectDeleted(data) {
  applyIncomingProjectRemoval(data, {
    isPermanentDelete: true,
    toastMessage: '⚠️ Este proyecto fue eliminado definitivamente.'
  });
}

export function broadcastProjectTrashed(projectId, ownerEmail = null) {
  emitProjectLifecycleEvent('proyecto_en_papelera', 'proyecto_eliminado', 'proyecto_en_papelera_global', projectId, ownerEmail);
}

export function handleIncomingProjectTrashed(data) {
  applyIncomingProjectRemoval(data, {
    isPermanentDelete: false,
    toastMessage: '🗑️ Este proyecto fue movido a la Papelera por su anfitrión.'
  });
}

export function broadcastProjectRestored(projectId, ownerEmail = null) {
  emitProjectLifecycleEvent('proyecto_restaurado', null, 'proyecto_restaurado_global', projectId, ownerEmail);
}

export async function handleIncomingProjectRestored(data) {
  if (!data || !data.projectId) return;
  const projectId = String(data.projectId).trim();
  if (typeof unmarkProjectTrashedLocal === 'function') unmarkProjectTrashedLocal(projectId);
  if (typeof unmarkProjectDeleted === 'function') unmarkProjectDeleted(projectId);

  if (typeof window !== 'undefined') {
    if (typeof window.invalidateCloudProjectsCache === 'function') {
      window.invalidateCloudProjectsCache();
    }
    if (typeof window.fetchCloudProjects === 'function') {
      try {
        const cloudList = await window.fetchCloudProjects({ force: true });
        if (Array.isArray(cloudList)) {
          const restored = cloudList.find(cp => cp.id === projectId || cp.cloudId === projectId);
          if (restored) {
            const cur = getProjectsList();
            if (!cur.some(p => p.id === restored.id || p.cloudId === restored.id)) {
              cur.unshift(restored);
              saveProjectsList(cur, { skipCloudSync: true });
            }
          }
        }
      } catch (_) {}
    }
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    if (typeof window.updateTrashBadgeUI === 'function') {
      window.updateTrashBadgeUI();
    }
  }
}

/**
 * Emitir broadcast cuando un colaborador es removido de un proyecto
 */
export function broadcastCollaboratorRemoved(projectId, email) {
  if (!projectId || !email) return;
  const payload = {
    projectId,
    email: (email || '').toLowerCase().trim(),
    timestamp: Date.now()
  };

  if (localBroadcastChannel) {
    try {
      localBroadcastChannel.postMessage({
        type: 'colaborador_removido',
        payload
      });
    } catch (_) {}
  }

  if (activeChannel) {
    try {
      activeChannel.send({
        type: 'broadcast',
        event: 'colaborador_removido',
        payload
      });
    } catch (_) {}
  }

  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (globalSyncChannel) {
    try {
      globalSyncChannel.send({
        type: 'broadcast',
        event: 'colaborador_removido',
        payload
      });
    } catch (_) {}
  }
}

/**
 * Procesar remoción de colaborador recibida por tiempo real o Postgres CDC
 */
export function handleIncomingCollaboratorRemoved(data) {
  if (!data || !data.projectId || !data.email) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const targetEmail = data.email.toLowerCase().trim();
  const projectId = data.projectId;
  const allProjects = getProjectsList();
  const proj = allProjects.find(p => p.id === projectId || p.cloudId === projectId);
  if (isProjectOwnedBy(proj, myEmail)) return;

  if (targetEmail === myEmail) {
    // Si el usuario actual fue el removido: purgar la obra por completo de su entorno
    const filtered = allProjects.filter(p => p.id !== projectId && p.cloudId !== projectId);
    saveProjectsList(filtered);

    try {
      localStorage.removeItem(getSettingsKey(projectId));
      localStorage.removeItem(getStorageKey(projectId));
      localStorage.removeItem(resolveChatStorageKey(projectId));
      localStorage.removeItem(`adm_arq_chat_${projectId}`);
      localStorage.removeItem(`control_obra_chat_${projectId}`);
    } catch (_) {}

    // Purgar invitaciones pendientes de este proyecto para limpiar la campana
    try {
      const curInvs = getStoredInvitations();
      const cleanedInvs = curInvs.filter(i => !(i.projectId === projectId && (i.email || '').toLowerCase().trim() === myEmail));
      if (cleanedInvs.length !== curInvs.length) {
        saveStoredInvitations(cleanedInvs);
      }
    } catch (_) {}

    const currentPId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;
    if (currentPId && (currentPId === projectId)) {
      if (typeof showToast === 'function') {
        showToast('⚠️ Tu acceso a este proyecto fue retirado por el anfitrión.', 'warning');
      }
      setTimeout(() => {
        if (typeof window.exitProjectToPortal === 'function') {
          window.exitProjectToPortal();
        } else {
          window.location.reload();
        }
      }, 1200);
    }

    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
  } else if (proj && Array.isArray(proj.members)) {
    // Si otro colaborador fue removido: actualizar la lista de miembros de la obra
    proj.members = proj.members.filter(m => (m.email || '').toLowerCase().trim() !== targetEmail);
    saveProjectsList(allProjects, { skipCloudSync: true });

    if (typeof window.renderInviteModalMembersList === 'function') {
      window.renderInviteModalMembersList();
    }
    if (typeof window.renderHeaderCollaborators === 'function') {
      window.renderHeaderCollaborators();
    }
  }
}

/**
 * Solicitar sincronización peer a otros usuarios conectados
 */
let lastPeerSyncSentAt = 0;
export function requestPeerSync() {
  if (!globalSyncChannel) return;
  if (globalSyncChannel.state && globalSyncChannel.state !== 'joined') return;
  const now = Date.now();
  if (lastPeerSyncSentAt > 0 && (now - lastPeerSyncSentAt) < 10000) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  lastPeerSyncSentAt = now;
  globalSyncChannel.send({
    type: 'broadcast',
    event: 'solicitar_sincronizacion_peer',
    payload: {
      email: currentUser.email.toLowerCase().trim()
    }
  });
}

function isInvitationOfUser(invitation, email) {
  return normalizeEmail(invitation?.email) === email || normalizeEmail(invitation?.ownerEmail) === email;
}

function isProjectMember(project, email) {
  return Array.isArray(project?.members) && project.members.some(m => normalizeEmail(m.email) === email);
}

function handlePeerSyncRequest({ email }) {
  const myEmail = getMyEmail();
  if (!myEmail || normalizeEmail(email) !== myEmail || !globalSyncChannel) return;

  const invitations = getStoredInvitations().filter(inv => isInvitationOfUser(inv, myEmail));
  const projects = getProjectsList()
    .filter(p => isProjectOwnedBy(p, myEmail) || isProjectMember(p, myEmail))
    .map(p => ({
      ...stripProjectPayload(p),
      settings: isProjectOwnedBy(p, myEmail) ? null : readLocalJson(getSettingsKey(p.id))
    }));

  if (invitations.length > 0 || projects.length > 0) {
    globalSyncChannel.send({
      type: 'broadcast',
      event: 'responder_sincronizacion_peer',
      payload: {
        targetEmail: myEmail,
        invitations,
        projects
      }
    });
  }
}

let lastPeerDeletedCheckAt = 0;
let lastPeerDeletedSet = new Set();
let inFlightPeerDeletedPromise = null;

function applyPeerProjectData(projectId, incoming) {
  const isActive = getActiveProjectId() === projectId;
  if (Array.isArray(incoming.treeData) && incoming.treeData.length > 0) {
    const localTree = readLocalJson(getStorageKey(projectId));
    if (!Array.isArray(localTree) || localTree.length === 0) {
      try {
        localStorage.setItem(getStorageKey(projectId), JSON.stringify(incoming.treeData));
        if (isActive) {
          state.treeData = JSON.parse(JSON.stringify(incoming.treeData));
          if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
          if (typeof window.renderTAB1 === 'function') window.renderTAB1();
        }
      } catch (_) {}
    }
  }
  if (isIncomingSettingsNewer(incoming.settings, readLocalJson(getSettingsKey(projectId)))) {
    try {
      localStorage.setItem(getSettingsKey(projectId), JSON.stringify(incoming.settings));
      if (isActive) {
        state.settings = Object.assign({}, state.settings, incoming.settings);
      }
    } catch (_) {}
  }
}

function mergePeerChatMessages(projectId, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  try {
    const chatKey = resolveChatStorageKey(projectId);
    const curChat = readLocalJson(chatKey);
    const msgMap = new Map();
    (Array.isArray(curChat) ? curChat : []).forEach(m => msgMap.set(m.id, m));
    messages.forEach(m => msgMap.set(m.id, m));
    localStorage.setItem(chatKey, JSON.stringify(Array.from(msgMap.values())));
    if (getActiveProjectId() === projectId && typeof window !== 'undefined' && typeof window.renderProjectChatDock === 'function') {
      window.renderProjectChatDock();
    }
  } catch (_) {}
}

function mergePeerProjectEntry(localProj, incoming) {
  if (toTimestamp(incoming.updatedAt) <= toTimestamp(localProj.updatedAt)) return null;
  return stripProjectPayload({
    ...localProj,
    ...incoming,
    id: localProj.id,
    ownerEmail: localProj.ownerEmail || incoming.ownerEmail
  });
}

function applyPeerProjectPatches(patches) {
  if (patches.size === 0) return false;
  const freshProjs = getProjectsList();
  let projChanged = false;
  patches.forEach(({ entry, isNew }, localId) => {
    const idx = findProjectIndex(freshProjs, [localId, entry.id, entry.cloudId]);
    if (idx < 0) {
      if (isNew) {
        freshProjs.unshift(entry);
        projChanged = true;
      }
      return;
    }
    const merged = mergePeerProjectEntry(freshProjs[idx], entry);
    if (merged) {
      freshProjs[idx] = merged;
      projChanged = true;
    }
  });
  if (projChanged) {
    saveProjectsList(freshProjs, { skipCloudSync: true });
  }
  return projChanged;
}

export async function handlePeerSyncResponse({ targetEmail, invitations, projects }) {
  const currentUser = getCurrentUser();
  const myEmail = normalizeEmail(currentUser?.email);
  if (!myEmail || normalizeEmail(targetEmail) !== myEmail) return;

  let changed = false;

  // Mergear invitaciones
  if (Array.isArray(invitations) && invitations.length > 0) {
    const currentInvs = getStoredInvitations();
    invitations.forEach(inv => {
      if (isInvitationOfUser(inv, myEmail) && !currentInvs.some(ci => ci.id === inv.id)) {
        currentInvs.unshift(inv);
        changed = true;
      }
    });
    if (changed) {
      saveStoredInvitations(currentInvs);
    }
  }

  // Mergear proyectos filtrando lápidas locales y en la nube (sin resurrección)
  if (Array.isArray(projects) && projects.length > 0) {
    const knownBeforeFetch = getProjectsList();
    const activeKnownIds = new Set(
      knownBeforeFetch.flatMap(cp => [cp?.id, cp?.cloudId]).filter(Boolean).map(v => String(v).trim())
    );
    const incomingIds = Array.from(new Set(
      projects.flatMap(p => [p?.id, p?.cloudId]).filter(Boolean).map(v => String(v).trim())
    ));
    const unknownIncomingIds = incomingIds.filter(id => !activeKnownIds.has(id));
    const cloudDeletedSet = new Set(lastPeerDeletedSet);
    try {
      const sb = getSupabaseClient();
      const nowDel = Date.now();
      if (sb && isSupabaseConfigured() && unknownIncomingIds.length > 0 && (nowDel - lastPeerDeletedCheckAt) >= 15000) {
        if (!inFlightPeerDeletedPromise) {
          lastPeerDeletedCheckAt = nowDel;
          inFlightPeerDeletedPromise = sb
            .from('proyectos_eliminados')
            .select('proyecto_id')
            .in('proyecto_id', unknownIncomingIds)
            .then(({ data: delRows }) => {
              lastPeerDeletedCheckAt = Date.now();
              if (Array.isArray(delRows)) {
                delRows.forEach(r => {
                  if (r?.proyecto_id) lastPeerDeletedSet.add(String(r.proyecto_id).trim());
                });
              }
              return lastPeerDeletedSet;
            })
            .catch(() => lastPeerDeletedSet)
            .finally(() => { inFlightPeerDeletedPromise = null; });
        }
        const refreshed = await inFlightPeerDeletedPromise;
        if (refreshed) refreshed.forEach(id => cloudDeletedSet.add(id));
      } else if (inFlightPeerDeletedPromise) {
        const refreshed = await inFlightPeerDeletedPromise;
        if (refreshed) refreshed.forEach(id => cloudDeletedSet.add(id));
      }
    } catch (_) {}

    let lastSignoutTs = 0;
    try {
      if (typeof localStorage !== 'undefined') {
        lastSignoutTs = Number(localStorage.getItem('cubikar_last_signout_ts') || 0) || 0;
      }
    } catch (_) {}

    const listAfterFetch = getProjectsList();
    const patches = new Map();
    projects.forEach(p => {
      if (!p || !p.id) return;
      const pIdStr = String(p.id).trim();
      const cIdStr = p.cloudId ? String(p.cloudId).trim() : '';

      if (cloudDeletedSet.has(pIdStr) || (cIdStr && cloudDeletedSet.has(cIdStr))) {
        if (typeof markProjectDeleted === 'function') {
          markProjectDeleted(pIdStr);
          if (cIdStr) markProjectDeleted(cIdStr);
        }
        return;
      }
      if (typeof isProjectMarkedDeleted === 'function' && (isProjectMarkedDeleted(pIdStr) || (cIdStr && isProjectMarkedDeleted(cIdStr)))) {
        return;
      }
      if (typeof isProjectTrashedLocal === 'function' && (isProjectTrashedLocal(pIdStr) || (cIdStr && isProjectTrashedLocal(cIdStr)))) {
        return;
      }
      if (typeof window !== 'undefined' && typeof window.getTrashedCloudProjectIds === 'function') {
        const cTrashed = window.getTrashedCloudProjectIds();
        if (cTrashed.has(pIdStr) || (cIdStr && cTrashed.has(cIdStr))) return;
      }

      const localProj = findLocalProject(listAfterFetch, pIdStr, cIdStr);
      const existedBeforeFetch = activeKnownIds.has(pIdStr) || (cIdStr && activeKnownIds.has(cIdStr));
      if (existedBeforeFetch && !localProj) return;

      // Si pertenece a la misma cuenta y no existe localmente, no reinyectar si es anterior al último cierre/purga
      const incomingUpdated = toTimestamp(p.updatedAt);
      if (!localProj && isProjectOwnedBy(p, myEmail) && lastSignoutTs > 0 && incomingUpdated > 0 && incomingUpdated < lastSignoutTs) {
        return;
      }

      const localId = localProj ? localProj.id : pIdStr;
      if (!isProjectOwnedBy(localProj, myEmail) && !isProjectOwnedBy(p, myEmail)) {
        applyPeerProjectData(localId, p);
      }
      mergePeerChatMessages(localId, p.chatMessages);
      patches.set(localId, { entry: stripProjectPayload(p), isNew: !localProj });
    });
    if (applyPeerProjectPatches(patches)) {
      changed = true;
    }
  }

  if (changed) {
    try {
      if (typeof window !== 'undefined' && typeof window.syncUserCollaborationToCloud === 'function') {
        window.syncUserCollaborationToCloud(currentUser);
      }
    } catch (_) {}
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
  }
}

// =========================================================================
// SINCRONIZACIÓN DE CHAT DE PROYECTO EN TIEMPO REAL & PERSISTENCIA EN ANFITRIÓN
// =========================================================================

function normChatTextToken(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extractAllMessageMentions(message, fallbackEtiquetas = null) {
  const seen = new Set();
  const out = [];
  const push = (raw) => {
    const clean = String(raw || '').trim().replace(/[.,;:!?)\]]+$/, '');
    if (!clean.startsWith('@') || clean.length < 2) return;
    const norm = normChatTextToken(clean);
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(clean);
    }
  };
  if (Array.isArray(message?.mentions)) message.mentions.forEach(push);
  if (Array.isArray(fallbackEtiquetas)) fallbackEtiquetas.forEach(push);
  if (typeof message?.text === 'string') {
    const matches = message.text.match(/@[A-Za-z0-9_.\-áéíóúÁÉÍÓÚñÑ]+/g);
    if (matches) matches.forEach(push);
  }
  return out;
}

function sanitizeChatMsgForCloud(msg) {
  if (!msg || typeof msg !== 'object') return msg;
  const copy = { ...msg };
  delete copy.localReadBy;
  delete copy.localDismissedBy;
  copy.perUserRead = true;
  copy.isRead = false;
  copy.dismissed = false;
  copy.readBy = [];
  return copy;
}

function mergeRemoteChatMessage(prev, remoteMsg, rowEtiquetas = null) {
  const mergedMentions = extractAllMessageMentions(remoteMsg, rowEtiquetas);
  const remoteWithoutSharedRead = { ...remoteMsg };
  if (remoteWithoutSharedRead.perUserRead) {
    delete remoteWithoutSharedRead.isRead;
    delete remoteWithoutSharedRead.dismissed;
    delete remoteWithoutSharedRead.readBy;
  }
  const baseMerged = prev
    ? {
        ...remoteWithoutSharedRead,
        ...(prev.localReadBy ? { localReadBy: prev.localReadBy } : {}),
        ...(prev.localDismissedBy ? { localDismissedBy: prev.localDismissedBy } : {}),
        isRead: Boolean(prev.isRead),
        dismissed: Boolean(prev.dismissed),
        readBy: Array.from(new Set([
          ...(Array.isArray(prev.readBy) ? prev.readBy.filter(r => r !== '__all__') : []),
          ...(Array.isArray(remoteMsg.readBy) && !remoteMsg.perUserRead ? remoteMsg.readBy : [])
        ])),
        perUserRead: Boolean(prev.perUserRead || remoteMsg.perUserRead)
      }
    : {
        ...remoteMsg,
        ...(remoteMsg.perUserRead ? { isRead: false, dismissed: false, readBy: [] } : {})
      };
  if (mergedMentions.length > 0 && (!Array.isArray(baseMerged.mentions) || baseMerged.mentions.length === 0)) {
    baseMerged.mentions = mergedMentions;
  }
  return baseMerged;
}

function isUserMentionedInIncomingMsg(currentUser, proj, message) {
  if (!currentUser || !message) return false;
  const myEmail = String(currentUser.email || '').toLowerCase().trim();
  const mentions = extractAllMessageMentions(message);
  if (mentions.length === 0) return false;

  const selfTokens = new Set(['@todos']);
  const addTok = (val) => {
    const raw = String(val || '').toLowerCase().trim();
    const norm = normChatTextToken(val);
    if (raw) selfTokens.add(raw);
    if (norm) selfTokens.add(norm);
  };
  if (myEmail) {
    addTok(myEmail);
    const prefix = myEmail.split('@')[0];
    if (prefix) addTok('@' + prefix);
  }
  const myName = String(currentUser.name || '').trim();
  if (myName) {
    addTok('@' + myName.replace(/\s+/g, '.'));
    addTok('@' + myName.replace(/\s+/g, ''));
    const parts = myName.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    if (parts.length >= 2) {
      const surname = parts.length >= 4 ? parts[2] : parts[1];
      addTok(`@${parts[0]}.${surname.charAt(0)}`);
      addTok(`@${parts[0]}.${surname.charAt(0)}.`);
    }
  }
  const members = Array.isArray(proj?.members) ? proj.members : [];
  members.forEach(m => {
    const mEmail = String(m?.email || '').toLowerCase().trim();
    const mNameNorm = normChatTextToken(m?.name);
    if ((myEmail && mEmail === myEmail) || (myName && mNameNorm && mNameNorm === normChatTextToken(myName))) {
      const cleanName = String(m?.name || '').trim();
      if (cleanName) {
        addTok('@' + cleanName.replace(/\s+/g, '.'));
        const mParts = cleanName.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        if (mParts.length >= 2) {
          const mSurname = mParts.length >= 4 ? mParts[2] : mParts[1];
          addTok(`@${mParts[0]}.${mSurname.charAt(0)}`);
        }
      }
    }
  });
  return mentions.some(tag => selfTokens.has(normChatTextToken(tag)) || selfTokens.has(String(tag).toLowerCase().trim()));
}

export function resolveChatStorageKey(projectId = null) {
  let pid = projectId || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null) || 'proj-default-01';
  try {
    const proj = getProjectsList().find(p => p && (p.id === pid || p.cloudId === pid));
    if (proj && proj.id) pid = proj.id;
  } catch (_) {}
  const isArq = typeof window !== 'undefined' && (
    (window.location?.hostname || '').includes('arq') ||
    (window.location?.pathname || '').includes('ADM_ARQ')
  );
  return `${isArq ? 'adm_arq' : 'adm_const'}_project_chat_${pid}`;
}

export function handleIncomingChatMessage(data) {
  if (!data || !data.projectId || !data.message) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const cleanMsgId = String(data.message.id || '').replace(/^.*?(?:__|::)/, '');
  if (!cleanMsgId || cleanMsgId.startsWith('seed_msg_')) return;

  // Ignorar ecos de la misma sesión
  if (
    data.senderSessionId === LOCAL_CLIENT_SESSION_ID ||
    data.message.senderSessionId === LOCAL_CLIENT_SESSION_ID ||
    isRecentlyPushedLocally(cleanMsgId)
  ) {
    return;
  }

  const myEmail = currentUser.email.toLowerCase().trim();
  const authorEmail = (data.author?.email || data.message?.authorEmail || '').toLowerCase().trim();

  const projectId = data.projectId;
  const currentPId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;
  const allProjects = getProjectsList();
  const proj = allProjects.find(p => p.id === projectId || p.cloudId === projectId);
  const isCurrentActive = Boolean(currentPId && (currentPId === projectId || (proj && (currentPId === proj.id || currentPId === proj.cloudId))));

  if (!proj && !isCurrentActive) return;

  if (proj && !isCurrentActive) {
    const isOwner = (proj.ownerEmail || '').toLowerCase().trim() === myEmail;
    const isMember = Array.isArray(proj.members) && proj.members.some(m => (m.email || '').toLowerCase().trim() === myEmail);
    if (!isOwner && !isMember) return;
  }

  const effectivePid = proj?.id || projectId;

  // 1. Guardar mensaje en el almacenamiento local de este proyecto deduplicando por ID normalizado
  const chatKey = resolveChatStorageKey(effectivePid);
  let messages = [];
  try {
    const raw = localStorage.getItem(chatKey);
    if (raw) messages = JSON.parse(raw);
    if (!Array.isArray(messages)) messages = [];
  } catch (_) {
    messages = [];
  }

  const existsIdx = messages.findIndex(m => String(m?.id || '').replace(/^.*?(?:__|::)/, '') === cleanMsgId);
  const isAlreadyPresent = existsIdx !== -1;

  const dockEl = typeof document !== 'undefined' ? document.getElementById('project-chat-dock') : null;
  const isDockOpen = Boolean(isCurrentActive && dockEl && !dockEl.classList.contains('hidden'));
  const isOwnAuthor = Boolean(myEmail && authorEmail && authorEmail === myEmail);
  const normalizedMentions = extractAllMessageMentions(data.message, data.etiquetas);
  const normalizedIncoming = {
    ...data.message,
    id: cleanMsgId,
    perUserRead: true,
    mentions: normalizedMentions.length > 0 ? normalizedMentions : (Array.isArray(data.message.mentions) ? data.message.mentions : []),
    isRead: Boolean(isOwnAuthor || isDockOpen),
    dismissed: false,
    readBy: (isOwnAuthor || isDockOpen) && myEmail ? [myEmail] : [],
    localReadBy: (isOwnAuthor || isDockOpen) ? { [myEmail || '__local__']: true } : {}
  };

  if (!isAlreadyPresent) {
    messages.push(normalizedIncoming);
    try {
      localStorage.setItem(chatKey, JSON.stringify(messages));
    } catch (_) {}
  } else {
    return;
  }

  // 2. Actualizar campana de notificaciones inmediatamente (tanto en obra activa como en Portal)
  if (typeof window !== 'undefined' && typeof window.renderSidebarNotificationsUI === 'function') {
    try { window.renderSidebarNotificationsUI(); } catch (_) {}
  }

  // 3. Si la obra está abierta actualmente en pantalla, actualizar la interfaz del dock y badge del chat
  if (isCurrentActive) {
    if (typeof window !== 'undefined' && typeof window.renderProjectChatDock === 'function') {
      window.renderProjectChatDock();
    }
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        const listEl = document.getElementById('project-chat-messages-list');
        if (listEl) listEl.scrollTop = listEl.scrollHeight;
      }, 50);
    }
  }

  if (authorEmail !== myEmail && isUserMentionedInIncomingMsg(currentUser, proj, normalizedIncoming)) {
    const pName = proj?.projectName ? ` en ${proj.projectName}` : ' en el chat';
    showToast(`💬 ${data.author?.name || 'Un colaborador'} te mencionó${pName}`, 'info');
  }
}

export function handleIncomingChatDelete(data) {
  if (!data || !data.projectId || !data.messageId) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const projectId = data.projectId;
  const allProjects = getProjectsList();
  const proj = allProjects.find(p => p.id === projectId || p.cloudId === projectId);
  const effectivePid = proj?.id || projectId;

  const keysToClean = Array.from(new Set([resolveChatStorageKey(effectivePid), resolveChatStorageKey(projectId)]));
  let removed = false;
  keysToClean.forEach((chatKey) => {
    try {
      const raw = localStorage.getItem(chatKey);
      if (raw) {
        const messages = JSON.parse(raw);
        if (Array.isArray(messages)) {
          const next = messages.filter(m => String(m?.id) !== String(data.messageId));
          if (next.length !== messages.length) {
            localStorage.setItem(chatKey, JSON.stringify(next));
            removed = true;
          }
        }
      }
    } catch (_) {}
  });

  if (typeof window !== 'undefined' && typeof window.renderSidebarNotificationsUI === 'function') {
    try { window.renderSidebarNotificationsUI(); } catch (_) {}
  }

  const currentPId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;
  const isCurrentActive = Boolean(currentPId && (currentPId === projectId || currentPId === effectivePid || (proj && (currentPId === proj.id || currentPId === proj.cloudId))));
  if (removed && isCurrentActive) {
    if (typeof window !== 'undefined' && typeof window.renderProjectChatDock === 'function') {
      window.renderProjectChatDock();
    }
  }
}

export function broadcastChatMessage(projectId, message) {
  const pId = projectId || currentSubscribedProjectId || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null);
  if (!pId || !message) return;

  const cleanMsgId = String(message.id || '').replace(/^.*?(?:__|::)/, '');
  message.id = cleanMsgId;
  message.senderSessionId = LOCAL_CLIENT_SESSION_ID;
  markLocalConceptPush(cleanMsgId);

  const currentUser = getCurrentUser();
  const author = {
    id: currentUser?.id || null,
    email: currentUser?.email || message.authorEmail || '',
    name: currentUser?.name || message.authorName || 'Colaborador',
    avatar: currentUser?.avatar || message.authorAvatar || ''
  };

  const allProjects = getProjectsList();
  const proj = allProjects.find(p => p.id === pId || p.cloudId === pId);
  const ownerEmail = (proj?.ownerEmail || currentUser?.email || '').toLowerCase().trim();
  const effectiveBroadcastPid = proj?.cloudId || pId;

  const payload = {
    projectId: effectiveBroadcastPid,
    ownerEmail,
    senderSessionId: LOCAL_CLIENT_SESSION_ID,
    author,
    message,
    timestamp: new Date().toISOString()
  };

  // 1. Broadcast en canal de la obra activa
  const isSubscribedMatch = activeChannel && (
    currentSubscribedProjectId === pId ||
    currentSubscribedProjectId === effectiveBroadcastPid ||
    (proj && (currentSubscribedProjectId === proj.id || currentSubscribedProjectId === proj.cloudId))
  );
  if (isSubscribedMatch) {
    try {
      const res = activeChannel.send({
        type: 'broadcast',
        event: 'chat_mensaje_nuevo',
        payload
      });
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.warn('[Realtime] Error al emitir mensaje de chat:', err));
      }
    } catch (_) {}
  }

  // 2. Broadcast en canal global de sincronización
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (globalSyncChannel) {
    try {
      const res = globalSyncChannel.send({
        type: 'broadcast',
        event: 'chat_mensaje_global',
        payload
      });
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.warn('[Realtime] Error al emitir mensaje global de chat:', err));
      }
    } catch (_) {}
  }

  // 3. Persistir en Supabase y cuenta del anfitrión
  persistChatMessageToHostCloud(pId, message, proj);
}

export function broadcastChatDelete(projectId, messageId) {
  const pId = projectId || currentSubscribedProjectId || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null);
  if (!pId || !messageId) return;

  const currentUser = getCurrentUser();
  const allProjects = getProjectsList();
  const proj = allProjects.find(p => p.id === pId || p.cloudId === pId);
  const effectiveBroadcastPid = proj?.cloudId || pId;

  const payload = {
    projectId: effectiveBroadcastPid,
    messageId,
    authorEmail: currentUser?.email || '',
    timestamp: new Date().toISOString()
  };

  const isSubscribedMatch = activeChannel && (
    currentSubscribedProjectId === pId ||
    currentSubscribedProjectId === effectiveBroadcastPid ||
    (proj && (currentSubscribedProjectId === proj.id || currentSubscribedProjectId === proj.cloudId))
  );
  if (isSubscribedMatch) {
    try {
      const res = activeChannel.send({
        type: 'broadcast',
        event: 'chat_mensaje_eliminado',
        payload
      });
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.warn('[Realtime] Error al emitir eliminación de chat:', err));
      }
    } catch (_) {}
  }

  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (globalSyncChannel) {
    try {
      const res = globalSyncChannel.send({
        type: 'broadcast',
        event: 'chat_mensaje_eliminado_global',
        payload
      });
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.warn('[Realtime] Error al emitir eliminación global de chat:', err));
      }
    } catch (_) {}
  }

  deleteChatMessageFromHostCloud(pId, messageId);
}

const CHAT_MENSAJES_BASE_COLS = ['id', 'proyecto_id', 'autor_nombre', 'autor_email', 'mensaje', 'created_at'];
const missingChatMensajeColumns = new Set();
const inFlightChatHydrateByProject = new Map();
const lastChatHydrateAtByProject = new Map();
let inFlightAllChatHydratePromise = null;

async function upsertChatRowsResilient(sb, rowOrRows) {
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  if (!sb || typeof sb.from !== 'function' || rows.length === 0) return { error: null };
  const stripMissing = (list) => list.map((r) => {
    const clean = { ...r };
    missingChatMensajeColumns.forEach((col) => { delete clean[col]; });
    return clean;
  });
  let payload = stripMissing(rows);
  for (let attempt = 0; attempt < 8; attempt++) {
    const body = (!Array.isArray(rowOrRows) && payload.length === 1) ? payload[0] : payload;
    const res = await sb.from('chat_mensajes').upsert(body, { onConflict: 'id' });
    if (!res?.error) return res;
    const msg = String(res.error.message || '');
    const m = msg.match(/Could not find the ['"]([^'"]+)['"] column/i)
      || msg.match(/column\s+["']?([a-z0-9_]+)["']?(?:\s+of\s+relation)?\s+does not exist/i);
    if (m && m[1] && !CHAT_MENSAJES_BASE_COLS.includes(m[1])) {
      missingChatMensajeColumns.add(m[1]);
      payload = stripMissing(payload);
      continue;
    }
    if ((res.error.code === 'PGRST204' || res.error.code === '42703') && attempt < 7) {
      payload = rows.map((r) => {
        const minRow = {};
        CHAT_MENSAJES_BASE_COLS.forEach((c) => { if (r[c] !== undefined) minRow[c] = r[c]; });
        return minRow;
      });
      continue;
    }
    return res;
  }
  return { error: new Error('No se pudo persistir en chat_mensajes') };
}

export async function persistChatMessageToHostCloud(projectId, message, proj) {
  const sb = getSupabaseClient();
  const allProjects = proj ? [proj] : getProjectsList();
  const targetProj = proj || allProjects.find(p => p.id === projectId || p.cloudId === projectId);
  if (!projectId || !message) return;

  const cleanMsgId = String(message.id || '').replace(/^.*?(?:__|::)/, '');
  message.id = cleanMsgId;
  message.senderSessionId = LOCAL_CLIENT_SESSION_ID;
  markLocalConceptPush(cleanMsgId);

  const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || '').trim());
  const canonicalPid = (targetProj?.cloudId && isUuid(targetProj.cloudId))
    ? String(targetProj.cloudId).trim()
    : (isUuid(targetProj?.id) ? String(targetProj.id).trim() : String(projectId).trim());

  // 1. Guardar en tabla Supabase 'chat_mensajes' usando columnas resilientes
  const cloudPayloadMsg = sanitizeChatMsgForCloud(message);
  if (sb && typeof sb.from === 'function') {
    try {
      const rowId = `${canonicalPid}__${cleanMsgId}`;
      markLocalConceptPush(rowId);
      const { error } = await upsertChatRowsResilient(sb, {
        id: rowId,
        proyecto_id: canonicalPid,
        autor_nombre: message.authorName || 'Colaborador',
        autor_email: message.authorEmail || getCurrentUser()?.email || '',
        autor_avatar_url: message.authorAvatar || '',
        mensaje: message.text || '',
        partida_id: message.partidaId ? String(message.partidaId) : null,
        etiquetas: Array.isArray(message.mentions) ? message.mentions : [],
        payload_json: cloudPayloadMsg,
        created_at: message.createdAt || new Date().toISOString()
      });
      if (error) {
        console.warn('[Realtime] Error al persistir mensaje en chat_mensajes:', error.message || error);
      }
    } catch (err) {
      console.warn('[Realtime] Excepción al persistir mensaje en chat_mensajes:', err);
    }
  }
}

export async function deleteChatMessageFromHostCloud(projectId, messageId) {
  const sb = getSupabaseClient();
  if (!sb || !projectId || !messageId) return;
  try {
    const allProjects = getProjectsList();
    const targetProj = allProjects.find(p => p.id === projectId || p.cloudId === projectId);
    const idCandidates = Array.from(new Set([projectId, targetProj?.id, targetProj?.cloudId].filter(Boolean)));
    const rowIds = [String(messageId)];
    idCandidates.forEach((cid) => {
      rowIds.push(`${cid}__${messageId}`);
      rowIds.push(`${cid}::${messageId}`);
    });
    const { error } = await sb.from('chat_mensajes').delete().in('id', Array.from(new Set(rowIds)));
    if (error) {
      console.warn('[Realtime] Error al eliminar mensaje en chat_mensajes:', error.message || error);
    }
  } catch (err) {
    console.warn('[Realtime] Excepción al eliminar mensaje en chat_mensajes:', err);
  }
}

export async function hydrateProjectChatFromCloud(projectId, opts = {}) {
  const sb = getSupabaseClient();
  if (!sb || !projectId || typeof sb.from !== 'function') return;
  if (String(projectId).startsWith('__')) return;
  const allProjects = getProjectsList();
  const targetProj = allProjects.find(p => p.id === projectId || p.cloudId === projectId);
  const effectivePid = targetProj?.id || projectId;

  const existingInFlight = inFlightChatHydrateByProject.get(effectivePid);
  if (existingInFlight) return existingInFlight;

  const now = Date.now();
  const lastAt = lastChatHydrateAtByProject.get(effectivePid) || 0;
  if (!opts?.force && ((now - lastAt) < 12000 || (lastAllChatHydrateAt > 0 && (now - lastAllChatHydrateAt) < 12000))) {
    return;
  }
  if (!opts?.force && inFlightAllChatHydratePromise) {
    try { await inFlightAllChatHydratePromise; } catch (_) {}
    if ((Date.now() - (lastChatHydrateAtByProject.get(effectivePid) || 0)) < 12000) return;
  }
  lastChatHydrateAtByProject.set(effectivePid, Date.now());

  const runPromise = (async () => {
    try {
      const idsToQuery = Array.from(new Set([effectivePid, projectId, targetProj?.cloudId].filter(v => v && !String(v).startsWith('__'))));

      const { data, error } = await sb
        .from('chat_mensajes')
        .select('*')
        .in('proyecto_id', idsToQuery)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[Realtime] Aviso hidratando chat_mensajes:', error.message || error);
        return;
      }

      if (Array.isArray(data) && data.length > 0) {
        const chatKey = resolveChatStorageKey(effectivePid);
        let localMessages = [];
        try {
          const raw = localStorage.getItem(chatKey);
          if (raw) localMessages = JSON.parse(raw);
        } catch (_) {}
        if (!Array.isArray(localMessages)) localMessages = [];

        const map = new Map();
        localMessages.forEach(m => {
          if (m && m.id) {
            const normId = String(m.id).replace(/^.*?(?:__|::)/, '');
            if (normId.startsWith('seed_msg_')) return;
            map.set(normId, { ...m, id: normId });
          }
        });
        data.forEach(row => {
          if (!row || (row.id && String(row.id).startsWith('__'))) return;
          const rawJson = (row.payload_json && typeof row.payload_json === 'object')
            ? row.payload_json
            : ((row.datos_json && typeof row.datos_json === 'object') ? row.datos_json : null);
          const cleanId = String(rawJson?.id || row.id || '').replace(/^.*?(?:__|::)/, '');
          if (!cleanId || cleanId.startsWith('seed_msg_')) return;
          const msg = rawJson
            ? {
                ...rawJson,
                id: cleanId,
                mentions: (Array.isArray(rawJson.mentions) && rawJson.mentions.length > 0)
                  ? rawJson.mentions
                  : (Array.isArray(row.etiquetas) ? row.etiquetas : [])
              }
            : {
                id: cleanId,
                text: row.mensaje || row.texto || '',
                mentions: Array.isArray(row.etiquetas) ? row.etiquetas : [],
                authorName: row.autor_nombre || 'Colaborador',
                authorEmail: row.autor_email || '',
                authorAvatar: row.autor_avatar_url || row.autor_avatar || '',
                time: (row.created_at || row.creado_en) ? new Date(row.created_at || row.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
              };
          const prev = map.get(cleanId);
          map.set(cleanId, mergeRemoteChatMessage(prev, msg, row.etiquetas));
        });

        const merged = Array.from(map.values()).sort((a, b) => {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return tA - tB;
        });

        localStorage.setItem(chatKey, JSON.stringify(merged));
        if (typeof window !== 'undefined') {
          if (typeof window.renderProjectChatDock === 'function') {
            window.renderProjectChatDock();
          }
          if (typeof window.renderSidebarNotificationsUI === 'function') {
            window.renderSidebarNotificationsUI();
          }
        }
      }
    } catch (err) {
      console.warn('[Realtime] Error hidratando chat desde Supabase:', err);
    } finally {
      inFlightChatHydrateByProject.delete(effectivePid);
    }
  })();

  inFlightChatHydrateByProject.set(effectivePid, runPromise);
  return runPromise;
}

let lastAllChatHydrateAt = 0;

export async function hydrateAllUserProjectsChatFromCloud(force = false) {
  const sb = getSupabaseClient();
  const user = getCurrentUser();
  if (!sb || !isSupabaseConfigured() || !user || !user.email || typeof sb.from !== 'function') return false;

  if (inFlightAllChatHydratePromise) return inFlightAllChatHydratePromise;

  const now = Date.now();
  const minCooldownMs = force ? 4000 : 15000;
  if ((now - lastAllChatHydrateAt) < minCooldownMs) return false;

  inFlightAllChatHydratePromise = (async () => {
    try {
      const projects = getProjectsList() || [];
      const projByAnyId = new Map();
      const idsToQuery = [];
      const idSet = new Set();
      projects.forEach(p => {
        if (!p) return;
        [p.id, p.cloudId].forEach(pid => {
          if (pid && !String(pid).startsWith('__') && !idSet.has(String(pid))) {
            idSet.add(String(pid));
            idsToQuery.push(String(pid));
            projByAnyId.set(String(pid), p);
          }
        });
      });
      if (idsToQuery.length === 0) return false;
      const hydrateTs = Date.now();
      lastAllChatHydrateAt = hydrateTs;
      idsToQuery.forEach(pid => lastChatHydrateAtByProject.set(pid, hydrateTs));
      projects.forEach(p => { if (p?.id) lastChatHydrateAtByProject.set(p.id, hydrateTs); });

      const { data, error } = await sb
        .from('chat_mensajes')
        .select('*')
        .in('proyecto_id', idsToQuery.slice(0, 60))
        .order('created_at', { ascending: true });

      if (error || !Array.isArray(data) || data.length === 0) return false;

      const rowsByProj = new Map();
      data.forEach(row => {
        if (!row || !row.proyecto_id || String(row.proyecto_id).startsWith('__')) return;
        if (row.id && String(row.id).startsWith('__')) return;
        const proj = projByAnyId.get(String(row.proyecto_id));
        const canonicalPid = proj?.id || String(row.proyecto_id);
        if (!rowsByProj.has(canonicalPid)) rowsByProj.set(canonicalPid, []);
        rowsByProj.get(canonicalPid).push(row);
      });

      let updatedAny = false;
      rowsByProj.forEach((rows, canonicalPid) => {
        const chatKey = resolveChatStorageKey(canonicalPid);
        let localMessages = [];
        try {
          const raw = localStorage.getItem(chatKey);
          if (raw) localMessages = JSON.parse(raw);
        } catch (_) {}
        if (!Array.isArray(localMessages)) localMessages = [];

        const map = new Map();
        localMessages.forEach(m => {
          if (m && m.id) {
            const normId = String(m.id).replace(/^.*?(?:__|::)/, '');
            if (normId.startsWith('seed_msg_')) return;
            map.set(normId, { ...m, id: normId });
          }
        });
        rows.forEach(row => {
          const rawJson = (row.payload_json && typeof row.payload_json === 'object')
            ? row.payload_json
            : ((row.datos_json && typeof row.datos_json === 'object') ? row.datos_json : null);
          const cleanId = String(rawJson?.id || row.id || '').replace(/^.*?(?:__|::)/, '');
          if (!cleanId || cleanId.startsWith('seed_msg_')) return;
          const msg = rawJson
            ? {
                ...rawJson,
                id: cleanId,
                mentions: (Array.isArray(rawJson.mentions) && rawJson.mentions.length > 0)
                  ? rawJson.mentions
                  : (Array.isArray(row.etiquetas) ? row.etiquetas : [])
              }
            : {
                id: cleanId,
                text: row.mensaje || row.texto || '',
                mentions: Array.isArray(row.etiquetas) ? row.etiquetas : [],
                authorName: row.autor_nombre || 'Colaborador',
                authorEmail: row.autor_email || '',
                authorAvatar: row.autor_avatar_url || row.autor_avatar || '',
                createdAt: row.created_at || row.creado_en || new Date().toISOString(),
                time: (row.created_at || row.creado_en) ? new Date(row.created_at || row.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
              };
          map.set(cleanId, mergeRemoteChatMessage(map.get(cleanId), msg, row.etiquetas));
        });

        const merged = Array.from(map.values()).sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
        localStorage.setItem(chatKey, JSON.stringify(merged));
        updatedAny = true;
      });

      if (updatedAny && typeof window !== 'undefined') {
        if (typeof window.renderProjectChatDock === 'function') window.renderProjectChatDock();
        if (typeof window.renderSidebarNotificationsUI === 'function') window.renderSidebarNotificationsUI();
      }
      return updatedAny;
    } catch (err) {
      console.warn('[Realtime] Error hidratando chats del usuario:', err);
      return false;
    } finally {
      inFlightAllChatHydratePromise = null;
    }
  })();

  return inFlightAllChatHydratePromise;
}

if (typeof window !== 'undefined') {
  window.hydrateAllUserProjectsChatFromCloud = hydrateAllUserProjectsChatFromCloud;
  window.CubikarRealtime = {
    initGlobalRealtimeSync,
    subscribeToProjectRealtime,
    unsubscribeFromProjectRealtime,
    broadcastNewInvitation,
    broadcastInvitationAccepted,
    broadcastInvitationRejected,
    broadcastNewProject,
    broadcastProjectDeleted,
    handleIncomingProjectDeleted,
    broadcastProjectTrashed,
    handleIncomingProjectTrashed,
    broadcastProjectRestored,
    handleIncomingProjectRestored,
    broadcastCollaboratorRemoved,
    handleIncomingCollaboratorRemoved,
    broadcastProjectMutation,
    handleIncomingProjectUpdate,
    broadcastChatMessage,
    broadcastChatDelete,
    handleIncomingChatMessage,
    handleIncomingChatDelete,
    hydrateProjectChatFromCloud,
    hydrateAllUserProjectsChatFromCloud,
    requestPeerSync,
    handlePeerSyncResponse
  };
  window.broadcastProjectDeleted = broadcastProjectDeleted;
  window.handleIncomingProjectDeleted = handleIncomingProjectDeleted;
  window.broadcastProjectTrashed = broadcastProjectTrashed;
  window.handleIncomingProjectTrashed = handleIncomingProjectTrashed;
  window.broadcastProjectRestored = broadcastProjectRestored;
  window.handleIncomingProjectRestored = handleIncomingProjectRestored;
  window.broadcastCollaboratorRemoved = broadcastCollaboratorRemoved;
  window.handleIncomingCollaboratorRemoved = handleIncomingCollaboratorRemoved;
  window.subscribeToProjectRealtime = subscribeToProjectRealtime;
  window.unsubscribeFromProjectRealtime = unsubscribeFromProjectRealtime;
  window.broadcastProjectMutation = broadcastProjectMutation;
  window.handleIncomingProjectUpdate = handleIncomingProjectUpdate;
  window.broadcastChatMessage = broadcastChatMessage;
  window.broadcastChatDelete = broadcastChatDelete;
  window.markLocalConceptsPushed = (ids) => {
    if (Array.isArray(ids)) {
      ids.forEach((id) => markLocalConceptPush(id));
    } else if (ids) {
      markLocalConceptPush(ids);
    }
  };
}
