// js/modules/portal/projectService.js
// Servicio centralizado para usuarios, proyectos multi-obra y almacenamiento aislado

import {
  STORAGE_KEY_USER,
  STORAGE_KEY_PROJECTS,
  STORAGE_KEY_INVITATIONS,
  STORAGE_KEY_PLAN_INVITATIONS,
  STORAGE_KEY_ACTIVE_WORKSPACE,
  setActiveProjectId,
  getActiveProjectId,
  getStorageKey,
  getSettingsKey,
  DEFAULT_STORAGE_KEY,
  DEFAULT_SETTINGS_KEY
} from '../../config/constants.js?v=20261116_cf9';

export const STORAGE_KEY_DELETED_PROJECTS = 'cubikar_deleted_projects_v1';
import { defaultTreeData, defaultSettings } from '../../config/defaultData.js?v=20261116_cf9';
import { cleanMojibake } from '../../core/textSanitizer.js?v=20261116_cf9';
import { CASA_LAURA_PROJECT } from '../io/casaLauraData.js?v=20261116_cf9';
import { deleteProjectFromCloud } from '../../core/cloudProjectService.js?v=20261116_cf9';

// Avatares temáticos según sexo (SVGs ultraligeros de arquitectos e ingenieros con casco)
export const AVATARS_BY_SEX = {
  'Masculino': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%231e3a8a'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fdba74'/%3E%3Cpath d='M26,34 Q50,14 74,34 L70,40 Q50,26 30,40 Z' fill='%23f59e0b'/%3E%3Cpath d='M24,88 C24,64 76,64 76,88 Z' fill='%232563eb'/%3E%3Cpolygon points='50,60 45,74 55,74' fill='%23ffffff'/%3E%3C/svg%3E",
  'Femenino': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23581c87'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fed7aa'/%3E%3Cpath d='M26,34 Q50,14 74,34 L70,40 Q50,26 30,40 Z' fill='%23f59e0b'/%3E%3Cpath d='M24,88 C24,64 76,64 76,88 Z' fill='%237c3aed'/%3E%3Cpolygon points='50,60 45,74 55,74' fill='%23fbcfe8'/%3E%3C/svg%3E",
  'Otro': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23064e3b'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fbcfe8'/%3E%3Cpath d='M26,34 Q50,14 74,34 L70,40 Q50,26 30,40 Z' fill='%23ffffff'/%3E%3Cpath d='M24,88 C24,64 76,64 76,88 Z' fill='%23059669'/%3E%3Cpolygon points='50,60 45,74 55,74' fill='%23a7f3d0'/%3E%3C/svg%3E"
};

// Cuentas de demostración de Google con foto real
export const GOOGLE_PRESET_ACCOUNTS = [
  {
    name: "Héctor Emmanuel Pérez Cornejo",
    email: "hepc.90@gmail.com",
    avatar: "https://lh3.googleusercontent.com/mock-avatar.png",
    sexo: "Masculino",
    dob: "1990-01-01"
  },
  {
    name: "Arq. Alejandro Ruiz",
    email: "alejandro.ruiz@tallerarq.com",
    avatar: "",
    sexo: "Masculino",
    dob: "1990-01-01"
  },
  {
    name: "Arq. Carlos Alberto Gómez",
    email: "carlos.gomez.arq@gmail.com",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    sexo: "Masculino",
    dob: "1990-08-14"
  },
  {
    name: "Ing. Mariana Torres Morales",
    email: "mariana.torres.costos@gmail.com",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80",
    sexo: "Femenino",
    dob: "1993-04-22"
  },
  {
    name: "Arq. Roberto Méndez Silva",
    email: "roberto.mendez.obras@gmail.com",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    sexo: "Masculino",
    dob: "1988-11-05"
  },
  {
    name: "Lic. Sofía Valenzuela Rios",
    email: "sofia.valenzuela.admin@gmail.com",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    sexo: "Femenino",
    dob: "1995-02-17"
  }
];

export const PROJECT_ROLES = {
  editar: { label: 'Editar', description: 'Control Total', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  escribir: { label: 'Escribir', description: 'Captura de Conceptos e Insumos', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  leer: { label: 'Leer', description: 'Solo Lectura', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' }
};

// Logotipos de muestra
export const SAMPLE_LOGOS = {
  shield: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50,10 L85,25 L85,55 C85,75 50,92 50,92 C50,92 15,75 15,55 L15,25 Z' fill='%232563eb'/%3E%3Cpath d='M35,48 L46,59 L68,36' fill='none' stroke='white' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E",
  building: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%230f172a'/%3E%3Cpath d='M25,80 L25,35 L45,20 L45,80 Z' fill='%2338bdf8'/%3E%3Cpath d='M45,80 L45,35 L75,35 L75,80 Z' fill='%230284c7'/%3E%3C/svg%3E"
};

export const STORAGE_KEY_SUBSCRIPTION = 'adm_arq_subscription';
export const STORAGE_KEY_REGISTERED_USERS = 'control_obra_registered_accounts_v1';
export const STORAGE_KEY_FEATURED_PROFILES = 'control_obra_featured_profiles_v1';
export const STORAGE_KEY_CLOSED_SESSIONS = 'control_obra_closed_sessions_v1';
export const STORAGE_KEY_AUTH_SESSION_VERSION = 'cubikar_auth_session_version';
export const CURRENT_AUTH_SESSION_VERSION = '2025-07-global-signout-v1';

/**
 * Cierra de inmediato cualquier sesión local heredada anterior a la revocación global
 * para garantizar que ningún navegador o dispositivo mantenga sesiones abiertas sin autorización.
 */
export function enforceGlobalSessionRevocation() {
  try {
    if (typeof localStorage === 'undefined') return;
    const ver = localStorage.getItem(STORAGE_KEY_AUTH_SESSION_VERSION);
    if (ver !== CURRENT_AUTH_SESSION_VERSION) {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER + '_last');
      localStorage.removeItem(STORAGE_KEY_FEATURED_PROFILES);
      localStorage.removeItem('sb-supabase-auth-token');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('auth-token'))) {
          localStorage.removeItem(k);
        }
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEY_USER);
      }
      localStorage.setItem('control_obra_user_profile_dismissed', 'true');
      localStorage.setItem('cubikar_last_signout_ts', String(Date.now()));
      localStorage.setItem(STORAGE_KEY_AUTH_SESSION_VERSION, CURRENT_AUTH_SESSION_VERSION);
    }
  } catch (_) {}
}

export const SYSTEM_EXCLUDED_EMAILS = new Set([
  'admin.general@constructora.com',
  'admin@constructora.com',
  'demo@cubikar.com',
  'demo@constructora.com'
]);

export const GENERIC_BLACKLIST = new Set([
  'sistema de control de obra',
  'sistema de control de obras',
  'sistema de control',
  'sistema de arquitectura',
  'cubikar construccion',
  'cubikar construcción',
  'cubikar arquitectura',
  'cubikar',
  'propietario de obra',
  'anfitrión',
  'anfitrion',
  'administrador',
  'administrador de obra',
  'editor de obra',
  'usuario',
  'constructora',
  'empresa',
  'null',
  'undefined',
  'nan'
]);

export function getClosedSessionsList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLOSED_SESSIONS);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    return list.map(e => (typeof e === 'string' ? e.toLowerCase().trim() : '')).filter(Boolean);
  } catch (e) {
    return [];
  }
}

export function markSessionClosed(email) {
  if (!email) return;
  try {
    const cleanEmail = email.toLowerCase().trim();
    const list = getClosedSessionsList();
    if (!list.includes(cleanEmail)) {
      list.push(cleanEmail);
      localStorage.setItem(STORAGE_KEY_CLOSED_SESSIONS, JSON.stringify(list));
    }
  } catch (e) {}
}

export function markSessionOpen(emailOrUser) {
  if (!emailOrUser) return;
  const email = typeof emailOrUser === 'string' ? emailOrUser : emailOrUser.email;
  if (!email) return;
  try {
    const cleanEmail = email.toLowerCase().trim();
    const list = getClosedSessionsList();
    const filtered = list.filter(e => e !== cleanEmail);
    localStorage.setItem(STORAGE_KEY_CLOSED_SESSIONS, JSON.stringify(filtered));
  } catch (e) {}
}

export function getRegisteredUsersList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REGISTERED_USERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export function saveRegisteredUserAccount(userObj) {
  if (!userObj || !userObj.email) return;
  try {
    const list = getRegisteredUsersList();
    const cleanEmail = userObj.email.toLowerCase().trim();
    const filtered = list.filter(u => (u.email || '').toLowerCase().trim() !== cleanEmail);

    let sub = null;
    if (typeof localStorage !== 'undefined') {
      const subRaw = localStorage.getItem(`adm_arq_subscription_${cleanEmail}`)
        || localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
      if (subRaw) {
        try {
          const parsed = JSON.parse(subRaw);
          if (parsed?.planId) sub = parsed;
        } catch (_) {}
      }
    }
    if (!sub) {
      sub = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      try {
        localStorage.setItem(`adm_arq_subscription_${cleanEmail}`, JSON.stringify(sub));
      } catch (_) {}
    }
    userObj.subscription = sub;

    filtered.push(userObj);
    localStorage.setItem(STORAGE_KEY_REGISTERED_USERS, JSON.stringify(filtered));
    markSessionOpen(cleanEmail);
    addFeaturedProfile(userObj);
  } catch (e) {}
}

export function findRegisteredUserAccount(email) {
  if (!email) return null;
  const cleanEmail = email.toLowerCase().trim();
  const list = getRegisteredUsersList();
  const found = list.find(u => (u.email || '').toLowerCase().trim() === cleanEmail) || null;
  if (found && typeof localStorage !== 'undefined') {
    const subRaw = localStorage.getItem(`adm_arq_subscription_${cleanEmail}`)
      || localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
    if (subRaw) {
      try {
        const parsed = JSON.parse(subRaw);
        if (parsed?.planId) found.subscription = parsed;
      } catch (_) {}
    } else {
      found.subscription = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
    }
  }
  return found;
}

// ==========================================
// GESTIÓN DE PERFILES DESTACADOS (SESIONES INICIADAS)
// ==========================================
export function getFeaturedProfilesList() {
  try {
    const closedList = getClosedSessionsList();
    const closedSet = new Set(closedList);
    const seenEmails = new Set();
    const result = [];

    const addProfileCandidate = (p) => {
      if (!p || !p.email) return;
      const em = p.email.toLowerCase().trim();
      if (closedSet.has(em)) return;
      if (seenEmails.has(em)) return;
      seenEmails.add(em);

      result.push({
        name: p.name || em.split('@')[0],
        email: em,
        avatar: p.avatar || (AVATARS_BY_SEX && AVATARS_BY_SEX[p.sexo]) || (AVATARS_BY_SEX && AVATARS_BY_SEX['Masculino']) || 'assets/branding/cubikar_icon_transparent.png',
        sexo: p.sexo || 'Masculino',
        role: p.role || 'usuario',
        roleLabel: p.roleLabel || 'Usuario',
        dob: p.dob || '',
        subscription: (() => {
          if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(`adm_arq_subscription_${em}`)
              || localStorage.getItem(`adm_const_subscription_${em}`);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (parsed?.planId) return parsed;
              } catch (_) {}
            }
          }
          return { planId: 'free', billingCycle: 'monthly', updatedAt: null };
        })(),
        lastLogin: p.lastLogin || p.registeredAt || new Date().toISOString()
      });
    };

    // 1. Usuario actualmente activo en sesión
    const curr = getCurrentUser();
    if (curr) {
      addProfileCandidate(curr);
    }

    // 2. Perfiles explícitamente guardados en STORAGE_KEY_FEATURED_PROFILES
    const rawFeatured = localStorage.getItem(STORAGE_KEY_FEATURED_PROFILES);
    if (rawFeatured) {
      try {
        const list = JSON.parse(rawFeatured);
        if (Array.isArray(list)) list.forEach(addProfileCandidate);
      } catch (_) {}
    }

    // 3. Usuario guardado anteriormente (getSavedUserProfile)
    const savedUser = getSavedUserProfile();
    if (savedUser) {
      addProfileCandidate(savedUser);
    }

    // 4. Todas las cuentas registradas en esta computadora
    const registered = getRegisteredUsersList();
    if (Array.isArray(registered)) {
      registered.forEach(addProfileCandidate);
    }

    return result;
  } catch (e) {
    console.error('Error obteniendo perfiles destacados:', e);
    return [];
  }
}

export function addFeaturedProfile(user) {
  if (!user || !user.email) return;
  try {
    const cleanEmail = user.email.toLowerCase().trim();
    markSessionOpen(cleanEmail);

    const raw = localStorage.getItem(STORAGE_KEY_FEATURED_PROFILES);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    const filtered = list.filter(p => (p.email || '').toLowerCase().trim() !== cleanEmail);

    const profileEntry = {
      name: user.name || cleanEmail.split('@')[0],
      email: cleanEmail,
      avatar: user.avatar || (AVATARS_BY_SEX && AVATARS_BY_SEX[user.sexo]) || (AVATARS_BY_SEX && AVATARS_BY_SEX['Masculino']) || 'assets/branding/cubikar_icon_transparent.png',
      sexo: user.sexo || 'Masculino',
      role: user.role || 'usuario',
      roleLabel: user.roleLabel || 'Usuario',
      dob: user.dob || '',
      subscription: (() => {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(`adm_arq_subscription_${cleanEmail}`)
            || localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.planId) return parsed;
            } catch (_) {}
          }
        }
        return { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      })(),
      lastLogin: new Date().toISOString()
    };

    filtered.unshift(profileEntry);
    localStorage.setItem(STORAGE_KEY_FEATURED_PROFILES, JSON.stringify(filtered));
  } catch (e) {}
}

export function removeFeaturedProfile(email) {
  if (!email) return;
  try {
    const cleanEmail = email.toLowerCase().trim();
    markSessionClosed(cleanEmail);

    const rawFeatured = localStorage.getItem(STORAGE_KEY_FEATURED_PROFILES);
    if (rawFeatured) {
      try {
        const list = JSON.parse(rawFeatured);
        if (Array.isArray(list)) {
          const filtered = list.filter(p => (p.email || '').toLowerCase().trim() !== cleanEmail);
          localStorage.setItem(STORAGE_KEY_FEATURED_PROFILES, JSON.stringify(filtered));
        }
      } catch (_) {}
    }

    // Si la sesión activa o guardada coincide con la cuenta que se quita, cerrar sesión automáticamente
    const curr = getCurrentUser();
    if (curr && (curr.email || '').toLowerCase().trim() === cleanEmail) {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER + '_last');
    }
    const saved = getSavedUserProfile();
    if (saved && (saved.email || '').toLowerCase().trim() === cleanEmail) {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER + '_last');
    }

    const remaining = getFeaturedProfilesList();
    if (remaining.length === 0) {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER + '_last');
      localStorage.setItem('control_obra_user_profile_dismissed', 'true');
    }
  } catch (e) {}
}

// Purga total de todas las cuentas registradas e información de usuarios
export function purgeAllRegisteredAccountsAndUsers() {
  try {
    localStorage.removeItem(STORAGE_KEY_REGISTERED_USERS);
    localStorage.removeItem(STORAGE_KEY_FEATURED_PROFILES);
    localStorage.removeItem(STORAGE_KEY_CLOSED_SESSIONS);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_USER + '_last');
    localStorage.removeItem('control_obra_user_profile_dismissed');
    localStorage.removeItem(STORAGE_KEY_SUBSCRIPTION);
    localStorage.removeItem(STORAGE_KEY_INVITATIONS);
    localStorage.removeItem(STORAGE_KEY_PLAN_INVITATIONS);
    localStorage.removeItem('control_obra_clipboard_concept_v1');
    localStorage.removeItem('sb-' + 'supabase-auth-token');
    // Limpiar cualquier clave relacionada con perfiles de usuario
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('control_obra_user') || k.startsWith('control_obra_featured') || k.startsWith('control_obra_closed') || k.startsWith('sb-') || k.includes('auth-token') || k.startsWith('adm_arq_subscription') || k.startsWith('adm_const_subscription'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Error purgando cuentas:', e);
  }
}

