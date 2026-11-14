// js/core/authService.js
// Servicio de Autenticación integrado con Supabase Auth y tabla public.perfiles

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { getCurrentUser, saveCurrentUser, markSessionOpen, saveRegisteredUserAccount } from '../modules/portal/projectService.js';

const GOOGLE_CLIENT_ID = '1097638023851-36b44hlrj7fgslfcmqlvf77dk89h7eus.apps.googleusercontent.com';
const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';

let googleGsiLoadPromise = null;
let activeGoogleNoncePair = null;

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function createGoogleNoncePair() {
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues || !window.crypto?.subtle) {
    throw new Error('Tu navegador no soporta criptografía segura para iniciar sesión con Google.');
  }
  const randomBytes = new Uint8Array(24);
  window.crypto.getRandomValues(randomBytes);
  const rawNonce = bytesToHex(randomBytes);
  const encoded = new TextEncoder().encode(rawNonce);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  const hashedNonce = bytesToHex(new Uint8Array(digest));
  return { rawNonce, hashedNonce };
}

export async function ensureGoogleGsiScript(timeoutMs = 8000) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Google Sign-In requiere un navegador activo.');
  }
  if (window.google?.accounts?.id) {
    return window.google.accounts.id;
  }
  if (!googleGsiLoadPromise) {
    googleGsiLoadPromise = new Promise((resolve, reject) => {
      const startTime = Date.now();
      let scriptEl = document.querySelector(`script[src^="${GOOGLE_GSI_SRC}"]`);
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.src = GOOGLE_GSI_SRC;
        scriptEl.async = true;
        scriptEl.defer = true;
        document.head.appendChild(scriptEl);
      }

      const cleanup = () => {
        if (pollId) clearInterval(pollId);
      };

      scriptEl.addEventListener('error', () => {
        cleanup();
        googleGsiLoadPromise = null;
        reject(new Error('No se pudo cargar Google Sign-In. Verifica tu conexión o bloqueadores.'));
      }, { once: true });

      const pollId = setInterval(() => {
        if (window.google?.accounts?.id) {
          cleanup();
          resolve(window.google.accounts.id);
        } else if (Date.now() - startTime >= timeoutMs) {
          cleanup();
          googleGsiLoadPromise = null;
          reject(new Error('Google Sign-In tardó demasiado en responder.'));
        }
      }, 100);
    });
  }
  return googleGsiLoadPromise;
}

/**
 * Registro con Correo Electrónico y Contraseña
 */
export async function signUp({ email, password, fullName }) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName
      }
    }
  });

  if (error) throw error;
  return data;
}

/**
 * Inicio de sesión con Correo Electrónico y Contraseña
 */
export async function signInWithPassword({ email, password }) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  const perfil = await fetchUserProfile(data.user.id);
  syncLocalUserSession(data.user, perfil, true);

  return { session: data.session, user: data.user, perfil };
}

/**
 * Inicio de sesión mediante Google (OAuth)
 */
export async function signInWithGoogle() {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

  let cleanRedirect = window.location.href.split('#')[0].split('?')[0];
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    cleanRedirect = 'http://localhost:3000/index.html';
  }

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: cleanRedirect
    }
  });

  if (error) throw error;
  if (data?.url && typeof window !== 'undefined') {
    window.location.href = data.url;
  }
  return data;
}

/**
 * Autenticación directa con ID Token de Google (evita redirect /auth/v1/callback)
 */
export async function signInWithGoogleIdToken({ idToken, rawNonce }) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está configurado para iniciar sesión con Google.');
  }
  if (!idToken) {
    throw new Error('Google no devolvió un token de identidad válido.');
  }

  const payload = {
    provider: 'google',
    token: idToken
  };
  if (rawNonce) {
    payload.nonce = rawNonce;
  }

  const { data, error } = await sb.auth.signInWithIdToken(payload);
  if (error) throw error;

  let perfil = null;
  if (data?.user?.id) {
    try {
      perfil = await fetchUserProfile(data.user.id);
    } catch (_) {}
    await syncLocalUserSession(data.user, perfil, true);
  }

  return {
    user: data?.user || null,
    session: data?.session || null,
    perfil,
    localUser: getCurrentUser()
  };
}

/**
 * Monta el botón oficial de Google Identity Services con nonce SHA-256
 */
