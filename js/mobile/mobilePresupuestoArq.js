// js/mobile/mobilePresupuestoArq.js — Pestaña 2 de cubikar Arquitectura: Resumen Financiero, Costo/m2, IVA y Márgenes

import { state } from '../state/store.js?v=20261121_cf44';
import { formatMoney, round2 } from '../core/formatters.js?v=20261121_cf44';
import { calcularResumenPresupuesto, updatePresupuestoNodeField } from '../modules/presupuesto/presupuestoModel.js?v=20261121_cf44';
import { hasOwnCotizaciones } from '../core/calculations.js?v=20261121_cf44';
import { findNodeById } from '../modules/catalog/treeService.js?v=20261121_cf44';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261121_cf44';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261121_cf44';
import { showToast } from '../ui/notifications.js?v=20261121_cf44';
import { escapeHtml } from './mobileBridge.js?v=20261121_cf44';

export function renderMobilePresupuestoArq(container, { openSheet, closeSheet }) {
  if (!container) return;
  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('presupuesto');
  const editable = canEditRole && !locked;

  const res = calcularResumenPresupuesto();

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">${!canEditRole ? 'Solo lectura' : (locked ? 'Presupuesto protegido' : 'Edición financiera activa')}</span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-pa-lock" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">${locked ? 'Desbloquear' : 'Proteger'}</button>
      ` : ''}
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">Gran Total Cliente</div>
        <div class="m-kpi-value" style="color:var(--primary);">${escapeHtml(formatMoney(res.granTotal || 0))}</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">Utilidad Real</div>
        <div class="m-kpi-value" style="color:var(--success);">${escapeHtml(formatMoney(res.utilidadReal || 0))}</div>
      </div>
    </div>

    <div class="m-card" style="display:flex;flex-direction:column;gap:7px;">
      <div style="font-size:13px;font-weight:800;margin-bottom:2px;">Desglose Ejecutivo</div>
      <div class="m-row-between"><span>Subtotal Venta Cliente</span><strong class="m-mono">${escapeHtml(formatMoney(res.subtotalVenta || 0))}</strong></div>
      <div class="m-row-between"><span>Costo Producción / Interno</span><strong class="m-mono">${escapeHtml(formatMoney(res.costoTotalProduccion || 0))}</strong></div>
      <div class="m-row-between"><span>Horas Hombre / Tarifa</span><strong class="m-mono">${round2(res.totalHorasHombre || 0)} hrs (${escapeHtml(formatMoney(res.costoHorasHombre || 0))})</strong></div>
      <div class="m-row-between"><span>IVA (${res.ivaPct}%)</span><strong class="m-mono">${escapeHtml(formatMoney(res.montoIva || 0))}</strong></div>
      <div class="m-row-between"><span>Superficie / Precio m²</span><strong class="m-mono">${res.superficieM2} m² &bull; ${escapeHtml(formatMoney(res.precioPorM2 || 0))}/m²</strong></div>
    </div>

    <div style="font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;">Resumen por Partida</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${(res.subtitulosResumen || []).map(sub => `
        <div class="m-card" data-open-sub="${escapeHtml(sub.id)}" style="${editable ? 'cursor:pointer;' : ''}">
          <div class="m-row-between">
            <span class="m-pill m-pill-blue m-mono">${escapeHtml(sub.clave || '')}</span>
            <span class="m-mono" style="font-size:13.5px;font-weight:800;color:var(--primary);">${escapeHtml(formatMoney(sub.importe || 0))}</span>
          </div>
          <div style="font-size:13px;font-weight:700;margin:4px 0;">${escapeHtml(sub.descripcion || '')}</div>
          <div class="m-row-between" style="font-size:11px;color:var(--muted);">
            <span>Incidencia: ${Number(sub.incidenciaPct || 0).toFixed(1)}% &bull; ${sub.conceptosCount} entregables</span>
            <span class="m-mono">Util: ${escapeHtml(formatMoney(sub.utilidad || 0))}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelector('#m-pa-lock')?.addEventListener('click', () => {
    setTabLocked('presupuesto', !locked);
    renderMobilePresupuestoArq(container, { openSheet, closeSheet });
  });

  if (editable) {
    container.querySelectorAll('[data-open-sub]').forEach(card => {
      card.addEventListener('click', () => {
        const node = findNodeById(state.treeData || [], card.dataset.openSub);
        if (!node) return;
        const leafList = [];
        const walk = (arr) => (arr || []).forEach(n => {
          if (Array.isArray(n.children) && n.children.length > 0) walk(n.children);
          else leafList.push(n);
        });
        walk([node]);
        if (leafList.length === 0) return;

        openSheet({
          title: `Editar Importe: ${node.descripcion || ''}`,
          bodyHtml: leafList.slice(0, 12).map(n => {
            const hasWinnerQuote = hasOwnCotizaciones(n);
            return `
            <div class="m-card-alt">
              <div style="font-size:12px;font-weight:700;margin-bottom:4px;">${escapeHtml(n.clave || '')} ${escapeHtml(n.descripcion || '')}</div>
              ${hasWinnerQuote ? `<div style="font-size:10.5px;color:var(--primary);margin-bottom:4px;"><i class="fa-solid fa-trophy"></i> Precio fijado por cotización ganadora en Alcances.</div>` : ''}
              <div class="m-grid-2">
                <div>
                  <label class="m-label">Precio Venta Unit.</label>
                  <input type="number" step="0.01" data-pa-pu="${escapeHtml(n.id)}" class="m-input m-mono" value="${round2(n.precioUnitario || 0)}" ${hasWinnerQuote ? 'disabled readonly' : ''}>
                </div>
                <div>
                  <label class="m-label">Horas Hombre</label>
                  <input type="number" step="0.5" data-pa-hh="${escapeHtml(n.id)}" class="m-input m-mono" value="${round2(n.horasHombre || 0)}">
                </div>
              </div>
            </div>
          `;
          }).join(''),
          footerHtml: `
            <button type="button" id="m-pa-cancel" class="m-btn m-btn-outline">Cerrar</button>
            <button type="button" id="m-pa-save" class="m-btn m-btn-primary">Aplicar</button>
          `
        });
        document.getElementById('m-pa-cancel')?.addEventListener('click', closeSheet);
        document.getElementById('m-pa-save')?.addEventListener('click', () => {
          let updatedCount = 0;
          document.querySelectorAll('[data-pa-pu]').forEach(inp => {
            if (inp.disabled) return;
            if (updatePresupuestoNodeField(inp.dataset.paPu, 'precioUnitario', inp.value) !== false) updatedCount++;
          });
          document.querySelectorAll('[data-pa-hh]').forEach(inp => {
            if (updatePresupuestoNodeField(inp.dataset.paHh, 'horasHombre', inp.value) !== false) updatedCount++;
          });
          closeSheet();
          if (updatedCount > 0) showToast('Precios actualizados.', 'success');
          renderMobilePresupuestoArq(container, { openSheet, closeSheet });
        });
      });
    });
  }
}
