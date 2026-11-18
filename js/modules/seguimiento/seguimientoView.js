// js/modules/seguimiento/seguimientoView.js
// Pestaña Seguimiento (Asignación de Responsables, Estatus, Archivos y % Avance Real Ponderado)

import { state, persistLocalData } from '../../state/store.js?v=20261117_cf30';
import { getActiveProjectId } from '../../config/constants.js?v=20261117_cf30';
import { showToast } from '../../ui/notifications.js?v=20261117_cf30';
import { isTabLocked } from '../../ui/tabLockController.js?v=20261117_cf30';
import {
  AVATARS_BY_SEX,
  GOOGLE_PRESET_ACCOUNTS,
  getCurrentUser,
  getProjectById,
  getProjectMembers,
  getRegisteredUsersList,
  getStoredInvitations,
  getStoredPlanInvitations,
  canCurrentUserEditProject
} from '../portal/projectService.js?v=20261117_cf30';
import { openTabMembersAssignModal, renderTabAssignedAvatars, getActiveOrFallbackProjectId, openInviteModal } from '../portal/portalController.js?v=20261117_cf30';
import { renderPartidaNivel1ChatButton } from '../chat/projectChat.js?v=20261117_cf30';
import { scheduleBitacoraCloudSync } from '../../core/cloudModulesSyncService.js?v=20261117_cf30';

function persistSeguimientoCloudSummary() {
  const pid = getActiveProjectId() || getActiveOrFallbackProjectId();
  if (!pid || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(`adm_arq_seguimiento_${pid}`);
    const prev = raw ? JSON.parse(raw) : { general: {}, notas: [] };
    prev.updatedAt = new Date().toISOString();
    localStorage.setItem(`adm_arq_seguimiento_${pid}`, JSON.stringify(prev));
    scheduleBitacoraCloudSync(pid);
  } catch (_) {}
}

export const ESTATUS_OPTIONS = [
  {
    id: 'pendiente',
    label: 'Pendiente',
    bgHex: '#8d99ae',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: 'fa-regular fa-clock'
  },
  {
    id: 'en_proceso',
    label: 'En Proceso',
    bgHex: '#fdab3d',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: 'fa-solid fa-spinner fa-spin-pulse'
  },
  {
    id: 'en_revision',
    label: 'En Revisión',
    bgHex: '#579bfc',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-300',
    icon: 'fa-solid fa-magnifying-glass'
  },
  {
    id: 'detenido',
    label: 'Detenido',
    bgHex: '#e2445c',
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-300',
    icon: 'fa-solid fa-triangle-exclamation'
  },
  {
    id: 'aprobado',
    label: 'Aprobado',
    bgHex: '#00c875',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: 'fa-solid fa-circle-check'
  }
];

const STATUS_FILTER_PILLS = [
  { id: 'en_proceso', label: 'En Proceso', countKey: 'en_proceso', bgHex: '#fdab3d' },
  { id: 'en_revision', label: 'En Revisión', countKey: 'en_revision', bgHex: '#579bfc' },
  { id: 'detenido', label: 'Detenidos', countKey: 'detenido', bgHex: '#e2445c' },
  { id: 'aprobado', label: 'Aprobados', countKey: 'aprobado', bgHex: '#00c875' },
  { id: 'pendiente', label: 'Pendientes', countKey: 'pendiente', bgHex: '#8d99ae' }
];

const AVATAR_FALLBACK_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#e11d48',
  '#0891b2',
  '#4f46e5'
];

let seguimientoFilterStatus = 'all';
let seguimientoFilterResponsable = 'all';
let activePopoverKey = null;
let globalPopoverListenersAttached = false;
let pendingInviteAssignNodeId = null;

const GENERIC_SVG_AVATARS = new Set(Object.values(AVATARS_BY_SEX || {}));

function isNonGenericAvatar(src) {
  const clean = String(src || '').trim();
  if (!clean) return false;
  if (GENERIC_SVG_AVATARS.has(clean)) return false;
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('data:image') ||
    clean.startsWith('/') ||
    clean.startsWith('assets/')
  );
}

function buildFallbackProfileMap() {
  const map = new Map();
  const addCandidate = (acc) => {
    const email = String(acc?.email || '').trim().toLowerCase();
    if (!email) return;
    const prev = map.get(email) || {};
    const nextAvatar = isNonGenericAvatar(acc.avatar)
      ? acc.avatar
      : (prev.avatar || acc.avatar || '');
    map.set(email, {
      name: acc.name || prev.name || '',
      email,
      avatar: nextAvatar
    });
  };
  (GOOGLE_PRESET_ACCOUNTS || []).forEach(addCandidate);
  (getRegisteredUsersList() || []).forEach(addCandidate);
  const curr = getCurrentUser();
  if (curr) addCandidate(curr);
  return map;
}

function getSeguimientoCollaborators(projectId) {
  const fallbackMap = buildFallbackProfileMap();
  const collabsMap = new Map();
  const proj = projectId ? getProjectById(projectId) : null;
  const currentUser = getCurrentUser();

  const upsert = (entry, fallbackStatus = null) => {
    const rawEmail = String(entry?.email || '').trim();
    const lower = rawEmail.toLowerCase();
    if (!lower) return;

    const existing = collabsMap.get(lower);
    const known = fallbackMap.get(lower);
    const candidateAvatar = isNonGenericAvatar(entry?.avatar)
      ? entry.avatar
      : (isNonGenericAvatar(known?.avatar)
          ? known.avatar
          : (entry?.avatar || existing?.avatar || known?.avatar || ''));

    const resolvedName = entry?.name || existing?.name || known?.name || rawEmail.split('@')[0];
    const resolvedStatus = (existing?.status === 'active' || entry?.status === 'active' || entry?.status === 'accepted')
      ? 'active'
      : (entry?.status || existing?.status || fallbackStatus || 'active');

    collabsMap.set(lower, {
      id: entry?.id || existing?.id || ('collab-' + lower),
      name: resolvedName,
      email: rawEmail,
      avatar: candidateAvatar,
      role: entry?.role || existing?.role || 'editar',
      status: resolvedStatus,
      allowedTabs: Array.isArray(entry?.allowedTabs) ? entry.allowedTabs : existing?.allowedTabs
    });
  };

  const members = projectId ? (getProjectMembers(projectId) || []) : [];
  members.forEach(m => upsert(m, m?.status || null));

  const storedInvs = getStoredInvitations() || [];
  storedInvs.forEach(inv => {
    if (projectId && inv.projectId && inv.projectId !== projectId) return;
    if (inv.status === 'rejected' || inv.status === 'declined') return;
    upsert({
      id: inv.id,
      name: inv.name,
      email: inv.email,
      avatar: inv.avatar,
      role: inv.role,
      status: inv.status === 'accepted' ? 'active' : 'pending',
      allowedTabs: inv.allowedTabs
    }, 'pending');
  });

  const ownerEmail = String(proj?.ownerEmail || currentUser?.email || '').trim().toLowerCase();
  if (ownerEmail) {
    const planInvs = getStoredPlanInvitations() || [];
    planInvs.forEach(pInv => {
      if (String(pInv.ownerEmail || '').trim().toLowerCase() !== ownerEmail) return;
      if (pInv.status === 'rejected' || pInv.status === 'declined') return;
      upsert({
        id: pInv.id,
        name: pInv.name,
        email: pInv.email,
        avatar: pInv.avatar,
        role: pInv.role,
        status: pInv.status === 'accepted' ? 'active' : 'pending'
      }, 'pending');
    });
  }

  if (currentUser && currentUser.email) {
    upsert({
      id: currentUser.id || ('curr-' + currentUser.email),
      name: currentUser.name,
      email: currentUser.email,
      avatar: currentUser.avatar,
      role: currentUser.role || 'editar',
      status: 'active'
    }, 'active');
  }

  return Array.from(collabsMap.values());
}