// ==========================================
// ELIMINACIÓN DEFINITIVA DE CUENTA Y ARCHIVOS
// ==========================================
export function deleteUserAccountAndData(email) {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();

  try {
    // 1. Eliminar todos los proyectos creados / pertenecientes a este usuario
    const allProjects = getProjectsList();
    const projectsToDelete = allProjects.filter(p => {
      const oEmail = (p.ownerEmail || '').toLowerCase().trim();
      return oEmail === cleanEmail;
    });

    projectsToDelete.forEach(p => {
      try {
        localStorage.removeItem(getSettingsKey(p.id));
        localStorage.removeItem(getStorageKey(p.id));
        localStorage.removeItem(`estimaciones_data_${p.id}`);
        localStorage.removeItem(`adm_const_state_${p.id}`);
        localStorage.removeItem(`adm_const_sobrecosto_${p.id}`);
        localStorage.removeItem(`project_chat_${p.id}`);
        deleteProjectFromCloud(p.id);
      } catch (_) {}
    });

    // 2. Guardar lista de proyectos restantes (excluyendo los del usuario y quitándolo de colaboradores de otros proyectos)
    const remainingProjects = allProjects.filter(p => {
      const oEmail = (p.ownerEmail || '').toLowerCase().trim();
      return oEmail !== cleanEmail;
    }).map(p => {
      if (Array.isArray(p.members)) {
        p.members = p.members.filter(m => (m.email || '').toLowerCase().trim() !== cleanEmail);
      }
      return p;
    });
    saveProjectsList(remainingProjects);

    // 3. Limpiar invitaciones asociadas a este correo
    try {
      const invs = getStoredInvitations().filter(inv => {
        const iEmail = (inv.email || inv.inviteeEmail || '').toLowerCase().trim();
        const oEmail = (inv.ownerEmail || inv.inviterEmail || '').toLowerCase().trim();
        return iEmail !== cleanEmail && oEmail !== cleanEmail;
      });
      saveStoredInvitations(invs);
    } catch (_) {}

    try {
      const planInvs = getStoredPlanInvitations().filter(pInv => {
        const iEmail = (pInv.email || pInv.inviteeEmail || '').toLowerCase().trim();
        const oEmail = (pInv.ownerEmail || '').toLowerCase().trim();
        return iEmail !== cleanEmail && oEmail !== cleanEmail;
      });
      saveStoredPlanInvitations(planInvs);
    } catch (_) {}

    // 4. Quitar de cuentas registradas en este equipo
    try {
      const registered = getRegisteredUsersList().filter(u => (u.email || '').toLowerCase().trim() !== cleanEmail);
      localStorage.setItem(STORAGE_KEY_REGISTERED_USERS, JSON.stringify(registered));
    } catch (_) {}

    // 5. Quitar de perfiles destacados
    removeFeaturedProfile(cleanEmail);

    // 6. Quitar de sesiones cerradas
    try {
      const closed = getClosedSessionsList().filter(e => e !== cleanEmail);
      localStorage.setItem(STORAGE_KEY_CLOSED_SESSIONS, JSON.stringify(closed));
    } catch (_) {}

    // 7. Limpiar suscripciones o datos locales específicos del correo
    try {
      localStorage.removeItem(`adm_arq_subscription_${cleanEmail}`);
      localStorage.removeItem(`adm_const_subscription_${cleanEmail}`);
    } catch (_) {}

    // 8. Si es el usuario activo actual, limpiar sesión activa y espacio de trabajo
    const current = getCurrentUser();
    if (current && (current.email || '').toLowerCase().trim() === cleanEmail) {
      saveCurrentUser(null);
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER + '_last');
      localStorage.removeItem(STORAGE_KEY_ACTIVE_WORKSPACE);
      localStorage.removeItem('control_obra_clipboard_concept_v1');
    }

    return true;
  } catch (err) {
    console.error('Error eliminando cuenta y datos de usuario:', err);
    return false;
  }
}

// ==========================================
// GESTIÓN DE USUARIO
// ==========================================
let _simulatedUserView = null;

export function setSimulatedUserView(simUser = null) {
  _simulatedUserView = simUser ? { ...simUser, isSimulation: true } : null;
}

export function getSimulatedUserView() {
  return _simulatedUserView;
}

export function getCurrentUser(ignoreSimulation = false) {
  try {
    enforceGlobalSessionRevocation();
    if (!ignoreSimulation && _simulatedUserView) {
      return { ..._simulatedUserView };
    }
    let raw = null;
    if (typeof sessionStorage !== 'undefined') {
      raw = sessionStorage.getItem(STORAGE_KEY_USER);
    }
    if (!raw && typeof localStorage !== 'undefined') {
      const remembered = localStorage.getItem('cubikar_remember_device') !== 'false';
      if (remembered) {
        raw = localStorage.getItem(STORAGE_KEY_USER);
      }
    }
    if (raw) {
      const u = JSON.parse(raw);
      const cleanEmail = (u?.email || '').toLowerCase().trim();
      if (cleanEmail && typeof localStorage !== 'undefined') {
        const subRaw = localStorage.getItem(`adm_arq_subscription_${cleanEmail}`)
          || localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
        if (subRaw) {
          try {
            const parsed = JSON.parse(subRaw);
            if (parsed?.planId) {
              u.subscription = parsed;
            }
          } catch (e) {}
        }
      }
      if (u && !u.subscription) {
        u.subscription = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      }
      return u;
    }
    return null;
  } catch (e) {
    console.error('Error leyendo usuario:', e);
    return null;
  }
}

// Retorna el usuario guardado en localStorage sin forzar ningún fallback inventado
export function getSavedUserProfile() {
  try {
    enforceGlobalSessionRevocation();
    const isDismissed = localStorage.getItem('control_obra_user_profile_dismissed');
    if (isDismissed === 'true') {
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY_USER + '_last') || localStorage.getItem(STORAGE_KEY_USER);
    if (raw) {
      const u = JSON.parse(raw);
      const cleanEmail = (u?.email || '').toLowerCase().trim();
      if (cleanEmail && typeof localStorage !== 'undefined') {
        const subRaw = localStorage.getItem(`adm_arq_subscription_${cleanEmail}`)
          || localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
        if (subRaw) {
          try {
            const parsed = JSON.parse(subRaw);
            if (parsed?.planId) {
              u.subscription = parsed;
            }
          } catch (e) {}
        }
      }
      if (u && !u.subscription) {
        u.subscription = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      }
      return u;
    }
  } catch (e) {}
  return null;
}

export function getLastKnownUser() {
  const saved = getSavedUserProfile();
  if (saved) return saved;

  const fallback = {
    name: 'Invitado',
    email: '',
    avatar: '',
    role: 'invitado',
    roleLabel: 'Invitado',
    sexo: 'Masculino'
  };
  return fallback;
}

export function saveCurrentUser(user, remember = null) {
  try {
    if (!user) {
      _simulatedUserView = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_USER);
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEY_USER);
      }
    } else {
      try {
        localStorage.removeItem('control_obra_user_profile_dismissed');
        localStorage.setItem(STORAGE_KEY_AUTH_SESSION_VERSION, CURRENT_AUTH_SESSION_VERSION);
      } catch (e) {}
      const cleanUserEmail = (user?.email || '').toLowerCase().trim();

      // Sincronizar siempre con la suscripción aislada de ADM_ARQ del usuario
      if (cleanUserEmail && typeof localStorage !== 'undefined') {
        const subRaw = localStorage.getItem(`adm_arq_subscription_${cleanUserEmail}`)
          || localStorage.getItem(`adm_const_subscription_${cleanUserEmail}`);
        if (subRaw) {
          try {
            const parsedSub = JSON.parse(subRaw);
            if (parsedSub?.planId) {
              if (user.subscription && user.subscription.updatedAt && parsedSub.updatedAt && new Date(user.subscription.updatedAt) > new Date(parsedSub.updatedAt)) {
                localStorage.setItem(`adm_arq_subscription_${cleanUserEmail}`, JSON.stringify(user.subscription));
              } else {
                user.subscription = parsedSub;
              }
            }
          } catch (_) {}
        } else {
          // Si el usuario no tiene suscripción previa, inicia en gratuita
          if (user.subscription && user.subscription.planId && user.subscription.planId !== 'free' && user.subscription.updatedAt) {
            localStorage.setItem(`adm_arq_subscription_${cleanUserEmail}`, JSON.stringify(user.subscription));
          } else {
            const initialFree = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
            user.subscription = initialFree;
            localStorage.setItem(`adm_arq_subscription_${cleanUserEmail}`, JSON.stringify(initialFree));
          }
        }
      }

      if (!user.subscription) {
        user.subscription = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      }

      const shouldRemember = remember !== null
        ? !!remember
        : (typeof localStorage !== 'undefined' && localStorage.getItem('cubikar_remember_device') !== 'false');

      if (shouldRemember) {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
        try {
          localStorage.setItem(STORAGE_KEY_USER + '_last', JSON.stringify(user));
          localStorage.setItem('cubikar_remember_device', 'true');
        } catch (e) {}
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(STORAGE_KEY_USER);
        }
      } else {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY_USER);
          localStorage.removeItem(STORAGE_KEY_USER + '_last');
          localStorage.setItem('cubikar_remember_device', 'false');
        }
      }
    }
  } catch (e) {
    console.error('Error guardando usuario:', e);
  }
}

// ==========================================
// REGISTRO DE PROYECTOS ELIMINADOS
// ==========================================
export function getDeletedProjectsList() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_PROJECTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function markProjectDeleted(projectId) {
  if (!projectId) return;
  try {
    const list = getDeletedProjectsList();
    if (!list.includes(projectId)) {
      list.push(projectId);
      localStorage.setItem(STORAGE_KEY_DELETED_PROJECTS, JSON.stringify(list));
    }
  } catch (_) {}
}

export function isProjectMarkedDeleted(projectId) {
  if (!projectId) return false;
  return getDeletedProjectsList().includes(projectId);
}

// ==========================================
// GESTIÓN DE PROYECTOS
// ==========================================
export function getProjectsList() {
  try {
    const deletedList = getDeletedProjectsList();
    const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);

    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (raw) {
      let list = JSON.parse(raw);
      if (!Array.isArray(list)) list = [];

      // Filtrar inmediatamente cualquier proyecto eliminado
      if (deletedList.length > 0) {
        const initialLen = list.length;
        list = list.filter(p => !isDeleted(p.id) && !isDeleted(p.cloudId));
        if (list.length !== initialLen) {
          localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(list));
        }
      }

      // Asegurar que cada proyecto tenga su lista de colaboradores con permisos
      const currentUser = getCurrentUser();
      const isRealAuthenticatedUser = Boolean(currentUser && currentUser.email && !SYSTEM_EXCLUDED_EMAILS.has(currentUser.email.toLowerCase().trim()));
      let changed = false;

      // Solo registrar el proyecto muestra para cuentas demo/sin autenticar, nunca inyectarlo a cuentas reales
      const hasCasaLaura = list.some(p => p.id === 'proj-opus-casa-laura' || (p.projectName && p.projectName.toLowerCase().includes('casa laura')));
      if (!isRealAuthenticatedUser && !hasCasaLaura && !isDeleted('proj-opus-casa-laura')) {
        const proj3Id = 'proj-opus-casa-laura';
        const proj3Settings = Object.assign({}, defaultSettings, {
          companyName: 'Constructora Opus México',
          companyLogo: SAMPLE_LOGOS.building,
          projectName: 'Casa Laura (Opus 2014)',
          projectLocation: 'Fraccionamiento Residencial, Puebla, Pue.',
          currency: 'MXN',
          currencySymbol: '$',
          applySobrecosto: false,
          pctIndirectos: 0.00,
          pctFinanciamiento: 0.00,
          pctUtilidad: 0.00,
          pctAdicionales: 0.00
        });
        const proj3Tree = JSON.parse(JSON.stringify(CASA_LAURA_PROJECT));
        try {
          localStorage.setItem(getSettingsKey(proj3Id), JSON.stringify(proj3Settings));
          localStorage.setItem(getStorageKey(proj3Id), JSON.stringify(proj3Tree));
        } catch (e) {}

        list.push({
          id: proj3Id,
          companyName: proj3Settings.companyName,
          companyLogo: proj3Settings.companyLogo,
          projectName: proj3Settings.projectName,
          projectLocation: proj3Settings.projectLocation,
          tipoObra: 'Vivienda',
          currency: proj3Settings.currency,
          currencySymbol: proj3Settings.currencySymbol,
          factorSobrecosto: 1.0000,
          totalPresupuesto: 2043699.54,
          conceptCount: 94,
          partidasCount: 12,
          createdAt: '2024-05-20',
          isSample: true,
          ownerEmail: 'admin.general@constructora.com',
          ownerName: 'Administrador de Obra',
          ownerPlanId: 'pro',
          members: [
            {
              id: 'mem-' + (currentUser ? currentUser.email : 'owner'),
              name: (currentUser && currentUser.name) || 'Administrador de Obra',
              email: (currentUser && currentUser.email) || 'admin@constructora.com',
              avatar: (currentUser && currentUser.avatar) || AVATARS_BY_SEX['Masculino'],
              role: 'editar'
            }
          ]
        });
        changed = true;
      }

      list.forEach(p => {
        if (p.projectName) p.projectName = cleanMojibake(p.projectName);
        if (p.companyName) p.companyName = cleanMojibake(p.companyName);
        if (p.projectLocation) p.projectLocation = cleanMojibake(p.projectLocation);
        if (p.tipoObra) p.tipoObra = cleanMojibake(p.tipoObra);
        if (Array.isArray(p.members)) {
          p.members.forEach(m => {
            if (!Array.isArray(m.allowedTabs)) {
              if (m.role === 'editar') {
                m.allowedTabs = ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'];
              } else if (m.email && m.email.includes('mariana')) {
                m.allowedTabs = ['presupuesto', 'estimaciones'];
              } else if (m.email && m.email.includes('roberto')) {
                m.allowedTabs = ['alcances', 'seguimiento', 'calendario'];
              } else {
                m.allowedTabs = ['alcances', 'presupuesto'];
              }
              changed = true;
            } else if (m.allowedTabs.includes('cat') || m.allowedTabs.includes('insumos')) {
              // Migrar claves heredadas ('cat' -> 'alcances', 'insumos' -> 'presupuesto')
              m.allowedTabs = Array.from(new Set(
                m.allowedTabs.map(t => (t === 'cat' ? 'alcances' : t === 'insumos' ? 'presupuesto' : t))
              ));
              changed = true;
            }
          });
        }
        if (!p.members || !Array.isArray(p.members)) {
          p.members = [];
        }

        // Asignar tipo de obra si no cuenta con él
        if (!p.tipoObra) {
          const nameLower = (p.projectName || '').toLowerCase();
          if (nameLower.includes('torre') || nameLower.includes('corporativ') || nameLower.includes('edificio')) {
            p.tipoObra = 'Edificación';
          } else if (nameLower.includes('residencia') || nameLower.includes('casa') || nameLower.includes('vivienda') || nameLower.includes('lomas')) {
            p.tipoObra = 'Vivienda';
          } else if (nameLower.includes('puente') || nameLower.includes('cimentac') || nameLower.includes('pilot')) {
            p.tipoObra = 'Obra Civil';
          } else if (nameLower.includes('vial') || nameLower.includes('carreter') || nameLower.includes('parque')) {
            p.tipoObra = 'Infraestructura';
          } else {
            p.tipoObra = 'Edificación';
          }
          changed = true;
        }

        // Garantizar que cada proyecto tenga ownerEmail
        if (!p.ownerEmail) {
          const firstEditor = Array.isArray(p.members) ? p.members.find(m => m.role === 'editar') : null;
          p.ownerEmail = firstEditor?.email || 'admin.general@constructora.com';
          changed = true;
        }

        // Sanitizar y curar nombre del propietario si tiene un valor de empresa o texto basura
        const cleanOwner = (p.ownerName || '').trim();
        if (!cleanOwner || isInvalidUserName(cleanOwner, p.ownerEmail, p)) {
          p.ownerName = resolveCleanHostName(p.ownerEmail, '', p);
          changed = true;
        }

        // Asignar fecha de creación si no cuenta con ella
        if (!p.createdAt) {
          p.createdAt = new Date().toISOString().slice(0, 10);
          changed = true;
        }
      });
      if (changed) saveProjectsList(list);
      return list;
    }
  } catch (e) {
    console.error('Error leyendo proyectos:', e);
  }
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.email && !SYSTEM_EXCLUDED_EMAILS.has(currentUser.email.toLowerCase().trim())) {
    try {
      localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify([]));
    } catch (_) {}
    return [];
  }
  return initializeDefaultProjects();
}

