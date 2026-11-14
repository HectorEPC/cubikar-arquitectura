// js/modules/portal/subscriptionModal.js
// Gestión integral de Planes de Suscripción del Usuario: Gratuita, Plus y Pro

import {
  getCurrentUser,
  saveCurrentUser,
  getLastKnownUser,
  syncOwnerProjectsPlan,
  findRegisteredUserAccount,
  saveRegisteredUserAccount,
  addFeaturedProfile
} from './projectService.js';
import { showToast } from '../../ui/notifications.js';
import { isNightMode } from '../../ui/themeController.js';

export const STORAGE_KEY_SUBSCRIPTION = 'adm_const_subscription';

// Migración de compatibilidad: Asegurar que el plan quede ligado a la cuenta que lo compró
// y eliminar la clave global compartida para que no se filtre a otras cuentas ni a nuevos registros.
try {
  if (typeof localStorage !== 'undefined') {
    const legacyRaw = localStorage.getItem(STORAGE_KEY_SUBSCRIPTION);
    if (legacyRaw) {
      const curr = getCurrentUser();
      const em = (curr?.email || '').toLowerCase().trim();
      if (em && !localStorage.getItem(`adm_const_subscription_${em}`)) {
        localStorage.setItem(`adm_const_subscription_${em}`, legacyRaw);
      }
      localStorage.removeItem(STORAGE_KEY_SUBSCRIPTION);
    }
  }
} catch (_) {}

// Enlaces oficiales de Stripe Checkout (Modo Prueba) vinculados a tu cuenta
export const STRIPE_PAYMENT_LINKS = {
  plus: {
    monthly: 'https://buy.stripe.com/test_28E00ifDR5Sh4Jhbpe3Je00',
    annual: 'https://buy.stripe.com/test_4gMfZg63hgwVa3B9h63Je01'
  },
  pro: {
    monthly: 'https://buy.stripe.com/test_fZu7sK63hcgF1x564U3Je02',
    annual: 'https://buy.stripe.com/test_dRm3cuajx3K97Vt1OE3Je03'
  }
};

