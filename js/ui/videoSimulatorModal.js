// js/ui/videoSimulatorModal.js
// Reproductor Web de Video-Simulación Interactiva para cubikar Arquitectura
// Simula audiovisualmente el 100% de los 17 módulos de cubikar Arquitectura:
// Pantallas realistas (Alcances, Presupuesto, APU, IA Grounding, Gantt, Estimaciones, ERP, Bitácora),
// cursor virtual animado con clic ripple sobre elementos reales,
// narración fluida por voz natural en español con oraciones completas y subtítulos sincronizados.

import { renderModuleVisualScene } from './realisticSimulatorShell.js?v=20261119_cf35';

let isVideoModalOpen = false;
let currentModuleId = 1;
let isPlaying = false;
let playbackSpeed = 1.0;
let currentTimeSeconds = 0;
let simulationInterval = null;

// Variables de Audio y Narración por Voz
let isVoiceNarrationEnabled = true;
let lastSpokenKey = null;
let lastClickedStepKey = null;
let cachedSpanishVoice = null;
let audioCtx = null;
let currentUtterance = null;
let isSpeakingCurrentSentence = false;

// =========================================================================
// GUIONES VISUALES DE LOS 17 MÓDULOS DE CUBIKAR ARQUITECTURA (100% DE LA APP)
// =========================================================================