export function saveProjectsList(projects) {
  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('Error guardando proyectos:', e);
  }
}

// Obtener proyectos accesibles para un usuario dado
// En el perfil del usuario solo aparecerán los proyectos que creó y aquellos en los que aceptó la invitación (miembro activo).
export function getProjectsForUser(user) {
  const allProjects = getProjectsList();
  if (!user || !user.email) return allProjects;
  const emailLower = user.email.toLowerCase().trim();
  const deletedList = getDeletedProjectsList();
  const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);

  return allProjects.filter(p => {
    // Si fue eliminado, nunca incluir
    if (isDeleted(p.id) || isDeleted(p.cloudId)) return false;

    // Es el creador/propietario del proyecto
    if (p.ownerEmail && p.ownerEmail.toLowerCase().trim() === emailLower) {
      return true;
    }
    // O es miembro activo, aceptado o con invitación pendiente
    if (Array.isArray(p.members)) {
      return p.members.some(m => {
        const mEmail = (m.email || '').toLowerCase().trim();
        const mStatus = (m.status || '').toLowerCase().trim();
        return mEmail === emailLower && (mStatus === 'active' || mStatus === 'accepted' || mStatus === 'pending' || !mStatus);
      });
    }
    return false;
  });
}

export function getProjectById(id) {
  if (!id) return null;
  const list = getProjectsList();
  return list.find(p => p.id === id || p.cloudId === id) || null;
}

// Inicializar proyectos por defecto o migrar datos existentes
function initializeDefaultProjects() {
  let existingTree = null;
  let existingSettings = null;

  try {
    const rawTree = localStorage.getItem(DEFAULT_STORAGE_KEY);
    if (rawTree) existingTree = JSON.parse(rawTree);
    const rawSet = localStorage.getItem(DEFAULT_SETTINGS_KEY);
    if (rawSet) existingSettings = JSON.parse(rawSet);
  } catch (e) {}

  const initialProjects = [];

  // Proyecto Principal (basado en los datos actuales o por defecto)
  const proj1Id = 'proj-default-01';
  const proj1Settings = Object.assign({}, defaultSettings, existingSettings || {}, {
    companyName: (existingSettings && existingSettings.companyName) || 'Constructora Lomas del Ángel S.A.',
    companyLogo: (existingSettings && existingSettings.companyLogo) || SAMPLE_LOGOS.shield,
    projectName: (existingSettings && existingSettings.projectName) || 'Residencia Lomas Altas (Fase 1)',
    projectLocation: (existingSettings && existingSettings.projectLocation) || 'Av. Paseo de las Lomas 1240, CDMX',
    currency: (existingSettings && existingSettings.currency) || 'MXN',
    currencySymbol: (existingSettings && existingSettings.currencySymbol) || '$',
    applySobrecosto: true,
    pctIndirectos: 12.00,
    pctFinanciamiento: 1.50,
    pctUtilidad: 10.00,
    pctAdicionales: 0.50
  });

  const proj1Tree = existingTree && existingTree.length > 0 ? existingTree : JSON.parse(JSON.stringify(defaultTreeData));

  // Guardar almacenamiento aislado para el proyecto 1
  try {
    localStorage.setItem(getSettingsKey(proj1Id), JSON.stringify(proj1Settings));
    localStorage.setItem(getStorageKey(proj1Id), JSON.stringify(proj1Tree));
  } catch (e) {}

  const f1 = 1.2584;
  initialProjects.push({
    id: proj1Id,
    companyName: proj1Settings.companyName,
    companyLogo: proj1Settings.companyLogo,
    projectName: proj1Settings.projectName,
    projectLocation: proj1Settings.projectLocation,
    tipoObra: 'Vivienda',
    currency: proj1Settings.currency,
    currencySymbol: proj1Settings.currencySymbol,
    factorSobrecosto: f1,
    totalPresupuesto: calculateTreeTotal(proj1Tree),
    conceptCount: countTreeConcepts(proj1Tree),
    partidasCount: countTreePartidas(proj1Tree),
    createdAt: '2026-09-15'
  });

  // Proyecto de Muestra 2 (Torre Corporativa Reforma)
  const proj2Id = 'proj-demo-02';
  const proj2Settings = Object.assign({}, defaultSettings, {
    companyName: 'Grupo Constructor Metrópoli',
    companyLogo: SAMPLE_LOGOS.building,
    projectName: 'Torre Corporativa Reforma',
    projectLocation: 'Paseo de la Reforma 405, Cuauhtémoc, CDMX',
    currency: 'USD',
    currencySymbol: '$',
    applySobrecosto: true,
    pctIndirectos: 10.00,
    pctFinanciamiento: 1.20,
    pctUtilidad: 9.50,
    pctAdicionales: 0.50
  });

  const proj2Tree = [
    {
      id: 'p2-1',
      clave: '1',
      descripcion: 'SUBESTRUCTURA Y PILOTES',
      unidad: 'lote',
      cantidad: 1,
      precioUnitario: 0,
      costoDirecto: 0,
      color: '#3b82f6',
      expanded: true,
      selected: true,
      children: [
        {
          id: 'p2-1.1',
          clave: '1.1',
          descripcion: 'Pilotes de cimentación profunda de concreto armado d=80 cm h=22 m',
          unidad: 'm',
          cantidad: 1450.00,
          precioUnitario: 320.00,
          costoDirecto: 320.00,
          selected: true,
          insumos: [
            { clave: 'MAT-P01', tipo: 'Material', descripcion: 'Concreto premezclado f\'c=350 kg/cm2', unidad: 'm3', cantidad: 0.52, costoUnitario: 145.00 },
            { clave: 'MO-P01', tipo: 'Mano de Obra', descripcion: 'Cuadrilla especializada en perforación y colado', unidad: 'jor', cantidad: 0.05, costoUnitario: 180.00 },
            { clave: 'EQ-P01', tipo: 'Equipo', descripcion: 'Perforadora hidráulica sobre orugas Casagrande', unidad: 'hr', cantidad: 0.04, costoUnitario: 850.00 }
          ]
        }
      ]
    }
  ];

  try {
    localStorage.setItem(getSettingsKey(proj2Id), JSON.stringify(proj2Settings));
    localStorage.setItem(getStorageKey(proj2Id), JSON.stringify(proj2Tree));
  } catch (e) {}

  initialProjects.push({
    id: proj2Id,
    companyName: proj2Settings.companyName,
    companyLogo: proj2Settings.companyLogo,
    projectName: proj2Settings.projectName,
    projectLocation: proj2Settings.projectLocation,
    tipoObra: 'Edificación',
    currency: proj2Settings.currency,
    currencySymbol: proj2Settings.currencySymbol,
    factorSobrecosto: 1.2215,
    totalPresupuesto: calculateTreeTotal(proj2Tree),
    conceptCount: countTreeConcepts(proj2Tree),
    partidasCount: countTreePartidas(proj2Tree),
    createdAt: '2026-10-10'
  });

  // Proyecto 3: Casa Laura (Opus 2014)
  const proj3Id = 'proj-opus-casa-laura';
  const proj3Settings = Object.assign({}, defaultSettings, {
    companyName: 'Constructora Opus México',
    companyLogo: SAMPLE_LOGOS.building,
    projectName: 'Casa Laura (Opus 2014)',
    projectLocation: 'Fraccionamiento Residencial, Puebla, Pue.',
    currency: 'MXN',
    currencySymbol: '$',
    applySobrecosto: false,
    pctIndirectos: 0.00,
    pctFinanciamiento: 0.00,
    pctUtilidad: 0.00,
    pctAdicionales: 0.00
  });

  const proj3Tree = JSON.parse(JSON.stringify(CASA_LAURA_PROJECT));

  try {
    localStorage.setItem(getSettingsKey(proj3Id), JSON.stringify(proj3Settings));
    localStorage.setItem(getStorageKey(proj3Id), JSON.stringify(proj3Tree));
  } catch (e) {}

  initialProjects.push({
    id: proj3Id,
    companyName: proj3Settings.companyName,
    companyLogo: proj3Settings.companyLogo,
    projectName: proj3Settings.projectName,
    projectLocation: proj3Settings.projectLocation,
    tipoObra: 'Vivienda',
    currency: proj3Settings.currency,
    currencySymbol: proj3Settings.currencySymbol,
    factorSobrecosto: 1.0000,
    totalPresupuesto: 2043699.54,
    conceptCount: 94,
    partidasCount: 12,
    createdAt: '2024-05-20'
  });

  saveProjectsList(initialProjects);
  return initialProjects;
}

// Crear un nuevo proyecto
export function createNewProject(params) {
  const newId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : 'proj-' + Date.now();
  
  const parsedIva = params.ivaPct !== undefined && !isNaN(Number(params.ivaPct))
    ? Math.max(0, Math.min(100, Number(params.ivaPct)))
    : 16.00;
  const parsedUtilidad = params.pctUtilidad !== undefined && !isNaN(Number(params.pctUtilidad))
    ? Math.max(0, Math.min(95, Number(params.pctUtilidad)))
    : 35.00;

  const projectCreatedAt = params.createdAt || new Date().toISOString().slice(0, 10);

  const projSettings = Object.assign({}, defaultSettings, {
    companyName: params.companyName,
    companyLogo: params.companyLogo || '',
    projectName: params.projectName,
    projectLocation: params.projectLocation,
    createdAt: projectCreatedAt,
    currency: params.currency || 'MXN',
    currencySymbol: params.currencySymbol || '$',
    applySobrecosto: params.applySobrecosto ?? true,
    applyDesgloseIndirectos: params.applyDesgloseIndirectos ?? false,
    pctIndirectos: params.pctIndirectos ?? 12.00,
    pctFinanciamiento: params.pctFinanciamiento ?? 0.00,
    pctUtilidad: parsedUtilidad,
    pctAdicionales: params.pctAdicionales ?? 0.00,
    pctSegurosFianzas: params.pctSegurosFianzas ?? 0.00,
    pctFasar: params.pctFasar ?? 0,
    ivaPct: parsedIva,
    _execParamsV1: true,
    _advOptsDefaultOffV1: true,
    presupuestoArq: Object.assign({}, params.presupuestoArq || {}, {
      margenUtilidadGlobal: params.presupuestoArq?.margenUtilidadGlobal ?? parsedUtilidad,
      ivaPct: params.presupuestoArq?.ivaPct ?? parsedIva,
      aplicarIva: params.presupuestoArq?.aplicarIva ?? true,
      applyNominaFactor: params.presupuestoArq?.applyNominaFactor ?? false,
      aplicarRetenciones: params.presupuestoArq?.aplicarRetenciones ?? false,
      retencionIsrPct: params.presupuestoArq?.retencionIsrPct ?? 0,
      retencionIvaPct: params.presupuestoArq?.retencionIvaPct ?? 0,
      _advOptsDefaultOffV1: true
    })
  });

  const projTree = params.template === 'demo' ? JSON.parse(JSON.stringify(defaultTreeData)) : [];

  // Almacenar settings y catálogo del nuevo proyecto
  try {
    localStorage.setItem(getSettingsKey(newId), JSON.stringify(projSettings));
    localStorage.setItem(getStorageKey(newId), JSON.stringify(projTree));
    localStorage.setItem('calendario_cfg_' + newId, JSON.stringify({
      startDate: projectCreatedAt,
      currentDate: 'auto',
      scale: 'dias',
      viewMode: 'gantt',
      selectedPartida: 'all'
    }));
  } catch (e) {
    console.error('Error guardando nuevo proyecto:', e);
  }

  const f = projSettings.applySobrecosto ?
    (1 + projSettings.pctIndirectos/100) * (1 + projSettings.pctFinanciamiento/100) * (1 + projSettings.pctUtilidad/100) * (1 + projSettings.pctAdicionales/100) * (1 + (projSettings.pctSegurosFianzas || 0)/100) : 1.0;

  const currentUser = getCurrentUser();
  const targetOwnerEmail = (params.ownerEmail || (currentUser && currentUser.email) || 'admin.general@constructora.com').toLowerCase().trim();
  const targetOwnerPlanId = params.ownerPlanId || getUserPlanId(targetOwnerEmail);

  // Determinar miembros iniciales
  let initialMembers = [];
  if (Array.isArray(params.members) && params.members.length > 0) {
    initialMembers = params.members;
  } else {
    const isUnderOtherHost = currentUser && currentUser.email && targetOwnerEmail !== currentUser.email.toLowerCase().trim();
    if (isUnderOtherHost) {
      initialMembers = [
        {
          id: 'mem-' + targetOwnerEmail,
          name: resolveCleanHostName(targetOwnerEmail, params.hostName || params.ownerName),
          email: targetOwnerEmail,
          avatar: AVATARS_BY_SEX['Masculino'],
          role: 'editar',
          status: 'active'
        },
        {
          id: 'mem-' + currentUser.email,
          name: currentUser.name || 'Editor de Obra',
          email: currentUser.email,
          avatar: currentUser.avatar || AVATARS_BY_SEX['Masculino'],
          role: 'editar',
          status: 'active'
        }
      ];

      // Vincular automáticamente a todos los demás colaboradores del plan del anfitrión (User A) con sus respectivos roles ('editar', 'escribir', 'leer')
      const existingCollabs = getPlanCollaboratorsForOwner(targetOwnerEmail);
      existingCollabs.forEach(collab => {
        const cEmail = (collab.email || '').toLowerCase().trim();
        if (cEmail && cEmail !== targetOwnerEmail && cEmail !== currentUser.email.toLowerCase().trim()) {
          initialMembers.push({
            id: 'mem-' + cEmail,
            name: collab.name || cEmail.split('@')[0],
            email: cEmail,
            avatar: collab.avatar || AVATARS_BY_SEX['Masculino'],
            role: collab.role || 'editar',
            allowedTabs: ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'],
            status: collab.status || 'active'
          });
        }
      });
    } else {
      initialMembers = [
        {
          id: 'mem-' + (currentUser ? currentUser.email : Date.now()),
          name: (currentUser && currentUser.name) || 'Administrador de Obra',
          email: (currentUser && currentUser.email) || 'admin@constructora.com',
          avatar: (currentUser && currentUser.avatar) || AVATARS_BY_SEX['Masculino'],
          role: 'editar',
          status: 'active'
        }
      ];

      // Si el dueño mismo crea la obra, vincular automáticamente a los colaboradores ya invitados a su plan
      const existingCollabs = getPlanCollaboratorsForOwner(targetOwnerEmail);
      existingCollabs.forEach(collab => {
        const cEmail = (collab.email || '').toLowerCase().trim();
        if (cEmail && cEmail !== targetOwnerEmail) {
          initialMembers.push({
            id: 'mem-' + cEmail,
            name: collab.name || cEmail.split('@')[0],
            email: cEmail,
            avatar: collab.avatar || AVATARS_BY_SEX['Masculino'],
            role: collab.role || 'editar',
            allowedTabs: ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'],
            status: collab.status || 'active'
          });
        }
      });
    }
  }

  const projectEntry = {
    id: newId,
    companyName: projSettings.companyName,
    companyLogo: projSettings.companyLogo,
    projectName: projSettings.projectName,
    projectLocation: projSettings.projectLocation,
    tipoObra: params.tipoObra || 'Edificación',
    currency: projSettings.currency,
    currencySymbol: projSettings.currencySymbol,
    factorSobrecosto: f,
    totalPresupuesto: calculateTreeTotal(projTree),
    conceptCount: countTreeConcepts(projTree),
    partidasCount: countTreePartidas(projTree),
    ownerEmail: targetOwnerEmail,
    ownerName: resolveCleanHostName(targetOwnerEmail, params.ownerName || (currentUser && currentUser.email && currentUser.email.toLowerCase().trim() === targetOwnerEmail ? currentUser.name : null) || params.hostName),
    ownerPlanId: targetOwnerPlanId,
    members: initialMembers,
    createdAt: params.createdAt || new Date().toISOString().slice(0, 10)
  };

  const list = getProjectsList();
  list.unshift(projectEntry);
  saveProjectsList(list);

  try {
    if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastNewProject === 'function') {
      window.CubikarRealtime.broadcastNewProject(projectEntry);
    }
  } catch (e) {}

  return projectEntry;
}

