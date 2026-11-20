// js/mobile/mobileProjects.js — Proyectos de cubikar Arquitectura (Mis Proyectos vs Invitado + Papelera + Nuevo)

import { setActiveProjectId, getStorageKey, getSettingsKey } from '../config/constants.js?v=20261119_cf36';
import { initStore } from '../state/store.js?v=20261119_cf36';
import { fetchCloudProjects } from '../core/cloudProjectService.js?v=20261119_cf36';
import { hydrateProjectModulesFromCloud } from '../core/cloudModulesSyncService.js?v=20261119_cf36';
import { isSupabaseConfigured } from '../core/supabaseClient.js?v=20261119_cf36';
import { subscribeToProjectRealtime, broadcastInvitationAccepted, broadcastInvitationRejected, requestPeerSync } from '../core/realtimeSync.js?v=20261119_cf36';
import { autoSyncCollaborationOnStartup, syncHostWorkspaceProjects } from '../core/collaborationCloudService.js?v=20261119_cf36';
import {
  getCurrentUser,
  getProjectsList,
  saveProjectsList,
  getProjectsForUser,
  getWorkspaceInviters,
  setActiveWorkspaceData,
  getPendingInvitationsForUser,
  acceptProjectInvitation,
  rejectProjectInvitation,
  canUserCreateProject,
  createNewProject,
  duplicateProject,
  getPlanLimits,
  getUserPlanId,
  getUserRoleInProject,
  getDeletedProjectsList
} from '../modules/portal/projectService.js?v=20261119_cf36';
import {
  moveProjectToTrash,
  fetchTrashedProjectsForHost,
  restoreProjectFromTrash,
  permanentlyDeleteTrashedProject,
  getCachedTrashCount
} from '../modules/portal/trashService.js?v=20261119_cf36';
import { showToast } from '../ui/notifications.js?v=20261119_cf36';
import { escapeHtml } from './mobileBridge.js?v=20261119_cf36';

let scopeTab = 'owned';
let selectedInviterEmail = 'all';
let searchQuery = '';
let lastCloudRefreshAt = 0;

export function openMobileProjectById(projId, onEntered) {
  setActiveProjectId(projId);
  initStore();
  try { subscribeToProjectRealtime(projId); } catch (_) {}
  hydrateProjectModulesFromCloud(projId).catch(() => {});
  onEntered?.(projId, 'alcances');
}