export const VIDEO_MODULES = [
  // VENTANA 1: PORTAL DE INICIO (MIS PROYECTOS)
  {
    id: 1,
    title: 'Crear Proyecto e Identidad del Despacho',
    badge: 'Módulo 1 • Inicio',
    duration: 30,
    icon: 'fa-folder-plus',
    description: 'Asistente en 2 Pasos: Nombre del despacho, logotipo 1:1, sobrecosto y plantilla.',
    steps: [
      { t: 0, text: 'Para crear un nuevo proyecto arquitectónico, haz clic en el botón azul Nuevo Proyecto.', targetId: 'mock-step1-btn-new', action: 'click' },
      { t: 6, text: 'Paso uno: escribe el nombre de tu despacho de arquitectura y sube tu logotipo en proporción uno a uno.', targetId: 'mock-step1-empresa', action: 'type', value: 'Constructora & Despacho del Valle S.A.' },
      { t: 12, text: 'Captura el nombre del proyecto ejecutivo y su ubicación. Selecciona el tipo de proyecto correspondiente.', targetId: 'mock-step1-obra', action: 'type', value: 'Residencial Palmas Norte (Proyecto Ejecutivo)' },
      { t: 18, text: 'Paso dos: configura la divisa en pesos mexicanos y los factores de sobrecosto para honorarios y obra.', targetId: 'mock-step1-sobrecosto', action: 'highlight' },
      { t: 24, text: 'Selecciona la plantilla inicial de arquitectura y haz clic en Crear Proyecto para comenzar.', targetId: 'mock-step1-btn-finish', action: 'click' }
    ]
  },
  {
    id: 2,
    title: 'Modo de Trabajo: Proyectos Propios vs. Colaboraciones',
    badge: 'Módulo 2 • Ámbitos',
    duration: 30,
    icon: 'fa-briefcase',
    description: 'Filtro entre proyectos de autoría propia, obras compartidas por despachos anfitriones y membresía.',
    steps: [
      { t: 0, text: 'En la parte superior del portal, ubica la barra de Modo de Trabajo con su selector de ámbitos.', targetId: 'mock-step2-mode-bar', action: 'highlight' },
      { t: 6, text: 'En Mis Proyectos accedes a tus proyectos arquitectónicos de autoría propia gobernados por tu plan.', targetId: 'mock-step2-scope-select', action: 'click' },
      { t: 12, text: 'Selecciona un despacho anfitrión para colaborar en sus proyectos con permisos asignados de edición o lectura.', targetId: 'mock-step2-scope-select', action: 'click' },
      { t: 18, text: 'El indicador de membresía se adapta automáticamente al plan del despacho anfitrión sin consumir tu cuota.', targetId: 'mock-step2-status-badge', action: 'highlight' },
      { t: 24, text: 'Presiona el botón Invitaciones para sumar proyectistas, dibujantes o calculistas a tus propios proyectos.', targetId: 'mock-step2-btn-invite', action: 'click' }
    ]
  },
  {
    id: 3,
    title: 'Invitar Colaboradores y Permisos de Despacho',
    badge: 'Módulo 3 • Equipo',
    duration: 30,
    icon: 'fa-users',
    description: 'Gestión de proyectistas, dibujantes y calculistas con roles (Editar, Escribir, Leer) y permisos por pestaña.',
    steps: [
      { t: 0, text: 'En la tarjeta de tu proyecto de arquitectura, haz clic en Invitar para abrir el gestor de equipo.', targetId: 'mock-step3-btn-invite', action: 'click' },
      { t: 6, text: 'Ingresa el correo electrónico del colaborador y selecciona su avatar temático correspondiente.', targetId: 'mock-step3-email', action: 'type', value: 'arq.sofia@constructora.com' },
      { t: 12, text: 'Asigna el rol de trabajo: Editar con control total, Escribir para captura o Leer solo para consulta.', targetId: 'mock-step3-roles', action: 'highlight' },
      { t: 18, text: 'Autoriza o restringe selectivamente las pestañas de Alcances, Presupuesto, Seguimiento y Calendario.', targetId: 'mock-step3-tabs', action: 'click' },
      { t: 24, text: 'Haz clic en Enviar Invitación. El invitado recibirá el acceso inmediato para colaborar en el proyecto.', targetId: 'mock-step3-btn-add', action: 'click' }
    ]
  },

  // VENTANA 2: PESTAÑA 1: TABLA DE ALCANCES ARQUITECTÓNICOS
  {
    id: 4,
    title: 'Tabla de Alcances de Proyecto Arquitectónico',
    badge: 'Módulo 4 • Alcances',
    duration: 30,
    icon: 'fa-layer-group',
    description: 'Estructuración de entregables ejecutivos, planos, memorias de cálculo, criterios y responsables.',
    steps: [
      { t: 0, text: 'Accede a la pestaña principal Alcances para estructurar los entregables de tu proyecto ejecutivo.', targetId: 'mock-step4-tab-alcances', action: 'click' },
      { t: 6, text: 'Agrega partidas principales para Estudios Preliminares, Proyecto Arquitectónico, Ingenierías y Renders.', targetId: 'mock-step4-btn-partida', action: 'click' },
      { t: 12, text: 'Captura los conceptos de entrega como planos de plantas, cortes, fachadas y memorias descriptivas.', targetId: 'mock-step4-desc', action: 'type', value: 'Plantas arquitectónicas acotadas y amuebladas' },
      { t: 18, text: 'Utiliza la tecla Alt más las flechas de dirección para reordenar renglones y jerarquías al instante.', targetId: 'mock-step4-reorder', action: 'click' },
      { t: 24, text: 'Asigna los arquitectos responsables a cada entregable y monitorea el avance general del proyecto.', targetId: 'mock-step4-responsables', action: 'highlight' }
    ]
  },

  // VENTANA 3: PESTAÑA 2: PRESUPUESTO Y APU
  {
    id: 5,
    title: 'Catálogo de Conceptos y Presupuesto Base',
    badge: 'Módulo 5 • Presupuesto',
    duration: 30,
    icon: 'fa-calculator',
    description: 'Catálogo de obra y honorarios, edición en celda, costo directo y cálculo dinámico de precio de venta.',
    steps: [
      { t: 0, text: 'Pasa a la pestaña Presupuesto para elaborar el catálogo de conceptos y presupuesto base de obra.', targetId: 'mock-step5-tab-presupuesto', action: 'click' },
      { t: 6, text: 'Crea partidas de obra y especifica unidades de medida como metros cuadrados, metros cúbicos o lotes.', targetId: 'mock-step5-btn-partida', action: 'click' },
      { t: 12, text: 'Captura los volúmenes de obra estimados y revisa la renumeración automática de claves del catálogo.', targetId: 'mock-step5-cells', action: 'highlight' },
      { t: 18, text: 'Verifica la sumatoria del Costo Directo y el Monto Total Presupuestado calculados en tiempo real.', targetId: 'mock-step5-total', action: 'highlight' },
      { t: 24, text: 'Aplica colores institucionales a las partidas para preparar presentaciones ejecutivas de alta calidad.', targetId: 'mock-step5-reorder', action: 'click' }
    ]
  },
  {
    id: 6,
    title: 'Análisis de Precios Unitarios (APU)',
    badge: 'Módulo 6 • Matrices',
    duration: 30,
    icon: 'fa-list-check',
    description: 'Desglose en 4 rubros: Materiales, Mano de Obra con FASAR, Maquinaria y Subcontratos.',
    steps: [
      { t: 0, text: 'Haz clic en el botón de APU en cualquier concepto para abrir la matriz de análisis de costo unitario.', targetId: 'mock-step6-btn-apu', action: 'click' },
      { t: 6, text: 'En el rubro de Materiales analiza los insumos básicos, consumos unitarios, mermas y costos de adquisición.', targetId: 'mock-step6-mat', action: 'highlight' },
      { t: 12, text: 'En Mano de Obra integra cuadrillas de oficiales, ayudantes y especialistas con sus rendimientos y Fasar.', targetId: 'mock-step6-mo', action: 'highlight' },
      { t: 18, text: 'En Equipo y Herramienta calcula costos horarios de maquinaria y porcentaje de herramienta menor.', targetId: 'mock-step6-eq', action: 'highlight' },
      { t: 24, text: 'Comprueba cómo el Costo Directo sumado al Factor de Sobrecosto determinan el Precio de Venta final.', targetId: 'mock-step6-total', action: 'click' }
    ]
  },
  {
    id: 7,
    title: 'Inteligencia Artificial y Google Search Grounding',
    badge: 'Módulo 7 • IA Gemini',
    duration: 30,
    icon: 'fa-brain',
    description: 'Cotizaciones comerciales en tiempo real con fuentes de mercado e integración con Gemini.',
    steps: [
      { t: 0, text: 'Abre el menú de Inteligencia Artificial en la barra superior de herramientas del presupuesto.', targetId: 'mock-step7-btn-ai', action: 'click' },
      { t: 6, text: 'Selecciona Precios Web en Vivo con Google para consultar costos comerciales reales y actualizados hoy.', targetId: 'mock-step7-menu-web', action: 'click' },
      { t: 12, text: 'La ventana oficial de Google Search Grounding se conecta a proveedores líderes como Home Depot y Cemex.', targetId: 'mock-step7-concept-card', action: 'highlight' },
      { t: 18, text: 'Gemini analiza la descripción del concepto de arquitectura y localiza insumos y cuadrillas adecuadas.', targetId: 'mock-step7-grounding-toggle', action: 'click' },
      { t: 24, text: 'Presiona Cotizar en Web y Llenar Matriz para completar el APU automáticamente con datos verificados.', targetId: 'mock-step7-btn-run', action: 'click' }
    ]
  },
  {
    id: 8,
    title: 'Catálogos Maestros y Tabuladores de Referencia',
    badge: 'Módulo 8 • Referencia',
    duration: 30,
    icon: 'fa-book-bookmark',
    description: 'Exploración de miles de conceptos precargados, especificaciones oficiales y tabuladores.',
    steps: [
      { t: 0, text: 'Abre el Catálogo Maestro desde la barra lateral izquierda para acceder a la biblioteca de consulta.', targetId: 'mock-step8-btn-master', action: 'click' },
      { t: 6, text: 'Filtra por especialidad entre Arquitectura y Edificación, Instalaciones, Infraestructura o Acabados.', targetId: 'mock-step8-specialties', action: 'click' },
      { t: 12, text: 'Busca palabras clave para localizar conceptos técnicos probados con sus matrices de costo completas.', targetId: 'mock-step8-search', action: 'type', value: 'Zapata corrida concreto f\'c=250' },
      { t: 18, text: 'Revisa la ficha técnica con claves estandarizadas, rendimientos promedio y especificaciones oficiales.', targetId: 'mock-step8-preview', action: 'highlight' },
      { t: 24, text: 'Haz clic en Insertar al Presupuesto para integrarlo a tu proyecto activo con un solo clic.', targetId: 'mock-step8-btn-insert', action: 'click' }
    ]
  },
  {
    id: 9,
    title: 'Explosión y Consolidado de Insumos Generales',
    badge: 'Módulo 9 • Insumos',
    duration: 30,
    icon: 'fa-boxes-stacked',
    description: 'Totales consolidados de materiales y cuadrillas, cambio masivo de costos con recálculo en cascada.',
    steps: [
      { t: 0, text: 'Entra a la vista de Insumos Generales para examinar las cantidades consolidadas de todo el proyecto.', targetId: 'mock-step9-tab-insumos', action: 'click' },
      { t: 6, text: 'Filtra por categorías entre Materiales, Mano de Obra, Maquinaria y Equipos o Subcontratos.', targetId: 'mock-step9-filters', action: 'click' },
      { t: 12, text: 'Realiza cambios masivos de costo directamente en celda para cemento, acero o acabados especiales.', targetId: 'mock-step9-price-cell', action: 'type', value: '$3,850.00 / Ton' },
      { t: 18, text: 'El sistema recalcula automáticamente en cascada todos los precios unitarios vinculados en el presupuesto.', targetId: 'mock-step9-cascade', action: 'highlight' },
      { t: 24, text: 'Utiliza la función Unificar Insumos para combinar materiales duplicados bajo una misma clave estándar.', targetId: 'mock-step9-btn-unify', action: 'click' }
    ]
  },
  {
    id: 10,
    title: 'Reportes e Impresión Oficial en PDF',
    badge: 'Módulo 10 • Reportes',
    duration: 30,
    icon: 'fa-print',
    description: 'Formatos oficiales de Alcances, Presupuesto Base, Matrices APU e Insumos con membrete y firmas.',
    steps: [
      { t: 0, text: 'Abre el menú de Impresión para generar los reportes oficiales y carátulas de entrega ejecutiva.', targetId: 'mock-step10-btn-print', action: 'click' },
      { t: 6, text: 'Configura las firmas responsables del proyecto: Proyectista, Coordinador, Perito DRO y Cliente.', targetId: 'mock-step10-signatures', action: 'highlight' },
      { t: 12, text: 'Elige el formato deseado: Tabla de Alcances, Presupuesto Base, Fichas de APU o Explosión de Insumos.', targetId: 'mock-step10-formats', action: 'click' },
      { t: 18, text: 'El reporte se genera con membrete institucional, logotipo en proporción uno a uno y datos del proyecto.', targetId: 'mock-step10-preview', action: 'highlight' },
      { t: 24, text: 'Descarga el archivo PDF vectorial de alta calidad, listo para licitaciones o entrega al cliente.', targetId: 'mock-step10-btn-download', action: 'click' }
    ]
  },

  // VENTANA 4: PESTAÑA 3: CALENDARIO DE PROYECTO Y GANTT
  {
    id: 11,
    title: 'Calendario de Obra y Diagrama de Gantt',
    badge: 'Módulo 11 • Tiempos',
    duration: 30,
    icon: 'fa-calendar-days',
    description: 'Cronograma visual de entregas y obra, ruta crítica y calendario financiero de erogaciones.',
    steps: [
      { t: 0, text: 'Ingresa a la pestaña Calendario para programar los tiempos de desarrollo de planos y ejecución de obra.', targetId: 'mock-step11-tab-cal', action: 'click' },
      { t: 6, text: 'Arrastra las barras del diagrama de Gantt o edita las duraciones para fijar las fechas de inicio y término.', targetId: 'mock-step11-gantt-bars', action: 'highlight' },
      { t: 12, text: 'Utiliza el Asistente Inteligente para estimar duraciones automáticas basadas en los rendimientos del proyecto.', targetId: 'mock-step11-btn-ai', action: 'click' },
      { t: 18, text: 'Activa la Ruta Crítica para identificar y supervisar las entregas clave que no admiten demoras.', targetId: 'mock-step11-critical', action: 'click' },
      { t: 24, text: 'Consulta el calendario de avance físico y financiero con las erogaciones programadas por período.', targetId: 'mock-step11-financial', action: 'highlight' }
    ]
  },

  // VENTANA 5: PESTAÑA 4: ESTIMACIONES Y COBRO
  {
    id: 12,
    title: 'Estimaciones y Números Generadores de Cobro',
    badge: 'Módulo 12 • Cobros',
    duration: 30,
    icon: 'fa-file-invoice-dollar',
    description: 'Periodos de corte, captura de generadores de cobro, amortización de anticipos y estados de cuenta.',
    steps: [
      { t: 0, text: 'Abre la pestaña Estimaciones para generar tus cortes de cobro de honorarios arquitectónicos o de obra.', targetId: 'mock-step12-tab-est', action: 'click' },
      { t: 6, text: 'Crea una Nueva Estimación estableciendo las fechas del período de corte quincenal o mensual.', targetId: 'mock-step12-btn-new', action: 'click' },
      { t: 12, text: 'Captura los volúmenes efectivamente concluidos mediante generadores de obra y planos aprobados.', targetId: 'mock-step12-inputs', action: 'type', value: '8.00 planos aprobados' },
      { t: 18, text: 'Verifica el cálculo automático de amortización de anticipo y retención de fondo de garantía.', targetId: 'mock-step12-summary', action: 'highlight' },
      { t: 24, text: 'Descarga la Carátula Oficial de Estimación en formato PDF lista para firma y autorización de pago.', targetId: 'mock-step12-btn-pdf', action: 'click' }
    ]
  },

  // VENTANA 6: PESTAÑA 5: SEGUIMIENTO, COMPRAS Y ERP
  {
    id: 13,
    title: 'Seguimiento Financiero, Compras y ERP',
    badge: 'Módulo 13 • Egresos',
    duration: 30,
    icon: 'fa-bars-progress',
    description: 'Dashboard financiero Presupuesto vs Real, registro de facturas y emisión de órdenes de compra.',
    steps: [
      { t: 0, text: 'Accede a la pestaña Seguimiento para supervisar el tablero financiero de Presupuesto versus Gasto Real.', targetId: 'mock-step13-tab-seguimiento', action: 'click' },
      { t: 6, text: 'Haz clic en Registrar Gasto para ingresar facturas, tickets de compra, remisiones u honorarios.', targetId: 'mock-step13-btn-new', action: 'click' },
      { t: 12, text: 'Captura proveedor, descripción, tipo de egreso e importe con IVA y adjunta el comprobante en PDF.', targetId: 'mock-step13-form', action: 'type', value: 'Factura F-4892 • Concreto f\'c=250' },
      { t: 18, text: 'Actualiza el estatus de tesorería a Pagado, Pendiente o Parcial para mantener el control de flujo.', targetId: 'mock-step13-status', action: 'click' },
      { t: 24, text: 'Genera la Orden de Compra oficial foliada con membrete corporativo para entregas de proveedores.', targetId: 'mock-step13-btn-order', action: 'click' }
    ]
  },

  // VENTANA 7: BITÁCORA Y COMUNICACIÓN
  {
    id: 14,
    title: 'Bitácora Electrónica y Legal de Proyecto',
    badge: 'Módulo 14 • Bitácora',
    duration: 30,
    icon: 'fa-book',
    description: 'Notas foliadas #001, registro de clima, firma digital táctil y sellado criptográfico inmutable.',
    steps: [
      { t: 0, text: 'Abre la Bitácora de Proyecto para registrar notas legales y minutas de acuerdos conforme a normativa.', targetId: 'mock-step14-tab-bitacora', action: 'click' },
      { t: 6, text: 'Haz clic en Nueva Nota y selecciona el tipo entre Apertura, Instrucción Técnica, Avance o Incidencia.', targetId: 'mock-step14-btn-new', action: 'click' },
      { t: 12, text: 'Registra el clima del día, describe los acuerdos de diseño y vincula las partidas del proyecto.', targetId: 'mock-step14-clima', action: 'click' },
      { t: 18, text: 'Dibuja tu firma digital manuscrita en el recuadro táctil utilizando mouse, lápiz óptico o pantalla táctil.', targetId: 'mock-step14-firma', action: 'highlight' },
      { t: 24, text: 'Presiona Sellar Nota Oficial para generar el sello criptográfico inmutable y compilar al Libro PDF.', targetId: 'mock-step14-btn-save', action: 'click' }
    ]
  },
  {
    id: 15,
    title: 'Chat de Proyecto y Comunicación Técnica',
    badge: 'Módulo 15 • Comunicación',
    duration: 30,
    icon: 'fa-comments',
    description: 'Canales por especialidad, menciones @Usuario a proyectistas y comentarios directos en partidas.',
    steps: [
      { t: 0, text: 'Abre el panel de comunicación desde el botón de chat en la barra lateral izquierda.', targetId: 'mock-step15-btn-chat', action: 'click' },
      { t: 6, text: 'Alterna entre el Canal Técnico de diseño y planos y el Canal Financiero de compras y estimaciones.', targetId: 'mock-step15-tabs', action: 'click' },
      { t: 12, text: 'Menciona a colaboradores utilizando arroba para enviarles una alerta directa en tiempo real.', targetId: 'mock-step15-input', action: 'type', value: '@Carlos Revisar planos estructurales' },
      { t: 18, text: 'Vincula comentarios y notas de bitácora directamente a cualquier partida o entregable del proyecto.', targetId: 'mock-step15-partida-tag', action: 'highlight' },
      { t: 24, text: 'Exporta la Minuta Oficial de Acuerdos a PDF con membrete del despacho y relación de firmas.', targetId: 'mock-step15-btn-print', action: 'click' }
    ]
  },

  // VENTANA 8: HERRAMIENTAS GLOBALES Y SEGURIDAD
  {
    id: 16,
    title: 'Importador Universal (Excel, Opus y Neodata)',
    badge: 'Módulo 16 • Importación',
    duration: 30,
    icon: 'fa-cloud-arrow-up',
    description: 'Carga de archivos .xlsx, .csv y .json con detección inteligente de columnas y vista previa.',
    steps: [
      { t: 0, text: 'Haz clic en Importar Archivo en la barra lateral izquierda para abrir el asistente universal.', targetId: 'mock-step16-btn-import', action: 'click' },
      { t: 6, text: 'Arrastra tu archivo de Excel, CSV o paquetes exportados de Opus y Neodata.', targetId: 'mock-step16-dropzone', action: 'highlight' },
      { t: 12, text: 'El sistema detecta automáticamente las columnas de clave, descripción, unidad, cantidad y precio.', targetId: 'mock-step16-mapping', action: 'highlight' },
      { t: 18, text: 'Revisa la vista previa de datos y elige el destino entre la Tabla de Alcances o el Presupuesto Activo.', targetId: 'mock-step16-preview', action: 'click' },
      { t: 24, text: 'Presiona Iniciar Importación para procesar miles de renglones en segundos de manera local y segura.', targetId: 'mock-step16-btn-start', action: 'click' }
    ]
  },
  {
    id: 17,
    title: 'Seguridad, Candado Tab Lock y Respaldos',
    badge: 'Módulo 17 • Seguridad',
    duration: 30,
    icon: 'fa-shield-halved',
    description: 'Candado Tab Lock contra ediciones accidentales, respaldo .json y perfil del arquitecto.',
    steps: [
      { t: 0, text: 'Utiliza el candado Tab Lock en la barra de herramientas para proteger tus tablas contra ediciones accidentales.', targetId: 'mock-step17-btn-lock', action: 'click' },
      { t: 6, text: 'Descarga un respaldo completo en formato punto JSON para resguardar tu proyecto en tu equipo local.', targetId: 'mock-step17-btn-backup', action: 'click' },
      { t: 12, text: 'En tu Perfil Profesional personaliza tus datos de contacto y alterna entre Modo Día y Modo Nocturno.', targetId: 'mock-step17-profile', action: 'highlight' },
      { t: 18, text: 'Supervisa tu cuota de almacenamiento en la nube y el estado de sincronización de tus proyectos.', targetId: 'mock-step17-quota', action: 'highlight' },
      { t: 24, text: 'Listo, cubikar Arquitectura protege tu información y optimiza la administración de tus proyectos.', targetId: 'mock-step17-logo', action: 'click' }
    ]
  }
];