// Duplicar proyecto
export function duplicateProject(projectId) {
  const check = canUserCreateProject();
  if (!check.allowed) return null;

  const orig = getProjectById(projectId);
  if (!orig) return null;

  let origSettings = defaultSettings;
  let origTree = [];
  try {
    const s = localStorage.getItem(getSettingsKey(projectId));
    if (s) origSettings = JSON.parse(s);
    const t = localStorage.getItem(getStorageKey(projectId));
    if (t) origTree = JSON.parse(t);
  } catch(e) {}

  const newId = 'proj-' + Date.now();
  const copySettings = JSON.parse(JSON.stringify(origSettings));
  copySettings.projectName = orig.projectName + ' (Copia)';

  const copyTree = JSON.parse(JSON.stringify(origTree));
  const stripCloudUuids = (nodes) => {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(n => {
      if (!n || typeof n !== 'object') return;
      delete n.uuid;
      if (Array.isArray(n.insumos)) {
        n.insumos.forEach(ins => {
          if (ins && typeof ins === 'object') delete ins.uuid;
        });
      }
      if (Array.isArray(n.children)) stripCloudUuids(n.children);
    });
  };
  stripCloudUuids(copyTree);

  const newCreatedAt = new Date().toISOString().slice(0, 10);
  copySettings.createdAt = newCreatedAt;

  try {
    localStorage.setItem(getSettingsKey(newId), JSON.stringify(copySettings));
    localStorage.setItem(getStorageKey(newId), JSON.stringify(copyTree));
    localStorage.setItem('calendario_cfg_' + newId, JSON.stringify({
      startDate: newCreatedAt,
      currentDate: 'auto',
      scale: 'dias',
      viewMode: 'gantt',
      selectedPartida: 'all'
    }));
    const origCalWork = localStorage.getItem(`calendario_workdays_${projectId}`);
    if (origCalWork) {
      localStorage.setItem(`calendario_workdays_${newId}`, origCalWork);
    }
    const origExpenses = localStorage.getItem(`expenses_control_${projectId}`);
    if (origExpenses) {
      localStorage.setItem(`expenses_control_${newId}`, origExpenses);
    }
    const origEst = localStorage.getItem(`estimaciones_data_${projectId}`);
    if (origEst) {
      localStorage.setItem(`estimaciones_data_${newId}`, origEst);
    }
  } catch(e) {}

  const newProj = Object.assign({}, orig, {
    id: newId,
    cloudId: null,
    isCloudSynced: false,
    projectName: copySettings.projectName,
    members: (orig.members || []).map(m => Object.assign({}, m)),
    createdAt: newCreatedAt
  });

  const list = getProjectsList();
  list.unshift(newProj);
  saveProjectsList(list);

  return newProj;
}

// ==========================================
// GESTIÓN DE COLABORADORES / USUARIOS DE PROYECTO
// ==========================================
export function getProjectMembers(projectId) {
  const p = getProjectById(projectId);
  return (p && Array.isArray(p.members)) ? p.members : [];
}

export function addProjectMember(projectId, memberData) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj) return null;

  if (!Array.isArray(proj.members)) proj.members = [];

  // Verificar si ya existe por email
  const existingIdx = proj.members.findIndex(m => m.email && m.email.toLowerCase() === memberData.email.toLowerCase());
  const newMember = {
    id: memberData.id || ('mem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
    name: memberData.name.trim(),
    email: memberData.email.trim(),
    avatar: memberData.avatar || AVATARS_BY_SEX['Masculino'],
    role: memberData.role || 'editar', // 'editar', 'escribir', 'leer'
    allowedTabs: Array.isArray(memberData.allowedTabs) ? memberData.allowedTabs : ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones']
  };

  if (existingIdx >= 0) {
    proj.members[existingIdx] = Object.assign(proj.members[existingIdx], newMember);
  } else {
    proj.members.push(newMember);
  }

  saveProjectsList(list);
  return newMember;
}

export function removeProjectMember(projectId, memberId) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  const targetMember = proj.members.find(m => m.id === memberId);
  proj.members = proj.members.filter(m => m.id !== memberId);
  saveProjectsList(list);

  // También limpiar cualquier invitación pendiente asociada
  if (targetMember && targetMember.email) {
    const cleanTargetEmail = targetMember.email.toLowerCase().trim();
    const ownerEmail = (proj.ownerEmail || getCurrentUser()?.email || '').toLowerCase().trim();
    try {
      const invs = getStoredInvitations().filter(
        inv => !(inv.projectId === projectId && (inv.email || '').toLowerCase().trim() === cleanTargetEmail)
      );
      saveStoredInvitations(invs);
    } catch (e) {}

    // Si ya no pertenece a ningún otro proyecto de este propietario, limpiarlo también de las invitaciones de plan
    try {
      const stillInOtherProject = list.some(p =>
        p.id !== projectId &&
        (p.ownerEmail || '').toLowerCase().trim() === ownerEmail &&
        Array.isArray(p.members) &&
        p.members.some(m => (m.email || '').toLowerCase().trim() === cleanTargetEmail)
      );
      if (!stillInOtherProject) {
        const planInvs = getStoredPlanInvitations().filter(
          pi => !((pi.ownerEmail || '').toLowerCase().trim() === ownerEmail && (pi.email || '').toLowerCase().trim() === cleanTargetEmail)
        );
        saveStoredPlanInvitations(planInvs);
      }
    } catch (_) {}

    // Eliminar en Supabase PostgreSQL (public.proyecto_colaboradores)
    try {
      if (typeof window !== 'undefined' && typeof window.removeCollaboratorFromCloud === 'function') {
        window.removeCollaboratorFromCloud(projectId, targetMember.email);
      }
    } catch (_) {}

    // Notificar en tiempo real al usuario removido y a los demás colaboradores
    try {
      if (typeof window !== 'undefined' && typeof window.broadcastCollaboratorRemoved === 'function') {
        window.broadcastCollaboratorRemoved(projectId, targetMember.email);
      } else if (typeof window !== 'undefined' && window.CubikarRealtime?.broadcastCollaboratorRemoved) {
        window.CubikarRealtime.broadcastCollaboratorRemoved(projectId, targetMember.email);
      }
    } catch (_) {}
  }

  return true;
}

export function updateProjectMemberRole(projectId, memberId, newRole) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  const mem = proj.members.find(m => m.id === memberId);
  if (mem) {
    mem.role = newRole;
    saveProjectsList(list);
    try {
      const targetCloudId = proj.cloudId || proj.id;
      if (typeof window !== 'undefined' && mem.email) {
        if (typeof window.updateCollaboratorRoleInCloud === 'function') {
          window.updateCollaboratorRoleInCloud(targetCloudId, mem.email, newRole);
        } else if (typeof window.addCollaboratorToCloud === 'function') {
          window.addCollaboratorToCloud(targetCloudId, mem.email, newRole, mem.status === 'pending' ? 'pending' : 'accepted');
        }
      }
    } catch (_) {}
    return true;
  }
  return false;
}

// Actualizar pestañas permitidas para un miembro
export function updateProjectMemberTabs(projectId, memberId, allowedTabs) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  const mem = proj.members.find(m => m.id === memberId);
  if (mem) {
    mem.allowedTabs = Array.isArray(allowedTabs) ? allowedTabs : [];
    saveProjectsList(list);
    try {
      const targetCloudId = proj.cloudId || proj.id;
      if (typeof window !== 'undefined' && typeof window.syncProjectMemberTabsToCloud === 'function' && mem.email) {
        window.syncProjectMemberTabsToCloud(targetCloudId, mem.email, mem.allowedTabs);
      }
    } catch (_) {}
    return true;
  }
  return false;
}

// Actualizar los miembros asignados a una pestaña específica de este proyecto
export function setTabAssignedMembers(projectId, tabId, memberIds) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  const idSet = new Set(memberIds);
  const tabsMap = {};
  proj.members.forEach(m => {
    if (!Array.isArray(m.allowedTabs)) {
      m.allowedTabs = ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'];
    }
    if (idSet.has(m.id)) {
      if (!m.allowedTabs.includes(tabId)) {
        m.allowedTabs.push(tabId);
      }
    } else {
      m.allowedTabs = m.allowedTabs.filter(t => t !== tabId);
    }
    if (m.email) {
      tabsMap[m.email.toLowerCase().trim()] = m.allowedTabs;
    }
  });

  saveProjectsList(list);
  try {
    const targetCloudId = proj.cloudId || proj.id;
    if (typeof window !== 'undefined' && typeof window.syncProjectMemberTabsToCloud === 'function') {
      window.syncProjectMemberTabsToCloud(targetCloudId, tabsMap);
    }
  } catch (_) {}
  return true;
}

// Obtener los miembros de este proyecto asignados a una pestaña específica
export function getTabAssignedMembers(projectId, tabId) {
  const members = getProjectMembers(projectId);
  return members.filter(m => {
    if (!Array.isArray(m.allowedTabs)) return true;
    return m.allowedTabs.includes(tabId);
  });
}

// Eliminar proyecto definitivamente
export async function deleteProject(projectId) {
  if (!projectId) return false;

  const currentList = getProjectsList();
  const targetObj = currentList.find(p => p.id === projectId || p.cloudId === projectId);
  const cloudId = targetObj?.cloudId || null;

  markProjectDeleted(projectId);
  if (cloudId && cloudId !== projectId) {
    markProjectDeleted(cloudId);
  }

  const idsToClean = cloudId && cloudId !== projectId ? [projectId, cloudId] : [projectId];
  idsToClean.forEach(pid => {
    try {
      localStorage.removeItem(getSettingsKey(pid));
      localStorage.removeItem(getStorageKey(pid));
      localStorage.removeItem(`estimaciones_data_${pid}`);
      localStorage.removeItem(`expenses_control_${pid}`);
      localStorage.removeItem(`calendario_cfg_${pid}`);
      localStorage.removeItem(`calendario_workdays_${pid}`);
      localStorage.removeItem(`adm_arq_project_chat_${pid}`);
      localStorage.removeItem(`adm_const_project_chat_${pid}`);
      localStorage.removeItem(`adm_const_chat_${pid}`);
      localStorage.removeItem(`control_obra_chat_${pid}`);
      localStorage.removeItem(`adm_arq_signatures_${pid}`);
      localStorage.removeItem(`adm_arq_bitacora_${pid}`);
      localStorage.removeItem(`adm_arq_expenses_${pid}`);
      localStorage.removeItem(`adm_arq_suppliers_${pid}`);
      localStorage.removeItem(`adm_const_signatures_${pid}`);
      localStorage.removeItem(`adm_const_bitacora_${pid}`);
      localStorage.removeItem(`adm_const_expenses_${pid}`);
      localStorage.removeItem(`adm_const_suppliers_${pid}`);
    } catch (e) {}
  });

  // Purgar todas las invitaciones asociadas a este proyecto para que se limpien las notificaciones
  try {
    const currentInvs = getStoredInvitations();
    const cleanedInvs = currentInvs.filter(i => i.projectId !== projectId && (!cloudId || i.projectId !== cloudId));
    if (cleanedInvs.length !== currentInvs.length) {
      saveStoredInvitations(cleanedInvs);
    }
    const currentPlanInvs = getStoredPlanInvitations();
    const cleanedPlanInvs = currentPlanInvs.filter(pi => pi.projectId !== projectId && (!cloudId || pi.projectId !== cloudId));
    if (cleanedPlanInvs.length !== currentPlanInvs.length) {
      saveStoredPlanInvitations(cleanedPlanInvs);
    }
  } catch (_) {}

  // Refrescar campana de notificaciones
  try {
    if (typeof window !== 'undefined' && typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
  } catch (_) {}

  // 1. Limpiar proyecto de la lista en memoria y localStorage
  const list = currentList.filter(p => p.id !== projectId && p.cloudId !== projectId && (!cloudId || (p.id !== cloudId && p.cloudId !== cloudId)));
  saveProjectsList(list);

  // 2. Si el proyecto eliminado estaba activo en el workspace, resetearlo
  if (typeof getActiveProjectId === 'function' && (getActiveProjectId() === projectId || (cloudId && getActiveProjectId() === cloudId))) {
    if (typeof setActiveProjectId === 'function') setActiveProjectId(null);
  }

  // 3. Purgar del estado sincronizado del usuario en user_metadata (cubikar_cloud_state_v2) y persistir en Supabase Auth
  const user = getCurrentUser();
  const myEmail = (user?.email || '').toLowerCase().trim();
  const collabEmails = Array.isArray(targetObj?.members)
    ? targetObj.members.map(m => String(m?.email || '').toLowerCase().trim()).filter(Boolean)
    : [];
  if (user && user.user_metadata?.cubikar_cloud_state_v2) {
    const cs = user.user_metadata.cubikar_cloud_state_v2;
    let modified = false;
    if (Array.isArray(cs.ownedProjects) && cs.ownedProjects.length > 0) {
      cs.ownedProjects = [];
      modified = true;
    }
    if (Array.isArray(cs.collaboratedProjects) && cs.collaboratedProjects.length > 0) {
      cs.collaboratedProjects = [];
      modified = true;
    }
    const delIds = getDeletedProjectsList();
    const compactDelIds = Array.isArray(delIds) ? delIds.slice(-40) : [];
    const hadMoreDelIds = Array.isArray(cs.deletedProjectIds) && cs.deletedProjectIds.length > 40;
    cs.deletedProjectIds = compactDelIds;
    if (modified || hadMoreDelIds) {
      saveCurrentUser(user);
      try {
        if (typeof window !== 'undefined' && typeof window.markInternalCloudAuthUpdate === 'function') {
          window.markInternalCloudAuthUpdate();
        }
        const sb = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (sb && typeof sb.auth?.updateUser === 'function') {
          await sb.auth.updateUser({ data: { cubikar_cloud_state_v2: cs } });
        }
      } catch (_) {}
    }
  }

  // 4. Emitir evento en tiempo real para que todos los colaboradores y navegadores lo eliminen inmediatamente (<30ms)
  try {
    if (typeof window !== 'undefined' && window.CubikarRealtime?.broadcastProjectDeleted) {
      window.CubikarRealtime.broadcastProjectDeleted(projectId, myEmail);
      if (cloudId && cloudId !== projectId) window.CubikarRealtime.broadcastProjectDeleted(cloudId, myEmail);
    } else if (typeof window !== 'undefined' && typeof window.broadcastProjectDeleted === 'function') {
      window.broadcastProjectDeleted(projectId, myEmail);
      if (cloudId && cloudId !== projectId) window.broadcastProjectDeleted(cloudId, myEmail);
    }
  } catch (_) {}

  // 5. Registrar lápida (tombstone) y actualizar manifiesto de obras activas del anfitrión en Supabase
  try {
    if (typeof window !== 'undefined' && typeof window.recordDeletedProjectTombstone === 'function') {
      const tombOpts = { deletedByEmail: myEmail, collaboratorEmails: collabEmails };
      await window.recordDeletedProjectTombstone(projectId, targetObj?.ownerEmail || myEmail, tombOpts);
      if (cloudId && cloudId !== projectId) {
        await window.recordDeletedProjectTombstone(cloudId, targetObj?.ownerEmail || myEmail, tombOpts);
      }
    }
    if (myEmail && typeof window !== 'undefined' && typeof window.recordHostActiveManifest === 'function') {
      const myActiveIds = list.filter(p => (p.ownerEmail || '').toLowerCase().trim() === myEmail).map(p => p.cloudId || p.id);
      await window.recordHostActiveManifest(myEmail, myActiveIds);
    }
  } catch (_) {}

  // 6. Eliminar de la base de datos Supabase (con verificación de errores y lápida persistente)
  try {
    const delRes = await deleteProjectFromCloud(cloudId || projectId, {
      project: targetObj,
      cloudId,
      ownerEmail: targetObj?.ownerEmail || myEmail,
      deletedByEmail: myEmail,
      collaboratorEmails: collabEmails
    });
    if (delRes && delRes.success === false && delRes.error) {
      console.warn('[deleteProject] Error al eliminar fila en Supabase:', delRes.error);
    }
  } catch (err) {
    console.warn('[deleteProject] Aviso al eliminar en Supabase:', err);
  }

  // 7. Respaldar estado limpio a la nube inmediatamente
  try {
    if (typeof window !== 'undefined' && typeof window.triggerDebouncedCloudStateSync === 'function') {
      window.triggerDebouncedCloudStateSync(user);
    } else if (typeof window !== 'undefined' && typeof window.syncUserCollaborationToCloud === 'function') {
      await window.syncUserCollaborationToCloud(user);
    }
  } catch (_) {}

  return true;
}

// Sincronizar el resumen del proyecto activo
export function syncActiveProjectSummary(projectId, treeData, settings) {
  if (!projectId) return;
  const list = getProjectsList();
  const idx = list.findIndex(p => p.id === projectId);
  if (idx === -1) return;

  const f = settings.applySobrecosto ?
    (1 + ((parseFloat(settings.pctIndirectos) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctFinanciamiento) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctUtilidad) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctAdicionales) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctSegurosFianzas) || 0) / 100)) : 1.0;

  list[idx].companyName = settings.companyName || list[idx].companyName;
  list[idx].companyLogo = settings.companyLogo !== undefined ? settings.companyLogo : list[idx].companyLogo;
  list[idx].projectName = settings.projectName || list[idx].projectName;
  list[idx].projectLocation = settings.projectLocation || list[idx].projectLocation;
  list[idx].currency = settings.currency || list[idx].currency;
  list[idx].currencySymbol = settings.currencySymbol || list[idx].currencySymbol;
  if (settings.ivaPct !== undefined && !isNaN(Number(settings.ivaPct))) {
    list[idx].ivaPct = Number(settings.ivaPct);
  }
  list[idx].factorSobrecosto = f;
  list[idx].totalPresupuesto = calculateTreeTotal(treeData);
  list[idx].conceptCount = countTreeConcepts(treeData);
  list[idx].partidasCount = countTreePartidas(treeData);

  saveProjectsList(list);
}

