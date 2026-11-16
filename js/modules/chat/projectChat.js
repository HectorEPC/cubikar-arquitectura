// js/modules/chat/projectChat.js
// Bitácora de Obra / Ventana de Chat por Proyecto dividida en 3 pestañas oficiales:
//   División 1: ALCANCE Y PRESUPUESTO
//   División 2: SEGUIMIENTO Y CALENDARIO
//   División 3: ESTIMACIONES
// Conectada con Partidas/Conceptos (/), Usuarios Asignados (@), Estimaciones (#),
// Reportes (!), Notificaciones de Menciones y Formato Imprimible de Bitácora de Obra.

import { state } from '../../state/store.js?v=20261116_cf7';
import { getActiveProjectId } from '../../config/constants.js?v=20261116_cf7';
import {
  getProjectById,
  getProjectsList,
  getCurrentUser,
  saveCurrentUser,
  getLastKnownUser,
  AVATARS_BY_SEX,
  getPendingInvitationsForUser,
  acceptProjectInvitation,
  rejectProjectInvitation,
  getStoredInvitations,
  saveStoredInvitations,
  getStoredPlanInvitations,
  saveStoredPlanInvitations,
  getDeletedProjectsList
} from '../portal/projectService.js?v=20261116_cf7';
import { getSupabaseClient, isSupabaseConfigured } from '../../core/supabaseClient.js?v=20261116_cf7';
import { loadEstimacionesData, setActiveEstimacionId } from '../estimaciones/estimacionesModel.js?v=20261116_cf7';
import { showToast } from '../../ui/notifications.js?v=20261116_cf7';
import { getActiveUserConsumptionAlert } from '../admin/cubikarAdmin.js?v=20261116_cf7';
import { openSubscriptionModal } from '../portal/subscriptionModal.js?v=20261116_cf7';
import { openPrintWindow } from '../io/printService.js?v=20261116_cf7';
import { broadcastChatMessage, broadcastChatDelete } from '../../core/realtimeSync.js?v=20261116_cf7';
import { scheduleChatCloudSync } from '../../core/cloudModulesSyncService.js?v=20261116_cf7';

let lastSentChatGuard = { text: '', ts: 0 };

export const CHAT_DIVISIONS = [
  {
    id: 'alcance_presupuesto',
    numero: 'División 1',
    shortLabel: 'ALCANCE Y PRESUPUESTO',
    title: 'División 1 · Alcance y Presupuesto',
    subtitle: 'Tabla de Alcances, Precios, FCARM, Subcontratos y Cotizaciones',
    icon: 'fa-layer-group',
    accent: 'indigo',
    codePrefix: 'AP'
  },
  {
    id: 'seguimiento_calendario',
    numero: 'División 2',
    shortLabel: 'SEGUIMIENTO Y CALENDARIO',
    title: 'División 2 · Seguimiento y Calendario',
    subtitle: 'Avances de Entregables, Revisiones Técnicas, Gantt y Ruta Crítica',
    icon: 'fa-bars-progress',
    accent: 'amber',
    codePrefix: 'SC'
  },
  {
    id: 'estimaciones',
    numero: 'División 3',
    shortLabel: 'ESTIMACIONES',
    title: 'División 3 · Estimaciones',
    subtitle: 'Estimaciones, Anticipos, Cobros, Flujo de Caja y Finiquito',
    icon: 'fa-file-invoice-dollar',
    accent: 'emerald',
    codePrefix: 'EST'
  }
];

export const BITACORA_ENTRY_TYPES = [
  {
    id: 'nota',
    label: 'Nota Técnica',
    shortLabel: 'Nota',
    icon: 'fa-clipboard-list',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    printBg: '#f1f5f9',
    printColor: '#334155',
    printBorder: '#cbd5e1'
  },
  {
    id: 'orden',
    label: 'Orden / Instrucción',
    shortLabel: 'Orden',
    icon: 'fa-bullhorn',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    printBg: '#e0e7ff',
    printColor: '#3730a3',
    printBorder: '#a5b4fc'
  },
  {
    id: 'avance',
    label: 'Avance de Obra',
    shortLabel: 'Avance',
    icon: 'fa-chart-line',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
    printBg: '#e0f2fe',
    printColor: '#075985',
    printBorder: '#7dd3fc'
  },
  {
    id: 'acuerdo',
    label: 'Acuerdo / Autorización',
    shortLabel: 'Acuerdo',
    icon: 'fa-circle-check',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    printBg: '#d1fae5',
    printColor: '#065f46',
    printBorder: '#6ee7b7'
  },
  {
    id: 'incidencia',
    label: 'Incidencia / Alerta',
    shortLabel: 'Incidencia',
    icon: 'fa-triangle-exclamation',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    printBg: '#ffe4e6',
    printColor: '#9f1239',
    printBorder: '#fda4af'
  }
];

let isChatDockExpanded = false; // Inicia plegado; se abre desde la barra lateral o botón de comentarios
let isChatMaximized = false; // Permite maximizar o restaurar el tamaño de la ventana de bitácora
let activeChatDivision = 'alcance_presupuesto'; // 'alcance_presupuesto' | 'seguimiento_calendario' | 'estimaciones'
let activeChatFilter = 'all'; // 'all' | 'mentions' | 'orden' | 'avance' | 'acuerdo' | 'incidencia' | 'estimaciones' | 'reportes'
let activeChatSearch = ''; // Búsqueda rápida por folio, texto, autor o etiqueta
let activePartidaFilterId = null; // ID de Partida/Concepto cuando se filtra con el botón de comentarios
let activeTagPickerKind = null; // 'user' | 'partida' | 'estimacion' | 'reporte' | null
let selectedAuthorHandle = null;
let selectedNotificationsHandle = '__self__'; // '__self__' (usuario actual) o 'all' o @Usuario específico
let isNotificationsPopoverOpen = false;
let highlightedMessageId = null;
let pendingComposerEntryType = 'nota';
let moveMenuMessageId = null;
let isPrintModalOpen = false;

let pendingComposerTags = {
  partidaId: null,
  mentions: [],
  estimaciones: [],
  reportes: []
};

let onExternalRefreshCallback = null;
let isRefreshingFromChat = false;

export function setProjectChatRefreshCallback(cb) {
  onExternalRefreshCallback = cb;
}

function triggerExternalChatRefresh() {
  if (typeof onExternalRefreshCallback !== 'function') return;
  isRefreshingFromChat = true;
  try {
    onExternalRefreshCallback();
  } finally {
    isRefreshingFromChat = false;
  }
}

export function getChatDivisionMeta(divisionId) {
  return CHAT_DIVISIONS.find(d => d.id === divisionId) || CHAT_DIVISIONS[0];
}

export function getEntryTypeMeta(entryTypeId) {
  return BITACORA_ENTRY_TYPES.find(t => t.id === entryTypeId) || BITACORA_ENTRY_TYPES[0];
}

export function getDivisionForWorkspaceTab(tabId) {
  const t = String(tabId || '').toLowerCase();
  if (t === 'estimaciones') return 'estimaciones';
  if (t === 'seguimiento' || t === 'calendario') return 'seguimiento_calendario';
  return 'alcance_presupuesto';
}

function getActiveWorkspaceTabId() {
  if (typeof document === 'undefined') return 'alcances';
  const candidates = [
    { viewId: 'view-estimaciones', tab: 'estimaciones' },
    { viewId: 'view-calendario', tab: 'calendario' },
    { viewId: 'view-seguimiento', tab: 'seguimiento' },
    { viewId: 'view-presupuesto', tab: 'presupuesto' },
    { viewId: 'view-insumos', tab: 'presupuesto' },
    { viewId: 'view-alcances', tab: 'alcances' },
    { viewId: 'view-cat', tab: 'alcances' }
  ];
  for (const item of candidates) {
    const el = document.getElementById(item.viewId);
    if (el && !el.classList.contains('hidden')) {
      return item.tab;
    }
  }
  return 'alcances';
}

function formatBitacoraFolio(folioNumber) {
  const num = Math.max(1, parseInt(folioNumber, 10) || 1);
  return `BIT-${String(num).padStart(3, '0')}`;
}

function inferMessageDivision(m) {
  if (!m) return 'alcance_presupuesto';
  if (m.division && CHAT_DIVISIONS.some(d => d.id === m.division)) {
    return m.division;
  }
  const estList = Array.isArray(m.estimaciones) ? m.estimaciones : [];
  const repList = Array.isArray(m.reportes) ? m.reportes : [];
  const textLower = String(m.text || '').toLowerCase();

  const hasRealEstTag = estList.some(e => {
    const s = String(e || '').toLowerCase();
    return s.includes('estimación') || s.includes('estimacion');
  });
  const hasEstReport = repList.some(r => {
    const s = String(r || '').toLowerCase();
    return s.includes('estimacion') || s.includes('flujo');
  });
  if (hasRealEstTag || hasEstReport) {
    return 'estimaciones';
  }

  const hasSegCalReport = repList.some(r => {
    const s = String(r || '').toLowerCase();
    return s.includes('seguimiento') || s.includes('bitacora') || s.includes('bitácora') || s.includes('calendario') || s.includes('gantt') || s.includes('critica') || s.includes('crítica');
  });
  if (hasSegCalReport) {
    return 'seguimiento_calendario';
  }

  const hasAlcPresReport = repList.some(r => {
    const s = String(r || '').toLowerCase();
    return s.includes('alcance') || s.includes('presupuesto') || s.includes('fcarm');
  });
  const hasPresEstTag = estList.some(e => String(e || '').toLowerCase().includes('presupuesto'));
  if (hasAlcPresReport || hasPresEstTag) {
    return 'alcance_presupuesto';
  }

  if (textLower.includes('estimación') || textLower.includes('estimacion') || textLower.includes('finiquito') || textLower.includes('anticipo') || textLower.includes('spei')) {
    return 'estimaciones';
  }
  if (textLower.includes('calendario') || textLower.includes('gantt') || textLower.includes('ruta crítica') || textLower.includes('ruta critica') || textLower.includes('seguimiento') || textLower.includes('avance')) {
    return 'seguimiento_calendario';
  }
  return 'alcance_presupuesto';
}

function inferMessageEntryType(m) {
  if (!m) return 'nota';
  if (m.entryType && BITACORA_ENTRY_TYPES.some(t => t.id === m.entryType)) {
    return m.entryType;
  }
  const t = String(m.text || '').toLowerCase();
  if (t.includes('alerta') || t.includes('holgura') || t.includes('retraso') || t.includes('incidencia') || t.includes('riesgo') || t.includes('suspensión')) {
    return 'incidencia';
  }
  if (t.includes('autorizada') || t.includes('autorizado') || t.includes('aprobado') || t.includes('acuerdo') || t.includes('visto bueno') || t.includes('candados')) {
    return 'acuerdo';
  }
  if (t.includes('coordina') || t.includes('recuerden') || t.includes('asignaciones') || t.includes('instrucción')) {
    return 'orden';
  }
  if (t.includes('avance') || t.includes('%') || t.includes('concluyó') || t.includes('subí el') || t.includes('transferencia')) {
    return 'avance';
  }
  return 'nota';
}

export function getMessageDivision(m) {
  return inferMessageDivision(m);
}

function normalizeProjectChatMessagesList(rawMessages) {
  const list = Array.isArray(rawMessages) ? rawMessages : [];
  let maxFolio = 0;
  list.forEach(m => {
    const n = parseInt(m && m.folioNumber, 10);
    if (Number.isFinite(n) && n > maxFolio) maxFolio = n;
  });

  let migrated = false;
  const normalized = list.map((m, idx) => {
    if (!m || typeof m !== 'object') return m;
    const div = m.division && CHAT_DIVISIONS.some(d => d.id === m.division)
      ? m.division
      : inferMessageDivision(m);
    const entryType = m.entryType && BITACORA_ENTRY_TYPES.some(t => t.id === m.entryType)
      ? m.entryType
      : inferMessageEntryType(m);

    let folioNumber = parseInt(m.folioNumber, 10);
    if (!Number.isFinite(folioNumber) || folioNumber < 1) {
      folioNumber = maxFolio > 0 ? (maxFolio + 1) : (idx + 1);
      if (folioNumber > maxFolio) maxFolio = folioNumber;
      migrated = true;
    }
    const folio = m.folio || formatBitacoraFolio(folioNumber);
    if (m.division !== div || m.entryType !== entryType || m.folio !== folio) {
      migrated = true;
    }
    return {
      ...m,
      division: div,
      entryType,
      folioNumber,
      folio
    };
  });

  return { list: normalized, migrated };
}

export function getChatStorageKey(projectId = null) {
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  return `adm_arq_project_chat_${pid}`;
}

