import { state, persistSettings, persistLocalData } from '../../state/store.js?v=20261116_cf3';
import { saveState } from '../../state/history.js?v=20261116_cf3';
import { showToast } from '../../ui/notifications.js?v=20261116_cf3';
import { findNodeById, getNodeHierarchyPath, getSelectedLeafConcepts } from '../catalog/treeService.js?v=20261116_cf3';
import { renderTAB1 } from '../catalog/catalogView.js?v=20261116_cf3';
import { renderAPUInsumos, renderInsumosUnitarios } from '../apu/apuView.js?v=20261116_cf3';
import { closeAiGeneratorModal, openAiGeneratorModal, aiModalTargetMode, aiModalSingleNodeId } from '../../ui/modalController.js?v=20261116_cf3';
import { round2, getEjecutivoCostPlusFactor } from '../../core/calculations.js?v=20261116_cf3';
import { round5 } from '../../core/formatters.js?v=20261116_cf3';

// Extractor robusto de JSON para respuestas de Gemini
export function extractJsonFromAiResponse(text) {
  if (!text) throw new Error('Respuesta vacÃ­a');
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      try { return JSON.parse(match[1]); } catch (e2) {}
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const jsonSubstring = text.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonSubstring);
      } catch (e3) {}
    }
    throw new Error('La respuesta devuelta por la IA no pudo ser interpretada como JSON.');
  }
}

// Probar conexiÃ³n de API Key con Google Search Grounding
export async function testGeminiConnection() {
  const apiKeyInput = (document.getElementById('ai-modal-api-key')?.value || '').trim();
  const errorBox = document.getElementById('ai-modal-error');
  const errorTitle = document.getElementById('ai-modal-error-title');
  const errorMsg = document.getElementById('ai-modal-error-msg');

  if (!apiKeyInput) {
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorTitle) errorTitle.innerText = 'Se requiere API Key';
    if (errorMsg) errorMsg.innerText = 'Ingresa una API Key para probar la conexiÃ³n con Google Search Grounding.';
    return;
  }

  showToast('Probando Google Search Grounding con Gemini 2.5 Flash...', 'info');

  const testModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let testSuccess = false;
  let testErr = '';

  for (let m of testModels) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKeyInput}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Prueba de conexiÃ³n con Google Search. Â¿CuÃ¡l es el precio del cemento en MÃ©xico?' }] }],
          tools: [{ googleSearch: {} }]
        })
      });

      if (response.ok) {
        testSuccess = true;
        if (errorBox) errorBox.classList.add('hidden');
        showToast(`âœ… ConexiÃ³n verificada con ${m} y Google Search Grounding`, 'success');
        break;
      } else {
        const errData = await response.json().catch(() => ({}));
        testErr = errData.error?.message || `HTTP ${response.status}: Error con ${m}`;
      }
    } catch (e) {
      testErr = e.message || 'Error de red al conectar con Google.';
    }
  }

  if (!testSuccess) {
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorTitle) errorTitle.innerText = 'Fallo en la prueba de conexiÃ³n';
    if (errorMsg) errorMsg.innerText = testErr;
  }
}

/**
 * Genera la matriz APU con Google IA en 1 SOLO CLIC para el concepto activo seleccionado.
 * Sin abrir modales ni pedir claves al usuario: consulta el backend seguro en Vercel (/api/gemini-apu).
 */