function getNodeResponsableEmails(node) {
  if (!node) return [];
  const rawList = Array.isArray(node.responsableEmails)
    ? node.responsableEmails
    : (node.responsableEmail ? [node.responsableEmail] : []);
  const seen = new Set();
  const result = [];
  rawList.forEach(item => {
    const trimmed = String(item || '').trim();
    const lower = trimmed.toLowerCase();
    if (lower && !seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
  });
  return result;
}

function nodeMatchesResponsableFilter(node, responsableFilter) {
  if (!node) return false;
  if (!responsableFilter || responsableFilter === 'all') return true;
  const emails = getNodeResponsableEmails(node).map(em => em.toLowerCase());
  if (responsableFilter === 'unassigned') {
    return emails.length === 0;
  }
  return emails.includes(String(responsableFilter).toLowerCase());
}

function nodeDirectMatchesFilters(node, filterStatus, filterResponsable) {
  if (!node) return false;
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  let statusMatch = !filterStatus || filterStatus === 'all';
  if (!statusMatch) {
    if (hasChildren) {
      statusMatch = (getNodeDescendantStatusBreakdown(node).counts[filterStatus] || 0) > 0;
    } else {
      statusMatch = (node.estatus || 'pendiente') === filterStatus;
    }
  }
  if (!statusMatch) return false;
  return nodeMatchesResponsableFilter(node, filterResponsable);
}

function nodeOrDescendantMatchesFilters(node, filterStatus, filterResponsable, depth = 0) {
  if (!node) return false;
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isTopPartidaHeader = depth === 0 && hasChildren;

  if (!isTopPartidaHeader && nodeDirectMatchesFilters(node, filterStatus, filterResponsable)) {
    return true;
  }
  if (hasChildren) {
    return node.children.some(child =>
      nodeOrDescendantMatchesFilters(child, filterStatus, filterResponsable, depth + 1)
    );
  }
  return false;
}

function collectSeguimientoFilterStats(tree, members, fallbackMap, activeStatus, activeResponsable) {
  const statusCounts = {
    all: 0,
    en_proceso: 0,
    en_revision: 0,
    detenido: 0,
    aprobado: 0,
    pendiente: 0
  };
  let unassignedCount = 0;
  let allForStatusCount = 0;

  const entryMap = new Map();
  const ensureEntry = (rawEmail, memberObj = null, fromProjectMember = false) => {
    const clean = String(rawEmail || '').trim();
    const lower = clean.toLowerCase();
    if (!lower) return null;
    if (!entryMap.has(lower)) {
      const resolvedMember = memberObj || findMemberByEmail(members, clean, fallbackMap);
      entryMap.set(lower, {
        email: resolvedMember?.email || clean,
        lowerEmail: lower,
        member: resolvedMember,
        count: 0,
        parentCount: 0,
        fromProjectMember
      });
    } else if (memberObj && !entryMap.get(lower).member) {
      entryMap.get(lower).member = memberObj;
    }
    return entryMap.get(lower);
  };

  (members || []).forEach(m => ensureEntry(m?.email, m, true));

  function walkStats(nodes, depth = 0) {
    (nodes || []).forEach(node => {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const st = node.estatus || 'pendiente';
      const emails = getNodeResponsableEmails(node);
      const lowerEmails = emails.map(em => em.toLowerCase());
      const matchesActiveStatus = !activeStatus || activeStatus === 'all' || st === activeStatus;

      if (!hasChildren) {
        if (nodeMatchesResponsableFilter(node, activeResponsable)) {
          statusCounts.all++;
          if (Object.prototype.hasOwnProperty.call(statusCounts, st)) {
            statusCounts[st]++;
          }
        }
        if (matchesActiveStatus) {
          allForStatusCount++;
          if (lowerEmails.length === 0) {
            unassignedCount++;
          }
          emails.forEach(em => {
            const entry = ensureEntry(em, null, false);
            if (entry) entry.count++;
          });
        }
      } else {
        if (depth > 0 && matchesActiveStatus) {
          emails.forEach(em => {
            const entry = ensureEntry(em, null, false);
            if (entry) entry.parentCount++;
          });
        }
        walkStats(node.children, depth + 1);
      }
    });
  }

  walkStats(tree);

  if (activeResponsable && activeResponsable !== 'all' && activeResponsable !== 'unassigned') {
    ensureEntry(activeResponsable, null, false);
  }

  const responsableEntries = Array.from(entryMap.values()).sort((a, b) => {
    if (a.fromProjectMember !== b.fromProjectMember) return a.fromProjectMember ? -1 : 1;
    const totalA = a.count + a.parentCount;
    const totalB = b.count + b.parentCount;
    if (totalB !== totalA) return totalB - totalA;
    const nameA = (a.member?.name || a.email).toLowerCase();
    const nameB = (b.member?.name || b.email).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return {
    statusCounts,
    unassignedCount,
    allForStatusCount,
    responsableEntries
  };
}

function getNodeAvancePercent(node) {
  if (!node) return 0;
  if (Array.isArray(node.children) && node.children.length > 0) {
    const sum = node.children.reduce((acc, child) => acc + getNodeAvancePercent(child), 0);
    const avg = Math.round((sum / node.children.length) * 10) / 10;
    return Math.max(0, Math.min(100, isNaN(avg) ? 0 : avg));
  }
  const st = node.estatus || 'pendiente';
  const parsed = parseFloat(node.avancePorcentaje);
  const raw = !isNaN(parsed)
    ? parsed
    : (st === 'aprobado' ? 100 : st === 'en_revision' ? 85 : st === 'en_proceso' ? 40 : 0);
  const clamped = Math.round(Math.max(0, Math.min(100, isNaN(raw) ? 0 : raw)) * 10) / 10;
  return clamped;
}

function renderAvanceProgressCell(node, clampedAvance, barColor, { hasChildren = false, locked = false } = {}) {
  const isInteractive = !hasChildren && !locked;
  const subCount = Array.isArray(node.children) ? node.children.length : 0;
  const barTitle = hasChildren
    ? `Avance calculado automáticamente (${subCount} subconceptos): ${clampedAvance}% — No editable`
    : (locked
      ? 'Pestaña bloqueada (solo consulta)'
      : `Avance: ${clampedAvance}% (clic en la barra o edita el porcentaje)`);
  const barStateClasses = isInteractive
    ? 'cursor-pointer hover:brightness-95 transition'
    : (hasChildren ? 'cursor-default' : 'cursor-default opacity-80');

  return `
            <!-- % Avance -->
            <td class="py-1.5 px-2.5 text-center align-middle">
              <div class="flex items-center justify-center gap-2">
                <div role="progressbar"
                     aria-valuemin="0"
                     aria-valuemax="100"
                     aria-valuenow="${clampedAvance}"
                     data-node-id="${escapeHtml(node.id)}"
                     ${isInteractive ? 'onclick="onAvanceBarClick(event, this)"' : ''}
                     title="${escapeHtml(barTitle)}"
                     class="flex-1 min-w-[84px] h-3.5 rounded-full overflow-hidden shadow-2xs ${barStateClasses}"
                     style="background-color: #c4c7d0;">
                  <div class="h-full transition-all duration-300" style="width: ${clampedAvance}%; background-color: ${escapeHtml(barColor)};"></div>
                </div>
                <div class="inline-flex items-center justify-center gap-0.5 shrink-0 w-[60px]">
                  ${hasChildren ? `
                    <span class="text-[11px] font-extrabold text-slate-700 whitespace-nowrap select-none"
                          title="${escapeHtml(barTitle)}">${clampedAvance}%</span>
                  ` : `
                    <input type="number" min="0" max="100" step="5" value="${clampedAvance}" data-node-id="${escapeHtml(node.id)}" onchange="updateEntregableSeguimiento(this.dataset.nodeId, 'avancePorcentaje', this.value)" ${locked ? 'disabled' : ''} class="w-12 text-center font-bold py-0.5 px-1 rounded border border-slate-200 focus:border-purple-500 text-[11px]">
                    <span class="text-[11px] text-slate-400 font-bold">%</span>
                  `}
                </div>
              </div>
            </td>`;
}

function renderSeguimientoExpandToggle(node, isExpanded) {
  const escapedId = escapeHtml(node.id);
  const title = isExpanded ? 'Agrupar (colapsar subelementos)' : 'Desagrupar (expandir subelementos)';
  return `
    <button type="button"
            data-node-id="${escapedId}"
            onclick="toggleSeguimientoNodeExpand(this.dataset.nodeId, event)"
            class="w-5 h-5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-900 inline-flex items-center justify-center transition cursor-pointer shrink-0"
            title="${title}">
      <i class="fa-solid fa-chevron-${isExpanded ? 'down' : 'right'} text-[10px]"></i>
    </button>
  `;
}

function getNodeDescendantStatusBreakdown(node) {
  const counts = {
    pendiente: 0,
    en_proceso: 0,
    en_revision: 0,
    detenido: 0,
    aprobado: 0
  };
  let totalDescendants = 0;

  function walkLeaves(n) {
    if (Array.isArray(n.children) && n.children.length > 0) {
      n.children.forEach(walkLeaves);
    } else {
      totalDescendants++;
      const st = n.estatus || 'pendiente';
      if (Object.prototype.hasOwnProperty.call(counts, st)) {
        counts[st]++;
      } else {
        counts.pendiente++;
      }
    }
  }

  if (Array.isArray(node?.children)) {
    node.children.forEach(walkLeaves);
  }

  const summaryOrder = ['aprobado', 'en_revision', 'en_proceso', 'detenido', 'pendiente'];
  const items = summaryOrder.map(id => {
    const opt = ESTATUS_OPTIONS.find(o => o.id === id) || ESTATUS_OPTIONS[0];
    return {
      ...opt,
      count: counts[opt.id] || 0,
      pct: totalDescendants > 0 ? ((counts[opt.id] || 0) / totalDescendants) * 100 : 0
    };
  });

  const present = items.filter(it => it.count > 0);
  const isUniform = present.length === 1;
  const singleOpt = isUniform ? present[0] : null;

  return {
    counts,
    totalDescendants,
    items,
    present,
    isUniform,
    singleOpt
  };
}

function renderParentConceptStatusCell(node) {
  const breakdown = getNodeDescendantStatusBreakdown(node);

  if (breakdown.totalDescendants === 0) {
    return `
      <div class="w-full h-8 px-2 rounded-[4px] bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center text-[10px] font-semibold select-none"
           title="Sin subconceptos">
        <span>Sin subconceptos</span>
      </div>
    `;
  }

  const summaryTitle = breakdown.present.length > 0
    ? `Estatus en ${breakdown.totalDescendants} subconceptos: ` +
      breakdown.present.map(p => `${p.label}: ${p.count} (${Math.round(p.pct)}%)`).join(', ') +
      ' — Clic para ver desglose'
    : 'Estatus calculado automáticamente desde sus subconceptos';

  // Si todos los subconceptos tienen el mismo estatus, se muestra el bloque sólido correspondiente
  if (breakdown.isUniform && breakdown.singleOpt) {
    const isAprobado = breakdown.singleOpt.id === 'aprobado';
    return `
      <button type="button"
              data-seg-popover-trigger="true"
              data-node-id="${escapeHtml(node.id)}"
              onclick="toggleSubconceptosEstatusPopover(event, this)"
              class="seg-status-btn group relative w-full h-8 px-2 rounded-[4px] font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-2xs select-none hover:brightness-95 transition cursor-pointer"
              style="background-color: ${breakdown.singleOpt.bgHex}; color: #ffffff;"
              title="${escapeHtml(summaryTitle)}">
        <i class="${breakdown.singleOpt.icon || 'fa-solid fa-circle-check'} text-xs"></i>
        <span class="truncate tracking-wide">${isAprobado ? '100% Aprobado' : escapeHtml(breakdown.singleOpt.label)}</span>
        <span class="text-[10px] font-extrabold opacity-90">(${breakdown.singleOpt.count})</span>
      </button>
    `;
  }

  // Si hay mezcla de estatus en los subconceptos:
  // Mostramos círculos/chips representativos de cada estatus presente con su icono y conteo (verde aprobado, naranja proceso, rojo detenido con alerta, etc.)
  const chipsHtml = breakdown.present.map(p => {
    const isDetenido = p.id === 'detenido';
    const alertClass = isDetenido ? 'animate-pulse ring-2 ring-rose-400' : '';
    return `
      <span class="inline-flex items-center justify-center gap-1 h-5 min-w-[26px] px-1.5 rounded-full text-white text-[10px] font-extrabold shadow-2xs shrink-0 select-none ${alertClass}"
            style="background-color: ${p.bgHex};"
            title="${escapeHtml(`${p.label}: ${p.count} de ${breakdown.totalDescendants} (${Math.round(p.pct)}%)`)}">
        <i class="${p.icon} text-[9px]"></i>
        <span>${p.count}</span>
      </span>
    `;
  }).join('');

  const miniBarHtml = breakdown.present.map(p => `
    <span style="width: ${p.pct.toFixed(2)}%; background-color: ${p.bgHex}; min-width: 4px;" class="h-full"></span>
  `).join('');

  return `
    <button type="button"
            data-seg-popover-trigger="true"
            data-node-id="${escapeHtml(node.id)}"
            onclick="toggleSubconceptosEstatusPopover(event, this)"
            class="group relative w-full h-8 px-1.5 rounded-[4px] bg-slate-100 hover:bg-slate-200 border border-slate-300 shadow-2xs flex items-center justify-center gap-1 transition cursor-pointer select-none overflow-hidden"
            title="${escapeHtml(summaryTitle)}">
      <div class="flex items-center justify-center gap-1 w-full z-10">
        ${chipsHtml}
      </div>
      <div class="absolute bottom-0 left-0 right-0 h-1 flex overflow-hidden rounded-b-[3px] opacity-75">
        ${miniBarHtml}
      </div>
    </button>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInitials(name, email = '') {
  const source = (name || email.split('@')[0] || 'US').trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || 'US';
}

function getAvatarBgHex(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_FALLBACK_COLORS[Math.abs(hash) % AVATAR_FALLBACK_COLORS.length];
}

function findMemberByEmail(members, email, fallbackMap = null) {
  if (!email) return null;
  const clean = String(email).trim().toLowerCase();
  const inMembers = members.find(m => (m.email || '').trim().toLowerCase() === clean);
  if (inMembers) return inMembers;
  if (fallbackMap && fallbackMap.has(clean)) {
    return fallbackMap.get(clean);
  }
  return buildFallbackProfileMap().get(clean) || null;
}

function findNodeById(nodes, nodeId) {
  for (const n of nodes || []) {
    if (n.id === nodeId || String(n.id) === String(nodeId)) return n;
    if (Array.isArray(n.children) && n.children.length > 0) {
      const found = findNodeById(n.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function normalizeSeguimientoLink(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return { valid: true, url: '' };
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return { valid: false, url: '' };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { valid: true, url: trimmed };
  }
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return { valid: true, url: `http://${trimmed}` };
  }
  if (!trimmed.includes(' ') && !/^[a-zA-Z]:[\\/]/.test(trimmed) && /^[^/:?#\s]+\.[^/\s]{2,}/.test(trimmed)) {
    return { valid: true, url: `https://${trimmed}` };
  }
  return { valid: false, url: '' };
}

function renderSeguimientoLinkCell(node, locked) {
  const linkInfo = normalizeSeguimientoLink(node?.archivoLink || '');
  const archivoLink = linkInfo.valid ? linkInfo.url : '';
  return `
    <!-- Archivos -->
    <td class="py-1.5 px-2.5 align-middle">
      <div class="flex items-center gap-1.5">
        <div class="relative flex-1 min-w-[140px] flex items-center">
          <i class="fa-solid fa-link text-[10px] ${archivoLink ? 'text-blue-500' : 'text-slate-400'} absolute left-2 pointer-events-none"></i>
          <input type="text"
                 inputmode="url"
                 value="${escapeHtml(archivoLink)}"
                 data-node-id="${escapeHtml(node.id)}"
                 placeholder="Pegar link..."
                 onchange="updateEntregableSeguimiento(this.dataset.nodeId, 'archivoLink', this.value)"
                 onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }"
                 ${locked ? 'disabled' : ''}
                 title="${escapeHtml(archivoLink ? `Enlace: ${archivoLink}` : 'Pega o escribe un link (Drive, OneDrive, AutoCAD, etc.)')}"
                 class="w-full pl-6 pr-2 py-1 rounded-lg border ${archivoLink ? 'border-blue-400 font-medium' : 'border-slate-200'} bg-white text-slate-700 focus:border-purple-500 focus:outline-none text-[11px] placeholder:text-slate-400 truncate ${locked ? 'opacity-75 cursor-not-allowed' : ''}">
        </div>
        ${archivoLink ? `
          <a href="${escapeHtml(archivoLink)}"
             target="_blank"
             rel="noopener noreferrer"
             class="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-2xs transition active:scale-95"
             title="Abrir link en nueva pestaña">
            <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
          </a>
        ` : ''}
      </div>
    </td>
  `;
}

/**
 * Renderiza el círculo de foto de perfil del responsable (o sus iniciales como respaldo si no tiene imagen).
 */
function renderMemberAvatarCircle(member, fallbackEmail = '', sizeClass = 'w-8 h-8', textSizeClass = 'text-[11px]') {
  const displayName = member?.name || (fallbackEmail ? fallbackEmail.split('@')[0] : 'Usuario');
  const email = member?.email || fallbackEmail || '';
  const initials = getInitials(displayName, email);
  const bgHex = getAvatarBgHex(email || displayName);
  const avatarSrc = (member?.avatar || '').trim();
  const hasImage = avatarSrc && (
    avatarSrc.startsWith('http://') ||
    avatarSrc.startsWith('https://') ||
    avatarSrc.startsWith('data:image') ||
    avatarSrc.startsWith('/') ||
    avatarSrc.startsWith('assets/')
  );

  if (hasImage) {
    return `
      <span class="relative inline-flex items-center justify-center shrink-0 rounded-full">
        <img src="${escapeHtml(avatarSrc)}"
             alt="${escapeHtml(displayName)}"
             class="${sizeClass} rounded-full object-cover ring-2 ring-white shadow-xs shrink-0 bg-slate-200"
             onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';">
        <span style="display:none; background-color:${bgHex};"
              class="${sizeClass} rounded-full text-white font-bold ${textSizeClass} items-center justify-center ring-2 ring-white shadow-xs shrink-0 select-none">${escapeHtml(initials)}</span>
      </span>
    `;
  }

  return `
    <span style="background-color:${bgHex};"
          class="${sizeClass} rounded-full text-white font-bold ${textSizeClass} inline-flex items-center justify-center ring-2 ring-white shadow-xs shrink-0 select-none">${escapeHtml(initials)}</span>
  `;
}

export function closeSeguimientoPopover() {
  activePopoverKey = null;
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('seg-floating-popover');
  if (existing) existing.remove();
}

function attachGlobalPopoverListeners() {
  if (globalPopoverListenersAttached || typeof document === 'undefined') return;
  globalPopoverListenersAttached = true;

  document.addEventListener('click', (e) => {
    const popover = document.getElementById('seg-floating-popover');
    if (!popover) return;
    if (popover.contains(e.target)) return;
    if (e.target.closest('[data-seg-popover-trigger="true"]')) return;
    closeSeguimientoPopover();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSeguimientoPopover();
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', closeSeguimientoPopover);
  }
}

function positionPopoverNearAnchor(popoverEl, anchorEl, widthPx, estimatedHeightPx) {
  const rect = anchorEl.getBoundingClientRect();
  const margin = 8;
  let left = rect.left + (rect.width / 2) - (widthPx / 2);
  left = Math.max(margin, Math.min(left, window.innerWidth - widthPx - margin));

  let top = rect.bottom + 6;
  if (top + estimatedHeightPx > window.innerHeight - margin && rect.top - estimatedHeightPx - 6 > margin) {
    top = rect.top - estimatedHeightPx - 6;
  }

  popoverEl.style.left = `${Math.round(left)}px`;
  popoverEl.style.top = `${Math.round(top)}px`;
  popoverEl.style.width = `${widthPx}px`;
}

// Calcular % de Avance Real Ponderado del Proyecto (respeta los filtros activos de la tabla)
export function calcularAvancePonderado({ statusFilter = 'all', responsableFilter = 'all' } = {}) {
  const tree = state.treeData || [];
  const hasActiveFilter = (statusFilter && statusFilter !== 'all') || (responsableFilter && responsableFilter !== 'all');
  let sumaPonderada = 0;
  let sumaPesos = 0;
  let totalEntregables = 0;
  let totalUnfiltered = 0;
  let aprobados = 0;
  let enProceso = 0;
  let pendientes = 0;
  let enRevision = 0;
  let detenidos = 0;

  function accumulateNode(node) {
    totalEntregables++;
    // El peso de ponderación proviene del costo del entregable o de sus horas hombre (mínimo 1 para ponderar parejo si no hay costos)
    const subc = parseFloat(node.costoSubcontrato) || 0;
    const hh = parseFloat(node.horasHombre) || 0;
    const peso = Math.max(1, subc + (hh * 380));

    const st = node.estatus || 'pendiente';
    const avance = getNodeAvancePercent(node);

    if (st === 'aprobado') aprobados++;
    else if (st === 'detenido') detenidos++;
    else if (st === 'en_revision') enRevision++;
    else if (st === 'en_proceso') enProceso++;
    else pendientes++;

    sumaPonderada += (avance * peso);
    sumaPesos += peso;
  }

  function walk(nodes, depth = 0) {
    let matchedInBranch = 0;
    (nodes || []).forEach(node => {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      if (hasChildren) {
        const matchedChildren = walk(node.children, depth + 1);
        matchedInBranch += matchedChildren;
        if (hasActiveFilter && depth > 0 && matchedChildren === 0 && nodeDirectMatchesFilters(node, statusFilter, responsableFilter)) {
          accumulateNode(node);
          matchedInBranch++;
        }
      } else {
        totalUnfiltered++;
        if (!hasActiveFilter || nodeDirectMatchesFilters(node, statusFilter, responsableFilter)) {
          accumulateNode(node);
          matchedInBranch++;
        }
      }
    });
    return matchedInBranch;
  }
  walk(tree, 0);

  const avancePonderadoFinal = sumaPesos > 0 ? (sumaPonderada / sumaPesos) : 0;

  return {
    avancePonderadoFinal: Math.min(100, Math.round(avancePonderadoFinal * 10) / 10),
    totalEntregables,
    totalUnfiltered,
    aprobados,
    enProceso,
    enRevision,
    detenidos,
    pendientes
  };
}

function renderSeguimientoFilterBar(filterMeta) {
  const { statusCounts, unassignedCount, allForStatusCount, responsableEntries } = filterMeta;
  const hasAnyFilter = seguimientoFilterStatus !== 'all' || seguimientoFilterResponsable !== 'all';

  const statusButtonsHtml = STATUS_FILTER_PILLS.map(item => {
    const isSelected = seguimientoFilterStatus === item.id;
    const count = statusCounts[item.countKey] ?? 0;
    return `
      <button type="button"
              onclick="setSeguimientoFilter('${item.id}')"
              class="text-xs px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${isSelected ? 'text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-200'}"
              ${isSelected ? `style="background-color:${item.bgHex};"` : ''}>
        ${escapeHtml(item.label)} (${count})
      </button>
    `;
  }).join('');

  const isRespFiltered = seguimientoFilterResponsable !== 'all';
  let respBtnContent = `
    <i class="fa-solid fa-users text-[11px] text-slate-400"></i>
    <span>Todos</span>
    <span class="text-[10px] opacity-75">(${allForStatusCount})</span>
  `;

  if (seguimientoFilterResponsable === 'unassigned') {
    respBtnContent = `
      <i class="fa-solid fa-user-slash text-[11px]"></i>
      <span>Sin asignar</span>
      <span class="text-[10px] opacity-90">(${unassignedCount})</span>
    `;
  } else if (isRespFiltered) {
    const selectedEntry = responsableEntries.find(e => e.lowerEmail === seguimientoFilterResponsable);
    const displayName = selectedEntry?.member?.name || (selectedEntry?.email || seguimientoFilterResponsable).split('@')[0];
    const selectedCount = selectedEntry ? (selectedEntry.count + selectedEntry.parentCount) : 0;
    respBtnContent = `
      ${renderMemberAvatarCircle(selectedEntry?.member, selectedEntry?.email || seguimientoFilterResponsable, 'w-4 h-4', 'text-[8px]')}
      <span class="max-w-[140px] truncate">${escapeHtml(displayName)}</span>
      <span class="text-[10px] opacity-90">(${selectedCount})</span>
    `;
  }

  return `
      <!-- Barra de Filtros por Estatus y Responsable -->
      <div class="p-2 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs font-bold text-slate-600 mr-0.5 inline-flex items-center gap-1">
            <i class="fa-solid fa-filter text-slate-400"></i> Estatus:
          </span>
          <button type="button"
                  onclick="setSeguimientoFilter('all')"
                  class="text-xs px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${seguimientoFilterStatus === 'all' ? 'bg-purple-600 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-200'}">
            Todos (${statusCounts.all})
          </button>
          ${statusButtonsHtml}
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs font-bold text-slate-600 inline-flex items-center gap-1">
            <i class="fa-solid fa-user-check text-slate-400"></i> Responsable:
          </span>
          <button type="button"
                  data-seg-popover-trigger="true"
                  onclick="toggleResponsableFilterPopover(event, this)"
                  title="Filtrar por responsable"
                  class="text-xs px-2.5 py-1 rounded-lg font-bold transition cursor-pointer inline-flex items-center gap-1.5 ${isRespFiltered ? 'bg-purple-600 hover:bg-purple-700 text-white border border-purple-600 shadow-xs' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-200'}">
            ${respBtnContent}
            <i class="fa-solid fa-chevron-down text-[9px] ml-0.5 opacity-80"></i>
          </button>
          ${hasAnyFilter ? `
            <button type="button"
                    onclick="clearSeguimientoFilters()"
                    title="Limpiar filtros de estatus y responsable"
                    class="text-xs px-2 py-1 rounded-lg font-bold bg-white text-slate-600 border border-slate-300 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 transition cursor-pointer inline-flex items-center gap-1">
              <i class="fa-solid fa-xmark text-[11px]"></i>
              <span>Limpiar</span>
            </button>
          ` : ''}
        </div>
      </div>
  `;
}

// Renderizar la vista de la pestaña Seguimiento
export function renderSeguimientoView() {
  closeSeguimientoPopover();
  attachGlobalPopoverListeners();

  const container = document.getElementById('view-seguimiento');
  if (!container) return;

  const hasActiveFilter = seguimientoFilterStatus !== 'all' || seguimientoFilterResponsable !== 'all';
  const stats = calcularAvancePonderado({
    statusFilter: seguimientoFilterStatus,
    responsableFilter: seguimientoFilterResponsable
  });
  const pId = getActiveOrFallbackProjectId();
  const members = getSeguimientoCollaborators(pId);
  const fallbackMap = buildFallbackProfileMap();
  const filterMeta = collectSeguimientoFilterStats(
    state.treeData || [],
    members,
    fallbackMap,
    seguimientoFilterStatus,
    seguimientoFilterResponsable
  );
  const locked = isTabLocked('seguimiento') || !canCurrentUserEditProject(getActiveProjectId());

  const deliverablesLabel = stats.totalEntregables === 1 ? 'entregable' : 'entregables';
  const deliverablesBadgeText = hasActiveFilter
    ? `${stats.totalEntregables} de ${stats.totalUnfiltered} ${stats.totalUnfiltered === 1 ? 'entregable' : 'entregables'}`
    : `${stats.totalEntregables} ${deliverablesLabel}`;

  container.innerHTML = `
    <div class="bg-white rounded-lg shadow border border-slate-200 flex flex-col h-full overflow-hidden">
      <!-- Encabezado de la Pestaña -->
      <div class="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold">
              <i class="fa-solid fa-bars-progress"></i>
            </span>
            <h2 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight">Seguimiento Operativo y Control de Entregables</h2>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              Avance Ponderado
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Asigna colaboradores responsables, actualiza estatus de entrega y gestiona archivos adjuntos.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Widget Asignados -->
          <div id="tab-members-seguimiento" class="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
            <span class="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <i class="fa-solid fa-users text-purple-600"></i> Asignados:
            </span>
            <div id="tab-avatars-seguimiento" class="flex -space-x-1.5 overflow-hidden items-center cursor-pointer" onclick="openTabMembersAssignModal('seguimiento')"></div>
            <button type="button" onclick="openTabMembersAssignModal('seguimiento')" class="text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded px-1.5 py-0.5 transition cursor-pointer">
              Asignar
            </button>
          </div>

          <!-- Candado de Bloqueo -->
          <button type="button" onclick="toggleTabLock('seguimiento')" id="btn-lock-seguimiento" class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-semibold shadow-2xs transition cursor-pointer" title="Bloquear seguimiento">
            <i class="fa-solid ${locked ? 'fa-lock text-amber-600' : 'fa-lock-open text-slate-600'}"></i>
          </button>
        </div>
      </div>

      <!-- Tarjetas de Resumen KPI de Seguimiento (Compactas) -->
      <div class="px-3 py-1.5 bg-slate-100/70 border-b border-slate-200 grid grid-cols-2 lg:grid-cols-5 gap-2 shrink-0">
        
        <!-- Tarjeta 1: % Avance Real Ponderado -->
        <div class="col-span-2 px-3 py-1.5 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-lg shadow-xs flex flex-col justify-center gap-1.5"
             title="${hasActiveFilter ? 'Avance real ponderado de los elementos filtrados en la tabla' : 'Avance real ponderado completado según peso técnico'}">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-baseline gap-2 min-w-0">
              <span class="text-lg sm:text-xl font-black leading-none shrink-0">${stats.avancePonderadoFinal}%</span>
              <span class="text-[10px] font-bold uppercase tracking-wider text-purple-200 truncate">
                Avance Ponderado${hasActiveFilter ? ' · Filtrado' : ''}
              </span>
              <span class="text-[10px] text-purple-200/90 truncate hidden xl:inline">
                (${hasActiveFilter ? 'vista filtrada' : 'peso técnico'})
              </span>
            </div>
            <span class="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0">${deliverablesBadgeText}</span>
          </div>
          <!-- Barra de Progreso -->
          <div class="w-full bg-black/25 rounded-full h-1.5 overflow-hidden">
            <div class="bg-emerald-400 h-1.5 rounded-full transition-all duration-500" style="width: ${stats.avancePonderadoFinal}%"></div>
          </div>
        </div>

        <!-- Tarjeta 2: Aprobados -->
        <div class="px-2.5 py-1.5 bg-emerald-50/70 rounded-lg border border-emerald-200 shadow-2xs flex flex-col justify-between">
          <div class="flex items-center justify-between text-emerald-800">
            <span class="text-[10px] font-bold uppercase tracking-tight">Aprobados</span>
            <i class="fa-solid fa-circle-check text-[11px] text-emerald-600"></i>
          </div>
          <div class="flex items-baseline justify-between gap-1.5 mt-0.5">
            <span class="text-lg font-black text-emerald-700 leading-none">${stats.aprobados}</span>
            <span class="text-[10px] text-emerald-600 truncate">100% listos</span>
          </div>
        </div>

        <!-- Tarjeta 3: En Proceso / En Revisión -->
        <div class="px-2.5 py-1.5 bg-blue-50/70 rounded-lg border border-blue-200 shadow-2xs flex flex-col justify-between">
          <div class="flex items-center justify-between text-blue-800">
            <span class="text-[10px] font-bold uppercase tracking-tight truncate">En Proceso / Rev.</span>
            <i class="fa-solid fa-spinner text-[11px] text-blue-600 shrink-0"></i>
          </div>
          <div class="flex items-baseline justify-between gap-1.5 mt-0.5">
            <span class="text-lg font-black text-blue-700 leading-none">${stats.enProceso + stats.enRevision}</span>
            <span class="text-[10px] text-blue-500 truncate">${stats.enRevision} rev.${stats.detenidos > 0 ? ` · <span class="text-rose-600 font-bold">${stats.detenidos} det.</span>` : ' cliente'}</span>
          </div>
        </div>

        <!-- Tarjeta 4: Pendientes -->
        <div class="px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div class="flex items-center justify-between text-slate-600">
            <span class="text-[10px] font-bold uppercase tracking-tight">Pendientes</span>
            <i class="fa-regular fa-clock text-[11px] text-slate-400"></i>
          </div>
          <div class="flex items-baseline justify-between gap-1.5 mt-0.5">
            <span class="text-lg font-black text-slate-700 leading-none">${stats.pendientes}</span>
            <span class="text-[10px] text-slate-400 truncate">Por iniciar</span>
          </div>
        </div>

      </div>

      ${renderSeguimientoFilterBar(filterMeta)}

      <!-- Cuerpo Principal: Tabla de Entregables (100% ancho) -->
      <div class="flex-1 overflow-auto p-3 bg-white" onscroll="closeSeguimientoPopover()">
        <table class="w-full text-left border-collapse text-xs rounded-xl shadow-2xs border border-slate-200 overflow-hidden">
          <thead>
            <tr class="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
              <th class="py-2.5 px-3 w-16">Clave</th>
              <th class="py-2.5 px-3 min-w-[220px]">
                <div class="flex items-center justify-between gap-2">
                  <span>Descripción de Concepto</span>
                  <div class="inline-flex items-center gap-1 shrink-0">
                    <button type="button"
                            onclick="setAllSeguimientoExpanded(true)"
                            title="Desagrupar todos los conceptos"
                            class="px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 text-slate-600 border border-slate-300 text-[10px] font-semibold inline-flex items-center gap-1 transition cursor-pointer">
                      <i class="fa-solid fa-angles-down text-[9px]"></i>
                      <span class="hidden sm:inline">Desagrupar</span>
                    </button>
                    <button type="button"
                            onclick="setAllSeguimientoExpanded(false)"
                            title="Agrupar todos los conceptos"
                            class="px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 text-slate-600 border border-slate-300 text-[10px] font-semibold inline-flex items-center gap-1 transition cursor-pointer">
                      <i class="fa-solid fa-angles-up text-[9px]"></i>
                      <span class="hidden sm:inline">Agrupar</span>
                    </button>
                  </div>
                </div>
              </th>
              <th class="py-2.5 px-3 w-44 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <span>Responsable</span>
                  ${members.length > 0 ? `
                    <button type="button"
                            onclick="openInviteFromSeguimiento(event, null, 'members')"
                            class="inline-flex items-center -space-x-1.5 cursor-pointer hover:opacity-85 transition focus:outline-none"
                            title="${escapeHtml(`Equipo e invitados (${members.length}): ${members.map(m => m.name || m.email).join(', ')} — Clic para ver o gestionar`)}">
                      ${members.slice(0, 3).map(m => renderMemberAvatarCircle(m, m.email, 'w-5 h-5', 'text-[8px]')).join('')}
                      ${members.length > 3 ? `<span class="w-5 h-5 rounded-full bg-slate-600 text-white text-[8px] font-bold inline-flex items-center justify-center ring-2 ring-white shadow-2xs">+${members.length - 3}</span>` : ''}
                    </button>
                  ` : ''}
                </div>
              </th>
              <th class="py-2.5 px-2.5 w-40 text-center">Estatus</th>
              <th class="py-2.5 px-3 w-48 text-center">% Avance</th>
              <th class="py-2.5 px-3 w-56 text-center">Archivos</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${renderSeguimientoRows(state.treeData || [], members, locked, fallbackMap)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  renderTabAssignedAvatars('seguimiento');
}

// Renderizar filas de la tabla de seguimiento
function renderSeguimientoRows(nodes, members, locked, fallbackMap = buildFallbackProfileMap()) {
  if (!nodes || nodes.length === 0) {
    return `
      <tr>
        <td colspan="6" class="p-8 text-center text-slate-400">
          <i class="fa-solid fa-bars-progress text-2xl mb-1 block"></i>
          No hay entregables configurados aún en la Tabla de Alcances.
        </td>
      </tr>
    `;
  }

  let html = '';
  const hasActiveFilter = seguimientoFilterStatus !== 'all' || seguimientoFilterResponsable !== 'all';

  function walk(items, depth = 0, parentColor = null) {
    items.forEach(node => {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const indent = depth * 16;
      const st = node.estatus || 'pendiente';
      const clampedAvance = getNodeAvancePercent(node);
      const barColor = node.color || parentColor || '#579bfc';

      if (hasChildren && depth === 0) {
        if (hasActiveFilter && !nodeOrDescendantMatchesFilters(node, seguimientoFilterStatus, seguimientoFilterResponsable, depth)) {
          return;
        }
        const isExpanded = node.expanded !== false;
        html += `
          <tr class="bg-slate-50 font-bold border-t border-slate-200">
            <td class="py-2 px-3 text-slate-500 font-mono text-[11px]">${escapeHtml(node.clave || '')}</td>
            <td class="py-2 px-3 text-slate-900" style="padding-left: ${indent + 12}px">
              <div class="flex items-center gap-1.5 min-w-0">
                ${renderSeguimientoExpandToggle(node, isExpanded)}
                <span class="inline-block w-2 h-2 rounded-full shrink-0" style="background-color: ${escapeHtml(node.color || '#3b82f6')}"></span>
                <span class="truncate">${escapeHtml(node.descripcion)}</span>
                <span class="shrink-0">${renderPartidaNivel1ChatButton(node.id, node.clave, node.descripcion)}</span>
                ${!isExpanded ? `<span class="ml-1 px-1.5 py-0.5 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-mono shrink-0">Agrupado (${node.children.length})</span>` : ''}
              </div>
            </td>
            <td class="py-2 px-3"></td>
            <td class="p-1.5 align-middle">${renderParentConceptStatusCell(node)}</td>
            ${renderAvanceProgressCell(node, clampedAvance, barColor, { hasChildren: true, locked })}
            ${renderSeguimientoLinkCell(node, locked)}
          </tr>
        `;
        if (isExpanded) {
          walk(node.children, depth + 1, node.color || parentColor);
        }
      } else {
        if (hasActiveFilter && !nodeOrDescendantMatchesFilters(node, seguimientoFilterStatus, seguimientoFilterResponsable, depth)) {
          return;
        }

        const assignedEmails = getNodeResponsableEmails(node);
        const statusOpt = ESTATUS_OPTIONS.find(o => o.id === st) || ESTATUS_OPTIONS[0];

        const assignedSummary = assignedEmails.map(em => {
          const m = findMemberByEmail(members, em, fallbackMap);
          return `${m?.name || em.split('@')[0]}${m?.status === 'pending' ? ' (Invitación pendiente)' : ''}`;
        }).join(', ');

        const responsableTitle = assignedEmails.length > 0
          ? `${assignedSummary}${locked ? '' : ' — Clic para asignar más o cambiar'}`
          : (locked ? 'Sin responsable asignado' : 'Clic para asignar responsables o invitar colaborador');

        let responsableCellHtml = '';
        if (assignedEmails.length > 0) {
          const maxVisible = 4;
          const visibleEmails = assignedEmails.slice(0, maxVisible);
          const extraCount = assignedEmails.length - visibleEmails.length;
          const circlesHtml = visibleEmails.map(em => {
            const assignedMember = findMemberByEmail(members, em, fallbackMap);
            return renderMemberAvatarCircle(assignedMember, em, 'w-8 h-8', 'text-[11px]');
          }).join('');
          const extraBadge = extraCount > 0
            ? `<span class="w-8 h-8 rounded-full bg-slate-600 text-white font-bold text-[10px] inline-flex items-center justify-center ring-2 ring-white shadow-xs shrink-0 select-none">+${extraCount}</span>`
            : '';

          responsableCellHtml = `
            <button type="button"
                    data-seg-popover-trigger="true"
                    data-node-id="${escapeHtml(node.id)}"
                    onclick="toggleResponsablePopover(event, this)"
                    ${locked ? 'disabled' : ''}
                    class="group relative inline-flex items-center justify-center rounded-full p-0.5 transition-transform duration-150 ${locked ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer hover:scale-105 focus:outline-none'}"
                    title="${escapeHtml(responsableTitle)}">
              <span class="inline-flex items-center justify-center -space-x-2">
                ${circlesHtml}${extraBadge}
              </span>
            </button>
          `;
        } else {
          responsableCellHtml = `
            <button type="button"
                    data-seg-popover-trigger="true"
                    data-node-id="${escapeHtml(node.id)}"
                    onclick="toggleResponsablePopover(event, this)"
                    ${locked ? 'disabled' : ''}
                    class="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 text-slate-400 inline-flex items-center justify-center transition ${locked ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer active:scale-95'}"
                    title="${escapeHtml(responsableTitle)}">
              <i class="fa-solid fa-user-plus text-[11px]"></i>
            </button>
          `;
        }

        const isExpanded = node.expanded !== false;
        const rowClass = hasChildren
          ? 'bg-slate-50/70 hover:bg-purple-50/40 font-semibold transition'
          : 'hover:bg-purple-50/30 transition';
        const subCountBadge = hasChildren
          ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[10px] font-bold shrink-0" title="Concepto con ${node.children.length} subconceptos — ${isExpanded ? 'Desagrupado' : 'Agrupado'}">${node.children.length} sub${!isExpanded ? ' · agrupado' : ''}</span>`
          : '';

        html += `
          <tr class="${rowClass}">
            <td class="py-2 px-3 font-mono text-slate-400 text-[11px]">${escapeHtml(node.clave || '')}</td>
            <td class="py-2 px-3 ${hasChildren ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}" style="padding-left: ${indent + 12}px">
              <div class="flex items-start justify-between gap-1.5">
                <div class="flex items-start gap-1 flex-1 min-w-0">
                  ${hasChildren ? renderSeguimientoExpandToggle(node, isExpanded) : '<span class="w-5 shrink-0 inline-block"></span>'}
                  <span class="flex-1 min-w-0 leading-snug">${escapeHtml(node.descripcion)}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 mt-0.5">
                  ${subCountBadge}
                  ${renderPartidaNivel1ChatButton(node.id, node.clave, node.descripcion)}
                </div>
              </div>
            </td>
            <!-- Responsable (Círculo de foto de perfil + Selector / Invitar) -->
            <td class="py-1.5 px-3 text-center align-middle">
              ${responsableCellHtml}
            </td>
            <!-- Estatus (Botón estilo Monday.com) -->
            <td class="p-1.5 align-middle">
              ${hasChildren ? renderParentConceptStatusCell(node) : `
                <button type="button"
                        data-seg-popover-trigger="true"
                        data-node-id="${escapeHtml(node.id)}"
                        onclick="toggleEstatusPopover(event, this)"
                        ${locked ? 'disabled' : ''}
                        class="seg-status-btn group relative w-full h-8 px-3 rounded-[4px] font-bold text-xs text-white flex items-center justify-center shadow-2xs transition-all duration-150 ${locked ? 'opacity-85 cursor-not-allowed' : 'cursor-pointer hover:brightness-95 active:scale-[0.98]'}"
                        style="background-color: ${statusOpt.bgHex}; color: #ffffff;"
                        title="${locked ? 'Pestaña bloqueada (solo lectura)' : `Estatus: ${statusOpt.label} — Clic para cambiar`}">
                  <span class="truncate tracking-wide">${escapeHtml(statusOpt.label)}</span>
                  ${!locked ? '<i class="fa-solid fa-caret-down text-[10px] opacity-0 group-hover:opacity-90 transition-opacity absolute right-2"></i>' : ''}
                </button>
              `}
            </td>
            ${renderAvanceProgressCell(node, clampedAvance, barColor, { hasChildren, locked })}
            ${renderSeguimientoLinkCell(node, locked)}
          </tr>
        `;
        if (hasChildren && isExpanded) {
          walk(node.children, depth + 1, node.color || parentColor);
        }
      }
    });
  }

  walk(nodes);
  if (!html.trim()) {
    return `
      <tr>
        <td colspan="6" class="p-8 text-center text-slate-500">
          <i class="fa-solid fa-filter-circle-xmark text-2xl text-slate-300 mb-2 block"></i>
          <div class="font-bold text-xs text-slate-700">No hay entregables que coincidan con los filtros seleccionados.</div>
          <div class="text-[11px] text-slate-400 mt-0.5 mb-3">Ajusta el filtro de estatus o responsable para ver más elementos.</div>
          <button type="button"
                  onclick="clearSeguimientoFilters()"
                  class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition cursor-pointer shadow-2xs inline-flex items-center gap-1.5">
            <i class="fa-solid fa-rotate-left text-[11px]"></i>
            <span>Limpiar filtros</span>
          </button>
        </td>
      </tr>
    `;
  }
  return html;
}

