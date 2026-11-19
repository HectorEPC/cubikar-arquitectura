// js/mobile/mobileCalendarioArq.js — Pestaña 4 de cubikar Arquitectura: Programa Ejecutivo y Ruta Crítica CPM

import { state } from '../state/store.js?v=20261117_cf30';
import { formatMoney } from '../core/formatters.js?v=20261117_cf30';
import {
  extractScheduleItems,
  ensureInitialDates,
  recalculateScheduleCPM,
  getScheduleSettings,
  autoDistributeAllSchedule,
  updateConceptDatesInModel
} from '../modules/calendario/calendarioModel.js?v=20261117_cf30';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261117_cf30';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261117_cf30';
import { showToast } from '../ui/notifications.js?v=20261117_cf30';
import { escapeHtml } from './mobileBridge.js?v=20261117_cf30';

let filter = 'all';

export function renderMobileCalendarioArq(container, { openSheet, closeSheet }) {
  if (!container) return;
  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('calendario');
  const editable = canEditRole && !locked;

  const cfg = getScheduleSettings();
  const items = extractScheduleItems(state.treeData || []);
  ensureInitialDates(items, cfg.startDate);
  const cpm = recalculateScheduleCPM(items);
  const concepts = items.filter(it => it.tipo === 'concepto');
  const criticalCount = concepts.filter(c => c.isCritical).length;
  const visible = filter === 'critical' ? concepts.filter(c => c.isCritical) : concepts;

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">${!canEditRole ? 'Solo lectura' : (locked ? 'Calendario protegido' : 'Edición de fechas activa')}</span>
      </div>
      ${canEditRole ? `<button type="button" id="m-ac-lock" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">${locked ? 'Desbloquear' : 'Proteger'}</button>` : ''}
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">Periodo Proyecto</div>
        <div class="m-kpi-value m-mono" style="font-size:12.5px;">${escapeHtml(cpm?.projectStartDate || cfg.startDate || '-')} &rarr; ${escapeHtml(cpm?.projectEndDate || '-')}</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">Ruta Crítica CPM</div>
        <div class="m-kpi-value" style="color:var(--danger);font-size:14px;">${criticalCount} crítica${criticalCount === 1 ? '' : 's'} &bull; ${Number(cpm?.totalDurationDays || 0)}d</div>
      </div>
    </div>

    <div class="m-row-between">
      <div class="m-chip-bar" style="flex:1;">
        <button type="button" data-ac-f="all" class="m-chip ${filter === 'all' ? 'is-active' : ''}">Todos (${concepts.length})</button>
        <button type="button" data-ac-f="critical" class="m-chip ${filter === 'critical' ? 'is-active' : ''}"><i class="fa-solid fa-fire"></i> Crítica (${criticalCount})</button>
      </div>
      ${editable ? `<button type="button" id="m-ac-auto" class="m-btn m-btn-outline m-btn-sm"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto</button>` : ''}
    </div>

    <div style="display:flex;flex-direction:column;gap:8px;">
      ${visible.map(c => `
        <div class="m-card" ${editable ? `data-edit-ac="${escapeHtml(c.id)}" style="cursor:pointer;"` : ''}>
          <div class="m-row-between" style="margin-bottom:4px;">
            <span class="m-pill ${c.isCritical ? 'm-pill-red' : 'm-pill-blue'} m-mono">${escapeHtml(c.clave || '')}</span>
            <span class="m-mono" style="font-size:11.5px;font-weight:800;">${Number(c.durationDays || 1)}d</span>
          </div>
          <div style="font-size:12.5px;font-weight:700;">${escapeHtml(c.descripcion || '')}</div>
          <div class="m-row-between" style="margin-top:6px;font-size:11px;color:var(--muted);">
            <span class="m-mono">${escapeHtml(c.startDate || '-')} &rarr; ${escapeHtml(c.endDate || '-')}</span>
            <span class="m-mono">${escapeHtml(formatMoney(c.importe || 0))}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelector('#m-ac-lock')?.addEventListener('click', () => {
    setTabLocked('calendario', !locked);
    renderMobileCalendarioArq(container, { openSheet, closeSheet });
  });
  container.querySelectorAll('[data-ac-f]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.acF;
    renderMobileCalendarioArq(container, { openSheet, closeSheet });
  }));
  container.querySelector('#m-ac-auto')?.addEventListener('click', () => {
    autoDistributeAllSchedule(cfg.startDate);
    showToast('Programa recalculado.', 'success');
    renderMobileCalendarioArq(container, { openSheet, closeSheet });
  });
  container.querySelectorAll('[data-edit-ac]').forEach(card => card.addEventListener('click', () => {
    const c = concepts.find(x => String(x.id) === String(card.dataset.editAc));
    if (!c) return;
    openSheet({
      title: `Fechas: ${c.clave || ''}`,
      bodyHtml: `
        <form id="m-ac-form" style="display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:12.5px;font-weight:700;">${escapeHtml(c.descripcion || '')}</div>
          <div class="m-grid-2">
            <div><label class="m-label">Inicio</label><input id="m-acf-start" type="date" required class="m-input" value="${escapeHtml(c.startDate || '')}"></div>
            <div><label class="m-label">Días</label><input id="m-acf-dur" type="number" min="1" required class="m-input m-mono" value="${Number(c.durationDays || 3)}"></div>
          </div>
        </form>
      `,
      footerHtml: `<button type="button" id="m-acf-cancel" class="m-btn m-btn-outline">Cancelar</button><button type="submit" form="m-ac-form" class="m-btn m-btn-primary">Guardar</button>`
    });
    document.getElementById('m-acf-cancel')?.addEventListener('click', closeSheet);
    document.getElementById('m-ac-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      updateConceptDatesInModel(c.id, document.getElementById('m-acf-start').value, parseInt(document.getElementById('m-acf-dur').value, 10) || 1);
      closeSheet();
      showToast('Fechas guardadas.', 'success');
      renderMobileCalendarioArq(container, { openSheet, closeSheet });
    });
  }));
}