export const SUBSCRIPTION_PLANS = [
  {
    id: 'free',
    name: 'Gratuita',
    badge: 'INICIAL',
    tagline: 'Ideal para conocer la plataforma y gestionar proyectos ejecutivos pequeños.',
    monthlyPrice: 0,
    annualPrice: 0,
    originalMonthlyPrice: null,
    originalAnnualPrice: null,
    currency: 'MXN',
    periodLabel: 'Siempre gratis',
    icon: 'fa-solid fa-seedling',
    popular: false,
    accent: 'slate',
    dropdownBadgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    limits: {
      maxProjects: 2,
      maxConcepts: 15,
      maxMembers: 2,
      storageMb: 50
    },
    features: [
      'Hasta 2 proyectos ejecutivos activos',
      'Hasta 15 conceptos entregables por obra',
      'Hasta 2 colaboradores incluidos bajo la misma cuenta',
      '50 MB en servidor (con compresor de imágenes para PDF a ~150 KB por foto)',
      'Árbol de Alcances (planos arquitectónicos, memorias y estudios)',
      'Catálogo Base y Presupuesto de Honorarios esenciales',
      'Copiado de conceptos y partidas entre proyectos',
      'Explosión básica de insumos de proyecto',
      'Cronograma de Planeación con Diagrama de Gantt básico',
      'Impresión institucional básica con carátula de proyecto',
      'Subida de notas y cotizaciones básicas',
      'Importador universal (Excel, CSV, JSON y Opus)',
      'Vista de Día y Modo Nocturno'
    ]
  },
  {
    id: 'plus',
    name: 'Plus',
    badge: 'MÁS POPULAR',
    tagline: 'Para arquitectos, despachos y proyectistas que coordinan equipo y entregas pre-construcción.',
    monthlyPrice: 199,
    annualPrice: 159,
    originalMonthlyPrice: 499,
    originalAnnualPrice: 499,
    discountBadge: '60% OFF',
    currency: 'MXN',
    periodLabel: '/ mes',
    icon: 'fa-solid fa-bolt',
    popular: true,
    accent: 'blue',
    dropdownBadgeClass: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
    limits: {
      maxProjects: 15,
      maxConcepts: 160,
      maxMembers: 5,
      storageMb: 1000
    },
    features: [
      '100% DE LAS FUNCIONES Y MÓDULOS ACTIVOS',
      'Hasta 15 proyectos ejecutivos activos',
      'Hasta 160 conceptos entregables por obra',
      'Hasta 5 colaboradores incluidos con roles (Editor, Escribir, Leer)',
      '1,000 MB (1 GB) de almacenamiento en servidor',
      'Seguimiento de Revisiones de Planos (Pendiente, En Revisión, Aprobado)',
      'Calendario de Planeación con Ruta Crítica (CPM) y Festivos oficiales de México',
      'Programa Financiero de Proyecto y Curva "S"',
      'Módulo de Cobranza de Honorarios con amortización al 100% e IVA',
      'Módulo de Especialistas e Ingenierías Externas',
      'Control de Contratos y Pagos a Especialistas',
      'Resumen Ejecutivo de Flujo de Caja (Cash Flow)',
      'Expediente Documental y Fotográfico (facturas PDF/XML y cotizaciones)',
      'Chat de Proyecto por Partida y Plano en tiempo real',
      'Bloqueo y Seguridad de Pestañas con Contraseña',
      'Logotipo y Membrete Oficial de tu despacho en PDF y Excel (sin marcas de agua)',
      'Importador universal avanzado (Excel, CSV, JSON, Opus y Neodata)'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'EMPRESARIAL / MULTIDISCIPLINARIO',
    tagline: 'Máxima capacidad y escala para firmas de arquitectura, ingenierías y gerencias.',
    monthlyPrice: 499,
    annualPrice: 399,
    originalMonthlyPrice: 1099,
    originalAnnualPrice: 1099,
    discountBadge: '55% OFF',
    currency: 'MXN',
    periodLabel: '/ mes',
    icon: 'fa-solid fa-crown',
    popular: false,
    accent: 'amber',
    dropdownBadgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
    limits: {
      maxProjects: 30,
      maxConcepts: 200,
      maxMembers: 20,
      storageMb: 2500
    },
    features: [
      '100% DE LAS FUNCIONES Y MÓDULOS ACTIVOS CON MÁXIMA ESCALA',
      'Hasta 30 proyectos ejecutivos activos',
      'Hasta 200 conceptos entregables por obra',
      'Hasta 20 colaboradores incluidos bajo la misma empresa',
      '2,500 MB (2.5 GB) de almacenamiento en servidor',
      'Seguimiento de Revisiones de Planos con firmas y peritajes',
      'Calendario Ejecutivo con Ruta Crítica, Curva "S" y suspensiones',
      'Programa Financiero de Proyecto avanzado',
      'Cobranza de Honorarios Multi-Etapa con retenciones fiscales',
      'Gestión Integral de Especialistas, Calculistas y DRO',
      'Control de Contratos, Anticipos y Saldos a Especialistas',
      'Flujo de Caja del Despacho (Cash Flow: Cobrado vs Pagado)',
      'Expediente Documental y Generadores Fotográficos masivos',
      'Chat Colaborativo en tiempo real por partida',
      'Bloqueo y Seguridad de Pestañas con Contraseña',
      'Personalización corporativa total con firmas y membretes',
      'Importador y exportador institucional masivo (Opus y Neodata)',
      'Soporte prioritario y sincronización respaldada en la nube'
    ]
  }
];

let activeBillingCycle = 'monthly'; // 'monthly' | 'annual'

export function getPlanById(planId) {
  return SUBSCRIPTION_PLANS.find(p => p.id === planId) || SUBSCRIPTION_PLANS[0];
}

export function getCurrentSubscription() {
  try {
    const user = getCurrentUser();
    if (user?.email && typeof localStorage !== 'undefined') {
      const cleanEmail = user.email.toLowerCase().trim();
      const raw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const validPlan = getPlanById(parsed?.planId);
        return {
          planId: validPlan.id,
          billingCycle: parsed?.billingCycle === 'annual' ? 'annual' : 'monthly',
          updatedAt: parsed?.updatedAt || null
        };
      }
    }

    if (user && user.subscription && user.subscription.planId) {
      const validPlan = getPlanById(user.subscription.planId);
      return {
        planId: validPlan.id,
        billingCycle: user.subscription.billingCycle === 'annual' ? 'annual' : 'monthly',
        updatedAt: user.subscription.updatedAt || null
      };
    }
  } catch (e) {
    // Fallback seguro a plan Gratuita
  }

  return {
    planId: 'free',
    billingCycle: 'monthly',
    updatedAt: null
  };
}