export async function mountGoogleSignInButton({
  container,
  fallbackBtn = null,
  forceRefresh = false,
  onStart = null,
  onSuccess = null,
  onError = null
}) {
  if (!container) return false;

  try {
    const googleId = await ensureGoogleGsiScript();
    if (forceRefresh || !activeGoogleNoncePair) {
      activeGoogleNoncePair = await createGoogleNoncePair();
    }
    const { hashedNonce } = activeGoogleNoncePair;
    const rawWidth = container.getBoundingClientRect?.().width
      || container.parentElement?.getBoundingClientRect?.().width
      || 340;
    const buttonWidth = Math.max(220, Math.min(380, Math.floor(rawWidth || 340)));

    googleId.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashedNonce,
      ux_mode: 'popup',
      context: 'signin',
      auto_select: false,
      itp_support: true,
      callback: async (response) => {
        const usedRawNonce = activeGoogleNoncePair?.rawNonce || null;
        activeGoogleNoncePair = null;
        if (!response?.credential) {
          const credErr = new Error('No se recibió una credencial válida de Google.');
          if (typeof onError === 'function') onError(credErr);
          return;
        }
        try {
          if (typeof onStart === 'function') onStart();
          const result = await signInWithGoogleIdToken({
            idToken: response.credential,
            rawNonce: usedRawNonce
          });
          if (typeof onSuccess === 'function') await onSuccess(result);
        } catch (err) {
          if (typeof document !== 'undefined' && document.body.contains(container)) {
            mountGoogleSignInButton({
              container,
              fallbackBtn,
              forceRefresh: true,
              onStart,
              onSuccess,
              onError
            }).catch(() => {});
          }
          if (typeof onError === 'function') onError(err);
        }
      }
    });

    container.innerHTML = '';
    googleId.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      locale: 'es',
      width: buttonWidth
    });
    container.classList.remove('hidden');
    if (fallbackBtn) {
      fallbackBtn.classList.add('hidden');
    }
    return true;
  } catch (err) {
    console.warn('[Google GIS] No se pudo renderizar el botón oficial:', err);
    container.classList.add('hidden');
    if (fallbackBtn) {
      fallbackBtn.classList.remove('hidden');
    }
    return false;
  }
}

/**
 * Cierre de sesión seguro
 */
export async function signOut() {
  activeGoogleNoncePair = null;
  try {
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  } catch (_) {}
  const sb = getSupabaseClient();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch (_) {}
  }
  saveCurrentUser(null);
}

/**
 * Recuperación de contraseña por Email
 */
export async function resetPasswordForEmail(email) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

  const { data, error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}#reset-password`
  });

  if (error) throw error;
  return data;
}

/**
 * Obtener perfil completo y empresa asociada desde la base de datos
 */
export async function fetchUserProfile(userId) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return null;

  try {
    const { data, error } = await sb
      .from('perfiles')
      .select(`
        id,
        nombre_completo,
        email,
        avatar_url,
        rol,
        empresa_id,
        empresas (
          id,
          nombre,
          plan,
          estado_suscripcion,
          logo_url
        )
      `)
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('[Supabase Auth] Perfil no encontrado:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[Supabase Auth] Error al obtener perfil:', err);
    return null;
  }
}

/**
 * Sincroniza la sesión con el estado local del portal
 */
export function syncLocalUserSession(user, perfil, force = false) {
  if (!user) return;
  const current = getCurrentUser();
  if (!force && current && current.email && user.email && current.email.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
    console.info('[Supabase Auth] Sesión remota difiere del usuario activo local, respetando usuario activo actual.');
    return;
  }
  const rawAvatar = perfil?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || '';
  const initial = (perfil?.nombre_completo || user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'U').charAt(0).toUpperCase();
  const fallbackAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%230284c7'/%3E%3Ctext x='50' y='64' font-size='42' font-family='Arial,sans-serif' font-weight='bold' fill='white' text-anchor='middle'%3E${initial}%3C/text%3E%3C/svg%3E`;

  const cleanEmail = (user.email || '').toLowerCase().trim();
  let userSub = null;
  const userSubRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(`adm_const_subscription_${cleanEmail}`) : null;
  if (userSubRaw) {
    try {
      userSub = JSON.parse(userSubRaw);
    } catch (_) {}
  }
  if (!userSub) {
    userSub = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
  }

  const localUser = {
    subscription: userSub,
    id: user.id,
    name: perfil?.nombre_completo || user.user_metadata?.full_name || user.user_metadata?.name || user.email,
    email: user.email,
    avatar: rawAvatar || fallbackAvatar,
    role: perfil?.rol || 'admin',
    empresaId: perfil?.empresa_id || null,
    plan: perfil?.empresas?.plan || 'free',
    estadoSuscripcion: perfil?.empresas?.estado_suscripcion || 'trialing'
  };
  saveCurrentUser(localUser);
  try {
    saveRegisteredUserAccount(localUser);
    markSessionOpen(localUser.email || localUser);
  } catch (e) {}
  return localUser;
}

/**
 * Listener global de eventos de autenticación
 */
export function initAuthListener(onAuthChangeCallback) {
  const sb = getSupabaseClient();
  if (!sb) return;

  sb.auth.onAuthStateChange(async (event, session) => {
    console.info(`[Supabase Auth] Evento: ${event}`);
    if (session?.user) {
      const isExplicitLogin = (event === 'SIGNED_IN' || event === 'USER_UPDATED');
      const perfil = await fetchUserProfile(session.user.id);
      syncLocalUserSession(session.user, perfil, isExplicitLogin);
      if (onAuthChangeCallback) onAuthChangeCallback(event, session, perfil);
    } else {
      if (onAuthChangeCallback) onAuthChangeCallback(event, null, null);
    }
  });
}