// =========================================================================
// MOTOR DE NARRACIÓN POR VOZ Y EFECTOS DE SONIDO (AUDIO ENGINE)
// =========================================================================

function getSpanishVoice() {
  if (cachedSpanishVoice) return cachedSpanishVoice;
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  // 1. Preferir voces naturales / neurales de alta calidad en español de México / Latinoamérica
  let voice = voices.find(v => {
    const name = (v.name || '').toLowerCase();
    const lang = (v.lang || '').toLowerCase();
    const isMexican = lang === 'es-mx' || lang === 'es_mx';
    const isHighQuality = name.includes('natural') || name.includes('sabina') || name.includes('jorge') || name.includes('google');
    return isMexican && isHighQuality;
  });

  // 2. Cualquier voz en español de México (es-MX)
  if (!voice) {
    voice = voices.find(v => v.lang === 'es-MX' || v.lang === 'es_MX');
  }

  // 3. Voces de alta calidad en español latinoamericano o US (es-419, es-US, es-CO, etc.)
  if (!voice) {
    voice = voices.find(v => {
      const name = (v.name || '').toLowerCase();
      const lang = (v.lang || '').toLowerCase();
      const isLatam = (lang.startsWith('es-') || lang.startsWith('es_')) && !lang.includes('es');
      const isHighQuality = name.includes('natural') || name.includes('google') || name.includes('dalia') || name.includes('paulina');
      return isLatam && isHighQuality;
    });
  }

  // 4. Cualquier voz en español latinoamericano
  if (!voice) {
    voice = voices.find(v => v.lang && (v.lang.startsWith('es-') || v.lang.startsWith('es_')) && !v.lang.toUpperCase().includes('ES-ES'));
  }

  // 5. Cualquier voz en español
  if (!voice) {
    voice = voices.find(v => (v.lang && v.lang.toLowerCase().startsWith('es')) || (v.name && v.name.toLowerCase().includes('spanish')));
  }

  // 6. Fallback
  if (!voice) voice = voices[0];

  cachedSpanishVoice = voice;
  return voice;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedSpanishVoice = null;
    getSpanishVoice();
  };
}