export function saveSubscription(planId, billingCycle = activeBillingCycle) {
  const validPlan = getPlanById(planId);
  const normalizedCycle = billingCycle === 'annual' ? 'annual' : 'monthly';
  const payload = {
    planId: validPlan.id,
    billingCycle: normalizedCycle,
    updatedAt: new Date().toISOString()
  };

  try {
    if (typeof localStorage !== 'undefined') {
      // Guardar de forma estricta y permanente para el usuario específico que compró el plan
      const user = getCurrentUser();
      if (user?.email) {
        localStorage.setItem(`adm_const_subscription_${user.email.toLowerCase().trim()}`, JSON.stringify(payload));
      }
    }
  } catch (e) {}

  try {
    const user = getCurrentUser();
    if (user) {
      user.subscription = payload;
      saveCurrentUser(user);
      const cleanEmail = (user.email || '').toLowerCase().trim();
      if (cleanEmail) {
        try {
          const regUser = findRegisteredUserAccount(cleanEmail);
          if (regUser) {
            regUser.subscription = payload;
            saveRegisteredUserAccount(regUser);
          } else {
            saveRegisteredUserAccount(user);
          }
          addFeaturedProfile(user);
        } catch (_) {}
        try {
          syncOwnerProjectsPlan(cleanEmail, validPlan.id);
        } catch (_) {}
      }
    }
  } catch (e) {}

  return payload;
}

export function updateSubscriptionBadgesUI() {
  if (typeof document === 'undefined') return;
  const sub = getCurrentSubscription();
  const plan = getPlanById(sub.planId);

  const dropdownBadge = document.getElementById('dropdown-user-plan-badge');
  if (dropdownBadge) {
    dropdownBadge.textContent = plan.name;
    dropdownBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${plan.dropdownBadgeClass}`;
  }

  const portalDropdownBadge = document.getElementById('portal-dropdown-user-plan-badge');
  if (portalDropdownBadge) {
    portalDropdownBadge.textContent = plan.name;
    portalDropdownBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${plan.dropdownBadgeClass}`;
  }

  const profileModalBadge = document.getElementById('profile-modal-plan-badge');
  if (profileModalBadge) {
    profileModalBadge.textContent = `Plan ${plan.name}`;
  }

  const headerActiveBadge = document.getElementById('subscription-header-active-badge');
  if (headerActiveBadge) {
    headerActiveBadge.textContent = `Plan actual: ${plan.name}`;
  }
}

function updateBillingCycleToggleUI() {
  if (typeof document === 'undefined') return;
  const btnMonthly = document.getElementById('btn-sub-cycle-monthly');
  const btnAnnual = document.getElementById('btn-sub-cycle-annual');
  const night = isNightMode();

  if (btnMonthly) {
    btnMonthly.className = activeBillingCycle === 'monthly'
      ? (night
        ? 'px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm transition cursor-pointer'
        : 'px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-sm border border-slate-200 transition cursor-pointer')
      : (night
        ? 'px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer'
        : 'px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer');
  }

  if (btnAnnual) {
    btnAnnual.className = activeBillingCycle === 'annual'
      ? (night
        ? 'px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm transition cursor-pointer flex items-center gap-1.5'
        : 'px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-sm border border-slate-200 transition cursor-pointer flex items-center gap-1.5')
      : (night
        ? 'px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center gap-1.5'
        : 'px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer flex items-center gap-1.5');
  }
}