function getResponsableTriggerButton(nodeId) {
  if (typeof document === 'undefined') return null;
  return Array.from(document.querySelectorAll('#view-seguimiento button[data-seg-popover-trigger="true"][data-node-id]'))
    .find(btn => btn.getAttribute('data-node-id') === nodeId && (btn.getAttribute('onclick') || '').includes('toggleResponsablePopover')) || null;
}

export function onSeguimientoInviteModalClosed() {
  pendingInviteAssignNodeId = null;
}

export function onSeguimientoMemberInvited(email) {
  const targetNodeId = pendingInviteAssignNodeId;
  pendingInviteAssignNodeId = null;
  if (!targetNodeId || !email) {
    const viewSeg = typeof document !== 'undefined' ? document.getElementById('view-seguimiento') : null;
    if (viewSeg && !viewSeg.classList.contains('hidden')) {
      renderSeguimientoView();
    }
    return;
  }
  toggleResponsableEmailOnNode(targetNodeId, email, { keepPopoverOpen: false, forceAdd: true });
}

export function toggleResponsableEmailOnNode(nodeId, emailVal, { keepPopoverOpen = true, forceAdd = false } = {}) {
  if (!canCurrentUserEditProject(getActiveProjectId()) || isTabLocked('seguimiento')) {
    showToast('🔒 La pestaña "Seguimiento" está bloqueada o en modo solo lectura.', 'warning');
    return;
  }

  const trimmed = String(emailVal || '').trim();
  const lowerTarget = trimmed.toLowerCase();

  function update(nodes) {
    for (const n of nodes) {
      if (n.id === nodeId) {
        if (!lowerTarget) {
          n.responsableEmails = [];
          n.responsableEmail = '';
        } else {
          const current = getNodeResponsableEmails(n);
          const existsIdx = current.findIndex(em => em.toLowerCase() === lowerTarget);
          let next = [...current];
          if (existsIdx >= 0) {
            if (!forceAdd) {
              next.splice(existsIdx, 1);
            }
          } else {
            next.push(trimmed);
          }
          n.responsableEmails = next;
          n.responsableEmail = next[0] || '';
        }
        return true;
      }
      if (Array.isArray(n.children) && n.children.length > 0) {
        if (update(n.children)) return true;
      }
    }
    return false;
  }

  update(state.treeData || []);
  persistLocalData();
  persistSeguimientoCloudSummary();
  renderSeguimientoView();

  if (keepPopoverOpen && lowerTarget) {
    const newBtn = getResponsableTriggerButton(nodeId);
    if (newBtn) {
      toggleResponsablePopover(null, newBtn);
    }
  }
}

