// js/mobile/mobileShell.js — Cascarón móvil/tablet para cubikar Arquitectura (5 pestañas PC + Cuenta + Tema)

import { getActiveProjectId, setActiveProjectId } from '../config/constants.js?v=20261119_cf35';
import { state } from '../state/store.js?v=20261119_cf35';
import { signOut } from '../core/authService.js?v=20261119_cf35';
import { appendSsoToUrlFromStorage } from '../core/ssoHelper.js?v=20261119_cf35';
import { unsubscribeFromProjectRealtime } from '../core/realtimeSync.js?v=20261119_cf35';
import {
  getCurrentUser,
  saveCurrentUser,
  saveRegisteredUserAccount,
  getProjectById,
  markSessionClosed,
  getPlanLimits,
  getUserPlanId
} from '../modules/portal/projectService.js?v=20261119_cf35';
import { isNightMode, toggleThemeMode } from '../ui/themeController.js?v=20261119_cf35';
import { showToast } from '../ui/notifications.js?v=20261119_cf35';
import { escapeHtml, syncThemeDataset, canAccessTab, renderAvatarHtml, readFileAsResizedDataUrl } from './mobileBridge.js?v=20261119_cf35';
import { renderMobileAuth } from './mobileAuth.js?v=20261119_cf35';
import { renderMobileProjects, openMobileProjectById } from './mobileProjects.js?v=20261119_cf35';
import { renderMobileAlcances } from './mobileAlcances.js?v=20261119_cf35';
import { renderMobilePresupuestoArq } from './mobilePresupuestoArq.js?v=20261119_cf35';
import { renderMobileSeguimiento } from './mobileSeguimiento.js?v=20261119_cf35';
import { renderMobileCalendarioArq } from './mobileCalendarioArq.js?v=20261118_c2';
import { renderMobileEstimacionesArq } from './mobileEstimacionesArq.js?v=20261119_cf35';
import { renderMobileChatArq, setArqChatConceptFilter, getUnreadArqChatCount } from './mobileChatArq.js?v=20261119_cf35';

export const ARQ_TABS = [
  { id: 'alcances', label: 'Alcances', icon: 'fa-solid fa-layer-group' },
  { id: 'presupuesto', label: 'Presupuesto', icon: 'fa-solid fa-calculator' },
  { id: 'seguimiento', label: 'Seguimiento', icon: 'fa-solid fa-bars-progress' },
  { id: 'calendario', label: 'Calendario', icon: 'fa-solid fa-calendar-days' },
  { id: 'estimaciones', label: 'Estimaciones', icon: 'fa-solid fa-file-invoice-dollar' }
];

let screen = 'auth';
let activeTab = 'alcances';
let pendingReturnProjectId = '';

export function setMobileRoute({ nextScreen, nextTab, returnProjectId = '' }) {
  if (nextScreen) screen = nextScreen;
  if (nextTab) activeTab = nextTab;
  if (returnProjectId !== undefined) pendingReturnProjectId = returnProjectId;
  renderShell();
}