export function renderSubscriptionCards() {
  if (typeof document === 'undefined') return;
  const grid = document.getElementById('subscription-plans-grid');
  if (!grid) return;

  const currentSub = getCurrentSubscription();
  const night = isNightMode();

  updateBillingCycleToggleUI();
  updateSubscriptionBadgesUI();

  grid.innerHTML = SUBSCRIPTION_PLANS.map(plan => {
    const isCurrent = currentSub.planId === plan.id;
    const isAnnual = activeBillingCycle === 'annual';
    const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
    const origPrice = isAnnual ? plan.originalAnnualPrice : plan.originalMonthlyPrice;
    const hasDiscount = Boolean(origPrice && origPrice > price);
    const annualTotal = plan.annualPrice * 12;

    // Estilos adaptativos según nivel de suscripción y modo visual (Día / Nocturno)
    let cardBorder = night ? 'border-slate-700/90 bg-slate-900/90' : 'border-slate-200 bg-white';
    let badgeClasses = night ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-slate-100 text-slate-700 border border-slate-200';
    let iconBoxClasses = night ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'bg-emerald-50 text-emerald-600 border border-emerald-200';
    let checkIconColor = 'text-emerald-500';
    let actionBtnClasses = '';
    let actionBtnLabel = '';

    if (plan.id === 'plus') {
      cardBorder = night
        ? 'border-blue-500/80 bg-slate-900 ring-2 ring-blue-500/25 shadow-xl'
        : 'border-blue-500 bg-white ring-2 ring-blue-500/15 shadow-lg';
      badgeClasses = 'bg-blue-600 text-white border border-blue-500 shadow-2xs';
      iconBoxClasses = night
        ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
        : 'bg-blue-50 text-blue-600 border border-blue-200';
      checkIconColor = night ? 'text-blue-400' : 'text-blue-600';
    } else if (plan.id === 'pro') {
      cardBorder = night
        ? 'border-amber-500/70 bg-slate-900/95 shadow-xl'
        : 'border-amber-400 bg-white shadow-md';
      badgeClasses = night
        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
        : 'bg-amber-100 text-amber-800 border border-amber-300';
      iconBoxClasses = night
        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
        : 'bg-amber-50 text-amber-600 border border-amber-200';
      checkIconColor = night ? 'text-amber-400' : 'text-amber-600';
    }

    if (isCurrent) {
      actionBtnClasses = night
        ? 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 flex items-center justify-center gap-1.5 cursor-default'
        : 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center justify-center gap-1.5 cursor-default';
      actionBtnLabel = `<i class="fa-solid fa-circle-check"></i><span>Plan Actual Activo</span>`;
    } else if (plan.id === 'plus') {
      actionBtnClasses = 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer';
      actionBtnLabel = `<i class="fa-solid fa-bolt text-[11px]"></i><span>Elegir Plan Plus</span>`;
    } else if (plan.id === 'pro') {
      actionBtnClasses = 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:scale-98 text-slate-950 shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer';
      actionBtnLabel = `<i class="fa-solid fa-crown text-[11px]"></i><span>Elegir Plan Pro</span>`;
    } else {
      actionBtnClasses = night
        ? 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition flex items-center justify-center gap-1.5 cursor-pointer'
        : 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer';
      actionBtnLabel = `<span>Cambiar a Gratuita</span>`;
    }

    const billingSubtext = plan.id === 'free'
      ? 'Siempre gratis, sin tarjeta'
      : (isAnnual
        ? `Facturado al año: $${annualTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN - Ahorras 20%`
        : 'Facturación mensual flexible • Cancela cuando quieras');

    return `
      <div class="relative rounded-2xl border-2 p-5 flex flex-col justify-between transition duration-200 ${cardBorder}" data-plan-card="${plan.id}">
        <div>
          <!-- Fila Superior: Icono + Nombre + Etiqueta -->
          <div class="flex items-start justify-between gap-2 mb-3">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0 ${iconBoxClasses}">
                <i class="${plan.icon}"></i>
              </div>
              <div>
                <h4 class="font-extrabold text-base leading-tight ${night ? 'text-slate-100' : 'text-slate-900'}">${plan.name}</h4>
                <span class="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClasses}">
                  ${isCurrent ? 'ACTIVO' : plan.badge}
                </span>
              </div>
            </div>
            ${hasDiscount ? `
              <span class="text-[9.5px] font-black px-2 py-0.5 rounded-md ${
                plan.id === 'pro'
                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
              } flex items-center gap-1 shadow-2xs shrink-0">
                <i class="fa-solid fa-fire text-[9px]"></i> ${isAnnual ? `${plan.discountBadge} • -20%` : plan.discountBadge}
              </span>
            ` : ''}
          </div>

          <!-- Descripción corta -->
          <p class="text-xs leading-relaxed mb-4 ${night ? 'text-slate-300' : 'text-slate-600'}">
            ${plan.tagline}
          </p>

          <!-- Bloque de Precio -->
          <div class="p-3.5 rounded-xl mb-4 border ${night ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200/80'}">
            ${hasDiscount ? `
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-xs font-semibold line-through text-slate-400">
                  $${origPrice.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                </span>
                <span class="text-[9.5px] font-black px-1.5 py-0.5 rounded-sm bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  ${isAnnual ? 'Ahorras 20% anual' : `Ahorras $${(origPrice - price).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${plan.periodLabel}`}
                </span>
              </div>
            ` : ''}
            <div class="flex items-baseline gap-1">
              <span class="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
                plan.id === 'pro'
                  ? (night ? 'text-amber-400' : 'text-amber-600')
                  : (plan.id === 'plus' ? (night ? 'text-blue-400' : 'text-blue-600') : (night ? 'text-white' : 'text-slate-900'))
              }">
                $${price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span class="text-xs font-bold ${night ? 'text-slate-400' : 'text-slate-500'}">
                ${plan.currency} ${plan.periodLabel}
              </span>
            </div>
            ${hasDiscount ? `
              <div class="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-500">
                <i class="fa-solid fa-bolt text-[9px]"></i>
                <span>Precio especial de lanzamiento</span>
              </div>
            ` : ''}
            <p class="text-[10px] mt-1 font-medium ${night ? 'text-slate-400' : 'text-slate-500'}">
              ${billingSubtext}
            </p>
          </div>

          <!-- Lista de Beneficios -->
          <div class="space-y-2 mb-5">
            <span class="block text-[10px] font-bold uppercase tracking-wider ${night ? 'text-slate-400' : 'text-slate-500'}">
              Incluye:
            </span>
            <ul class="space-y-2 text-xs">
              ${plan.features.map(feat => `
                <li class="flex items-start gap-2 ${night ? 'text-slate-200' : 'text-slate-700'}">
                  <i class="fa-solid fa-check ${checkIconColor} mt-0.5 text-[11px] shrink-0"></i>
                  <span class="leading-snug">${feat}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>

        <!-- Botón de Selección -->
        <div class="pt-3 border-t ${night ? 'border-slate-800' : 'border-slate-100'}">
          <button type="button"
                  ${isCurrent ? 'disabled' : `onclick="selectSubscriptionPlan('${plan.id}')"`}
                  class="${actionBtnClasses}">
            ${actionBtnLabel}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

export function openSubscriptionModal() {
  if (typeof document === 'undefined') return;
  const sub = getCurrentSubscription();
  activeBillingCycle = sub.billingCycle || 'monthly';

  renderSubscriptionCards();

  const modal = document.getElementById('modal-suscripcion-usuario');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

export function closeSubscriptionModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-suscripcion-usuario');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function setSubscriptionBillingCycle(cycle) {
  activeBillingCycle = cycle === 'annual' ? 'annual' : 'monthly';
  const current = getCurrentSubscription();
  saveSubscription(current.planId, activeBillingCycle);
  renderSubscriptionCards();
}

export function selectSubscriptionPlan(planId) {
  if (planId === 'free') {
    saveSubscription('free', activeBillingCycle);
    renderSubscriptionCards();
    updateSubscriptionBadgesUI();
    try {
      if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
        window.refreshProjectsGridUI();
      }
    } catch (_) {}
    showToast(`\u{2728} Plan Gratuito activo`);
    return;
  }

  const cycle = activeBillingCycle === 'annual' ? 'annual' : 'monthly';
  const checkoutUrl = STRIPE_PAYMENT_LINKS[planId]?.[cycle];

  if (checkoutUrl) {
    showToast('Redirigiendo a la pasarela de pago segura de Stripe...', 'info');
    setTimeout(() => {
      window.location.href = checkoutUrl;
    }, 350);
    return;
  }

  const plan = getPlanById(planId);
  saveSubscription(plan.id, activeBillingCycle);
  renderSubscriptionCards();
  updateSubscriptionBadgesUI();
  try {
    if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
  } catch (_) {}
    showToast(`\u{2728} Suscripci\u{00F3}n actualizada al plan ${plan.name}`);
}