export function openInviteFromSeguimiento(event = null, assignNodeId = null, defaultTab = 'invite') {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  pendingInviteAssignNodeId = assignNodeId || null;
  closeSeguimientoPopover();
  const pId = getActiveOrFallbackProjectId();
  openInviteModal(pId, defaultTab || 'invite');
}

export function toggleResponsablePopover(event, triggerBtn) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  if (!canCurrentUserEditProject(getActiveProjectId()) || isTabLocked('seguimiento')) {
    showToast('🔒 La pestaña "Seguimiento" está bloqueada o en modo solo lectura.', 'warning');
    return;
  }

  const nodeId = triggerBtn?.getAttribute('data-node-id');
  if (!nodeId) return;

  const key = `resp:${nodeId}`;
  if (event && activePopoverKey === key) {
    closeSeguimientoPopover();
    return;
  }
  closeSeguimientoPopover();
  activePopoverKey = key;

  const pId = getActiveOrFallbackProjectId();
  const members = getSeguimientoCollaborators(pId);
  const node = findNodeById(state.treeData || [], nodeId);
  const currentEmails = getNodeResponsableEmails(node);
  const currentSet = new Set(currentEmails.map(em => em.toLowerCase()));

  const popover = document.createElement('div');
  popover.id = 'seg-floating-popover';
  popover.className = 'fixed z-[99999] bg-white border border-slate-200 rounded-xl shadow-2xl p-2 flex flex-col gap-1.5';

  const memberItemsHtml = members.length === 0
    ? `<div class="py-3 px-2 text-center text-[11px] text-slate-400">No hay colaboradores en el proyecto aún.</div>`
    : members.map(m => {
        const lowerEmail = (m.email || '').trim().toLowerCase();
        const isSelected = lowerEmail !== '' && currentSet.has(lowerEmail);
        return `
          <button type="button"
                  data-member-email="${escapeHtml(m.email || '')}"
                  class="w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left transition cursor-pointer ${isSelected ? 'bg-purple-500/15 border border-purple-400' : 'hover:bg-slate-100 border border-transparent'}">
            ${renderMemberAvatarCircle(m, m.email, 'w-7 h-7', 'text-[10px]')}
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(m.name || m.email)}</div>
              <div class="text-[10px] text-slate-400 truncate">
                ${escapeHtml(m.role || 'colaborador')}${m.status === 'pending' ? ' · Invitación pendiente' : ''}
              </div>
            </div>
            <span class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300 text-transparent'}">
              <i class="fa-solid fa-check text-[9px]"></i>
            </span>
          </button>
        `;
      }).join('');

  popover.innerHTML = `
    <div class="px-2 py-1 border-b border-slate-100 flex items-center justify-between gap-2">
      <span class="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Asignar Responsables</span>
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-semibold text-slate-400">${members.length} disp.</span>
        <button type="button" data-action="close-popover" class="text-[10px] font-bold text-purple-600 hover:underline cursor-pointer">Listo</button>
      </div>
    </div>
    <div class="max-h-56 overflow-y-auto space-y-1 pr-0.5">
      ${memberItemsHtml}
      ${currentEmails.length > 0 ? `
        <button type="button"
                data-member-email=""
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-rose-600 transition cursor-pointer mt-1 border-t border-slate-100 pt-2">
          <i class="fa-solid fa-user-xmark text-[11px]"></i>
          <span>Quitar responsables</span>
        </button>
      ` : ''}
    </div>
    <div class="pt-1.5 border-t border-slate-100">
      <button type="button"
              data-action="invite"
              class="w-full py-1.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition active:scale-[0.98] cursor-pointer">
        <i class="fa-solid fa-user-plus text-[11px]"></i>
        <span>Invitar colaborador</span>
      </button>
    </div>
  `;

  popover.querySelectorAll('[data-member-email]').forEach(btn => {
    btn.addEventListener('click', () => {
      const emailVal = btn.getAttribute('data-member-email') ?? '';
      if (!emailVal) {
        closeSeguimientoPopover();
        toggleResponsableEmailOnNode(nodeId, '', { keepPopoverOpen: false });
      } else {
        toggleResponsableEmailOnNode(nodeId, emailVal, { keepPopoverOpen: true });
      }
    });
  });

  const closeBtn = popover.querySelector('[data-action="close-popover"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeSeguimientoPopover());
  }

  const inviteBtn = popover.querySelector('[data-action="invite"]');
  if (inviteBtn) {
    inviteBtn.addEventListener('click', (e) => {
      openInviteFromSeguimiento(e, nodeId, 'invite');
    });
  }

  document.body.appendChild(popover);
  const estHeight = Math.min(350, 120 + (members.length * 42));
  positionPopoverNearAnchor(popover, triggerBtn, 275, estHeight);
}