/**
 * Normaliza y expande tecnicismos, siglas y abreviaturas para que la voz
 * las pronuncie de forma natural, completa y comprensible en español.
 */
function cleanNarrationText(text) {
  if (!text) return '';
  let clean = text.replace(/<\/?[^>]+(>|$)/g, ' ');

  // Siglas técnicas pronunciadas letra por letra de forma natural
  clean = clean.replace(/\bAPU\b/g, 'A P U');
  clean = clean.replace(/\bPDF\b/g, 'P D F');
  clean = clean.replace(/\bERP\b/g, 'E R P');
  clean = clean.replace(/\bFASAR\b/g, 'Fasar');
  clean = clean.replace(/\bLOPSRM\b/g, 'Ley de Obra Pública');
  clean = clean.replace(/\bBESOP\b/g, 'Besop');
  clean = clean.replace(/\bSHA-256\b/gi, 'Sha doscientos cincuenta y seis');
  clean = clean.replace(/\bSHA\b/g, 'Sha');
  clean = clean.replace(/\bMXN\b/g, 'pesos mexicanos');
  clean = clean.replace(/\bDRO\b/g, 'D R O');
  clean = clean.replace(/\bCSV\b/g, 'C S V');
  clean = clean.replace(/\bJSON\b/g, 'J S O N');
  clean = clean.replace(/\bIVA\b/g, 'I V A');

  // Unidades de medida y símbolos
  clean = clean.replace(/\bm2\b/g, 'metros cuadrados');
  clean = clean.replace(/\bm3\b/g, 'metros cúbicos');
  clean = clean.replace(/\bkg\b/g, 'kilogramos');
  clean = clean.replace(/\bTon\b/g, 'toneladas');
  clean = clean.replace(/\b1:1\b/g, 'proporción uno a uno');
  clean = clean.replace(/\bAlt\s*\+\s*Flechas?\s*(Arriba\/Abajo)?\b/gi, 'tecla Alt más flechas de dirección');
  clean = clean.replace(/\b#001\b/g, 'número uno');
  clean = clean.replace(/\b#002\b/g, 'número dos');
  clean = clean.replace(/\b#(\d+)\b/g, 'número $1');
  clean = clean.replace(/\+\s*Nuevo Proyecto/gi, 'Nuevo Proyecto');
  clean = clean.replace(/\+\s*Nueva Partida/gi, 'Nueva Partida');
  clean = clean.replace(/\+\s*Registrar Gasto/gi, 'Registrar Gasto');
  clean = clean.replace(/\+\s*Nueva Nota/gi, 'Nueva Nota');
  clean = clean.replace(/\+\s*Invitar/gi, 'Invitar');
  clean = clean.replace(/f'c=250(?:\s*kg\/cm2)?/gi, 'concreto doscientos cincuenta');
  clean = clean.replace(/e=14cm/gi, 'espesor catorce centímetros');
  clean = clean.replace(/\$3,850\.00/g, 'tres mil ochocientos cincuenta pesos');
  clean = clean.replace(/\$417,726\.92/g, 'cuatrocientos diecisiete mil pesos');
  clean = clean.replace(/@([A-ZÁÉÍÓÚa-záéíóú]+)/g, 'a $1');

  // Puntuación y cadencia
  clean = clean.replace(/[•·—–]/g, ' ');
  clean = clean.replace(/[()]/g, ', ');
  clean = clean.replace(/["'«»]/g, '');
  clean = clean.replace(/\s+/g, ' ').trim();
  if (clean && !/[.!?]$/.test(clean)) {
    clean += '.';
  }
  return clean;
}

/**
 * Reproduce la narración por voz asegurando oraciones completas y fluidas.
 */
function speakNarration(rawText, onComplete) {
  if (!isVoiceNarrationEnabled || typeof window === 'undefined' || !window.speechSynthesis) {
    if (onComplete) onComplete();
    return;
  }

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();

    const cleanText = cleanNarrationText(rawText);
    if (!cleanText) {
      if (onComplete) onComplete();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    currentUtterance = utterance; // Evita recolección de basura prematura en Chromium

    const voice = getSpanishVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || 'es-MX';
    } else {
      utterance.lang = 'es-MX';
    }

    // Cadencia natural: 0.98 a 1.0x para máxima claridad y fluidez en cada palabra
    let rate = 0.98;
    if (playbackSpeed === 1.5) rate = 1.25;
    else if (playbackSpeed === 2.0) rate = 1.45;
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    isSpeakingCurrentSentence = true;

    utterance.onstart = () => {
      isSpeakingCurrentSentence = true;
    };

    utterance.onend = () => {
      isSpeakingCurrentSentence = false;
      currentUtterance = null;
      if (onComplete) onComplete();
    };

    utterance.onerror = () => {
      isSpeakingCurrentSentence = false;
      currentUtterance = null;
      if (onComplete) onComplete();
    };

    setTimeout(() => {
      try {
        if (!isVoiceNarrationEnabled || !isPlaying) {
          isSpeakingCurrentSentence = false;
          return;
        }
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        isSpeakingCurrentSentence = false;
      }
    }, 25);
  } catch (err) {
    console.warn('[VideoSimulator] Error en síntesis de voz:', err);
    isSpeakingCurrentSentence = false;
  }
}

function stopNarration() {
  isSpeakingCurrentSentence = false;
  currentUtterance = null;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
}

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch (e) {}
  }
  return audioCtx;
}

function playSfxClick() {
  if (!isVoiceNarrationEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.045);
  } catch (e) {}
}

function playSfxType() {
  if (!isVoiceNarrationEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1100 + Math.random() * 300, ctx.currentTime);
    gain.gain.setValueAtTime(0.025, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.025);
  } catch (e) {}
}

function playSfxChime() {
  if (!isVoiceNarrationEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.06, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.3);
    });
  } catch (e) {}
}

