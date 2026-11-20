// js/mobile/mobileSeguimiento.js — Pestaña 3 de cubikar Arquitectura: Seguimiento de Entregables, Estatus y % Avance Ponderado

import { state } from '../state/store.js?v=20261119_cf39';
import { ESTATUS_OPTIONS, calcularAvancePonderado, updateEntregableSeguimiento } from '../modules/seguimiento/seguimientoView.js?v=20261119_cf39';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf39';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261119_cf39';
import { showToast } from '../ui/notifications.js?v=20261119_cf39';
import { escapeHtml } from './mobileBridge.js?v=20261119_cf39';

let statusFilter = 'all';

export function renderMobileSeguimiento(container, { openSheet, closeSheet }) {
  if (!container) return;
  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('seguimiento');
  const editable = canEditRole && !locked;

  const stats = calcularAvancePonderado({ statusFilter: 'all' });
  const deliverables = [];
  const walk = (nodes) => (nodes || []).forEach(n => {
    if (Array.isArray(n.children) && n.children.length > 0) walk(n.children);
    else deliverables.push(n);
  });
  walk(state.treeData || []);

  const visible = statusFilter === 'all'
    ? deliverables
    : deliverables.filter(n => (n.estatus || 'pendiente') === statusFilter);

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">${!canEditRole ? 'Solo lectura' : (locked ? 'Seguimiento protegido' : 'Edición de entregables activa')}</span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-seg-lock" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">${locked ? 'Desbloquear' : 'Proteger'}</button>
      ` : ''}
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">Avance Ponderado</div>
        <div class="m-kpi-value" style="color:var(--primary);">${Number(stats.avancePonderadoFinal || 0).toFixed(1)}%</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">Entregables Aprobados</div>
        <div class="m-kpi-value" style="color:var(--success);">${stats.aprobados} / ${stats.totalUnfiltered}</div>
      </div>
    </div>

    <div class="m-chip-bar">
      <button type="button" data-seg-f="all" class="m-chip ${statusFilter === 'all' ? 'is-active' : ''}">Todos (${deliverables.length})</button>
      ${ESTATUS_OPTIONS.map(opt => `
        <button type="button" data-seg-f="${opt.id}" class="m-chip ${statusFilter === opt.id ? 'is-active' : ''}">${opt.label}</button>
      `).join('')}
    </div>

    <div style="display:flex;flex-direction:column;gap:8px;">
      ${visible.map(node => {
        const stId = node.estatus || 'pendiente';
        const stMeta = ESTATUS_OPTIONS.find(o => o.id === stId) || ESTATUS_OPTIONS[0];
        const pct = Math.max(0, Math.min(100, Number(node.avancePorcentaje || (stId === 'aprobado' ? 100 : 0))));
        return `
          <div class="m-card" ${editable ? `data-edit-seg="${escapeHtml(node.id)}" style="cursor:pointer;"` : ''}>
            <div class="m-row-between" style="margin-bottom:4px;">
              <span class="m-pill m-pill-blue m-mono">${escapeHtml(node.clave || '')}</span>
              <span class="m-pill" style="background:${stMeta.bgHex}22;color:${stMeta.bgHex};border-color:${stMeta.bgHex}55;">
                <i class="${stMeta.icon}"></i> ${escapeHtml(stMeta.label)}
              </span>
            </div>
            <div style="font-size:12.5px;font-weight:700;margin-bottom:6px;">${escapeHtml(node.descripcion || '')}</div>
            <div class="m-row-between" style="font-size:11px;color:var(--muted);margin-bottom:4px;">
              <span>Avance</span>
              <strong class="m-mono">${pct}%</strong>
            </div>
            <div class="m-progress-track">
              <div class="m-progress-fill" style="width:${pct}%;background:${stMeta.bgHex};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.querySelector('#m-seg-lock')?.addEventListener('click', () => {
    setTabLocked('seguimiento', !locked);
    renderMobileSeguimiento(container, { openSheet, closeSheet });
  });
  container.querySelectorAll('[data-seg-f]').forEach(b => b.addEventListener('click', () => {
    statusFilter = b.dataset.segF;
    renderMobileSeguimiento(container, { openSheet, closeSheet });
  }));

  if (editable) {
    container.querySelectorAll('[data-edit-seg]').forEach(card => card.addEventListener('click', () => {
      const node = deliverables.find(d => String(d.id) === String(card.dataset.editSeg));
      if (!node) return;
      openSheet({
        title: `Seguimiento ${node.clave || ''}`,
        bodyHtml: `
          <form id="m-seg-form" style="display:flex;flex-direction:column;gap:10px;">
            <div style="font-size:12.5px;font-weight:700;">${escapeHtml(node.descripcion || '')}</div>
            <div>
              <label class="m-label" for="m-sg-status">Estatus</label>
              <select id="m-sg-status" class="m-select">
                ${ESTATUS_OPTIONS.map(o => `<option value="${o.id}" ${(node.estatus || 'pendiente') === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="m-label" for="m-sg-pct">% Avance (0 - 100)</label>
              <input id="m-sg-pct" type="number" min="0" max="100" step="5" class="m-input m-mono" value="${Number(node.avancePorcentaje || 0)}">
            </div>
            <div>
              <label class="m-label" for="m-sg-link">Enlace a planos / nube (opcional)</label>
              <input id="m-sg-link" type="url" class="m-input" placeholder="https://..." value="${escapeHtml(node.archivoLink || '')}">
            </div>
          </form>
        `,
        footerHtml: `
          <button type="button" id="m-sg-cancel" class="m-btn m-btn-outline">Cancelar</button>
          <button type="submit" form="m-seg-form" class="m-btn m-btn-primary">Guardar</button>
        `
      });
      document.getElementById('m-sg-cancel')?.addEventListener('click', closeSheet);
      document.getElementById('m-seg-form')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const st = document.getElementById('m-sg-status').value;
        const rawPct = parseFloat(document.getElementById('m-sg-pct').value);
        const pct = Number.isFinite(rawPct) ? rawPct : 0;
        const prevPct = Number(node.avancePorcentaje || 0);
        const statusChanged = st !== (node.estatus || 'pendiente');
        const lnk = document.getElementById('m-sg-link').value.trim();
        updateEntregableSeguimiento(node.id, 'estatus', st);
        if (!statusChanged || Math.abs(pct - prevPct) > 0.001) {
          updateEntregableSeguimiento(node.id, 'avancePorcentaje', pct);
        }
        updateEntregableSeguimiento(node.id, 'archivoLink', lnk);
        closeSheet();
        showToast('Seguimiento actualizado.', 'success');
        renderMobileSeguimiento(container, { openSheet, closeSheet });
      });
    }));
  }
}