export function setConceptAndSubconceptosStatus(nodeId, nextStatus) {
  if (!canCurrentUserEditProject(getActiveProjectId()) || isTabLocked('seguimiento')) {
    showToast('🔒 La pestaña "Seguimiento" está bloqueada o en modo solo lectura.', 'warning');
    return;
  }

  const node = findNodeById(state.treeData || [], nodeId);
  if (!node) return;

  let count = 0;
  function walk(n) {
    n.estatus = nextStatus;
    const hasChildren = Array.isArray(n.children) && n.children.length > 0;
    if (!hasChildren) {
      count++;
      if (nextStatus === 'aprobado') {
        n.avancePorcentaje = 100;
      } else if (nextStatus === 'pendiente') {
        n.avancePorcentaje = 0;
      }
    } else {
      n.children.forEach(walk);
    }
  }

  walk(node);
  persistLocalData();
  persistSeguimientoCloudSummary();
  renderSeguimientoView();

  const opt = ESTATUS_OPTIONS.find(o => o.id === nextStatus);
  const statusLabel = opt?.label || nextStatus;
  showToast(`Se actualizaron ${count} subconceptos a "${statusLabel}".`, 'success');
}

export function toggleEstatusPopover(event, triggerBtn) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  if (!canCurrentUserEditProject(getActiveProjectId()) || isTabLocked('seguimiento')) {
    showToast('🔒 La pestaña "Seguimiento" está bloqueada o en modo solo lectura.', 'warning');
    return;
  }

  const nodeId = triggerBtn?.getAttribute('data-node-id');
  if (!nodeId) return;

  const node = findNodeById(state.treeData || [], nodeId);
  if (!node) return;

  if (Array.isArray(node.children) && node.children.length > 0) {
    toggleSubconceptosEstatusPopover(event, triggerBtn);
    return;
  }

  const key = `status:${nodeId}`;
  if (activePopoverKey === key) {
    closeSeguimientoPopover();
    return;
  }
  closeSeguimientoPopover();
  activePopoverKey = key;

  const currentStatus = node?.estatus || 'pendiente';

  const popover = document.createElement('div');
  popover.id = 'seg-floating-popover';
  popover.className = 'fixed z-[99999] bg-white border border-slate-200 rounded-xl shadow-2xl p-2 flex flex-col gap-1.5 min-w-[170px]';

  popover.innerHTML = `
    <div class="px-1.5 pb-1 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
      Seleccionar Estatus
    </div>
    ${ESTATUS_OPTIONS.map(opt => {
      const isCurrent = opt.id === currentStatus;
      return `
        <button type="button"
                data-status-id="${opt.id}"
                class="seg-status-btn w-full h-8 px-3 rounded-[4px] font-bold text-xs text-white flex items-center justify-center relative shadow-2xs transition-all duration-150 hover:brightness-95 active:scale-[0.98] cursor-pointer ${isCurrent ? 'ring-2 ring-offset-1 ring-slate-700' : ''}"
                style="background-color: ${opt.bgHex}; color: #ffffff;">
          <span class="tracking-wide">${escapeHtml(opt.label)}</span>
          ${isCurrent ? '<i class="fa-solid fa-check text-[10px] absolute right-2.5"></i>' : ''}
        </button>
      `;
    }).join('')}
  `;

  popover.querySelectorAll('[data-status-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      const nextStatus = btn.getAttribute('data-status-id');
      closeSeguimientoPopover();
      if (nextStatus) {
        updateEntregableSeguimiento(nodeId, 'estatus', nextStatus);
      }
    });
  });

  document.body.appendChild(popover);
  positionPopoverNearAnchor(popover, triggerBtn, 190, 230);
}