export async function generarMatrizConceptoActivoGoogleIA(targetNodeId = null) {
  const targetId = targetNodeId || state.activeSelectedId;
  const node = targetId ? findNodeById(state.treeData, targetId) : null;

  if (!node) {
    showToast('Selecciona un concepto en el catÃ¡logo primero para generar su matriz con Google IA.', 'warning');
    return false;
  }

  if (node.children && node.children.length > 0) {
    showToast('Solo se puede generar matriz en conceptos individuales (hojas), no en partidas agrupadoras.', 'warning');
    return false;
  }

  // Elementos de UI para feedback visual inmediato en 1 solo clic
  const btnHeader = document.getElementById('btn-ai-apu');
  const btnMax = document.getElementById('btn-ai-apu-max');
  const originalHeaderHtml = btnHeader ? btnHeader.innerHTML : '';
  const originalMaxHtml = btnMax ? btnMax.innerHTML : '';

  const setLoadingState = (loading) => {
    if (btnHeader) {
      btnHeader.disabled = loading;
      btnHeader.innerHTML = loading
        ? '<i class="fa-solid fa-circle-notch fa-spin text-[10px] text-amber-300"></i> <span class="text-[8px]">Generando...</span>'
        : originalHeaderHtml;
    }
    if (btnMax) {
      btnMax.disabled = loading;
      btnMax.innerHTML = loading
        ? '<i class="fa-solid fa-circle-notch fa-spin text-xs text-amber-300"></i> Generando...'
        : originalMaxHtml;
    }
  };

  setLoadingState(true);
  showToast(`Buscando cotizaciones y cuadrillas con Google IA para [${node.clave || ''}]...`, 'info');

  const pathArr = getNodeHierarchyPath(state.treeData, node.id) || [];
  const fullPath = pathArr.join('  >  ');
  const fasarVal = state.settings?.pctFasar !== undefined ? Number(state.settings.pctFasar) : 70.0;
  const fasarFactor = (fasarVal > 0 && fasarVal < 5.0) ? fasarVal : (1 + (fasarVal / 100));

  try {
    const payload = {
      node: {
        clave: node.clave || '',
        descripcion: node.descripcion || '',
        unidad: node.unidad || 'pza',
        cantidad: node.cantidad || 1
      },
      fullPath,
      fasarVal,
      fasarFactor,
      userApiKey: state.settings?.apiKey || ''
    };

    const headers = { 'Content-Type': 'application/json' };
    if (state.settings?.apiKey) {
      headers['X-Gemini-Key'] = state.settings.apiKey;
    }

    const response = await fetch('/api/gemini-apu', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP ${response.status}: Error al conectar con el servicio de IA`);
    }

    if (!Array.isArray(data.insumos) || data.insumos.length === 0) {
      throw new Error('La IA no devolviÃ³ insumos utilizables para este concepto.');
    }

    // Guardar estado previo para Deshacer (Undo)
    saveState();

    // Integrar insumos y metadatos de Grounding
    node.insumos = data.insumos;
    node.googleSearchQueries = data.googleSearchQueries || [];
    node.googleSources = data.googleSources || [];
    node.aiTips = data.sugerencias || '';

    // Recalcular costo directo y precio unitario con modelo Cost-Plus
    const totalCD = round2(node.insumos.reduce((acc, ins) => acc + (round5(ins.cantidad || 0) * round2(ins.costoUnitario || 0)), 0));
    const factorSobrecosto = getEjecutivoCostPlusFactor();
    const totalPU = round2(totalCD * factorSobrecosto);

    node.costoDirecto = totalCD;
    node.precioUnitario = totalPU;

    persistLocalData();

    // Actualizar vistas
    renderAPUInsumos(node);
    renderInsumosUnitarios(node);
    renderTAB1();

    showToast(`âœ… Â¡Matriz APU generada automÃ¡ticamente con Google IA para [${node.clave || ''}]!`, 'success');
    return true;
  } catch (err) {
    console.error('Error generando matriz con Google IA:', err);

    // Fallback: Si el usuario tiene guardada una API Key local en el navegador, intentar llamada directa cliente
    if (state.settings?.apiKey) {
      try {
        showToast('Reintentando consulta con API Key local...', 'info');
        const fallbackRes = await queryGeminiSingleConcept(node, state.settings.apiKey);
        if (fallbackRes.success) {
          persistLocalData();
          renderAPUInsumos(node);
          renderInsumosUnitarios(node);
          renderTAB1();
          showToast(`âœ… Matriz generada con Google Search Grounding`, 'success');
          return true;
        }
      } catch (fbErr) {
        console.warn('Fallback local no completado:', fbErr);
      }
    }

    showToast(`Error al generar matriz con Google IA: ${err.message}`, 'error');
    return false;
  } finally {
    setLoadingState(false);
  }
}

// Generar matrices APU con Google IA para conceptos seleccionados con casilla (sin modal)
export async function generarMatrizCasillasGoogleIA() {
  let selected = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
  if (selected.length === 0 && state.activeSelectedId) {
    const active = findNodeById(state.treeData, state.activeSelectedId);
    if (active && (!active.children || active.children.length === 0)) {
      active.selected = true;
      selected.push(active);
      persistLocalData();
      renderTAB1();
    }
  }

  if (selected.length === 0) {
    showToast('Selecciona con la casilla (checkbox) los conceptos cuya matriz deseas generar con Google IA.', 'warning');
    return;
  }

  const btnToolbar = document.getElementById('btn-toolbar-google-ia');
  const originalToolbarHtml = btnToolbar ? btnToolbar.innerHTML : '';
  if (btnToolbar) {
    btnToolbar.disabled = true;
    btnToolbar.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-[10px] text-amber-200"></i> Generando...';
  }

  saveState();
  let successCount = 0;

  for (let i = 0; i < selected.length; i++) {
    const concept = selected[i];
    showToast(`Generando matriz (${i + 1}/${selected.length}) con Google IA: [${concept.clave || ''}]...`, 'info');
    const ok = await generarMatrizConceptoActivoGoogleIA(concept.id);
    if (ok) successCount++;
  }

  if (btnToolbar) {
    btnToolbar.disabled = false;
    btnToolbar.innerHTML = originalToolbarHtml;
  }

  if (successCount > 0) {
    showToast(`âœ… ${successCount} de ${selected.length} matrices generadas exitosamente con Google IA.`, 'success');
  }
}

/**
 * Consulta a Gemini con Google Search Grounding para estructurar la matriz de un concepto individual.
 */
export async function queryGeminiSingleConcept(node, apiKeyInput, onStatus) {
  if (!node) return { success: false, error: 'Nodo no vÃ¡lido' };

  const pathArr = getNodeHierarchyPath(state.treeData, node.id) || [];
  const fullPath = pathArr.join('  >  ');

  const fasarVal = state.settings?.pctFasar !== undefined ? Number(state.settings.pctFasar) : 70.0;
  const fasarFactor = (fasarVal > 0 && fasarVal < 5.0) ? fasarVal : (1 + (fasarVal / 100));

  const promptText = `Eres un ingeniero civil especialista senior en AnÃ¡lisis de Precios Unitarios (APU) y costos de construcciÃ³n en MÃ©xico.
Utiliza Google Search Grounding para investigar precios comerciales y rendimientos vigentes en el mercado de la construcciÃ³n en MÃ©xico (en Pesos Mexicanos MXN).

Datos de la fila seleccionada en TAB1-CAT-BASE:
- UbicaciÃ³n / Partida en presupuesto: "${fullPath}"
- Clave de concepto: "${node.clave || ''}"
- DescripciÃ³n exacta del concepto: "${node.descripcion || ''}"
- Unidad de medida del concepto: "${node.unidad || 'pza'}"
- Cantidad de obra en presupuesto: ${node.cantidad || 1} ${node.unidad || 'pza'}

REGLA FUNDAMENTAL DE PRECIOS UNITARIOS (APU):
La propiedad 'cantidad' de CADA insumo (Material, Mano de Obra, Equipo/Herramienta, Subcontrato) DEBE SER ESTRICTAMENTE el consumo o rendimiento unitario necesario para elaborar EXACTAMENTE UNA UNIDAD (1 ${node.unidad || 'pza'}) del concepto.
Â¡NO debes multiplicar por la cantidad total de obra del presupuesto (${node.cantidad || 1})! Ãšnicamente el consumo por 1 ${node.unidad || 'pza'}.
Ejemplos de congruencia matemÃ¡tica:
- Si el concepto es en m2 y lleva concreto (m3) con espesor 10 cm: cantidad = 1.0 * 0.10 * 1.05 desperdicio = 0.105 m3.
- Si lleva malla electrosoldada en m2: cantidad = 1.10 m2 (considerando 10% traslapes).
- Si es Mano de Obra en 'jor': cantidad = 1 / RendimientoDiario (ej. 1 / 12.5 m2/jor = 0.0800 jor).
- Si es Herramienta menor (%): cantidad = 0.03 (3%).

Instrucciones prioritarias con Google Search:
1. Realiza bÃºsquedas en Google de los precios actuales de mercado en MÃ©xico para los materiales comerciales que componen este concepto (puestos en obra).
2. Busca los salarios de cuadrillas (oficiales + peones) aplicando el Factor de Salario Real (FASAR) configurado en el sistema (+${fasarVal.toFixed(1)}% / Factor ${fasarFactor.toFixed(2)}) para inflar el salario nominal y cubrir IMSS, INFONAVIT, SAR, riesgos y prestaciones segÃºn tabuladores CMIC / Neodata / Opus.
3. Determina el equipo, maquinaria y herramienta requerida.
4. Clasifica los insumos en los rubros: "Material", "Mano de Obra", "Herramienta", "Equipo", "Maquinaria" o "Subcontrato".
5. Al final de tu anÃ¡lisis, devuelve OBLIGATORIAMENTE un bloque de cÃ³digo JSON con esta estructura exacta:
\`\`\`json
{
  "sugerencias": "RecomendaciÃ³n tÃ©cnica sobre ejecuciÃ³n, curado, pruebas o normativas mexicanas para este concepto...",
  "insumos": [
    {
      "clave": "MAT-01",
      "tipo": "Material",
      "descripcion": "DescripciÃ³n comercial detallada del material con especificaciÃ³n",
      "unidad": "m3/kg/pza/etc",
      "cantidad": 0.00,
      "costoUnitario": 0.00
    },
    {
      "clave": "MO-01",
      "tipo": "Mano de Obra",
      "descripcion": "Cuadrilla de mano de obra (Oficial + PeÃ³n) con rendimiento",
      "unidad": "jor/m2/etc",
      "cantidad": 0.00,
      "costoUnitario": 0.00
    },
    {
      "clave": "EQ-01",
      "tipo": "Equipo",
      "descripcion": "Equipo o herramienta menor (% de MO)",
      "unidad": "hr/%",
      "cantidad": 0.00,
      "costoUnitario": 0.00
    }
  ]
}
\`\`\``;

  const attempts = [
    { model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }] },
    { model: 'gemini-2.5-flash', tools: null },
    { model: 'gemini-2.0-flash', tools: [{ googleSearch: {} }] },
    { model: 'gemini-1.5-flash', tools: [{ googleSearch: {} }] },
    { model: 'gemini-1.5-flash', tools: null }
  ];

  let lastError = '';

  for (let att of attempts) {
    try {
      if (onStatus) {
        onStatus(att.tools 
          ? `Buscando cotizaciones en Google Search Grounding con ${att.model}...`
          : `Consultando modelo ${att.model}...`);
      }

      const reqPayload = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.2
        }
      };

      if (att.tools) {
        reqPayload.tools = att.tools;
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${att.model}:generateContent?key=${apiKeyInput}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        lastError = errJson.error?.message || `HTTP ${response.status} ${response.statusText}`;
        console.warn(`Intento fallido con ${att.model} (tools: ${!!att.tools}):`, lastError);
        continue;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const textContent = candidate?.content?.parts?.[0]?.text;

      if (!textContent) {
        lastError = 'La IA no devolviÃ³ texto en su respuesta.';
        continue;
      }

      const parsed = extractJsonFromAiResponse(textContent);
      if (parsed && Array.isArray(parsed.insumos) && parsed.insumos.length > 0) {
        const groundingMeta = candidate.groundingMetadata;
        const searchQueries = groundingMeta?.webSearchQueries || [];
        const sources = (groundingMeta?.groundingChunks || []).map(chunk => ({
          title: chunk.web?.title || 'Fuente web',
          uri: chunk.web?.uri || '#'
        })).filter(s => s.uri !== '#');

        node.googleSearchQueries = searchQueries;
        node.googleSources = sources;
        node.aiTips = parsed.sugerencias || '';

        node.insumos = parsed.insumos.map((item, idx) => {
          let cleanTipo = 'Material';
          const t = (item.tipo || '').toLowerCase();
          if (t.includes('mano') || t.includes('obra') || t === 'mo') cleanTipo = 'Mano de Obra';
          else if (t.includes('herr')) cleanTipo = 'Herramienta';
          else if (t.includes('maq')) cleanTipo = 'Maquinaria';
          else if (t.includes('equipo') || t === 'eq') cleanTipo = 'Equipo';
          else if (t.includes('subcontrat') || t === 'sub') cleanTipo = 'Subcontrato';

          return {
            clave: item.clave || `${cleanTipo.substring(0, 3).toUpperCase()}-0${idx + 1}`,
            tipo: cleanTipo,
            descripcion: item.descripcion || 'Insumo de obra',
            unidad: item.unidad || 'pza',
            cantidad: round5(parseFloat(item.cantidad) || 1),
            costoUnitario: round2(parseFloat(item.costoUnitario) || 0)
          };
        });

        // Calcular costo directo y precio unitario con modelo Cost-Plus
        const totalCD = round2(node.insumos.reduce((acc, ins) => acc + (ins.cantidad * ins.costoUnitario), 0));
        const factorSobrecosto = getEjecutivoCostPlusFactor();
        const totalPU = round2(totalCD * factorSobrecosto);

        node.costoDirecto = totalCD;
        node.precioUnitario = totalPU;

        return { success: true };
      }
    } catch (err) {
      lastError = err.message || 'Error de red';
      console.error('Error durante la llamada:', err);
    }
  }

  return { success: false, error: lastError };
}

