// js/mobile/mobileApp.js — Punto de entrada móvil y tablet de cubikar Arquitectura

import { setActiveProjectId } from '../config/constants.js?v=20261117_cf30';
import { initStore } from '../state/store.js?v=20261117_cf30';
import {
  initAuthListener,
  hasPendingIncomingSsoSession,
  hydrateIncomingSsoSession,
  hasOversizedLocalJwt,
  ensureCompactAuthSession
} from '../core/authService.js?v=20261117_cf30';
import { fetchCloudProjects } from '../core/cloudProjectService.js?v=20261117_cf30';
import { hydrateProjectModulesFromCloud } from '../core/cloudModulesSyncService.js?v=20261117_cf30';
import { isSupabaseConfigured } from '../core/supabaseClient.js?v=20261117_cf30';
import { initGlobalRealtimeSync, subscribeToProjectRealtime } from '../core/realtimeSync.js?v=20261117_cf30';
import {
  enforceGlobalSessionRevocation,
  getCurrentUser,
  getProjectById,
  getProjectsList,
  saveProjectsList
} from '../modules/portal/projectService.js?v=20261117_cf30';
import { initThemeMode, setThemeRenderCallback } from '../ui/themeController.js?v=20261117_cf30';
import { setTabLockRenderCallback } from '../ui/tabLockController.js?v=20261117_cf30';
import { setProjectChatRefreshCallback } from '../modules/chat/projectChat.js?v=20261117_cf30';
import { showToast } from '../ui/notifications.js?v=20261117_cf30';
import { registerMobileBridgeHooks, syncThemeDataset } from './mobileBridge.js?v=20261117_cf30';
import { setMobileRoute, refreshCurrentMobileView } from './mobileShell.js?v=20261118_c2';
import { openMobileProjectById } from './mobileProjects.js?v=20261117_cf30';

async function bootstrapMobileArq() {
  initThemeMode();
  syncThemeDataset();
  setThemeRenderCallback(() => syncThemeDataset());
  setTabLockRenderCallback(() => refreshCurrentMobileView());
  setProjectChatRefreshCallback(() => refreshCurrentMobileView());

  registerMobileBridgeHooks({
    onWorkspaceRefresh: () => refreshCurrentMobileView(),
    onPortalRefresh: () => refreshCurrentMobileView(),
    onChatRefresh: () => refreshCurrentMobileView(),
    onShowPortalView: (view, projId = '') => {
      setMobileRoute({
        nextScreen: view === 'login' ? 'auth' : 'projects',
        returnProjectId: projId || ''
      });
    },
    onOpenProject: (projId) => {
      openMobileProjectById(projId, (_id, nextTab) => {
        setMobileRoute({ nextScreen: 'workspace', nextTab });
      });
    },
    onGoProjects: () => {
      setActiveProjectId(null);
      setMobileRoute({ nextScreen: 'projects' });
    }
  });

  if (hasPendingIncomingSsoSession() || hasOversizedLocalJwt()) {
    try {
      await Promise.race([
        (async () => {
          if (hasPendingIncomingSsoSession()) await hydrateIncomingSsoSession();
          await ensureCompactAuthSession();
        })(),
        new Promise(resolve => setTimeout(resolve, 6000))
      ]);
    } catch (_) {}
  }

  initAuthListener((user) => {
    if (!user) {
      setActiveProjectId(null);
      setMobileRoute({ nextScreen: 'auth' });
    } else {
      refreshCurrentMobileView();
    }
  });

  enforceGlobalSessionRevocation();
  try { initGlobalRealtimeSync(); } catch (_) {}

  const urlParams = new URLSearchParams(window.location.search);
  const projIdFromUrl = urlParams.get('project');
  const requestedTab = urlParams.get('tab');
  const user = getCurrentUser();

  if (projIdFromUrl) {
    if (!user) {
      setMobileRoute({ nextScreen: 'auth', returnProjectId: projIdFromUrl });
      return;
    }
    let proj = getProjectById(projIdFromUrl);
    if (!proj && isSupabaseConfigured()) {
      try {
        const cloudList = await fetchCloudProjects();
        if (Array.isArray(cloudList) && cloudList.length > 0) {
          const cur = getProjectsList();
          cloudList.forEach(cp => {
            const i = cur.findIndex(lp => lp.id === cp.id || lp.cloudId === cp.id);
            if (i === -1) cur.unshift(cp);
            else cur[i] = { ...cur[i], ...cp, isCloudSynced: true };
          });
          saveProjectsList(cur, { skipCloudSync: true });
          proj = getProjectById(projIdFromUrl);
        }
      } catch (_) {}
    }
    if (proj) {
      setActiveProjectId(proj.id);
      initStore();
      try { subscribeToProjectRealtime(proj.id); } catch (_) {}
      hydrateProjectModulesFromCloud(proj.id).catch(() => {});
      setMobileRoute({ nextScreen: 'workspace', nextTab: requestedTab || 'alcances' });
      return;
    }
    showToast('No se encontró el proyecto especificado.', 'warning');
  }

  setActiveProjectId(null);
  if (user) {
    setMobileRoute({ nextScreen: 'projects' });
  } else {
    setMobileRoute({ nextScreen: 'auth' });
  }
}

bootstrapMobileArq();