export function toggleSubconceptosEstatusPopover(event, triggerBtn) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  if (!canCurrentUserEditProject(getActiveProjectId()) || isTabLocked('seguimiento')) {
    showToast('🔒 La pestaña "Seguimiento" está bloqueada o en modo solo lectura.', 'warning');
    return;
  }

  const nodeId = triggerBtn?.getAttribute('data-node-id');
  if (!nodeId) return;

  const key = `parent-status:${nodeId}`;
  if (activePopoverKey === key) {
    closeSeguimientoPopover();
    return;
  }
  closeSeguimientoPopover();
  activePopoverKey = key;

  const node = findNodeById(state.treeData || [], nodeId);
  if (!node) return;

  const breakdown = getNodeDescendantStatusBreakdown(node);

  const popover = document.createElement('div');
  popover.id = 'seg-floating-popover';
  popover.className = 'fixed z-[99999] bg-white border border-slate-200 rounded-xl shadow-2xl p-2.5 flex flex-col gap-2 min-w-[240px]';

  const rowsHtml = ESTATUS_OPTIONS.map(opt => {
    const foundItem = breakdown.items.find(i => i.id === opt.id);
    const count = foundItem ? foundItem.count : 0;
    const pct = foundItem ? Math.round(foundItem.pct) : 0;
    const isUniformThis = breakdown.isUniform && breakdown.singleOpt?.id === opt.id;

    return `
      <button type="button"
              data-parent-status-id="${opt.id}"
              class="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition cursor-pointer text-left group ${isUniformThis ? 'bg-purple-50/70 border-purple-300 shadow-2xs ring-1 ring-purple-300' : 'border-transparent hover:bg-slate-100 hover:border-slate-200'}"
              title="Cambiar los ${breakdown.totalDescendants} subconceptos a ${escapeHtml(opt.label)}">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center text-white text-[8px] shadow-2xs" style="background-color: ${opt.bgHex};">
            <i class="${opt.icon}"></i>
          </span>
          <span class="text-xs font-semibold text-slate-700 group-hover:text-purple-700 truncate">${escapeHtml(opt.label)}</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
          <span class="${count === 0 ? 'text-slate-400' : 'font-bold text-slate-900'}">${count}</span>
          <span class="text-[10px] text-slate-400 font-mono">(${pct}%)</span>
          <i class="fa-solid fa-arrow-right text-[9px] text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"></i>
        </div>
      </button>
    `;
  }).join('');

  popover.innerHTML = `
    <div class="px-1.5 pb-1.5 border-b border-slate-100 flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5 min-w-0">
        <i class="fa-solid fa-list-check text-xs text-purple-600"></i>
        <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wider truncate">Estatus de Subconceptos</span>
      </div>
      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">${breakdown.totalDescendants} sub</span>
    </div>
    <div class="flex flex-col gap-0.5 my-1">
      ${rowsHtml}
    </div>
    <div class="pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 text-center leading-tight">
      <span class="font-semibold text-purple-600">Clic</span> en un estatus para aplicarlo a todos (${breakdown.totalDescendants})
    </div>
  `;

  popover.querySelectorAll('[data-parent-status-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      const nextStatus = btn.getAttribute('data-parent-status-id');
      closeSeguimientoPopover();
      if (nextStatus) {
        setConceptAndSubconceptosStatus(nodeId, nextStatus);
      }
    });
  });

  document.body.appendChild(popover);
  positionPopoverNearAnchor(popover, triggerBtn, 240, 260);
}