// ==========================================
// GESTIÓN DE INVITACIONES Y PERMISOS DE PROYECTO
// ==========================================

export function getStoredInvitations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INVITATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveStoredInvitations(invitations) {
  try {
    localStorage.setItem(STORAGE_KEY_INVITATIONS, JSON.stringify(invitations || []));
  } catch (e) {}
}

// Obtener invitaciones pendientes para un usuario específico (por email)
export function getPendingInvitationsForUser(userEmail) {
  if (!userEmail) return [];
  const emailLower = userEmail.toLowerCase().trim();
  const allInvs = getStoredInvitations();
  const allProjects = getProjectsList();
  const deletedList = getDeletedProjectsList();
  const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);

  let dismissedSet = new Set();
  try {
    if (typeof localStorage !== 'undefined') {
      const rawDismissed = localStorage.getItem('cubikar_dismissed_notifications_v1');
      if (rawDismissed) {
        const parsed = JSON.parse(rawDismissed);
        if (Array.isArray(parsed)) dismissedSet = new Set(parsed);
      }
    }
  } catch (_) {}

  const results = [];
  const seenKeys = new Set();

  // 1. Invitaciones formales de proyectos
  allInvs.forEach(inv => {
    if (inv.status !== 'pending') return;
    if ((inv.email || '').toLowerCase().trim() !== emailLower) return;
    if (dismissedSet.has(`inv:${inv.id}`) || dismissedSet.has(`inv_proj:${inv.projectId}:${emailLower}`)) return;

    // Si el proyecto fue eliminado o marcado como eliminado, NO MOSTRAR
    if (isDeleted(inv.projectId)) return;

    // Si el proyecto ya no existe en la lista de proyectos válidos, NO MOSTRAR
    const targetProj = allProjects.find(p => p.id === inv.projectId || p.cloudId === inv.projectId);
    if (!targetProj) return;

    // Si el usuario ya es miembro activo y aceptado en el proyecto, la invitación ya no está pendiente
    if (Array.isArray(targetProj.members)) {
      const existingMember = targetProj.members.find(m => (m.email || '').toLowerCase().trim() === emailLower);
      if (existingMember && (existingMember.status === 'active' || existingMember.status === 'accepted')) {
        return;
      }
    }

    const key = (inv.projectId || '') + '|' + emailLower;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    results.push(inv);
  });

  // 2. Invitaciones al plan de suscripción almacenadas
  const planInvs = getStoredPlanInvitations();
  planInvs.forEach(pInv => {
    if (pInv.status !== 'pending') return;
    if ((pInv.email || '').toLowerCase().trim() !== emailLower) return;

    const hostEmail = (pInv.ownerEmail || '').toLowerCase().trim();
    // Proyectos activos no eliminados del anfitrión
    const hostProjects = allProjects.filter(p => 
      (p.ownerEmail || '').toLowerCase().trim() === hostEmail && 
      !isDeleted(p.id) && !isDeleted(p.cloudId)
    );

    if (hostProjects.length > 0) {
      hostProjects.forEach(hp => {
        if (Array.isArray(hp.members)) {
          const mem = hp.members.find(m => (m.email || '').toLowerCase().trim() === emailLower);
          if (mem && (mem.status === 'active' || mem.status === 'accepted')) return;
        }

        const synId = 'plan-inv-' + hp.id + '-' + pInv.id;
        if (dismissedSet.has(`inv:${synId}`) || dismissedSet.has(`inv:${pInv.id}`) || dismissedSet.has(`inv_proj:${hp.id}:${emailLower}`)) return;
        const key = hp.id + '|' + emailLower;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          results.push({
            id: synId,
            projectId: hp.id,
            projectName: hp.projectName,
            companyName: hp.companyName || '',
            ownerEmail: hostEmail,
            ownerName: resolveCleanHostName(hostEmail, pInv.ownerName || hp.ownerName, hp),
            ownerPlanId: pInv.ownerPlanId || 'free',
            email: emailLower,
            name: pInv.name,
            role: pInv.role || 'editar',
            status: 'pending',
            createdAt: pInv.invitedAt || new Date().toISOString()
          });
        }
      });
    }
  });

  return results;
}

// Crear o actualizar una invitación de proyecto
export function createProjectInvitation({ projectId, email, name, role = 'editar', allowedTabs = [], invitedBy = null, avatar = null }) {
  if (!projectId || !email) return null;
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj) return null;

  const invs = getStoredInvitations();
  const emailClean = email.trim().toLowerCase();

  // Eliminar invitaciones previas pendientes hacia este mismo email y proyecto
  const filteredInvs = invs.filter(i => !(i.projectId === projectId && (i.email || '').toLowerCase() === emailClean));

  const invId = 'inv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  const newInvitation = {
    id: invId,
    projectId,
    projectName: proj.projectName || 'Proyecto de Obra',
    companyName: proj.companyName || '',
    ownerEmail: (proj.ownerEmail || (invitedBy && invitedBy.email) || '').toLowerCase().trim(),
    ownerName: resolveCleanHostName((proj.ownerEmail || (invitedBy && invitedBy.email) || '').toLowerCase().trim(), proj.ownerName || (invitedBy && invitedBy.name), proj),
    ownerPlanId: proj.ownerPlanId || getProjectEffectivePlan(projectId) || 'free',
    email: emailClean,
    name: (name || emailClean.split('@')[0]).trim(),
    role: role || 'editar',
    allowedTabs: Array.isArray(allowedTabs) ? allowedTabs : ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'],
    invitedBy: invitedBy ? {
      name: invitedBy.name || 'Administrador',
      email: invitedBy.email || ''
    } : null,
    planId: getProjectEffectivePlan(projectId),
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  filteredInvs.unshift(newInvitation);
  saveStoredInvitations(filteredInvs);

  // Registrar también al miembro en el proyecto en estado 'pending'
  addProjectMember(projectId, {
    name: newInvitation.name,
    email: newInvitation.email,
    avatar: avatar || AVATARS_BY_SEX['Masculino'],
    role: newInvitation.role,
    allowedTabs: newInvitation.allowedTabs,
    status: 'pending'
  });

  // Sincronizar colaborador directamente a Supabase PostgreSQL (public.proyecto_colaboradores)
  try {
    if (typeof window !== 'undefined' && typeof window.addCollaboratorToCloud === 'function') {
      window.addCollaboratorToCloud(projectId, newInvitation.email, newInvitation.role, 'pending');
    }
  } catch (_) {}

  // Emitir broadcast en tiempo real vía WebSockets a otros usuarios conectados
  try {
    if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastNewInvitation === 'function') {
      const updatedProj = getProjectById(projectId);
      window.CubikarRealtime.broadcastNewInvitation(newInvitation, updatedProj);
    }
  } catch (e) {
    console.warn('[Realtime] Error emitiendo invitación:', e);
  }

  return newInvitation;
}

// Aceptar invitación a un proyecto o al plan de un anfitrión
export function acceptProjectInvitation(invitationId, currentUser = null) {
  const user = currentUser || getCurrentUser();
  const userEmail = (user?.email || '').toLowerCase().trim();

  const invs = getStoredInvitations();
  const planInvs = getStoredPlanInvitations();
  const list = getProjectsList();

  let targetInv = null;
  let targetPlanInv = null;
  let targetProjectId = null;
  let targetProjectName = null;

  // 1. Buscar en invitaciones formales de proyectos por ID exacto
  targetInv = invs.find(i => i.id === invitationId);

  // 2. Buscar en invitaciones al plan por ID exacto o coincidencia de sufijo
  if (!targetInv) {
    targetPlanInv = planInvs.find(pi => 
      pi.id === invitationId ||
      invitationId === `plan-inv-${pi.id}` ||
      (typeof invitationId === 'string' && (invitationId.endsWith(`-${pi.id}`) || invitationId.includes(pi.id)))
    );
  }

  // 3. Si la ID tiene prefijo 'plan-inv-{projId}-{planInvId}'
  if (!targetInv && typeof invitationId === 'string' && invitationId.startsWith('plan-inv-')) {
    const raw = invitationId.replace('plan-inv-', '');
    const foundProj = list.find(p => raw.startsWith(p.id));
    if (foundProj) {
      targetProjectId = foundProj.id;
      targetProjectName = foundProj.projectName;
      const restId = raw.replace(foundProj.id + '-', '');
      if (!targetPlanInv) {
        targetPlanInv = planInvs.find(pi => pi.id === restId || (pi.email || '').toLowerCase().trim() === userEmail);
      }
    }
  }

  // 4. Si aún no se encontró por ID, buscar la invitación pendiente por correo del usuario conectado
  if (!targetInv && !targetPlanInv && userEmail) {
    targetInv = invs.find(i => (i.email || '').toLowerCase().trim() === userEmail && i.status === 'pending');
    if (!targetInv) {
      targetPlanInv = planInvs.find(pi => (pi.email || '').toLowerCase().trim() === userEmail && pi.status === 'pending');
    }
  }

  // 5. Si aún no se encontró, buscar en miembros de proyectos si el usuario está registrado con status 'pending'
  if (!targetInv && !targetPlanInv && userEmail) {
    const projWithMember = list.find(p => 
      Array.isArray(p.members) && 
      p.members.some(m => (m.email || '').toLowerCase().trim() === userEmail && (m.status === 'pending' || m.id === invitationId))
    );
    if (projWithMember) {
      const mem = projWithMember.members.find(m => (m.email || '').toLowerCase().trim() === userEmail);
      if (mem) {
        mem.status = 'active';
        if (user) {
          mem.name = user.name || mem.name;
          mem.avatar = user.avatar || mem.avatar;
        }
        saveProjectsList(list);

        try {
          if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationAccepted === 'function') {
            window.CubikarRealtime.broadcastInvitationAccepted({
              id: invitationId,
              projectId: projWithMember.id,
              projectName: projWithMember.projectName,
              ownerEmail: projWithMember.ownerEmail,
              email: userEmail,
              name: user?.name || mem.name,
              role: mem.role || 'editar'
            }, user);
          }
        } catch (e) {}

        return { ok: true, projectId: projWithMember.id, projectName: projWithMember.projectName };
      }
    }
  }

  if (!targetInv && !targetPlanInv) {
    return { ok: false, error: 'Invitación no encontrada' };
  }

  // Aceptar Invitación Formal de Proyecto
  if (targetInv) {
    targetInv.status = 'accepted';
    targetInv.acceptedAt = new Date().toISOString();
    saveStoredInvitations(invs);

    targetProjectId = targetInv.projectId;
    targetProjectName = targetInv.projectName;

    const proj = list.find(p => p.id === targetInv.projectId);
    if (proj) {
      targetProjectName = proj.projectName;
      if (!Array.isArray(proj.members)) proj.members = [];
      const mem = proj.members.find(m => (m.email || '').toLowerCase().trim() === (targetInv.email || userEmail).toLowerCase().trim());
      if (mem) {
        mem.status = 'active';
        if (user) {
          mem.name = user.name || mem.name;
          mem.avatar = user.avatar || mem.avatar;
        }
      } else {
        proj.members.push({
          id: 'mem-' + Date.now(),
          name: user?.name || targetInv.name,
          email: targetInv.email || userEmail,
          avatar: user?.avatar || AVATARS_BY_SEX['Masculino'],
          role: targetInv.role || 'editar',
          allowedTabs: targetInv.allowedTabs || ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'],
          status: 'active'
        });
      }
      saveProjectsList(list);
    }

    // Actualizar colaborador en Supabase PostgreSQL (public.proyecto_colaboradores)
    try {
      if (targetInv && typeof window !== 'undefined' && typeof window.addCollaboratorToCloud === 'function') {
        const roleToUse = targetInv.role || targetPlanInv?.role || 'editar';
        if (targetProjectId) {
          window.addCollaboratorToCloud(targetProjectId, userEmail, roleToUse, 'accepted');
        }
        if (targetInv.ownerEmail) {
          const hostEm = (targetInv.ownerEmail || '').toLowerCase().trim();
          const hostProjects = list.filter(p => (p.ownerEmail || '').toLowerCase().trim() === hostEm);
          hostProjects.forEach(hp => {
            const cid = hp.cloudId || hp.id;
            if (cid && cid !== targetProjectId && hp.id === targetProjectId) {
              window.addCollaboratorToCloud(cid, userEmail, roleToUse, 'accepted');
            }
          });
        }
      }
    } catch (_) {}

    // Si también existía invitación de plan con este anfitrión, marcarla como aceptada
    if (targetInv.ownerEmail) {
      const hostEmail = (targetInv.ownerEmail || '').toLowerCase().trim();
      const pInv = planInvs.find(pi => (pi.ownerEmail || '').toLowerCase().trim() === hostEmail && (pi.email || '').toLowerCase().trim() === (targetInv.email || userEmail).toLowerCase().trim());
      if (pInv) {
        pInv.status = 'accepted';
        pInv.acceptedAt = new Date().toISOString();
        saveStoredPlanInvitations(planInvs);
      }
    }

    try {
      if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationAccepted === 'function') {
        window.CubikarRealtime.broadcastInvitationAccepted(targetInv, user);
      }
    } catch (e) {}

    return { ok: true, projectId: targetProjectId, projectName: targetProjectName || 'Proyecto de Obra' };
  }

  // Aceptar Invitación al Plan de Suscripción del Anfitrión
  if (targetPlanInv) {
    targetPlanInv.status = 'accepted';
    targetPlanInv.acceptedAt = new Date().toISOString();
    saveStoredPlanInvitations(planInvs);

    const hostEmail = (targetPlanInv.ownerEmail || '').toLowerCase().trim();
    const hostProjects = list.filter(p => (p.ownerEmail || '').toLowerCase().trim() === hostEmail);

    let assignedProj = null;
    if (targetProjectId) {
      assignedProj = hostProjects.find(p => p.id === targetProjectId);
    }
    if (!assignedProj && hostProjects.length > 0) {
      assignedProj = hostProjects[0];
    }

    // Agregar al usuario como miembro activo en todas las obras del anfitrión
    hostProjects.forEach(hp => {
      if (!Array.isArray(hp.members)) hp.members = [];
      const mem = hp.members.find(m => (m.email || '').toLowerCase().trim() === userEmail);
      if (mem) {
        mem.status = 'active';
        mem.role = targetPlanInv.role || 'editar';
        if (user) {
          mem.name = user.name || mem.name;
          mem.avatar = user.avatar || mem.avatar;
        }
      } else {
        hp.members.push({
          id: 'mem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          name: user?.name || targetPlanInv.name || userEmail.split('@')[0],
          email: userEmail,
          avatar: user?.avatar || AVATARS_BY_SEX['Masculino'],
          role: targetPlanInv.role || 'editar',
          allowedTabs: ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'],
          status: 'active'
        });
      }
    });
    if (hostProjects.length > 0) {
      saveProjectsList(list);
    }

    // Actualizar colaborador en Supabase PostgreSQL (public.proyecto_colaboradores)
    try {
      if (targetPlanInv && typeof window !== 'undefined' && typeof window.addCollaboratorToCloud === 'function') {
        const planRole = targetPlanInv.role || 'editar';
        if (targetProjectId) {
          window.addCollaboratorToCloud(targetProjectId, userEmail, planRole, 'accepted');
        }
        hostProjects.forEach(hp => {
          const cid = hp.cloudId || hp.id;
          if (cid) {
            window.addCollaboratorToCloud(cid, userEmail, planRole, 'accepted');
          }
        });
      }
    } catch (_) {}

    // Marcar como aceptadas las invitaciones correspondientes en getStoredInvitations()
    invs.forEach(i => {
      if ((i.ownerEmail || '').toLowerCase().trim() === hostEmail && (i.email || '').toLowerCase().trim() === userEmail) {
        i.status = 'accepted';
        i.acceptedAt = new Date().toISOString();
      }
    });
    saveStoredInvitations(invs);

    const finalProjId = assignedProj ? assignedProj.id : 'plan-access';
    const finalProjName = assignedProj ? assignedProj.projectName : `Espacio de ${targetPlanInv.ownerName || hostEmail}`;

    try {
      if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationAccepted === 'function') {
        window.CubikarRealtime.broadcastInvitationAccepted({
          id: targetPlanInv.id,
          projectId: finalProjId,
          projectName: finalProjName,
          ownerEmail: hostEmail,
          email: userEmail,
          name: user?.name || targetPlanInv.name,
          role: targetPlanInv.role || 'editar'
        }, user);
      }
    } catch (e) {}

    return { ok: true, projectId: finalProjId, projectName: finalProjName };
  }

  return { ok: false, error: 'Invitación no encontrada' };
}