// EjecuciÃ³n de GeneraciÃ³n con IA y Google Search Grounding (Lote o Individual)
export async function executeAiGeneration() {
  const apiKeyInput = (document.getElementById('ai-modal-api-key')?.value || '').trim();
  const errorBox = document.getElementById('ai-modal-error');
  const errorTitle = document.getElementById('ai-modal-error-title');
  const errorMsg = document.getElementById('ai-modal-error-msg');
  const loadingBox = document.getElementById('ai-modal-loading');
  const loadingText = document.getElementById('ai-modal-loading-text');
  const btnRun = document.getElementById('btn-ai-modal-run');

  if (!apiKeyInput) {
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorTitle) errorTitle.innerText = 'Se requiere API Key';
    if (errorMsg) errorMsg.innerText = 'Para realizar bÃºsquedas en Google Search Grounding en tiempo real, ingresa tu API Key gratuita de Gemini.';
    document.getElementById('ai-modal-api-key')?.focus();
    return;
  }

  // Guardar API Key para futuros usos
  state.settings.apiKey = apiKeyInput;
  persistSettings();
  const cfgInput = document.getElementById('cfg-api-key');
  if (cfgInput) cfgInput.value = apiKeyInput;

  let targets = [];
  if (aiModalTargetMode === 'single') {
    const targetNode = findNodeById(state.treeData, aiModalSingleNodeId || state.activeSelectedId);
    if (targetNode && (!targetNode.children || targetNode.children.length === 0)) {
      targets = [targetNode];
    }
  } else {
    targets = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
    if (targets.length === 0 && state.activeSelectedId) {
      const activeNode = findNodeById(state.treeData, state.activeSelectedId);
      if (activeNode && (!activeNode.children || activeNode.children.length === 0)) {
        targets = [activeNode];
      }
    }
  }

  if (targets.length === 0) {
    showToast('Selecciona al menos un concepto en la tabla primero.', 'warning');
    closeAiGeneratorModal();
    return;
  }

  if (errorBox) errorBox.classList.add('hidden');
  if (loadingBox) loadingBox.classList.remove('hidden');
  if (btnRun) btnRun.disabled = true;

  saveState();

  let successCount = 0;
  let lastError = '';

  for (let i = 0; i < targets.length; i++) {
    const node = targets[i];
    const prefix = targets.length > 1 ? `(${i + 1}/${targets.length}) ` : '';

    if (loadingText) {
      loadingText.innerText = `${prefix}Consultando Google Search para [${node.clave || ''}] ${node.descripcion.substring(0, 30)}...`;
    }

    try {
      const res = await queryGeminiSingleConcept(node, apiKeyInput, (status) => {
        if (loadingText) loadingText.innerText = `${prefix}${status}`;
      });

      if (res.success) {
        successCount++;
      } else {
        lastError = res.error || 'Fallo al procesar respuesta';
      }
    } catch (err) {
      lastError = err.message || 'Error de conexiÃ³n';
      console.error(`Error en concepto ${node.clave}:`, err);
    }
  }

  if (successCount > 0) {
    persistLocalData();
    closeAiGeneratorModal();

    if (state.activeSelectedId) {
      const activeNode = findNodeById(state.treeData, state.activeSelectedId);
      if (activeNode) {
        renderAPUInsumos(activeNode);
        renderInsumosUnitarios(activeNode);
      }
    }
    renderTAB1();

    const msg = targets.length === 1
      ? 'Matriz generada con Google Search Grounding'
      : `âœ… Matrices generadas con Google IA para ${successCount} de ${targets.length} conceptos`;
    showToast(msg, 'success');
  } else {
    if (loadingBox) loadingBox.classList.add('hidden');
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorTitle) errorTitle.innerText = 'Error al consultar Google Search';
    if (errorMsg) errorMsg.innerText = `${lastError}. Verifica tu API Key o prueba la conexiÃ³n.`;
    if (btnRun) btnRun.disabled = false;
  }
}