export function toggleResponsableFilterPopover(event, triggerBtn) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  if (!triggerBtn) return;

  const key = 'filter:responsable';
  if (activePopoverKey === key) {
    closeSeguimientoPopover();
    return;
  }
  closeSeguimientoPopover();
  activePopoverKey = key;

  const pId = getActiveOrFallbackProjectId();
  const members = getSeguimientoCollaborators(pId);
  const fallbackMap = buildFallbackProfileMap();
  const filterMeta = collectSeguimientoFilterStats(
    state.treeData || [],
    members,
    fallbackMap,
    seguimientoFilterStatus,
    seguimientoFilterResponsable
  );

  const popover = document.createElement('div');
  popover.id = 'seg-floating-popover';
  popover.className = 'fixed z-[99999] bg-white border border-slate-200 rounded-xl shadow-2xl p-2 flex flex-col gap-1.5';

  const makeCheckmark = (isSelected) => `
    <span class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300 text-transparent'}">
      <i class="fa-solid fa-check text-[9px]"></i>
    </span>
  `;

  const memberItemsHtml = filterMeta.responsableEntries.map(entry => {
    const isSelected = seguimientoFilterResponsable === entry.lowerEmail;
    const totalCount = entry.count + entry.parentCount;
    const displayName = entry.member?.name || entry.email.split('@')[0];
    const subtitle = entry.member?.status === 'pending'
      ? 'Invitación pendiente'
      : (entry.member?.role || entry.email);
    return `
      <button type="button"
              data-resp-filter="${escapeHtml(entry.lowerEmail)}"
              class="w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left transition cursor-pointer ${isSelected ? 'bg-purple-500/15 border border-purple-400' : 'hover:bg-slate-100 border border-transparent'}">
        ${renderMemberAvatarCircle(entry.member, entry.email, 'w-7 h-7', 'text-[10px]')}
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(displayName)}</div>
          <div class="text-[10px] text-slate-400 truncate">${escapeHtml(subtitle)}</div>
        </div>
        <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${totalCount > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'}">${totalCount}</span>
        ${makeCheckmark(isSelected)}
      </button>
    `;
  }).join('');

  const isAllSelected = seguimientoFilterResponsable === 'all';
  const isUnassignedSelected = seguimientoFilterResponsable === 'unassigned';

  popover.innerHTML = `
    <div class="px-2 py-1 border-b border-slate-100 flex items-center justify-between gap-2">
      <span class="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Filtrar por Responsable</span>
      <span class="text-[10px] font-semibold text-slate-400">${filterMeta.responsableEntries.length} resp.</span>
    </div>
    <div class="max-h-64 overflow-y-auto space-y-1 pr-0.5">
      <button type="button"
              data-resp-filter="all"
              class="w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left transition cursor-pointer ${isAllSelected ? 'bg-purple-500/15 border border-purple-400' : 'hover:bg-slate-100 border border-transparent'}">
        <span class="w-7 h-7 rounded-full bg-purple-100 text-purple-700 inline-flex items-center justify-center shrink-0">
          <i class="fa-solid fa-users text-[11px]"></i>
        </span>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-slate-800">Todos los responsables</div>
          <div class="text-[10px] text-slate-400">Mostrar cualquier asignación</div>
        </div>
        <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 bg-slate-100 text-slate-700">${filterMeta.allForStatusCount}</span>
        ${makeCheckmark(isAllSelected)}
      </button>

      <button type="button"
              data-resp-filter="unassigned"
              class="w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left transition cursor-pointer ${isUnassignedSelected ? 'bg-purple-500/15 border border-purple-400' : 'hover:bg-slate-100 border border-transparent'}">
        <span class="w-7 h-7 rounded-full border-2 border-dashed border-slate-300 text-slate-500 inline-flex items-center justify-center shrink-0">
          <i class="fa-solid fa-user-slash text-[10px]"></i>
        </span>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-slate-800">Sin asignar</div>
          <div class="text-[10px] text-slate-400">Entregables sin responsable</div>
        </div>
        <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${filterMeta.unassignedCount > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'}">${filterMeta.unassignedCount}</span>
        ${makeCheckmark(isUnassignedSelected)}
      </button>

      ${filterMeta.responsableEntries.length > 0 ? '<div class="border-t border-slate-100 my-1"></div>' : ''}
      ${memberItemsHtml}
    </div>
  `;

  popover.querySelectorAll('[data-resp-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextResp = btn.getAttribute('data-resp-filter') || 'all';
      closeSeguimientoPopover();
      setSeguimientoResponsableFilter(nextResp);
    });
  });

  document.body.appendChild(popover);
  const estHeight = Math.min(360, 140 + (filterMeta.responsableEntries.length * 42));
  positionPopoverNearAnchor(popover, triggerBtn, 275, estHeight);
}

