// js/mobile/mobileEstimacionesArq.js — Pestaña 5 de cubikar Arquitectura: Estimaciones (% Avance), Anticipo, IVA y Fotos

import { formatMoney, round2 } from '../core/formatters.js?v=20261119_cf42';
import {
  getEstimacionesCalculatedData,
  createNewEstimacion,
  setActiveEstimacionId,
  toggleActiveEstimacionLockState,
  isEstimacionLocked,
  setConceptoAvancePct,
  getConceptoFotosEstimacion,
  setConceptoFotosEstimacion
} from '../modules/estimaciones/estimacionesModel.js?v=20261119_cf42';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf42';
import { showToast } from '../ui/notifications.js?v=20261119_cf42';
import { escapeHtml, readFileAsResizedDataUrl } from './mobileBridge.js?v=20261119_cf42';

export function renderMobileEstimacionesArq(container, { openSheet, closeSheet }) {
  if (!container) return;
  const data = getEstimacionesCalculatedData();
  const activeEst = data.activeEst;
  const canEditRole = canCurrentUserEditProject();
  const locked = isEstimacionLocked(activeEst?.id);
  const editable = canEditRole && !locked;

  const isZero = activeEst?.numero === 0;
  const netoConIva = isZero
    ? round2((data.kpis.anticipo.totalContratado || 0) * (1 + (data.kpis.iva.pct / 100)))
    : (data.kpis.iva.totalConIva || 0);
  const rows = (data.rows || []).filter(r => !r.isParent);

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">${!canEditRole ? 'Solo lectura' : (locked ? `${escapeHtml(activeEst?.nombre || 'Estimación')} protegida` : 'Captura de % avance activa')}</span>
      </div>
      ${canEditRole ? `<button type="button" id="m-ea-lock" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">${locked ? 'Desbloquear' : 'Proteger'}</button>` : ''}
    </div>

    <div class="m-chip-bar">
      ${(data.estimacionesList || []).map(est => `
        <button type="button" data-ea-id="${escapeHtml(est.id)}" class="m-chip ${est.id === activeEst?.id ? 'is-active' : ''}">${escapeHtml(est.nombre || `Est. ${est.numero}`)}</button>
      `).join('')}
      ${canEditRole ? `<button type="button" id="m-ea-new" class="m-chip" style="border-style:dashed;color:var(--primary);"><i class="fa-solid fa-plus"></i> Nueva</button>` : ''}
    </div>

    <div class="m-card">
      <div class="m-kpi-label">${escapeHtml(activeEst?.nombre || 'Estimación')} (Neto + IVA)</div>
      <div class="m-kpi-value" style="font-size:20px;color:var(--primary);">${escapeHtml(formatMoney(netoConIva))}</div>
      <div class="m-row-between" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:11.5px;color:var(--muted);">
        <span>Avance Global: <strong>${Number(data.kpis.pctAvanceGlobal || 0).toFixed(1)}%</strong></span>
        <span>Amort. Esta Est: <strong class="m-mono">${escapeHtml(formatMoney(data.kpis.anticipo.amortizacionEsta || 0))}</strong></span>
      </div>
    </div>

    ${isZero ? `
      <div class="m-card" style="text-align:center;padding:20px;">
        <strong>Estimación 0 — Anticipo</strong>
        <p class="m-subtitle">Selecciona o crea Estimación 1+ para capturar avance porcentual.</p>
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${rows.map(r => {
          const pctEsta = round2(r.pctEje ?? r.pctAvanceEsta ?? 0);
          const impEsta = r.importeEje ?? r.totalEje ?? 0;
          const fotos = getConceptoFotosEstimacion(r.id);
          return `
            <div class="m-card">
              <div class="m-row-between">
                <span class="m-pill m-pill-blue m-mono">${escapeHtml(r.clave || '')}</span>
                <span class="m-mono" style="font-size:13px;font-weight:800;color:var(--primary);">${escapeHtml(formatMoney(impEsta))}</span>
              </div>
              <div style="font-size:12.5px;font-weight:700;margin:4px 0;">${escapeHtml(r.descripcion || '')}</div>
              <div class="m-row-between" style="margin-top:6px;">
                <div class="m-row" style="gap:6px;">
                  ${editable ? `
                    <button type="button" data-ea-step="${escapeHtml(r.id)}" data-delta="-5" class="m-icon-btn" style="width:30px;height:30px;">-</button>
                    <input type="number" step="1" min="0" max="100" data-ea-pct="${escapeHtml(r.id)}" class="m-input m-mono" style="width:74px;padding:6px;text-align:center;" value="${pctEsta}">
                    <button type="button" data-ea-step="${escapeHtml(r.id)}" data-delta="5" class="m-icon-btn" style="width:30px;height:30px;">+</button>
                    <span style="font-size:12px;color:var(--muted);">%</span>
                  ` : `<strong class="m-mono">${pctEsta}%</strong>`}
                </div>
                <button type="button" data-ea-foto="${escapeHtml(r.id)}" class="m-btn m-btn-sm ${fotos.length > 0 ? 'm-btn-primary' : 'm-btn-outline'}">
                  <i class="fa-solid fa-camera"></i> ${fotos.length || 'Foto'}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  container.querySelector('#m-ea-lock')?.addEventListener('click', () => {
    toggleActiveEstimacionLockState();
    renderMobileEstimacionesArq(container, { openSheet, closeSheet });
  });
  container.querySelectorAll('[data-ea-id]').forEach(b => b.addEventListener('click', () => {
    setActiveEstimacionId(b.dataset.eaId);
    renderMobileEstimacionesArq(container, { openSheet, closeSheet });
  }));
  container.querySelector('#m-ea-new')?.addEventListener('click', () => {
    const c = createNewEstimacion();
    if (c) showToast(`${c.nombre} creada.`, 'success');
    renderMobileEstimacionesArq(container, { openSheet, closeSheet });
  });
  container.querySelectorAll('[data-ea-step]').forEach(b => b.addEventListener('click', () => {
    const r = rows.find(x => String(x.id) === String(b.dataset.eaStep));
    if (!r) return;
    const cur = round2(r.pctEje ?? r.pctAvanceEsta ?? 0);
    setConceptoAvancePct(r.id, Math.max(0, Math.min(100, cur + (parseFloat(b.dataset.delta) || 0))));
    renderMobileEstimacionesArq(container, { openSheet, closeSheet });
  }));
  container.querySelectorAll('[data-ea-pct]').forEach(inp => inp.addEventListener('change', () => {
    const val = Math.max(0, Math.min(100, parseFloat(inp.value) || 0));
    setConceptoAvancePct(inp.dataset.eaPct, val);
    renderMobileEstimacionesArq(container, { openSheet, closeSheet });
  }));
  container.querySelectorAll('[data-ea-foto]').forEach(b => b.addEventListener('click', () => {
    const cId = b.dataset.eaFoto;
    const curFotos = getConceptoFotosEstimacion(cId);
    openSheet({
      title: 'Evidencia Fotográfica',
      bodyHtml: `
        <div id="m-eaf-list" style="display:flex;flex-direction:column;gap:8px;">
          ${curFotos.map(f => `<img src="${escapeHtml(f.displayUrl || f.url)}" style="width:100%;max-height:180px;object-fit:cover;border-radius:10px;">`).join('') || '<div style="text-align:center;color:var(--muted);">Sin fotografías.</div>'}
        </div>
        ${editable ? `
          <label class="m-btn m-btn-soft m-btn-sm" style="cursor:pointer;">
            <i class="fa-solid fa-camera"></i> Agregar Fotografía
            <input type="file" id="m-eaf-up" accept="image/*" style="display:none;">
          </label>
        ` : ''}
      `,
      footerHtml: '<button type="button" id="m-eaf-close" class="m-btn m-btn-outline">Cerrar</button>'
    });
    document.getElementById('m-eaf-close')?.addEventListener('click', closeSheet);
    document.getElementById('m-eaf-up')?.addEventListener('change', async (ev) => {
      const f = ev.target.files?.[0];
      if (!f) return;
      const dataUrl = await readFileAsResizedDataUrl(f, 1024, 0.72);
      const next = [...curFotos, { url: dataUrl, nota: 'Evidencia móvil' }].slice(-2);
      setConceptoFotosEstimacion(cId, next);
      closeSheet();
      showToast('Foto guardada.', 'success');
      renderMobileEstimacionesArq(container, { openSheet, closeSheet });
    });
  }));
}