export function renderShell() {
  const root = document.getElementById('mobile-app-root');
  if (!root) return;

  const user = getCurrentUser();
  const pId = getActiveProjectId();
  const proj = pId ? getProjectById(pId) : null;

  if (!user && screen !== 'auth') screen = 'auth';
  if (user && screen === 'auth') screen = proj ? 'workspace' : 'projects';
  if ((screen === 'workspace' || screen === 'chat') && !proj) screen = user ? 'projects' : 'auth';

  const showBottomNav = screen === 'workspace' && Boolean(proj);
  const unread = proj ? getUnreadArqChatCount(proj.id) : 0;
  const night = isNightMode();

  root.innerHTML = `
    <div class="m-app-shell">
      <header class="m-topbar">
        <button type="button" id="top-brand-btn" class="m-brand-btn" title="Ir a Proyectos" aria-label="cubikar">
          <img src="assets/branding/cubikar_icon_transparent.png" alt="cubikar">
        </button>

        ${proj && (screen === 'workspace' || screen === 'chat') ? `
          <button type="button" id="top-proj-pill" class="m-proj-pill" title="Cambiar proyecto">
            <i class="fa-solid fa-compass-drafting" style="color:var(--primary);font-size:12px;"></i>
            <span class="m-proj-pill-title">${escapeHtml(state.settings?.projectName || proj.projectName || 'Proyecto')}</span>
            <i class="fa-solid fa-chevron-down" style="font-size:10px;color:var(--muted);"></i>
          </button>
        ` : `<div style="flex:1;min-width:0;"></div>`}

        <div class="m-topbar-actions">
          <button type="button" id="phone-theme-btn" class="m-icon-btn" aria-label="${night ? 'Cambiar a modo día' : 'Cambiar a modo noche'}">
            <i class="fa-solid ${night ? 'fa-moon' : 'fa-sun'}"></i>
          </button>

          ${proj && user ? `
            <button type="button" id="top-chat-btn" class="m-icon-btn ${screen === 'chat' ? 'is-active' : ''}" title="Chat de proyecto">
              <i class="fa-solid fa-comments"></i>
              ${unread > 0 ? `<span class="m-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
            </button>
          ` : ''}

          ${user ? `
            <button type="button" id="top-user-btn" class="m-avatar-btn" title="Mi Cuenta Cubikar">
              ${renderAvatarHtml(user, 36)}
            </button>
          ` : ''}
        </div>
      </header>

      <main id="mobile-main" class="m-main ${showBottomNav ? '' : 'no-bottom-nav'}"></main>

      ${showBottomNav ? `
        <nav class="m-bottom-nav" aria-label="Módulos de arquitectura">
          ${ARQ_TABS.map(t => {
            const allowed = canAccessTab(t.id);
            const active = activeTab === t.id;
            return `
              <button type="button" data-nav-tab="${t.id}" class="m-nav-item ${active ? 'is-active' : ''} ${allowed ? '' : 'is-locked'}">
                <i class="${t.icon}"></i>
                <span>${t.label}</span>
              </button>
            `;
          }).join('')}
        </nav>
      ` : ''}
    </div>
    <div id="m-sheet-root"></div>
  `;

  syncThemeDataset();

  document.getElementById('top-brand-btn')?.addEventListener('click', () => {
    if (!getCurrentUser()) return;
    exitWorkspaceToProjects();
  });
  document.getElementById('top-proj-pill')?.addEventListener('click', () => exitWorkspaceToProjects());
  document.getElementById('phone-theme-btn')?.addEventListener('click', () => {
    toggleThemeMode();
    syncThemeDataset();
  });
  document.getElementById('top-chat-btn')?.addEventListener('click', () => {
    screen = screen === 'chat' ? 'workspace' : 'chat';
    renderShell();
  });
  document.getElementById('top-user-btn')?.addEventListener('click', () => openAccountSheet());

  document.querySelectorAll('[data-nav-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.navTab;
      if (!canAccessTab(targetTab)) { showToast('Sin acceso a esta pestaña.', 'warning'); return; }
      activeTab = targetTab;
      renderShell();
    });
  });

  const main = document.getElementById('mobile-main');
  const sheetCtx = { openSheet, closeSheet };

  if (screen === 'auth') {
    renderMobileAuth(main, {
      returnProjectId: pendingReturnProjectId,
      onAuthSuccess: (retId) => {
        if (retId) {
          openMobileProjectById(retId, (_id, nextTab) => {
            screen = 'workspace';
            activeTab = nextTab || 'alcances';
            renderShell();
          });
        } else {
          screen = 'projects';
          renderShell();
        }
      }
    });
    return;
  }

  if (screen === 'projects') {
    renderMobileProjects(main, {
      ...sheetCtx,
      onOpenProject: (_id, nextTab) => {
        screen = 'workspace';
        activeTab = nextTab || 'alcances';
        renderShell();
      }
    });
    return;
  }

  if (screen === 'chat') {
    renderMobileChatArq(main, {
      onCloseChat: () => { screen = 'workspace'; renderShell(); }
    });
    return;
  }

  if (!canAccessTab(activeTab)) {
    const firstAllowed = ARQ_TABS.find(t => canAccessTab(t.id));
    activeTab = firstAllowed ? firstAllowed.id : 'alcances';
  }

  if (activeTab === 'alcances') {
    renderMobileAlcances(main, {
      ...sheetCtx,
      onOpenConceptChat: (node) => {
        setArqChatConceptFilter(node);
        screen = 'chat';
        renderShell();
      }
    });
  } else if (activeTab === 'presupuesto') {
    renderMobilePresupuestoArq(main, sheetCtx);
  } else if (activeTab === 'seguimiento') {
    renderMobileSeguimiento(main, sheetCtx);
  } else if (activeTab === 'calendario') {
    renderMobileCalendarioArq(main, sheetCtx);
  } else if (activeTab === 'estimaciones') {
    renderMobileEstimacionesArq(main, sheetCtx);
  }
}

export function refreshCurrentMobileView() {
  if (typeof document === 'undefined') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (document.getElementById('m-sheet-backdrop')) return;
  renderShell();
}

function exitWorkspaceToProjects() {
  try { unsubscribeFromProjectRealtime(); } catch (_) {}
  setActiveProjectId(null);
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete('project');
    window.history.replaceState({}, '', u.pathname + (u.search || ''));
  } catch (_) {}
  screen = 'projects';
  renderShell();
}

export function openSheet({ title, bodyHtml, footerHtml = '' }) {
  closeSheet();
  const root = document.getElementById('m-sheet-root');
  if (!root) return;
  root.innerHTML = `
    <div id="m-sheet-backdrop" class="m-sheet-backdrop">
      <div class="m-sheet-panel" role="dialog" aria-modal="true">
        <div class="m-sheet-header">
          <strong style="font-size:15px;">${escapeHtml(title || '')}</strong>
          <button type="button" id="m-sheet-x" class="m-icon-btn" style="width:32px;height:32px;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="m-sheet-body" class="m-sheet-body">${bodyHtml || ''}</div>
        ${footerHtml ? `<div class="m-sheet-footer">${footerHtml}</div>` : ''}
      </div>
    </div>
  `;
  document.getElementById('m-sheet-x')?.addEventListener('click', closeSheet);
  document.getElementById('m-sheet-backdrop')?.addEventListener('click', (ev) => {
    if (ev.target.id === 'm-sheet-backdrop') closeSheet();
  });
}

export function closeSheet() {
  const root = document.getElementById('m-sheet-root');
  if (root) root.innerHTML = '';
}

function openAccountSheet() {
  const user = getCurrentUser();
  if (!user) return;
  const plan = getPlanLimits(getUserPlanId(user));
  const night = isNightMode();

  openSheet({
    title: 'Mi Cuenta Cubikar',
    bodyHtml: `
      <div class="m-card-alt m-row" style="gap:12px;">
        <div class="m-avatar-btn" style="width:46px;height:46px;flex-shrink:0;">${renderAvatarHtml(user, 46)}</div>
        <div style="min-width:0;flex:1;">
          <div style="font-size:14px;font-weight:800;">${escapeHtml(user.name || 'Usuario')}</div>
          <div style="font-size:11.5px;color:var(--muted);">${escapeHtml(user.email || '')}</div>
          <span class="m-pill m-pill-blue" style="margin-top:4px;">Plan ${escapeHtml(plan.name)}</span>
        </div>
      </div>

      <button type="button" id="m-acc-projects" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-folder-open" style="color:var(--primary);"></i> Mis Proyectos
      </button>
      <button type="button" id="m-acc-edit" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-user-pen" style="color:var(--primary);"></i> Editar Mi Perfil
      </button>
      <button type="button" id="m-acc-theme" class="m-btn m-btn-outline" style="justify-content:space-between;">
        <span><i class="fa-solid ${night ? 'fa-moon' : 'fa-sun'}" style="color:var(--warn);"></i> Tema Visual (${night ? 'Noche' : 'Día'})</span>
        <span class="m-pill m-pill-neutral">Cambiar</span>
      </button>
      <button type="button" id="m-acc-const" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-helmet-safety" style="color:var(--primary);"></i> Ir a cubikar Construcción
      </button>
      <button type="button" id="m-acc-portal" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-grid-2" style="color:var(--primary);"></i> Ir al Portal Ecosistema Cubikar
      </button>
      <button type="button" id="m-acc-desktop" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-desktop"></i> Ver versión PC (Escritorio)
      </button>
      <button type="button" id="m-acc-logout" class="m-btn m-btn-outline" style="justify-content:flex-start;color:var(--danger);border-color:var(--danger);">
        <i class="fa-solid fa-right-from-bracket"></i> Cerrar Sesión
      </button>
      <button type="button" id="m-acc-logout-all" class="m-btn m-btn-danger m-btn-sm">
        <i class="fa-solid fa-shield-halved"></i> Cerrar Sesión en todos los dispositivos
      </button>
    `
  });

  document.getElementById('m-acc-projects')?.addEventListener('click', () => { closeSheet(); exitWorkspaceToProjects(); });
  document.getElementById('m-acc-theme')?.addEventListener('click', () => { toggleThemeMode(); syncThemeDataset(); openAccountSheet(); });
  document.getElementById('m-acc-edit')?.addEventListener('click', () => openEditProfileSheet(user));

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  document.getElementById('m-acc-const')?.addEventListener('click', () => {
    const dest = isLocal ? '../ADM_CONST/mobile.html' : 'https://const.cubikar.app/mobile.html';
    window.location.href = appendSsoToUrlFromStorage(dest);
  });
  document.getElementById('m-acc-portal')?.addEventListener('click', () => {
    const dest = isLocal ? '../Cubikar/index.html' : 'https://cubikar.app';
    window.location.href = appendSsoToUrlFromStorage(dest);
  });
  document.getElementById('m-acc-desktop')?.addEventListener('click', () => {
    try { localStorage.setItem('cubikar_force_desktop', '1'); } catch (_) {}
    const u = new URL(window.location.href);
    const params = new URLSearchParams(u.search);
    params.delete('mobile');
    params.set('desktop', '1');
    const q = params.toString();
    window.location.href = `index.html${q ? '?' + q : ''}${u.hash || ''}`;
  });
  document.getElementById('m-acc-logout')?.addEventListener('click', async () => {
    closeSheet();
    if (user?.email) markSessionClosed(user.email);
    try { await signOut({ scope: 'local' }); } catch (_) {}
    saveCurrentUser(null);
    setActiveProjectId(null);
    screen = 'auth';
    renderShell();
  });
  document.getElementById('m-acc-logout-all')?.addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión en todos tus dispositivos?')) return;
    closeSheet();
    if (user?.email) markSessionClosed(user.email);
    try { await signOut({ scope: 'global' }); } catch (_) {}
    saveCurrentUser(null);
    setActiveProjectId(null);
    screen = 'auth';
    renderShell();
  });
}

function openEditProfileSheet(user) {
  let nextAvatar = user.avatar || '';
  openSheet({
    title: 'Editar Mi Perfil',
    bodyHtml: `
      <form id="m-aep-form" style="display:flex;flex-direction:column;gap:10px;">
        <div><label class="m-label">Nombre completo *</label><input id="m-aep-name" required class="m-input" value="${escapeHtml(user.name || '')}"></div>
        <div class="m-grid-2">
          <div>
            <label class="m-label">Sexo</label>
            <select id="m-aep-sexo" class="m-select">${['Masculino', 'Femenino', 'Otro'].map(s => `<option value="${s}" ${user.sexo === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div><label class="m-label">Nacimiento</label><input id="m-aep-dob" type="date" class="m-input" value="${escapeHtml(user.dob || '1992-06-15')}"></div>
        </div>
        <label class="m-btn m-btn-outline m-btn-sm" style="cursor:pointer;">
          <i class="fa-solid fa-camera"></i> <span id="m-aep-lbl">Cambiar foto</span>
          <input type="file" id="m-aep-foto" accept="image/*" style="display:none;">
        </label>
      </form>
    `,
    footerHtml: `<button type="button" id="m-aep-cancel" class="m-btn m-btn-outline">Cancelar</button><button type="submit" form="m-aep-form" class="m-btn m-btn-primary">Guardar</button>`
  });
  document.getElementById('m-aep-cancel')?.addEventListener('click', closeSheet);
  document.getElementById('m-aep-foto')?.addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    nextAvatar = await readFileAsResizedDataUrl(f, 512, 0.78);
    document.getElementById('m-aep-lbl').textContent = 'Foto actualizada';
  });
  document.getElementById('m-aep-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const updated = {
      ...user,
      name: document.getElementById('m-aep-name').value.trim(),
      sexo: document.getElementById('m-aep-sexo').value,
      dob: document.getElementById('m-aep-dob').value,
      avatar: nextAvatar
    };
    saveCurrentUser(updated);
    saveRegisteredUserAccount(updated);
    closeSheet();
    showToast('Perfil actualizado.', 'success');
    renderShell();
  });
}
