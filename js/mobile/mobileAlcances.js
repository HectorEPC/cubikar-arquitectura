// js/mobile/mobileAlcances.js — Pestaña 1 de cubikar Arquitectura: Alcances y Conceptos de Proyecto

import { state, persistLocalData } from '../state/store.js?v=20261119_cf37';
import { formatMoney, formatQty, round2 } from '../core/formatters.js?v=20261119_cf37';
import { calculateParentTotal } from '../core/calculations.js?v=20261119_cf37';
import { findNodeById, updateNode, addRootRow, addChildRow } from '../modules/catalog/treeService.js?v=20261119_cf37';
import { getPartidaChatCount } from '../modules/chat/projectChat.js?v=20261119_cf37';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf37';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261119_cf37';
import { showToast } from '../ui/notifications.js?v=20261119_cf37';
import { escapeHtml } from './mobileBridge.js?v=20261119_cf37';

let searchText = '';

export function renderMobileAlcances(container, { openSheet, closeSheet, onOpenConceptChat }) {
  if (!container) return;

  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('cat');
  const editable = canEditRole && !locked;

  const grandTotal = round2((state.treeData || []).reduce((acc, r) => acc + calculateParentTotal(r), 0));
  const q = searchText.trim().toLowerCase();

  const rows = [];
  const walk = (nodes, depth = 0) => {
    (nodes || []).forEach(node => {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const match = !q
        || String(node.clave || '').toLowerCase().includes(q)
        || String(node.descripcion || '').toLowerCase().includes(q);
      if (!q || match || hasChildren) rows.push({ node, depth, hasChildren });
      if (hasChildren && (q || node.expanded !== false)) walk(node.children, depth + 1);
    });
  };
  walk(state.treeData || []);

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">${!canEditRole ? 'Solo lectura' : (locked ? 'Alcances protegidos' : 'Edición de alcances activa')}</span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-alc-lock" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">
          ${locked ? 'Desbloquear' : 'Proteger'}
        </button>
      ` : ''}
    </div>

    <div class="m-kpi">
      <div class="m-kpi-label">Total Alcances Seleccionados</div>
      <div class="m-kpi-value" style="color:var(--primary);">${escapeHtml(formatMoney(grandTotal))}</div>
    </div>

    <div class="m-row">
      <input type="search" id="m-alc-search" class="m-input" value="${escapeHtml(searchText)}" placeholder="Buscar etapa o entregable..." style="flex:1;">
      ${editable ? `<button type="button" id="m-alc-add-root" class="m-btn m-btn-primary m-btn-sm"><i class="fa-solid fa-plus"></i> Etapa</button>` : ''}
    </div>

    <div style="display:flex;flex-direction:column;gap:8px;">
      ${rows.length === 0 ? `<div class="m-card" style="text-align:center;padding:22px;color:var(--muted);">Sin alcances visibles.</div>` : rows.map(({ node, depth, hasChildren }) => {
        const pad = Math.min(depth * 12, 24);
        const imp = hasChildren ? calculateParentTotal(node) : round2((node.cantidad || 0) * (node.precioUnitario || 0));
        if (hasChildren) {
          return `
            <div class="m-card-alt m-row-between" style="margin-left:${pad}px;border-left:3px solid var(--primary);">
              <button type="button" data-tog-alc="${escapeHtml(node.id)}" class="m-row" style="flex:1;min-width:0;border:none;background:none;color:inherit;text-align:left;padding:0;cursor:pointer;">
                <i class="fa-solid ${node.expanded !== false ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size:11px;color:var(--primary);"></i>
                <div style="min-width:0;flex:1;">
                  <span class="m-mono" style="font-size:10.5px;color:var(--primary);font-weight:800;">${escapeHtml(node.clave || '')}</span>
                  <div style="font-size:12.5px;font-weight:800;">${escapeHtml(node.descripcion || '')}</div>
                </div>
              </button>
              <div style="text-align:right;">
                <div class="m-mono" style="font-size:12.5px;font-weight:800;">${escapeHtml(formatMoney(imp))}</div>
                ${editable ? `<button type="button" data-add-sub="${escapeHtml(node.id)}" class="m-btn m-btn-sm m-btn-soft" style="margin-top:4px;padding:3px 7px;font-size:10.5px;"><i class="fa-solid fa-plus"></i> Sub</button>` : ''}
              </div>
            </div>
          `;
        }
        const chatCnt = getPartidaChatCount(node.id);
        return `
          <div class="m-card" style="margin-left:${pad}px;">
            <div class="m-row" style="align-items:flex-start;">
              <input type="checkbox" data-sel-alc="${escapeHtml(node.id)}" ${node.selected !== false ? 'checked' : ''} style="margin-top:3px;width:16px;height:16px;">
              <button type="button" data-open-alc="${escapeHtml(node.id)}" style="flex:1;min-width:0;border:none;background:none;color:inherit;text-align:left;padding:0;cursor:pointer;">
                <div class="m-row-between">
                  <span class="m-pill m-pill-blue m-mono">${escapeHtml(node.clave || 'S/C')}</span>
                  <span class="m-mono" style="font-size:13px;font-weight:800;color:var(--primary);">${escapeHtml(formatMoney(imp))}</span>
                </div>
                <div style="font-size:12.5px;font-weight:700;margin-top:4px;">${escapeHtml(node.descripcion || '')}</div>
                <div class="m-row-between" style="margin-top:5px;font-size:11.5px;color:var(--muted);">
                  <span class="m-mono">${escapeHtml(formatQty(node.cantidad || 0))} ${escapeHtml(node.unidad || 'pza')} &times; ${escapeHtml(formatMoney(node.precioUnitario || 0))}</span>
                  ${chatCnt > 0 ? `<span class="m-pill m-pill-blue"><i class="fa-solid fa-comments"></i> ${chatCnt}</span>` : ''}
                </div>
              </button>
            </div>
            ${editable && depth === 0 ? `
              <div style="text-align:right;margin-top:6px;padding-top:6px;border-top:1px solid var(--border);">
                <button type="button" data-add-sub="${escapeHtml(node.id)}" class="m-btn m-btn-sm m-btn-soft" style="padding:3px 8px;font-size:10.5px;"><i class="fa-solid fa-plus"></i> Sub</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.querySelector('#m-alc-lock')?.addEventListener('click', () => {
    setTabLocked('cat', !locked);
    renderMobileAlcances(container, { openSheet, closeSheet, onOpenConceptChat });
  });
  container.querySelector('#m-alc-add-root')?.addEventListener('click', () => {
    addRootRow();
    renderMobileAlcances(container, { openSheet, closeSheet, onOpenConceptChat });
  });
  const sInp = container.querySelector('#m-alc-search');
  sInp?.addEventListener('input', (ev) => {
    searchText = ev.target.value;
    const pos = ev.target.selectionStart;
    renderMobileAlcances(container, { openSheet, closeSheet, onOpenConceptChat });
    const next = container.querySelector('#m-alc-search');
    if (next) {
      next.focus();
      try { next.setSelectionRange(pos, pos); } catch (_) {}
    }
  });
  container.querySelectorAll('[data-tog-alc]').forEach(b => b.addEventListener('click', () => {
    const n = findNodeById(state.treeData, b.dataset.togAlc);
    if (n) { n.expanded = n.expanded === false; persistLocalData(); renderMobileAlcances(container, { openSheet, closeSheet, onOpenConceptChat }); }
  }));
  container.querySelectorAll('[data-add-sub]').forEach(b => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    addChildRow(b.dataset.addSub);
    renderMobileAlcances(container, { openSheet, closeSheet, onOpenConceptChat });
  }));
  container.querySelectorAll('[data-sel-alc]').forEach(cb => cb.addEventListener('change', () => {
    const n = findNodeById(state.treeData, cb.dataset.selAlc);
    if (n) { n.selected = cb.checked; persistLocalData(true); renderMobileAlcances(container, { openSheet, closeSheet, onOpenConceptChat }); }
  }));
  container.querySelectorAll('[data-open-alc]').forEach(b => b.addEventListener('click', () => {
    const n = findNodeById(state.treeData, b.dataset.openAlc);
    if (!n) return;
    openSheet({
      title: `Alcance ${n.clave || ''}`,
      bodyHtml: `
        <form id="m-alc-edit-form" style="display:flex;flex-direction:column;gap:10px;">
          <div>
            <label class="m-label">Descripción</label>
            <textarea id="m-ae-desc" rows="3" class="m-textarea" ${editable ? '' : 'readonly'}>${escapeHtml(n.descripcion || '')}</textarea>
          </div>
          <div class="m-grid-2">
            <div>
              <label class="m-label">Cantidad</label>
              <input id="m-ae-cant" type="number" step="0.01" class="m-input m-mono" value="${round2(n.cantidad || 0)}" ${editable ? '' : 'readonly'}>
            </div>
            <div>
              <label class="m-label">Precio Unitario</label>
              <input id="m-ae-pu" type="number" step="0.01" class="m-input m-mono" value="${round2(n.precioUnitario || 0)}" ${editable ? '' : 'readonly'}>
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button type="button" id="m-ae-chat" class="m-btn m-btn-soft" style="margin-right:auto;"><i class="fa-solid fa-comments"></i> Bitácora Chat</button>
        <button type="button" id="m-ae-close" class="m-btn m-btn-outline">Cerrar</button>
        ${editable ? `<button type="submit" form="m-alc-edit-form" class="m-btn m-btn-primary">Guardar</button>` : ''}
      `
    });
    document.getElementById('m-ae-close')?.addEventListener('click', closeSheet);
    document.getElementById('m-ae-chat')?.addEventListener('click', () => {
      closeSheet();
      onOpenConceptChat?.(n);
    });
    document.getElementById('m-alc-edit-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      updateNode(n.id, 'descripcion', document.getElementById('m-ae-desc').value);
      updateNode(n.id, 'cantidad', parseFloat(document.getElementById('m-ae-cant').value) || 0);
      updateNode(n.id, 'precioUnitario', parseFloat(document.getElementById('m-ae-pu').value) || 0);
      closeSheet();
      showToast('Entregable actualizado.', 'success');
      renderMobileAlcances(container, { openSheet, closeSheet, onOpenConceptChat });
    });
  }));
}