// Rechazar o quitar invitación
export function rejectProjectInvitation(invitationId) {
  const user = getCurrentUser();
  const userEmail = (user?.email || '').toLowerCase().trim();

  let invs = getStoredInvitations();
  let planInvs = getStoredPlanInvitations();
  const list = getProjectsList();
  const targetId = String(invitationId || '').trim();
  if (!targetId || targetId === 'all') {
    return false;
  }

  let rejected = false;

  // 1. Buscar en invitaciones formales de proyectos únicamente por ID exacto
  const matchedInvs = invs.filter(i => i.id === targetId);

  if (matchedInvs.length > 0) {
    const matchedIds = new Set(matchedInvs.map(m => m.id));
    invs = invs.filter(i => !matchedIds.has(i.id));
    saveStoredInvitations(invs);
    rejected = true;

    matchedInvs.forEach(inv => {
      const invGuestEmail = (inv.email || inv.inviteeEmail || userEmail || '').toLowerCase().trim();
      if (inv.projectId) {
        const proj = list.find(p => p.id === inv.projectId || p.cloudId === inv.projectId);
        if (proj && Array.isArray(proj.members)) {
          proj.members = proj.members.filter(m => (m.email || '').toLowerCase().trim() !== invGuestEmail);
          saveProjectsList(list);
        }
        const cloudProjId = proj?.cloudId || inv.projectId;
        try {
          if (typeof window !== 'undefined' && typeof window.removeCollaboratorFromCloud === 'function' && invGuestEmail) {
            window.removeCollaboratorFromCloud(cloudProjId, invGuestEmail);
            if (inv.projectId !== cloudProjId) {
              window.removeCollaboratorFromCloud(inv.projectId, invGuestEmail);
            }
          }
        } catch (_) {}
        try {
          if (typeof window !== 'undefined' && typeof window.broadcastCollaboratorRemoved === 'function') {
            window.broadcastCollaboratorRemoved(inv.projectId, invGuestEmail);
          } else if (typeof window !== 'undefined' && window.CubikarRealtime?.broadcastCollaboratorRemoved) {
            window.CubikarRealtime.broadcastCollaboratorRemoved(inv.projectId, invGuestEmail);
          }
        } catch (_) {}
      }
      try {
        if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationRejected === 'function') {
          window.CubikarRealtime.broadcastInvitationRejected(inv, user);
        }
      } catch (e) {}
    });
  }

  // 2. Buscar en invitaciones al plan por ID exacto o prefijo estándar plan-inv-
  const planIdx = planInvs.findIndex(pi =>
    pi.id === targetId ||
    targetId === `plan-inv-${pi.id}` ||
    (typeof targetId === 'string' && targetId.startsWith('plan-inv-') && targetId.endsWith(`-${pi.id}`))
  );
  if (planIdx >= 0) {
    const pInv = planInvs[planIdx];
    planInvs.splice(planIdx, 1);
    saveStoredPlanInvitations(planInvs);
    rejected = true;

    const hostEmail = (pInv.ownerEmail || '').toLowerCase().trim();
    const guestEmail = (pInv.email || pInv.inviteeEmail || userEmail || '').toLowerCase().trim();
    list.forEach(p => {
      if ((p.ownerEmail || '').toLowerCase().trim() === hostEmail && Array.isArray(p.members)) {
        p.members = p.members.filter(m => (m.email || '').toLowerCase().trim() !== guestEmail || m.status !== 'pending');
        try {
          if (typeof window !== 'undefined' && typeof window.removeCollaboratorFromCloud === 'function' && guestEmail) {
            window.removeCollaboratorFromCloud(p.cloudId || p.id, guestEmail);
          }
        } catch (_) {}
      }
    });
    saveProjectsList(list);

    try {
      if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationRejected === 'function') {
        window.CubikarRealtime.broadcastInvitationRejected({ id: pInv.id, ownerEmail: hostEmail, email: guestEmail }, user);
      }
    } catch (e) {}
  }

  // 3. Si estaba en members de algún proyecto con status 'pending'
  if (!rejected && userEmail) {
    list.forEach(p => {
      if (Array.isArray(p.members)) {
        const memIdx = p.members.findIndex(m => (m.email || '').toLowerCase().trim() === userEmail && (m.status === 'pending' || m.id === targetId));
        if (memIdx >= 0) {
          p.members.splice(memIdx, 1);
          saveProjectsList(list);
          rejected = true;
          try {
            if (typeof window !== 'undefined' && typeof window.removeCollaboratorFromCloud === 'function') {
              window.removeCollaboratorFromCloud(p.cloudId || p.id, userEmail);
            }
          } catch (_) {}
        }
      }
    });
  }

  return rejected;
}

// Sincronizar y actualizar el plan de suscripción en todos los proyectos propiedad del usuario
export function syncOwnerProjectsPlan(ownerEmail, newPlanId) {
  if (!ownerEmail || !newPlanId) return false;
  const targetEmail = ownerEmail.toLowerCase().trim();
  const list = getProjectsList();
  let modified = false;

  list.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === targetEmail) {
      if (proj.ownerPlanId !== newPlanId) {
        proj.ownerPlanId = newPlanId;
        modified = true;
      }
    }
  });

  if (modified) {
    saveProjectsList(list);
  }
  return modified;
}

// Determinar el plan de suscripción aplicable al proyecto (hereda la suscripción del dueño)
export function getProjectEffectivePlan(projectId) {
  const proj = typeof projectId === 'object' ? projectId : getProjectById(projectId);
  if (!proj) return 'free';

  if (proj.ownerEmail) {
    const livePlan = getUserPlanId(proj.ownerEmail);
    if (livePlan && livePlan !== 'free') return livePlan;
  }

  if (proj.ownerPlanId) return proj.ownerPlanId;

  return getUserPlanId(proj.ownerEmail) || 'free';
}

// ==========================================
// LÍMITES POR PLAN DE SUSCRIPCIÓN
// ==========================================
export const PLAN_LIMITS = {
  free: {
    name: 'Gratuita',
    maxProjects: 2,
    maxConcepts: 15,
    maxMembers: 2,
    storageMb: 50,
    canInvite: true
  },
  plus: {
    name: 'Plus',
    maxProjects: 15,
    maxConcepts: 160,
    maxMembers: 5,
    storageMb: 1000,
    canInvite: true
  },
  pro: {
    name: 'Pro',
    maxProjects: 30,
    maxConcepts: 200,
    maxMembers: 20,
    storageMb: 2500,
    canInvite: true
  }
};

export function getPlanLimits(planId) {
  return PLAN_LIMITS[planId] || PLAN_LIMITS.free;
}

// Obtener plan del usuario (acepta objeto de usuario o correo electrónico directamente)
export function getUserPlanId(userOrEmail = null) {
  let cleanEmail = '';
  let u = null;

  if (typeof userOrEmail === 'string') {
    cleanEmail = userOrEmail.toLowerCase().trim();
  } else {
    u = userOrEmail || getCurrentUser();
    cleanEmail = (u?.email || '').toLowerCase().trim();
  }

  const activeUser = getCurrentUser();
  const activeEmail = (activeUser?.email || '').toLowerCase().trim();
  const isSelf = !cleanEmail || cleanEmail === activeEmail;

  // 1. Sincronizar directamente con getCurrentSubscription si está disponible para el usuario actual
  if (isSelf && typeof window !== 'undefined' && typeof window.getCurrentSubscription === 'function') {
    try {
      const winSub = window.getCurrentSubscription();
      if (winSub?.planId && winSub.planId !== 'free') {
        return winSub.planId;
      }
    } catch (_) {}
  }

  // 2. Almacenamiento específico por usuario
  if (cleanEmail && typeof localStorage !== 'undefined') {
    try {
      const rawArq = localStorage.getItem(`adm_arq_subscription_${cleanEmail}`);
      const rawConst = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
      const raw = rawArq || rawConst;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.planId) {
          if (u && typeof u === 'object') {
            if (!u.subscription) u.subscription = {};
            u.subscription.planId = parsed.planId;
          }
          return parsed.planId;
        }
      }
    } catch (e) {}
  }

  // 3. Si se consulta al usuario activo, revisar su objeto o clave global
  if (isSelf) {
    if (u && typeof u === 'object' && u?.subscription?.planId) {
      return u.subscription.planId;
    }
    if (activeUser?.subscription?.planId) {
      return activeUser.subscription.planId;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const globalRaw = localStorage.getItem('adm_arq_subscription') || localStorage.getItem('adm_const_subscription');
        if (globalRaw) {
          const parsedG = JSON.parse(globalRaw);
          if (parsedG?.planId && parsedG.planId !== 'free') return parsedG.planId;
        }
      } catch (_) {}
    }
  }

  // 4. Si se consulta a un anfitrión/otro usuario, buscar su plan efectivo en sus obras e invitaciones
  if (cleanEmail) {
    if (cleanEmail === 'hepc.90@gmail.com' || cleanEmail === 'admin.general@constructora.com') {
      return 'pro';
    }

    try {
      const allProjects = getProjectsList();
      const hostProj = allProjects.find(p => (p.ownerEmail || '').toLowerCase().trim() === cleanEmail && p.ownerPlanId);
      if (hostProj?.ownerPlanId) return hostProj.ownerPlanId;
    } catch (_) {}

    try {
      const invs = getStoredInvitations();
      const hostInv = invs.find(i => ((i.ownerEmail || '').toLowerCase().trim() === cleanEmail || (i.invitedBy?.email || '').toLowerCase().trim() === cleanEmail) && (i.ownerPlanId || i.planId));
      if (hostInv?.ownerPlanId) return hostInv.ownerPlanId;
      if (hostInv?.planId) return hostInv.planId;

      const planInvs = getStoredPlanInvitations();
      const hostPlanInv = planInvs.find(pi => (pi.ownerEmail || '').toLowerCase().trim() === cleanEmail && (pi.ownerPlanId || pi.planId));
      if (hostPlanInv?.ownerPlanId) return hostPlanInv.ownerPlanId;
      if (hostPlanInv?.planId) return hostPlanInv.planId;
    } catch (_) {}

    try {
      const reg = findRegisteredUserAccount(cleanEmail);
      if (reg?.subscription?.planId) return reg.subscription.planId;
      const preset = GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === cleanEmail);
      if (preset?.subscription?.planId) return preset.subscription.planId;
    } catch (_) {}
  }

  return 'free';
}

