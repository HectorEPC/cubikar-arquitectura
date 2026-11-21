// js/mobile/mobileApp.js — Punto de entrada móvil y tablet de cubikar Arquitectura

import { setActiveProjectId } from '../config/constants.js?v=20261121_cf44';
import { initStore } from '../state/store.js?v=20261121_cf44';
import {
  initAuthListener,
  signOut,
  hasPendingIncomingSsoSession,
  hydrateIncomingSsoSession,
  hasOversizedLocalJwt,
  ensureCompactAuthSession
} from '../core/authService.js?v=20261121_cf44';
import {
  INVITE_TOKEN_STORAGE_KEY,
  captureInviteTokenFromUrl,
  hasPendingInviteToken,
  getPendingInviteToken,
  processPendingInviteFlow
} from '../modules/portal/inviteTokenService.js?v=20261121_cf44';
import { fetchCloudProjects } from '../core/cloudProjectService.js?v=20261121_cf44';
import { hydrateProjectModulesFromCloud } from '../core/cloudModulesSyncService.js?v=20261121_cf44';
import { isSupabaseConfigured } from '../core/supabaseClient.js?v=20261121_cf44';
import { initGlobalRealtimeSync, subscribeToProjectRealtime } from '../core/realtimeSync.js?v=20261121_cf44';
import {
  enforceGlobalSessionRevocation,
  getCurrentUser,
  saveCurrentUser,
  getProjectById,
  getProjectsList,
  saveProjectsList
} from '../modules/portal/projectService.js?v=20261121_cf44';
import { initThemeMode, setThemeRenderCallback } from '../ui/themeController.js?v=20261121_cf44';
import { setTabLockRenderCallback } from '../ui/tabLockController.js?v=20261121_cf44';
import { setProjectChatRefreshCallback } from '../modules/chat/projectChat.js?v=20261121_cf44';
import { showToast } from '../ui/notifications.js?v=20261121_cf44';
import { registerMobileBridgeHooks, syncThemeDataset } from './mobileBridge.js?v=20261121_cf44';
import { setMobileRoute, refreshCurrentMobileView } from './mobileShell.js?v=20261121_cf44';
import { openMobileProjectById } from './mobileProjects.js?v=20261121_cf44';

async function runMobileInviteDecision() {
  const token = captureInviteTokenFromUrl() || getPendingInviteToken();
  if (!token) return { active: false };
  return processPendingInviteFlow({
    isMobile: true,
    onAuthRequired: () => {
      setActiveProjectId(null);
      setMobileRoute({ nextScreen: 'auth' });
    },
    onSwitchAccount: async (preservedToken, preservedMeta) => {
      try { await signOut({ scope: 'local' }); } catch (_) {}
      saveCurrentUser(null);
      if (preservedToken) {
        try { localStorage.setItem(INVITE_TOKEN_STORAGE_KEY, preservedToken); } catch (_) {}
      }
      if (preservedMeta) {
        try { localStorage.setItem('cubikar_pending_invite_meta_v1', JSON.stringify(preservedMeta)); } catch (_) {}
      }
      setActiveProjectId(null);
      setMobileRoute({ nextScreen: 'auth' });
    },
    onGoDashboard: () => {
      const u = getCurrentUser();
      setActiveProjectId(null);
      setMobileRoute({ nextScreen: u ? 'projects' : 'auth' });
    },
    onAcceptedOpenProject: async (res) => {
      if (res?.projectId) {
        openMobileProjectById(res.projectId, (_id, nextTab) => {
          setMobileRoute({ nextScreen: 'workspace', nextTab });
        });
      } else {
        setActiveProjectId(null);
        setMobileRoute({ nextScreen: 'projects' });
      }
    }
  });
}

if (typeof window !== 'undefined') {
  window.runMobileInviteDecision = runMobileInviteDecision;
}

async function bootstrapMobileArq() {
  const capturedInviteToken = captureInviteTokenFromUrl();
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

  initAuthListener((event, session) => {
    const currentUser = session?.user || getCurrentUser();
    if (event === 'SIGNED_OUT' || !currentUser) {
      setActiveProjectId(null);
      setMobileRoute({ nextScreen: 'auth' });
    } else if (hasPendingInviteToken()) {
      refreshCurrentMobileView();
      runMobileInviteDecision().catch(() => {});
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

  if (capturedInviteToken || hasPendingInviteToken()) {
    setActiveProjectId(null);
    setMobileRoute({ nextScreen: user ? 'projects' : 'auth' });
    runMobileInviteDecision().catch(() => {});
    return;
  }

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
