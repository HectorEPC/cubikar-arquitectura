// js/mobile/mobileChatArq.js — Bitácora / Chat en tiempo real de cubikar Arquitectura

import { getActiveProjectId } from '../config/constants.js?v=20261119_cf40';
import { getCurrentUser, getProjectById, getUserRoleInProject, canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf40';
import {
  getMessageDivision,
  loadProjectChatMessages,
  saveProjectChatMessages,
  markActiveProjectChatMessagesAsRead,
  deleteProjectChatMessage,
  isChatMessageReadForCurrentUser
} from '../modules/chat/projectChat.js?v=20261119_cf40';
import { broadcastChatMessage, hydrateProjectChatFromCloud } from '../core/realtimeSync.js?v=20261119_cf40';
import { escapeHtml } from './mobileBridge.js?v=20261119_cf40';

const DIVISIONS = [
  { id: 'alcance_presupuesto', label: 'Alcances y Presupuesto' },
  { id: 'seguimiento_calendario', label: 'Seguimiento y Calendario' },
  { id: 'estimaciones', label: 'Estimaciones' }
];

let activeDiv = 'alcance_presupuesto';
let conceptFilterId = null;

export function setArqChatConceptFilter(node) {
  activeDiv = 'alcance_presupuesto';
  conceptFilterId = node ? String(node.id) : null;
}

export function getUnreadArqChatCount(projectId = null) {
  const pId = projectId || getActiveProjectId();
  if (!pId) return 0;
  return (loadProjectChatMessages(pId) || []).filter(m => !isChatMessageReadForCurrentUser(m, pId)).length;
}

export function renderMobileChatArq(container, { onCloseChat }) {
  if (!container) return;
  const pId = getActiveProjectId();
  if (!pId) return;

  hydrateProjectChatFromCloud(pId).catch(() => {});
  markActiveProjectChatMessagesAsRead(pId);

  const msgs = (loadProjectChatMessages(pId) || []).filter(m => {
    if (getMessageDivision(m) !== activeDiv) return false;
    if (conceptFilterId && String(m.partidaId || '') !== conceptFilterId) return false;
    return true;
  });

  const u = getCurrentUser();
  const myEmail = (u?.email || '').toLowerCase().trim();
  const proj = getProjectById(pId);
  const ownerEmail = (proj?.ownerEmail || '').toLowerCase().trim();
  const myRole = String(getUserRoleInProject(pId, u) || '').toLowerCase().trim();
  const canEdit = canCurrentUserEditProject(pId, u);
  const isOwnerOrEditor = !ownerEmail || (myEmail && myEmail === ownerEmail) || myRole === 'owner' || myRole === 'admin' || myRole === 'editar' || myRole === 'editor';

  container.innerHTML = `
    <div class="m-row-between">
      <div class="m-row">
        <button type="button" id="m-aqc-back" class="m-btn m-btn-outline m-btn-sm"><i class="fa-solid fa-arrow-left"></i> Volver</button>
        <h2 class="m-title" style="font-size:15.5px;">Bitácora Chat</h2>
      </div>
      ${conceptFilterId ? `<button type="button" id="m-aqc-clear" class="m-btn m-btn-outline m-btn-sm">Todos los mensajes</button>` : ''}
    </div>

    <div class="m-chip-bar">
      ${DIVISIONS.map(d => `<button type="button" data-aqc-div="${d.id}" class="m-chip ${activeDiv === d.id ? 'is-active' : ''}">${d.label}</button>`).join('')}
    </div>

    <div id="m-aqc-stream" class="m-card" style="min-height:260px;max-height:52dvh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
      ${msgs.length === 0 ? `<div style="margin:auto;color:var(--muted);font-size:12.5px;">Sin mensajes en esta división todavía.</div>` : msgs.map(m => {
        const mine = myEmail && String(m.authorEmail || '').toLowerCase().trim() === myEmail;
        const canDeleteMsg = canEdit && (mine || isOwnerOrEditor);
        return `
          <div class="m-card-alt" style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:88%;border-color:${mine ? 'var(--primary)' : 'var(--border)'};background:${mine ? 'var(--primary-soft)' : 'var(--card-alt)'};">
            <div class="m-row-between" style="gap:10px;margin-bottom:3px;">
              <strong style="font-size:11px;">${escapeHtml(m.authorName || 'Usuario')}</strong>
              <span style="font-size:10px;color:var(--muted);">${escapeHtml(m.time || '')}</span>
            </div>
            <div style="font-size:12.5px;white-space:pre-wrap;">${escapeHtml(m.text || '')}</div>
            ${canDeleteMsg ? `<div style="text-align:right;"><button type="button" data-aqc-del="${escapeHtml(m.id)}" style="border:none;background:none;color:var(--muted);font-size:10px;cursor:pointer;">Eliminar</button></div>` : ''}
          </div>
        `;
      }).join('')}
    </div>

    ${canEdit ? `
      <form id="m-aqc-form" class="m-row" style="gap:8px;">
        <input id="m-aqc-input" class="m-input" required placeholder="Escribir nota o mensaje..." style="flex:1;">
        <button type="submit" class="m-btn m-btn-primary"><i class="fa-solid fa-paper-plane"></i></button>
      </form>
    ` : `
      <div class="m-card-alt" style="text-align:center;font-size:12px;color:var(--muted);">
        <i class="fa-solid fa-lock"></i> Modo lectura: solo los usuarios con permiso de edición pueden escribir en el chat.
      </div>
    `}
  `;

  const stream = container.querySelector('#m-aqc-stream');
  if (stream) stream.scrollTop = stream.scrollHeight;

  container.querySelector('#m-aqc-back')?.addEventListener('click', () => onCloseChat?.());
  container.querySelector('#m-aqc-clear')?.addEventListener('click', () => {
    conceptFilterId = null;
    renderMobileChatArq(container, { onCloseChat });
  });
  container.querySelectorAll('[data-aqc-div]').forEach(b => b.addEventListener('click', () => {
    activeDiv = b.dataset.aqcDiv;
    renderMobileChatArq(container, { onCloseChat });
  }));
  container.querySelectorAll('[data-aqc-del]').forEach(b => b.addEventListener('click', () => {
    if (!canEdit) return;
    deleteProjectChatMessage(b.dataset.aqcDel);
    renderMobileChatArq(container, { onCloseChat });
  }));
  container.querySelector('#m-aqc-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!canEdit) return;
    const inp = container.querySelector('#m-aqc-input');
    const text = (inp?.value || '').trim();
    if (!text) return;
    const now = new Date();
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      division: activeDiv,
      authorName: u?.name || u?.email || 'Arquitecto',
      authorEmail: u?.email || '',
      time: `${now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} • ${now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: now.toISOString(),
      partidaId: conceptFilterId || null,
      text,
      readBy: [u?.email || '']
    };
    const cur = loadProjectChatMessages(pId) || [];
    cur.push(msg);
    saveProjectChatMessages(cur, pId, { skipCloudSync: true });
    try { broadcastChatMessage(pId, msg); } catch (_) {}
    renderMobileChatArq(container, { onCloseChat });
  });
}