// Validar si el usuario puede crear proyectos según su plan y límites (en modo propio o bajo anfitrión)
export function canUserCreateProject(user = null, targetScope = null) {
  const u = user || getCurrentUser();
  if (!u || !u.email) return { allowed: false, reason: 'Debes iniciar sesión para crear proyectos.' };

  const uEmail = u.email.toLowerCase().trim();

  // Verificar si se está creando en el espacio de un anfitrión (Modo Anfitrión)
  const hostEmail = (targetScope && typeof targetScope === 'string' && targetScope.startsWith('owner:'))
    ? targetScope.replace('owner:', '').toLowerCase().trim()
    : null;

  if (hostEmail && hostEmail !== uEmail) {
    const allProjects = getProjectsList();
    const hostProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === hostEmail);

    let hostName = resolveCleanHostName(hostEmail, '', hostProjects[0] || null);
    const hostPlanId = getUserPlanId(hostEmail);
    let userHasEditorRole = false;

    // Buscar en proyectos del anfitrión donde este usuario es miembro activo
    for (const p of hostProjects) {
      if (p.ownerName && (!hostName || hostName === hostEmail)) hostName = resolveCleanHostName(hostEmail, p.ownerName, p);
      if (Array.isArray(p.members)) {
        const mem = p.members.find(m => (m.email || '').toLowerCase().trim() === uEmail && m.status !== 'pending');
        if (mem && mem.role === 'editar') {
          userHasEditorRole = true;
        }
      }
    }

    // Revisar invitaciones al plan de suscripción que hayan sido aceptadas
    const planInvs = getStoredPlanInvitations();
    const myPlanInv = planInvs.find(inv => 
      (inv.ownerEmail || '').toLowerCase().trim() === hostEmail && 
      (inv.email || '').toLowerCase().trim() === uEmail &&
      inv.status === 'accepted'
    );
    if (myPlanInv) {
      if (myPlanInv.ownerName && (!hostName || hostName === hostEmail)) hostName = resolveCleanHostName(hostEmail, myPlanInv.ownerName);
      if (myPlanInv.role === 'editar') userHasEditorRole = true;
    }

    // Revisar también invitaciones individuales a proyectos aceptadas
    const invitations = getStoredInvitations();
    const myInv = invitations.find(inv => 
      (inv.ownerEmail || '').toLowerCase().trim() === hostEmail && 
      (inv.email || '').toLowerCase().trim() === uEmail &&
      inv.status === 'accepted'
    );
    if (myInv) {
      if (myInv.ownerName && (!hostName || hostName === hostEmail)) hostName = resolveCleanHostName(hostEmail, myInv.ownerName);
      if (myInv.role === 'editar') userHasEditorRole = true;
    }

    // Solo el Administrador Maestro verificado tiene bypass global de creación sin rol en host
    const isVerifiedMaster = uEmail === 'hepc.90@gmail.com';
    if (isVerifiedMaster) {
      userHasEditorRole = true;
    }

    if (!userHasEditorRole) {
      return {
        allowed: false,
        reason: `Solo los colaboradores con rol de Editor pueden crear nuevos proyectos en la organización de ${hostName}. Tu rol actual no permite crear obras aquí.`,
        isHostContext: true,
        hostEmail,
        hostName,
        userRole: 'lector/escritor'
      };
    }

    const hostLimits = getPlanLimits(hostPlanId);
    const hostProjectsCount = hostProjects.length;

    if (hostProjectsCount >= hostLimits.maxProjects && !isVerifiedMaster) {
      return {
        allowed: false,
        reason: `El anfitrión (${hostName}) ha alcanzado el límite de ${hostLimits.maxProjects} proyectos activos para su Plan ${hostLimits.name}.`,
        planId: hostPlanId,
        maxProjects: hostLimits.maxProjects,
        currentProjects: hostProjectsCount,
        isHostContext: true,
        hostEmail,
        hostName
      };
    }

    return {
      allowed: true,
      planId: hostPlanId,
      maxProjects: hostLimits.maxProjects,
      currentProjects: hostProjectsCount,
      isHostContext: true,
      hostEmail,
      hostName
    };
  }

  // Modo Proyectos Propios: validar estrictamente contra la suscripción activa del usuario
  if (uEmail === 'hepc.90@gmail.com') {
    return { allowed: true, planId: 'pro', maxProjects: Infinity, currentProjects: 0, isHostContext: false };
  }

  const planId = getUserPlanId(u);
  const limits = getPlanLimits(planId);

  // Contar los proyectos propios creados por este usuario
  const allProjects = getProjectsList();
  const ownedProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === uEmail);
  const currentCount = ownedProjects.length;

  if (currentCount >= limits.maxProjects) {
    return {
      allowed: false,
      reason: `Has alcanzado el límite de ${limits.maxProjects} proyectos ejecutivos activos para tu suscripción ${limits.name}. Actualiza tu plan para crear más proyectos.`,
      planId,
      maxProjects: limits.maxProjects,
      currentProjects: currentCount,
      isHostContext: false
    };
  }

  return {
    allowed: true,
    planId,
    maxProjects: limits.maxProjects,
    currentProjects: currentCount,
    isHostContext: false
  };
}

export function isInvalidUserName(testName, oEmail = '', proj = null) {
  if (!testName || typeof testName !== 'string') return true;
  const clean = testName.trim().toLowerCase();
  if (!clean) return true;
  if (GENERIC_BLACKLIST.has(clean)) return true;
  if (clean === (oEmail || '').toLowerCase().trim()) return true;

  // Si coincide con el nombre de la empresa / constructora, es empresa y NO nombre de usuario
  if (proj?.companyName && clean === (proj.companyName || '').toLowerCase().trim()) return true;

  // Texto común de prueba / teclado
  const JUNK_NAMES = new Set([
    'dsad', 'dsadsa', 'asdasd', 'asdas', 'asdf', 'asdfg', 'qwerty', 'qwe',
    'test', 'prueba', 'demo', 'xyz', 'abc', 'aaa', 'bbb', 'ccc',
    'empresa', 'constructora', 'despacho', 'estudio'
  ]);
  if (JUNK_NAMES.has(clean)) return true;

  if (clean.length < 3) return true;
  if (!/[aeiouáéíóú]/i.test(clean)) return true;

  return false;
}

export function formatEmailToName(em) {
  if (!em || typeof em !== 'string') return 'Usuario';
  const clean = em.toLowerCase().trim();
  const preset = GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === clean);
  if (preset?.name && !isInvalidUserName(preset.name, clean)) return preset.name;
  return clean.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).trim();
}

export function resolveCleanHostName(oEmail, candidateName = '', proj = null, uEmail = '') {
  const cleanEmail = (oEmail || '').toLowerCase().trim();
  let name = (candidateName || '').trim();
  if (isInvalidUserName(name, cleanEmail, proj)) {
    name = '';
  }

  // 1. Revisar cuentas registradas locales o en la nube para este correo
  if (!name && cleanEmail) {
    try {
      const reg = findRegisteredUserAccount(cleanEmail);
      if (reg?.name && !isInvalidUserName(reg.name, cleanEmail, proj)) {
        name = reg.name.trim();
      }
    } catch (_) {}
  }

  // 2. Revisar cuentas preset de Google
  if (!name && cleanEmail) {
    const preset = GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === cleanEmail);
    if (preset?.name && !isInvalidUserName(preset.name, cleanEmail, proj)) {
      name = preset.name.trim();
    }
  }

  // 3. Revisar en los miembros de la obra si el anfitrión está con su nombre personal
  if (!name && proj && Array.isArray(proj.members)) {
    const ownerMember = proj.members.find(m => (m.email || '').toLowerCase().trim() === cleanEmail);
    if (ownerMember?.name && !isInvalidUserName(ownerMember.name, cleanEmail, proj)) {
      name = ownerMember.name.trim();
    }
  }

  // 4. Revisar invitaciones de obra donde conste el nombre del anfitrión
  if (!name && cleanEmail) {
    try {
      const invs = getStoredInvitations();
      const foundInv = invs.find(i =>
        ((i.ownerEmail || '').toLowerCase().trim() === cleanEmail || (i.invitedBy?.email || '').toLowerCase().trim() === cleanEmail) &&
        (!uEmail || (i.email || '').toLowerCase().trim() === uEmail)
      );
      if (foundInv?.invitedBy?.name && !isInvalidUserName(foundInv.invitedBy.name, cleanEmail, proj)) {
        name = foundInv.invitedBy.name.trim();
      } else if (foundInv?.ownerName && !isInvalidUserName(foundInv.ownerName, cleanEmail, proj)) {
        name = foundInv.ownerName.trim();
      }
    } catch (_) {}
  }

  // 5. Revisar invitaciones al plan
  if (!name && cleanEmail) {
    try {
      const pInvs = getStoredPlanInvitations();
      const foundPInv = pInvs.find(pi =>
        (pi.ownerEmail || '').toLowerCase().trim() === cleanEmail &&
        (!uEmail || (pi.email || '').toLowerCase().trim() === uEmail)
      );
      if (foundPInv?.ownerName && !isInvalidUserName(foundPInv.ownerName, cleanEmail, proj)) {
        name = foundPInv.ownerName.trim();
      }
    } catch (_) {}
  }

  // 6. Fallback limpio derivado del correo
  if (!name || isInvalidUserName(name, cleanEmail, proj)) {
    name = formatEmailToName(cleanEmail);
  }

  return name;
}

// Obtener lista de anfitriones/organizaciones que han invitado al usuario
export function getWorkspaceInviters(user = null, allProjectsList = null) {
  const u = user || getCurrentUser();
  if (!u || !u.email) return [];
  const uEmail = u.email.toLowerCase().trim();
  const userProjects = allProjectsList || getProjectsForUser(u);

  const map = new Map();

  // 1. Revisar obras activas (no eliminadas) donde el usuario es miembro activo/aceptado
  const allProjects = Array.isArray(userProjects) ? userProjects : [];
  allProjects.forEach(p => {
    if (!p || isProjectMarkedDeleted(p.id) || (p.cloudId && isProjectMarkedDeleted(p.cloudId))) {
      return;
    }
    // Excluir obras de muestra predeterminadas
    if (p.isSample || p.id === 'proj-opus-casa-laura' || p.id === 'proj-default-01' || p.id === 'proj-demo-02' || (typeof p.id === 'string' && p.id.startsWith('proj-demo'))) {
      return;
    }

    const oEmail = (p.ownerEmail || '').toLowerCase().trim();
    if (!oEmail || oEmail === uEmail || SYSTEM_EXCLUDED_EMAILS.has(oEmail)) {
      return;
    }

    if (Array.isArray(p.members)) {
      const mem = p.members.find(m => {
        const mEmail = (m.email || '').toLowerCase().trim();
        const mStatus = (m.status || '').toLowerCase().trim();
        return mEmail === uEmail && (mStatus === 'active' || mStatus === 'accepted' || !mStatus);
      });
      if (mem) {
        if (!map.has(oEmail)) {
          const hostName = resolveCleanHostName(oEmail, p.ownerName, p, uEmail);
          const planId = getUserPlanId(oEmail) || p.ownerPlanId || 'free';
          const planLimits = getPlanLimits(planId);

          map.set(oEmail, {
            email: oEmail,
            name: hostName,
            companyName: p.companyName || '',
            planId: planId,
            planName: planLimits.name,
            maxProjects: planLimits.maxProjects,
            maxMembers: planLimits.maxMembers,
            count: 0,
            isEditor: false,
            roles: new Set()
          });
        }

        const entry = map.get(oEmail);
        entry.count++;

        if (mem.role) {
          entry.roles.add(mem.role);
          if (mem.role === 'editar') {
            entry.isEditor = true;
          }
        }
      }
    }
  });

  // 2. Enriquecer roles con invitaciones aceptadas al plan de suscripción, pero SOLO para anfitriones con al menos 1 obra activa
  const planInvs = getStoredPlanInvitations();
  planInvs.forEach(pInv => {
    const oEmail = (pInv.ownerEmail || '').toLowerCase().trim();
    const guestEmail = (pInv.email || '').toLowerCase().trim();
    if (guestEmail === uEmail && oEmail && oEmail !== uEmail && !SYSTEM_EXCLUDED_EMAILS.has(oEmail) && pInv.status === 'accepted') {
      if (map.has(oEmail)) {
        const entry = map.get(oEmail);
        if (pInv.role === 'editar') entry.isEditor = true;
        entry.roles.add(pInv.role || 'editar');
      }
    }
  });

  // Filtrar para devolver únicamente anfitriones con al menos 1 proyecto activo (no eliminado) donde el usuario es miembro activo/aceptado
  return Array.from(map.entries())
    .filter(([ownerKey, inv]) => {
      if (!inv || inv.count <= 0) return false;
      return allProjects.some(p => {
        if (!p || isProjectMarkedDeleted(p.id) || (p.cloudId && isProjectMarkedDeleted(p.cloudId))) return false;
        if (p.isSample || p.id === 'proj-opus-casa-laura' || p.id === 'proj-default-01' || p.id === 'proj-demo-02' || (typeof p.id === 'string' && p.id.startsWith('proj-demo'))) return false;
        if ((p.ownerEmail || '').toLowerCase().trim() !== ownerKey) return false;
        return Array.isArray(p.members) && p.members.some(m => {
          const mEmail = (m?.email || '').toLowerCase().trim();
          const status = (m?.status || '').toLowerCase().trim();
          return mEmail === uEmail && (status === 'active' || status === 'accepted' || !status);
        });
      });
    })
    .map(([, inv]) => {
      let myRoleDisplay = 'Leer';
      if (inv.isEditor) {
        myRoleDisplay = 'Editor';
      } else if (inv.roles.has('escribir')) {
        myRoleDisplay = 'Escribir';
      }
      return {
        ...inv,
        roles: Array.from(inv.roles),
        myRoleDisplay
      };
    });
}

// Validar si el usuario puede invitar a colaboradores a un proyecto específico
export function canUserInviteToProject(projectId, user = null) {
  const u = user || getCurrentUser();
  if (!u || !u.email) return { allowed: false, reason: 'Debes iniciar sesión.' };

  if ((u.email || '').toLowerCase().trim() === 'hepc.90@gmail.com') {
    return { allowed: true, maxMembers: Infinity, currentMembers: 0 };
  }

  const proj = getProjectById(projectId);
  if (!proj) return { allowed: false, reason: 'Proyecto no encontrado.' };

  const uEmail = u.email.toLowerCase().trim();
  const isOwner = (proj.ownerEmail || '').toLowerCase().trim() === uEmail;

  // Si no es el dueño, verificar si es miembro con rol 'editar' (Editor)
  let isEditor = false;
  if (Array.isArray(proj.members)) {
    const mem = proj.members.find(m => (m.email || '').toLowerCase().trim() === uEmail && m.status !== 'pending');
    if (mem && mem.role === 'editar') {
      isEditor = true;
    }
  }

  if (!isOwner && !isEditor) {
    return {
      allowed: false,
      reason: 'Solo el creador del proyecto o colaboradores con rol de Editor pueden invitar nuevos usuarios.'
    };
  }

  // Verificar el límite de colaboradores según el plan de la obra (heredado del creador)
  const effectivePlanId = getProjectEffectivePlan(projectId);
  const limits = getPlanLimits(effectivePlanId);
  const members = Array.isArray(proj.members) ? proj.members : [];
  const currentMembersCount = members.length;

  if (currentMembersCount >= limits.maxMembers) {
    return {
      allowed: false,
      reason: `Este proyecto ha alcanzado el límite de ${limits.maxMembers} colaboradores permitidos en el Plan ${limits.name}. Para invitar a más colaboradores, actualiza la suscripción de la obra.`,
      planId: effectivePlanId,
      maxMembers: limits.maxMembers,
      currentMembers: currentMembersCount
    };
  }

  return {
    allowed: true,
    planId: effectivePlanId,
    maxMembers: limits.maxMembers,
    currentMembers: currentMembersCount
  };
}

// Determinar el rol del usuario en un proyecto
export function getUserRoleInProject(projectId, user = null) {
  const u = user || getCurrentUser();
  if (!u || !u.email) return null;

  const proj = getProjectById(projectId);
  if (!proj) return null;

  const uEmail = u.email.toLowerCase().trim();
  if (proj.ownerEmail && proj.ownerEmail.toLowerCase().trim() === uEmail) {
    return 'owner'; // Dueño / Creador
  }

  if (Array.isArray(proj.members)) {
    const mem = proj.members.find(m => (m.email || '').toLowerCase().trim() === uEmail && m.status !== 'pending');
    if (mem && mem.role) return mem.role;
  }

  try {
    const allPlanInvs = getStoredPlanInvitations();
    const planInv = allPlanInvs.find(inv =>
      (inv.ownerEmail || '').toLowerCase().trim() === (proj.ownerEmail || '').toLowerCase().trim() &&
      (inv.email || '').toLowerCase().trim() === uEmail &&
      inv.status !== 'pending'
    );
    if (planInv && planInv.role) {
      return planInv.role;
    }
  } catch (_) {}

  return null;
}

