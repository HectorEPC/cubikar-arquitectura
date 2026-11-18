import { APU_WIDTH_KEY } from '../config/constants.js?v=20261117_cf25';

let isResizingApu = false;
let startResizeX = 0;
let startApuWidth = 480;

/**
 * Limita el ancho del panel lateral de Cotizaciones para garantizar que:
 * 1. La tabla principal de alcances mantenga un espacio mínimo cómodo (al menos 420px).
 * 2. El panel lateral no supere el 55% del ancho del contenedor ni 780px.
 * 3. Nunca empuje el panel fuera del borde derecho de la pantalla.
 * @param {number|string} desiredWidth
 * @param {number} containerWidth
 * @returns {number}
 */
export function clampApuWidth(desiredWidth, containerWidth) {
  const minW = 320;
  const minTableW = 420;
  const layoutOverhead = 64; // Padding (24px) + gap (24px) + resizer (16px)
  const currentContainerW = containerWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const safeAvailable = Math.max(minW, currentContainerW - minTableW - layoutOverhead);
  const maxCap = Math.max(minW, Math.min(780, Math.floor(currentContainerW * 0.55)));
  const maxW = Math.max(minW, Math.min(maxCap, safeAvailable));
  const val = typeof desiredWidth === 'number' ? desiredWidth : (parseInt(desiredWidth, 10) || 480);
  return Math.max(minW, Math.min(Math.round(val), maxW));
}

// Inicialización del divisor arrastrable entre el catálogo y el panel APU
export function initPanelResizer() {
  const resizer = document.getElementById('panel-resizer');
  const apuPanel = document.getElementById('apu-panel');
  const container = document.getElementById('view-alcances') || document.getElementById('view-cat');
  if (!resizer || !apuPanel || !container) return;

  // Restaurar ancho previo guardado en localStorage asegurando límites seguros
  const savedWidth = localStorage.getItem(APU_WIDTH_KEY);
  const containerW = container.clientWidth || window.innerWidth;
  const initialWidth = savedWidth ? parseInt(savedWidth, 10) : 480;
  if (!isNaN(initialWidth)) {
    const clamped = clampApuWidth(initialWidth, containerW);
    apuPanel.style.width = `${clamped}px`;
  }

  function startDrag(clientX) {
    isResizingApu = true;
    startResizeX = clientX;
    startApuWidth = apuPanel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizer.classList.add('bg-blue-600', 'ring-2', 'ring-blue-300');
  }

  function onDrag(clientX) {
    if (!isResizingApu) return;
    const dx = clientX - startResizeX;
    // Al arrastrar hacia la izquierda (dx < 0), el panel APU a la derecha crece
    const rawWidth = startApuWidth - dx;
    const containerWidth = container.clientWidth;
    const newWidth = clampApuWidth(rawWidth, containerWidth);
    apuPanel.style.width = `${newWidth}px`;
  }

  function endDrag() {
    if (!isResizingApu) return;
    isResizingApu = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    resizer.classList.remove('bg-blue-600', 'ring-2', 'ring-blue-300');
    const containerWidth = container.clientWidth;
    const finalWidth = clampApuWidth(apuPanel.offsetWidth, containerWidth);
    apuPanel.style.width = `${finalWidth}px`;
    localStorage.setItem(APU_WIDTH_KEY, finalWidth);
  }

  // Eventos de Mouse
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientX);

    function onMouseMove(e) {
      onDrag(e.clientX);
    }
    function onMouseUp() {
      endDrag();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  // Soporte para pantallas táctiles
  resizer.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length > 0) {
      startDrag(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isResizingApu && e.touches && e.touches.length > 0) {
      onDrag(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isResizingApu) endDrag();
  });

  // Ajustar responsivamente si el usuario redimensiona la ventana del navegador
  window.addEventListener('resize', () => {
    if (!apuPanel.classList.contains('hidden')) {
      const curContainerW = container.clientWidth || window.innerWidth;
      const curW = apuPanel.offsetWidth;
      const clamped = clampApuWidth(curW, curContainerW);
      if (clamped !== curW) {
        apuPanel.style.width = `${clamped}px`;
      }
    }
  });
}