export function generateSeedProjectChatMessages(projectId = null) {
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  const today = new Date();
  const formatTimeAgo = (daysAgo, hour, minute) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    return `${dateStr} • ${hh}:${mm}`;
  };

  return [
    {
      id: `seed_msg_01_${pid}`,
      folioNumber: 1,
      folio: 'BIT-001',
      division: 'alcance_presupuesto',
      entryType: 'orden',
      authorName: 'Arq. Director (Hepc 90)',
      authorHandle: '@Arq.Director',
      authorRole: 'Director de Proyecto',
      authorInitials: 'AD',
      time: formatTimeAgo(5, 8, 30),
      partidaId: '1',
      mentions: ['@Arq.Roberto.Mendez.Silva', '@Ing.Mariana.Torres.Morales'],
      estimaciones: [],
      reportes: ['!Tabla de Alcances'],
      readBy: ['__all__'],
      text: 'Apertura de Bitácora: Equipo, damos inicio formal a la gestión del proyecto. En la Tabla de Alcances he configurado el árbol base de entregables con las 5 partidas del despacho: 1) Estudios Preliminares y Topografía, 2) Anteproyecto Arquitectónico, 3) Proyecto Ejecutivo, 4) Ingenierías y 5) Trámites. @Arq.Roberto.Mendez.Silva por favor coordina el levantamiento de topografía y los sondeos con el laboratorio de mecánica de suelos.'
    },
    {
      id: `seed_msg_02_${pid}`,
      folioNumber: 2,
      folio: 'BIT-002',
      division: 'seguimiento_calendario',
      entryType: 'avance',
      authorName: 'Arq. Roberto Méndez Silva',
      authorHandle: '@Arq.Roberto.Mendez.Silva',
      authorRole: 'Coordinador de Proyecto',
      authorInitials: 'RM',
      time: formatTimeAgo(4, 11, 15),
      partidaId: '1',
      mentions: ['@Arq.Director', '@Ing.Mariana.Torres.Morales'],
      estimaciones: [],
      reportes: ['!Tabla de Alcances', '!Seguimiento y Bitácora'],
      readBy: ['__all__'],
      text: 'Enterado @Arq.Director. La brigada concluyó el levantamiento con estación total; adjunté el archivo Topografia_Curvas_Nivel.dwg con curvas de nivel cada 50 cm. Asimismo, el laboratorio entregó el Informe_Geotecnia_Laboratorio.pdf con capacidad portante de 14.5 ton/m² a 1.80 m de profundidad para cimentación por zapatas. En la pestaña Seguimiento cambié el estatus de la Partida 1 a Aprobado con avance al 100%.'
    },
    {
      id: `seed_msg_03_${pid}`,
      folioNumber: 3,
      folio: 'BIT-003',
      division: 'alcance_presupuesto',
      entryType: 'nota',
      authorName: 'Ing. Mariana Torres Morales',
      authorHandle: '@Ing.Mariana.Torres.Morales',
      authorRole: 'Coordinadora de Costos / FCARM',
      authorInitials: 'MT',
      time: formatTimeAgo(4, 15, 45),
      partidaId: '1',
      mentions: ['@Arq.Director', '@Arq.Roberto.Mendez.Silva'],
      estimaciones: ['#Presupuesto_FCARM'],
      reportes: ['!1. Presupuesto / FCARM'],
      readBy: ['__all__'],
      text: 'He ingresado a la pestaña 1. Presupuesto para cargar la matriz de costos directos del proyecto:\n• Subcontratos externos: Topografía ($8,500), Mecánica de suelos ($16,000), Cálculo estructural ($28,000) e Instalaciones MEP ($26,000), totalizando $78,500 MXN.\n• Horas-hombre estimadas de diseño: 184 hrs de taller a costo interno de $380.00/hr ($69,920 MXN).\n• Costo total de producción directa: $148,420 MXN.\nCon el margen de utilidad deseado del 35.00%, el precio de venta sugerido al cliente es de $228,338.46 MXN.'
    },
    {
      id: `seed_msg_04_${pid}`,
      folioNumber: 4,
      folio: 'BIT-004',
      division: 'alcance_presupuesto',
      entryType: 'nota',
      authorName: 'Ing. Mariana Torres Morales',
      authorHandle: '@Ing.Mariana.Torres.Morales',
      authorRole: 'Coordinadora de Costos / FCARM',
      authorInitials: 'MT',
      time: formatTimeAgo(3, 9, 20),
      partidaId: '2',
      mentions: ['@Arq.Director'],
      estimaciones: ['#Presupuesto_FCARM'],
      reportes: ['!1. Presupuesto / FCARM'],
      readBy: ['__all__'],
      text: '@Arq.Director realicé el análisis con el Arancel Oficial FCARM (Federación de Colegios de Arquitectos de la República Mexicana). Para 450 m² a $14,500/m² ($6,525,000 MXN estimados de obra) y factor C=0.048, el honorario mínimo por arancel es de $313,200.00 MXN. Nuestro precio de venta al cliente ($228,338.46 MXN) ofrece un 27% de ventaja comercial frente al arancel oficial asegurando el 35% de utilidad neta para el despacho.'
    },
    {
      id: `seed_msg_05_${pid}`,
      folioNumber: 5,
      folio: 'BIT-005',
      division: 'alcance_presupuesto',
      entryType: 'acuerdo',
      authorName: 'Arq. Director (Hepc 90)',
      authorHandle: '@Arq.Director',
      authorRole: 'Director de Proyecto',
      authorInitials: 'AD',
      time: formatTimeAgo(3, 11, 0),
      partidaId: '2',
      mentions: ['@Ing.Mariana.Torres.Morales', '@Arq.Roberto.Mendez.Silva'],
      estimaciones: ['#Presupuesto_FCARM'],
      reportes: ['!1. Presupuesto / FCARM', '!Tabla de Alcances'],
      readBy: ['__all__'],
      text: 'Excelente análisis comparativo @Ing.Mariana.Torres.Morales, queda autorizada la cotización. En Seguimiento formalicé las asignaciones de trabajo: @Arq.Roberto.Mendez.Silva lidera el diseño conceptual y plantas arquitectónicas; @Ing.Mariana.Torres.Morales supervisa cuantificaciones, memorias de cálculo y subcontratos técnicos. Recuerden asentar en esta Bitácora cada iteración con el cliente.'
    },
    {
      id: `seed_msg_06_${pid}`,
      folioNumber: 6,
      folio: 'BIT-006',
      division: 'seguimiento_calendario',
      entryType: 'avance',
      authorName: 'Arq. Roberto Méndez Silva',
      authorHandle: '@Arq.Roberto.Mendez.Silva',
      authorRole: 'Coordinador de Proyecto',
      authorInitials: 'RM',
      time: formatTimeAgo(3, 16, 10),
      partidaId: '2',
      mentions: ['@Arq.Director'],
      estimaciones: [],
      reportes: ['!Seguimiento y Bitácora'],
      readBy: ['__all__'],
      text: 'Actualización en Seguimiento sobre la Partida 2 (Anteproyecto Arquitectónico):\n1) Concepto 2.1 (Programa y zonificación funcional): Aprobado al 100%.\n2) Concepto 2.2 (Plantas y modelo 3D): 75% En Proceso; subí el archivo Modelo_Volumetrico_RevA.skp.\n3) Concepto 2.3 (Renders fotorrealistas de fachada e interiores): 50% En Proceso.\nEl sistema computa un % de avance real ponderado del 68.4% en la partida de anteproyecto.'
    },
    {
      id: `seed_msg_07_${pid}`,
      folioNumber: 7,
      folio: 'BIT-007',
      division: 'seguimiento_calendario',
      entryType: 'nota',
      authorName: 'Arq. Roberto Méndez Silva',
      authorHandle: '@Arq.Roberto.Mendez.Silva',
      authorRole: 'Coordinador de Proyecto',
      authorInitials: 'RM',
      time: formatTimeAgo(2, 10, 30),
      partidaId: '3',
      mentions: ['@Arq.Director', '@Ing.Mariana.Torres.Morales'],
      estimaciones: [],
      reportes: ['!3. Calendario y Ruta Crítica'],
      readBy: ['__all__'],
      text: 'He configurado la pestaña 3. Calendario con el cronograma Gantt general del proyecto:\n• Plazo de ejecución total: 48 días hábiles.\n• Dependencias de trabajo: La partida de cálculo estructural (4.1) tiene predecesoras obligatorias: la mecánica de suelos (1.2) y el visto bueno del anteproyecto (2.2).\n• Fecha límite para entrega de paquete de planos ejecutivos: 28 de noviembre.'
    },
    {
      id: `seed_msg_08_${pid}`,
      folioNumber: 8,
      folio: 'BIT-008',
      division: 'seguimiento_calendario',
      entryType: 'incidencia',
      authorName: 'Ing. Mariana Torres Morales',
      authorHandle: '@Ing.Mariana.Torres.Morales',
      authorRole: 'Coordinadora de Costos / FCARM',
      authorInitials: 'MT',
      time: formatTimeAgo(2, 14, 20),
      partidaId: '4',
      mentions: ['@Arq.Roberto.Mendez.Silva', '@Arq.Director'],
      estimaciones: [],
      reportes: ['!3. Calendario y Ruta Crítica'],
      readBy: ['__all__'],
      text: '@Arq.Roberto.Mendez.Silva estuve revisando la Ruta Crítica en el cronograma Gantt. La holgura libre para ingenierías de instalaciones y estructura es de solo 2 días. El sistema disparó una alerta de entrega para el 15 de noviembre: el estructurista necesita los ejes de columnas congelados para finalizar las armaduras de cimentación y vigas de concreto.'
    },
    {
      id: `seed_msg_09_${pid}`,
      folioNumber: 9,
      folio: 'BIT-009',
      division: 'seguimiento_calendario',
      entryType: 'acuerdo',
      authorName: 'Arq. Roberto Méndez Silva',
      authorHandle: '@Arq.Roberto.Mendez.Silva',
      authorRole: 'Coordinador de Proyecto',
      authorInitials: 'RM',
      time: formatTimeAgo(2, 17, 40),
      partidaId: '3',
      mentions: ['@Ing.Mariana.Torres.Morales', '@Arq.Director'],
      estimaciones: [],
      reportes: ['!Seguimiento y Bitácora', '!Tabla de Alcances'],
      readBy: ['__all__'],
      text: 'Registrado en Bitácora [Nota técnica #004]:\nSe ajustó la modulación de cancelería y se fijaron definitivamente los ejes estructurales A a F y 1 a 6. Subí el entregable Planos_Arquitectonicos_RevB.dwg en la Partida 3.1 con estatus En Revisión y 40% de avance. Con esto liberamos la ruta crítica para el despacho de cálculo estructural.'
    },
    {
      id: `seed_msg_10_${pid}`,
      folioNumber: 10,
      folio: 'BIT-010',
      division: 'estimaciones',
      entryType: 'nota',
      authorName: 'Ing. Mariana Torres Morales',
      authorHandle: '@Ing.Mariana.Torres.Morales',
      authorRole: 'Coordinadora de Costos / FCARM',
      authorInitials: 'MT',
      time: formatTimeAgo(1, 9, 15),
      partidaId: '2',
      mentions: ['@Arq.Director'],
      estimaciones: ['#Estimación No. 1'],
      reportes: ['!4. Estimaciones y Flujo'],
      readBy: ['__all__'],
      text: 'En la pestaña 4. Estimaciones definí el calendario financiero de pagos pactados sobre el contrato ($228,338.46 MXN):\n• Estimación 1 (Anticipo 30%): $68,501.54 MXN (Firma y arranque de estudios).\n• Estimación 2 (Anteproyecto 25%): $57,084.62 MXN (Aprobación de plantas y volumetría 3D).\n• Estimación 3 (Proyecto Ejecutivo 35%): $79,918.46 MXN (Planos de obra e ingenierías).\n• Estimación 4 (Finiquito y Licencia 10%): $22,833.84 MXN (Entrega de expediente sellado).'
    },
    {
      id: `seed_msg_11_${pid}`,
      folioNumber: 11,
      folio: 'BIT-011',
      division: 'estimaciones',
      entryType: 'acuerdo',
      authorName: 'Arq. Director (Hepc 90)',
      authorHandle: '@Arq.Director',
      authorRole: 'Director de Proyecto',
      authorInitials: 'AD',
      time: formatTimeAgo(1, 11, 45),
      partidaId: '1',
      mentions: ['@Ing.Mariana.Torres.Morales', '@Arq.Roberto.Mendez.Silva'],
      estimaciones: ['#Estimación No. 1'],
      reportes: ['!4. Estimaciones y Flujo'],
      readBy: ['__all__'],
      text: '¡Excelente noticia equipo! El cliente realizó la transferencia bancaria por $68,501.54 MXN cubriendo el 100% de la #Estimación No. 1 (SPEI BBVA Ref. 49201). En 4. Estimaciones registré la fecha de cobro y emití el Recibo de Estimación Oficial con sellos fiscales. Nuestro Estado de Flujo de Caja reporta un balance neto positivo de +$44,001.54 MXN tras liquidar los anticipos de topografía y geotecnia.'
    },
    {
      id: `seed_msg_12_${pid}`,
      folioNumber: 12,
      folio: 'BIT-012',
      division: 'seguimiento_calendario',
      entryType: 'avance',
      authorName: 'Arq. Roberto Méndez Silva',
      authorHandle: '@Arq.Roberto.Mendez.Silva',
      authorRole: 'Coordinador de Proyecto',
      authorInitials: 'RM',
      time: formatTimeAgo(1, 15, 30),
      partidaId: '5',
      mentions: ['@Arq.Director'],
      estimaciones: [],
      reportes: ['!Tabla de Alcances', '!Seguimiento y Bitácora'],
      readBy: ['__all__'],
      text: 'Avance en la Partida 5 (Trámites y Gestoría):\nObtuvimos el dictamen favorable de la Constancia de Alineamiento y Número Oficial (Partida 5.1, estatus Aprobado al 100%). Estamos integrando las firmas del Director Responsable de Obra (D.R.O.) y las memorias técnicas en la Partida 5.2 para tramitar la Licencia de Construcción ante la Dirección de Obras Públicas.'
    },
    {
      id: `seed_msg_13_${pid}`,
      folioNumber: 13,
      folio: 'BIT-013',
      division: 'estimaciones',
      entryType: 'nota',
      authorName: 'Ing. Mariana Torres Morales',
      authorHandle: '@Ing.Mariana.Torres.Morales',
      authorRole: 'Coordinadora de Costos / FCARM',
      authorInitials: 'MT',
      time: formatTimeAgo(0, 9, 40),
      partidaId: '2',
      mentions: ['@Arq.Director', '@Arq.Roberto.Mendez.Silva'],
      estimaciones: ['#Estimación No. 2'],
      reportes: ['!4. Estimaciones y Flujo'],
      readBy: [],
      text: '@Arq.Director como el anteproyecto y los renders ya están por aprobarse en Seguimiento, di de alta en borrador la #Estimación No. 2 por $57,084.62 MXN (25% contractual). En cuanto el cliente dé su visto bueno por escrito generaremos el recibo de cobro formal.'
    },
    {
      id: `seed_msg_14_${pid}`,
      folioNumber: 14,
      folio: 'BIT-014',
      division: 'seguimiento_calendario',
      entryType: 'avance',
      authorName: 'Arq. Roberto Méndez Silva',
      authorHandle: '@Arq.Roberto.Mendez.Silva',
      authorRole: 'Coordinador de Proyecto',
      authorInitials: 'RM',
      time: formatTimeAgo(0, 11, 20),
      partidaId: '3',
      mentions: ['@Arq.Director', '@Ing.Mariana.Torres.Morales'],
      estimaciones: [],
      reportes: ['!Seguimiento y Bitácora'],
      readBy: [],
      text: 'Resumen consolidado en la pestaña Seguimiento:\n• Partida 1 (Estudios): 100% Aprobado.\n• Partida 2 (Anteproyecto): 87.5% En Proceso.\n• Partida 3 (Planos Ejecutivos): 25.0% En Proceso.\n• Partida 4 (Ingenierías MEP y Estructura): 17.5% En Proceso.\n• Partida 5 (Trámites): 70.0% En Proceso.\nEl cálculo del % de Avance Real Ponderado Total del proyecto se sitúa en 48.7% conforme a los costos directos de cada entregable.'
    },
    {
      id: `seed_msg_15_${pid}`,
      folioNumber: 15,
      folio: 'BIT-015',
      division: 'alcance_presupuesto',
      entryType: 'acuerdo',
      authorName: 'Arq. Director (Hepc 90)',
      authorHandle: '@Arq.Director',
      authorRole: 'Director de Proyecto',
      authorInitials: 'AD',
      time: formatTimeAgo(0, 13, 0),
      partidaId: '1',
      mentions: ['@Arq.Roberto.Mendez.Silva', '@Ing.Mariana.Torres.Morales'],
      estimaciones: [],
      reportes: ['!Tabla de Alcances', '!1. Presupuesto / FCARM'],
      readBy: [],
      text: 'Para resguardar los costos autorizados y la confidencialidad, apliqué los candados de seguridad (Tab Locks):\n• @Ing.Mariana.Torres.Morales tiene permisos exclusivos de edición en 1. Presupuesto y 4. Estimaciones.\n• @Arq.Roberto.Mendez.Silva gestiona Tabla de Alcances, Seguimiento y 3. Calendario.\n• La Partida 1 quedó bloqueada con candado para blindar los costos de subcontratos definitivos.'
    },
    {
      id: `seed_msg_16_${pid}`,
      folioNumber: 16,
      folio: 'BIT-016',
      division: 'seguimiento_calendario',
      entryType: 'orden',
      authorName: 'Arq. Director (Hepc 90)',
      authorHandle: '@Arq.Director',
      authorRole: 'Director de Proyecto',
      authorInitials: 'AD',
      time: formatTimeAgo(0, 14, 15),
      partidaId: '3',
      mentions: ['@Arq.Roberto.Mendez.Silva', '@Ing.Mariana.Torres.Morales'],
      estimaciones: ['#Estimación No. 1', '#Estimación No. 2'],
      reportes: ['!Seguimiento y Bitácora'],
      readBy: [],
      text: 'Excelente trabajo de coordinación. Les recuerdo que con el botón 🖨️ Formato en la barra superior de esta Bitácora pueden imprimir la División actual o la Bitácora Completa (las 3 Divisiones) con membrete oficial, folios BIT-XXX y firmas de Residencia, Supervisión y Dirección.'
    },
    {
      id: `seed_msg_17_${pid}`,
      folioNumber: 17,
      folio: 'BIT-017',
      division: 'estimaciones',
      entryType: 'avance',
      authorName: 'Ing. Mariana Torres Morales',
      authorHandle: '@Ing.Mariana.Torres.Morales',
      authorRole: 'Coordinadora de Costos / FCARM',
      authorInitials: 'MT',
      time: formatTimeAgo(0, 15, 0),
      partidaId: '1',
      mentions: ['@Arq.Director', '@Arq.Roberto.Mendez.Silva'],
      estimaciones: ['#Estimación No. 1'],
      reportes: ['!4. Estimaciones y Flujo'],
      readBy: [],
      text: 'Adjunté en el sistema el registro fotográfico de los sondeos y banco de nivel oficial dentro de las Evidencias Fotográficas de la #Estimación No. 1. Con esto el expediente de cobro cuenta con respaldo gráfico completo para la supervisión externa del cliente.'
    },
    {
      id: `seed_msg_18_${pid}`,
      folioNumber: 18,
      folio: 'BIT-018',
      division: 'seguimiento_calendario',
      entryType: 'nota',
      authorName: 'Arq. Roberto Méndez Silva',
      authorHandle: '@Arq.Roberto.Mendez.Silva',
      authorRole: 'Coordinador de Proyecto',
      authorInitials: 'RM',
      time: formatTimeAgo(0, 15, 30),
      partidaId: '3',
      mentions: ['@Ing.Mariana.Torres.Morales', '@Arq.Director'],
      estimaciones: [],
      reportes: ['!Tabla de Alcances', '!Seguimiento y Bitácora'],
      readBy: [],
      text: 'Excelente @Ing.Mariana.Torres.Morales. La Sincronización Multiusuario en Tiempo Real reflejó de inmediato los cambios y archivos adjuntos en mi estación de trabajo. Ya vinculé las notas de bitácora técnica con los planos arquitectónicos actualizados.'
    },
    {
      id: `seed_msg_19_${pid}`,
      folioNumber: 19,
      folio: 'BIT-019',
      division: 'alcance_presupuesto',
      entryType: 'nota',
      authorName: 'Arq. Director (Hepc 90)',
      authorHandle: '@Arq.Director',
      authorRole: 'Director de Proyecto',
      authorInitials: 'AD',
      time: formatTimeAgo(0, 16, 0),
      partidaId: '2',
      mentions: ['@Ing.Mariana.Torres.Morales', '@Arq.Roberto.Mendez.Silva'],
      estimaciones: ['#Presupuesto_FCARM'],
      reportes: ['!1. Presupuesto / FCARM'],
      readBy: [],
      text: 'Actualicé en la Configuración del Proyecto el logotipo institucional del despacho, razón social y desglose fiscal (IVA 16% y retenciones de honorarios). Ahora los Recibos de Estimación, la Carátula Ejecutiva, esta Bitácora de Obra y los reportes de costos se generan automáticamente con membrete oficial.'
    },
    {
      id: `seed_msg_20_${pid}`,
      folioNumber: 20,
      folio: 'BIT-020',
      division: 'estimaciones',
      entryType: 'acuerdo',
      authorName: 'Arq. Roberto Méndez Silva',
      authorHandle: '@Arq.Roberto.Mendez.Silva',
      authorRole: 'Coordinador de Proyecto',
      authorInitials: 'RM',
      time: formatTimeAgo(0, 16, 30),
      partidaId: '5',
      mentions: ['@Arq.Director', '@Ing.Mariana.Torres.Morales'],
      estimaciones: ['#Estimación No. 4'],
      reportes: ['!Tabla de Alcances', '!4. Estimaciones y Flujo'],
      readBy: [],
      text: 'Ingresamos la carpeta ejecutiva de la Partida 5.2 ante la Dirección de Obras Públicas con firmas del D.R.O. y memorias de cálculo. En cuanto nos entreguen la Licencia de Construcción sellada, emitiremos la #Estimación No. 4 de Finiquito (10% contractual) para el cierre y entrega-recepción del proyecto.'
    }
  ];
}

export function normalizeChatMsgId(rawId) {
  return String(rawId || '').replace(/^.*?(?:__|::)/, '');
}

export function dedupeChatMessages(list) {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set();
  const recentByFingerprint = [];
  const result = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const cleanId = normalizeChatMsgId(item.id);
    if (cleanId && seenIds.has(cleanId)) continue;

    const authorKey = String(item.authorEmail || item.authorHandle || item.authorName || '').toLowerCase().trim();
    const textKey = String(item.text || '').trim();
    const timeKey = String(item.time || '').trim();
    const ts = item.createdAt ? Date.parse(item.createdAt) : NaN;

    const isDuplicateByContent = recentByFingerprint.some(prev => {
      if (prev.authorKey !== authorKey || prev.textKey !== textKey) return false;
      if (Number.isFinite(ts) && Number.isFinite(prev.ts)) {
        return Math.abs(ts - prev.ts) < 2000;
      }
      return Boolean(timeKey && prev.timeKey === timeKey);
    });

    if (isDuplicateByContent) continue;

    const normalizedItem = cleanId ? { ...item, id: cleanId } : { ...item };
    if (cleanId) seenIds.add(cleanId);
    recentByFingerprint.push({ authorKey, textKey, timeKey, ts });
    result.push(normalizedItem);
  }

  return result;
}

export function isChatMessageReadForCurrentUser(m, projectId = null, myEmailOverride = null, readSetOverride = null) {
  if (!m || typeof m !== 'object') return true;
  if (Boolean(m.isRead) || Boolean(m.dismissed)) return true;
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  const myEmail = myEmailOverride !== null
    ? myEmailOverride
    : ((getCurrentUser() || getLastKnownUser())?.email || '').toLowerCase().trim();
  const authorEmail = String(m.authorEmail || '').toLowerCase().trim();
  if (myEmail && authorEmail && authorEmail === myEmail) return true;
  const readBy = Array.isArray(m.readBy) ? m.readBy : [];
  if (readBy.includes('__all__')) return true;
  if (myEmail && readBy.some(r => String(r || '').toLowerCase().trim() === myEmail)) return true;
  const readSet = readSetOverride || new Set(getReadMentionIds());
  const cleanId = normalizeChatMsgId(m.id);
  if (readSet.has(`${pid}:${cleanId}`) || readSet.has(cleanId) || readSet.has(`${pid}:${m.id}`) || readSet.has(String(m.id))) {
    return true;
  }
  return false;
}

export function markActiveProjectChatMessagesAsRead(projectId = null) {
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  const arqKey = `adm_arq_project_chat_${pid}`;
  const constKey = `adm_const_project_chat_${pid}`;
  try {
    const raw = localStorage.getItem(arqKey) || localStorage.getItem(constKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    const currentUser = getCurrentUser() || getLastKnownUser();
    const myEmail = (currentUser?.email || '').toLowerCase().trim();
    const readList = getReadMentionIds();
    const readSet = new Set(readList);
    let readKeysAdded = false;
    let changed = false;
    const deduped = dedupeChatMessages(parsed).map(m => {
      const cleanId = normalizeChatMsgId(m.id);
      const k1 = `${pid}:${cleanId}`;
      if (!readSet.has(k1)) {
        readSet.add(k1);
        readList.push(k1);
        readKeysAdded = true;
      }
      if (cleanId && !readSet.has(cleanId)) {
        readSet.add(cleanId);
        readList.push(cleanId);
        readKeysAdded = true;
      }
      const nextReadBy = Array.isArray(m.readBy) ? [...m.readBy] : [];
      if (!nextReadBy.includes('__all__')) {
        nextReadBy.push('__all__');
        changed = true;
      }
      if (myEmail && !nextReadBy.includes(myEmail)) {
        nextReadBy.push(myEmail);
        changed = true;
      }
      if (!m.isRead) {
        changed = true;
      }
      return { ...m, isRead: true, readBy: nextReadBy };
    });
    if (deduped.length !== parsed.length) changed = true;
    if (readKeysAdded && typeof localStorage !== 'undefined') {
      if (readList.length > 500) readList.splice(0, readList.length - 500);
      localStorage.setItem(READ_MENTIONS_KEY, JSON.stringify(readList));
    }
    if (changed) {
      const data = JSON.stringify(deduped);
      localStorage.setItem(arqKey, data);
      localStorage.setItem(constKey, data);
      scheduleChatCloudSync(pid);
    }
    if (changed || readKeysAdded) {
      syncNotificationStateToCloud();
    }
    return changed;
  } catch (_) {
    return false;
  }
}

export function loadProjectChatMessages(projectId = null) {
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  const arqKey = `adm_arq_project_chat_${pid}`;
  const constKey = `adm_const_project_chat_${pid}`;
  try {
    const raw = localStorage.getItem(arqKey) || localStorage.getItem(constKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const { list, migrated } = normalizeProjectChatMessagesList(parsed);
        const deduped = dedupeChatMessages(list);
        if (migrated || deduped.length !== parsed.length) {
          saveProjectChatMessages(deduped, pid, { skipCloudSync: true });
        }
        return deduped;
      }
    }
  } catch (e) {}

  // Si no hay mensajes o es un proyecto nuevo, generar asientos semilla distribuidos en las 3 divisiones
  const seedMessages = dedupeChatMessages(generateSeedProjectChatMessages(pid));
  saveProjectChatMessages(seedMessages, pid, { skipCloudSync: true });
  return seedMessages;
}

export function saveProjectChatMessages(messages, projectId = null, opts = {}) {
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  try {
    const deduped = dedupeChatMessages(messages || []);
    const data = JSON.stringify(deduped);
    localStorage.setItem(`adm_arq_project_chat_${pid}`, data);
    localStorage.setItem(`adm_const_project_chat_${pid}`, data);
    if (!opts?.skipCloudSync) {
      scheduleChatCloudSync(pid);
    }
  } catch (e) {}
}