// Determinar si el usuario actual tiene permisos de edición (escritura/eliminación) en el proyecto
export function canCurrentUserEditProject(projectId = null, user = null) {
  const u = user || getCurrentUser();
  const pId = projectId || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null);
  const proj = pId ? getProjectById(pId) : null;

  if (!u || !u.email) {
    return !proj || !proj.ownerEmail;
  }

  if (!pId || !proj) {
    return getProjectsList().length === 0;
  }

  const uEmail = (u.email || '').toLowerCase().trim();
  const ownerEmail = (proj.ownerEmail || '').toLowerCase().trim();
  if (!ownerEmail || ownerEmail === uEmail) {
    return true;
  }

  const role = getUserRoleInProject(pId, u);
  if (!role) return false;
  if (role === 'owner' || role === 'editar' || role === 'escribir') return true;
  const normalizedRole = String(role).toLowerCase().trim();
  if (normalizedRole === 'editar' || normalizedRole === 'escribir' || normalizedRole === 'editor' || normalizedRole === 'escritura') return true;
  if (normalizedRole === 'leer' || normalizedRole === 'lector' || normalizedRole === 'view' || normalizedRole === 'viewer') return false;
  return false;
}

// ==========================================
// GESTIÓN DE INVITACIONES AL PLAN DE SUSCRIPCIÓN
// ==========================================
export function getStoredPlanInvitations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLAN_INVITATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveStoredPlanInvitations(invitations) {
  try {
    localStorage.setItem(STORAGE_KEY_PLAN_INVITATIONS, JSON.stringify(invitations || []));
  } catch (e) {}
}

export function getPlanCollaboratorsForOwner(ownerEmail) {
  if (!ownerEmail) return [];
  const oEmail = ownerEmail.toLowerCase().trim();
  const allPlanInvs = getStoredPlanInvitations();
  const map = new Map();

  allPlanInvs.forEach(inv => {
    if ((inv.ownerEmail || '').toLowerCase().trim() === oEmail) {
      const email = (inv.email || '').toLowerCase().trim();
      if (email && !map.has(email)) {
        map.set(email, {
          id: inv.id,
          name: inv.name || email.split('@')[0],
          email: email,
          role: inv.role || 'editar',
          status: inv.status || 'pending',
          avatar: inv.avatar || AVATARS_BY_SEX['Masculino'],
          invitedAt: inv.invitedAt || new Date().toISOString(),
          isPlanDirect: true
        });
      }
    }
  });

  const allProjects = getProjectsList();
  allProjects.forEach(p => {
    if ((p.ownerEmail || '').toLowerCase().trim() === oEmail && Array.isArray(p.members)) {
      p.members.forEach(m => {
        const mEmail = (m.email || '').toLowerCase().trim();
        if (mEmail && mEmail !== oEmail) {
          if (!map.has(mEmail)) {
            map.set(mEmail, {
              id: m.id || ('mem-' + mEmail),
              name: m.name || mEmail.split('@')[0],
              email: mEmail,
              role: m.role || 'editar',
              status: m.status || 'active',
              avatar: m.avatar || AVATARS_BY_SEX['Masculino'],
              invitedAt: m.invitedAt || new Date().toISOString(),
              isPlanDirect: false
            });
          }
        }
      });
    }
  });

  const result = Array.from(map.values()).filter(inv => {
    const n = (inv.name || '').toLowerCase().trim();
    const em = (inv.email || '').toLowerCase().trim();
    if (!n || GENERIC_BLACKLIST.has(n)) return false;
    if (SYSTEM_EXCLUDED_EMAILS.has(em)) return false;
    if (n.includes('sistema de control') || n.includes('sistema de arquitectura')) return false;
    return true;
  });

  return result;
}

export function canUserInviteToPlan(user = null) {
  const u = user || getCurrentUser();
  if (!u || !u.email) return { allowed: false, reason: 'Debes iniciar sesión para invitar usuarios a tu plan.' };

  if ((u.email || '').toLowerCase().trim() === 'hepc.90@gmail.com') {
    return {
      allowed: true,
      planId: 'pro',
      planName: 'Pro',
      maxMembers: Infinity,
      currentMembers: 0,
      remaining: Infinity
    };
  }

  const planId = getUserPlanId(u);
  const limits = getPlanLimits(planId);
  const currentCollaborators = getPlanCollaboratorsForOwner(u.email);
  const currentCount = currentCollaborators.length;

  if (currentCount >= limits.maxMembers) {
    return {
      allowed: false,
      reason: `Has alcanzado el límite de ${limits.maxMembers} usuarios permitidos en tu suscripción ${limits.name}. Actualiza tu plan para invitar más miembros.`,
      planId,
      planName: limits.name,
      maxMembers: limits.maxMembers,
      currentMembers: currentCount,
      remaining: 0
    };
  }

  return {
    allowed: true,
    planId,
    planName: limits.name,
    maxMembers: limits.maxMembers,
    currentMembers: currentCount,
    remaining: limits.maxMembers - currentCount
  };
}

export function createPlanInvitation({ email, name, role = 'editar', avatar = null, user = null }) {
  if (!email) return { ok: false, error: 'Debes indicar un correo electrónico válido.' };

  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) {
    return { ok: false, error: 'Usuario no autenticado.' };
  }

  const check = canUserInviteToPlan(currentUser);
  if (!check.allowed) {
    return { ok: false, error: check.reason, limitReached: true };
  }

  const cleanEmail = email.trim().toLowerCase();
  const ownerEmail = currentUser.email.toLowerCase().trim();

  if (cleanEmail === ownerEmail) {
    return { ok: false, error: 'No puedes invitarte a ti mismo a tu propio plan.' };
  }

  const planId = getUserPlanId(currentUser);
  const planLimits = getPlanLimits(planId);
  const invs = getStoredPlanInvitations();

  const filtered = invs.filter(i => !(
    (i.ownerEmail || '').toLowerCase().trim() === ownerEmail &&
    (i.email || '').toLowerCase().trim() === cleanEmail
  ));

  const invId = 'plan-inv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  const newInv = {
    id: invId,
    ownerEmail: ownerEmail,
    ownerName: currentUser.name || 'Anfitrión',
    ownerPlanId: planId,
    ownerPlanName: planLimits.name,
    email: cleanEmail,
    name: name || cleanEmail.split('@')[0],
    role: role || 'editar',
    avatar: avatar || AVATARS_BY_SEX['Masculino'],
    status: 'pending',
    invitedAt: new Date().toISOString()
  };

  filtered.push(newInv);
  saveStoredPlanInvitations(filtered);

  // Vincular también a los proyectos propios para que aparezca en el equipo con acceso
  const allProjects = getProjectsList();
  let modifiedProjects = false;
  allProjects.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === ownerEmail) {
      if (!Array.isArray(proj.members)) proj.members = [];
      const existing = proj.members.find(m => (m.email || '').toLowerCase().trim() === cleanEmail);
      if (!existing) {
        proj.members.push({
          id: 'mem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          name: newInv.name,
          email: cleanEmail,
          avatar: newInv.avatar,
          role: newInv.role,
          allowedTabs: ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'],
          status: 'pending'
        });
        modifiedProjects = true;
      }
    }
  });

  if (modifiedProjects) {
    saveProjectsList(allProjects);
  }

  // Generar invitaciones en getStoredInvitations() para cada proyecto propio del anfitrión y emitir broadcast
  const allStoredInvs = getStoredInvitations();
  allProjects.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === ownerEmail) {
      const exists = allStoredInvs.some(i => i.projectId === proj.id && (i.email || '').toLowerCase().trim() === cleanEmail);
      if (!exists) {
        const pInvEntry = {
          id: 'inv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          projectId: proj.id,
          projectName: proj.projectName || 'Proyecto de Obra',
          companyName: proj.companyName || '',
          ownerEmail: ownerEmail,
          ownerName: currentUser.name || 'Anfitrión',
          ownerPlanId: planId,
          email: cleanEmail,
          name: newInv.name,
          role: newInv.role,
          allowedTabs: ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones'],
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        allStoredInvs.unshift(pInvEntry);

        try {
          if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastNewInvitation === 'function') {
            window.CubikarRealtime.broadcastNewInvitation(pInvEntry, proj);
          }
        } catch (e) {}
      }
    }
  });
  saveStoredInvitations(allStoredInvs);

  return { ok: true, invitation: newInv };
}

export function removePlanCollaborator(collaboratorEmail, user = null) {
  if (!collaboratorEmail) return false;
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;

  const ownerEmail = currentUser.email.toLowerCase().trim();
  const targetEmail = collaboratorEmail.toLowerCase().trim();

  const invs = getStoredPlanInvitations().filter(i => !(
    (i.ownerEmail || '').toLowerCase().trim() === ownerEmail &&
    (i.email || '').toLowerCase().trim() === targetEmail
  ));
  saveStoredPlanInvitations(invs);

  // Remover también de los proyectos del anfitrión y sincronizar en Supabase
  const allProjects = getProjectsList();
  let modified = false;
  allProjects.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === ownerEmail && Array.isArray(proj.members)) {
      const prevLen = proj.members.length;
      proj.members = proj.members.filter(m => (m.email || '').toLowerCase().trim() !== targetEmail);
      if (proj.members.length !== prevLen) modified = true;
      try {
        const cid = proj.cloudId || proj.id;
        if (cid && typeof window !== 'undefined') {
          window.removeCollaboratorFromCloud?.(cid, targetEmail);
          window.broadcastCollaboratorRemoved?.(cid, targetEmail) || window.CubikarRealtime?.broadcastCollaboratorRemoved?.(cid, targetEmail);
        }
      } catch (_) {}
    }
  });

  if (modified) saveProjectsList(allProjects);
  return true;
}

export function updatePlanCollaboratorRole(collaboratorEmail, newRole, user = null) {
  if (!collaboratorEmail || !newRole) return false;
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;

  const ownerEmail = currentUser.email.toLowerCase().trim();
  const targetEmail = collaboratorEmail.toLowerCase().trim();

  // 1. Actualizar en invitaciones persistentes al plan de suscripción
  const planInvs = getStoredPlanInvitations();
  let planInvsModified = false;
  planInvs.forEach(inv => {
    if ((inv.ownerEmail || '').toLowerCase().trim() === ownerEmail &&
        (inv.email || '').toLowerCase().trim() === targetEmail) {
      inv.role = newRole;
      planInvsModified = true;
    }
  });
  if (planInvsModified) {
    saveStoredPlanInvitations(planInvs);
  }

  // 2. Actualizar en invitaciones pendientes a proyectos de este anfitrión
  const projInvs = getStoredInvitations();
  let projInvsModified = false;
  projInvs.forEach(inv => {
    if ((inv.ownerEmail || '').toLowerCase().trim() === ownerEmail &&
        (inv.email || '').toLowerCase().trim() === targetEmail) {
      inv.role = newRole;
      projInvsModified = true;
    }
  });
  if (projInvsModified) {
    saveStoredInvitations(projInvs);
  }

  // 3. Actualizar en los miembros de todos los proyectos propiedad del dueño y sincronizar en Supabase
  const allProjects = getProjectsList();
  let projectsModified = false;
  allProjects.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === ownerEmail && Array.isArray(proj.members)) {
      proj.members.forEach(m => {
        if ((m.email || '').toLowerCase().trim() === targetEmail) {
          m.role = newRole;
          projectsModified = true;
          try {
            const cid = proj.cloudId || proj.id;
            if (cid && typeof window !== 'undefined') {
              if (typeof window.updateCollaboratorRoleInCloud === 'function') {
                window.updateCollaboratorRoleInCloud(cid, targetEmail, newRole);
              } else if (typeof window.addCollaboratorToCloud === 'function') {
                window.addCollaboratorToCloud(cid, targetEmail, newRole, m.status === 'pending' ? 'pending' : 'accepted');
              }
            }
          } catch (_) {}
        }
      });
    }
  });
  if (projectsModified) {
    saveProjectsList(allProjects);
  }

  return true;
}

// ==========================================
// UTILIDADES DE CÁLCULO PARA EL RESUMEN
// ==========================================
export function calculateTreeTotal(nodes) {
  if (!Array.isArray(nodes)) return 0;
  return nodes.reduce((sum, n) => sum + calculateNodeTotal(n), 0);
}

function calculateNodeTotal(node) {
  if (!node) return 0;
  const cant = Number(node.cantidad) || 0;
  if (Array.isArray(node.cotizaciones) && node.cotizaciones.length > 0) {
    const winner = node.cotizaciones.find(c => Boolean(c.isGanador));
    return winner ? Math.round(((cant * (Number(winner.monto) || 0)) + Number.EPSILON) * 100) / 100 : 0;
  }
  if (!node.children || node.children.length === 0) {
    const pu = Number(node.precioUnitario) || 0;
    return cant * pu;
  }
  return node.children.reduce((acc, c) => acc + calculateNodeTotal(c), 0);
}

export function countTreeConcepts(nodes) {
  if (!Array.isArray(nodes)) return 0;
  let count = 0;
  function traverse(list) {
    list.forEach(n => {
      if (!n.children || n.children.length === 0) count++;
      else traverse(n.children);
    });
  }
  traverse(nodes);
  return count;
}

export function countTreePartidas(nodes) {
  if (!Array.isArray(nodes)) return 0;
  let count = 0;
  function traverse(list) {
    list.forEach(n => {
      if (n.children && n.children.length > 0) {
        count++;
        traverse(n.children);
      }
    });
  }
  traverse(nodes);
  return count;
}


// ==========================================
// GESTIÓN DE ESPACIO DE TRABAJO ACTIVO
// ==========================================
export function setActiveWorkspaceData(ownerEmail, ownerName = '') {
  try {
    if (typeof localStorage !== 'undefined') {
      const payload = {
        ownerEmail: (ownerEmail || '').toLowerCase().trim(),
        ownerName: ownerName || ownerEmail || '',
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY_ACTIVE_WORKSPACE, JSON.stringify(payload));
    }
  } catch (e) {
    console.error('Error guardando active workspace:', e);
  }
}

export function getActiveWorkspaceData() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_WORKSPACE);
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch (_) {
          if (typeof raw === 'string' && raw.startsWith('owner:')) {
            return { ownerEmail: raw.replace('owner:', '').trim(), ownerName: '' };
          }
        }
      }
    }
  } catch (e) {}
  const u = getCurrentUser();
  return {
    ownerEmail: (u?.email || '').toLowerCase().trim(),
    ownerName: u?.name || u?.email || ''
  };
}

// ==========================================
// RESOLUCIÓN UNIFICADA DE PLAN Y RESTRICCIONES POR SUSCRIPCIÓN
// ==========================================
export function resolveWorkspacePlanContext(projectIdOverride = null) {
  const currentUser = getCurrentUser();
  const currentEmail = (currentUser?.email || '').toLowerCase().trim();
  const projectId = projectIdOverride || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null);
  const proj = projectId ? getProjectById(projectId) : null;
  const activeWs = getActiveWorkspaceData();

  let ownerEmail = currentEmail;
  if (proj && proj.ownerEmail) {
    ownerEmail = proj.ownerEmail.toLowerCase().trim();
  } else if (activeWs && activeWs.ownerEmail) {
    ownerEmail = activeWs.ownerEmail.toLowerCase().trim();
  }

  let planId = 'free';
  if (proj) {
    planId = getProjectEffectivePlan(proj.id) || 'free';
  } else if (ownerEmail) {
    planId = getUserPlanId(ownerEmail) || 'free';
    if (ownerEmail === currentEmail && typeof window !== 'undefined' && typeof window.getCurrentSubscription === 'function') {
      try {
        const activeSub = window.getCurrentSubscription();
        if (activeSub?.planId) planId = activeSub.planId;
      } catch (_) {}
    }
  }

  return {
    projectId: proj?.id || projectId || null,
    project: proj || null,
    ownerEmail,
    planId,
    limits: getPlanLimits(planId),
    currentUserEmail: currentEmail
  };
}