export function renderMobileProjects(container, { openSheet, closeSheet, onOpenProject }) {
  if (!container) return;
  const user = getCurrentUser();
  if (!user) return;

  const uEmail = (user.email || '').toLowerCase().trim();
  const now = Date.now();
  if (now - lastCloudRefreshAt > 12000) {
    lastCloudRefreshAt = now;
    try { autoSyncCollaborationOnStartup(user); } catch (_) {}
    try { requestPeerSync(); } catch (_) {}
    if (isSupabaseConfigured() && user?.id) {
      reconcileProjectsFromCloud(user, () => renderMobileProjects(container, { openSheet, closeSheet, onOpenProject }));
    }
  }

  const allProjects = getProjectsForUser(user);
  const ownedProjects = allProjects.filter(p => {
    const owner = (p.ownerEmail || '').toLowerCase().trim();
    return !owner || owner === uEmail || owner === 'admin@constructora.com' || owner === 'local@cubikar.app';
  });
  const invitedProjects = allProjects.filter(p => {
    const owner = (p.ownerEmail || '').toLowerCase().trim();
    return Boolean(owner && owner !== uEmail && owner !== 'admin@constructora.com' && owner !== 'local@cubikar.app');
  });
  const inviters = getWorkspaceInviters(user, allProjects);
  const pendingInvites = getPendingInvitationsForUser(uEmail);
  const planLimits = getPlanLimits(getUserPlanId(user));
  const createCheck = canUserCreateProject(user, scopeTab === 'owned' ? 'owned' : (selectedInviterEmail !== 'all' ? `owner:${selectedInviterEmail}` : 'owned'));
  const trashCount = getCachedTrashCount();

  let visible = scopeTab === 'owned' ? ownedProjects : invitedProjects;
  if (scopeTab === 'invited' && selectedInviterEmail !== 'all') {
    visible = visible.filter(p => (p.ownerEmail || '').toLowerCase().trim() === selectedInviterEmail);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    visible = visible.filter(p =>
      String(p.projectName || p.name || '').toLowerCase().includes(q)
      || String(p.companyName || '').toLowerCase().includes(q)
      || String(p.projectLocation || '').toLowerCase().includes(q)
    );
  }

  container.innerHTML = `
    <div class="m-row-between">
      <div>
        <h1 class="m-title">Proyectos Arquitectónicos</h1>
        <p class="m-subtitle">Plan ${escapeHtml(planLimits.name)} &bull; ${ownedProjects.length}/${planLimits.maxProjects} propios</p>
      </div>
      <div class="m-row">
        <button type="button" id="m-btn-trash" class="m-icon-btn" title="Papelera (${trashCount})">
          <i class="fa-solid fa-trash-can"></i>
          ${trashCount > 0 ? `<span class="m-badge">${trashCount > 99 ? '99+' : trashCount}</span>` : ''}
        </button>
        <button type="button" id="m-btn-new-proj" class="m-btn m-btn-primary m-btn-sm">
          <i class="fa-solid fa-plus"></i> Nuevo
        </button>
      </div>
    </div>

    ${pendingInvites.length > 0 ? `
      <div class="m-card" style="border-color:var(--primary);background:var(--primary-soft);">
        <div style="font-size:12.5px;font-weight:800;color:var(--primary);margin-bottom:8px;">
          <i class="fa-solid fa-envelope-open-text"></i> Invitaciones pendientes (${pendingInvites.length})
        </div>
        ${pendingInvites.map(inv => `
          <div class="m-card-alt" style="margin-bottom:6px;">
            <div style="font-size:12.5px;font-weight:800;">${escapeHtml(inv.projectName || 'Proyecto compartido')}</div>
            <div style="font-size:11px;color:var(--muted);margin:2px 0 8px;">Por: <strong>${escapeHtml(inv.invitedByName || inv.invitedByEmail || '')}</strong></div>
            <div class="m-row">
              <button type="button" data-accept-inv="${escapeHtml(inv.id)}" class="m-btn m-btn-success m-btn-sm" style="flex:1;">Aceptar</button>
              <button type="button" data-reject-inv="${escapeHtml(inv.id)}" class="m-btn m-btn-outline m-btn-sm">Rechazar</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="m-segmented">
      <button type="button" data-scope-tab="owned" class="m-seg-btn ${scopeTab === 'owned' ? 'is-active' : ''}">
        <i class="fa-solid fa-crown"></i> Mis Proyectos (${ownedProjects.length})
      </button>
      <button type="button" data-scope-tab="invited" class="m-seg-btn ${scopeTab === 'invited' ? 'is-active' : ''}">
        <i class="fa-solid fa-users"></i> Invitado (${invitedProjects.length})
      </button>
    </div>

    ${scopeTab === 'invited' && inviters.length > 0 ? `
      <div class="m-chip-bar">
        <button type="button" data-inviter="all" class="m-chip ${selectedInviterEmail === 'all' ? 'is-active' : ''}">Todos (${invitedProjects.length})</button>
        ${inviters.map(inv => `
          <button type="button" data-inviter="${escapeHtml(inv.email)}" class="m-chip ${selectedInviterEmail === inv.email ? 'is-active' : ''}">
            <i class="fa-solid fa-briefcase"></i> ${escapeHtml(inv.name || inv.email)}
          </button>
        `).join('')}
      </div>
    ` : ''}

    <input type="search" id="m-proj-search" class="m-input" value="${escapeHtml(searchQuery)}" placeholder="Buscar proyecto o despacho...">

    ${visible.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:28px 16px;">
        <i class="fa-solid fa-compass-drafting" style="font-size:28px;color:var(--muted);margin-bottom:8px;"></i>
        <div style="font-size:14px;font-weight:800;">Sin proyectos visibles</div>
        <p class="m-subtitle">Crea un proyecto nuevo o cambia el filtro activo.</p>
      </div>
    ` : `
      <div class="m-grid-cards">
        ${visible.map(proj => renderCard(proj, user)).join('')}
      </div>
    `}
  `;

  container.querySelectorAll('[data-scope-tab]').forEach(b => {
    b.addEventListener('click', () => {
      scopeTab = b.dataset.scopeTab;
      if (scopeTab === 'owned') {
        selectedInviterEmail = 'all';
        setActiveWorkspaceData(uEmail, user.name || uEmail);
      }
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  container.querySelectorAll('[data-inviter]').forEach(b => {
    b.addEventListener('click', () => {
      selectedInviterEmail = b.dataset.inviter;
      if (selectedInviterEmail === 'all') setActiveWorkspaceData(uEmail, user.name || uEmail);
      else {
        const host = inviters.find(i => i.email === selectedInviterEmail);
        setActiveWorkspaceData(selectedInviterEmail, host?.name || selectedInviterEmail);
        syncHostWorkspaceProjects(selectedInviterEmail).catch(() => {});
      }
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  const sInp = container.querySelector('#m-proj-search');
  sInp?.addEventListener('input', (ev) => {
    searchQuery = ev.target.value;
    const pos = ev.target.selectionStart;
    renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    const next = container.querySelector('#m-proj-search');
    if (next) {
      next.focus();
      try { next.setSelectionRange(pos, pos); } catch (_) {}
    }
  });

  container.querySelectorAll('[data-accept-inv]').forEach(b => {
    b.addEventListener('click', async () => {
      const res = await acceptProjectInvitation(b.dataset.acceptInv, user);
      if (res) { try { broadcastInvitationAccepted(res.invitation || { id: b.dataset.acceptInv }, user); } catch (_) {} }
      lastCloudRefreshAt = 0;
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  container.querySelectorAll('[data-reject-inv]').forEach(b => {
    b.addEventListener('click', () => {
      const rej = rejectProjectInvitation(b.dataset.rejectInv);
      if (rej) { try { broadcastInvitationRejected(rej, user); } catch (_) {} }
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  container.querySelectorAll('[data-open-proj]').forEach(b => {
    b.addEventListener('click', () => openMobileProjectById(b.dataset.openProj, onOpenProject));
  });

  container.querySelectorAll('[data-dup-proj]').forEach(b => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const dup = duplicateProject(b.dataset.dupProj);
      if (dup) showToast(`Proyecto "${dup.projectName}" duplicado.`, 'success');
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  container.querySelectorAll('[data-trash-proj]').forEach(b => {
    b.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm('¿Mover proyecto a la papelera?')) return;
      await moveProjectToTrash(b.dataset.trashProj);
      showToast('Movido a papelera.', 'info');
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  container.querySelector('#m-btn-new-proj')?.addEventListener('click', () => {
    if (!createCheck.allowed) { showToast(createCheck.reason || 'Límite alcanzado.', 'warning'); return; }
    openCreateProjectSheet({ container, openSheet, closeSheet, onOpenProject, check: createCheck });
  });

  container.querySelector('#m-btn-trash')?.addEventListener('click', () => {
    openTrashSheet({ container, openSheet, closeSheet, onOpenProject });
  });
}

function renderCard(proj, user) {
  const uEmail = (user.email || '').toLowerCase().trim();
  const owner = (proj.ownerEmail || '').toLowerCase().trim();
  const isOwner = !owner || owner === uEmail || owner === 'admin@constructora.com';
  const roleInfo = getUserRoleInProject(proj.id, user);
  const sym = proj.currencySymbol || '$';
  const total = Number(proj.totalAmount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `
    <div class="m-card" style="display:flex;flex-direction:column;gap:10px;">
      <div class="m-row" style="cursor:pointer;" data-open-proj="${escapeHtml(proj.id)}">
        <div style="width:40px;height:40px;border-radius:10px;background:var(--primary-soft);color:var(--primary);font-weight:800;display:flex;align-items:center;justify-content:center;">
          <i class="fa-solid fa-compass-drafting"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:800;">${escapeHtml(proj.projectName || proj.name || 'Proyecto')}</div>
          <div style="font-size:11.5px;color:var(--muted);">${escapeHtml(proj.companyName || 'Despacho')} ${proj.projectLocation ? '&bull; ' + escapeHtml(proj.projectLocation) : ''}</div>
        </div>
        <span class="m-pill ${isOwner ? 'm-pill-blue' : 'm-pill-green'}">${isOwner ? 'Propio' : escapeHtml(roleInfo?.label || 'Colaborador')}</span>
      </div>
      <div class="m-row-between" style="padding-top:8px;border-top:1px solid var(--border);">
        <span class="m-mono" style="font-size:14px;font-weight:800;color:var(--primary);">${escapeHtml(sym)}${total}</span>
        <div class="m-row">
          ${isOwner ? `
            <button type="button" data-dup-proj="${escapeHtml(proj.id)}" class="m-icon-btn" style="width:32px;height:32px;"><i class="fa-regular fa-copy"></i></button>
            <button type="button" data-trash-proj="${escapeHtml(proj.id)}" class="m-icon-btn" style="width:32px;height:32px;color:var(--danger);"><i class="fa-solid fa-trash-can"></i></button>
          ` : ''}
          <button type="button" data-open-proj="${escapeHtml(proj.id)}" class="m-btn m-btn-primary m-btn-sm">Abrir <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>
    </div>
  `;
}

function openCreateProjectSheet({ openSheet, closeSheet, onOpenProject, check }) {
  openSheet({
    title: 'Nuevo Proyecto Arquitectónico',
    bodyHtml: `
      <form id="m-arq-cp-form" style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label class="m-label" for="m-acp-name">Nombre del proyecto *</label>
          <input id="m-acp-name" required class="m-input" placeholder="Ej. Proyecto Ejecutivo Casa Bosque">
        </div>
        <div>
          <label class="m-label" for="m-acp-company">Despacho / Estudio</label>
          <input id="m-acp-company" class="m-input" value="${escapeHtml(check.isHostContext ? check.hostName : '')}" placeholder="Ej. Taller Cubikar Arq">
        </div>
        <div>
          <label class="m-label" for="m-acp-loc">Ubicación</label>
          <input id="m-acp-loc" class="m-input" placeholder="Ciudad, Estado">
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" id="m-acp-cancel" class="m-btn m-btn-outline">Cancelar</button>
      <button type="submit" form="m-arq-cp-form" class="m-btn m-btn-primary">Crear Proyecto</button>
    `
  });
  document.getElementById('m-acp-cancel')?.addEventListener('click', closeSheet);
  document.getElementById('m-arq-cp-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const payload = {
      projectName: document.getElementById('m-acp-name').value.trim(),
      companyName: document.getElementById('m-acp-company').value.trim() || 'Despacho Arquitectónico',
      projectLocation: document.getElementById('m-acp-loc').value.trim(),
      currency: 'MXN',
      currencySymbol: '$'
    };
    if (check.isHostContext && check.hostEmail) {
      payload.ownerEmail = check.hostEmail;
      payload.ownerPlanId = check.planId;
      payload.hostName = check.hostName;
    }
    const created = createNewProject(payload);
    closeSheet();
    showToast(`Proyecto "${created.projectName}" creado.`, 'success');
    openMobileProjectById(created.id, onOpenProject);
  });
}

async function openTrashSheet({ container, openSheet, closeSheet, onOpenProject }) {
  openSheet({
    title: 'Papelera de Proyectos',
    bodyHtml: '<div style="text-align:center;padding:24px;"><i class="fa-solid fa-spinner fa-spin"></i></div>',
    footerHtml: '<button type="button" id="m-tc-btn" class="m-btn m-btn-outline">Cerrar</button>'
  });
  document.getElementById('m-tc-btn')?.addEventListener('click', closeSheet);
  const items = await fetchTrashedProjectsForHost({ force: true }).catch(() => []);
  const body = document.getElementById('m-sheet-body');
  if (!body) return;
  if (!items.length) {
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);">La papelera está vacía.</div>';
    return;
  }
  body.innerHTML = items.map(it => `
    <div class="m-card-alt m-row-between">
      <div style="font-size:13px;font-weight:700;">${escapeHtml(it.projectName || 'Proyecto')}</div>
      <div class="m-row">
        <button type="button" data-r-id="${escapeHtml(it.id)}" class="m-btn m-btn-success m-btn-sm">Restaurar</button>
        <button type="button" data-p-id="${escapeHtml(it.id)}" class="m-btn m-btn-danger m-btn-sm"><i class="fa-solid fa-fire"></i></button>
      </div>
    </div>
  `).join('');
  body.querySelectorAll('[data-r-id]').forEach(b => b.addEventListener('click', async () => {
    await restoreProjectFromTrash(b.dataset.rId);
    closeSheet();
    renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
  }));
  body.querySelectorAll('[data-p-id]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar definitivamente?')) return;
    await permanentlyDeleteTrashedProject(b.dataset.pId);
    closeSheet();
    renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
  }));
}

function reconcileProjectsFromCloud(user, onUpdated) {
  fetchCloudProjects().then(cloudList => {
    if (!Array.isArray(cloudList)) return;
    const deletedList = getDeletedProjectsList();
    const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);
    const localList = getProjectsList();
    const myEmail = (user.email || '').toLowerCase().trim();
    const cloudIds = new Set(cloudList.map(cp => cp.id));
    let changed = false;

    const cleaned = localList.filter(lp => {
      if (isDeleted(lp.id) || isDeleted(lp.cloudId)) {
        try {
          localStorage.removeItem(getSettingsKey(lp.id));
          localStorage.removeItem(getStorageKey(lp.id));
        } catch (_) {}
        changed = true;
        return false;
      }
      const owner = (lp.ownerEmail || '').toLowerCase().trim();
      const isMine = !owner || owner === myEmail || owner === 'admin@constructora.com' || owner === 'local@cubikar.app';
      if (!isMine && lp.isCloudSynced && !cloudIds.has(lp.id) && !cloudIds.has(lp.cloudId)) {
        changed = true;
        return false;
      }
      return true;
    });

    cloudList.forEach(cp => {
      if (isDeleted(cp.id) || isDeleted(cp.cloudId)) return;
      const idx = cleaned.findIndex(lp => lp.id === cp.id || lp.cloudId === cp.id);
      if (idx === -1) {
        cleaned.unshift(cp);
        changed = true;
      } else {
        const merged = { ...cleaned[idx], ...cp, isCloudSynced: true };
        if (JSON.stringify(merged) !== JSON.stringify(cleaned[idx])) {
          cleaned[idx] = merged;
          changed = true;
        }
      }
    });

    if (changed || cleaned.length !== localList.length) {
      saveProjectsList(cleaned, { skipCloudSync: true });
      onUpdated?.();
    }
  }).catch(() => {});
}
