// js/ui/firmasController.js
// Controlador de Firmas y Responsables para el Formato de Impresión (Alcances y Presupuesto)

import { state, persistSettings } from '../state/store.js?v=20261116_cf21';
import { showToast } from './notifications.js?v=20261116_cf21';
import { getProjectById, getCurrentUser, getProjectMembers, canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261116_cf21';
import { getActiveProjectId } from '../config/constants.js?v=20261116_cf21';
import { guardTabUnlocked } from './tabLockController.js?v=20261116_cf21';

export const DEFAULT_FIRMAS_CONFIG = [
  {
    id: 'firma-1',
    rol: 'ELABORÓ',
    nombre: '',
    cargo: 'Coordinador de Proyecto Ejecutivo',
    cedula: '',
    activo: true
  },
  {
    id: 'firma-2',
    rol: 'REVISÓ',
    nombre: '',
    cargo: 'Coordinación de Costos e Ingenierías',
    cedula: '',
    activo: true
  },
  {
    id: 'firma-3',
    rol: 'AUTORIZÓ / CLIENTE',
    nombre: '',
    cargo: 'Dirección de Obra y Supervisión',
    cedula: '',
    activo: true
  }
];

export const PRESET_ROLES = [
  'ELABORÓ',
  'PROYECTÓ',
  'REVISÓ',
  'COORDINÓ',
  'CALCULÓ Y ESTRUCTURÓ',
  'INGENIERÍAS Y ESPECIALIDADES',
  'SUPERVISÓ',
  'DIRECTOR RESPONSABLE DE OBRA (DRO)',
  'AUTORIZÓ',
  'CLIENTE / PROPIETARIO'
];

// Copia de trabajo temporal mientras el modal está abierto
let temporaryFirmas = [];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Obtiene la lista de firmas configurada para el proyecto actual o las predeterminadas
 */
export function getFirmasConfig() {
  if (state.settings && Array.isArray(state.settings.firmas) && state.settings.firmas.length > 0) {
    return state.settings.firmas.map(f => ({ ...f }));
  }
  return DEFAULT_FIRMAS_CONFIG.map(f => ({ ...f }));
}

/**
 * Genera el bloque HTML de firmas para el formato de impresión
 */
export function getFirmasPrintHtml() {
  const firmas = getFirmasConfig();
  const activeFirmas = firmas.filter(f => f.activo !== false);

  if (activeFirmas.length === 0) {
    return '';
  }

  const count = activeFirmas.length;
  const cols = Math.min(count, 4);
  const maxWidthStyle = count <= 2
    ? 'max-width: 580px; margin-left: auto; margin-right: auto;'
    : '';

  const boxesHtml = activeFirmas.map(f => {
    const rol = escapeHtml(f.rol || 'RESPONSABLE');
    const nombre = escapeHtml(f.nombre || '');
    const cargo = escapeHtml(f.cargo || '');
    const cedula = escapeHtml(f.cedula || '');

    return `
      <div class="signature-box" style="text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 8pt; color: #475569;">
        <strong style="display: block; color: #0f172a; font-size: 8.5pt; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.02em;">${rol}</strong>
        ${nombre ? `<div style="font-weight: 700; color: #0f172a; font-size: 8.5pt; line-height: 1.25; margin-top: 2px;">${nombre}</div>` : ''}
        ${cargo ? `<div style="font-size: 7.5pt; color: #475569; line-height: 1.25; margin-top: 1px;">${cargo}</div>` : ''}
        ${cedula ? `<div style="font-size: 7pt; color: #64748b; font-family: monospace; line-height: 1.2; margin-top: 1px;">${cedula}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <!-- Área de Firmas Institucionales y Responsables del Proyecto -->
    <div class="signatures-grid" style="grid-template-columns: repeat(${cols}, 1fr); ${maxWidthStyle}">
      ${boxesHtml}
    </div>
  `;
}

/**
 * Obtiene la lista de personas sugeridas para autocompletar (colaboradores del proyecto y usuario actual)
 */
export function getSuggestedPeople() {
  const people = [];
  const addedEmails = new Set();

  try {
    const pId = getActiveProjectId();
    const proj = pId ? getProjectById(pId) : null;
    const members = (proj && Array.isArray(proj.members)) ? proj.members : (pId ? getProjectMembers(pId) : []);

    if (Array.isArray(members)) {
      members.forEach(m => {
        if (m && m.name) {
          people.push({
            name: m.name,
            role: m.roleLabel || m.role || 'Colaborador',
            email: m.email || ''
          });
          if (m.email) addedEmails.add(m.email.toLowerCase());
        }
      });
    }
  } catch (_) {}

  try {
    const user = getCurrentUser();
    if (user && user.name && (!user.email || !addedEmails.has(user.email.toLowerCase()))) {
      people.unshift({
        name: user.name,
        role: 'Director del Proyecto',
        email: user.email || ''
      });
    }
  } catch (_) {}

  return people;
}

/**
 * Abrir ventana modal de Firmas y Responsables
 */
export function openFirmasResponsablesModal() {
  temporaryFirmas = getFirmasConfig();
  renderFirmasModalCards();
  renderTeamQuickSelectors();
  renderFirmasLivePreview();

  const modal = document.getElementById('modal-firmas-responsables');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

/**
 * Cerrar ventana modal de Firmas y Responsables
 */
export function closeFirmasResponsablesModal() {
  const modal = document.getElementById('modal-firmas-responsables');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

/**
 * Renderiza los botones rápidos del equipo para autocompletar
 */
function renderTeamQuickSelectors() {
  const container = document.getElementById('firmas-team-quick-selector-container');
  if (!container) return;

  const people = getSuggestedPeople();
  if (people.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="flex items-center gap-1.5 flex-wrap">
      <span class="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
        <i class="fa-solid fa-users text-indigo-600 text-[10px]"></i> Equipo:
      </span>
      <div class="flex items-center gap-1 flex-wrap">
        ${people.slice(0, 4).map(p => `
          <button type="button" 
                  data-person-name="${escapeHtml(p.name)}"
                  data-person-role="${escapeHtml(p.role)}"
                  onclick="quickAssignPersonToFirstEmptySlot(this.dataset.personName || '', this.dataset.personRole || '')"
                  class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10.5px] font-semibold px-2 py-0.5 rounded-full transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Asignar a la primera firma vacía: ${escapeHtml(p.name)} (${escapeHtml(p.role)})">
            <i class="fa-solid fa-user-plus text-[9px]"></i>
            <span class="max-w-[130px] truncate">${escapeHtml(p.name)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Asigna una persona a la primera firma que tenga el nombre vacío o a la primera firma
 */
export function quickAssignPersonToFirstEmptySlot(name, role = '') {
  if (!guardFirmasEdit()) return;
  let targetIndex = temporaryFirmas.findIndex(f => !f.nombre || f.nombre.trim() === '');
  if (targetIndex === -1) {
    targetIndex = 0;
  }
  if (temporaryFirmas[targetIndex]) {
    temporaryFirmas[targetIndex].nombre = name;
    if (role && (!temporaryFirmas[targetIndex].cargo || temporaryFirmas[targetIndex].cargo === 'Coordinador de Proyecto Ejecutivo')) {
      temporaryFirmas[targetIndex].cargo = role;
    }
    renderFirmasModalCards();
    renderFirmasLivePreview();
    showToast(`✓ Asignado "${name}" en Firma ${targetIndex + 1}`, 'info');
  }
}

/**
 * Renderiza las tarjetas de configuración de firmas
 */
export function renderFirmasModalCards() {
  const container = document.getElementById('firmas-cards-container');
  if (!container) return;

  const people = getSuggestedPeople();

  if (temporaryFirmas.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
        <i class="fa-solid fa-file-circle-xmark text-2xl mb-2 text-slate-300"></i>
        <p class="text-xs">No hay firmas configuradas.</p>
        <button type="button" onclick="addFirmaSlotAction()" class="mt-2 text-xs text-blue-600 font-bold hover:underline cursor-pointer">
          + Agregar una firma ahora
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = temporaryFirmas.map((f, idx) => {
    const isActivo = f.activo !== false;
    const firmaNum = idx + 1;

    return `
      <div class="bg-white border ${isActivo ? 'border-slate-200 shadow-2xs' : 'border-slate-200/60 opacity-60 bg-slate-50'} rounded-xl p-3.5 transition duration-150">
        <!-- Encabezado de la Tarjeta -->
        <div class="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-lg ${isActivo ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-600'} flex items-center justify-center text-xs font-bold font-mono">
              ${firmaNum}
            </span>
            <span class="text-xs font-bold text-slate-800">
              Firma ${firmaNum}
            </span>
            ${f.rol ? `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${isActivo ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-200 text-slate-600'}">${escapeHtml(f.rol)}</span>` : ''}
          </div>

          <div class="flex items-center gap-3">
            <!-- Toggle Activo en Impresión -->
            <label class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input type="checkbox" 
                     ${isActivo ? 'checked' : ''} 
                     onchange="toggleFirmaSlotAction(${idx}, this.checked)"
                     class="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer">
              <span>Incluir en impresión</span>
            </label>

            <!-- Botón Eliminar Firma -->
            ${temporaryFirmas.length > 1 ? `
              <button type="button" 
                      onclick="removeFirmaSlotAction(${idx})" 
                      class="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer text-xs" 
                      title="Eliminar esta firma">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Campos de la Firma -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <!-- Campo 1: Rol / Título -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Título / Rol <span class="text-rose-500">*</span>
            </label>
            <div class="relative">
              <input type="text" 
                     value="${escapeHtml(f.rol || '')}"
                     placeholder="ej. ELABORÓ"
                     list="firmas-roles-datalist"
                     oninput="updateFirmaSlotField(${idx}, 'rol', this.value)"
                     class="w-full bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none uppercase transition font-mono">
            </div>
          </div>

          <!-- Campo 2: Nombre Completo -->
          <div class="sm:col-span-1 lg:col-span-1">
            <div class="flex items-center justify-between mb-1">
              <label class="text-[10px] font-bold text-slate-500 uppercase">
                Nombre del Responsable
              </label>
              ${people.length > 0 ? `
                <div class="relative inline-block">
                  <select onchange="if(this.value){ updateFirmaSlotField(${idx}, 'nombre', this.value); this.value=''; }"
                          class="text-[9.5px] font-semibold text-blue-600 bg-transparent border-0 outline-none cursor-pointer hover:underline pr-1">
                    <option value="">+ Miembro...</option>
                    ${people.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('')}
                  </select>
                </div>
              ` : ''}
            </div>
            <input type="text" 
                   value="${escapeHtml(f.nombre || '')}"
                   placeholder="ej. Arq. Roberto Méndez S."
                   oninput="updateFirmaSlotField(${idx}, 'nombre', this.value)"
                   class="w-full bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none transition">
          </div>

          <!-- Campo 3: Cargo o Especialidad -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Cargo / Puesto / Despacho
            </label>
            <input type="text" 
                   value="${escapeHtml(f.cargo || '')}"
                   placeholder="ej. Coordinador de Proyecto"
                   oninput="updateFirmaSlotField(${idx}, 'cargo', this.value)"
                   class="w-full bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none transition">
          </div>

          <!-- Campo 4: Cédula o Registro -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Cédula / Matrícula (Opcional)
            </label>
            <input type="text" 
                   value="${escapeHtml(f.cedula || '')}"
                   placeholder="ej. Céd. Prof. 1234567"
                   oninput="updateFirmaSlotField(${idx}, 'cedula', this.value)"
                   class="w-full bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-mono outline-none transition">
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Agrega un nuevo slot de firma
 */
export function addFirmaSlotAction() {
  if (!guardFirmasEdit()) return;
  const nextNum = temporaryFirmas.length + 1;
  const suggestedRol = PRESET_ROLES[Math.min(nextNum - 1, PRESET_ROLES.length - 1)] || 'REVISÓ';

  temporaryFirmas.push({
    id: 'firma-' + Date.now(),
    rol: suggestedRol,
    nombre: '',
    cargo: '',
    cedula: '',
    activo: true
  });

  renderFirmasModalCards();
  renderFirmasLivePreview();
}

function guardFirmasEdit() {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo lectura: tu rol no permite editar las firmas de este proyecto.', 'warning');
    return false;
  }
  const viewPres = document.getElementById('view-presupuesto') || document.getElementById('view-insumos');
  if (viewPres && !viewPres.classList.contains('hidden')) {
    return guardTabUnlocked('presupuesto');
  }
  return guardTabUnlocked('alcances');
}

/**
 * Elimina una firma por índice
 */
export function removeFirmaSlotAction(index) {
  if (!guardFirmasEdit()) return;
  if (temporaryFirmas.length <= 1) {
    showToast('Debe haber al menos 1 firma en el documento.', 'warning');
    return;
  }
  temporaryFirmas.splice(index, 1);
  renderFirmasModalCards();
  renderFirmasLivePreview();
}

/**
 * Alterna el estado activo de una firma
 */
export function toggleFirmaSlotAction(index, isChecked) {
  if (!guardFirmasEdit()) {
    renderFirmasModalCards();
    return;
  }
  if (temporaryFirmas[index]) {
    temporaryFirmas[index].activo = Boolean(isChecked);
    renderFirmasModalCards();
    renderFirmasLivePreview();
  }
}

/**
 * Actualiza un campo individual de una firma
 */
export function updateFirmaSlotField(index, field, value) {
  if (!guardFirmasEdit()) {
    renderFirmasModalCards();
    return;
  }
  if (temporaryFirmas[index]) {
    temporaryFirmas[index][field] = value;
    renderFirmasLivePreview();
  }
}

/**
 * Restablece las firmas a los valores sugeridos por defecto
 */
export function resetFirmasToDefaultAction() {
  if (!guardFirmasEdit()) return;
  if (!confirm('¿Restablecer los bloques de firmas a los 3 cargos institucionales estándar?')) return;
  temporaryFirmas = DEFAULT_FIRMAS_CONFIG.map(f => ({ ...f }));
  renderFirmasModalCards();
  renderFirmasLivePreview();
  showToast('Firmas restablecidas a valores sugeridos', 'info');
}

/**
 * Renderiza la vista previa en vivo del pie de impresión
 */
export function renderFirmasLivePreview() {
  const previewEl = document.getElementById('firmas-live-preview');
  if (!previewEl) return;

  const activeFirmas = temporaryFirmas.filter(f => f.activo !== false);

  if (activeFirmas.length === 0) {
    previewEl.innerHTML = `
      <div class="text-center py-4 text-amber-700 bg-amber-50 rounded-lg text-xs">
        <i class="fa-solid fa-triangle-exclamation mr-1 text-amber-500"></i>
        Todas las firmas están desactivadas. El documento impreso no mostrará sección de firmas.
      </div>
    `;
    return;
  }

  const count = activeFirmas.length;
  const cols = Math.min(count, 4);

  previewEl.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 16px; max-width: 100%; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;">
      ${activeFirmas.map(f => `
        <div style="text-align: center; border-top: 1.5px solid #64748b; padding-top: 6px; min-height: 70px;">
          <strong style="display: block; font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.03em;">
            ${escapeHtml(f.rol || 'RESPONSABLE')}
          </strong>
          ${f.nombre ? `<div style="font-weight: 700; color: #1e293b; font-size: 11px; margin-top: 2px;">${escapeHtml(f.nombre)}</div>` : '<div style="font-size: 10px; color: #94a3b8; margin-top: 2px; font-style: italic;">[Línea para firma física]</div>'}
          ${f.cargo ? `<div style="font-size: 10px; color: #475569; margin-top: 1px;">${escapeHtml(f.cargo)}</div>` : ''}
          ${f.cedula ? `<div style="font-size: 9.5px; color: #64748b; font-family: monospace; margin-top: 1px;">${escapeHtml(f.cedula)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Guarda las firmas en state.settings y las persiste
 */
export function saveFirmasModalAction() {
  if (!guardFirmasEdit()) return;
  if (!state.settings) state.settings = {};
  state.settings.firmas = temporaryFirmas.map(f => ({ ...f }));
  persistSettings();
  closeFirmasResponsablesModal();
  showToast('✓ Firmas y responsables guardados. Se reflejarán en las impresiones de Alcances y Presupuesto.', 'success');
}

/**
 * Guarda y abre inmediatamente la vista previa de impresión
 */
export function previewPrintWithFirmasAction() {
  saveFirmasModalAction();
  if (typeof window.printTab1Catalog === 'function') {
    window.printTab1Catalog();
  }
}

// Exponer en el objeto global window
if (typeof window !== 'undefined') {
  window.openFirmasResponsablesModal = openFirmasResponsablesModal;
  window.closeFirmasResponsablesModal = closeFirmasResponsablesModal;
  window.addFirmaSlotAction = addFirmaSlotAction;
  window.removeFirmaSlotAction = removeFirmaSlotAction;
  window.toggleFirmaSlotAction = toggleFirmaSlotAction;
  window.updateFirmaSlotField = updateFirmaSlotField;
  window.resetFirmasToDefaultAction = resetFirmasToDefaultAction;
  window.saveFirmasModalAction = saveFirmasModalAction;
  window.previewPrintWithFirmasAction = previewPrintWithFirmasAction;
  window.quickAssignPersonToFirstEmptySlot = quickAssignPersonToFirstEmptySlot;
  window.getFirmasPrintHtml = getFirmasPrintHtml;
}