export function resetDefaultProjectChatWithFeedback(projectId = null) {
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  const seeds = generateSeedProjectChatMessages(pid);
  saveProjectChatMessages(seeds, pid);
  activeChatFilter = 'all';
  activeChatSearch = '';
  activePartidaFilterId = null;
  moveMenuMessageId = null;
  renderProjectChatDock();
  triggerExternalChatRefresh();
  renderSidebarNotificationsUI();
  showToast('🎉 Bitácora de obra regenerada con asientos en las 3 divisiones', 'success');
}

export function getPartidaChatCount(partidaId) {
  if (!partidaId) return 0;
  const pid = getActiveProjectId() || 'proj-default-01';
  const myEmail = ((getCurrentUser() || getLastKnownUser())?.email || '').toLowerCase().trim();
  const readSet = new Set(getReadMentionIds());
  const messages = loadProjectChatMessages(pid);
  return messages.filter(m => String(m.partidaId) === String(partidaId) && !isChatMessageReadForCurrentUser(m, pid, myEmail, readSet)).length;
}

export function getPartidaTotalChatCount(partidaId) {
  if (!partidaId) return 0;
  const messages = loadProjectChatMessages();
  return messages.filter(m => String(m.partidaId) === String(partidaId)).length;
}

function getPartidaChatDivisionCounts(partidaId) {
  const counts = {
    alcance_presupuesto: 0,
    seguimiento_calendario: 0,
    estimaciones: 0
  };
  if (!partidaId) return counts;
  const messages = loadProjectChatMessages();
  messages.forEach(m => {
    if (String(m.partidaId) === String(partidaId)) {
      const div = getMessageDivision(m);
      counts[div] = (counts[div] || 0) + 1;
    }
  });
  return counts;
}

export function isPartidaChatActive(partidaId) {
  return Boolean(isChatDockExpanded && activePartidaFilterId && String(activePartidaFilterId) === String(partidaId));
}

// Escapa HTML de texto libre para evitar inyecciones XSS en DOM o impresión
function escapeChatHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapa atributos HTML y literales JS en manejadores inline
function escapeChatAttr(str) {
  return escapeChatHtml(str);
}

// Helper que devuelve el HTML del botón de comentarios/bitácora para cualquier concepto
export function renderPartidaNivel1ChatButton(nodeId, clave = '', descripcion = '') {
  const count = getPartidaChatCount(nodeId);
  const totalCount = getPartidaTotalChatCount(nodeId);
  const divCounts = totalCount > 0 ? getPartidaChatDivisionCounts(nodeId) : null;
  const isActive = isPartidaChatActive(nodeId);
  const safeNodeJs = String(nodeId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeNodeAttr = escapeChatAttr(nodeId);
  const safeClave = escapeChatAttr(clave || '');
  const safeDesc = escapeChatAttr(String(descripcion || '').slice(0, 40));

  let tooltipBreakdown = '';
  if (divCounts && totalCount > 0) {
    const parts = [];
    if (divCounts.alcance_presupuesto > 0) parts.push(`${divCounts.alcance_presupuesto} Alc/Presup`);
    if (divCounts.seguimiento_calendario > 0) parts.push(`${divCounts.seguimiento_calendario} Seg/Cal`);
    if (divCounts.estimaciones > 0) parts.push(`${divCounts.estimaciones} Est`);
    if (parts.length > 0) tooltipBreakdown = ` · ${parts.join(', ')}`;
  }

  let btnClasses = '';
  let iconClasses = '';
  let badgeHtml = '';

  if (isActive) {
    btnClasses = 'bg-amber-500 hover:bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-300';
    iconClasses = 'fa-solid fa-comments text-white text-[11px]';
    badgeHtml = count > 0 ? `<span class="px-1.5 py-0.2 rounded-full bg-white text-amber-800 font-mono text-[10px] font-extrabold leading-tight">${count}</span>` : '';
  } else if (count > 0) {
    btnClasses = 'bg-blue-600 hover:bg-blue-500 text-white border-blue-700 shadow-sm';
    iconClasses = 'fa-solid fa-comments text-amber-300 text-[11px]';
    badgeHtml = `<span class="px-1.5 py-0.2 rounded-full bg-white text-blue-900 font-mono text-[10px] font-extrabold leading-tight">${count}</span>`;
  } else if (totalCount > 0) {
    btnClasses = 'bg-blue-600 hover:bg-blue-500 text-white border-blue-700 shadow-sm';
    iconClasses = 'fa-solid fa-comments text-amber-300 text-[11px]';
    badgeHtml = '';
  } else {
    btnClasses = 'bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border-blue-300 hover:border-blue-700 shadow-2xs';
    iconClasses = 'fa-solid fa-comments text-[11px]';
    badgeHtml = '';
  }

  return `
    <button type="button"
            data-chat-concept-btn="${safeNodeAttr}"
            onclick="openProjectChatForPartida('${escapeChatAttr(safeNodeJs)}', event)"
            title="Bitácora de [${safeClave}]: ${safeDesc} (${count} notas${tooltipBreakdown})"
            class="no-print inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-sans font-bold transition cursor-pointer shrink-0 ${btnClasses}">
      <i class="${iconClasses}"></i>
      ${badgeHtml}
    </button>
  `;
}

// Obtener usuarios asignados al proyecto activo
function getAssignedProjectUsers(projectId = null) {
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  const proj = getProjectById(pid);
  const currentUser = getCurrentUser() || getLastKnownUser();
  let rawMembers = (proj && Array.isArray(proj.members) && proj.members.length > 0)
    ? [...proj.members]
    : [];

  if (rawMembers.length === 0) {
    rawMembers = [];
  }

  return rawMembers.map(m => {
    const cleanName = (m.name || 'Usuario').trim();
    let shortHandle = '@' + cleanName.replace(/\s+/g, '.');
    if (m.role === 'editar' && (cleanName.includes('Admin') || cleanName.includes('Hepc'))) {
      shortHandle = '@Arq.Director';
    }
    const parts = cleanName.split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : cleanName.slice(0, 2).toUpperCase();
    const roleLabel = m.role === 'editar'
      ? 'Director de Proyecto'
      : (m.email && m.email.includes('mariana')
          ? 'Coordinadora de Costos / FCARM'
          : (m.email && m.email.includes('roberto') ? 'Coordinador de Proyecto' : 'Colaborador'));
    return {
      id: m.id || m.email || cleanName,
      name: cleanName,
      handle: shortHandle,
      email: m.email || '',
      avatar: m.avatar || AVATARS_BY_SEX['Masculino'],
      initials,
      roleLabel
    };
  });
}

// Obtener el @handle del usuario activo
function getActiveUserHandle(users = null) {
  const list = users || getAssignedProjectUsers();
  const currentUser = getCurrentUser() || getLastKnownUser();
  if (selectedNotificationsHandle && list.some(u => u.handle === selectedNotificationsHandle)) {
    return selectedNotificationsHandle;
  }
  if ( currentUser ) {
    const byEmail = list.find(u => u.email && currentUser.email && u.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim());
    if (byEmail) return byEmail.handle;
    const byName = list.find(u => u.name && currentUser.name && u.name.toLowerCase().trim() === currentUser.name.toLowerCase().trim());
    if (byName) return byName.handle;
  }
  if (selectedAuthorHandle && list.some(u => u.handle === selectedAuthorHandle)) {
    return selectedAuthorHandle;
  }
  return list[0] ? list[0].handle : '@Admin';
}

// Obtener todos los conceptos del catálogo activo en orden jerárquico (cualquier nivel)
function getAllCatalogConceptTags() {
  const result = [];
  const walk = (nodes, level = 1) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      result.push({
        id: String(node.id),
        clave: node.clave || String(level),
        descripcion: node.descripcion || (level === 1 ? 'PARTIDA NIVEL 1' : 'CONCEPTO'),
        level
      });
      if (Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children, level + 1);
      }
    }
  };
  walk(state.treeData, 1);
  return result;
}

// Busca un concepto (de cualquier nivel) por ID dentro del catálogo activo
function findChatConceptById(conceptId, conceptsList = null) {
  if (!conceptId) return null;
  const list = Array.isArray(conceptsList) ? conceptsList : getAllCatalogConceptTags();
  return list.find(p => String(p.id) === String(conceptId)) || null;
}

// Mantener alias para compatibilidad si alguna rutina requiere solo Partidas Nivel 1
function getLevel1Partidas() {
  const roots = Array.isArray(state.treeData) ? state.treeData : [];
  return roots.map(node => ({
    id: String(node.id),
    clave: node.clave || '1',
    descripcion: node.descripcion || 'PARTIDA NIVEL 1',
    level: 1
  }));
}

// Obtener las Estimaciones reales del proyecto activo
function getProjectEstimacionesTags() {
  try {
    const estData = loadEstimacionesData();
    if (estData && Array.isArray(estData.estimaciones)) {
      return estData.estimaciones.map(e => ({
        id: e.id,
        numero: e.numero,
        label: `#Estimación No. ${e.numero}`,
        locked: Boolean(e.locked)
      }));
    }
  } catch (e) {}
  return [{ id: 'est_1', numero: 1, label: '#Estimación No. 1', locked: false }];
}

// Reportes y Pestañas disponibles para etiquetar
function getProjectReportesTags() {
  return [
    { id: 'alcances', label: '!Tabla de Alcances', division: 'alcance_presupuesto' },
    { id: 'presupuesto', label: '!1. Presupuesto / FCARM', division: 'alcance_presupuesto' },
    { id: 'seguimiento', label: '!Seguimiento y Bitácora', division: 'seguimiento_calendario' },
    { id: 'calendario', label: '!Calendario y Ruta Crítica', division: 'seguimiento_calendario' },
    { id: 'estimaciones', label: '!4. Estimaciones y Flujo', division: 'estimaciones' }
  ];
}

// Obtener todos los proyectos registrados + proyecto activo + cualquier clave de chat existente en localStorage
function getAllProjectsForNotifications() {
  const activePid = getActiveProjectId() || 'proj-default-01';
  const seenIds = new Set();
  const projects = [];
  const deletedList = getDeletedProjectsList();
  const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);

  const addProj = (id, name) => {
    if (!id || seenIds.has(id) || isDeleted(id)) return;
    seenIds.add(id);
    projects.push({
      id,
      projectName: name || 'Proyecto de Obra'
    });
  };

  try {
    const list = getProjectsList() || [];
    list.forEach(p => {
      if (p && p.id && !isDeleted(p.id) && !isDeleted(p.cloudId)) {
        addProj(p.id, p.projectName);
      }
    });
  } catch (e) {}

  const activeProjObj = getProjectById(activePid);
  if (!isDeleted(activePid)) {
    addProj(activePid, activeProjObj?.projectName || state.settings?.projectName || 'Proyecto Activo');
  }

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.length === 'number') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('adm_arq_project_chat_') || k.startsWith('adm_const_project_chat_') || k.startsWith('adm_arq_chat_') || k.startsWith('control_obra_chat_'))) {
          const pid = k.replace(/^adm_(?:arq|const)_project_chat_/, '').replace('adm_arq_chat_', '').replace('control_obra_chat_', '');
          if (pid && !seenIds.has(pid) && !isDeleted(pid)) {
            const pObj = getProjectById(pid);
            if (pObj) {
              addProj(pid, pObj?.projectName || `Proyecto (${pid})`);
            }
          }
        }
      }
    }
  } catch (e) {}

  return projects;
}

// Extraer todas las menciones (@Usuario) de un mensaje (tanto del arreglo m.mentions como del texto)
function extractMentionsFromMessage(m) {
  if (!m) return [];
  const seen = new Set();
  const list = [];

  const pushTag = (raw) => {
    const clean = String(raw || '').trim();
    if (!clean.startsWith('@') || clean.length < 2) return;
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      list.push(clean);
    }
  };

  if (Array.isArray(m.mentions)) {
    m.mentions.forEach(pushTag);
  }

  if (m.text && typeof m.text === 'string') {
    const matches = m.text.match(/@[A-Za-z0-9_.\-áéíóúÁÉÍÓÚñÑ]+/g);
    if (matches) {
      matches.forEach(pushTag);
    }
  }

  return list;
}

// Obtener lista consolidada de usuarios asignados en el proyecto activo y en todos los proyectos (para el centro de notificaciones en Mis Proyectos de Obra y en el área de trabajo)
function getAllNotificationsUsers(scope = 'all') {
  const seen = new Set();
  const merged = [];

  const addList = (list) => {
    list.forEach(u => {
      const key = String(u.handle || '').toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(u);
      }
    });
  };

  addList(getAssignedProjectUsers());

  if (scope === 'all') {
    try {
      const projects = getAllProjectsForNotifications();
      projects.forEach(p => {
        if (p && p.id) {
          addList(getAssignedProjectUsers(p.id));
        }
      });
    } catch (e) {}
  }

  // También incluir cualquier @Usuario que haya sido mencionado en los mensajes del alcance
  const targetProjects = scope === 'current'
    ? [{ id: getActiveProjectId() || 'proj-default-01' }]
    : getAllProjectsForNotifications();

  targetProjects.forEach(p => {
    const msgs = loadProjectChatMessages(p.id);
    msgs.forEach(m => {
      extractMentionsFromMessage(m).forEach(tag => {
        const key = tag.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push({
            id: tag,
            name: tag.slice(1).replace(/\./g, ' '),
            handle: tag,
            roleLabel: 'Etiquetado'
          });
        }
      });
    });
  });

  return merged;
}

// =========================================================================
// NOTIFICACIONES DE MENCIONES (EN "MIS PROYECTOS DE OBRA" Y BARRA LATERAL IZQUIERDA)
// =========================================================================
const DISMISSED_NOTIFICATIONS_KEY = 'cubikar_dismissed_notifications_v1';
const READ_MENTIONS_KEY = 'cubikar_read_mentions_v1';
let notifCloudSyncTimer = null;

export function getDismissedNotificationIds() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (_) {}
  return [];
}

export function getReadMentionIds() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(READ_MENTIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (_) {}
  return [];
}

let lastNotifSyncSignature = '';
let consecutiveNotifSyncFailures = 0;
let nextNotifSyncAllowedAt = 0;

export function syncNotificationStateToCloud() {
  if (typeof window === 'undefined') return;
  if (notifCloudSyncTimer) clearTimeout(notifCloudSyncTimer);
  const now = Date.now();
  const baseDelay = 1500;
  const delay = nextNotifSyncAllowedAt > now ? Math.max(baseDelay, nextNotifSyncAllowedAt - now) : baseDelay;
  notifCloudSyncTimer = setTimeout(async () => {
    notifCloudSyncTimer = null;
    try {
      const sb = getSupabaseClient();
      if (!isSupabaseConfigured() || !sb || typeof sb.auth?.updateUser !== 'function') return;
      const currentUser = getCurrentUser();
      if (!currentUser || !currentUser.id) return;

      // Mantener payload compacto en user_metadata (< 2 KB) para no inflar el JWT
      const dismissed = getDismissedNotificationIds().slice(-20).map(v => String(v || '').slice(0, 64)).filter(Boolean);
      const readIds = getReadMentionIds().slice(-20).map(v => String(v || '').slice(0, 64)).filter(Boolean);

      const nextSig = JSON.stringify({ dismissed, readIds });
      const remoteMeta = currentUser.user_metadata || {};
      const remoteDismissed = Array.isArray(remoteMeta.cubikar_dismissed_notifications) ? remoteMeta.cubikar_dismissed_notifications : [];
      const remoteRead = Array.isArray(remoteMeta.cubikar_read_mentions) ? remoteMeta.cubikar_read_mentions : [];
      const remoteHasArr = Array.isArray(remoteMeta.cubikar_dismissed_notifications) || Array.isArray(remoteMeta.cubikar_read_mentions);
      const remoteIsCompact = remoteDismissed.length <= 20 && remoteRead.length <= 20;
      const remoteSig = (remoteHasArr && remoteIsCompact)
        ? JSON.stringify({ dismissed: remoteDismissed, readIds: remoteRead })
        : '';

      if (nextSig === lastNotifSyncSignature || nextSig === remoteSig) {
        lastNotifSyncSignature = nextSig;
        return;
      }

      if (!currentUser.user_metadata) currentUser.user_metadata = {};
      currentUser.user_metadata.cubikar_dismissed_notifications = dismissed;
      currentUser.user_metadata.cubikar_read_mentions = readIds;
      if (typeof saveCurrentUser === 'function') saveCurrentUser(currentUser);

      if (typeof window.markInternalCloudAuthUpdate === 'function') {
        window.markInternalCloudAuthUpdate();
      }
      const { error } = await sb.auth.updateUser({
        data: {
          cubikar_dismissed_notifications: dismissed,
          cubikar_read_mentions: readIds
        }
      });

      if (error) {
        consecutiveNotifSyncFailures++;
        const backoff = Math.min(120000, 5000 * Math.pow(2, consecutiveNotifSyncFailures - 1));
        nextNotifSyncAllowedAt = Date.now() + backoff;
        return;
      }
      consecutiveNotifSyncFailures = 0;
      nextNotifSyncAllowedAt = 0;
      lastNotifSyncSignature = nextSig;
    } catch (_) {
      consecutiveNotifSyncFailures++;
      const backoff = Math.min(120000, 5000 * Math.pow(2, consecutiveNotifSyncFailures - 1));
      nextNotifSyncAllowedAt = Date.now() + backoff;
    }
  }, delay);
}

export async function hydrateNotificationStateFromCloud(authUser = null) {
  try {
    let userMeta = authUser?.user_metadata || getCurrentUser()?.user_metadata || null;
    if (!userMeta) {
      const sb = getSupabaseClient();
      if (isSupabaseConfigured() && sb && typeof sb.auth?.getUser === 'function') {
        const { data } = await sb.auth.getUser();
        userMeta = data?.user?.user_metadata || null;
      }
    }
    if (!userMeta || typeof userMeta !== 'object') return false;

    let changed = false;
    if (Array.isArray(userMeta.cubikar_dismissed_notifications) && userMeta.cubikar_dismissed_notifications.length > 0) {
      const curDismissed = getDismissedNotificationIds();
      const mergedDismissed = Array.from(new Set([...curDismissed, ...userMeta.cubikar_dismissed_notifications])).slice(-500);
      if (mergedDismissed.length !== curDismissed.length && typeof localStorage !== 'undefined') {
        localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(mergedDismissed));
        changed = true;
      }
    }
    if (Array.isArray(userMeta.cubikar_read_mentions) && userMeta.cubikar_read_mentions.length > 0) {
      const curRead = getReadMentionIds();
      const mergedRead = Array.from(new Set([...curRead, ...userMeta.cubikar_read_mentions])).slice(-500);
      if (mergedRead.length !== curRead.length && typeof localStorage !== 'undefined') {
        localStorage.setItem(READ_MENTIONS_KEY, JSON.stringify(mergedRead));
        changed = true;
      }
    }
    if (changed) {
      renderSidebarNotificationsUI();
    }
    return changed;
  } catch (_) {
    return false;
  }
}

export function markNotificationDismissed(notifKey) {
  if (!notifKey) return;
  try {
    const list = getDismissedNotificationIds();
    if (!list.includes(notifKey)) {
      list.push(notifKey);
      if (list.length > 500) list.splice(0, list.length - 500);
      localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(list));
    }
    syncNotificationStateToCloud();
  } catch (_) {}
}

export function markMentionReadKey(readKey) {
  if (!readKey) return;
  try {
    const list = getReadMentionIds();
    if (!list.includes(readKey)) {
      list.push(readKey);
      if (list.length > 500) list.splice(0, list.length - 500);
      localStorage.setItem(READ_MENTIONS_KEY, JSON.stringify(list));
    }
    syncNotificationStateToCloud();
  } catch (_) {}
}

function getSelfMentionTokens(users = []) {
  const curUser = getCurrentUser() || getLastKnownUser();
  if (!curUser) return [];
  const tokens = new Set();
  const myEmail = String(curUser.email || '').toLowerCase().trim();
  const myName = String(curUser.name || '').trim();
  if (myEmail) {
    (users || []).filter(u => String(u?.email || '').toLowerCase().trim() === myEmail)
      .forEach(u => { if (u.handle) tokens.add(String(u.handle).toLowerCase()); });
    const prefix = myEmail.split('@')[0];
    if (prefix) tokens.add('@' + prefix.toLowerCase());
    tokens.add(myEmail);
  }
  if (myName) {
    (users || []).filter(u => String(u?.name || '').toLowerCase().trim() === myName.toLowerCase())
      .forEach(u => { if (u.handle) tokens.add(String(u.handle).toLowerCase()); });
    tokens.add('@' + myName.replace(/\s+/g, '.').toLowerCase());
    tokens.add('@' + myName.replace(/\s+/g, '').toLowerCase());
  }
  tokens.add('@todos');
  return Array.from(tokens);
}