export function toggleVoiceNarration() {
  isVoiceNarrationEnabled = !isVoiceNarrationEnabled;
  if (!isVoiceNarrationEnabled) {
    stopNarration();
  } else {
    lastSpokenKey = null;
    const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
    const steps = mod.steps || [];
    let currentStep = steps[0];
    for (let i = steps.length - 1; i >= 0; i--) {
      if (currentTimeSeconds >= steps[i].t) {
        currentStep = steps[i];
        break;
      }
    }
    if (isPlaying && currentStep) {
      speakNarration(currentStep.text);
    }
  }

  updateNarrationButtonUI();
}

function updateNarrationButtonUI() {
  const btn = document.getElementById('video-btn-narration-toggle');
  const icon = document.getElementById('video-narration-icon');
  const label = document.getElementById('video-narration-label');
  if (!btn || !icon || !label) return;

  if (isVoiceNarrationEnabled) {
    btn.className = 'px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-medium text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs';
    icon.className = 'fa-solid fa-volume-high text-xs text-amber-400';
    label.textContent = 'Audio ON';
    btn.title = 'Voz de narración activada (clic para silenciar)';
  } else {
    btn.className = 'px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-medium text-xs flex items-center gap-1.5 transition cursor-pointer';
    icon.className = 'fa-solid fa-volume-xmark text-xs text-slate-500';
    label.textContent = 'Audio OFF';
    btn.title = 'Voz de narración silenciada (clic para activar)';
  }
}

// =========================================================================
// MÉTODOS DEL CONTROLADOR DEL REPRODUCTOR
// =========================================================================

