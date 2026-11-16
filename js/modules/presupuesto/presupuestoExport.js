// js/modules/presupuesto/presupuestoExport.js
// Impresión Ejecutiva (PDF) y Exportación Excel (.xlsx) para la pestaña 1. Presupuesto

import { state } from '../../state/store.js?v=20261116_cf11';
import { getActiveProjectId } from '../../config/constants.js?v=20261116_cf11';
import { getProjectById } from '../portal/projectService.js?v=20261116_cf11';
import { formatMoney, formatQty, formatNumber, getCurrencyCode, round2 } from '../../core/formatters.js?v=20261116_cf11';
import { hasOwnCotizaciones } from '../../core/calculations.js?v=20261116_cf11';
import { showToast } from '../../ui/notifications.js?v=20261116_cf11';
import { openPrintWindow } from '../io/printService.js?v=20261116_cf11';
import {
  getProjectPresupuestoConfig,
  calcularResumenPresupuesto,
  computeNodeMetrics,
  isSubtituloNode,
  getEffectiveConceptPU,
  getConceptImporte,
  computeFechaVencimiento
} from './presupuestoModel.js?v=20261116_cf11';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatIsoDateSpanish(isoStr) {
  if (!isoStr) return '—';
  const parts = String(isoStr).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return escapeHtml(isoStr);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function resolveCompanyBranding() {
  const activeProj = getProjectById(getActiveProjectId());
  const companyName = (state.settings && state.settings.companyName) || (activeProj && activeProj.companyName) || 'Estudio de Arquitectura';
  const companySubtitle = (state.settings && state.settings.companySubtitle) || (activeProj && activeProj.companySubtitle) || 'Proyectos Ejecutivos y Gestión de Obra';
  const projectName = (state.settings && state.settings.projectName) || (activeProj && activeProj.projectName) || 'Proyecto Arquitectónico';
  const projectLocation = (state.settings && state.settings.projectLocation) || (activeProj && activeProj.projectLocation) || '';

  let companyLogo = (state.settings && state.settings.companyLogo) || (activeProj && activeProj.companyLogo) || '';
  if (!companyLogo && typeof document !== 'undefined') {
    const domLogo = document.getElementById('custom-company-logo');
    const domSrc = domLogo && !domLogo.classList.contains('hidden') ? (domLogo.getAttribute('src') || '') : '';
    if (domSrc && domSrc.trim()) {
      companyLogo = domSrc.trim();
    }
  }

  return { companyName, companySubtitle, companyLogo: String(companyLogo || '').trim(), projectName, projectLocation };
}

function buildPrintLogoHtml(companyLogo, companyName) {
  if (companyLogo) {
    return `<img src="${escapeHtml(companyLogo)}" alt="Logo Empresa" style="height: 74px; width: 74px; min-width: 74px; aspect-ratio: 1/1; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 6px; padding: 3px; background-color: #ffffff; flex-shrink: 0;">`;
  }
  const words = String(companyName || 'EA').trim().split(/\s+/).filter(Boolean);
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : String(companyName || 'EA').slice(0, 2).toUpperCase();
  return `
    <div style="height: 74px; width: 74px; min-width: 74px; border-radius: 6px; border: 1px solid #cbd5e1; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <svg width="26" height="20" viewBox="0 0 28 22" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 3px;">
        <path d="M3 19L14 3L25 19H3Z" stroke="#fbbf24" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M9.5 19V12.5H18.5V19" stroke="#38bdf8" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>
      <span style="font-size: 10pt; font-weight: 800; letter-spacing: 0.08em; line-height: 1;">${escapeHtml(initials)}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 1. Impresión de Cotización / Presupuesto Ejecutivo (PDF)
// ---------------------------------------------------------------------------
/**
 * Construye el HTML completo de la tabla de presupuesto en formato de impresión
 * (Niv | Clave | Descripción de Concepto | Cant. | Unid | Precio Unit. | Total).
 * Se reutiliza tanto en pantalla como al imprimir para conservar fidelidad 1:1.
 */
export function buildPresupuestoPrintTableHtml(nodes, resumen, cfg = {}, options = {}) {
  const { forPrint = false, locked = false } = options;
  const list = Array.isArray(nodes) ? nodes : [];

  const tarifaHr = Math.max(1, parseFloat(cfg?.costoHoraHombrePromedio) || 380);
  const margenDecimal = (Number(resumen?.margenPct) || 0) / 100;

  const fontMono = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  const fontBase = forPrint ? '8pt' : '11.5px';
  const fontHeader = forPrint ? '7.5pt' : '10.5px';
  const fontSmall = forPrint ? '7.5pt' : '10.5px';
  const fontParentDesc = forPrint ? '8.5pt' : '11.5px';
  const fontParentNum = forPrint ? '8pt' : '11.5px';
  const fontParentTotal = forPrint ? '8.5pt' : '12px';

  function hasAnySelectedChild(n) {
    if (!Array.isArray(n.children) || n.children.length === 0) return false;
    return n.children.some(c => (isSubtituloNode(c) ? hasAnySelectedChild(c) : c.selected !== false));
  }

  function isNodeEffectivelySelected(n) {
    if (isSubtituloNode(n)) {
      if (hasOwnCotizaciones(n)) return n.selected !== false;
      if (Array.isArray(n.children) && n.children.length > 0) {
        return hasAnySelectedChild(n);
      }
      return n.selected !== false;
    }
    return n.selected !== false;
  }

  let rowsHtml = '';

  function walkClean(items, level = 1, blockedByParent = false) {
    for (const node of items) {
      const isParent = isSubtituloNode(node);
      const isSelected = isNodeEffectivelySelected(node);

      // En modo impresión, si la fila no está seleccionada, NO se imprime
      if (forPrint && !isSelected) {
        continue;
      }

      const hasOwnQuote = !blockedByParent && hasOwnCotizaciones(node);
      const indentPx = (level - 1) * 10;
      const cantFormatted = formatQty(node.cantidad);
      const unidadDisplay = isParent ? 'lote' : (node.unidad || 'pza');

      const checkboxTd = !forPrint ? `
        <td style="${isParent ? 'border: 1px solid #334155;' : 'border: 1px solid #cbd5e1;'} width: 36px; min-width: 36px; text-align: center; vertical-align: middle; padding: 4px 2px;">
          <input type="checkbox" ${isSelected ? 'checked' : ''} ${locked ? 'disabled' : ''}
                 onchange="togglePresupuestoSelectNode('${node.id}', this.checked)"
                 class="rounded text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5 align-middle disabled:opacity-50 disabled:cursor-not-allowed"
                 title="${isSelected ? 'Desmarcar para no imprimir esta fila o concepto' : 'Marcar para imprimir esta fila o concepto'}">
        </td>
      ` : '';

      if (isParent) {
        const metrics = blockedByParent ? { importe: 0 } : computeNodeMetrics(node, tarifaHr, margenDecimal, { onlySelected: true });
        const isRoot = level === 1;
        // Solo pintar la fila de nivel 1; niveles superiores permanecen limpios/blancos
        const rowBg = isRoot ? '#1e293b' : ((!forPrint && !isSelected) ? '#f8fafc' : '#ffffff');
        const tdBorder = isRoot ? 'border: 1px solid #334155;' : 'border: 1px solid #cbd5e1;';
        const rowTextColor = isRoot ? '#ffffff' : '#0f172a';
        const numTextColor = isRoot ? '#ffffff' : '#334155';
        const opacityStyle = !forPrint && !isSelected ? 'opacity: 0.55;' : '';
        const isExpanded = node.expanded !== false;

        const chevronBtn = !forPrint ? `
          <button type="button"
                  onclick="togglePresupuestoSubtituloExpand('${node.id}', event)"
                  class="inline-flex items-center justify-center w-4 h-4 rounded ${isRoot ? 'hover:bg-white/20 text-white/90' : 'hover:bg-slate-200 text-slate-600'} transition cursor-pointer mr-1.5 focus:outline-none shrink-0"
                  title="${isExpanded ? 'Hacer clic para agrupar conceptos de esta partida' : 'Hacer clic para desagrupar conceptos de esta partida'}">
            <i class="fa-solid fa-chevron-${isExpanded ? 'down' : 'right'} text-[9px]"></i>
          </button>
        ` : '';

        const collapsedPill = (!isExpanded && metrics.conceptosCount > 0) ? (
          forPrint
            ? `<span style="font-size: 7.2pt; font-weight: normal; opacity: 0.82; margin-left: 6px; text-transform: none; color: ${isRoot ? '#cbd5e1' : '#64748b'}; font-family: ${fontMono};">(${metrics.conceptosCount} agrupados)</span>`
            : `<span class="inline-flex items-center gap-1 text-[9px] font-normal normal-case opacity-85 ml-2 font-mono ${isRoot ? 'bg-black/25 text-slate-200' : 'bg-slate-100 border border-slate-200 text-slate-600'} px-1.5 py-0.5 rounded">
                <i class="fa-solid fa-layer-group text-[8px]"></i>${metrics.conceptosCount} agrupados
              </span>`
        ) : '';

        rowsHtml += `
          <tr style="background-color: ${rowBg}; color: ${rowTextColor}; font-weight: 700; ${opacityStyle}">
            ${checkboxTd}
            <td style="${tdBorder} padding: 6px 5px; text-align: center; font-size: ${fontSmall}; vertical-align: top; color: ${isRoot ? '#ffffff' : '#64748b'};">${level}</td>
            <td style="${tdBorder} padding: 6px 7px; font-family: ${fontMono}; font-size: ${fontParentNum}; white-space: nowrap; vertical-align: top; color: ${isRoot ? '#ffffff' : '#1e293b'};">
              ${escapeHtml(node.clave || '')}
            </td>
            <td style="${tdBorder} padding: 6px 8px; padding-left: ${8 + indentPx}px; text-transform: uppercase; letter-spacing: 0.02em; font-size: ${fontParentDesc}; text-align: left; vertical-align: top; word-break: break-word;"
                ${!forPrint ? `class="cursor-pointer select-none" onclick="togglePresupuestoSubtituloExpand('${node.id}', event)" title="${isExpanded ? 'Clic para agrupar conceptos' : 'Clic para desagrupar conceptos'}"` : ''}>
              <div style="display: flex; align-items: center;">
                ${chevronBtn}
                <span>${escapeHtml(node.descripcion || '')}</span>
                ${collapsedPill}
              </div>
            </td>
            <td style="${tdBorder} padding: 6px 7px; text-align: right; font-family: ${fontMono}; font-size: ${fontParentNum}; white-space: nowrap; vertical-align: top; color: ${numTextColor};">
              ${cantFormatted}
            </td>
            <td style="${tdBorder} padding: 6px 7px; text-align: center; font-family: ${fontMono}; font-size: ${fontParentNum}; white-space: nowrap; vertical-align: top; color: ${isRoot ? '#ffffff' : '#475569'};">
              ${escapeHtml(unidadDisplay)}
            </td>
            <td style="${tdBorder} padding: 6px 7px; text-align: right; font-family: ${fontMono}; font-size: ${fontParentNum}; white-space: nowrap; color: #94a3b8; vertical-align: top;">
              -
            </td>
            <td style="${tdBorder} padding: 6px 8px; text-align: right; font-family: ${fontMono}; font-size: ${fontParentTotal}; white-space: nowrap; vertical-align: top; color: ${rowTextColor};">
              ${formatMoney(metrics.importe)}
            </td>
          </tr>
        `;
        if (isExpanded) {
          walkClean(node.children || [], level + 1, blockedByParent || hasOwnQuote);
        }
      } else {
        const pu = blockedByParent ? 0 : getEffectiveConceptPU(node);
        const importe = blockedByParent ? 0 : getConceptImporte(node);
        const tdBorder = 'border: 1px solid #cbd5e1;';
        const blockedTitle = blockedByParent ? ' title="Incluido en el importe de la partida superior"' : '';
        const unselectedStyle = !forPrint && !isSelected ? 'opacity: 0.55; background-color: #f8fafc;' : 'background-color: #ffffff;';
        rowsHtml += `
          <tr style="${unselectedStyle} color: #0f172a;"${blockedTitle}>
            ${checkboxTd}
            <td style="${tdBorder} padding: 5px 5px; text-align: center; color: #64748b; font-size: ${fontSmall}; vertical-align: top;">${level}</td>
            <td style="${tdBorder} padding: 5px 7px; font-family: ${fontMono}; font-weight: 600; color: #334155; white-space: nowrap; vertical-align: top;">${escapeHtml(node.clave || '')}</td>
            <td style="${tdBorder} padding: 5px 8px; padding-left: ${8 + indentPx}px; color: #0f172a; line-height: 1.38; text-align: left; vertical-align: top; word-break: break-word;">${escapeHtml(node.descripcion || '')}</td>
            <td style="${tdBorder} padding: 5px 7px; text-align: right; font-family: ${fontMono}; color: #334155; white-space: nowrap; vertical-align: top;">${cantFormatted}</td>
            <td style="${tdBorder} padding: 5px 7px; text-align: center; color: #475569; white-space: nowrap; vertical-align: top;">${escapeHtml(unidadDisplay)}</td>
            <td style="${tdBorder} padding: 5px 7px; text-align: right; font-family: ${fontMono}; color: #334155; white-space: nowrap; vertical-align: top;">${blockedByParent ? '-' : formatMoney(pu)}</td>
            <td style="${tdBorder} padding: 5px 8px; text-align: right; font-family: ${fontMono}; font-weight: 700; color: #0f172a; white-space: nowrap; vertical-align: top;">${formatMoney(importe)}</td>
          </tr>
        `;
      }
    }
  }

  if (list.length === 0) {
    rowsHtml = `
      <tr style="background-color: #ffffff;">
        <td colspan="${forPrint ? 7 : 8}" style="border: 1px solid #cbd5e1; padding: 28px 16px; text-align: center; color: #64748b;">
          <i class="fa-solid fa-file-invoice-dollar" style="font-size: 24px; color: #cbd5e1; display: block; margin-bottom: 8px;"></i>
          <div style="font-weight: 600; color: #475569; font-size: 12px;">No hay partidas ni conceptos registrados en Alcances.</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Captura las partidas, conceptos y cotizaciones en la pestaña <strong>Alcances</strong>; aquí se mostrará el presupuesto al cliente.</div>
        </td>
      </tr>
    `;
  } else {
    walkClean(list, 1, false);
    if (forPrint && rowsHtml.trim() === '') {
      rowsHtml = `
        <tr style="background-color: #ffffff;">
          <td colspan="7" style="border: 1px solid #cbd5e1; padding: 28px 16px; text-align: center; color: #64748b;">
            <i class="fa-solid fa-print" style="font-size: 24px; color: #cbd5e1; display: block; margin-bottom: 8px;"></i>
            <div style="font-weight: 600; color: #475569; font-size: 12px;">No hay conceptos seleccionados para imprimir.</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Marca con las casillas al inicio de la tabla las partidas o conceptos que deseas incluir en la cotización.</div>
          </td>
        </tr>
      `;
    }
  }

  const thBase = `background-color: #0f172a !important; color: #ffffff !important; border: 1px solid #0f172a; font-weight: 700; text-transform: uppercase; font-size: ${fontHeader}; padding: 6px 8px; letter-spacing: 0.02em;`;
  const tableClass = forPrint ? 'report-table' : 'w-full min-w-[760px]';

  let totalLeafCount = 0;
  let selectedLeafCount = 0;
  function countLeaves(items) {
    for (const n of items) {
      if (isSubtituloNode(n)) {
        if (Array.isArray(n.children) && n.children.length > 0) {
          countLeaves(n.children);
        } else {
          totalLeafCount++;
          if (n.selected !== false) selectedLeafCount++;
        }
      } else {
        totalLeafCount++;
        if (n.selected !== false) selectedLeafCount++;
      }
    }
  }
  countLeaves(list);
  const allChecked = totalLeafCount > 0 && selectedLeafCount === totalLeafCount;

  const checkboxTh = !forPrint ? `
    <th style="${thBase} width: 36px; min-width: 36px; text-align: center; vertical-align: middle; padding: 6px 4px;">
      <input type="checkbox" id="presupuesto-select-all" ${allChecked ? 'checked' : ''} ${locked ? 'disabled' : ''}
             onchange="togglePresupuestoSelectAll(this.checked)"
             class="rounded text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5 align-middle disabled:opacity-50 disabled:cursor-not-allowed"
             title="Seleccionar o deseleccionar todos los conceptos para imprimir">
    </th>
  ` : '';

  return `
    <table class="${tableClass}" style="width: 100%; border-collapse: collapse; margin-top: 0; margin-bottom: ${forPrint ? '12px' : '0'}; font-size: ${fontBase}; background-color: #ffffff;">
      <thead>
        <tr>
          ${checkboxTh}
          <th style="${thBase} width: ${forPrint ? '32px' : '40px'}; text-align: center;">Niv</th>
          <th style="${thBase} width: ${forPrint ? '64px' : '82px'}; text-align: left;">Clave</th>
          <th style="${thBase} ${forPrint ? '' : 'min-width: 260px; '}text-align: left;">Descripción de Concepto</th>
          <th style="${thBase} width: ${forPrint ? '64px' : '84px'}; text-align: right;">Cant.</th>
          <th style="${thBase} width: ${forPrint ? '52px' : '64px'}; text-align: center;">Unid</th>
          <th style="${thBase} width: ${forPrint ? '92px' : '116px'}; text-align: right;">Precio Unit.</th>
          <th style="${thBase} width: ${forPrint ? '98px' : '124px'}; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

export function printPresupuestoCotizacion() {
  const tree = state.treeData || [];
  if (tree.length === 0) {
    showToast('No hay partidas o conceptos en el presupuesto para imprimir.', 'warning');
    return;
  }

  const cfg = getProjectPresupuestoConfig();
  const resumen = calcularResumenPresupuesto();

  if (resumen.totalConceptosSeleccionados === 0) {
    showToast('No hay conceptos seleccionados para imprimir. Marca al menos una casilla en la tabla.', 'warning');
    return;
  }

  const {
    companyName,
    companySubtitle,
    companyLogo,
    projectName,
    projectLocation
  } = resolveCompanyBranding();
  const currencyCode = getCurrencyCode();

  const fechaExp = formatIsoDateSpanish(cfg.fechaExpedicion);
  const fechaVen = formatIsoDateSpanish(computeFechaVencimiento(cfg.fechaExpedicion, cfg.vigenciaDias));

  const tableHtml = buildPresupuestoPrintTableHtml(tree, resumen, cfg, { forPrint: true });

  // Filas del Resumen Ejecutivo por Subtítulo (solo partidas con conceptos activos)
  const activeSubtitulos = resumen.subtitulosResumen.filter(item => item.conceptosCount > 0 || item.hasOwnQuote);
  const resumenRowsHtml = (activeSubtitulos.length > 0 ? activeSubtitulos : resumen.subtitulosResumen).map(item => `
    <tr>
      <td style="padding: 4px 7px; font-family: monospace; font-size: 7.5pt; color: #475569; border: 1px solid #cbd5e1; white-space: nowrap;">${escapeHtml(item.clave)}</td>
      <td style="padding: 4px 8px; font-weight: 600; font-size: 7.8pt; color: #0f172a; border: 1px solid #cbd5e1;">${escapeHtml(item.descripcion)}</td>
      <td style="padding: 4px 8px; text-align: right; font-family: monospace; font-weight: 700; font-size: 8pt; color: #0f172a; border: 1px solid #cbd5e1; white-space: nowrap;">${item.importe === 0 ? '—' : formatMoney(item.importe)}</td>
    </tr>
  `).join('');

  const notasList = Array.isArray(cfg.notas) ? cfg.notas.filter(n => String(n || '').trim()) : [];
  const notasHtml = notasList.length > 0
    ? notasList.map((n, idx) => `
      <tr>
        <td style="width: 24px; text-align: center; font-weight: 700; color: #334155; border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top;">${idx + 1}</td>
        <td style="color: #1e293b; border: 1px solid #cbd5e1; padding: 4px 8px; line-height: 1.38;">${escapeHtml(n)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="2" style="padding: 6px 8px; color: #64748b; border: 1px solid #cbd5e1;">Sin notas adicionales.</td></tr>`;

  const logoHtml = buildPrintLogoHtml(companyLogo, companyName);

  const bodyContent = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; gap: 16px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        ${logoHtml}
        <div>
          <div style="font-size: 11pt; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.03em;">${escapeHtml(companyName)}</div>
          <div style="font-size: 8pt; color: #475569; margin-bottom: 3px;">${escapeHtml(companySubtitle)}</div>
          <div style="font-size: 11pt; font-weight: 900; color: #1e3a8a; letter-spacing: 0.01em;">COTIZACIÓN DE SERVICIOS PROFESIONALES</div>
        </div>
      </div>
      <div style="text-align: right; font-size: 7.8pt; line-height: 1.45; min-width: 210px;">
        <div style="display: inline-block; background: #0f172a; color: #fff; font-weight: 700; padding: 2px 8px; border-radius: 4px; font-size: 7.5pt; margin-bottom: 4px;">
          ${escapeHtml(cfg.tipoCatalogo || 'Catálogo Original')} &bull; ${escapeHtml(cfg.revision || 'Revisión 01')}
        </div>
        <div><strong>Expedición:</strong> ${fechaExp}</div>
        <div><strong>Vigencia:</strong> ${Math.max(1, parseInt(cfg.vigenciaDias, 10) || 30)} días (hasta ${fechaVen})</div>
        <div><strong>Moneda:</strong> ${escapeHtml(currencyCode)}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 8pt;">
      <div>
        <div><strong style="color: #475569;">PROYECTO:</strong> <span style="font-weight: 700; color: #0f172a;">${escapeHtml(projectName)}</span></div>
        ${projectLocation ? `<div style="margin-top: 2px;"><strong style="color: #475569;">UBICACIÓN:</strong> ${escapeHtml(projectLocation)}</div>` : ''}
      </div>
      <div>
        <div><strong style="color: #475569;">CLIENTE:</strong> <span style="font-weight: 700; color: #0f172a;">${escapeHtml(cfg.clienteNombre || 'Por definir')}</span></div>
        <div style="margin-top: 2px;"><strong style="color: #475569;">SUPERFICIE REF.:</strong> ${formatNumber(cfg.superficieM2 || 0, 2)} m²</div>
      </div>
    </div>

    ${tableHtml}

    <!-- Bloque Resumen por Subtítulo y Totales -->
    <div style="display: grid; grid-template-columns: 1fr 1.25fr; gap: 14px; align-items: start; margin-top: 14px; page-break-inside: avoid; break-inside: avoid;">
      <div>
        <div style="font-size: 8pt; font-weight: 800; color: #0f172a; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.02em;">Notas y Condiciones Comerciales</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 7.4pt;">
          <tbody>
            ${notasHtml}
          </tbody>
        </table>
      </div>

      <div>
        <div style="font-size: 8pt; font-weight: 800; color: #0f172a; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.02em; text-align: right;">Resumen Ejecutivo por Partida</div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #e2e8f0; color: #0f172a; font-size: 7.2pt; font-weight: 700; text-transform: uppercase;">
              <th style="padding: 4px 7px; border: 1px solid #cbd5e1; text-align: left;">Clave</th>
              <th style="padding: 4px 8px; border: 1px solid #cbd5e1; text-align: left;">Partida / Subtítulo</th>
              <th style="padding: 4px 8px; border: 1px solid #cbd5e1; text-align: right;">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${resumenRowsHtml}
          </tbody>
        </table>

        <table style="width: 65%; margin-left: auto; margin-top: 8px; border-collapse: collapse; font-size: 8.5pt;">
          <tr>
            <td style="padding: 4px 8px; text-align: right; font-weight: 700; color: #334155;">SUBTOTAL</td>
            <td style="padding: 4px 8px; text-align: right; font-family: monospace; font-weight: 700; color: #0f172a; border-bottom: 1px solid #cbd5e1; width: 120px;">${formatMoney(resumen.subtotalVenta)}</td>
          </tr>
          ${resumen.aplicarIva ? `
            <tr>
              <td style="padding: 4px 8px; text-align: right; font-weight: 700; color: #334155;">IVA (${resumen.ivaPct}%)</td>
              <td style="padding: 4px 8px; text-align: right; font-family: monospace; font-weight: 700; color: #0f172a; border-bottom: 1px solid #cbd5e1;">+${formatMoney(resumen.montoIva)}</td>
            </tr>
          ` : ''}
          ${resumen.aplicarRetenciones && resumen.retencionIsrPct > 0 ? `
            <tr>
              <td style="padding: 4px 8px; text-align: right; font-weight: 700; color: #9f1239;">(-) Retención ISR (${resumen.retencionIsrPct}%)</td>
              <td style="padding: 4px 8px; text-align: right; font-family: monospace; font-weight: 700; color: #9f1239; border-bottom: 1px solid #cbd5e1;">-${formatMoney(resumen.montoRetIsr)}</td>
            </tr>
          ` : ''}
          ${resumen.aplicarRetenciones && resumen.retencionIvaPct > 0 ? `
            <tr>
              <td style="padding: 4px 8px; text-align: right; font-weight: 700; color: #9f1239;">(-) Retención IVA (${Number(resumen.retencionIvaPct).toFixed(2)}%)</td>
              <td style="padding: 4px 8px; text-align: right; font-family: monospace; font-weight: 700; color: #9f1239; border-bottom: 1px solid #cbd5e1;">-${formatMoney(resumen.montoRetIva)}</td>
            </tr>
          ` : ''}
          <tr style="background-color: #0f172a; color: #ffffff;">
            <td style="padding: 6px 8px; text-align: right; font-weight: 800; font-size: 9pt;">${resumen.aplicarRetenciones ? 'NETO A COBRAR' : 'GRAN TOTAL'}</td>
            <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: 800; font-size: 9.5pt;">${formatMoney(resumen.granTotal)}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="signatures-grid" style="grid-template-columns: repeat(2, 1fr); margin-top: 40px;">
      <div class="signature-box">
        <strong>${escapeHtml(companyName)}</strong>
        <span>Elaboró / Dirección de Proyecto</span>
      </div>
      <div class="signature-box">
        <strong>${escapeHtml(cfg.clienteNombre || 'Aceptación del Cliente')}</strong>
        <span>Autorización de Presupuesto y Alcances</span>
      </div>
    </div>
  `;

  openPrintWindow(`Cotización - ${projectName}`, bodyContent, 'portrait', { autoPrint: false });
}

// ---------------------------------------------------------------------------
// 2. Exportación a Excel (.xlsx)
// ---------------------------------------------------------------------------
export function exportPresupuestoExcel() {
  if (typeof window.XLSX === 'undefined') {
    showToast('La biblioteca de Excel (SheetJS) no está cargada.', 'error');
    return;
  }

  const tree = state.treeData || [];
  if (tree.length === 0) {
    showToast('No hay partidas o conceptos en el presupuesto para exportar.', 'warning');
    return;
  }

  const cfg = getProjectPresupuestoConfig();
  const resumen = calcularResumenPresupuesto();

  if (resumen.totalConceptosSeleccionados === 0) {
    showToast('No hay conceptos seleccionados para exportar. Marca al menos una casilla en la tabla.', 'warning');
    return;
  }

  const tarifaHr = Math.max(1, parseFloat(cfg.costoHoraHombrePromedio) || 380);
  const margenDecimal = resumen.margenPct / 100;

  const projectName = (state.settings && state.settings.projectName) || 'Proyecto';
  const companyName = (state.settings && state.settings.companyName) || 'Estudio de Arquitectura';
  const currencyCode = getCurrencyCode();
  const fechaVenc = computeFechaVencimiento(cfg.fechaExpedicion, cfg.vigenciaDias);

  // Hoja Única: Cotización / Presupuesto al Cliente
  const sheet1Rows = [
    [companyName.toUpperCase()],
    ['PRESUPUESTO Y COTIZACIÓN DE SERVICIOS PROFESIONALES'],
    [`Proyecto: ${projectName}`, '', `Cliente: ${cfg.clienteNombre || 'Por definir'}`, '', `Catálogo: ${cfg.tipoCatalogo || 'Catálogo Original'}`, `Revisión: ${cfg.revision || 'Revisión 01'}`],
    [`Fecha Expedición: ${cfg.fechaExpedicion || ''}`, '', `Vigencia: ${cfg.vigenciaDias || 30} días (hasta ${fechaVenc})`, '', `Moneda: ${currencyCode}`, `IVA: ${resumen.aplicarIva ? `${resumen.ivaPct}%` : 'No aplica'}`],
    [],
    ['NIV', 'CLAVE', 'DESCRIPCIÓN DE CONCEPTO', 'CANT.', 'UNID', 'PRECIO UNIT.', 'TOTAL']
  ];

  function hasAnySelectedChild(n) {
    if (!Array.isArray(n.children) || n.children.length === 0) return false;
    return n.children.some(c => (isSubtituloNode(c) ? hasAnySelectedChild(c) : c.selected !== false));
  }

  function isNodeEffectivelySelected(n) {
    if (isSubtituloNode(n)) {
      if (hasOwnCotizaciones(n)) return n.selected !== false;
      if (Array.isArray(n.children) && n.children.length > 0) {
        return hasAnySelectedChild(n);
      }
      return n.selected !== false;
    }
    return n.selected !== false;
  }

  function walkExport(nodes, level = 1, blockedByParent = false) {
    for (const node of nodes) {
      const isParent = isSubtituloNode(node);
      const isSelected = isNodeEffectivelySelected(node);
      if (!isSelected) {
        continue;
      }
      const hasOwnQuote = !blockedByParent && hasOwnCotizaciones(node);
      const cant = round2(node.cantidad || 0);
      const unid = isParent ? 'lote' : (node.unidad || 'pza');

      if (isParent) {
        const m = blockedByParent ? { importe: 0 } : computeNodeMetrics(node, tarifaHr, margenDecimal, { onlySelected: true });
        const descSuffix = (node.expanded === false && m.conceptosCount > 0) ? ` (${m.conceptosCount} AGRUPADOS)` : '';
        sheet1Rows.push([level, node.clave || '', ((node.descripcion || '').toUpperCase() + descSuffix), cant, unid, '-', m.importe]);
        if (node.expanded !== false) {
          walkExport(node.children || [], level + 1, blockedByParent || hasOwnQuote);
        }
      } else {
        const pu = blockedByParent ? 0 : getEffectiveConceptPU(node);
        const imp = blockedByParent ? 0 : getConceptImporte(node);
        sheet1Rows.push([level, node.clave || '', node.descripcion || '', cant, unid, blockedByParent ? '-' : pu, imp]);
      }
    }
  }
  walkExport(tree, 1, false);

  // Resumen por Subtítulo en Hoja 1 (solo partidas activas)
  sheet1Rows.push([]);
  sheet1Rows.push(['RESUMEN POR PARTIDA / SUBTÍTULO']);
  sheet1Rows.push(['CLAVE', 'PARTIDA / SUBTÍTULO', 'IMPORTE']);
  const activeExcelSubtitulos = resumen.subtitulosResumen.filter(s => s.conceptosCount > 0 || s.hasOwnQuote);
  (activeExcelSubtitulos.length > 0 ? activeExcelSubtitulos : resumen.subtitulosResumen).forEach(s => {
    sheet1Rows.push([s.clave, s.descripcion, s.importe]);
  });
  sheet1Rows.push([]);
  sheet1Rows.push(['', 'SUBTOTAL', resumen.subtotalVenta]);
  if (resumen.aplicarIva) {
    sheet1Rows.push(['', `IVA (${resumen.ivaPct}%)`, resumen.montoIva]);
  }
  if (resumen.aplicarRetenciones && resumen.retencionIsrPct > 0) {
    sheet1Rows.push(['', `(-) Retención ISR (${resumen.retencionIsrPct}%)`, -resumen.montoRetIsr]);
  }
  if (resumen.aplicarRetenciones && resumen.retencionIvaPct > 0) {
    sheet1Rows.push(['', `(-) Retención IVA (${Number(resumen.retencionIvaPct).toFixed(2)}%)`, -resumen.montoRetIva]);
  }
  sheet1Rows.push(['', resumen.aplicarRetenciones ? 'NETO A COBRAR' : 'GRAN TOTAL', resumen.granTotal]);

  // Notas en Hoja 1
  const notas = Array.isArray(cfg.notas) ? cfg.notas.filter(n => String(n || '').trim()) : [];
  if (notas.length > 0) {
    sheet1Rows.push([]);
    sheet1Rows.push(['NOTAS Y CONDICIONES COMERCIALES']);
    notas.forEach((n, idx) => sheet1Rows.push([idx + 1, n]));
  }

  const wb = window.XLSX.utils.book_new();
  const ws1 = window.XLSX.utils.aoa_to_sheet(sheet1Rows);
  ws1['!cols'] = [
    { wch: 6 }, { wch: 12 }, { wch: 56 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }
  ];
  window.XLSX.utils.book_append_sheet(wb, ws1, 'Presupuesto');

  const sanitizeFilePart = (str, sep = '_') => String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, sep)
    .replace(/^_+|_+$/g, '');
  const safeName = sanitizeFilePart(projectName, '_') || 'Proyecto';
  const safeRev = sanitizeFilePart(cfg.revision || 'Rev01', '') || 'Rev01';
  const filename = `Presupuesto_${safeName}_${safeRev}.xlsx`;
  window.XLSX.writeFile(wb, filename);
  showToast(`Excel descargado: ${filename}`, 'success');
}