// scope = 'current' -> Notificaciones filtradas en el proyecto activo (Barra lateral)
// scope = 'all'     -> Notificaciones filtradas en todos los proyectos ("Mis Proyectos")
export function getUserMentionsNotifications(targetHandle = null, scope = 'all') {
  const filterHandle = targetHandle || selectedNotificationsHandle || '__self__';
  const isAllHandles = String(filterHandle).toLowerCase() === 'all';
  const isSelfHandle = filterHandle === '__self__';
  const handleLower = String(filterHandle || '').toLowerCase();
  const dismissedSet = new Set(getDismissedNotificationIds());
  const readMentionsSet = new Set(getReadMentionIds());

  const activePid = getActiveProjectId() || 'proj-default-01';
  const activeProjObj = getProjectById(activePid);
  const projects = scope === 'current'
    ? [{
        id: activePid,
        projectName: activeProjObj?.projectName || state.settings?.projectName || 'Proyecto Activo'
      }]
    : getAllProjectsForNotifications();

  const results = [];
  projects.forEach(proj => {
    const msgs = loadProjectChatMessages(proj.id);
    const selfTokens = isSelfHandle ? getSelfMentionTokens(getAssignedProjectUsers(proj.id)) : [];
    msgs.forEach(m => {
      if (m.dismissed || dismissedSet.has(`${proj.id}:${m.id}`) || dismissedSet.has(String(m.id))) return;
      const mentionsList = extractMentionsFromMessage(m);
      if (mentionsList.length === 0) return;

      const isMentioned = isAllHandles
        ? mentionsList.length > 0
        : (isSelfHandle
            ? (selfTokens.length > 0 && (
                mentionsList.some(tag => selfTokens.includes(String(tag).toLowerCase())) ||
                (m.text && selfTokens.some(tok => String(m.text).toLowerCase().includes(tok)))
              ))
            : (mentionsList.some(tag => String(tag).toLowerCase() === handleLower)
                || (m.text && String(m.text).toLowerCase().includes(handleLower))));

      if (isMentioned) {
        const readBy = Array.isArray(m.readBy) ? m.readBy : [];
        const isRead = Boolean(m.isRead)
          || readBy.includes('__all__')
          || readMentionsSet.has(`${proj.id}:${m.id}`)
          || readMentionsSet.has(String(m.id))
          || (isAllHandles
            ? mentionsList.every(tag => readBy.some(h => String(h).toLowerCase() === String(tag).toLowerCase()))
            : (isSelfHandle
                ? selfTokens.some(tok => readBy.some(h => String(h).toLowerCase() === tok))
                : readBy.some(h => String(h).toLowerCase() === handleLower)));

        results.push({
          projectId: proj.id,
          projectName: proj.projectName || 'Proyecto de Obra',
          isCurrentProject: proj.id === activePid,
          message: m,
          mentions: mentionsList,
          isRead
        });
      }
    });
  });

  // Ordenar de más reciente a más antiguo
  return results.reverse();
}

export function toggleMentionNotificationsPopover(event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  isNotificationsPopoverOpen = !isNotificationsPopoverOpen;
  renderSidebarNotificationsUI();
}

export function closeMentionNotificationsPopover() {
  if (!isNotificationsPopoverOpen) return;
  isNotificationsPopoverOpen = false;
  renderSidebarNotificationsUI();
}

export function onNotificationsUserFilterChange(handle) {
  selectedNotificationsHandle = handle || '__self__';
  renderSidebarNotificationsUI();
}

export function markAllMentionsAsRead(scope = 'all') {
  const filterHandle = selectedNotificationsHandle || '__self__';
  const isAllHandles = String(filterHandle).toLowerCase() === 'all';
  const isSelfHandle = filterHandle === '__self__';
  const handleLower = String(filterHandle || '').toLowerCase();

  const activePid = getActiveProjectId() || 'proj-default-01';
  const projects = scope === 'current'
    ? [{ id: activePid }]
    : getAllProjectsForNotifications();

  projects.forEach(proj => {
    const msgs = loadProjectChatMessages(proj.id);
    const selfTokens = isSelfHandle ? getSelfMentionTokens(getAssignedProjectUsers(proj.id)) : [];
    let changed = false;
    msgs.forEach(m => {
      const mentionsList = extractMentionsFromMessage(m);
      if (mentionsList.length === 0) return;

      const isMentioned = isAllHandles
        ? true
        : (isSelfHandle
            ? (selfTokens.length > 0 && (
                mentionsList.some(tag => selfTokens.includes(String(tag).toLowerCase())) ||
                (m.text && selfTokens.some(tok => String(m.text).toLowerCase().includes(tok)))
              ))
            : (mentionsList.some(tag => String(tag).toLowerCase() === handleLower)
                || (m.text && String(m.text).toLowerCase().includes(handleLower))));

      if (isMentioned) {
        if (!Array.isArray(m.readBy)) m.readBy = [];
        markMentionReadKey(`${proj.id}:${m.id}`);
        markMentionReadKey(String(m.id));
        if (isAllHandles || isSelfHandle) {
          m.isRead = true;
          if (!m.readBy.includes('__all__')) m.readBy.push('__all__');
          mentionsList.forEach(tag => {
            if (!m.readBy.some(h => String(h).toLowerCase() === String(tag).toLowerCase())) {
              m.readBy.push(tag);
            }
          });
          changed = true;
        } else if (!m.readBy.some(h => String(h).toLowerCase() === handleLower)) {
          m.readBy.push(filterHandle);
          changed = true;
        }
      }
    });
    if (changed) saveProjectChatMessages(msgs, proj.id);
  });

  syncNotificationStateToCloud();
  renderSidebarNotificationsUI();
}

/**
 * Descartar / eliminar una notificación individual de mención
 */
export function dismissMentionNotification(projectId, msgId, event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  markNotificationDismissed(`${pid}:${msgId}`);
  markNotificationDismissed(String(msgId));
  markMentionReadKey(`${pid}:${msgId}`);
  markMentionReadKey(String(msgId));
  const msgs = loadProjectChatMessages(pid);
  const target = msgs.find(m => String(m.id) === String(msgId));
  if (target) {
    target.isRead = true;
    target.dismissed = true;
    if (!Array.isArray(target.readBy)) target.readBy = [];
    if (!target.readBy.includes('__all__')) target.readBy.push('__all__');
    saveProjectChatMessages(msgs, pid);
  }
  syncNotificationStateToCloud();
  renderSidebarNotificationsUI();
  showToast('Notificación eliminada', 'info');
}

/**
 * Purgar notificaciones respetando el scope ('current' = obra actual; 'all' = todas)
 * SIN destruir ni rechazar las invitaciones reales en BD.
 */
export function purgeAllNotifications(scope = 'all') {
  const user = getCurrentUser();
  const uEmail = (user?.email || '').toLowerCase().trim();
  const isCurrentOnly = scope === 'current';
  const activePid = getActiveProjectId() || 'proj-default-01';

  // 1. Ocultar avisos de invitaciones únicamente en scope='all' (sin borrar ni rechazar invitaciones reales)
  if (!isCurrentOnly) {
    try {
      const pendingInvs = uEmail ? getPendingInvitationsForUser(uEmail) : [];
      pendingInvs.forEach(inv => {
        if (inv && inv.id) markNotificationDismissed(`inv:${inv.id}`);
        if (inv && inv.projectId) markNotificationDismissed(`inv_proj:${inv.projectId}:${uEmail}`);
      });
    } catch (_) {}
  }

  // 2. Marcar como leídos y descartados los mensajes de menciones del alcance seleccionado
  const targetProjects = isCurrentOnly
    ? [{ id: activePid }]
    : getAllProjectsForNotifications();

  targetProjects.forEach(proj => {
    try {
      const msgs = loadProjectChatMessages(proj.id);
      let changed = false;
      msgs.forEach(m => {
        markNotificationDismissed(`${proj.id}:${m.id}`);
        markNotificationDismissed(String(m.id));
        markMentionReadKey(`${proj.id}:${m.id}`);
        markMentionReadKey(String(m.id));
        m.isRead = true;
        m.dismissed = true;
        if (!Array.isArray(m.readBy)) m.readBy = [];
        if (!m.readBy.includes('__all__')) m.readBy.push('__all__');
        changed = true;
      });
      if (changed) saveProjectChatMessages(msgs, proj.id);
    } catch (_) {}
  });

  // 3. Purgar claves locales de chat huérfanas de proyectos eliminados (solo scope='all')
  if (!isCurrentOnly) {
    try {
      if (typeof localStorage !== 'undefined') {
        const validPids = new Set(getProjectsList().flatMap(p => [p?.id, p?.cloudId]).filter(Boolean));
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (
            k.startsWith('adm_const_project_chat_') ||
            k.startsWith('adm_arq_project_chat_') ||
            k.startsWith('adm_const_chat_') ||
            k.startsWith('control_obra_chat_') ||
            k.startsWith('adm_arq_chat_')
          )) {
            const pid = k
              .replace('adm_const_project_chat_', '')
              .replace('adm_arq_project_chat_', '')
              .replace('adm_const_chat_', '')
              .replace('control_obra_chat_', '')
              .replace('adm_arq_chat_', '');
            if (!validPids.has(pid)) {
              localStorage.removeItem(k);
            }
          }
        }
      }
    } catch (_) {}
  }

  // 4. Sincronizar estado de lectura/descartes en la nube
  syncNotificationStateToCloud();

  // 5. Refrescar interfaz de la campana inmediatamente
  renderSidebarNotificationsUI();
  showToast('Notificaciones limpiadas exitosamente', 'info');
  if (typeof window.refreshProjectsGridUI === 'function') {
    try { window.refreshProjectsGridUI(); } catch (_) {}
  }
}

export function openMentionNotification(projectId, msgId, partidaId = '', event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }

  const activePid = getActiveProjectId() || 'proj-default-01';
  const targetPid = projectId || activePid;

  // Marcar este mensaje como leído para que la campana actualice su contador inmediatamente y persista en la nube
  markMentionReadKey(`${targetPid}:${msgId}`);
  markMentionReadKey(String(msgId));
  const msgs = loadProjectChatMessages(targetPid);
  const targetMsg = msgs.find(m => String(m.id) === String(msgId));
  if (targetMsg) {
    targetMsg.isRead = true;
    if (!Array.isArray(targetMsg.readBy)) targetMsg.readBy = [];
    if (!targetMsg.readBy.includes('__all__')) targetMsg.readBy.push('__all__');
    extractMentionsFromMessage(targetMsg).forEach(tag => {
      if (!targetMsg.readBy.some(h => String(h).toLowerCase() === String(tag).toLowerCase())) {
        targetMsg.readBy.push(tag);
      }
    });
    saveProjectChatMessages(msgs, targetPid);
  }
  syncNotificationStateToCloud();

  isNotificationsPopoverOpen = false;

  const targetDivision = targetMsg ? getMessageDivision(targetMsg) : 'alcance_presupuesto';

  // Verificar si el usuario está en la pantalla "Mis Proyectos de Obra" (#view-portal) o en otro proyecto
  const portalEl = document.getElementById('view-portal');
  const workspaceEl = document.getElementById('workspace-container');
  const isPortalVisible = Boolean(
    portalEl &&
    !portalEl.classList.contains('hidden') &&
    portalEl.style.display !== 'none' &&
    (!workspaceEl || workspaceEl.classList.contains('hidden'))
  );

  if (targetPid !== activePid || isPortalVisible) {
    // Guardar intención de abrir el chat en ese mensaje cuando el proyecto cargue en el área de trabajo
    try {
      localStorage.setItem('adm_const_pending_chat_open', JSON.stringify({
        projectId: targetPid,
        msgId,
        partidaId: partidaId || '',
        division: targetDivision
      }));
    } catch (e) {}

    if (typeof window.openProjectInWorkspace === 'function') {
      window.openProjectInWorkspace(targetPid);
    }
  }

  // En el área de proyectos activa: abrir inmediatamente la Bitácora en la división correspondiente y enfocar el mensaje
  isChatDockExpanded = true;
  markActiveProjectChatMessagesAsRead(targetPid);
  activeChatDivision = targetDivision;
  activeChatFilter = 'all';
  activeChatSearch = '';
  activePartidaFilterId = null;
  if (partidaId) {
    pendingComposerTags.partidaId = String(partidaId);
  }
  highlightedMessageId = msgId;

  renderProjectChatDock();
  triggerExternalChatRefresh();

  setTimeout(() => {
    const msgEl = document.getElementById(`chat-msg-item-${msgId}`);
    if (msgEl && typeof msgEl.scrollIntoView === 'function') {
      msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const inp = document.getElementById('project-chat-input');
    if (inp && typeof inp.focus === 'function') {
      inp.focus();
    }
  }, 60);
}

export function handleAcceptInvitationAction(invId) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showToast('Inicia sesión para aceptar la invitación', 'warning');
    return;
  }
  const result = acceptProjectInvitation(invId, currentUser);
  if (result.ok) {
    showToast(`🎉 ¡Invitación aceptada! Accediendo a "${result.projectName}"...`);
    renderSidebarNotificationsUI();
    if (typeof window.refreshProjectsGridUI === 'function') {
      try { window.refreshProjectsGridUI(); } catch (_) {}
    }
    if (typeof window.renderPortalDashboard === 'function') {
      try { window.renderPortalDashboard(); } catch (_) {}
    }
    setTimeout(() => {
      if (result.projectId && result.projectId !== 'plan-access') {
        window.location.href = `${window.location.pathname}?project=${encodeURIComponent(result.projectId)}`;
      } else {
        window.location.reload();
      }
    }, 400);
  } else {
    showToast(result.error || 'No se pudo aceptar la invitación', 'warning');
  }
}

export function handleRejectInvitationAction(invId) {
  markNotificationDismissed(`inv:${invId}`);
  const ok = rejectProjectInvitation(invId);
  if (ok) {
    showToast('Notificación de invitación eliminada', 'info');
    renderSidebarNotificationsUI();
    if (typeof window.refreshProjectsGridUI === 'function') {
      try { window.refreshProjectsGridUI(); } catch (_) {}
    }
    if (typeof window.renderPortalDashboard === 'function') {
      try { window.renderPortalDashboard(); } catch (_) {}
    }
  } else {
    renderSidebarNotificationsUI();
    showToast('Notificación eliminada', 'info');
  }
}

if (typeof window !== 'undefined') {
  window.handleAcceptInvitationAction = handleAcceptInvitationAction;
  window.handleRejectInvitationAction = handleRejectInvitationAction;
  window.purgeAllNotifications = purgeAllNotifications;
  window.dismissMentionNotification = dismissMentionNotification;
}