export function openVideoSimulatorModal(moduleId = 1) {
  currentModuleId = Number(moduleId) || 1;
  isVideoModalOpen = true;
  currentTimeSeconds = 0;
  isPlaying = true;
  lastSpokenKey = null;
  lastClickedStepKey = null;

  getAudioContext();

  injectVideoSimulatorDom();
  loadModuleInPlayer(currentModuleId);

  const modal = document.getElementById('cubikar-video-simulator-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  updateNarrationButtonUI();
  startPlaybackTimer();
}

export function closeVideoSimulatorModal() {
  pauseVideoSimulation();
  stopNarration();
  isVideoModalOpen = false;

  const modal = document.getElementById('cubikar-video-simulator-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}
export const closeVideoSimulatorModalAction = closeVideoSimulatorModal;

export function selectVideoModule(moduleId) {
  stopNarration();
  currentModuleId = Number(moduleId);
  currentTimeSeconds = 0;
  lastSpokenKey = null;
  lastClickedStepKey = null;
  loadModuleInPlayer(currentModuleId);
  if (!isPlaying) {
    toggleVideoPlayPause();
  }
}

function loadModuleInPlayer(modId) {
  const mod = VIDEO_MODULES.find(m => m.id === modId) || VIDEO_MODULES[0];

  const titleEl = document.getElementById('video-player-mod-title');
  const badgeEl = document.getElementById('video-player-mod-badge');
  const totalTimeEl = document.getElementById('video-player-total-time');

  if (titleEl) titleEl.textContent = `${mod.id}. ${mod.title}`;
  if (badgeEl) badgeEl.textContent = mod.badge;
  if (totalTimeEl) totalTimeEl.textContent = formatTimeDisplay(mod.duration);

  // Renderizar la pantalla simulada correspondiente al módulo
  renderModuleVisualScene(mod.id);

  // Resaltar elemento activo en la lista lateral
  document.querySelectorAll('.video-playlist-item').forEach(el => {
    const elId = Number(el.getAttribute('data-mod-id'));
    if (elId === mod.id) {
      el.classList.add('bg-blue-600/30', 'border-blue-500/60', 'text-white');
      el.classList.remove('bg-slate-800/60', 'border-slate-800', 'text-slate-300');
    } else {
      el.classList.remove('bg-blue-600/30', 'border-blue-500/60', 'text-white');
      el.classList.add('bg-slate-800/60', 'border-slate-800', 'text-slate-300');
    }
  });

  updateProgressScrubber(0, mod.duration);
  renderSimulationStageFrame(0);
}

export function toggleVideoPlayPause() {
  isPlaying = !isPlaying;
  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) {
    playIcon.className = isPlaying ? 'fa-solid fa-pause text-base' : 'fa-solid fa-play text-base';
  }

  if (isPlaying) {
    getAudioContext();
    startPlaybackTimer();
  } else {
    pauseVideoSimulation();
  }
}

function pauseVideoSimulation() {
  isPlaying = false;
  stopNarration();
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) playIcon.className = 'fa-solid fa-play text-base';
}

function startPlaybackTimer() {
  if (simulationInterval) clearInterval(simulationInterval);

  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) playIcon.className = 'fa-solid fa-pause text-base';

  const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
  const stepMs = 250;

  simulationInterval = setInterval(() => {
    if (!isPlaying) return;

    // Sincronización inteligente con la voz: si el narrador está hablando la oración actual,
    // retenemos suavemente el cronómetro en el límite antes de avanzar al siguiente paso o terminar,
    // asegurando que las palabras y oraciones se pronuncien COMPLETAS sin cortes.
    const steps = mod.steps || [];
    let currentStepIndex = 0;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (currentTimeSeconds >= steps[i].t) {
        currentStepIndex = i;
        break;
      }
    }

    const nextStep = steps[currentStepIndex + 1];
    const nextBoundary = nextStep ? nextStep.t : mod.duration;
    const isSpeechActive = isVoiceNarrationEnabled && (isSpeakingCurrentSentence || (window.speechSynthesis && window.speechSynthesis.speaking));

    if (isSpeechActive && (currentTimeSeconds + 0.35 >= nextBoundary)) {
      renderSimulationStageFrame(currentTimeSeconds);
      return;
    }

    currentTimeSeconds += (stepMs / 1000) * playbackSpeed;

    if (currentTimeSeconds >= mod.duration) {
      currentTimeSeconds = mod.duration;
      if (isSpeechActive) {
        renderSimulationStageFrame(currentTimeSeconds);
        return;
      }
      pauseVideoSimulation();
      playSfxChime();
      if (currentModuleId < VIDEO_MODULES.length) {
        setTimeout(() => {
          selectVideoModule(currentModuleId + 1);
        }, 1400);
      }
    }

    updateProgressScrubber(currentTimeSeconds, mod.duration);
    renderSimulationStageFrame(currentTimeSeconds);
  }, stepMs);
}

export function seekVideoSimulation(event) {
  const progressBar = document.getElementById('video-progress-container');
  if (!progressBar) return;

  const rect = progressBar.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));

  const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
  currentTimeSeconds = pct * mod.duration;

  stopNarration();
  lastSpokenKey = null;
  lastClickedStepKey = null;

  updateProgressScrubber(currentTimeSeconds, mod.duration);
  renderSimulationStageFrame(currentTimeSeconds);
}

export function cyclePlaybackSpeed() {
  if (playbackSpeed === 1.0) playbackSpeed = 1.5;
  else if (playbackSpeed === 1.5) playbackSpeed = 2.0;
  else playbackSpeed = 1.0;

  const speedBadge = document.getElementById('video-speed-indicator');
  if (speedBadge) speedBadge.textContent = `${playbackSpeed}x`;

  if (isPlaying && isVoiceNarrationEnabled) {
    const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
    const steps = mod.steps || [];
    for (let i = steps.length - 1; i >= 0; i--) {
      if (currentTimeSeconds >= steps[i].t) {
        speakNarration(steps[i].text);
        break;
      }
    }
  }
}

export function restartCurrentVideo() {
  stopNarration();
  currentTimeSeconds = 0;
  isPlaying = true;
  lastSpokenKey = null;
  lastClickedStepKey = null;
  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) playIcon.className = 'fa-solid fa-pause text-base';
  startPlaybackTimer();
}

function formatTimeDisplay(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
}

function updateProgressScrubber(current, total) {
  const bar = document.getElementById('video-progress-fill');
  const knob = document.getElementById('video-progress-knob');
  const timeCurrentEl = document.getElementById('video-player-current-time');

  const pct = total > 0 ? (current / total) * 100 : 0;

  if (bar) bar.style.width = `${pct}%`;
  if (knob) knob.style.left = `${pct}%`;
  if (timeCurrentEl) timeCurrentEl.textContent = formatTimeDisplay(current);
}

