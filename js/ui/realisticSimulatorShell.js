// js/ui/realisticSimulatorShell.js
// Motor de Renderizado Fotorrealista para el Video-Simulador de cubikar Arquitectura
// Reproduce fielmente la interfaz oficial de cubikar Arquitectura:
// 1. Barra Lateral de Navegación (Rail Monday / Cubikar)
// 2. Encabezado Superior con Logotipo 1:1, Nombre de Empresa y las 5 Pestañas Maestras:
//    - ALCANCES (Tabla de Alcances de Proyecto Arquitectónico: Entregables, Planos, Ingenierías y Renders)
//    - PRESUPUESTO (Catálogo de Conceptos, Costo Directo y Precios Unitarios)
//    - SEGUIMIENTO (Compras, Egresos y Control Financiero)
//    - CALENDARIO (Diagrama de Gantt y Ruta Crítica)
//    - ESTIMACIONES (Generadores de Cobro y Estimaciones Periódicas)
// 3. Ventanas modales auténticas con diseño limpio, sin botones ni letras encimadas.

/**
 * Genera la vista fotorrealista de la Tabla de Alcances de Proyecto Arquitectónico
 */
export function getRealisticAlcancesTableHtml(options = {}) {
  const {
    highlightPartidaBtn = false,
    highlightDesc = false,
    highlightReorder = false,
    highlightResponsables = false
  } = options;

  return `
    <div class="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden m-2 text-slate-800 text-[11px]">
      
      <!-- Sub-encabezado: Proyecto y Ubicación -->
      <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 shrink-0">
            <i class="fa-solid fa-folder-tree text-indigo-600"></i> Proyecto:
          </span>
          <span class="font-bold text-xs text-slate-900 truncate">Residencial Palmas Norte (Proyecto Ejecutivo)</span>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <div class="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[10.5px] font-medium text-slate-700 shadow-2xs">
            <i class="fa-solid fa-location-dot text-rose-500 text-xs"></i>
            <span>Ciudad de México, CDMX</span>
          </div>

          <div id="mock-step4-responsables" class="flex items-center gap-1.5 bg-indigo-50/70 border border-indigo-200 rounded-lg px-2.5 py-1 text-[10.5px] font-semibold text-indigo-900 shadow-2xs ${highlightResponsables ? 'ring-2 ring-indigo-400 animate-pulse' : ''}">
            <i class="fa-solid fa-users text-indigo-600 text-xs"></i>
            <span>Equipo Asignado: 4</span>
          </div>
        </div>
      </div>

      <!-- Barra de Acciones Globales (Toolbar de Alcances) -->
      <div class="p-2 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0 text-[10.5px]">
        <div class="flex flex-wrap items-center gap-1.5">
          <button id="mock-step4-btn-partida" class="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition ${highlightPartidaBtn ? 'ring-2 ring-blue-400 animate-pulse' : ''}">
            <i class="fa-solid fa-plus text-[10px]"></i> + Agregar Partida
          </button>

          <div class="h-4 w-px bg-slate-300 mx-1"></div>

          <button class="bg-white text-slate-700 border border-slate-300 px-2 py-1 rounded-lg shadow-2xs hover:bg-slate-50">
            <i class="fa-solid fa-rotate-left text-[10px]"></i>
          </button>
          <button class="bg-white text-slate-700 border border-slate-300 px-2 py-1 rounded-lg shadow-2xs hover:bg-slate-50">
            <i class="fa-solid fa-rotate-right text-[10px]"></i>
          </button>

          <div class="h-4 w-px bg-slate-300 mx-1"></div>

          <button class="bg-white text-slate-700 border border-slate-300 px-2 py-1 rounded-lg shadow-2xs flex items-center gap-1 hover:bg-slate-50">
            <i class="fa-solid fa-copy text-blue-600 text-[10px]"></i> Copiar
          </button>
          <button class="bg-white text-slate-700 border border-slate-300 px-2 py-1 rounded-lg shadow-2xs flex items-center gap-1 hover:bg-slate-50">
            <i class="fa-solid fa-paste text-emerald-600 text-[10px]"></i> Pegar
          </button>

          <div class="h-4 w-px bg-slate-300 mx-1"></div>

          <div id="mock-step4-reorder" class="inline-flex rounded-lg border border-slate-300 overflow-hidden ${highlightReorder ? 'ring-2 ring-amber-400 animate-pulse' : ''}">
            <button class="bg-white text-slate-700 px-2 py-1 hover:bg-slate-100 border-r border-slate-300" title="Subir">
              <i class="fa-solid fa-arrow-up text-[10px]"></i>
            </button>
            <button class="bg-white text-slate-700 px-2 py-1 hover:bg-slate-100" title="Bajar">
              <i class="fa-solid fa-arrow-down text-[10px]"></i>
            </button>
          </div>

          <button id="mock-step17-btn-lock" class="bg-white text-slate-700 border border-slate-300 px-2 py-1 rounded-lg shadow-2xs hover:bg-slate-50" title="Bloquear edición">
            <i class="fa-solid fa-lock-open text-[10px] text-slate-600"></i>
          </button>
        </div>

        <div class="flex items-center gap-3">
          <span class="font-mono text-[10px] text-slate-600">
            Total Alcances: <strong class="text-emerald-700 text-xs font-bold">$277,000.00 MXN</strong>
          </span>
          <button class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs">
            <i class="fa-solid fa-print text-[10px]"></i> Imprimir Alcances
          </button>
        </div>
      </div>

      <!-- Tabla de Alcances y Entregables Arquitectónicos -->
      <div class="flex-1 overflow-auto bg-white min-h-0">
        <table class="w-full text-left border-collapse text-[10.5px]">
          <thead class="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200 text-[9.5px]">
            <tr>
              <th class="p-2 w-8 text-center"></th>
              <th class="p-2 w-8 text-center"><input type="checkbox" class="rounded scale-75"></th>
              <th class="p-2 w-14 text-center">Ítem</th>
              <th class="p-2 w-24">Clave</th>
              <th class="p-2 min-w-[260px]">Entregable / Descripción de Alcance Arquitectónico</th>
              <th class="p-2 w-20 text-right">Cantidad</th>
              <th class="p-2 w-16 text-center">Unidad</th>
              <th class="p-2 w-28 text-right">P.U. Base</th>
              <th class="p-2 w-32 text-right">Importe</th>
              <th class="p-2 w-24 text-center">Responsable</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-mono text-[10px]">
            
            <!-- Partida 01: Estudios Preliminares -->
            <tr class="bg-slate-200/80 font-sans font-bold text-slate-900">
              <td class="p-2 text-center"><i class="fa-solid fa-chevron-down text-[9px] text-slate-600"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center">1</td>
              <td class="p-2 text-blue-900">ALC-01</td>
              <td class="p-2 uppercase tracking-wide">01 ESTUDIOS PRELIMINARES Y TOPOGRAFÍA</td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-center"></td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-right font-bold text-blue-900 font-mono">$36,500.00</td>
              <td class="p-2 text-center font-sans text-[9px] text-slate-600">Topógrafo</td>
            </tr>

            <!-- Entregable 1.1 -->
            <tr class="hover:bg-slate-50 transition">
              <td class="p-2 text-center"><i class="fa-solid fa-grip-vertical text-slate-300 text-[9px]"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center text-slate-400">1.1</td>
              <td class="p-2 font-bold text-slate-700">TOP-001</td>
              <td class="p-2 font-sans text-slate-800">Levantamiento topográfico con estación total y plano de curvas de nivel</td>
              <td class="p-2 text-right font-bold">1.00</td>
              <td class="p-2 text-center text-slate-500 font-sans">lote</td>
              <td class="p-2 text-right">$12,500.00</td>
              <td class="p-2 text-right font-bold text-slate-900">$12,500.00</td>
              <td class="p-2 text-center font-sans text-[9px]"><span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-semibold">Arq. Torres</span></td>
            </tr>

            <!-- Partida 02: Proyecto Arquitectónico Ejecutivo -->
            <tr class="bg-slate-200/80 font-sans font-bold text-slate-900">
              <td class="p-2 text-center"><i class="fa-solid fa-chevron-down text-[9px] text-slate-600"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center">2</td>
              <td class="p-2 text-blue-900">ALC-02</td>
              <td class="p-2 uppercase tracking-wide">02 PROYECTO ARQUITECTÓNICO EJECUTIVO</td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-center"></td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-right font-bold text-blue-900 font-mono">$106,000.00</td>
              <td class="p-2 text-center font-sans text-[9px] text-slate-600">Proyectistas</td>
            </tr>

            <!-- Entregable 2.1 -->
            <tr class="hover:bg-slate-50 transition ${highlightDesc ? 'bg-amber-50/70 ring-1 ring-amber-400' : ''}">
              <td class="p-2 text-center"><i class="fa-solid fa-grip-vertical text-slate-300 text-[9px]"></i></td>
              <td class="p-2 text-center"><input type="checkbox" checked class="rounded scale-75 text-blue-600"></td>
              <td class="p-2 text-center text-slate-400">2.1</td>
              <td class="p-2 font-bold text-blue-700">ARQ-001</td>
              <td id="mock-step4-desc" class="p-2 font-sans font-medium text-slate-900">
                <span class="mock-type-value">Plantas arquitectónicas acotadas, amuebladas y con niveles de piso terminado</span>
              </td>
              <td class="p-2 text-right font-bold">8.00</td>
              <td class="p-2 text-center text-slate-500 font-sans">planos</td>
              <td class="p-2 text-right">$6,000.00</td>
              <td class="p-2 text-right font-bold text-emerald-700">$48,000.00</td>
              <td class="p-2 text-center font-sans text-[9px]"><span class="bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-semibold">Arq. Sofía</span></td>
            </tr>

            <!-- Partida 03: Criterios Estructurales e Ingenierías -->
            <tr class="bg-slate-200/80 font-sans font-bold text-slate-900">
              <td class="p-2 text-center"><i class="fa-solid fa-chevron-down text-[9px] text-slate-600"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center">3</td>
              <td class="p-2 text-blue-900">ALC-03</td>
              <td class="p-2 uppercase tracking-wide">03 CRITERIOS ESTRUCTURALES E INGENIERÍAS</td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-center"></td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-right font-bold text-blue-900 font-mono">$109,500.00</td>
              <td class="p-2 text-center font-sans text-[9px] text-slate-600">Ingeniería</td>
            </tr>

            <!-- Entregable 3.1 -->
            <tr class="hover:bg-slate-50 transition">
              <td class="p-2 text-center"><i class="fa-solid fa-grip-vertical text-slate-300 text-[9px]"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center text-slate-400">3.1</td>
              <td class="p-2 font-bold text-slate-700">ING-001</td>
              <td class="p-2 font-sans text-slate-800">Memoria de cálculo y planos estructurales con firma DRO y cédula</td>
              <td class="p-2 text-right font-bold">1.00</td>
              <td class="p-2 text-center text-slate-500 font-sans">juego</td>
              <td class="p-2 text-right">$55,000.00</td>
              <td class="p-2 text-right font-bold text-slate-900">$55,000.00</td>
              <td class="p-2 text-center font-sans text-[9px]"><span class="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-semibold">Ing. Rivas</span></td>
            </tr>

            <!-- Partida 04: Renders y Visualización 3D -->
            <tr class="bg-slate-200/80 font-sans font-bold text-slate-900">
              <td class="p-2 text-center"><i class="fa-solid fa-chevron-down text-[9px] text-slate-600"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center">4</td>
              <td class="p-2 text-blue-900">ALC-04</td>
              <td class="p-2 uppercase tracking-wide">04 RENDERS Y VISUALIZACIÓN FOTORREALISTA 3D</td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-center"></td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-right font-bold text-blue-900 font-mono">$25,000.00</td>
              <td class="p-2 text-center font-sans text-[9px] text-slate-600">Render 3D</td>
            </tr>

            <!-- Entregable 4.1 -->
            <tr class="hover:bg-slate-50 transition">
              <td class="p-2 text-center"><i class="fa-solid fa-grip-vertical text-slate-300 text-[9px]"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center text-slate-400">4.1</td>
              <td class="p-2 font-bold text-slate-700">REN-001</td>
              <td class="p-2 font-sans text-slate-800">Renders exteriores e interiores 4K fotorrealistas con iluminación natural</td>
              <td class="p-2 text-right font-bold">10.00</td>
              <td class="p-2 text-center text-slate-500 font-sans">imágenes</td>
              <td class="p-2 text-right">$2,500.00</td>
              <td class="p-2 text-right font-bold text-slate-900">$25,000.00</td>
              <td class="p-2 text-center font-sans text-[9px]"><span class="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">Arq. Luna</span></td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Genera la vista fotorrealista de la Tabla de Presupuesto Base y APU
 */
export function getRealisticBudgetTableHtml(options = {}) {
  const {
    highlightPartidaBtn = false,
    highlightDesc = false,
    highlightCells = false,
    highlightReorder = false,
    highlightColor = false,
    highlightApuBtn = false,
    showAiMenu = false
  } = options;

  return `
    <div class="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden m-2 text-slate-800 text-[11px]">
      
      <!-- Sub-encabezado: Catálogo Base y Explosión de Insumos -->
      <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-1.5 bg-slate-200/90 p-1 rounded-lg border border-slate-300">
          <button type="button" class="px-3 py-1 rounded-md text-[10.5px] font-bold bg-blue-600 text-white shadow-2xs flex items-center gap-1.5">
            <i class="fa-solid fa-list-check"></i> Catálogo Base (Presupuesto / APU)
          </button>
          <button type="button" id="mock-step9-tab-insumos" class="px-3 py-1 rounded-md text-[10.5px] font-semibold text-slate-700 hover:text-slate-950 flex items-center gap-1.5">
            <i class="fa-solid fa-boxes-stacked"></i> Explosión de Insumos
          </button>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
            <i class="fa-solid fa-file-signature text-blue-600"></i> Firmas Oficiales: 4
          </span>
        </div>
      </div>

      <!-- Barra de Acciones Globales (Toolbar del Presupuesto) -->
      <div class="p-2 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0 text-[10.5px]">
        <div class="flex flex-wrap items-center gap-1.5">
          <button id="mock-step5-btn-partida" class="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition ${highlightPartidaBtn ? 'ring-2 ring-blue-400 animate-pulse' : ''}">
            <i class="fa-solid fa-plus text-[10px]"></i> + Agregar Partida
          </button>

          <div class="h-4 w-px bg-slate-300 mx-1"></div>

          <button class="bg-white text-slate-700 border border-slate-300 px-2 py-1 rounded-lg shadow-2xs hover:bg-slate-50">
            <i class="fa-solid fa-rotate-left text-[10px]"></i>
          </button>
          <button class="bg-white text-slate-700 border border-slate-300 px-2 py-1 rounded-lg shadow-2xs hover:bg-slate-50">
            <i class="fa-solid fa-rotate-right text-[10px]"></i>
          </button>

          <div class="h-4 w-px bg-slate-300 mx-1"></div>

          <button class="bg-white text-slate-700 border border-slate-300 px-2 py-1 rounded-lg shadow-2xs flex items-center gap-1 hover:bg-slate-50">
            <i class="fa-solid fa-copy text-blue-600 text-[10px]"></i> Copiar
          </button>
          <button class="bg-white text-slate-700 border border-slate-300 px-2 py-1 rounded-lg shadow-2xs flex items-center gap-1 hover:bg-slate-50">
            <i class="fa-solid fa-paste text-emerald-600 text-[10px]"></i> Pegar
          </button>

          <div class="h-4 w-px bg-slate-300 mx-1"></div>

          <div id="mock-step5-reorder" class="inline-flex rounded-lg border border-slate-300 overflow-hidden ${highlightReorder ? 'ring-2 ring-amber-400 animate-pulse' : ''}">
            <button class="bg-white text-slate-700 px-2 py-1 hover:bg-slate-100 border-r border-slate-300">
              <i class="fa-solid fa-arrow-up text-[10px]"></i>
            </button>
            <button class="bg-white text-slate-700 px-2 py-1 hover:bg-slate-100">
              <i class="fa-solid fa-arrow-down text-[10px]"></i>
            </button>
          </div>

          <!-- Botón Dividido de Inteligencia Artificial (Google Grounding) -->
          <div class="relative inline-block ml-1">
            <div id="mock-step7-btn-ai" class="inline-flex items-center rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-xs ${highlightApuBtn ? 'ring-2 ring-indigo-400 animate-pulse' : ''}">
              <span class="px-2.5 py-1 font-bold flex items-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-wand-magic-sparkles text-[10px] text-amber-300"></i> Generar APU
              </span>
              <span class="px-1.5 py-1 border-l border-white/20 hover:bg-white/10 cursor-pointer">
                <i class="fa-solid fa-chevron-down text-[9px]"></i>
              </span>
            </div>

            ${showAiMenu ? `
              <!-- Menú Dividido de IA Flotante -->
              <div id="mock-step7-ai-menu" class="absolute left-0 top-full mt-2 z-40 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150 text-slate-800">
                <div class="px-3 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between bg-slate-50 border-b border-slate-200 text-slate-500">
                  <span>Generar matrices seleccionadas</span>
                  <span class="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">Plan Pro</span>
                </div>
                <div class="divide-y divide-slate-100 text-[11px]">
                  <!-- Opción 1: Solo Catálogo Local -->
                  <div class="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-slate-50 transition cursor-pointer">
                    <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs bg-emerald-100 text-emerald-700">
                      <i class="fa-solid fa-database text-[10px]"></i>
                    </span>
                    <span class="flex-1 min-w-0">
                      <span class="flex items-center justify-between gap-1">
                        <span class="font-bold text-[11px] leading-tight truncate">Catálogo Local</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shrink-0">Gratis</span>
                      </span>
                      <span class="block text-[10px] leading-snug mt-0.5 text-slate-500">Usa bases de datos importadas u oficiales.</span>
                    </span>
                  </div>

                  <!-- Opción 2: IA Rápida -->
                  <div class="w-full text-left px-3 py-2 flex items-start gap-2.5 bg-indigo-50/50 hover:bg-indigo-50 transition cursor-pointer">
                    <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs bg-indigo-100 text-indigo-700">
                      <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                    </span>
                    <span class="flex-1 min-w-0">
                      <span class="flex items-center justify-between gap-1">
                        <span class="font-bold text-[11px] leading-tight truncate">IA Rápida Gemini</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 shrink-0">Ilimitada</span>
                      </span>
                      <span class="block text-[10px] leading-snug mt-0.5 text-slate-500">Genera cuadrillas y rendimientos con Gemini Flash.</span>
                    </span>
                  </div>

                  <!-- Opción 3: Precios Web en Vivo (Google Search Grounding) -->
                  <div id="mock-step7-menu-web" class="w-full text-left px-3 py-2 flex items-start gap-2.5 bg-amber-50 hover:bg-amber-100/80 transition cursor-pointer ring-2 ring-amber-400 rounded-lg">
                    <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs bg-amber-100 text-amber-700">
                      <i class="fa-solid fa-globe text-[10px]"></i>
                    </span>
                    <span class="flex-1 min-w-0">
                      <span class="flex items-center justify-between gap-1">
                        <span class="font-bold text-[11px] leading-tight text-amber-950 truncate">Precios Web en Vivo (Google)</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800 shrink-0">200/200</span>
                      </span>
                      <span class="block text-[10px] leading-snug mt-0.5 text-amber-900">Investiga precios vigentes en internet hoy.</span>
                    </span>
                  </div>
                </div>
              </div>
            ` : ''}
          </div>

          <button id="mock-step10-btn-print" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs ml-1">
            <i class="fa-solid fa-print text-[10px]"></i> Imprimir Presupuesto
          </button>
        </div>

        <div class="flex items-center gap-3">
          <span class="font-mono text-[10px] text-slate-600">
            Total Presupuesto: <strong id="mock-step5-total" class="text-emerald-700 text-xs font-bold font-mono">$417,726.92 MXN</strong>
          </span>
        </div>
      </div>

      <!-- Tabla de Conceptos de Obra y Presupuesto Base -->
      <div class="flex-1 overflow-auto bg-white min-h-0">
        <table class="w-full text-left border-collapse text-[10.5px]">
          <thead class="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200 text-[9.5px]">
            <tr>
              <th class="p-2 w-8 text-center"></th>
              <th class="p-2 w-8 text-center"><input type="checkbox" class="rounded scale-75"></th>
              <th class="p-2 w-14 text-center">Ítem</th>
              <th class="p-2 w-24">Clave</th>
              <th class="p-2 min-w-[260px]">Descripción del Concepto de Obra</th>
              <th class="p-2 w-20 text-right">Cantidad</th>
              <th class="p-2 w-16 text-center">Unidad</th>
              <th class="p-2 w-28 text-right">P.U. Base</th>
              <th class="p-2 w-32 text-right">Importe</th>
              <th class="p-2 w-20 text-center">Matriz</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-mono text-[10px]">
            
            <!-- Partida 01: Preliminares -->
            <tr class="bg-slate-200/80 font-sans font-bold text-slate-900">
              <td class="p-2 text-center"><i class="fa-solid fa-chevron-down text-[9px] text-slate-600"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center">1</td>
              <td class="p-2 text-blue-900">PART-01</td>
              <td class="p-2 uppercase tracking-wide">01 PRELIMINARES Y TERRACERÍAS</td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-center"></td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-right font-bold text-blue-900 font-mono">$14,248.00</td>
              <td class="p-2 text-center"></td>
            </tr>

            <!-- Concepto 1.1 -->
            <tr class="hover:bg-slate-50 transition">
              <td class="p-2 text-center"><i class="fa-solid fa-grip-vertical text-slate-300 text-[9px]"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center text-slate-400">1.1</td>
              <td class="p-2 font-bold text-slate-700">PRE-001</td>
              <td class="p-2 font-sans text-slate-800">Limpieza y despalme de terreno natural espesor 20cm a máquina</td>
              <td class="p-2 text-right font-bold">450.00</td>
              <td class="p-2 text-center text-slate-500 font-sans">m2</td>
              <td class="p-2 text-right">$18.50</td>
              <td class="p-2 text-right font-bold text-slate-900">$8,325.00</td>
              <td class="p-2 text-center">
                <button class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[9px] hover:bg-blue-200 transition">APU</button>
              </td>
            </tr>

            <!-- Partida 02: Cimentación -->
            <tr class="bg-slate-200/80 font-sans font-bold text-slate-900">
              <td class="p-2 text-center"><i class="fa-solid fa-chevron-down text-[9px] text-slate-600"></i></td>
              <td class="p-2 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-2 text-center">2</td>
              <td class="p-2 text-blue-900">PART-02</td>
              <td class="p-2 uppercase tracking-wide">02 CIMENTACIÓN Y ESTRUCTURA</td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-center"></td>
              <td class="p-2 text-right"></td>
              <td class="p-2 text-right font-bold text-blue-900 font-mono">$403,478.92</td>
              <td class="p-2 text-center"></td>
            </tr>

            <!-- Concepto 2.1 (Zapata con APU activo) -->
            <tr class="hover:bg-slate-50 transition bg-blue-50/40">
              <td class="p-2 text-center"><i class="fa-solid fa-grip-vertical text-slate-300 text-[9px]"></i></td>
              <td class="p-2 text-center"><input type="checkbox" checked class="rounded scale-75 text-blue-600"></td>
              <td class="p-2 text-center text-slate-400">2.1</td>
              <td class="p-2 font-bold text-blue-700">CIM-001</td>
              <td class="p-2 font-sans font-semibold text-slate-900">Zapata aislada de concreto premezclado f'c=250 kg/cm2 con armado</td>
              <td class="p-2 text-right font-bold ${highlightCells ? 'bg-amber-100 ring-1 ring-amber-400' : ''}">64.00</td>
              <td class="p-2 text-center text-slate-500 font-sans">m3</td>
              <td class="p-2 text-right font-bold ${highlightCells ? 'bg-amber-100 ring-1 ring-amber-400' : ''}">$4,379.08</td>
              <td class="p-2 text-right font-bold text-emerald-700">$280,261.12</td>
              <td class="p-2 text-center">
                <button id="mock-step6-btn-apu" class="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-[9.5px] shadow-xs hover:bg-blue-500 transition flex items-center justify-center gap-1 mx-auto ${highlightApuBtn ? 'ring-2 ring-blue-400 animate-pulse' : ''}">
                  <i class="fa-solid fa-calculator text-[9px]"></i> APU
                </button>
              </td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Renderiza el Shell general del Área de Trabajo (Workspace)
 */
export function renderRealisticWorkspaceShell({
  activeTab = 'presupuesto',
  activeRail = '',
  mainContent = '',
  overlayModal = '',
  overlayModalWrapperId = '',
  overlayModalHidden = false,
  showChatDock = false,
  companyName = 'Constructora & Despacho del Valle S.A.',
  projectName = 'Residencial Palmas Norte'
} = {}) {
  const contentHtml = mainContent || (activeTab === 'alcances' ? getRealisticAlcancesTableHtml() : getRealisticBudgetTableHtml());

  return `
    <div class="w-full h-full flex flex-row bg-slate-900 text-slate-100 overflow-hidden font-sans select-none text-left">
      
      <!-- 1. BARRA LATERAL IZQUIERDA (Rail Monday / Cubikar) -->
      <aside class="w-14 min-w-[56px] bg-slate-950 border-r border-slate-800 flex flex-col items-center justify-between py-3 px-1.5 shrink-0 select-none">
        
        <!-- Iconos Superiores -->
        <div class="flex flex-col items-center gap-2.5 w-full">
          <!-- Logo Cubikar con punto institucional -->
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-500/25 ring-1 ring-white/20" title="cubikar Arquitectura">
            <i class="fa-solid fa-cube text-sm"></i>
          </div>

          <!-- Mis Proyectos -->
          <div class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer transition" title="Mis Proyectos">
            <i class="fa-solid fa-layer-group text-sm"></i>
          </div>

          <!-- Chat Contextual de Obra -->
          <div id="mock-step15-btn-chat" class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-400 hover:bg-slate-900 cursor-pointer relative transition ${activeRail === 'chat' || showChatDock ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40' : ''}" title="Chat Contextual de Obra">
            <i class="fa-solid fa-comments text-sm"></i>
            <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
          </div>

          <!-- Catálogo Maestro de Referencia -->
          <div id="mock-step8-btn-master" class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-amber-400 hover:bg-slate-900 cursor-pointer transition ${activeRail === 'master' ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40' : ''}" title="Catálogos Maestros y Tabuladores">
            <i class="fa-solid fa-book-bookmark text-sm"></i>
          </div>

          <!-- Importador Universal -->
          <div id="mock-step16-btn-import" class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:bg-slate-900 cursor-pointer transition ${activeRail === 'import' ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40' : ''}" title="Importar Opus, Neodata o Excel">
            <i class="fa-solid fa-cloud-arrow-up text-sm"></i>
          </div>
        </div>

        <!-- Iconos Inferiores -->
        <div class="flex flex-col items-center gap-2.5 w-full">
          <div id="mock-step17-profile" class="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer transition" title="Perfil Profesional">
            <i class="fa-solid fa-user-gear text-sm"></i>
          </div>
        </div>
      </aside>

      <!-- 2. ÁREA PRINCIPAL DE TRABAJO -->
      <div class="flex-1 flex flex-col overflow-hidden min-w-0 bg-slate-900">
        
        <!-- ENCABEZADO SUPERIOR: Logotipo, Despacho y las 5 Pestañas Maestras -->
        <header class="bg-slate-950 border-b border-slate-800 px-3.5 py-2 flex flex-col gap-1.5 shrink-0 shadow-md">
          
          <!-- Fila Superior: Marca cubikar Arquitectura, Despacho y Colaboradores -->
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                <i class="fa-solid fa-helmet-safety text-sm"></i>
              </div>
              <div class="truncate">
                <div class="flex items-center gap-1.5">
                  <span class="font-extrabold text-xs tracking-tight text-white flex items-center gap-0.5">
                    cubikar<span class="text-rose-500 font-black">.</span> <span class="font-bold text-slate-100">Arquitectura</span>
                  </span>
                  <span class="text-slate-500 text-[10px]">•</span>
                  <span class="text-[11px] font-semibold text-slate-300 truncate">${companyName}</span>
                </div>
                <span class="text-[9.5px] text-slate-400 font-mono block leading-tight">Tabla de Alcances • Cotizaciones • Presupuestos</span>
              </div>
            </div>

            <!-- Colaboradores y Badges -->
            <div class="flex items-center gap-2 shrink-0">
              <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-750 px-2.5 py-1 rounded-full text-[10px] text-slate-300">
                <div class="flex -space-x-1.5">
                  <span class="w-4 h-4 rounded-full bg-blue-600 text-[8px] flex items-center justify-center text-white font-bold ring-1 ring-slate-950">A</span>
                  <span class="w-4 h-4 rounded-full bg-emerald-600 text-[8px] flex items-center justify-center text-white font-bold ring-1 ring-slate-950">S</span>
                  <span class="w-4 h-4 rounded-full bg-amber-600 text-[8px] flex items-center justify-center text-white font-bold ring-1 ring-slate-950">J</span>
                </div>
                <span class="font-semibold text-slate-400 hidden sm:inline">Equipo (4)</span>
                <button id="mock-step3-btn-invite" class="ml-1 text-[9px] font-bold text-blue-400 hover:text-white bg-blue-600/30 hover:bg-blue-600 px-2 py-0.5 rounded transition cursor-pointer">
                  + Invitar
                </button>
              </div>

              <span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[9.5px] font-bold hidden sm:inline">
                FSR: 1.2693
              </span>
            </div>
          </div>

          <!-- Fila Inferior: 5 PESTAÑAS MAESTRAS DE CUBIKAR ARQUITECTURA -->
          <div class="flex items-center justify-between border-t border-slate-800/80 pt-1.5">
            <nav class="flex items-center gap-1 text-[10.5px] font-sans overflow-x-auto">
              <button id="mock-step4-tab-alcances" class="px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition ${activeTab === 'alcances' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-850'}">
                <i class="fa-solid fa-layer-group text-[9.5px]"></i> ALCANCES
              </button>
              <button id="mock-step5-tab-presupuesto" class="px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition ${activeTab === 'presupuesto' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-850'}">
                <i class="fa-solid fa-calculator text-[9.5px]"></i> PRESUPUESTO
              </button>
              <button id="mock-step13-tab-seguimiento" class="px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition ${activeTab === 'seguimiento' || activeTab === 'compras' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-850'}">
                <i class="fa-solid fa-bars-progress text-[9.5px]"></i> SEGUIMIENTO
              </button>
              <button id="mock-step11-tab-cal" class="px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition ${activeTab === 'calendario' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-850'}">
                <i class="fa-solid fa-calendar-days text-[9.5px]"></i> CALENDARIO
              </button>
              <button id="mock-step12-tab-est" class="px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition ${activeTab === 'estimaciones' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-850'}">
                <i class="fa-solid fa-file-invoice-dollar text-[9.5px]"></i> ESTIMACIONES
              </button>
            </nav>
          </div>
        </header>

        <!-- Contenido Central Dinámico del Espacio de Trabajo -->
        <div class="flex-1 flex overflow-hidden relative">
          
          ${contentHtml}

          <!-- Dock de Chat / Bitácora Contextual Lateral -->
          ${showChatDock ? `
            <div id="mock-step15-chat-dock" class="w-80 bg-slate-900 border-l border-slate-800 flex flex-col text-slate-100 text-xs shrink-0 shadow-2xl z-20">
              <div class="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-comments text-blue-400"></i>
                  <span class="font-bold text-white">Chat & Bitácora Contextual</span>
                </div>
                <span class="text-[9px] font-bold bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">En Línea</span>
              </div>

              <!-- Pestañas de Chat -->
              <div id="mock-step15-tabs" class="flex border-b border-slate-800 bg-slate-950/60 p-1 gap-1 text-[10.5px]">
                <button class="flex-1 py-1 rounded-lg bg-blue-600 text-white font-bold text-center">Canal Técnico</button>
                <button class="flex-1 py-1 rounded-lg text-slate-400 hover:text-white font-semibold text-center">Canal Financiero</button>
              </div>

              <!-- Mensajes -->
              <div class="flex-1 p-3 space-y-2.5 overflow-y-auto">
                <div class="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/60 space-y-1">
                  <div class="flex items-center justify-between">
                    <strong class="text-amber-300 font-bold text-[10px]">Arq. Sofía M.</strong>
                    <span class="text-[9px] text-slate-400">10:14 AM</span>
                  </div>
                  <p class="text-slate-200 text-[11px] leading-relaxed">Se autorizó la entrega final de planos ejecutivos para el viernes.</p>
                  <div id="mock-step15-partida-tag" class="mt-1 inline-block px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-600/40 text-[9px] font-mono">
                    Partida 02 • ARQ-001
                  </div>
                </div>

                <div class="bg-blue-950/40 p-2.5 rounded-xl border border-blue-500/30 space-y-1">
                  <div class="flex items-center justify-between">
                    <strong class="text-blue-300 font-bold text-[10px]">Ing. Residente</strong>
                    <span class="text-[9px] text-slate-400">Ahora</span>
                  </div>
                  <p class="text-slate-200 text-[11px] leading-relaxed">Enterado. Se actualizaron los volúmenes de cimentación en el APU.</p>
                </div>
              </div>

              <!-- Input con mención @ -->
              <div class="p-2.5 border-t border-slate-800 bg-slate-950 flex items-center gap-2">
                <div id="mock-step15-input" class="flex-1 p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-mono text-[10px]">
                  <span class="mock-type-value">@Carlos Revisar planos estructurales</span>
                </div>
                <button id="mock-step15-btn-print" class="px-2.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition" title="Exportar Minuta a PDF">
                  <i class="fa-solid fa-file-pdf text-xs"></i>
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Overlay Modal Auténtico Superpuesto -->
          ${overlayModal ? `
            <div ${overlayModalWrapperId ? `id="${overlayModalWrapperId}"` : ''} class="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 z-30 animate-in fade-in duration-150 ${overlayModalHidden ? 'hidden' : ''}" ${overlayModalHidden ? 'style="display: none;"' : ''}>
              ${overlayModal}
            </div>
          ` : ''}

        </div>
      </div>
    </div>
  `;
}

/**
 * Renderiza el Portal Principal de Proyectos de cubikar Arquitectura
 */
export function renderRealisticPortalShell({
  overlayModal = '',
  highlightModeBar = false,
  scopeMode = 'owned'
} = {}) {
  return `
    <div class="w-full h-full flex flex-col bg-slate-900 text-slate-100 overflow-hidden font-sans select-none text-left relative">
      
      <!-- Top Portal Navbar -->
      <header class="bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0 shadow-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
            <i class="fa-solid fa-cube text-base"></i>
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              <span class="font-extrabold text-base tracking-tight text-white flex items-center gap-0.5">
                cubikar<span class="text-rose-500 font-black">.</span> <span class="font-bold text-white">Arquitectura</span>
              </span>
            </div>
            <span class="text-[10px] text-slate-400 font-mono block">Tabla de Alcances • Cotizaciones • Presupuestos</span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <span class="px-3 py-1 rounded-full text-[10.5px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Plan Profesional (3 Proyectos Activos)
          </span>
          <button id="mock-step1-btn-new" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md shadow-blue-600/30 flex items-center gap-1.5 transition">
            <i class="fa-solid fa-plus text-[10px]"></i> + Nuevo Proyecto
          </button>
        </div>
      </header>

      <!-- Main Dashboard Grid -->
      <div class="flex-1 p-4 overflow-y-auto bg-slate-900">
        <div class="max-w-5xl mx-auto space-y-4">

          <!-- Barra de Modo de Trabajo -->
          <div id="mock-step2-mode-bar" class="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-2xl p-3 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 ${highlightModeBar ? 'ring-2 ring-blue-400' : ''}">
            <div class="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
              <div class="flex items-center gap-2 shrink-0">
                <div class="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-sm">
                  <i class="fa-solid fa-briefcase"></i>
                </div>
                <span class="text-xs font-bold text-white block">Modo de Trabajo:</span>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <div class="relative w-56 sm:w-64 min-w-0">
                  <select id="mock-step2-scope-select" class="w-full appearance-none bg-slate-950 border border-slate-700 hover:border-blue-500 text-white font-semibold text-xs rounded-xl pl-3 pr-8 py-2 transition outline-none cursor-pointer shadow-inner truncate">
                    <option value="owned" ${scopeMode === 'owned' ? 'selected' : ''}>📁 Mis proyectos (Obras Propias)</option>
                    <option value="invited" ${scopeMode === 'invited' ? 'selected' : ''}>👥 Arq. Carlos González (Invitado)</option>
                    <option value="all" ${scopeMode === 'all' ? 'selected' : ''}>🌐 Todos los proyectos</option>
                  </select>
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-blue-400">
                    <i class="fa-solid fa-chevron-down text-[10px]"></i>
                  </div>
                </div>

                <button type="button" id="mock-step2-btn-invite" class="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer border border-blue-400/30">
                  <i class="fa-solid fa-user-plus text-[10px]"></i>
                  <span class="whitespace-nowrap">Invitaciones</span>
                </button>
              </div>
            </div>

            <!-- Indicador visual del modo actual -->
            <div id="mock-step2-status-badge" class="shrink-0 flex items-center gap-2 text-xs">
              ${scopeMode === 'invited' ? `
                <div class="flex items-center gap-2 bg-slate-900/90 border border-indigo-500/40 px-3 py-1.5 rounded-xl shadow-inner text-xs">
                  <i class="fa-solid fa-user-check text-indigo-400"></i>
                  <span class="text-slate-300">Despacho Invitador: <strong class="text-white">Arq. Carlos González</strong></span>
                  <span class="text-indigo-300 font-mono text-[10px] bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/30 font-bold">Rol: Editor</span>
                </div>
              ` : `
                <div class="flex items-center gap-2 bg-slate-900/90 border border-amber-500/40 px-3 py-1.5 rounded-xl shadow-inner text-xs">
                  <i class="fa-solid fa-crown text-amber-400"></i>
                  <span class="text-slate-300">Membresía activa: <strong class="text-white">Plan Profesional</strong></span>
                  <span class="text-amber-300 font-mono text-[10px] bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30 font-bold">(3/5 obras)</span>
                </div>
              `}
            </div>
          </div>
          
          <div class="flex items-center justify-between pt-1">
            <h2 class="font-extrabold text-sm text-white flex items-center gap-2">
              <i class="fa-solid fa-building-user text-blue-500"></i> Proyectos de Arquitectura en Curso
            </h2>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-slate-400">Filtrar:</span>
              <span class="px-2.5 py-0.5 rounded-full bg-slate-800 text-white font-bold text-[10px]">Todos (3)</span>
            </div>
          </div>

          <!-- Project Cards Grid -->
          <div id="mock-step2-cards-owned" class="grid grid-cols-1 md:grid-cols-3 gap-3.5" ${scopeMode === 'invited' ? 'style="display: none;"' : ''}>
            
            <!-- Tarjeta 1: Residencial Palmas Norte -->
            <div class="bg-slate-850 border-2 border-blue-500/80 rounded-2xl p-4 shadow-xl flex flex-col justify-between relative overflow-hidden group">
              <div class="space-y-2.5">
                <div class="flex items-center justify-between">
                  <span class="px-2.5 py-0.5 rounded-full text-[9.5px] font-bold bg-blue-600/20 text-blue-300 border border-blue-500/30">Proyecto Ejecutivo</span>
                  <span class="text-[10.5px] text-emerald-400 font-mono font-bold">$417,726.92</span>
                </div>
                <h3 class="font-bold text-sm text-white group-hover:text-blue-400 transition">Residencial Palmas Norte</h3>
                <p class="text-[11px] text-slate-300 truncate">Constructora & Despacho del Valle S.A.</p>
                <div class="pt-1">
                  <div class="flex justify-between text-[9.5px] text-slate-400 mb-1">
                    <span>Avance General</span><span class="font-bold text-white">43.7%</span>
                  </div>
                  <div class="h-1.5 bg-slate-750 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" style="width: 43.7%;"></div>
                  </div>
                </div>
              </div>

              <div class="pt-3.5 mt-2.5 border-t border-slate-750 flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5">
                  <div class="flex -space-x-1.5">
                    <span class="w-5 h-5 rounded-full bg-blue-600 text-[9px] flex items-center justify-center text-white font-bold">C</span>
                    <span class="w-5 h-5 rounded-full bg-emerald-600 text-[9px] flex items-center justify-center text-white font-bold">S</span>
                  </div>
                  <button id="mock-step3-btn-invite" class="text-[10px] font-bold text-blue-400 hover:text-white bg-blue-600/30 hover:bg-blue-600 px-2 py-0.5 rounded transition cursor-pointer">
                    + Invitar
                  </button>
                </div>
                <button class="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10.5px] px-3 py-1 rounded-lg transition">Abrir</button>
              </div>
            </div>

            <!-- Tarjeta 2: Torre Reforma Corporativa -->
            <div class="bg-slate-850/80 border border-slate-750 rounded-2xl p-4 shadow-md flex flex-col justify-between opacity-85">
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="px-2.5 py-0.5 rounded-full text-[9.5px] font-bold bg-purple-600/20 text-purple-300 border border-purple-500/30">Vertical</span>
                  <span class="text-[10.5px] text-emerald-400 font-mono font-bold">$1,850,200.00</span>
                </div>
                <h3 class="font-bold text-xs text-white">Torre Reforma Corporativa</h3>
                <p class="text-[10.5px] text-slate-400 truncate">Inmobiliaria Metropolitana</p>
                <div class="pt-1">
                  <div class="h-1.5 bg-slate-750 rounded-full overflow-hidden">
                    <div class="h-full bg-purple-500 rounded-full" style="width: 20%;"></div>
                  </div>
                </div>
              </div>
              <div class="pt-3.5 mt-2.5 border-t border-slate-750">
                <button class="w-full bg-slate-750 text-slate-300 font-bold text-[10.5px] py-1 rounded-lg">Abrir Proyecto</button>
              </div>
            </div>

            <!-- Tarjeta 3: Complejo Residencial Bosques -->
            <div class="bg-slate-850/80 border border-slate-750 rounded-2xl p-4 shadow-md flex flex-col justify-between opacity-85">
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="px-2.5 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-600/20 text-amber-300 border border-amber-500/30">Anteproyecto</span>
                  <span class="text-[10.5px] text-emerald-400 font-mono font-bold">$920,400.00</span>
                </div>
                <h3 class="font-bold text-xs text-white">Complejo Residencial Bosques</h3>
                <p class="text-[10.5px] text-slate-400 truncate">Desarrollos Arquitectónicos</p>
                <div class="pt-1">
                  <div class="h-1.5 bg-slate-750 rounded-full overflow-hidden">
                    <div class="h-full bg-amber-500 rounded-full" style="width: 65%;"></div>
                  </div>
                </div>
              </div>
              <div class="pt-3.5 mt-2.5 border-t border-slate-750">
                <button class="w-full bg-slate-750 text-slate-300 font-bold text-[10.5px] py-1 rounded-lg">Abrir Proyecto</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Overlay Modal Auténtico Superpuesto -->
      ${overlayModal ? `
        <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 z-30 animate-in fade-in duration-150">
          ${overlayModal}
        </div>
      ` : ''}

    </div>
  `;
}

/**
 * Renderiza la escena visual de cada uno de los 17 módulos de cubikar Arquitectura
 */
export function renderModuleVisualScene(moduleId) {
  const container = document.getElementById('virtual-stage-dynamic-content');
  if (!container) return;

  switch (Number(moduleId)) {
    // MÓDULO 1: Crear Proyecto e Identidad
    case 1: {
      const modalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white p-4 flex justify-between items-center shrink-0 border-b border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                <i class="fa-solid fa-folder-plus text-sm"></i>
              </div>
              <div>
                <h3 class="font-bold text-sm tracking-wide text-white">Crear Nuevo Proyecto de Arquitectura</h3>
                <p class="text-[10px] text-slate-300">Asistente de configuración inicial en 2 pasos</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1 rounded transition"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <div class="bg-slate-100 border-b border-slate-200 px-5 py-2 flex items-center justify-between text-[11px] font-semibold shrink-0">
            <div class="flex items-center gap-1.5 text-blue-900 font-bold">
              <span class="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
              <span>1. Información del Despacho y Obra</span>
            </div>
            <i class="fa-solid fa-arrow-right text-slate-400 text-[10px]"></i>
            <div class="flex items-center gap-1.5 opacity-50">
              <span class="w-5 h-5 rounded-full bg-slate-400 text-white flex items-center justify-center text-[10px] font-bold">2</span>
              <span class="text-slate-600">2. Sobrecosto y Plantilla</span>
            </div>
          </div>

          <div class="p-4 space-y-3 overflow-y-auto max-h-[60vh] bg-white text-slate-800">
            <div>
              <label class="block font-bold text-slate-700 mb-1 text-[11px]">Logotipo del Despacho (1:1 Cuadrado)</label>
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400">
                  <i class="fa-solid fa-image text-lg"></i>
                </div>
                <div class="space-y-1 flex-1">
                  <span class="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-[10.5px] font-semibold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 shadow-2xs">
                    <i class="fa-solid fa-upload text-blue-600"></i> Subir Logotipo
                  </span>
                  <p class="text-[9.5px] text-slate-500">Formatos: PNG o JPG con recorte cuadrado 1:1.</p>
                </div>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1 text-[11px]">Nombre del Despacho o Empresa *</label>
              <div id="mock-step1-empresa" class="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold bg-white text-slate-900 shadow-2xs">
                <span class="mock-type-value">Constructora & Despacho del Valle S.A.</span>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1 text-[11px]">Nombre del Proyecto de Arquitectura *</label>
              <div id="mock-step1-obra" class="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold bg-white text-slate-900 shadow-2xs">
                <span class="mock-type-value">Residencial Palmas Norte (Proyecto Ejecutivo)</span>
              </div>
            </div>

            <div id="mock-step1-sobrecosto" class="border border-blue-200 rounded-xl p-3 bg-blue-50/60 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs">
                  <i class="fa-solid fa-calculator"></i>
                </div>
                <div>
                  <span class="font-bold text-slate-800 text-[11px] block">Factor de Sobrecosto Activo</span>
                  <span class="text-[10px] text-slate-600">Indirectos (12%) + Financiamiento (1.5%) + Utilidad (10%)</span>
                </div>
              </div>
              <span class="font-mono font-extrabold text-blue-700 text-xs bg-white px-2 py-1 rounded-lg border border-blue-200">1.2693 (+26.93%)</span>
            </div>
          </div>

          <div class="bg-slate-100 px-4 py-3 border-t border-slate-200 flex justify-between items-center shrink-0">
            <button class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold">Cancelar</button>
            <button id="mock-step1-btn-finish" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5">
              <i class="fa-solid fa-check text-[10px]"></i> Crear Proyecto
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticPortalShell({ overlayModal: modalHtml });
      break;
    }

    // MÓDULO 2: Modo de Trabajo (Propios vs Invitaciones)
    case 2: {
      container.innerHTML = renderRealisticPortalShell({ highlightModeBar: true, scopeMode: 'owned' });
      break;
    }

    // MÓDULO 3: Invitar Colaboradores y Permisos
    case 3: {
      const modalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-4 flex justify-between items-center shrink-0 border-b border-slate-800">
            <div class="min-w-0 pr-3">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400 text-xs">
                  <i class="fa-solid fa-users-gear"></i>
                </span>
                <h3 class="font-bold text-sm text-white">Invitaciones al Despacho y Proyecto</h3>
                <span class="text-[9.5px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">Plan Pro</span>
              </div>
              <p class="text-[10.5px] text-slate-300 mt-1">Suma proyectistas, dibujantes o calculistas con permisos controlados.</p>
            </div>
            <button class="text-slate-400 hover:text-white p-1 rounded"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <div class="p-4 space-y-3.5 bg-white text-slate-800">
            <div>
              <label class="block font-bold text-slate-700 mb-1 text-[11px]">Correo Electrónico del Invitado *</label>
              <div id="mock-step3-email" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono font-semibold text-slate-900 shadow-2xs">
                <span class="mock-type-value">arq.sofia@constructora.com</span>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1 text-[11px]">Rol de Trabajo en cubikar Arquitectura:</label>
              <div id="mock-step3-roles" class="grid grid-cols-3 gap-2.5">
                <div class="p-2.5 rounded-xl bg-blue-50 border-2 border-blue-600 text-center shadow-xs cursor-pointer">
                  <strong class="text-blue-900 block text-[11px] font-bold">Editar</strong>
                  <span class="text-[9px] text-blue-700">Control Total</span>
                </div>
                <div class="p-2.5 rounded-xl bg-white border border-slate-200 text-center cursor-pointer hover:bg-slate-50">
                  <strong class="text-slate-800 block text-[11px] font-bold">Escribir</strong>
                  <span class="text-[9px] text-slate-500">Solo Captura</span>
                </div>
                <div class="p-2.5 rounded-xl bg-white border border-slate-200 text-center cursor-pointer hover:bg-slate-50">
                  <strong class="text-slate-800 block text-[11px] font-bold">Leer</strong>
                  <span class="text-[9px] text-slate-500">Solo Consulta</span>
                </div>
              </div>
            </div>

            <div id="mock-step3-tabs" class="pt-1">
              <label class="block font-bold text-slate-700 mb-1 text-[11px]">Permisos por Pestaña de Trabajo:</label>
              <div class="flex flex-wrap gap-2 text-[10.5px]">
                <span class="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold border border-blue-300 flex items-center gap-1 cursor-pointer">
                  <i class="fa-solid fa-check text-[9px]"></i> ALCANCES
                </span>
                <span class="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold border border-blue-300 flex items-center gap-1 cursor-pointer">
                  <i class="fa-solid fa-check text-[9px]"></i> PRESUPUESTO
                </span>
                <span class="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold border border-blue-300 flex items-center gap-1 cursor-pointer">
                  <i class="fa-solid fa-check text-[9px]"></i> SEGUIMIENTO
                </span>
                <span class="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 font-semibold border border-slate-300 flex items-center gap-1 cursor-pointer">
                  CALENDARIO
                </span>
              </div>
            </div>
          </div>

          <div class="bg-slate-100 px-4 py-3 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold">Cancelar</button>
            <button id="mock-step3-btn-add" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5">
              <i class="fa-solid fa-paper-plane text-[10px]"></i> Enviar Invitación
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticPortalShell({ overlayModal: modalHtml });
      break;
    }

    // MÓDULO 4: Tabla de Alcances de Proyecto Arquitectónico
    case 4: {
      container.innerHTML = renderRealisticWorkspaceShell({
        activeTab: 'alcances',
        mainContent: getRealisticAlcancesTableHtml({
          highlightPartidaBtn: true,
          highlightDesc: true,
          highlightReorder: true,
          highlightResponsables: true
        })
      });
      break;
    }

    // MÓDULO 5: Catálogo de Conceptos y Presupuesto Base
    case 5: {
      container.innerHTML = renderRealisticWorkspaceShell({
        activeTab: 'presupuesto',
        mainContent: getRealisticBudgetTableHtml({
          highlightPartidaBtn: true,
          highlightCells: true,
          highlightReorder: true,
          highlightColor: true
        })
      });
      break;
    }

    // MÓDULO 6: Análisis de Precios Unitarios (APU)
    case 6: {
      const apuPanelHtml = `
        <div class="flex-1 flex overflow-hidden">
          <div class="flex-1 overflow-hidden hidden md:flex">
            ${getRealisticBudgetTableHtml({ highlightApuBtn: true })}
          </div>

          <div id="mock-step6-apu-panel" class="w-full md:w-[480px] bg-white border-l border-slate-200 flex flex-col text-slate-800 text-[11px] shrink-0 overflow-hidden shadow-2xl">
            <div class="p-3 bg-slate-900 text-white rounded-t-lg flex justify-between items-center shrink-0">
              <div class="overflow-hidden pr-2">
                <div class="flex items-center gap-2">
                  <span class="bg-amber-400 text-slate-950 font-bold text-[9.5px] px-1.5 py-0.5 rounded font-mono">CIM-001</span>
                  <h2 class="font-bold text-xs text-white truncate">Matriz de Precio Unitario (APU)</h2>
                </div>
                <p class="text-[10px] text-slate-300 mt-0.5 truncate">Zapata aislada de concreto premezclado f'c=250 kg/cm2 (m3)</p>
              </div>
              <button class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-sm"></i></button>
            </div>

            <div class="flex-1 overflow-auto p-3 space-y-3">
              <div class="flex justify-between items-center border-b border-slate-200 pb-1.5">
                <span class="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <i class="fa-solid fa-calculator text-blue-600"></i> ANÁLISIS DE COSTO UNITARIO
                </span>
                <span class="bg-indigo-600 text-white text-[9.5px] px-2 py-0.5 rounded font-bold">4 Rubros</span>
              </div>

              <!-- 4 Rubros APU -->
              <div class="grid grid-cols-2 gap-2 text-[10.5px]">
                <div id="mock-step6-mat" class="bg-blue-50 border border-blue-200 p-2 rounded-lg">
                  <div class="text-blue-800 font-bold text-[10px] flex items-center gap-1"><i class="fa-solid fa-cubes"></i> Materiales</div>
                  <span class="font-bold font-mono text-slate-900 mt-0.5 block">$2,450.00 / m3</span>
                </div>
                <div id="mock-step6-mo" class="bg-amber-50 border border-amber-200 p-2 rounded-lg">
                  <div class="text-amber-800 font-bold text-[10px] flex items-center gap-1"><i class="fa-solid fa-hard-hat"></i> Mano de Obra (FASAR)</div>
                  <span class="font-bold font-mono text-slate-900 mt-0.5 block">$680.00 / m3</span>
                </div>
                <div id="mock-step6-eq" class="bg-purple-50 border border-purple-200 p-2 rounded-lg">
                  <div class="text-purple-800 font-bold text-[10px] flex items-center gap-1"><i class="fa-solid fa-screwdriver-wrench"></i> Equipo y Herramienta</div>
                  <span class="font-bold font-mono text-slate-900 mt-0.5 block">$320.00 / m3</span>
                </div>
                <div class="bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                  <div class="text-emerald-800 font-bold text-[10px] flex items-center gap-1"><i class="fa-solid fa-file-signature"></i> Subcontratos</div>
                  <span class="font-bold font-mono text-slate-900 mt-0.5 block">$0.00</span>
                </div>
              </div>

              <!-- Resumen de Costo Directo y Precio de Venta -->
              <div id="mock-step6-total" class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 font-mono text-[10.5px]">
                <div class="flex justify-between text-slate-600">
                  <span>Costo Directo (CD):</span>
                  <span class="font-bold text-slate-900">$3,450.00</span>
                </div>
                <div class="flex justify-between text-blue-700 font-semibold">
                  <span>(+) Factor de Sobrecosto (+26.93%):</span>
                  <span>+$929.08</span>
                </div>
                <div class="flex justify-between text-xs font-extrabold text-emerald-700 border-t border-slate-200 pt-1.5">
                  <span class="font-sans">PRECIO UNITARIO FINAL (PU):</span>
                  <span>$4,379.08 / m3</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'presupuesto', mainContent: apuPanelHtml });
      break;
    }

    // MÓDULO 7: Inteligencia Artificial y Google Search Grounding
    case 7: {
      const tableWithAiMenu = getRealisticBudgetTableHtml({ showAiMenu: true });
      const aiModalCardHtml = `
        <div id="mock-step7-modal-card" class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white px-4 py-3 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                <i class="fa-brands fa-google text-sm"></i>
              </div>
              <div>
                <h3 class="font-bold text-xs text-white">Google Search Grounding para APU</h3>
                <span class="text-[10px] text-blue-200">Cotización de insumos reales en el mercado hoy</span>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <div class="p-4 space-y-3 bg-white text-slate-800">
            <div id="mock-step7-concept-card" class="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1 ring-2 ring-blue-400">
              <div class="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>02 Cimentación &gt; Zapatas</span>
                <span class="bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded text-[9px]">CIM-001</span>
              </div>
              <p class="font-bold text-slate-900 text-xs">Zapata aislada de concreto premezclado f'c=250 kg/cm2</p>
            </div>

            <div id="mock-step7-grounding-toggle" class="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-300 rounded-xl cursor-pointer ring-2 ring-amber-400">
              <input type="checkbox" checked readonly class="mt-0.5 w-4 h-4 rounded text-amber-600">
              <div>
                <span class="text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                  <i class="fa-solid fa-globe text-amber-600"></i> Google Search Grounding Activado
                </span>
                <p class="text-[10px] text-amber-900 mt-0.5">Conectado a Home Depot México, Construrama y Cemex.</p>
              </div>
            </div>
          </div>

          <div class="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button class="px-3.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold">Cancelar</button>
            <button id="mock-step7-btn-run" class="px-4 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-lg font-bold text-xs shadow-md shadow-amber-600/30 flex items-center gap-1.5">
              <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i> Cotizar en Web y Llenar Matriz
            </button>
          </div>
        </div>
      `;

      container.innerHTML = renderRealisticWorkspaceShell({
        activeTab: 'presupuesto',
        mainContent: tableWithAiMenu,
        overlayModal: aiModalCardHtml,
        overlayModalWrapperId: 'mock-step7-modal-overlay',
        overlayModalHidden: true
      });
      break;
    }

    // MÓDULO 8: Catálogos Maestros y de Referencia
    case 8: {
      const masterModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <div class="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center text-sm font-bold shadow-sm">
                <i class="fa-solid fa-book-bookmark"></i>
              </div>
              <div>
                <h2 class="font-bold text-sm text-white">Catálogo Maestro y Biblioteca de Referencia</h2>
                <span class="text-[10px] text-slate-300">61,420 conceptos precargados con matrices completas</span>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <div class="p-4 space-y-3 flex-1 flex flex-col bg-white">
            <div class="relative bg-slate-50 p-2 rounded-xl border border-slate-200 shrink-0">
              <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <div id="mock-step8-search" class="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono text-slate-800 shadow-2xs">
                <span class="mock-type-value">Zapata corrida concreto f'c=250</span>
              </div>
            </div>

            <div class="flex-1 flex gap-3 overflow-hidden border border-slate-200 rounded-xl">
              <div id="mock-step8-specialties" class="w-40 bg-slate-50 border-r border-slate-200 p-2.5 space-y-1 text-[10.5px] shrink-0 font-medium">
                <div class="p-2 rounded-lg bg-blue-600 text-white font-bold flex justify-between cursor-pointer">
                  <span>Edificación</span><span class="font-mono text-[9px]">18.4k</span>
                </div>
                <div class="p-2 rounded-lg hover:bg-slate-200 text-slate-700 flex justify-between cursor-pointer">
                  <span>Instalaciones</span><span class="font-mono text-[9px]">14.1k</span>
                </div>
                <div class="p-2 rounded-lg hover:bg-slate-200 text-slate-700 flex justify-between cursor-pointer">
                  <span>Infraestructura</span><span class="font-mono text-[9px]">12.8k</span>
                </div>
              </div>

              <div id="mock-step8-preview" class="flex-1 p-3 space-y-2 overflow-y-auto bg-white text-[11px]">
                <div class="p-3 border border-blue-200 rounded-xl bg-blue-50/50 space-y-2">
                  <div class="flex justify-between items-center font-mono font-bold">
                    <span class="text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">CIM-REF-421</span>
                    <span class="text-emerald-700 font-extrabold text-xs">$3,980.50 / m3</span>
                  </div>
                  <p class="font-sans font-medium text-slate-800 leading-snug">Zapata corrida de concreto premezclado f'c=250 kg/cm2, incluye cimbra acabado común y acero.</p>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-slate-100 px-4 py-2.5 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold">Cerrar</button>
            <button id="mock-step8-btn-insert" class="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-plus text-[10px]"></i> Insertar al Presupuesto
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeRail: 'master', overlayModal: masterModalHtml });
      break;
    }

    // MÓDULO 9: Explosión y Consolidado de Insumos Generales
    case 9: {
      const insumosContentHtml = `
        <div class="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden m-2 text-slate-800 text-[11px]">
          <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div id="mock-step9-filters" class="flex items-center gap-1.5 text-[10.5px]">
              <span class="px-3 py-1 rounded-full bg-blue-600 text-white font-bold cursor-pointer">Materiales (48)</span>
              <span class="px-3 py-1 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 font-medium cursor-pointer">Mano de Obra (8)</span>
              <span class="px-3 py-1 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 font-medium cursor-pointer">Maquinaria (6)</span>
            </div>

            <button id="mock-step9-btn-unify" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10.5px] px-3 py-1 rounded-lg flex items-center gap-1.5 shadow-xs">
              <i class="fa-solid fa-object-group text-[10px]"></i> Unificar Insumos
            </button>
          </div>

          <div id="mock-step9-cascade" class="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-amber-950 text-[10.5px] flex items-center justify-between font-medium">
            <span><i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1.5"></i> Recálculo en cascada activo: cambiar el costo unitario aquí actualiza todas las matrices del presupuesto.</span>
            <span class="text-amber-900 font-bold font-mono">6 Matrices Vinculadas</span>
          </div>

          <div class="flex-1 overflow-auto bg-white min-h-0">
            <table class="w-full text-left border-collapse text-[10.5px]">
              <thead class="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200 text-[9.5px]">
                <tr>
                  <th class="p-2 w-24">Clave</th>
                  <th class="p-2 min-w-[260px]">Descripción del Insumo Consolidado</th>
                  <th class="p-2 w-20 text-center">Unidad</th>
                  <th class="p-2 w-24 text-right">Cantidad Total</th>
                  <th class="p-2 w-32 text-right">Costo Unitario</th>
                  <th class="p-2 w-32 text-right">Importe Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-mono text-[10px]">
                <tr class="bg-blue-50/50">
                  <td class="p-2 font-bold text-slate-800">MAT-001</td>
                  <td class="p-2 font-sans font-medium text-slate-900">Cemento Gris Monterrey Tipo CPC 30R</td>
                  <td class="p-2 text-center text-slate-600 font-sans">Ton</td>
                  <td class="p-2 text-right font-bold">18.50</td>
                  <td class="p-2 text-right" id="mock-step9-price-cell">
                    <span class="p-1.5 rounded-lg bg-amber-100 text-amber-950 font-bold ring-2 ring-amber-400 mock-type-value">$3,850.00 / Ton</span>
                  </td>
                  <td class="p-2 text-right text-emerald-700 font-bold">$71,225.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'presupuesto', mainContent: insumosContentHtml });
      break;
    }

    // MÓDULO 10: Reportes e Impresión Oficial en PDF
    case 10: {
      const printModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <div class="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 text-sm">
                <i class="fa-solid fa-file-signature"></i>
              </div>
              <div>
                <h3 class="font-bold text-sm text-white">Reportes Oficiales e Impresión en PDF</h3>
                <p class="text-[10px] text-slate-300">Membrete oficial, firmas autorizadas y carátula ejecutiva</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <div class="p-4 space-y-3.5 bg-white text-slate-800">
            <div id="mock-step10-formats" class="grid grid-cols-3 gap-2.5">
              <div class="p-2.5 rounded-xl bg-blue-50 border-2 border-blue-600 text-center shadow-xs cursor-pointer">
                <strong class="text-blue-900 block text-[11px]">Tabla de Alcances</strong>
                <span class="text-[9px] text-blue-700">Entregables y Planos</span>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center cursor-pointer hover:bg-slate-100">
                <strong class="text-slate-800 block text-[11px]">Presupuesto Base</strong>
                <span class="text-[9px] text-slate-500">Catálogo Oficial</span>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center cursor-pointer hover:bg-slate-100">
                <strong class="text-slate-800 block text-[11px]">Fichas de APU</strong>
                <span class="text-[9px] text-slate-500">Matrices de Costo</span>
              </div>
            </div>

            <div id="mock-step10-signatures" class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span class="text-slate-700 font-bold block text-[11px]">Firmas Responsables Configuradas (Membrete 1:1):</span>
              <div class="grid grid-cols-2 gap-2 text-[10px]">
                <div class="p-2 rounded bg-white border border-slate-200">
                  <strong class="text-slate-500 block text-[9px]">Elaboró:</strong>
                  <span class="font-bold text-slate-800">Arq. Proyectista</span>
                </div>
                <div class="p-2 rounded bg-white border border-slate-200">
                  <strong class="text-slate-500 block text-[9px]">Revisó:</strong>
                  <span class="font-bold text-slate-800">Coordinador de Proyecto</span>
                </div>
                <div class="p-2 rounded bg-white border border-slate-200">
                  <strong class="text-slate-500 block text-[9px]">Aprobó:</strong>
                  <span class="font-bold text-slate-800">Director DRO</span>
                </div>
                <div class="p-2 rounded bg-white border border-slate-200">
                  <strong class="text-slate-500 block text-[9px]">Autorizó:</strong>
                  <span class="font-bold text-slate-800">Cliente / Inversionista</span>
                </div>
              </div>
            </div>

            <div id="mock-step10-preview" class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-[10.5px]">
              <span class="text-slate-700 font-medium flex items-center gap-2">
                <i class="fa-solid fa-file-pdf text-rose-600 text-sm"></i> Vista Previa Vectorial Lista (4 Hojas con Logotipo Oficial)
              </span>
              <span class="text-emerald-700 font-mono font-bold text-xs">$417,726.92 MXN</span>
            </div>
          </div>

          <div class="bg-slate-100 px-4 py-3 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold">Cerrar</button>
            <button id="mock-step10-btn-download" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-download text-[10px]"></i> Descargar PDF Oficial
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'presupuesto', overlayModal: printModalHtml });
      break;
    }

    // MÓDULO 11: Calendario de Obra y Diagrama de Gantt
    case 11: {
      const calContentHtml = `
        <div class="flex-1 bg-slate-900 text-slate-100 flex flex-col overflow-hidden p-3 gap-3 text-xs">
          <div class="flex items-center justify-between pb-1 shrink-0 flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <button id="mock-step11-btn-ai" class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold text-xs shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-wand-magic-sparkles text-amber-300 text-[10px]"></i> Asistente de Duraciones
              </button>
              <button id="mock-step11-critical" class="px-3 py-1.5 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center gap-1.5">
                <i class="fa-solid fa-route text-rose-400 text-[10px]"></i> Ruta Crítica Activa
              </button>
            </div>
            <span id="mock-step11-financial" class="text-[10.5px] text-slate-300 font-mono">Calendario Financiero: 180 Días Programados</span>
          </div>

          <div id="mock-step11-gantt-bars" class="flex-1 bg-slate-850 border border-slate-750 rounded-xl p-3 flex flex-col gap-2.5 overflow-hidden">
            <div class="flex justify-between text-[10px] font-mono text-slate-400 border-b border-slate-750 pb-1.5">
              <span class="w-44">Entregable / Fase</span>
              <span class="flex-1 flex justify-around"><span>Mes 1</span><span>Mes 2</span><span>Mes 3</span><span>Mes 4</span></span>
            </div>
            <div class="space-y-2.5 text-[10px]">
              <div class="flex items-center gap-2">
                <span class="w-44 font-bold text-white truncate">01 Anteproyecto & Planos</span>
                <div class="flex-1 bg-slate-800 h-6 rounded-lg relative overflow-hidden">
                  <div class="absolute left-0 w-1/4 h-full bg-blue-500 rounded-lg flex items-center px-2 text-[9.5px] font-bold text-white">30 Días</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="w-44 font-bold text-rose-300 truncate">02 Ingenierías & Estructuras</span>
                <div class="flex-1 bg-slate-800 h-6 rounded-lg relative overflow-hidden">
                  <div class="absolute left-[25%] w-[35%] h-full bg-rose-600 rounded-lg flex items-center px-2 text-[9.5px] font-bold text-white shadow-sm ring-1 ring-rose-400">45 Días (Ruta Crítica)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'calendario', mainContent: calContentHtml });
      break;
    }

    // MÓDULO 12: Estimaciones y Generadores de Cobro
    case 12: {
      const estContentHtml = `
        <div class="flex-1 bg-slate-900 text-slate-100 flex flex-col overflow-hidden p-3 gap-3 text-xs">
          <div class="flex items-center justify-between pb-1 shrink-0">
            <button id="mock-step12-btn-new" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/30 flex items-center gap-1.5">
              <i class="fa-solid fa-plus text-[10px]"></i> + Generar Estimación #01
            </button>
            <span class="text-[10.5px] text-slate-300 font-mono">Periodo de Corte: Quincena 01</span>
          </div>

          <div class="flex-1 flex gap-3 overflow-hidden">
            <div id="mock-step12-inputs" class="flex-1 bg-slate-850 border border-slate-750 rounded-xl p-3 flex flex-col">
              <span class="font-bold text-white text-xs mb-2">Conceptos Estimados en el Periodo</span>
              <div class="flex-1 overflow-auto">
                <table class="w-full text-left text-[10.5px] font-mono">
                  <thead class="bg-slate-900 text-slate-400 font-bold border-b border-slate-750">
                    <tr><th class="p-2">Clave</th><th class="p-2">Volumen Ejecutado</th><th class="p-2 text-right">P.U.</th><th class="p-2 text-right">Importe</th></tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800 text-[10px]">
                    <tr><td class="p-2 font-bold text-blue-400">ARQ-001</td><td class="p-2">8.00 planos</td><td class="p-2 text-right">$6,000.00</td><td class="p-2 text-right font-bold text-white">$48,000.00</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div id="mock-step12-summary" class="w-80 bg-slate-850 border border-slate-750 rounded-xl p-3.5 flex flex-col justify-between">
              <div class="space-y-2">
                <span class="font-bold text-xs text-white block border-b border-slate-750 pb-1.5">Carátula de Estimación</span>
                <div class="flex justify-between text-slate-300 font-mono text-[10.5px]"><span>Subtotal Honorarios:</span><span>$48,000.00</span></div>
                <div class="flex justify-between text-amber-400 font-mono text-[10.5px]"><span>(-) Amortización Anticipo (30%):</span><span>-$14,400.00</span></div>
                <div class="flex justify-between text-emerald-400 font-mono text-xs font-bold border-t border-slate-750 pt-1.5">
                  <span>LÍQUIDO A COBRAR:</span><span>$33,600.00</span>
                </div>
              </div>
              <button id="mock-step12-btn-pdf" class="w-full py-2 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-file-pdf"></i> Descargar Carátula PDF
              </button>
            </div>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'estimaciones', mainContent: estContentHtml });
      break;
    }

    // MÓDULO 13: Seguimiento Financiero, Compras y ERP
    case 13: {
      const compraModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white px-5 py-4 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                <i class="fa-solid fa-cart-shopping text-sm"></i>
              </div>
              <div>
                <h3 class="font-extrabold text-sm text-white">Registro de Compra / Gasto de Proyecto</h3>
                <p class="text-[10px] text-blue-200">Control de egresos, orden de compra y comprobantes</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <div class="p-4 space-y-3 bg-white text-slate-800">
            <div>
              <label class="block font-bold text-slate-700 mb-1 text-[11px]">Descripción del Insumo / Factura: *</label>
              <div id="mock-step13-form" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium text-slate-900 shadow-2xs">
                <span class="mock-type-value">Factura F-4892 • Concreto premezclado f'c=250 kg/cm2</span>
              </div>
            </div>

            <div class="flex items-center justify-between pt-1">
              <label class="font-bold text-slate-700 text-[11px]">Estatus de Tesorería:</label>
              <div id="mock-step13-status" class="flex gap-2">
                <span class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[10px] cursor-pointer">Pagado ✓</span>
                <span class="px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium text-[10px]">Pendiente ⏳</span>
              </div>
            </div>
          </div>

          <div class="bg-slate-100 px-4 py-3 border-t border-slate-200 flex justify-between items-center shrink-0">
            <button class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold">Cancelar</button>
            <div class="flex gap-2">
              <button id="mock-step13-btn-order" class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-bold flex items-center gap-1.5">
                <i class="fa-solid fa-file-invoice text-amber-500"></i> Orden de Compra
              </button>
              <button class="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs shadow flex items-center gap-1.5">
                <i class="fa-solid fa-check text-[10px]"></i> Guardar Gasto
              </button>
            </div>
          </div>
        </div>
      `;

      const comprasContentHtml = `
        <div class="flex-1 bg-slate-900 text-slate-100 flex flex-col overflow-hidden p-3 gap-3 text-xs">
          <div class="grid grid-cols-3 gap-3 shrink-0">
            <div class="bg-slate-850 border border-slate-750 p-3 rounded-xl shadow-sm">
              <span class="text-[10px] text-slate-400 font-bold uppercase block">Presupuesto Asignado</span>
              <span class="font-mono text-sm font-extrabold text-blue-400">$417,726.92</span>
            </div>
            <div class="bg-slate-850 border border-slate-750 p-3 rounded-xl shadow-sm">
              <span class="text-[10px] text-slate-400 font-bold uppercase block">Gastos Ejercidos</span>
              <span class="font-mono text-sm font-extrabold text-amber-400">$182,450.00</span>
            </div>
            <div class="bg-slate-850 border border-slate-750 p-3 rounded-xl shadow-sm">
              <span class="text-[10px] text-slate-400 font-bold uppercase block">Saldo Disponible</span>
              <span class="font-mono text-sm font-extrabold text-emerald-400">$235,276.92</span>
            </div>
          </div>

          <div class="flex items-center justify-between pb-1 shrink-0">
            <button id="mock-step13-btn-new" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/30 flex items-center gap-1.5">
              <i class="fa-solid fa-plus text-[10px]"></i> + Registrar Gasto
            </button>
            <span class="text-[10.5px] text-slate-400 font-mono">14 Facturas Registradas</span>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'seguimiento', mainContent: comprasContentHtml, overlayModal: compraModalHtml });
      break;
    }

    // MÓDULO 14: Bitácora Electrónica y Legal de Proyecto
    case 14: {
      const bitacoraModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <div class="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center text-sm font-bold shadow-sm">
                <i class="fa-solid fa-book-bookmark"></i>
              </div>
              <div>
                <h3 class="font-bold text-sm text-white">Nueva Nota de Bitácora Electrónica</h3>
                <p class="text-[10px] text-slate-300">Folio Inmutable Cifrado SHA-256</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <div class="p-4 space-y-3 bg-white text-slate-800">
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-200">
              <span class="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px]">Nota #001</span>
              <div id="mock-step14-clima" class="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[10.5px]">
                <span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300">☀️ Soleado 24°C</span>
              </div>
            </div>

            <div>
              <label class="text-[11px] text-slate-700 font-bold block mb-1">Firma Digital Manuscrita (Táctil / Cifrado Inmutable):</label>
              <div id="mock-step14-firma" class="h-16 rounded-xl bg-slate-50 border border-slate-300 p-2 flex items-center justify-center relative">
                <span class="font-serif italic text-blue-900 text-lg font-bold tracking-widest select-none">Arq. Carlos Mendoza</span>
                <span class="absolute bottom-1 right-2 text-[8px] text-slate-400 font-mono">Hash SHA-256 Validado</span>
              </div>
            </div>
          </div>

          <div class="bg-slate-100 px-4 py-2.5 border-t border-slate-200 flex justify-between items-center shrink-0">
            <span class="text-[10px] text-slate-500 font-mono">Folio Inmutable #001</span>
            <button id="mock-step14-btn-save" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-stamp text-[10px]"></i> Sellar Nota Oficial
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'bitacora', overlayModal: bitacoraModalHtml });
      break;
    }

    // MÓDULO 15: Chat de Proyecto y Canales Técnicos
    case 15: {
      container.innerHTML = renderRealisticWorkspaceShell({ activeRail: 'chat', showChatDock: true });
      break;
    }

    // MÓDULO 16: Importador Universal
    case 16: {
      const importModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <div class="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <i class="fa-solid fa-file-import text-sm"></i>
              </div>
              <div>
                <h3 class="font-bold text-sm text-white">Importador Universal de Catálogos</h3>
                <p class="text-[10px] text-slate-300">Compatible con Opus (.zip, .bak), Neodata, Excel (.xlsx), CSV y JSON</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <div class="p-4 space-y-3 bg-white text-slate-800">
            <div id="mock-step16-dropzone" class="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center bg-slate-50 transition cursor-pointer">
              <div class="w-10 h-10 mx-auto rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-lg mb-2">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <span class="font-bold text-xs text-slate-800 block">Presupuesto_Residencial_Opus.xlsx</span>
              <span class="text-[10px] text-slate-500 mt-0.5 block">Arrastra tu archivo o haz clic para examinar</span>
            </div>

            <div id="mock-step16-preview" class="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-[10.5px] flex justify-between items-center">
              <span class="text-blue-900 font-bold flex items-center gap-1.5">
                <i class="fa-solid fa-check-double text-blue-600"></i> Vista Previa: 2,450 Renglones y 12 Partidas
              </span>
              <span class="font-mono text-emerald-700 font-extrabold text-xs">$417,726.92 MXN</span>
            </div>
          </div>

          <div class="bg-slate-100 px-4 py-2.5 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold">Cancelar</button>
            <button id="mock-step16-btn-start" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-play text-[10px]"></i> Iniciar Importación
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeRail: 'import', overlayModal: importModalHtml });
      break;
    }

    // MÓDULO 17: Seguridad, Tab Lock y Respaldos
    case 17: {
      const profileModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <div class="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
            <h3 class="font-bold text-sm text-white flex items-center gap-2">
              <i class="fa-solid fa-user-gear text-blue-400"></i> Perfil Profesional y Ajustes
            </h3>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <div class="p-4 space-y-3 bg-white text-slate-800">
            <div id="mock-step17-profile" class="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div class="w-11 h-11 rounded-full border-2 border-blue-500 bg-white flex items-center justify-center text-lg shadow-xs shrink-0">
                <i class="fa-solid fa-user-tie text-blue-600"></i>
              </div>
              <div class="space-y-0.5">
                <strong class="font-bold text-slate-900 text-xs block">Arq. Carlos Mendoza</strong>
                <span class="text-[10px] text-slate-500 font-mono block">carlos@despacho.com • Plan Pro</span>
              </div>
            </div>

            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div class="flex justify-between items-center text-[10.5px]">
                <span class="text-slate-700 font-semibold">Almacenamiento en la Nube:</span>
                <span id="mock-step17-quota" class="font-mono text-blue-700 font-bold">0.45 MB / 250 MB</span>
              </div>
              <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div class="h-full bg-blue-600 rounded-full" style="width: 8%;"></div>
              </div>
            </div>

            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <i class="fa-solid fa-lock text-amber-500 text-base"></i>
                <div>
                  <span class="font-bold text-slate-800 text-[11px] block">Candado Tab Lock Activo</span>
                  <span class="text-[10px] text-slate-500">Protección contra edición accidental</span>
                </div>
              </div>
              <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[9.5px]">Bloqueado ✓</span>
            </div>
          </div>

          <div class="bg-slate-100 px-4 py-3 border-t border-slate-200 flex justify-between items-center shrink-0">
            <button id="mock-step17-btn-backup" class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
              <i class="fa-solid fa-cloud-arrow-down text-blue-600"></i> Respaldo .JSON
            </button>
            <button id="mock-step17-logo" class="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs shadow">
              <i class="fa-solid fa-check text-[10px]"></i> Guardar
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ overlayModal: profileModalHtml });
      break;
    }

    default:
      container.innerHTML = renderRealisticWorkspaceShell();
      break;
  }
}