function buildNotificationsPopoverHTML(mentionsList, unreadCount, users, filterHandle, partidas, scope = 'current', pendingInvitations = [], consumptionAlert = null) {
  const isPortalScope = scope === 'all';
  const headerTitle = isPortalScope
    ? 'Notificaciones de Todos los Proyectos'
    : 'Menciones en este Proyecto';
  const headerSubtitle = isPortalScope
    ? `${unreadCount} nueva(s) • ${mentionsList.length} en todos los proyectos`
    : `${unreadCount} nueva(s) • ${mentionsList.length} en esta obra`;

  const escapeAttrJs = (val) => escapeChatAttr(String(val ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  const safeFilterLabel = filterHandle === '__self__' ? 'ti' : escapeChatHtml(filterHandle);
  const emptyTitle = filterHandle === 'all'
    ? (isPortalScope ? 'Sin menciones en los proyectos' : 'Sin menciones en este proyecto')
    : `Sin menciones para ${safeFilterLabel}`;

  const emptyDesc = filterHandle === 'all'
    ? (isPortalScope
        ? 'Cuando etiqueten a un <strong>@Usuario</strong> en el Chat de cualquier proyecto, se recopilará aquí.'
        : 'Cuando etiqueten a un <strong>@Usuario</strong> en el Chat del proyecto, aparecerá aquí y al darle clic te enviará al chat.')
    : `Cuando alguien etiquete a <strong>${safeFilterLabel}</strong> en el Chat de Obra, aparecerá aquí el aviso directo.`;

  return `
    <!-- Encabezado del centro de notificaciones de menciones -->
    <div onclick="event.stopPropagation()" class="px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-400 inline-flex items-center justify-center shrink-0">
          <i class="fa-solid fa-bell text-xs"></i>
        </span>
        <div class="min-w-0">
          <h4 class="text-xs font-bold text-white truncate">${headerTitle}</h4>
          <span class="text-[10px] text-slate-400 block">${headerSubtitle}</span>
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" onclick="event.stopPropagation(); purgeAllNotifications('${escapeAttrJs(scope)}')"
                class="px-2 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/35 text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                title="Eliminar todas las notificaciones de la campana">
          <i class="fa-solid fa-trash-can text-[9px]"></i> Eliminar todas
        </button>
        ${unreadCount > 0 ? `
          <button type="button" onclick="event.stopPropagation(); markAllMentionsAsRead('${escapeAttrJs(scope)}')"
                  class="px-2 py-1 rounded-lg bg-blue-600/25 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 text-[10px] font-bold cursor-pointer transition"
                  title="Marcar todas las menciones como leídas">
            ✓ Leídas
          </button>
        ` : ''}
        <button type="button" onclick="event.stopPropagation(); closeMentionNotificationsPopover()"
                class="w-6 h-6 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white inline-flex items-center justify-center cursor-pointer transition">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>
    </div>

    <!-- ALERTA DE CONSUMO DEL PLAN (85%+) -->
    ${consumptionAlert ? `
      <div onclick="event.stopPropagation()" class="p-3 bg-gradient-to-r from-amber-950/95 via-slate-900 to-amber-950/90 border-b border-amber-500/50 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-extrabold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
            <i class="fa-solid fa-triangle-exclamation text-amber-400"></i>
            Aviso de Consumo del Plan (${Number(consumptionAlert.pct) || 0}%)
          </span>
          <span class="text-[9.5px] bg-amber-500/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold">
            ${escapeChatHtml(consumptionAlert.planName || '')}
          </span>
        </div>
        <p class="text-[11px] text-slate-200 leading-snug">
          ${escapeChatHtml(consumptionAlert.message || '')}
        </p>
        <div class="pt-1">
          <button type="button" onclick="closeMentionNotificationsPopover(); openSubscriptionModal()"
                  class="w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-crown text-[11px]"></i>
            <span>${escapeChatHtml(consumptionAlert.actionLabel || 'Ver Planes')}</span>
          </button>
        </div>
      </div>
    ` : ''}

    <!-- SECCIÓN DE INVITACIONES PENDIENTES (Si hay invitaciones recibidas) -->
    ${pendingInvitations && pendingInvitations.length > 0 ? `
      <div onclick="event.stopPropagation()" class="p-3 bg-gradient-to-r from-blue-950/90 via-indigo-950/80 to-slate-900 border-b border-blue-500/40 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-extrabold text-blue-300 flex items-center gap-1.5 uppercase tracking-wider">
            <i class="fa-solid fa-envelope-open-text text-amber-400"></i>
            Invitaciones Pendientes (${pendingInvitations.length})
          </span>
          <span class="text-[9.5px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-1.5 py-0.2 rounded-full font-bold">
            Entrar a la Obra
          </span>
        </div>

        <div class="space-y-2 max-h-56 overflow-y-auto custom-scroll pr-1">
          ${pendingInvitations.map(inv => `
            <div class="p-2.5 bg-slate-950/90 border border-blue-500/40 rounded-xl space-y-2 shadow-lg">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h5 class="text-xs font-bold text-white truncate" title="${escapeChatAttr(inv.projectName || '')}">
                    📁 ${escapeChatHtml(inv.projectName || 'Proyecto')}
                  </h5>
                  <span class="text-[10.5px] text-slate-300 block truncate">
                    Invitado por: <strong class="text-amber-300">${escapeChatHtml(inv.ownerName || 'Anfitrión')}</strong>
                  </span>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${inv.role === 'editar' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'}">
                  ${inv.role === 'editar' ? '⭐ Rol: Editor' : (inv.role === 'escribir' ? '✍️ Rol: Escribir' : '👁️ Rol: Leer')}
                </span>
              </div>

              <div class="flex items-center justify-between pt-1.5 border-t border-slate-800/80 gap-2 text-xs">
                <span class="text-[10px] text-slate-400 truncate">
                  Membresía: <b class="text-slate-200">${inv.ownerPlanId ? `Plan ${escapeChatHtml(String(inv.ownerPlanId).toUpperCase())}` : 'Plan Anfitrión'}</b>
                </span>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button type="button" onclick="event.stopPropagation(); handleRejectInvitationAction('${escapeAttrJs(inv.id)}')"
                          class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-[10.5px] font-semibold transition cursor-pointer flex items-center gap-1"
                          title="Eliminar y descartar esta notificación de invitación">
                    <i class="fa-solid fa-trash-can text-[9px]"></i> Eliminar
                  </button>
                  <button type="button" onclick="handleAcceptInvitationAction('${escapeAttrJs(inv.id)}')"
                          class="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10.5px] transition shadow shadow-blue-600/30 active:scale-95 cursor-pointer flex items-center gap-1">
                    <i class="fa-solid fa-check text-[10px]"></i> Aceptar y Entrar
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Selector de usuario para consultar mis menciones, todas o las de un usuario en específico -->
    <div onclick="event.stopPropagation()" class="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
      <span class="text-[10.5px] text-slate-400 font-medium">Filtrar usuario:</span>
      <select onchange="onNotificationsUserFilterChange(this.value)"
              class="bg-slate-800 border border-slate-700 text-amber-300 rounded-lg px-2 py-1 text-[11px] font-bold outline-none cursor-pointer max-w-[210px]">
        <option value="__self__" ${filterHandle === '__self__' ? 'selected' : ''}>Mis menciones (@)</option>
        <option value="all" ${filterHandle === 'all' ? 'selected' : ''}>Todos los etiquetados (@)</option>
        ${users.map(u => `
          <option value="${escapeChatAttr(u.handle)}" ${u.handle === filterHandle ? 'selected' : ''}>${escapeChatHtml(u.handle)} (${escapeChatHtml(u.roleLabel || 'Asignado')})</option>
        `).join('')}
      </select>
    </div>

    <!-- Lista de notificaciones donde mencionaron al usuario -->
    <div onclick="event.stopPropagation()" class="max-h-80 overflow-y-auto custom-scroll divide-y divide-slate-800/80 bg-slate-900">
      ${mentionsList.length === 0 ? `
        <div class="p-6 text-center space-y-1.5">
          <div class="w-10 h-10 rounded-full bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <i class="fa-regular fa-bell-slash text-base"></i>
          </div>
          <p class="text-xs font-bold text-slate-300">${emptyTitle}</p>
          <p class="text-[11px] text-slate-400">${emptyDesc}</p>
        </div>
      ` : mentionsList.map(item => {
        const m = item.message;
        const pObj = m.partidaId ? partidas.find(p => String(p.id) === String(m.partidaId)) : null;
        const mentionedTags = item.mentions && item.mentions.length > 0 ? item.mentions : (m.mentions || []);
        const divMeta = getChatDivisionMeta(getMessageDivision(m));
        const folioStr = m.folio || (m.folioNumber ? formatBitacoraFolio(m.folioNumber) : '');
        return `
          <div onclick="openMentionNotification('${escapeChatAttr(item.projectId)}', '${escapeChatAttr(m.id)}', '${escapeChatAttr(m.partidaId || '')}', event)"
               class="p-3 hover:bg-slate-800/90 transition cursor-pointer flex items-start gap-2.5 ${!item.isRead ? 'bg-blue-950/40' : ''}"
               title="Clic para abrir la Bitácora en ${escapeChatAttr(divMeta.title)}">
            <div class="w-7 h-7 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 relative">
              ${escapeChatHtml(m.authorInitials || 'US')}
              ${!item.isRead ? `<span class="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900 absolute -top-0.5 -right-0.5"></span>` : ''}
            </div>
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex items-center justify-between gap-1.5">
                <span class="text-[11px] font-bold text-white truncate">${escapeChatHtml(m.authorHandle || m.authorName || 'Usuario')}</span>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span class="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                    ${folioStr ? `<span class="font-mono text-[9.5px] bg-slate-800 text-slate-200 px-1 rounded">${escapeChatHtml(folioStr)}</span>` : ''}
                    <span>${escapeChatHtml(m.time || '')}</span>
                    <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                  </span>
                  <button type="button" onclick="event.stopPropagation(); dismissMentionNotification('${escapeChatAttr(item.projectId)}', '${escapeChatAttr(m.id)}', event)"
                          class="px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 border border-slate-700/80 hover:border-rose-500/40 inline-flex items-center gap-1 text-[9.5px] font-semibold transition cursor-pointer"
                          title="Eliminar esta notificación">
                    <i class="fa-solid fa-trash-can text-[8.5px]"></i> Eliminar
                  </button>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1">
                <span class="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-slate-800 text-slate-200 border border-slate-700 truncate max-w-[140px]">
                  📁 ${escapeChatHtml(item.projectName)}
                </span>
                <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 truncate max-w-[150px]">
                  ${escapeChatHtml(divMeta.numero)}: ${escapeChatHtml(divMeta.shortLabel)}
                </span>
                ${mentionedTags.map(tag => `
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-blue-500/25 text-blue-300 border border-blue-400/40">
                    🔔 ${escapeChatHtml(tag)}
                  </span>
                `).join('')}
                ${pObj ? `
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 truncate max-w-[140px]">
                    /${escapeChatHtml(pObj.clave)} ${escapeChatHtml(pObj.descripcion)}
                  </span>
                ` : ''}
                ${(m.estimaciones || []).map(est => `
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ${escapeChatHtml(est)}
                  </span>
                `).join('')}
              </div>

              <p class="text-xs text-slate-200 leading-snug line-clamp-2 break-words">${escapeChatHtml(m.text)}</p>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function renderSidebarNotificationsUI() {
  const badgeEl = document.getElementById('sidebar-bell-badge');
  const bellIconEl = document.getElementById('sidebar-bell-icon');
  const popoverEl = document.getElementById('sidebar-notifications-popover');

  const portalBadgeEl = document.getElementById('portal-bell-badge');
  const portalBellIconEl = document.getElementById('portal-bell-icon');
  const portalPopoverEl = document.getElementById('portal-notifications-popover');

  if (!badgeEl && !portalBadgeEl) return;

  const currentUser = getCurrentUser();
  const notifWrapper = document.getElementById('portal-notifications-wrapper');

  // Si no hay sesión iniciada, ocultar por completo la campana del portal y limpiar badges
  if (!currentUser) {
    if (notifWrapper) notifWrapper.classList.add('hidden');
    if (portalBadgeEl) {
      portalBadgeEl.classList.add('hidden');
      portalBadgeEl.textContent = '0';
    }
    if (portalPopoverEl) portalPopoverEl.classList.add('hidden');
    if (badgeEl) {
      badgeEl.classList.add('hidden');
      badgeEl.textContent = '0';
    }
    if (popoverEl) popoverEl.classList.add('hidden');
    return;
  }

  if (notifWrapper) notifWrapper.classList.remove('hidden');

  const filterHandle = selectedNotificationsHandle || '__self__';

  // Obtener invitaciones pendientes hacia el usuario conectado
  const pendingInvitations = (currentUser && currentUser.email) ? getPendingInvitationsForUser(currentUser.email) : [];
  const pendingInvsCount = pendingInvitations.length;
  const consumptionAlert = (currentUser && currentUser.email) ? getActiveUserConsumptionAlert(currentUser.email) : null;
  const consumptionAlertCount = consumptionAlert ? 1 : 0;

  // 1) Campana en el Área de Proyectos (barra lateral izquierda): notificaciones donde mencionaron usuarios en el proyecto activo
  const projectMentions = getUserMentionsNotifications(filterHandle, 'current');
  const projectUnreadCount = projectMentions.filter(item => !item.isRead).length + pendingInvsCount + consumptionAlertCount;
  const projectBadgeText = projectUnreadCount > 99 ? '99+' : String(projectUnreadCount);

  if (badgeEl) {
    if (projectUnreadCount > 0) {
      badgeEl.classList.remove('hidden');
      badgeEl.textContent = projectBadgeText;
      if (bellIconEl && bellIconEl.classList) bellIconEl.classList.add('text-amber-400');
    } else {
      badgeEl.classList.add('hidden');
      badgeEl.textContent = '0';
      if (bellIconEl && bellIconEl.classList) bellIconEl.classList.remove('text-amber-400');
    }
  }

  // 2) Campana en "Mis Proyectos de Obra" (portal): recopila todas las notificaciones que etiquetaron los usuarios de todos los proyectos
  const allProjectsMentions = getUserMentionsNotifications(filterHandle, 'all');
  const allProjectsUnreadCount = allProjectsMentions.filter(item => !item.isRead).length + pendingInvsCount + consumptionAlertCount;
  const portalBadgeText = allProjectsUnreadCount > 99 ? '99+' : String(allProjectsUnreadCount);

  if (portalBadgeEl) {
    if (allProjectsUnreadCount > 0) {
      portalBadgeEl.classList.remove('hidden');
      portalBadgeEl.textContent = portalBadgeText;
      if (portalBellIconEl && portalBellIconEl.classList) portalBellIconEl.classList.add('text-amber-400');
    } else {
      portalBadgeEl.classList.add('hidden');
      portalBadgeEl.textContent = '0';
      if (portalBellIconEl && portalBellIconEl.classList) portalBellIconEl.classList.remove('text-amber-400');
    }
  }

  if (!isNotificationsPopoverOpen) {
    if (popoverEl) popoverEl.classList.add('hidden');
    if (portalPopoverEl) portalPopoverEl.classList.add('hidden');
    return;
  }

  const partidas = getAllCatalogConceptTags();

  if (popoverEl) {
    const projectUsers = getAllNotificationsUsers('current');
    popoverEl.classList.remove('hidden');
    popoverEl.innerHTML = buildNotificationsPopoverHTML(
      projectMentions,
      projectUnreadCount,
      projectUsers,
      filterHandle,
      partidas,
      'current',
      pendingInvitations,
      consumptionAlert
    );
  }

  if (portalPopoverEl) {
    const allUsers = getAllNotificationsUsers('all');
    portalPopoverEl.classList.remove('hidden');
    portalPopoverEl.innerHTML = buildNotificationsPopoverHTML(
      allProjectsMentions,
      allProjectsUnreadCount,
      allUsers,
      filterHandle,
      partidas,
      'all',
      pendingInvitations,
      consumptionAlert
    );
  }
}

// =========================================================================
// CONTROLES DE LA BITÁCORA DE OBRA / CHAT POR PESTAÑAS (3 DIVISIONES)
// =========================================================================
export function setProjectChatDivision(divisionId) {
  if (!CHAT_DIVISIONS.some(d => d.id === divisionId)) return;
  activeChatDivision = divisionId;
  activeTagPickerKind = null;
  moveMenuMessageId = null;
  renderProjectChatDock();
  setTimeout(() => {
    const inp = document.getElementById('project-chat-input');
    if (inp) inp.focus();
  }, 40);
}

/**
 * Sincroniza la división activa del chat/bitácora al cambiar de pestaña en el proyecto.
 */
export function syncProjectChatDivisionWithTab(tabId) {
  try {
    const rawPending = localStorage.getItem('adm_const_pending_chat_open');
    if (rawPending) {
      const pending = JSON.parse(rawPending);
      const activePid = getActiveProjectId() || 'proj-default-01';
      if (pending && (!pending.projectId || pending.projectId === activePid) && pending.division) {
        return;
      }
    }
  } catch (e) {}

  const targetDivision = getDivisionForWorkspaceTab(tabId || getActiveWorkspaceTabId());
  if (!targetDivision || activeChatDivision === targetDivision) return;

  activeChatDivision = targetDivision;
  activeTagPickerKind = null;
  moveMenuMessageId = null;
  highlightedMessageId = null;

  if (isChatDockExpanded || (typeof document !== 'undefined' && document.getElementById('project-chat-dock'))) {
    renderProjectChatDock();
  }
}

export function onProjectChatEntryTypeChange(entryTypeId) {
  if (BITACORA_ENTRY_TYPES.some(t => t.id === entryTypeId)) {
    pendingComposerEntryType = entryTypeId;
  } else {
    pendingComposerEntryType = 'nota';
  }
}

export function onProjectChatSearchInput(val) {
  activeChatSearch = String(val || '');
  updateChatMessagesListDOM();
}

export function clearProjectChatSearch() {
  activeChatSearch = '';
  const searchEl = document.getElementById('project-chat-search');
  if (searchEl) searchEl.value = '';
  updateChatMessagesListDOM();
}

export function toggleMoveChatMessageMenu(msgId, event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  moveMenuMessageId = (moveMenuMessageId === msgId) ? null : msgId;
  updateChatMessagesListDOM();
}

export function moveProjectChatMessageDivision(msgId, targetDivisionId) {
  if (!CHAT_DIVISIONS.some(d => d.id === targetDivisionId)) return;
  const messages = loadProjectChatMessages();
  const target = messages.find(m => m.id === msgId);
  if (!target) return;
  target.division = targetDivisionId;
  saveProjectChatMessages(messages);
  moveMenuMessageId = null;
  const divMeta = getChatDivisionMeta(targetDivisionId);
  renderProjectChatDock();
  triggerExternalChatRefresh();
  showToast(`Asiento ${target.folio || ''} movido a ${divMeta.numero} · ${divMeta.shortLabel}`, 'success');
}

export function toggleProjectChatDock(forceState = null) {
  const wasExpanded = isChatDockExpanded;
  if (typeof forceState === 'boolean') {
    isChatDockExpanded = forceState;
  } else {
    isChatDockExpanded = !isChatDockExpanded;
  }
  if (!wasExpanded && isChatDockExpanded && !activePartidaFilterId && !highlightedMessageId) {
    activeChatDivision = getDivisionForWorkspaceTab(getActiveWorkspaceTabId());
  }
  if (isChatDockExpanded) {
    markActiveProjectChatMessagesAsRead();
  }
  renderProjectChatDock();
  if (isChatDockExpanded) {
    setTimeout(() => {
      const inp = document.getElementById('project-chat-input');
      if (inp) inp.focus();
    }, 60);
  }
}

export function toggleProjectChatMaximize(event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  isChatMaximized = !isChatMaximized;
  isChatDockExpanded = true;
  renderProjectChatDock();
  setTimeout(() => {
    const inp = document.getElementById('project-chat-input');
    if (inp) inp.focus();
  }, 40);
}

// =========================================================================
// FILTRADO DE ASIENTOS DE BITÁCORA
// =========================================================================
function filterMessagesForCriteria(allMessages, {
  divisionId = null,
  partidaId = null,
  filterType = 'all',
  searchQuery = '',
  authorHandle = null,
  partidas = null
} = {}) {
  const searchLower = String(searchQuery || '').trim().toLowerCase();
  const conceptsList = searchLower ? (partidas || getAllCatalogConceptTags()) : null;

  return (allMessages || []).filter(m => {
    if (divisionId && getMessageDivision(m) !== divisionId) return false;
    if (partidaId && String(m.partidaId) !== String(partidaId)) return false;

    if (filterType === 'mentions') {
      const mentions = extractMentionsFromMessage(m);
      if (mentions.length === 0) return false;
    } else if (filterType === 'estimaciones') {
      if (!Array.isArray(m.estimaciones) || m.estimaciones.length === 0) return false;
    } else if (filterType === 'reportes') {
      if (!Array.isArray(m.reportes) || m.reportes.length === 0) return false;
    } else if (['nota', 'orden', 'avance', 'acuerdo', 'incidencia'].includes(filterType)) {
      if ((m.entryType || 'nota') !== filterType) return false;
    }

    if (searchLower) {
      const pObj = (m.partidaId && conceptsList)
        ? conceptsList.find(p => String(p.id) === String(m.partidaId))
        : null;
      const haystack = [
        m.folio || '',
        m.time || '',
        m.authorName || '',
        m.authorHandle || '',
        m.authorRole || '',
        m.text || '',
        getEntryTypeMeta(m.entryType).label,
        ...(m.mentions || []),
        ...(m.estimaciones || []),
        ...(m.reportes || []),
        pObj ? `/${pObj.clave} ${pObj.descripcion}` : ''
      ].join(' ').toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }

    return true;
  });
}

// =========================================================================
// MODAL DE CONFIGURACIÓN E IMPRESIÓN DE FORMATO DE BITÁCORA DE OBRA
// =========================================================================
export function closeProjectChatPrintModal() {
  isPrintModalOpen = false;
  const modal = document.getElementById('project-chat-print-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function onPrintModalScopeChange() {
  const scopeChecked = document.querySelector('input[name="bitacora-print-scope"]:checked');
  const scope = scopeChecked ? scopeChecked.value : 'current_division';
  const filterRow = document.getElementById('bitacora-print-filter-row');
  if (filterRow) {
    const hasFilter = Boolean(activePartidaFilterId || activeChatFilter !== 'all' || String(activeChatSearch || '').trim());
    if (scope === 'current_division' && hasFilter) {
      filterRow.classList.remove('hidden');
    } else {
      filterRow.classList.add('hidden');
    }
  }
}

export function openProjectChatPrintModal(event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  if (typeof document === 'undefined') return;

  isPrintModalOpen = true;
  const allMessages = loadProjectChatMessages();
  const activeDivMeta = getChatDivisionMeta(activeChatDivision);
  const currentDivMessages = allMessages.filter(m => getMessageDivision(m) === activeChatDivision);
  const filteredCurrent = filterMessagesForCriteria(allMessages, {
    divisionId: activeChatDivision,
    partidaId: activePartidaFilterId,
    filterType: activeChatFilter,
    searchQuery: activeChatSearch
  });
  const hasActiveFilter = Boolean(activePartidaFilterId || activeChatFilter !== 'all' || String(activeChatSearch || '').trim());

  const users = getAssignedProjectUsers();
  const directorUser = users.find(u => /director/i.test(u.roleLabel)) || users[0];
  const coordUser = users.find(u => /coordinador de proyecto/i.test(u.roleLabel)) || users[1] || users[0];
  const costosUser = users.find(u => /costos|fcarm|supervisi/i.test(u.roleLabel)) || users[2] || users[0];

  const projectName = state.settings?.projectName || 'Proyecto de Obra';
  const year = new Date().getFullYear();
  const defaultBitacoraCode = `BIT-OBRA-${year}-01`;

  let modal = document.getElementById('project-chat-print-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'project-chat-print-modal';
    modal.style.zIndex = '10020';
    modal.onclick = (e) => {
      if (e.target === modal) closeProjectChatPrintModal();
    };
    document.body.appendChild(modal);
  }

  modal.className = 'no-print fixed inset-0 bg-slate-950/65 backdrop-blur-xs z-[10020] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- Header Modal -->
      <div class="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 inline-flex items-center justify-center shadow-sm shrink-0">
            <i class="fa-solid fa-book-open text-sm"></i>
          </span>
          <div class="min-w-0">
            <h3 class="font-extrabold text-sm sm:text-base leading-tight truncate">Imprimir Formato · Bitácora de Obra</h3>
            <p class="text-[11px] text-slate-300 truncate">${escapeChatHtml(projectName)}</p>
          </div>
        </div>
        <button type="button" onclick="closeProjectChatPrintModal()"
                class="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white inline-flex items-center justify-center cursor-pointer transition">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>

      <!-- Body Modal -->
      <div class="p-5 space-y-4 max-h-[78vh] overflow-y-auto custom-scroll text-xs text-slate-700">
        <!-- 1. Alcance -->
        <div class="space-y-2">
          <label class="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            1. Pestañas / Divisiones a Imprimir
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label class="p-3 rounded-xl border-2 border-blue-500 bg-blue-50/50 cursor-pointer flex items-start gap-2.5 transition hover:border-blue-600">
              <input type="radio" name="bitacora-print-scope" value="current_division" checked onchange="onPrintModalScopeChange()" class="mt-0.5 accent-blue-600 cursor-pointer">
              <div class="min-w-0">
                <div class="font-bold text-slate-900 text-xs">${escapeChatHtml(activeDivMeta.numero)} · Pestaña Actual</div>
                <div class="text-[11px] font-semibold text-blue-700 truncate">${escapeChatHtml(activeDivMeta.shortLabel)}</div>
                <div class="text-[10.5px] text-slate-500 mt-0.5">${currentDivMessages.length} asiento(s) en esta división</div>
              </div>
            </label>

            <label class="p-3 rounded-xl border border-slate-200 bg-white cursor-pointer flex items-start gap-2.5 transition hover:border-indigo-400">
              <input type="radio" name="bitacora-print-scope" value="all_divisions" onchange="onPrintModalScopeChange()" class="mt-0.5 accent-indigo-600 cursor-pointer">
              <div class="min-w-0">
                <div class="font-bold text-slate-900 text-xs">Bitácora Completa (3 Divisiones)</div>
                <div class="text-[11px] font-semibold text-indigo-700">Alcance · Seguimiento · Estimaciones</div>
                <div class="text-[10.5px] text-slate-500 mt-0.5">${allMessages.length} asiento(s) totales en la obra</div>
              </div>
            </label>
          </div>

          <div id="bitacora-print-filter-row" class="${hasActiveFilter ? '' : 'hidden'} pt-1">
            <label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 cursor-pointer text-[11px] font-semibold">
              <input type="checkbox" id="bitacora-print-respect-filters" checked class="accent-amber-600 cursor-pointer">
              <span>Aplicar filtro/búsqueda activa del chat (${filteredCurrent.length} de ${currentDivMessages.length} asientos)</span>
            </label>
          </div>
        </div>

        <!-- 2. Formato de Presentación -->
        <div class="space-y-2">
          <label class="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            2. Estilo de Formato Imprimible
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label class="p-3 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer flex items-start gap-2.5 hover:border-blue-400 transition">
              <input type="radio" name="bitacora-print-layout" value="official" checked class="mt-0.5 accent-blue-600 cursor-pointer">
              <div>
                <div class="font-bold text-slate-900 text-xs">Formato Oficial de Bitácora</div>
                <div class="text-[10.5px] text-slate-500 mt-0.5">Asientos foliados (BIT-XXX) en fichas técnicas con tipo de nota, etiquetas y Vo.Bo.</div>
              </div>
            </label>
            <label class="p-3 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer flex items-start gap-2.5 hover:border-blue-400 transition">
              <input type="radio" name="bitacora-print-layout" value="compact" class="mt-0.5 accent-blue-600 cursor-pointer">
              <div>
                <div class="font-bold text-slate-900 text-xs">Formato Ejecutivo Tabular</div>
                <div class="text-[10.5px] text-slate-500 mt-0.5">Tabla compacta de auditoría con columnas de folio, fecha, autor, referencias y descripción.</div>
              </div>
            </label>
          </div>
        </div>

        <!-- 3. Datos de Carátula y Firmas -->
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[10.5px] font-bold text-slate-600 mb-1">No. de Bitácora / Libro</label>
              <input type="text" id="bitacora-print-code" value="${escapeChatAttr(defaultBitacoraCode)}"
                     class="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500">
            </div>
            <div>
              <label class="block text-[10.5px] font-bold text-slate-600 mb-1">Orientación de Hoja</label>
              <select id="bitacora-print-orientation"
                      class="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer">
                <option value="portrait" selected>Carta Vertical (Recomendado)</option>
                <option value="landscape">Carta Horizontal (Ancho)</option>
              </select>
            </div>
          </div>

          <div class="pt-1 border-t border-slate-200 space-y-2">
            <label class="inline-flex items-center gap-2 font-bold text-slate-700 text-[11px] cursor-pointer">
              <input type="checkbox" id="bitacora-print-signatures" checked class="accent-blue-600 cursor-pointer">
              <span>Incluir cuadro de firmas oficiales al calce del formato</span>
            </label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <span class="block text-[9.5px] font-bold text-slate-500 uppercase mb-0.5">Residencia / Coord.</span>
                <input type="text" id="bitacora-print-sig1" value="${escapeChatAttr(coordUser ? coordUser.name : 'Responsable de Obra')}"
                       class="w-full bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-800">
              </div>
              <div>
                <span class="block text-[9.5px] font-bold text-slate-500 uppercase mb-0.5">Supervisión / Costos</span>
                <input type="text" id="bitacora-print-sig2" value="${escapeChatAttr(costosUser ? costosUser.name : 'Supervisión Técnica')}"
                       class="w-full bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-800">
              </div>
              <div>
                <span class="block text-[9.5px] font-bold text-slate-500 uppercase mb-0.5">Dirección / Visto Bueno</span>
                <input type="text" id="bitacora-print-sig3" value="${escapeChatAttr(directorUser ? directorUser.name : 'Dirección General')}"
                       class="w-full bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-800">
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Modal -->
      <div class="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-2">
        <button type="button" onclick="closeProjectChatPrintModal()"
                class="px-4 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-200 transition cursor-pointer">
          Cancelar
        </button>
        <button type="button" onclick="confirmProjectChatPrintFromModal()"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer">
          <i class="fa-solid fa-print text-xs"></i>
          <span>Generar Formato de Bitácora</span>
        </button>
      </div>
    </div>
  `;
}

export function confirmProjectChatPrintFromModal() {
  const scopeEl = document.querySelector('input[name="bitacora-print-scope"]:checked');
  const layoutEl = document.querySelector('input[name="bitacora-print-layout"]:checked');
  const respectEl = document.getElementById('bitacora-print-respect-filters');
  const codeEl = document.getElementById('bitacora-print-code');
  const orientEl = document.getElementById('bitacora-print-orientation');
  const sigCheckEl = document.getElementById('bitacora-print-signatures');
  const sig1El = document.getElementById('bitacora-print-sig1');
  const sig2El = document.getElementById('bitacora-print-sig2');
  const sig3El = document.getElementById('bitacora-print-sig3');

  const config = {
    scope: scopeEl ? scopeEl.value : 'current_division',
    layout: layoutEl ? layoutEl.value : 'official',
    respectFilters: respectEl ? respectEl.checked : true,
    bitacoraNumber: codeEl ? codeEl.value.trim() : '',
    orientation: orientEl ? orientEl.value : 'portrait',
    includeSignatures: sigCheckEl ? sigCheckEl.checked : true,
    sig1Name: sig1El ? sig1El.value.trim() : '',
    sig2Name: sig2El ? sig2El.value.trim() : '',
    sig3Name: sig3El ? sig3El.value.trim() : ''
  };

  closeProjectChatPrintModal();
  printProjectChatReport(config);
}

function buildBitacoraTagsPrintHtml(m, partidas) {
  const pObj = m.partidaId ? partidas.find(p => String(p.id) === String(m.partidaId)) : null;
  const tags = [];
  if (pObj) {
    tags.push(`<span class="bit-tag bit-tag-partida">/${escapeChatHtml(pObj.clave)} ${escapeChatHtml(pObj.descripcion)}</span>`);
  }
  (m.mentions || []).forEach(u => {
    tags.push(`<span class="bit-tag bit-tag-user">${escapeChatHtml(u)}</span>`);
  });
  (m.estimaciones || []).forEach(e => {
    tags.push(`<span class="bit-tag bit-tag-est">${escapeChatHtml(e)}</span>`);
  });
  (m.reportes || []).forEach(r => {
    tags.push(`<span class="bit-tag bit-tag-rep">${escapeChatHtml(r)}</span>`);
  });
  return tags;
}

function buildBitacoraDivisionSectionHtml(divMeta, entries, partidas, layout) {
  const bannerColors = {
    alcance_presupuesto: '#1e3a8a',
    seguimiento_calendario: '#b45309',
    estimaciones: '#065f46'
  };
  const bannerBg = bannerColors[divMeta.id] || '#0f172a';

  const headerBanner = `
    <div class="section-banner" style="background-color: ${bannerBg}; margin-top: 14px;">
      <span>${escapeChatHtml(divMeta.numero.toUpperCase())} · ${escapeChatHtml(divMeta.shortLabel)}</span>
      <span style="font-size: 7.5pt; font-weight: 600; opacity: 0.92;">${entries.length} Asiento(s) · ${escapeChatHtml(divMeta.subtitle)}</span>
    </div>
  `;

  if (entries.length === 0) {
    return `
      ${headerBanner}
      <div style="border: 1px dashed #cbd5e1; border-top: none; border-radius: 0 0 6px 6px; padding: 14px; text-align: center; color: #64748b; font-size: 8.5pt; margin-bottom: 10px;">
        No se registraron asientos en esta división bajo el criterio seleccionado.
      </div>
    `;
  }

  if (layout === 'compact') {
    const rowsHtml = entries.map(m => {
      const typeMeta = getEntryTypeMeta(m.entryType);
      const tags = buildBitacoraTagsPrintHtml(m, partidas);
      return `
        <tr>
          <td class="text-center font-mono font-bold" style="white-space: nowrap; color: #0f172a;">${escapeChatHtml(m.folio || 'BIT')}</td>
          <td style="white-space: nowrap; font-family: monospace; font-size: 7.5pt; color: #334155;">${escapeChatHtml(m.time || '-')}</td>
          <td>
            <span class="bit-type-pill" style="background:${typeMeta.printBg}; color:${typeMeta.printColor}; border-color:${typeMeta.printBorder};">
              ${escapeChatHtml(typeMeta.shortLabel)}
            </span>
          </td>
          <td>
            <div style="font-weight: 700; color: #0f172a;">${escapeChatHtml(m.authorHandle || m.authorName || 'Usuario')}</div>
            <div style="font-size: 7pt; color: #64748b;">${escapeChatHtml(m.authorRole || 'Asignado')}</div>
          </td>
          <td>${tags.length > 0 ? tags.join(' ') : '<span style="color:#94a3b8; font-size:7.5pt;">General</span>'}</td>
          <td style="color: #0f172a; line-height: 1.42; white-space: pre-line;">${escapeChatHtml(m.text || '')}</td>
        </tr>
      `;
    }).join('');

    return `
      ${headerBanner}
      <table class="report-table" style="margin-top: 0;">
        <thead>
          <tr>
            <th class="text-center" style="width: 66px;">Folio</th>
            <th style="width: 96px;">Fecha / Hora</th>
            <th style="width: 78px;">Tipo</th>
            <th style="width: 135px;">Autor / Cargo</th>
            <th style="width: 165px;">Referencias</th>
            <th>Asiento / Descripción de Bitácora</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  // Formato Oficial de Bitácora (Asientos Foliados en Fichas Técnicas)
  const cardsHtml = entries.map(m => {
    const typeMeta = getEntryTypeMeta(m.entryType);
    const tags = buildBitacoraTagsPrintHtml(m, partidas);
    return `
      <div class="bit-entry-card">
        <div class="bit-entry-head">
          <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
            <span class="bit-folio-badge">${escapeChatHtml(m.folio || 'BIT-001')}</span>
            <span class="bit-type-pill" style="background:${typeMeta.printBg}; color:${typeMeta.printColor}; border-color:${typeMeta.printBorder};">
              ${escapeChatHtml(typeMeta.label)}
            </span>
            <span style="font-weight:700; color:#0f172a; font-size:8.5pt;">${escapeChatHtml(m.authorName || m.authorHandle || 'Usuario')}</span>
            <span style="color:#64748b; font-size:7.5pt;">(${escapeChatHtml(m.authorRole || 'Asignado')})</span>
          </div>
          <div style="font-family:monospace; font-size:8pt; font-weight:700; color:#334155; white-space:nowrap;">
            ${escapeChatHtml(m.time || '-')}
          </div>
        </div>

        ${tags.length > 0 ? `
          <div class="bit-entry-tags">
            ${tags.join(' ')}
          </div>
        ` : ''}

        <div class="bit-entry-body">${escapeChatHtml(m.text || '')}</div>

        <div class="bit-entry-foot">
          <span>${escapeChatHtml(divMeta.numero)} · ${escapeChatHtml(divMeta.shortLabel)}</span>
          <span>Autor: ${escapeChatHtml(m.authorHandle || '')} &nbsp;|&nbsp; Vo.Bo. / Seguimiento: ___________________</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    ${headerBanner}
    <div style="border: 1px solid #cbd5e1; border-top: none; border-radius: 0 0 6px 6px; padding: 10px; background: #ffffff; margin-bottom: 10px;">
      ${cardsHtml}
    </div>
  `;
}

export function printProjectChatReport(optionsOrEvent = null) {
  let opts = {};
  if (optionsOrEvent && typeof optionsOrEvent.stopPropagation === 'function') {
    optionsOrEvent.stopPropagation();
  } else if (optionsOrEvent && typeof optionsOrEvent === 'object' && !optionsOrEvent.target) {
    opts = optionsOrEvent;
  }

  const scope = opts.scope === 'all_divisions' ? 'all_divisions' : 'current_division';
  const layout = opts.layout === 'compact' ? 'compact' : 'official';
  const respectFilters = opts.respectFilters !== false;
  const orientation = opts.orientation === 'landscape' ? 'landscape' : 'portrait';
  const includeSignatures = opts.includeSignatures !== false;

  const companyName = state.settings?.companyName || 'Constructora / Despacho de Arquitectura';
  const companySubtitle = state.settings?.companySubtitle || 'Bitácora Oficial y Seguimiento de Obra';
  const projectName = state.settings?.projectName || 'Proyecto de Obra';
  const projectLocation = state.settings?.projectLocation || 'Ubicación no especificada';
  const logoSrc = state.settings?.companyLogo || '';

  const users = getAssignedProjectUsers();
  const partidas = getAllCatalogConceptTags();
  const allMessages = loadProjectChatMessages();

  const year = new Date().getFullYear();
  const bitacoraNumber = opts.bitacoraNumber || `BIT-OBRA-${year}-01`;

  const divisionsToRender = scope === 'all_divisions'
    ? CHAT_DIVISIONS
    : [getChatDivisionMeta(activeChatDivision)];

  const divisionSectionsData = divisionsToRender.map(divMeta => {
    const entries = filterMessagesForCriteria(allMessages, {
      divisionId: divMeta.id,
      partidaId: (scope === 'current_division' && respectFilters) ? activePartidaFilterId : null,
      filterType: (scope === 'current_division' && respectFilters) ? activeChatFilter : 'all',
      searchQuery: (scope === 'current_division' && respectFilters) ? activeChatSearch : '',
      partidas
    });
    return { divMeta, entries };
  });

  const totalPrinted = divisionSectionsData.reduce((acc, item) => acc + item.entries.length, 0);

  // Contadores globales por división y tipo de nota
  const countDiv1 = allMessages.filter(m => getMessageDivision(m) === 'alcance_presupuesto').length;
  const countDiv2 = allMessages.filter(m => getMessageDivision(m) === 'seguimiento_calendario').length;
  const countDiv3 = allMessages.filter(m => getMessageDivision(m) === 'estimaciones').length;

  const activePartidaObj = activePartidaFilterId
    ? partidas.find(p => String(p.id) === String(activePartidaFilterId))
    : null;

  let filterLabel = scope === 'all_divisions'
    ? 'Bitácora Completa (Todas las Divisiones)'
    : `${getChatDivisionMeta(activeChatDivision).title} (Sin filtros adicionales)`;

  if (scope === 'current_division' && respectFilters) {
    const filterParts = [];
    if (activePartidaObj) filterParts.push(`Concepto /${activePartidaObj.clave} ${activePartidaObj.descripcion}`);
    if (activeChatFilter !== 'all') filterParts.push(`Filtro: ${activeChatFilter}`);
    if (String(activeChatSearch || '').trim()) filterParts.push(`Búsqueda: "${activeChatSearch.trim()}"`);
    if (filterParts.length > 0) {
      filterLabel = `${getChatDivisionMeta(activeChatDivision).title} · ${filterParts.join(' | ')}`;
    }
  }

  const fechaImpresion = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const directorUser = users.find(u => /director/i.test(u.roleLabel)) || users[0];
  const coordUser = users.find(u => /coordinador de proyecto/i.test(u.roleLabel)) || users[1] || users[0];
  const costosUser = users.find(u => /costos|fcarm|supervisi/i.test(u.roleLabel)) || users[2] || users[0];

  const sig1Name = opts.sig1Name || (coordUser ? coordUser.name : 'Nombre y Firma');
  const sig2Name = opts.sig2Name || (costosUser ? costosUser.name : 'Nombre y Firma');
  const sig3Name = opts.sig3Name || (directorUser ? directorUser.name : 'Nombre y Firma');

  const sectionsHtml = divisionSectionsData
    .map(item => buildBitacoraDivisionSectionHtml(item.divMeta, item.entries, partidas, layout))
    .join('');

  const customPrintStyles = `
    <style>
      .bit-kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-bottom: 12px;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .bit-kpi-card {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 7px 10px;
        background: #f8fafc;
      }
      .bit-kpi-label {
        font-size: 6.8pt;
        font-weight: 700;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.02em;
      }
      .bit-kpi-val {
        font-size: 11pt;
        font-weight: 800;
        color: #0f172a;
        margin-top: 2px;
      }
      .bit-entry-card {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        margin-bottom: 9px;
        background: #ffffff;
        page-break-inside: avoid;
        break-inside: avoid;
        overflow: hidden;
      }
      .bit-entry-card:last-child {
        margin-bottom: 0;
      }
      .bit-entry-head {
        background: #f1f5f9;
        border-bottom: 1px solid #cbd5e1;
        padding: 6px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .bit-folio-badge {
        background: #0f172a;
        color: #fbbf24;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 7.5pt;
        font-weight: 800;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .bit-type-pill {
        display: inline-block;
        padding: 1.5px 6px;
        border-radius: 4px;
        font-size: 7pt;
        font-weight: 700;
        border: 1px solid #cbd5e1;
      }
      .bit-entry-tags {
        padding: 5px 10px 0 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .bit-tag {
        display: inline-block;
        padding: 1.5px 5px;
        border-radius: 4px;
        font-size: 7pt;
        font-weight: 700;
      }
      .bit-tag-partida { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
      .bit-tag-user { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
      .bit-tag-est { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
      .bit-tag-rep { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
      .bit-entry-body {
        padding: 8px 10px;
        font-size: 8.5pt;
        color: #0f172a;
        line-height: 1.48;
        white-space: pre-line;
      }
      .bit-entry-foot {
        padding: 4px 10px;
        background: #f8fafc;
        border-top: 1px dashed #e2e8f0;
        font-size: 7pt;
        color: #64748b;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    </style>
  `;

  const bodyContent = `
    ${customPrintStyles}
    <div class="doc-header">
      <div style="display: flex; align-items: center; gap: 12px;">
        ${logoSrc ? `<img src="${logoSrc}" alt="Logo" style="height: 68px; width: 68px; min-width: 68px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
        <div>
          <div style="font-size: 10.5pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em;">
            ${escapeChatHtml(companyName)}
          </div>
          <h1 class="doc-title" style="font-size: 12pt; font-weight: 900; color: #0f172a; margin: 2px 0;">
            BITÁCORA OFICIAL DE OBRA
          </h1>
          <div style="font-size: 8.5pt; color: #475569; font-weight: 600;">
            ${escapeChatHtml(companySubtitle)} · Proyecto: <strong style="color:#0f172a;">${escapeChatHtml(projectName)}</strong>
          </div>
        </div>
      </div>

      <div class="doc-meta">
        <div><strong>Libro / Folio:</strong> <span class="meta-tag font-mono font-bold" style="color:#1e3a8a;">${escapeChatHtml(bitacoraNumber)}</span></div>
        <div><strong>Fecha de emisión:</strong> ${escapeChatHtml(fechaImpresion)}</div>
        <div><strong>Ubicación:</strong> <span class="meta-tag">${escapeChatHtml(projectLocation)}</span></div>
      </div>
    </div>

    <!-- Ficha Técnica de Control -->
    <div class="concept-card" style="margin-bottom: 12px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 8pt;">
        <div>
          <div><strong>Alcance del Documento:</strong> ${escapeChatHtml(filterLabel)}</div>
          <div style="margin-top: 3px;"><strong>Formato:</strong> ${layout === 'official' ? 'Asientos Foliados (Oficial)' : 'Tabla Ejecutiva Compacta'}</div>
        </div>
        <div>
          <div><strong>Responsables Asignados:</strong> ${escapeChatHtml(users.map(u => `${u.name} (${u.handle})`).join(', '))}</div>
          <div style="margin-top: 3px;"><strong>Asientos Incluidos:</strong> <span class="font-mono font-bold">${totalPrinted}</span> nota(s)</div>
        </div>
      </div>
    </div>

    <!-- Resumen por División de la Bitácora -->
    <div class="bit-kpi-grid">
      <div class="bit-kpi-card" style="border-left: 3px solid #3730a3;">
        <div class="bit-kpi-label">Div. 1 · Alcance y Presup.</div>
        <div class="bit-kpi-val font-mono">${countDiv1} <span style="font-size:7.5pt; font-weight:600; color:#64748b;">notas</span></div>
      </div>
      <div class="bit-kpi-card" style="border-left: 3px solid #b45309;">
        <div class="bit-kpi-label">Div. 2 · Seguimiento y Cal.</div>
        <div class="bit-kpi-val font-mono">${countDiv2} <span style="font-size:7.5pt; font-weight:600; color:#64748b;">notas</span></div>
      </div>
      <div class="bit-kpi-card" style="border-left: 3px solid #065f46;">
        <div class="bit-kpi-label">Div. 3 · Estimaciones</div>
        <div class="bit-kpi-val font-mono">${countDiv3} <span style="font-size:7.5pt; font-weight:600; color:#64748b;">notas</span></div>
      </div>
      <div class="bit-kpi-card" style="border-left: 3px solid #0f172a; background:#eef2ff;">
        <div class="bit-kpi-label">Asientos en este Formato</div>
        <div class="bit-kpi-val font-mono" style="color:#1e3a8a;">${totalPrinted} <span style="font-size:7.5pt; font-weight:600; color:#475569;">impresos</span></div>
      </div>
    </div>

    ${sectionsHtml}

    ${includeSignatures ? `
      <div class="signatures-grid" style="margin-top: 34px;">
        <div class="signature-box">
          <strong>RESIDENCIA / COORDINACIÓN</strong>
          <span>${escapeChatHtml(sig1Name)}</span>
        </div>
        <div class="signature-box">
          <strong>SUPERVISIÓN / CONTROL DE COSTOS</strong>
          <span>${escapeChatHtml(sig2Name)}</span>
        </div>
        <div class="signature-box">
          <strong>DIRECCIÓN / VISTO BUENO</strong>
          <span>${escapeChatHtml(sig3Name)}</span>
        </div>
      </div>
    ` : ''}

    <div style="margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7pt; color: #64748b;">
      <span>Bitácora Digital de Obra · Divisiones: 1) Alcance y Presupuesto · 2) Seguimiento y Calendario · 3) Estimaciones</span>
      <span>Emitido por cubikar · ${escapeChatHtml(fechaImpresion)}</span>
    </div>
  `;

  const docTitle = `Bitacora_Obra_${projectName.replace(/[^\w.-]+/g, '_')}_${scope === 'all_divisions' ? 'Completa' : getChatDivisionMeta(activeChatDivision).codePrefix}`;
  const extraToolbarHtml = `
    <span style="font-size:12px; background:#1e293b; border:1px solid #475569; padding:5px 10px; border-radius:6px; color:#cbd5e1;">
      ${scope === 'all_divisions' ? '3 Divisiones Completas' : escapeChatHtml(getChatDivisionMeta(activeChatDivision).title)} · <strong>${totalPrinted}</strong> asiento(s)
    </span>
  `;

  openPrintWindow(docTitle, bodyContent, orientation, {
    extraToolbarHtml,
    autoPrint: false
  });
}

export function openProjectChatForPartida(partidaId, event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  const pidStr = String(partidaId);
  const targetDivision = getDivisionForWorkspaceTab(getActiveWorkspaceTabId());

  if (isChatDockExpanded && activePartidaFilterId === pidStr && activeChatDivision === targetDivision) {
    clearProjectChatPartidaFilter();
    return;
  }

  isChatDockExpanded = true;
  markActiveProjectChatMessagesAsRead();
  activeChatDivision = targetDivision;
  activePartidaFilterId = pidStr;
  pendingComposerTags.partidaId = pidStr;
  activeTagPickerKind = null;
  moveMenuMessageId = null;
  renderProjectChatDock();
  triggerExternalChatRefresh();
  setTimeout(() => {
    const inp = document.getElementById('project-chat-input');
    if (inp) inp.focus();
  }, 60);
}

export function clearProjectChatPartidaFilter() {
  activePartidaFilterId = null;
  pendingComposerTags.partidaId = null;
  renderProjectChatDock();
  triggerExternalChatRefresh();
}

export function setProjectChatFilter(filterType) {
  activeChatFilter = filterType || 'all';
  renderProjectChatDock();
}

export function onProjectChatAuthorChange(handle) {
  selectedAuthorHandle = handle;
  renderProjectChatDock();
  renderSidebarNotificationsUI();
}

export function toggleProjectChatTagPicker(kind) {
  if (activeTagPickerKind === kind) {
    activeTagPickerKind = null;
  } else {
    activeTagPickerKind = kind;
  }
  renderProjectChatDock();
}

export function addProjectChatPendingTag(kind, val) {
  if (kind === 'user') {
    if (!pendingComposerTags.mentions.includes(val)) pendingComposerTags.mentions.push(val);
  } else if (kind === 'partida') {
    pendingComposerTags.partidaId = String(val);
  } else if (kind === 'estimacion') {
    if (!pendingComposerTags.estimaciones.includes(val)) pendingComposerTags.estimaciones.push(val);
  } else if (kind === 'reporte') {
    if (!pendingComposerTags.reportes.includes(val)) pendingComposerTags.reportes.push(val);
  }
  activeTagPickerKind = null;
  renderProjectChatDock();
  setTimeout(() => {
    const inp = document.getElementById('project-chat-input');
    if (inp) inp.focus();
  }, 30);
}

export function removeProjectChatPendingTag(kind, val) {
  if (kind === 'partida') pendingComposerTags.partidaId = null;
  if (kind === 'user') pendingComposerTags.mentions = pendingComposerTags.mentions.filter(x => x !== val);
  if (kind === 'estimacion') pendingComposerTags.estimaciones = pendingComposerTags.estimaciones.filter(x => x !== val);
  if (kind === 'reporte') pendingComposerTags.reportes = pendingComposerTags.reportes.filter(x => x !== val);
  renderProjectChatDock();
}

export function sendProjectChatMessage() {
  const inp = document.getElementById('project-chat-input');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';

  if (lastSentChatGuard.text === text && (Date.now() - lastSentChatGuard.ts) < 1500) return;
  lastSentChatGuard = { text, ts: Date.now() };

  const users = getAssignedProjectUsers();
  const currentUser = getCurrentUser() || getLastKnownUser();
  const defaultAuthor = users.find(u => currentUser && u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) || users[0] || {
    name: currentUser?.name || 'Usuario',
    handle: '@Usuario',
    roleLabel: 'Colaborador',
    initials: 'US',
    avatar: currentUser?.avatar || ''
  };
  const authorObj = users.find(u => u.handle === selectedAuthorHandle) || defaultAuthor;

  const mergedMentions = extractMentionsFromMessage({
    mentions: pendingComposerTags.mentions,
    text
  });
  users.forEach(u => {
    if (text.toLowerCase().includes(u.handle.toLowerCase()) && !mergedMentions.some(m => m.toLowerCase() === u.handle.toLowerCase())) {
      mergedMentions.push(u.handle);
    }
  });

  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

  const messages = loadProjectChatMessages();
  const maxFolio = messages.reduce((max, item) => {
    const n = parseInt(item && item.folioNumber, 10);
    return (Number.isFinite(n) && n > max) ? n : max;
  }, 0);
  const nextFolioNumber = maxFolio + 1;

  const newMsg = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    folioNumber: nextFolioNumber,
    folio: formatBitacoraFolio(nextFolioNumber),
    division: activeChatDivision,
    entryType: pendingComposerEntryType || 'nota',
    createdAt: now.toISOString(),
    isRead: true,
    authorName: authorObj.name,
    authorHandle: authorObj.handle,
    authorRole: authorObj.roleLabel,
    authorInitials: authorObj.initials,
    authorEmail: currentUser?.email || '',
    authorAvatar: authorObj.avatar || '',
    time: `${dateStr} • ${timeStr}`,
    partidaId: pendingComposerTags.partidaId || activePartidaFilterId || null,
    mentions: mergedMentions,
    estimaciones: [...pendingComposerTags.estimaciones],
    reportes: [...pendingComposerTags.reportes],
    readBy: [],
    text
  };
  messages.push(newMsg);

  saveProjectChatMessages(messages);
  broadcastChatMessage(getActiveProjectId(), newMsg);
  pendingComposerEntryType = 'nota';
  pendingComposerTags = {
    partidaId: activePartidaFilterId || null,
    mentions: [],
    estimaciones: [],
    reportes: []
  };
  activeTagPickerKind = null;
  moveMenuMessageId = null;

  renderProjectChatDock();
  triggerExternalChatRefresh();

  setTimeout(() => {
    const listEl = document.getElementById('project-chat-messages-list');
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  }, 40);
}

export function deleteProjectChatMessage(msgId) {
  const cleanTargetId = normalizeChatMsgId(msgId);
  const messages = loadProjectChatMessages();
  const next = messages.filter(m => normalizeChatMsgId(m.id) !== cleanTargetId);
  saveProjectChatMessages(next);
  broadcastChatDelete(getActiveProjectId(), cleanTargetId);
  if (normalizeChatMsgId(moveMenuMessageId) === cleanTargetId) moveMenuMessageId = null;
  renderProjectChatDock();
  triggerExternalChatRefresh();
}

export function jumpToProjectChatTag(kind, value) {
  if (kind === 'partida') {
    activePartidaFilterId = String(value);
    pendingComposerTags.partidaId = String(value);
    renderProjectChatDock();
    triggerExternalChatRefresh();
    const pObj = findChatConceptById(value);
    if (pObj) {
      showToast(`Filtrando asientos de Concepto: /${pObj.clave} ${pObj.descripcion}`, 'info');
    }
  } else if (kind === 'estimacion') {
    const valStr = String(value || '');
    if (valStr.toLowerCase().includes('presupuesto')) {
      if (typeof window.switchTab === 'function') {
        window.switchTab('presupuesto');
      }
      showToast(`Abriendo pestaña 1. Presupuesto (${value})`, 'info');
      return;
    }
    const ests = getProjectEstimacionesTags();
    const found = ests.find(e => e.label === value || e.id === value);
    if (found) {
      setActiveEstimacionId(found.id);
    }
    if (typeof window.switchTab === 'function') {
      window.switchTab('estimaciones');
    }
    showToast(`Abriendo ${value} en la pestaña Estimaciones`, 'info');
  } else if (kind === 'reporte') {
    const valStr = String(value || '').toLowerCase();
    let targetTab = 'alcances';
    if (valStr.includes('presupuesto') || valStr.includes('fcarm') || valStr.includes('insumos')) {
      targetTab = 'presupuesto';
    } else if (valStr.includes('seguimiento') || valStr.includes('bitacora')) {
      targetTab = 'seguimiento';
    } else if (valStr.includes('calendario') || valStr.includes('gantt') || valStr.includes('critica')) {
      targetTab = 'calendario';
    } else if (valStr.includes('estimacion') || valStr.includes('flujo')) {
      targetTab = 'estimaciones';
    } else {
      targetTab = 'alcances';
    }
    if (typeof window.switchTab === 'function') {
      window.switchTab(targetTab);
      showToast(`Navegando a ${value.replace('!', '')}`, 'info');
    }
  }
}

// Construir HTML de la lista de asientos dentro de la división activa
function buildChatMessagesListHtml(filteredMessages, partidas, activeDivMeta) {
  const crossDivHints = [];
  if (activePartidaFilterId) {
    const divCounts = getPartidaChatDivisionCounts(activePartidaFilterId);
    CHAT_DIVISIONS.forEach(div => {
      if (div.id !== activeChatDivision && (divCounts[div.id] || 0) > 0) {
        crossDivHints.push(`
          <button type="button" onclick="setProjectChatDivision('${div.id}')"
                  class="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold cursor-pointer transition">
            ${escapeChatHtml(div.numero)}: ${escapeChatHtml(div.shortLabel)} (${divCounts[div.id]}) ↗
          </button>
        `);
      }
    });
  }

  const crossDivBanner = crossDivHints.length > 0 ? `
    <div class="p-2 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-600">
      <span class="font-semibold">Otras divisiones con notas de este concepto:</span>
      ${crossDivHints.join('')}
    </div>
  ` : '';

  if (filteredMessages.length === 0) {
    return `
      ${crossDivBanner}
      <div class="h-full min-h-[170px] flex flex-col items-center justify-center text-center p-4 text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
        <span class="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-1.5">
          <i class="fa-solid ${activeDivMeta.icon} text-sm"></i>
        </span>
        <p class="font-semibold text-slate-600">Sin asientos en ${escapeChatHtml(activeDivMeta.numero)} · ${escapeChatHtml(activeDivMeta.shortLabel)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">
          Asienta una nueva nota abajo o etiqueta un <strong>@Usuario</strong>, <strong>/Concepto</strong>, <strong>#Estimación</strong> o <strong>!Reporte</strong>.
        </p>
      </div>
    `;
  }

  const cardsHtml = filteredMessages.map(m => {
    const pObj = m.partidaId ? partidas.find(p => String(p.id) === String(m.partidaId)) : null;
    const isHighlighted = highlightedMessageId && m.id === highlightedMessageId;
    const typeMeta = getEntryTypeMeta(m.entryType);
    const folioStr = m.folio || (m.folioNumber ? formatBitacoraFolio(m.folioNumber) : 'BIT-001');
    const isMoveOpen = moveMenuMessageId === m.id;
    const safeMsgIdAttr = escapeChatAttr(m.id);

    return `
      <div id="chat-msg-item-${safeMsgIdAttr}" class="p-2.5 rounded-lg border ${isHighlighted ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-300' : 'border-slate-200 bg-slate-50/70'} space-y-1.5 group transition">
        <!-- Fila 1: Folio + Tipo de Nota + Autor + Fecha/Hora + Acciones -->
        <div class="flex items-center justify-between gap-1.5 flex-wrap">
          <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span class="px-1.5 py-0.5 rounded font-mono text-[9.5px] font-extrabold bg-slate-900 text-amber-300 shrink-0" title="Folio de Bitácora">
              ${escapeChatHtml(folioStr)}
            </span>
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9.5px] font-bold shrink-0 ${typeMeta.badgeClass}">
              <i class="fa-solid ${typeMeta.icon} text-[8.5px]"></i>
              ${escapeChatHtml(typeMeta.shortLabel)}
            </span>
            <span class="w-5 h-5 rounded-full bg-blue-700 text-white text-[9px] font-bold inline-flex items-center justify-center shrink-0">
              ${escapeChatHtml(m.authorInitials || 'US')}
            </span>
            <span class="text-[11px] font-bold text-slate-800 truncate">${escapeChatHtml(m.authorHandle || m.authorName)}</span>
            <span class="hidden sm:inline-block px-1.5 py-0.2 rounded text-[9.5px] bg-white border border-slate-200 text-slate-500 truncate max-w-[140px]">${escapeChatHtml(m.authorRole || 'Asignado')}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0 ml-auto">
            <span class="text-[10px] font-mono text-slate-500">${escapeChatHtml(m.time || '')}</span>
            <button type="button" onclick="toggleMoveChatMessageMenu('${safeMsgIdAttr}', event)"
                    title="Mover asiento a otra división/pestaña"
                    class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 text-[10px] px-1 cursor-pointer transition ${isMoveOpen ? 'opacity-100 text-indigo-600' : ''}">
              <i class="fa-solid fa-right-left"></i>
            </button>
            <button type="button" onclick="deleteProjectChatMessage('${safeMsgIdAttr}')"
                    title="Eliminar asiento de bitácora"
                    class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 text-[10px] px-1 cursor-pointer transition">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>

        ${isMoveOpen ? `
          <div class="p-1.5 rounded-md bg-white border border-indigo-200 flex flex-wrap items-center gap-1 text-[10px]">
            <span class="font-bold text-slate-500 mr-1">Mover a:</span>
            ${CHAT_DIVISIONS.map(d => `
              <button type="button" onclick="moveProjectChatMessageDivision('${safeMsgIdAttr}', '${d.id}')"
                      ${d.id === activeChatDivision ? 'disabled' : ''}
                      class="px-1.5 py-0.5 rounded font-bold transition ${d.id === activeChatDivision ? 'bg-slate-200 text-slate-500 cursor-default' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer'}">
                ${escapeChatHtml(d.numero)}: ${escapeChatHtml(d.shortLabel)}
              </button>
            `).join('')}
          </div>
        ` : ''}

        <!-- Etiquetas clicables -->
        ${(pObj || (m.mentions && m.mentions.length) || (m.estimaciones && m.estimaciones.length) || (m.reportes && m.reportes.length)) ? `
          <div class="flex flex-wrap items-center gap-1">
            ${pObj ? `
              <button type="button" onclick="jumpToProjectChatTag('partida', '${escapeChatAttr(pObj.id)}')"
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 cursor-pointer">
                /${escapeChatHtml(pObj.clave)} ${escapeChatHtml(pObj.descripcion.slice(0, 26))}
              </button>
            ` : ''}
            ${(m.mentions || []).map(u => `
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                ${escapeChatHtml(u)}
              </span>
            `).join('')}
            ${(m.estimaciones || []).map(est => `
              <button type="button" onclick="jumpToProjectChatTag('estimacion', '${escapeChatAttr(est)}')"
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 cursor-pointer">
                ${escapeChatHtml(est)} ↗
              </button>
            `).join('')}
            ${(m.reportes || []).map(rep => `
              <button type="button" onclick="jumpToProjectChatTag('reporte', '${escapeChatAttr(rep)}')"
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-200 cursor-pointer">
                ${escapeChatHtml(rep)} ↗
              </button>
            `).join('')}
          </div>
        ` : ''}

        <p class="text-xs text-slate-800 leading-relaxed break-words whitespace-pre-line">${escapeChatHtml(m.text)}</p>
      </div>
    `;
  }).join('');

  return `${crossDivBanner}${cardsHtml}`;
}

function updateChatMessagesListDOM() {
  const listEl = document.getElementById('project-chat-messages-list');
  if (!listEl) return;

  const partidas = getAllCatalogConceptTags();
  const allMessages = loadProjectChatMessages();
  const activeDivMeta = getChatDivisionMeta(activeChatDivision);
  const filteredMessages = filterMessagesForCriteria(allMessages, {
    divisionId: activeChatDivision,
    partidaId: activePartidaFilterId,
    filterType: activeChatFilter,
    searchQuery: activeChatSearch,
    partidas
  });

  listEl.innerHTML = buildChatMessagesListHtml(filteredMessages, partidas, activeDivMeta);

  const countBadge = document.getElementById('project-chat-active-count');
  if (countBadge) countBadge.textContent = String(filteredMessages.length);

  const clearBtn = document.getElementById('project-chat-search-clear');
  if (clearBtn) {
    if (String(activeChatSearch || '').trim()) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  }
}

// Renderizar el contenedor acoplado abajo a la derecha dentro de #workspace-container y el botón en la barra vertical izquierda
export function renderProjectChatDock() {
  if (isRefreshingFromChat) return;

  // Consumir apertura pendiente si el usuario hizo clic en una notificación desde "Mis Proyectos de Obra"
  let pendingScrollMsgId = null;
  try {
    const rawPending = localStorage.getItem('adm_const_pending_chat_open');
    if (rawPending) {
      const pending = JSON.parse(rawPending);
      const activePid = getActiveProjectId() || 'proj-default-01';
      if (pending && (!pending.projectId || pending.projectId === activePid)) {
        localStorage.removeItem('adm_const_pending_chat_open');
        isChatDockExpanded = true;
        activeChatFilter = 'all';
        activeChatSearch = '';
        activePartidaFilterId = null;
        if (pending.division && CHAT_DIVISIONS.some(d => d.id === pending.division)) {
          activeChatDivision = pending.division;
        }
        if (pending.partidaId) {
          pendingComposerTags.partidaId = String(pending.partidaId);
        }
        if (pending.msgId) {
          highlightedMessageId = pending.msgId;
          pendingScrollMsgId = pending.msgId;
        }
      }
    }
  } catch (e) {}

  renderSidebarNotificationsUI();

  const workspaceEl = document.getElementById('workspace-container');
  if (!workspaceEl) return;

  let dockEl = document.getElementById('project-chat-dock');
  if (!dockEl) {
    dockEl = document.createElement('div');
    dockEl.id = 'project-chat-dock';
    workspaceEl.appendChild(dockEl);
  }

  // Preservar el texto que el usuario estaba escribiendo si se re-renderiza
  const prevInputEl = document.getElementById('project-chat-input');
  const draftText = prevInputEl ? prevInputEl.value : '';

  const projectName = state.settings?.projectName || 'Proyecto de Obra';
  const users = getAssignedProjectUsers();
  const partidas = getAllCatalogConceptTags();
  const estimaciones = getProjectEstimacionesTags();
  const reportes = getProjectReportesTags();
  if (isChatDockExpanded === true) {
    markActiveProjectChatMessagesAsRead();
  }
  const allMessages = loadProjectChatMessages();
  const currentUser = getCurrentUser() || getLastKnownUser();
  const myEmail = (currentUser?.email || '').toLowerCase().trim();
  const activePidForRead = getActiveProjectId() || 'proj-default-01';
  const readSet = new Set(getReadMentionIds());
  const unreadMessages = allMessages.filter(m => !isChatMessageReadForCurrentUser(m, activePidForRead, myEmail, readSet));
  const unreadCount = isChatDockExpanded ? 0 : unreadMessages.length;

  // Actualizar el botón del Chat/Bitácora en la barra vertical izquierda
  const sidebarChatBtn = document.getElementById('btn-sidebar-project-chat');
  const sidebarChatIcon = document.getElementById('sidebar-chat-icon');
  const sidebarChatBadge = document.getElementById('sidebar-chat-badge');

  if (sidebarChatBtn) {
    sidebarChatBtn.title = `${isChatDockExpanded ? 'Cerrar' : 'Abrir'} Bitácora de Obra / Chat: ${projectName} (${allMessages.length} asientos)`;
    sidebarChatBtn.className = isChatDockExpanded
      ? 'w-11 h-11 rounded-xl flex items-center justify-center bg-blue-600/25 text-blue-300 border border-blue-500/60 shadow-md transition active:scale-95 cursor-pointer relative group'
      : 'w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition active:scale-95 cursor-pointer relative group';
  }
  if (sidebarChatIcon) {
    sidebarChatIcon.className = isChatDockExpanded
      ? 'fa-solid fa-comments text-lg text-amber-300 transition'
      : 'fa-solid fa-comments text-lg group-hover:text-blue-400 transition';
  }
  if (sidebarChatBadge) {
    if (isChatDockExpanded === true || unreadCount === 0) {
      sidebarChatBadge.classList.add('hidden');
      sidebarChatBadge.textContent = '0';
    } else if (unreadCount > 0) {
      sidebarChatBadge.classList.remove('hidden');
      sidebarChatBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    }
  }

  if (!isChatDockExpanded) {
    dockEl.className = 'hidden';
    dockEl.innerHTML = '';
    return;
  }

  dockEl.style.zIndex = '9990';
  dockEl.className = isChatMaximized
    ? 'no-print fixed bottom-0 right-5 z-50 w-[900px] max-w-[calc(100vw-1.5rem)] shadow-2xl rounded-t-2xl border border-b-0 border-slate-300 bg-white overflow-hidden transition-all duration-200 font-sans'
    : 'no-print fixed bottom-0 right-5 z-50 w-[470px] sm:w-[515px] max-w-[calc(100vw-1.5rem)] shadow-2xl rounded-t-xl border border-b-0 border-slate-300 bg-white overflow-hidden transition-all duration-200 font-sans';

  if (!selectedAuthorHandle || !users.some(u => u.handle === selectedAuthorHandle)) {
    const matched = users.find(u => currentUser && u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) || users[0];
    selectedAuthorHandle = matched ? matched.handle : '@Admin';
  }

  // Contadores por cada una de las 3 divisiones
  const divisionCounts = {
    alcance_presupuesto: 0,
    seguimiento_calendario: 0,
    estimaciones: 0
  };
  allMessages.forEach(m => {
    const divId = getMessageDivision(m);
    divisionCounts[divId] = (divisionCounts[divId] || 0) + 1;
  });

  const activeDivMeta = getChatDivisionMeta(activeChatDivision);
  const filteredMessages = filterMessagesForCriteria(allMessages, {
    divisionId: activeChatDivision,
    partidaId: activePartidaFilterId,
    filterType: activeChatFilter,
    searchQuery: activeChatSearch,
    partidas
  });

  const activePartidaObj = activePartidaFilterId
    ? partidas.find(p => String(p.id) === String(activePartidaFilterId))
    : null;

  const miniAvatarsHtml = users.slice(0, 4).map(u => `
    <span class="w-5 h-5 rounded-full bg-blue-800 text-white text-[9px] font-bold inline-flex items-center justify-center border border-blue-400 shrink-0"
          title="${escapeChatAttr(u.name)} (${escapeChatAttr(u.handle)} - ${escapeChatAttr(u.roleLabel)})">
      ${escapeChatHtml(u.initials)}
    </span>
  `).join('');

  // Menú flotante para insertar etiquetas (@Usuario, /Concepto, #Estimación, !Reporte)
  let tagPickerHtml = '';
  if (activeTagPickerKind === 'user') {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll">
        ${users.map(u => `
          <button type="button" onclick="addProjectChatPendingTag('user', '${u.handle.replace(/'/g, "\\'")}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer">
            ${escapeChatHtml(u.handle)} <span class="text-[9.5px] opacity-75">(${escapeChatHtml(u.roleLabel)})</span>
          </button>
        `).join('')}
      </div>
    `;
  } else if (activeTagPickerKind === 'partida') {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll">
        ${partidas.length > 0 ? partidas.map(p => `
          <button type="button" onclick="addProjectChatPendingTag('partida', '${escapeChatAttr(p.id)}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer truncate max-w-full"
                  title="Nivel ${p.level}: /${escapeChatAttr(p.clave)} ${escapeChatAttr(p.descripcion)}">
            /${escapeChatHtml(p.clave)} ${escapeChatHtml(p.descripcion)}
          </button>
        `).join('') : `<span class="text-[11px] text-slate-400">Sin conceptos en el catálogo</span>`}
      </div>
    `;
  } else if (activeTagPickerKind === 'estimacion') {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll">
        ${estimaciones.map(e => `
          <button type="button" onclick="addProjectChatPendingTag('estimacion', '${escapeChatAttr(e.label)}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer">
            ${escapeChatHtml(e.label)} ${e.locked ? '🔒' : ''}
          </button>
        `).join('')}
      </div>
    `;
  } else if (activeTagPickerKind === 'reporte') {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1">
        ${reportes.map(r => {
          const isRelevant = r.division === activeChatDivision;
          return `
            <button type="button" onclick="addProjectChatPendingTag('reporte', '${escapeChatAttr(r.label)}')"
                    class="px-2 py-0.5 rounded text-[11px] font-semibold ${isRelevant ? 'bg-purple-100 text-purple-800 border-purple-400 ring-1 ring-purple-300' : 'bg-purple-50 text-purple-700 border-purple-200'} border hover:bg-purple-100 cursor-pointer">
              ${escapeChatHtml(r.label)}
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  // Chips de etiquetas listas para enviarse
  const activeTagChips = [];
  if (pendingComposerTags.partidaId) {
    const p = partidas.find(x => String(x.id) === String(pendingComposerTags.partidaId));
    if (p) {
      activeTagChips.push(`
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          /${escapeChatHtml(p.clave)} ${escapeChatHtml(p.descripcion.slice(0, 22))}
          <button type="button" onclick="removeProjectChatPendingTag('partida', '${escapeChatAttr(p.id)}')" class="hover:text-amber-950 cursor-pointer">✕</button>
        </span>
      `);
    }
  }
  pendingComposerTags.mentions.forEach(m => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
        ${escapeChatHtml(m)}
        <button type="button" onclick="removeProjectChatPendingTag('user', '${m.replace(/'/g, "\\'")}')" class="hover:text-blue-950 cursor-pointer">✕</button>
      </span>
    `);
  });
  pendingComposerTags.estimaciones.forEach(e => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
        ${escapeChatHtml(e)}
        <button type="button" onclick="removeProjectChatPendingTag('estimacion', '${escapeChatAttr(e)}')" class="hover:text-emerald-950 cursor-pointer">✕</button>
      </span>
    `);
  });
  pendingComposerTags.reportes.forEach(r => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
        ${escapeChatHtml(r)}
        <button type="button" onclick="removeProjectChatPendingTag('reporte', '${escapeChatAttr(r)}')" class="hover:text-purple-950 cursor-pointer">✕</button>
      </span>
    `);
  });

  // Pestañas de las 3 Divisiones de la Bitácora
  const divisionTabsHtml = CHAT_DIVISIONS.map(div => {
    const isActive = div.id === activeChatDivision;
    const count = divisionCounts[div.id] || 0;
    const activeStyles = {
      alcance_presupuesto: 'bg-white text-indigo-700 border-b-2 border-indigo-600 shadow-2xs',
      seguimiento_calendario: 'bg-white text-amber-700 border-b-2 border-amber-500 shadow-2xs',
      estimaciones: 'bg-white text-emerald-700 border-b-2 border-emerald-600 shadow-2xs'
    };
    const badgeStyles = {
      alcance_presupuesto: isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700',
      seguimiento_calendario: isActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 text-slate-700',
      estimaciones: isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
    };

    return `
      <button type="button"
              id="btn-chat-division-${div.id}"
              onclick="setProjectChatDivision('${div.id}')"
              title="${escapeChatAttr(div.title)}: ${escapeChatAttr(div.subtitle)}"
              class="px-2 py-2 text-left transition cursor-pointer flex flex-col justify-between gap-0.5 border-r border-slate-200 last:border-r-0 ${isActive ? activeStyles[div.id] : 'bg-slate-100 hover:bg-slate-50 text-slate-600 border-b border-slate-200'}">
        <div class="flex items-center justify-between gap-1 w-full">
          <span class="text-[9px] font-extrabold uppercase tracking-wider opacity-80 flex items-center gap-1 truncate">
            <i class="fa-solid ${div.icon} text-[9px]"></i>
            ${escapeChatHtml(div.numero)}
          </span>
          <span class="px-1.5 py-0.2 rounded-full font-mono text-[9.5px] font-extrabold leading-tight shrink-0 ${badgeStyles[div.id]}">
            ${count}
          </span>
        </div>
        <div class="text-[10px] font-extrabold leading-tight tracking-tight truncate w-full">
          ${escapeChatHtml(div.shortLabel)}
        </div>
      </button>
    `;
  }).join('');

  const placeholderByDiv = {
    alcance_presupuesto: 'Asentar nota en Alcance y Presupuesto... (Enter registra, Shift+Enter salto)',
    seguimiento_calendario: 'Asentar nota en Seguimiento y Calendario... (Enter registra, Shift+Enter salto)',
    estimaciones: 'Asentar nota en Estimaciones... (Enter registra, Shift+Enter salto)'
  };

  dockEl.innerHTML = `
    <!-- BARRA SUPERIOR DE LA BITÁCORA DE OBRA -->
    <div onclick="toggleProjectChatDock(false)"
         class="px-3 py-2 bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 hover:from-slate-800 hover:to-blue-700 text-white flex items-center justify-between gap-2 cursor-pointer select-none transition">
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 inline-flex items-center justify-center shadow-xs shrink-0">
          <i class="fa-solid fa-book-open text-xs"></i>
        </span>
        <span class="text-xs font-bold truncate" title="Bitácora de Obra: ${escapeChatAttr(projectName)}">
          Bitácora de Obra • ${escapeChatHtml(projectName)}
        </span>
        ${unreadCount > 0 ? `
        <span id="project-chat-active-count"
              class="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 leading-none shrink-0"
              title="Mensajes no leídos">
          ${unreadCount}
        </span>` : ''}
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <div class="hidden sm:flex items-center -space-x-1 mr-1">${miniAvatarsHtml}</div>
        <button type="button"
                id="btn-project-chat-seed"
                onclick="event.stopPropagation(); resetDefaultProjectChatWithFeedback();"
                title="Regenerar asientos de ejemplo en las 3 divisiones"
                class="w-6 h-6 rounded bg-white/15 hover:bg-white/25 text-amber-300 inline-flex items-center justify-center cursor-pointer transition">
          <i class="fa-solid fa-arrows-rotate text-[11px]"></i>
        </button>
        <button type="button"
                id="btn-project-chat-print"
                onclick="event.stopPropagation(); openProjectChatPrintModal(event);"
                title="Imprimir Formato de Bitácora de Obra"
                class="px-2 h-6 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10.5px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition shadow-xs">
          <i class="fa-solid fa-print text-[10px]"></i>
          <span class="hidden sm:inline">Formato</span>
        </button>
        <button type="button"
                id="btn-project-chat-maximize"
                onclick="event.stopPropagation(); toggleProjectChatMaximize(event);"
                title="${isChatMaximized ? 'Restaurar tamaño de bitácora' : 'Maximizar ventana de bitácora'}"
                class="w-6 h-6 rounded bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center cursor-pointer transition">
          <i class="fa-solid ${isChatMaximized ? 'fa-compress' : 'fa-expand'} text-[11px]"></i>
        </button>
        <button type="button"
                id="btn-project-chat-minimize"
                onclick="event.stopPropagation(); toggleProjectChatDock(false);"
                title="Plegar bitácora"
                class="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition">
          <span>Plegar</span>
          <i class="fa-solid fa-chevron-down text-[9px]"></i>
        </button>
      </div>
    </div>

    <!-- BARRA DE PESTAÑAS DE LAS 3 DIVISIONES -->
    <div class="grid grid-cols-3 bg-slate-100 border-b border-slate-200 select-none">
      ${divisionTabsHtml}
    </div>

    <!-- CUERPO DESPLEGABLE DE LA BITÁCORA -->
    <div id="project-chat-body" class="flex flex-col bg-white">

      <!-- Sub-encabezado: Descripción de División + Autor + Búsqueda + Filtros rápidos -->
      <div class="p-2.5 bg-slate-50 border-b border-slate-200 space-y-2">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span class="text-[10px] text-slate-500 font-semibold truncate flex items-center gap-1" title="${escapeChatAttr(activeDivMeta.subtitle)}">
            <i class="fa-solid ${activeDivMeta.icon} text-blue-600 text-[10px]"></i>
            <span class="truncate">${escapeChatHtml(activeDivMeta.subtitle)}</span>
          </span>
          <div class="flex items-center gap-1 bg-white border border-slate-300 rounded px-1.5 py-0.5 shrink-0">
            <span class="text-[10px] text-slate-500">Asienta:</span>
            <select onchange="onProjectChatAuthorChange(this.value)"
                    class="bg-transparent text-[11px] font-bold text-slate-800 outline-none cursor-pointer max-w-[140px]">
              ${users.map(u => `
                <option value="${escapeChatAttr(u.handle)}" ${u.handle === selectedAuthorHandle ? 'selected' : ''}>${escapeChatHtml(u.handle)}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Búsqueda + Filtros rápidos -->
        <div class="flex flex-wrap items-center gap-1">
          <div class="relative flex-1 min-w-[135px]">
            <i class="fa-solid fa-magnifying-glass text-[10px] text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"></i>
            <input id="project-chat-search"
                   type="text"
                   value="${escapeChatAttr(activeChatSearch)}"
                   oninput="onProjectChatSearchInput(this.value)"
                   placeholder="Buscar folio (BIT), texto..."
                   class="w-full bg-white border border-slate-300 rounded pl-6 pr-6 py-0.5 text-[10.5px] text-slate-800 focus:outline-none focus:border-blue-500">
            <button id="project-chat-search-clear"
                    type="button"
                    onclick="clearProjectChatSearch()"
                    class="${String(activeChatSearch || '').trim() ? '' : 'hidden'} absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[10px] cursor-pointer">
              ✕
            </button>
          </div>

          <button type="button" onclick="setProjectChatFilter('all')"
                  class="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${activeChatFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            Todas
          </button>
          <button type="button" onclick="setProjectChatFilter('mentions')"
                  class="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${activeChatFilter === 'mentions' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            @ Menciones
          </button>
          <button type="button" onclick="setProjectChatFilter('orden')"
                  class="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${activeChatFilter === 'orden' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            Órdenes
          </button>
          <button type="button" onclick="setProjectChatFilter('acuerdo')"
                  class="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${activeChatFilter === 'acuerdo' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            Acuerdos
          </button>
          <button type="button" onclick="setProjectChatFilter('incidencia')"
                  class="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${activeChatFilter === 'incidencia' ? 'bg-rose-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            Incidencias
          </button>
          ${activePartidaObj ? `
            <button type="button" onclick="clearProjectChatPartidaFilter()"
                    title="Quitar filtro de concepto"
                    class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white hover:bg-amber-600 cursor-pointer transition truncate max-w-[160px]">
              /${escapeChatHtml(activePartidaObj.clave)} ${escapeChatHtml(activePartidaObj.descripcion)} ✕
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Lista de Asientos de Bitácora -->
      <div id="project-chat-messages-list" class="p-2.5 space-y-2 ${isChatMaximized ? 'h-[54vh]' : 'h-[245px]'} overflow-y-auto custom-scroll bg-white">
        ${buildChatMessagesListHtml(filteredMessages, partidas, activeDivMeta)}
      </div>

      <!-- Barra inferior para clasificar tipo de nota, etiquetar y asentar en bitácora -->
      <div class="p-2.5 bg-slate-50 border-t border-slate-200 space-y-1.5">
        <div class="flex flex-wrap items-center gap-1">
          <select id="project-chat-entry-type"
                  onchange="onProjectChatEntryTypeChange(this.value)"
                  title="Tipo de asiento en Bitácora"
                  class="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[10.5px] font-bold text-slate-800 outline-none cursor-pointer">
            ${BITACORA_ENTRY_TYPES.map(t => `
              <option value="${t.id}" ${t.id === pendingComposerEntryType ? 'selected' : ''}>📋 ${escapeChatHtml(t.label)}</option>
            `).join('')}
          </select>

          <button type="button" onclick="toggleProjectChatTagPicker('user')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer">
            @ Usuario
          </button>
          <button type="button" onclick="toggleProjectChatTagPicker('partida')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer">
            / Concepto
          </button>
          <button type="button" onclick="toggleProjectChatTagPicker('estimacion')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer">
            # Estimación
          </button>
          <button type="button" onclick="toggleProjectChatTagPicker('reporte')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 cursor-pointer">
            ! Reporte
          </button>
        </div>

        ${tagPickerHtml}

        ${activeTagChips.length > 0 ? `
          <div class="flex flex-wrap items-center gap-1 pt-0.5">
            ${activeTagChips.join('')}
          </div>
        ` : ''}

        <div class="flex items-end gap-1.5">
          <textarea id="project-chat-input"
                    rows="2"
                    placeholder="${escapeChatAttr(placeholderByDiv[activeChatDivision] || 'Escribe un asiento de bitácora...')}"
                    onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); sendProjectChatMessage(); }"
                    class="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-none leading-snug">${escapeChatHtml(draftText)}</textarea>
          <button type="button"
                  onclick="sendProjectChatMessage()"
                  class="px-3 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer transition shrink-0 shadow-xs flex items-center gap-1.5">
            <i class="fa-solid fa-paper-plane text-[10px]"></i>
            <span>Enviar</span>
          </button>
        </div>
      </div>

    </div>
  `;

  if (pendingScrollMsgId) {
    setTimeout(() => {
      const msgEl = document.getElementById(`chat-msg-item-${pendingScrollMsgId}`);
      if (msgEl && typeof msgEl.scrollIntoView === 'function') {
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
  }
}

// Cerrar el popover de notificaciones cuando se hace clic fuera de las campanas + Escape para modal de impresión
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', (e) => {
    if (!isNotificationsPopoverOpen) return;
    const sidebarWrap = document.getElementById('sidebar-notifications-wrapper');
    const portalWrap = document.getElementById('portal-notifications-wrapper');
    const clickedInsideSidebar = Boolean(sidebarWrap && typeof sidebarWrap.contains === 'function' && sidebarWrap.contains(e.target));
    const clickedInsidePortal = Boolean(portalWrap && typeof portalWrap.contains === 'function' && portalWrap.contains(e.target));
    if (!clickedInsideSidebar && !clickedInsidePortal) {
      closeMentionNotificationsPopover();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPrintModalOpen) {
      closeProjectChatPrintModal();
    }
  });
}

// Limpiar historial de chat y menciones en almacenamiento local
export function clearAllChatHistory() {
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('control_obra_chat_') || k.startsWith('control_obra_read_mentions_') || k.startsWith('adm_arq_project_chat_') || k.startsWith('adm_const_project_chat_'))) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  window.seedDefaultProjectChat = (pid, force = false) => {
    if (force) {
      resetDefaultProjectChatWithFeedback(pid);
    } else {
      return loadProjectChatMessages(pid);
    }
  };
  window.resetDefaultProjectChatWithFeedback = resetDefaultProjectChatWithFeedback;
  window.generateSeedProjectChatMessages = generateSeedProjectChatMessages;
  window.hydrateNotificationStateFromCloud = hydrateNotificationStateFromCloud;
  window.syncNotificationStateToCloud = syncNotificationStateToCloud;
  setTimeout(() => { try { hydrateNotificationStateFromCloud(); } catch (_) {} }, 800);
  window.addEventListener('cubikar:cloud-modules-hydrated', () => {
    try { hydrateNotificationStateFromCloud(); } catch (_) {}
  });
}