function renderSimulationStageFrame(seconds) {
  const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
  const steps = mod.steps || [];

  let currentStep = steps[0];
  let currentStepIndex = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (seconds >= steps[i].t) {
      currentStep = steps[i];
      currentStepIndex = i;
      break;
    }
  }

  // Actualizar subtítulo sincronizado con icono de narración
  const subtitleEl = document.getElementById('video-subtitle-caption');
  if (subtitleEl && currentStep) {
    subtitleEl.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600/30 text-blue-300 font-mono text-[10px] font-bold border border-blue-400/30 mr-2 shrink-0">
        <i class="fa-solid ${isVoiceNarrationEnabled ? 'fa-volume-high text-amber-400 animate-pulse' : 'fa-play text-blue-400'} text-[9px]"></i> ${formatTimeDisplay(seconds)}
      </span>
      <span class="text-slate-100 text-xs sm:text-[13px] font-medium leading-relaxed">${currentStep.text}</span>
    `;
  }

  // Disparar narración por voz si cambió de paso
  const stepKey = `${currentModuleId}_${currentStepIndex}`;
  if (isPlaying && isVoiceNarrationEnabled && lastSpokenKey !== stepKey) {
    lastSpokenKey = stepKey;
    speakNarration(currentStep.text);
  }

  // Control Dinámico de Vistas y Ventanas Flotantes para Módulo 7 (IA Gemini Grounding)
  if (currentModuleId === 7) {
    const aiMenu = document.getElementById('mock-step7-ai-menu');
    const aiOverlay = document.getElementById('mock-step7-modal-overlay');
    if (aiMenu && aiOverlay) {
      if (seconds < 12) {
        aiMenu.style.display = 'block';
        aiOverlay.style.display = 'none';
        aiOverlay.classList.add('hidden');
      } else {
        aiMenu.style.display = 'none';
        aiOverlay.style.display = 'flex';
        aiOverlay.classList.remove('hidden');
      }
    }
  }

  // Control Dinámico para Módulo 2 (Modo de Trabajo: Obras Propias vs Invitaciones)
  if (currentModuleId === 2) {
    const scopeSelect = document.getElementById('mock-step2-scope-select');
    const statusBadge = document.getElementById('mock-step2-status-badge');
    const ownCards = document.getElementById('mock-step2-cards-owned');
    const invitedCards = document.getElementById('mock-step2-cards-invited');

    if (scopeSelect && statusBadge && ownCards && invitedCards) {
      if (seconds < 12) {
        scopeSelect.value = 'owned';
        statusBadge.innerHTML = `
          <div class="flex items-center gap-2 bg-slate-900/90 border border-amber-500/40 px-3 py-1.5 rounded-xl shadow-inner text-xs">
            <i class="fa-solid fa-crown text-amber-400"></i>
            <span class="text-slate-300">Membresía activa: <strong class="text-white">Plan Profesional</strong></span>
            <span class="text-amber-300 font-mono text-[10px] bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30 font-bold">(3/5 obras)</span>
          </div>
        `;
        ownCards.style.display = 'grid';
        invitedCards.style.display = 'none';
      } else {
        scopeSelect.value = 'invited';
        statusBadge.innerHTML = `
          <div class="flex items-center gap-2 bg-slate-900/90 border border-indigo-500/40 px-3 py-1.5 rounded-xl shadow-inner text-xs ring-2 ring-indigo-400 animate-pulse">
            <i class="fa-solid fa-user-check text-indigo-400"></i>
            <span class="text-slate-300">Despacho Invitador: <strong class="text-white">Arq. Carlos González</strong></span>
            <span class="text-indigo-300 font-mono text-[10px] bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/30 font-bold">Rol: Editor</span>
          </div>
        `;
        ownCards.style.display = 'none';
        invitedCards.style.display = 'grid';
      }
    }
  }

  // Animar el cursor virtual hacia el objetivo exacto de la escena
  animateVirtualStageCursor(currentStep, seconds);
}

function animateVirtualStageCursor(step, seconds) {
  const cursor = document.getElementById('virtual-cursor-pointer');
  const ripple = document.getElementById('virtual-cursor-ripple');
  if (!cursor || !step) return;

  const stage = document.getElementById('virtual-stage-viewport') || document.getElementById('virtual-desktop-screen');
  if (!stage) return;

  const targetEl = document.getElementById(step.targetId);
  const stageRect = stage.getBoundingClientRect();

  let targetX = stage.clientWidth / 2;
  let targetY = stage.clientHeight / 2;

  if (targetEl) {
    const targetRect = targetEl.getBoundingClientRect();
    targetX = targetRect.left - stageRect.left + (targetRect.width / 2);
    targetY = targetRect.top - stageRect.top + (targetRect.height / 2);
  }

  cursor.style.transform = `translate(${targetX}px, ${targetY}px)`;
  cursor.style.opacity = '1';

  // Efecto de Clic (Ripple) y Sonido SFX
  const stepElapsed = seconds - step.t;
  const clickKey = `${currentModuleId}_${step.t}`;
  if (stepElapsed > 0.3 && stepElapsed < 1.1 && ripple) {
    ripple.style.left = `${targetX}px`;
    ripple.style.top = `${targetY}px`;
    ripple.className = 'virtual-ripple-ring active';

    if (step.action === 'click' && stepElapsed >= 0.3 && stepElapsed < 0.7 && lastClickedStepKey !== clickKey) {
      lastClickedStepKey = clickKey;
      playSfxClick();
    }
  } else if (ripple) {
    ripple.className = 'virtual-ripple-ring';
  }

  // Efecto de tipeo simulado si hay valor con sonido de tecleo
  if (step.action === 'type' && step.value && targetEl) {
    const textSpan = targetEl.querySelector('.mock-type-value') || targetEl;
    if (textSpan && textSpan.tagName !== 'INPUT') {
      const fullText = step.value;
      const progress = Math.min(1, Math.max(0, (seconds - step.t) / 2));
      const chars = Math.floor(progress * fullText.length);
      const prevChars = Number(textSpan.getAttribute('data-typed-chars') || '0');
      if (chars > prevChars) {
        textSpan.setAttribute('data-typed-chars', String(chars));
        playSfxType();
      }
      textSpan.textContent = fullText.slice(0, chars);
    }
  }
}

// =========================================================================
// INYECCIÓN DE LA INTERFAZ DEL REPRODUCTOR EN EL DOM
// =========================================================================

function injectVideoSimulatorDom() {
  const existing = document.getElementById('cubikar-video-simulator-modal');
  if (existing) {
    if (existing.getAttribute('data-version') !== '20261115_cubikar_arq_v4') {
      existing.remove();
    } else {
      return;
    }
  }

  const modal = document.createElement('div');
  modal.id = 'cubikar-video-simulator-modal';
  modal.setAttribute('data-version', '20261115_cubikar_arq_v4');
  modal.className = 'fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[99998] hidden items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95 duration-150 select-none';
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden text-slate-100">
      
      <!-- Barra Superior -->
      <div class="bg-slate-950 px-4 sm:px-6 py-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-blue-600/25 border border-blue-400/40 text-blue-400 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-play text-base"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span id="video-player-mod-badge" class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-600/30 text-blue-300 border border-blue-400/30 uppercase tracking-wide">
                Módulo 1
              </span>
              <span class="px-2.5 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                <i class="fa-solid fa-volume-high text-[9px]"></i> Narración en Español Fluida
              </span>
              <span class="text-[10px] text-slate-400 hidden sm:inline">• cubikar Arquitectura</span>
            </div>
            <h2 id="video-player-mod-title" class="font-bold text-xs sm:text-sm text-white truncate leading-tight mt-0.5">
              1. Crear Proyecto e Identidad del Despacho
            </h2>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button type="button" onclick="window.closeVideoSimulatorModalAction()"
                  class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                  title="Cerrar Reproductor">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
      </div>

      <!-- Cuerpo: Escenario + Playlist -->
      <div class="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        
        <!-- Escenario de Video y Controles -->
        <div class="flex-1 flex flex-col bg-slate-950/70 p-3 sm:p-4 min-w-0 overflow-hidden">
          
          <!-- Pantalla Virtual de Simulación Fotorrealista -->
          <div id="virtual-desktop-screen" class="relative flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner flex flex-col min-h-[300px] sm:min-h-[400px]">
            
            <div class="bg-slate-950 px-3.5 py-1.5 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                <span class="font-mono text-[10px] ml-1.5 text-slate-400">cubikar. Arquitectura • Simulación Oficial en Vivo</span>
              </div>
              <span class="text-[10px] font-bold text-blue-400 bg-blue-950/60 px-2.5 py-0.5 rounded border border-blue-800/40">
                • 100% Interactiva
              </span>
            </div>

            <!-- Contenido dinámico del módulo actual -->
            <div id="virtual-stage-viewport" class="flex-1 p-0 overflow-hidden relative flex flex-col bg-slate-900 text-slate-100 select-none min-h-[380px] w-full h-full">
              <div id="virtual-stage-dynamic-content" class="w-full h-full flex-1 flex flex-col overflow-hidden relative"></div>

              <!-- Cursor Virtual Animado (z-50 para estar por encima de modales sin estorbar) -->
              <div id="virtual-cursor-pointer" class="absolute pointer-events-none transition-all duration-300 ease-out z-50" style="left: 0; top: 0; opacity: 0;">
                <svg class="w-6 h-6 drop-shadow-lg text-amber-400 fill-current" viewBox="0 0 24 24">
                  <path d="M4 0l16 12.279-6.951 1.17 4.325 8.817-3.596 1.734-4.35-8.879-5.428 5.428z" stroke="#0f172a" stroke-width="1.5" />
                </svg>
              </div>

              <!-- Anillo de Clic Virtual (Ripple) -->
              <div id="virtual-cursor-ripple" class="virtual-ripple-ring pointer-events-none z-50"></div>
            </div>

            <!-- Subtítulos Sincronizados (CC) -->
            <div class="bg-slate-950 px-4 py-3 border-t border-slate-800 flex items-center min-h-[52px] shrink-0 text-xs sm:text-sm text-slate-100 font-medium leading-relaxed">
              <div id="video-subtitle-caption" class="flex items-center min-w-0 flex-1 flex-wrap gap-2"></div>
            </div>

          </div>

          <!-- Controles de Video -->
          <div class="pt-3 flex flex-col gap-2 shrink-0">
            <div id="video-progress-container" onclick="window.seekVideoSimulationAction(event)"
                 class="h-2.5 bg-slate-800 hover:bg-slate-700 rounded-full cursor-pointer relative overflow-hidden transition-all group">
              <div id="video-progress-fill" class="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-100" style="width: 0%;"></div>
              <div id="video-progress-knob" class="absolute top-0 bottom-0 w-3 bg-white rounded-full shadow -ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" style="left: 0%;"></div>
            </div>

            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-3">
                <button type="button" onclick="window.toggleVideoPlayPauseAction()"
                        class="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white flex items-center justify-center transition shadow-md shadow-blue-600/30 cursor-pointer"
                        title="Reproducir / Pausar">
                  <i id="video-btn-play-icon" class="fa-solid fa-play text-sm"></i>
                </button>
                <button type="button" onclick="window.restartCurrentVideoAction()"
                        class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                        title="Reiniciar Video">
                  <i class="fa-solid fa-rotate-left text-xs"></i>
                </button>
                <div class="font-mono text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <span id="video-player-current-time">00:00</span>
                  <span class="text-slate-500">/</span>
                  <span id="video-player-total-time">00:30</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <!-- Botón de Audio y Narración por Voz -->
                <button type="button" id="video-btn-narration-toggle" onclick="window.toggleVoiceNarrationAction()"
                        class="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-medium text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        title="Voz de narración en español y efectos de sonido (Clic para silenciar)">
                  <i id="video-narration-icon" class="fa-solid fa-volume-high text-xs text-amber-400"></i>
                  <span id="video-narration-label" class="hidden sm:inline">Audio ON</span>
                </button>

                <button type="button" onclick="window.cyclePlaybackSpeedAction()"
                        class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-mono font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                        title="Velocidad">
                  <i class="fa-solid fa-gauge-high text-[10px] text-blue-400"></i>
                  <span id="video-speed-indicator">1.0x</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- Playlist Lateral: Los 17 Módulos de cubikar Arquitectura -->
        <div class="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col shrink-0 min-h-0">
          <div class="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
            <span class="font-bold text-xs text-white flex items-center gap-2">
              <i class="fa-solid fa-list-ol text-blue-400"></i>
              <span>Temario de Módulos (${VIDEO_MODULES.length})</span>
            </span>
            <span class="text-[10px] font-mono text-emerald-400 font-bold">100% Cubierto</span>
          </div>

          <div class="flex-1 overflow-y-auto custom-scroll p-2 space-y-1.5">
            ${VIDEO_MODULES.map(m => `
              <div onclick="window.selectVideoModuleAction(${m.id})"
                   data-mod-id="${m.id}"
                   class="video-playlist-item p-2 rounded-xl border border-slate-800 bg-slate-800/60 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-2.5 text-xs select-none">
                <div class="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 text-blue-400 flex items-center justify-center shrink-0 text-xs">
                  <i class="fa-solid ${m.icon}"></i>
                </div>
                <div class="min-w-0 flex-1">
                  <span class="font-semibold block truncate leading-tight">${m.id}. ${m.title}</span>
                  <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span>${m.duration}s</span>
                    <span>•</span>
                    <span class="text-blue-400 font-medium">${m.badge.split('•')[1] || ''}</span>
                  </div>
                </div>
                <i class="fa-solid fa-circle-play text-xs text-slate-500 opacity-60"></i>
              </div>
            `).join('')}
          </div>

          <div class="p-2.5 border-t border-slate-800 bg-slate-950/50 shrink-0">
            <button type="button" onclick="window.closeVideoSimulatorModalAction(); window.startInteractiveTour('master', true);"
                    class="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer">
              <i class="fa-solid fa-person-walking-arrow-right text-xs"></i>
              <span>Iniciar Tour en Vivo (${VIDEO_MODULES.length} Módulos)</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  `;

  document.body.appendChild(modal);

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .virtual-ripple-ring {
      position: absolute;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 3px solid rgba(59, 130, 246, 0.9);
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
      pointer-events: none;
    }
    .virtual-ripple-ring.active {
      animation: virtualRipplePulse 0.5s ease-out forwards;
    }
    @keyframes virtualRipplePulse {
      0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
    }
  `;
  document.head.appendChild(styleEl);
}

if (typeof window !== 'undefined') {
  window.openVideoSimulatorModal = openVideoSimulatorModal;
  window.closeVideoSimulatorModalAction = closeVideoSimulatorModal;
  window.selectVideoModuleAction = selectVideoModule;
  window.toggleVideoPlayPauseAction = toggleVideoPlayPause;
  window.seekVideoSimulationAction = seekVideoSimulation;
  window.cyclePlaybackSpeedAction = cyclePlaybackSpeed;
  window.restartCurrentVideoAction = restartCurrentVideo;
  window.toggleVoiceNarrationAction = toggleVoiceNarration;
  window.renderSimulationStageFrame = renderSimulationStageFrame;
}