// Handlers de actualización
export function setSeguimientoFilter(st) {
  seguimientoFilterStatus = st || 'all';
  renderSeguimientoView();
}

export function setSeguimientoResponsableFilter(respKey) {
  const normalized = String(respKey || 'all').trim().toLowerCase();
  seguimientoFilterResponsable = normalized || 'all';
  renderSeguimientoView();
}

export function clearSeguimientoFilters() {
  seguimientoFilterStatus = 'all';
  seguimientoFilterResponsable = 'all';
  renderSeguimientoView();
}

export function toggleSeguimientoNodeExpand(nodeId, event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  const node = findNodeById(state.treeData || [], nodeId);
  if (!node || !Array.isArray(node.children) || node.children.length === 0) return;
  node.expanded = node.expanded === false;
  if (canCurrentUserEditProject(getActiveProjectId()) && !isTabLocked('seguimiento')) {
    persistLocalData();
  }
  renderSeguimientoView();
}

export function setAllSeguimientoExpanded(expandedState) {
  const nextVal = Boolean(expandedState);
  function walkSet(nodes) {
    (nodes || []).forEach(n => {
      if (Array.isArray(n.children) && n.children.length > 0) {
        n.expanded = nextVal;
        walkSet(n.children);
      }
    });
  }
  walkSet(state.treeData || []);
  if (canCurrentUserEditProject(getActiveProjectId()) && !isTabLocked('seguimiento')) {
    persistLocalData();
  }
  renderSeguimientoView();
}

export function onAvanceBarClick(event, barEl) {
  if (!canCurrentUserEditProject(getActiveProjectId()) || isTabLocked('seguimiento')) {
    showToast('🔒 La pestaña "Seguimiento" está bloqueada o en modo solo lectura.', 'warning');
    return;
  }
  if (!barEl) return;
  const nodeId = barEl.dataset.nodeId;
  if (!nodeId) return;
  const targetNode = findNodeById(state.treeData || [], nodeId);
  if (Array.isArray(targetNode?.children) && targetNode.children.length > 0) {
    showToast('Este concepto tiene subconceptos; su % de avance se calcula automáticamente.', 'info');
    return;
  }
  const rect = barEl.getBoundingClientRect();
  if (!rect.width) return;
  const ratio = (event.clientX - rect.left) / rect.width;
  const rawPct = Math.max(0, Math.min(100, ratio * 100));
  const snappedPct = Math.round(rawPct / 5) * 5;
  updateEntregableSeguimiento(nodeId, 'avancePorcentaje', snappedPct);
}

export function updateEntregableSeguimiento(nodeId, field, val) {
  if (!canCurrentUserEditProject(getActiveProjectId()) || isTabLocked('seguimiento')) {
    showToast('🔒 La pestaña "Seguimiento" está bloqueada o en modo solo lectura.', 'warning');
    return;
  }

  let normalizedVal = val;
  if (field === 'archivoLink') {
    const linkCheck = normalizeSeguimientoLink(val);
    if (!linkCheck.valid) {
      showToast('Ingresa un link válido (ejemplo: https://drive.google.com/...)', 'warning');
      renderSeguimientoView();
      return;
    }
    normalizedVal = linkCheck.url;
  }

  let blockedAvanceEdit = false;
  function update(nodes) {
    for (const n of nodes) {
      if (n.id === nodeId || String(n.id) === String(nodeId)) {
        const nodeHasChildren = Array.isArray(n.children) && n.children.length > 0;
        if (nodeHasChildren && field === 'avancePorcentaje') {
          blockedAvanceEdit = true;
          return true;
        }
        if (nodeHasChildren && field === 'estatus') {
          setConceptAndSubconceptosStatus(n.id, normalizedVal);
          return true;
        }
        let nextVal = normalizedVal;
        if (field === 'avancePorcentaje') {
          const parsed = parseFloat(normalizedVal);
          nextVal = Math.max(0, Math.min(100, isNaN(parsed) ? 0 : parsed));
        }
        n[field] = nextVal;
        // Si el usuario cambia el estatus en conceptos sin subconceptos, sincronizar avance
        if (!nodeHasChildren && field === 'estatus' && val === 'aprobado' && (!n.avancePorcentaje || parseFloat(n.avancePorcentaje) < 100)) {
          n.avancePorcentaje = 100;
        } else if (!nodeHasChildren && field === 'estatus' && val === 'pendiente') {
          n.avancePorcentaje = 0;
        }
        return true;
      }
      if (n.children && n.children.length > 0) {
        if (update(n.children)) return true;
      }
    }
    return false;
  }
  update(state.treeData || []);
  if (blockedAvanceEdit) {
    showToast('Este concepto tiene subconceptos; su % de avance se calcula automáticamente a partir de ellos.', 'info');
    renderSeguimientoView();
    return;
  }
  persistLocalData();
  persistSeguimientoCloudSummary();
  renderSeguimientoView();
}

// Exponer en window para llamadas directas
if (typeof window !== 'undefined') {
  window.setSeguimientoFilter = setSeguimientoFilter;
  window.setSeguimientoResponsableFilter = setSeguimientoResponsableFilter;
  window.clearSeguimientoFilters = clearSeguimientoFilters;
  window.toggleSeguimientoNodeExpand = toggleSeguimientoNodeExpand;
  window.setAllSeguimientoExpanded = setAllSeguimientoExpanded;
  window.updateEntregableSeguimiento = updateEntregableSeguimiento;
  window.setConceptAndSubconceptosStatus = setConceptAndSubconceptosStatus;
  window.onAvanceBarClick = onAvanceBarClick;
  window.renderSeguimientoView = renderSeguimientoView;
  window.openInviteFromSeguimiento = openInviteFromSeguimiento;
  window.onSeguimientoMemberInvited = onSeguimientoMemberInvited;
  window.onSeguimientoInviteModalClosed = onSeguimientoInviteModalClosed;
  window.toggleResponsablePopover = toggleResponsablePopover;
  window.toggleResponsableFilterPopover = toggleResponsableFilterPopover;
  window.toggleEstatusPopover = toggleEstatusPopover;
  window.toggleSubconceptosEstatusPopover = toggleSubconceptosEstatusPopover;
  window.closeSeguimientoPopover = closeSeguimientoPopover;
}
