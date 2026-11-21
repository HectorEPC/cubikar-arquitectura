// js/modules/calendario/procesosConstructivosDB.js
// Base de conocimiento de Procesos Constructivos para Cubikar (Programa de Obra / Gantt).
// Usada por el botón ✨ Auto-Programar (calendarioAutoProgramService.js). Sin dependencias externas.
//
// Cómo leerla:
//  - Cada TIPO DE OBRA corresponde 1:1 con el selector "Tipo de obra" del proyecto en Cubikar.
//  - Cada ETAPA tiene palabras clave (texto normalizado: minúsculas y sin acentos) para clasificar
//    automáticamente los conceptos del presupuesto.
//  - dependeDe: enlaces entre etapas.
//      tipo 'FS' = Fin-a-Inicio (FI): inicia al terminar la predecesora.
//      tipo 'SS' = Inicio-a-Inicio (II): inicia en paralelo, "lag" días después de que arranque la predecesora.
//      lag > 0 = espera (curado, secado), lag < 0 = traslape.
//  - pctDuracion: rango típico [mín, máx] del plazo total que ocupa la etapa (referencia, no regla).
//  - excluir: palabras que, si aparecen en la descripción, impiden clasificar el concepto en esa etapa
//    (ej. "Aplanado en muros" no es la etapa de Muros).
//  - Los valores marcados con validar: true son referencias generales que el residente debe confirmar.

export const PROCESOS_DB_VERSION = '2026.11';

// ─────────────────────────────────────────────────────────────
// 1. TIEMPOS DE ESPERA TÉCNICOS (se aplican como "lag" en los enlaces)
// ─────────────────────────────────────────────────────────────
export const REGLAS_ESPERA = {
  curadoConcreto: {
    dias: 7,
    descripcion: 'Curado húmedo continuo mínimo del concreto convencional (f\'c 200-250 kg/cm²).'
  },
  reapuntalamientoLosa: {
    dias: 7,
    rango: [7, 10],
    descripcion: 'Retiro de cimbra principal dejando puntales de seguridad (edificación vertical).'
  },
  descimbradoLosa: {
    dias: 14,
    rango: [14, 28],
    descripcion: 'Descimbrado total de losas; lo ideal estructural son 28 días (100% de resistencia).'
  },
  impermeabilizarLosaNueva: {
    dias: 28,
    rango: [21, 28],
    descripcion: 'Esperar maduración/secado de la losa antes del impermeabilizante definitivo para evitar ampollas.'
  },
  aplanadoAntesDePintura: {
    dias: 7,
    rango: [7, 14],
    descripcion: 'Aplanado de mortero completamente seco antes de sellador y pintura (evita salitre).'
  },
  curadoAplanado: {
    dias: 2,
    rango: [2, 3],
    descripcion: 'Curado leve del aplanado para evitar fisuras por contracción.'
  },
  pruebaHidrostaticaAntesDeRelleno: {
    dias: 1,
    validar: true,
    descripcion: 'Las redes de agua potable deben pasar prueba de presión antes de rellenar la zanja.'
  },
  riegoImpregnacionAntesDeCarpeta: {
    dias: 2,
    validar: true,
    descripcion: 'Tiempo de penetración/curado del riego de impregnación antes de la carpeta (según especificación).'
  }
};

// ─────────────────────────────────────────────────────────────
// 2. TIPOS DE OBRA (mismos 6 del selector de Cubikar)
// ─────────────────────────────────────────────────────────────
export const TIPOS_OBRA = {

  // ═══════════════════════════════════════════════════════════
  edificacion: {
    id: 'edificacion',
    valorSelector: 'Edificación',
    label: 'Edificación (Torres, Corporativos, Departamentos)',
    perfilMotorActual: 'edificacion',
    palabrasDeteccion: ['torre', 'corporativo', 'departamento', 'edificio', 'oficinas', 'hospital', 'hotel', 'condominio vertical', 'niveles'],
    referenciaDuracion: 'Estructura por ciclos de 4 a 7 días por nivel (concreto en sitio con cimbra modular o losacero).',
    estrategia: 'Traslape vertical de frentes: cuando la estructura sube, los niveles inferiores liberados arrancan albañilería, instalaciones y acabados (fast-track controlado con protecciones perimetrales).',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Preliminares, tapiales y trazo', pctDuracion: [2, 4],
        palabrasClave: ['limpieza de terreno', 'trazo', 'nivelacion', 'tapial', 'bodega provisional', 'instalacion provisional', 'demolicion previa', 'preliminar'],
        dependeDe: [] },
      { id: 'EXC', orden: 20, nombre: 'Excavación masiva y contención (muro milán, anclas, tablestacas)', pctDuracion: [6, 12], critica: true,
        palabrasClave: ['excavacion masiva', 'muro milan', 'anclaje', 'ancla de tension', 'tablestaca', 'bombeo de achique', 'contencion', 'corte de terreno', 'excavacion'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'CIM', orden: 30, nombre: 'Cimentación (pilas, losa de cimentación, contratrabes)', pctDuracion: [8, 14], critica: true,
        palabrasClave: ['pila', 'pilote', 'losa de cimentacion', 'cajon de cimentacion', 'contratrabe', 'zapata', 'plantilla', 'relleno compactado', 'cimentacion'],
        dependeDe: [{ etapa: 'EXC', tipo: 'SS', lag: 10, motivo: 'Se cimenta por zonas conforme se libera la excavación.', validar: true }] },
      { id: 'SOT', orden: 35, nombre: 'Sótanos y estacionamientos subterráneos', pctDuracion: [5, 12], critica: true,
        palabrasClave: ['sotano', 'estacionamiento subterraneo', 'muro de contencion', 'rampa vehicular', 'cisterna'],
        dependeDe: [{ etapa: 'CIM', tipo: 'FS', lag: 0 }] },
      { id: 'EST', orden: 40, nombre: 'Estructura por niveles (columnas, trabes, muros de cortante, losas)', pctDuracion: [25, 40], critica: true,
        palabrasClave: ['columna', 'trabe', 'muro de concreto', 'muro de cortante', 'losa de entrepiso', 'losacero', 'cimbra', 'acero de refuerzo', 'nivel tipo', 'estructura', 'losa'],
        excluir: ['impermeabil', 'firme', 'piso', 'cableado', 'canalizacion', 'zapata', 'contratrabe', 'relleno', 'cimentacion'],
        dependeDe: [{ etapa: 'SOT', tipo: 'FS', lag: 0 }],
        nota: 'Es el bucle crítico: si se retrasa un colado, empuja todo el programa.' },
      { id: 'ELV', orden: 45, nombre: 'Transporte vertical de obra y elevadores definitivos', pctDuracion: [5, 10], critica: true,
        palabrasClave: ['elevador', 'ascensor', 'grua torre', 'montacargas', 'cubo de elevador'],
        dependeDe: [{ etapa: 'EST', tipo: 'SS', lag: 20, validar: true }] },
      { id: 'ENV', orden: 50, nombre: 'Envolvente: fachada, muros perimetrales y cancelería exterior', pctDuracion: [10, 18],
        palabrasClave: ['fachada', 'muro cortina', 'precolado', 'panel de fachada', 'cancel exterior', 'ventaneria', 'muro perimetral'],
        dependeDe: [{ etapa: 'EST', tipo: 'SS', lag: 30, motivo: 'Arranca cuando hay varios niveles colados abajo.', validar: true }] },
      { id: 'INS', orden: 60, nombre: 'Instalaciones verticales y horizontales (hidrosanitaria, eléctrica, gas, contra incendio, HVAC)', pctDuracion: [15, 25],
        palabrasClave: ['hidraulic', 'sanitari', 'electric', 'canalizacion', 'cableado', 'tablero', 'gas', 'contra incendio', 'rociador', 'sprinkler', 'aire acondicionado', 'hvac', 'extraccion', 'voz y datos', 'cctv', 'bajada pluvial', 'instalacion'],
        dependeDe: [{ etapa: 'EST', tipo: 'SS', lag: 20, motivo: 'Inicia en niveles inferiores ya liberados.', validar: true }] },
      { id: 'ALB', orden: 70, nombre: 'Albañilería, muros divisorios y aplanados', pctDuracion: [10, 18],
        palabrasClave: ['muro divisorio', 'tabique', 'block', 'tablaroca', 'durock', 'aplanado', 'yeso', 'pasta', 'enjarre', 'firme', 'albañileria'],
        dependeDe: [{ etapa: 'EST', tipo: 'SS', lag: 25, validar: true }, { etapa: 'INS', tipo: 'SS', lag: 5 }] },
      { id: 'IMP', orden: 75, nombre: 'Impermeabilización de azoteas', pctDuracion: [1, 3],
        palabrasClave: ['impermeabil', 'entortado', 'chaflan', 'relleno de azotea'],
        dependeDe: [{ etapa: 'EST', tipo: 'FS', lag: 28, regla: 'impermeabilizarLosaNueva' }] },
      { id: 'ACA', orden: 80, nombre: 'Acabados (pisos, recubrimientos, plafones, carpintería, pintura)', pctDuracion: [15, 25],
        palabrasClave: ['piso', 'porcelanato', 'loseta', 'azulejo', 'recubrimiento', 'plafon', 'carpinteria', 'puerta', 'closet', 'cocina', 'pintura', 'canceleria'],
        dependeDe: [{ etapa: 'ALB', tipo: 'SS', lag: 15, validar: true }] },
      { id: 'PRU', orden: 90, nombre: 'Pruebas de instalaciones y equipos', pctDuracion: [2, 4],
        palabrasClave: ['prueba', 'puesta en marcha', 'arranque', 'balanceo', 'comisionamiento'],
        dependeDe: [{ etapa: 'INS', tipo: 'FS', lag: 0 }, { etapa: 'ELV', tipo: 'FS', lag: 0 }] },
      { id: 'ENT', orden: 100, nombre: 'Limpieza final y entrega', pctDuracion: [1, 2],
        palabrasClave: ['limpieza final', 'limpieza fina', 'entrega', 'acta de entrega'],
        dependeDe: [{ etapa: 'ACA', tipo: 'FS', lag: 0 }, { etapa: 'PRU', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['flexi-project.com (traslape de frentes)', 'sinergiacomercial.mx (ruta crítica)', 'habitissimo.com.mx / manoexperta.com (descimbrado)']
  },

  // ═══════════════════════════════════════════════════════════
  vivienda: {
    id: 'vivienda',
    valorSelector: 'Vivienda',
    label: 'Vivienda (Residencial, Casas, Fraccionamientos)',
    perfilMotorActual: 'edificacion',
    palabrasDeteccion: ['casa', 'vivienda', 'residencial', 'fraccionamiento', 'prototipo', 'lote', 'habitacional', 'duplex'],
    referenciaDuracion: 'Casa de 150-200 m² en concreto y mampostería: 4 a 7 meses (ejemplo típico de 24 semanas).',
    estrategia: 'Una casa: secuencia casi lineal con traslapes en instalaciones y acabados. Fraccionamiento: "tren de actividades" por lote; cada cuadrilla pasa al siguiente lote y entra la siguiente especialidad.',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Preliminares (limpieza, despalme, trazo, instalaciones provisionales)', pctDuracion: [4, 8],
        palabrasClave: ['limpieza', 'despalme', 'trazo', 'nivelacion', 'bodega', 'sanitario portatil', 'toma provisional', 'preliminar'],
        dependeDe: [] },
      { id: 'CIM', orden: 20, nombre: 'Cimentación (excavación, plantilla, zapatas/mampostería, dalas, relleno)', pctDuracion: [12, 18], critica: true,
        palabrasClave: ['excavacion', 'cepa', 'plantilla', 'zapata', 'mamposteria', 'piedra braza', 'contratrabe', 'dala de desplante', 'cadena de desplante', 'relleno compactado', 'cimentacion'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'DRE', orden: 25, nombre: 'Drenaje bajo firme, registros y cisterna', pctDuracion: [3, 6],
        palabrasClave: ['albañal', 'registro sanitario', 'cisterna', 'fosa septica', 'bajo firme', 'drenaje'],
        dependeDe: [{ etapa: 'CIM', tipo: 'SS', lag: 5, motivo: 'Debe quedar listo antes de colar firmes.' }] },
      { id: 'MUR', orden: 30, nombre: 'Muros, castillos y dalas (obra negra)', pctDuracion: [15, 25], critica: true,
        palabrasClave: ['muro', 'tabique', 'block', 'castillo', 'dala', 'cerramiento', 'armex', 'enrase'],
        excluir: ['aplanado', 'enjarre', 'pintura', 'azulejo', 'pasta', 'yeso', 'impermeabil', 'cableado', 'canalizacion'],
        dependeDe: [{ etapa: 'CIM', tipo: 'FS', lag: 0 }] },
      { id: 'LOS', orden: 40, nombre: 'Losas de entrepiso y azotea', pctDuracion: [10, 15], critica: true,
        palabrasClave: ['losa', 'cimbra', 'vigueta', 'bovedilla', 'reticular', 'malla electrosoldada', 'trabe', 'escalera de concreto'],
        excluir: ['impermeabil', 'firme', 'piso', 'cableado', 'canalizacion'],
        dependeDe: [{ etapa: 'MUR', tipo: 'FS', lag: 0 }],
        nota: 'Antes de colar se dejan tuberías y cajas embebidas.' },
      { id: 'INS', orden: 50, nombre: 'Instalaciones ocultas (eléctrica, hidráulica, sanitaria, gas)', pctDuracion: [10, 18],
        palabrasClave: ['electric', 'poliducto', 'conduit', 'cableado', 'centro de carga', 'hidraulic', 'sanitari', 'cpvc', 'ppr', 'termofusion', 'cobre', 'gas', 'tinaco', 'calentador'],
        dependeDe: [{ etapa: 'MUR', tipo: 'SS', lag: 5, motivo: 'Chalupas y tubería se colocan mientras se levantan muros.' }] },
      { id: 'APL', orden: 60, nombre: 'Aplanados, enjarres y firmes', pctDuracion: [8, 14],
        palabrasClave: ['aplanado', 'enjarre', 'zarpeo', 'repellado', 'yeso', 'pasta', 'tirol', 'firme'],
        dependeDe: [{ etapa: 'LOS', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }, { etapa: 'INS', tipo: 'SS', lag: 5 }] },
      { id: 'IMP', orden: 65, nombre: 'Impermeabilización de azotea', pctDuracion: [1, 3],
        palabrasClave: ['impermeabil', 'entortado', 'enladrillado', 'chaflan'],
        dependeDe: [{ etapa: 'LOS', tipo: 'FS', lag: 28, regla: 'impermeabilizarLosaNueva' }] },
      { id: 'PIS', orden: 70, nombre: 'Pisos, azulejos y recubrimientos', pctDuracion: [6, 12],
        palabrasClave: ['piso', 'loseta', 'porcelanato', 'ceramica', 'azulejo', 'lambrin', 'zoclo', 'marmol'],
        dependeDe: [{ etapa: 'APL', tipo: 'SS', lag: 7 }] },
      { id: 'CAR', orden: 75, nombre: 'Carpintería, cancelería y herrería', pctDuracion: [5, 10],
        palabrasClave: ['carpinteria', 'puerta', 'closet', 'cocina integral', 'canceleria', 'ventana', 'aluminio', 'herreria', 'barandal', 'porton'],
        dependeDe: [{ etapa: 'APL', tipo: 'FS', lag: 0 }] },
      { id: 'PIN', orden: 80, nombre: 'Pintura', pctDuracion: [4, 8],
        palabrasClave: ['pintura', 'vinilica', 'esmalte', 'sellador'],
        dependeDe: [{ etapa: 'APL', tipo: 'FS', lag: 7, regla: 'aplanadoAntesDePintura' }] },
      { id: 'MUE', orden: 90, nombre: 'Muebles de baño, accesorios eléctricos y luminarias', pctDuracion: [2, 5],
        palabrasClave: ['wc', 'inodoro', 'lavabo', 'regadera', 'mezcladora', 'tarja', 'apagador', 'contacto', 'luminaria', 'lampara'],
        dependeDe: [{ etapa: 'PIS', tipo: 'FS', lag: 0 }, { etapa: 'PIN', tipo: 'SS', lag: 3 }] },
      { id: 'EXT', orden: 92, nombre: 'Obras exteriores (banqueta, cochera, jardín, fachada final)', pctDuracion: [2, 5],
        palabrasClave: ['banqueta', 'cochera', 'jardin', 'barda', 'fachada', 'exterior'],
        dependeDe: [{ etapa: 'APL', tipo: 'SS', lag: 10, validar: true }] },
      { id: 'ENT', orden: 100, nombre: 'Limpieza fina y entrega', pctDuracion: [1, 3],
        palabrasClave: ['limpieza final', 'limpieza fina', 'entrega'],
        dependeDe: [{ etapa: 'MUE', tipo: 'FS', lag: 0 }, { etapa: 'CAR', tipo: 'FS', lag: 0 }, { etapa: 'EXT', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['ingeniandocostos.com', 'ernestoresendiz.mx', 'conavi.gob.mx (curado)', 'usac.edu.gt / 101-app.com (vivienda en serie)']
  },

  // ═══════════════════════════════════════════════════════════
  obra_civil: {
    id: 'obra_civil',
    valorSelector: 'Obra Civil',
    label: 'Obra Civil (Puentes, Cimentaciones, Pavimentaciones)',
    perfilMotorActual: 'infraestructura',
    palabrasDeteccion: ['puente', 'paso superior', 'paso inferior', 'viaducto', 'distribuidor', 'cimentacion profunda', 'muro de contencion', 'pavimentacion'],
    referenciaDuracion: 'Depende del número de ejes/claros; el montaje de trabes suele tomar ~1 semana por claro.',
    estrategia: 'La fabricación de trabes (planta o pie de obra) corre en paralelo desde el arranque; la cimentación profunda y el montaje de trabes suelen ser la ruta crítica.',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Preliminares, accesos, desvíos y trazo', pctDuracion: [3, 6],
        palabrasClave: ['desmonte', 'despalme', 'trazo', 'nivelacion', 'camino de acceso', 'desvio', 'señalamiento de proteccion', 'preliminar'],
        dependeDe: [] },
      { id: 'PIL', orden: 20, nombre: 'Cimentación profunda (perforación, armado y colado de pilas/pilotes)', pctDuracion: [15, 25], critica: true,
        palabrasClave: ['pila', 'pilote', 'perforacion', 'ademe', 'bentonita', 'tremie', 'canasta de acero'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'ZAP', orden: 30, nombre: 'Zapatas / cabezales de cimentación', pctDuracion: [6, 10], critica: true,
        palabrasClave: ['zapata', 'cabezal de cimentacion', 'dado', 'plantilla', 'descabece'],
        dependeDe: [{ etapa: 'PIL', tipo: 'SS', lag: 10, motivo: 'Se avanza por eje conforme se terminan sus pilas.', validar: true }] },
      { id: 'SUB', orden: 40, nombre: 'Subestructura: columnas/fustes, cabezales y estribos', pctDuracion: [15, 22], critica: true,
        palabrasClave: ['columna', 'fuste', 'cabezal', 'capitel', 'estribo', 'muro de ala', 'caballete', 'subestructura'],
        dependeDe: [{ etapa: 'ZAP', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }] },
      { id: 'FAB', orden: 45, nombre: 'Fabricación / suministro de trabes (presforzadas o metálicas)', pctDuracion: [10, 20],
        palabrasClave: ['fabricacion de trabe', 'trabe presforzada', 'trabe aashto', 'trabe cajon', 'trabe metalica', 'suministro de trabe'],
        dependeDe: [{ etapa: 'PRE', tipo: 'SS', lag: 0, motivo: 'Corre en paralelo desde el inicio.' }] },
      { id: 'MON', orden: 50, nombre: 'Apoyos (neoprenos) y montaje de trabes con grúa', pctDuracion: [5, 10], critica: true,
        palabrasClave: ['montaje de trabe', 'izaje', 'neopreno', 'apoyo elastomerico', 'diafragma', 'grua'],
        dependeDe: [{ etapa: 'SUB', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }, { etapa: 'FAB', tipo: 'FS', lag: 0 }] },
      { id: 'LOS', orden: 60, nombre: 'Losa de rodamiento / tablero (prelosas, acero, colado)', pctDuracion: [10, 15], critica: true,
        palabrasClave: ['losa de rodamiento', 'tablero', 'prelosa', 'losa de calzada', 'dren', 'losa'],
        dependeDe: [{ etapa: 'MON', tipo: 'FS', lag: 0 }] },
      { id: 'TER', orden: 65, nombre: 'Terraplenes de acceso y losas de aproximación', pctDuracion: [5, 10],
        palabrasClave: ['terraplen', 'losa de aproximacion', 'relleno de acceso', 'muro mecanicamente estabilizado'],
        dependeDe: [{ etapa: 'SUB', tipo: 'SS', lag: 10, validar: true }] },
      { id: 'COM', orden: 70, nombre: 'Parapetos, guarniciones, juntas de dilatación, carpeta e impermeabilización', pctDuracion: [6, 10],
        palabrasClave: ['parapeto', 'barrera new jersey', 'guarnicion', 'banqueta', 'junta de dilatacion', 'carpeta', 'impermeabil', 'defensa metalica'],
        dependeDe: [{ etapa: 'LOS', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }, { etapa: 'TER', tipo: 'FS', lag: 0 }] },
      { id: 'SEN', orden: 80, nombre: 'Señalamiento, alumbrado y entrega', pctDuracion: [2, 4],
        palabrasClave: ['señalamiento', 'pintura de transito', 'vialeta', 'alumbrado', 'limpieza final', 'entrega', 'apertura'],
        dependeDe: [{ etapa: 'COM', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['structuralia.com', 'ingeniandocostos.com', 'ulmaconstruction.es', 'umich.mx', 'guanajuatoconstruye.mx']
  },

  // ═══════════════════════════════════════════════════════════
  infraestructura: {
    id: 'infraestructura',
    valorSelector: 'Infraestructura',
    label: 'Infraestructura (Vialidades, Redes, Servicios)',
    perfilMotorActual: 'infraestructura',
    palabrasDeteccion: ['vialidad', 'calle', 'avenida', 'urbanizacion', 'red de agua', 'drenaje', 'colector', 'alumbrado publico', 'carretera', 'pavimento'],
    referenciaDuracion: 'Se programa por tramos/cadenamientos; cada tramo repite la secuencia.',
    estrategia: 'Regla de oro: TODAS las redes subterráneas antes de formar la estructura del pavimento, para no romper pavimento nuevo.',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Preliminares, topografía y señalamiento de protección de obra', pctDuracion: [3, 6],
        palabrasClave: ['trazo', 'nivelacion', 'topograf', 'banco de nivel', 'señalamiento preventivo', 'señalamiento de proteccion', 'demolicion', 'preliminar'],
        dependeDe: [] },
      { id: 'DES', orden: 20, nombre: 'Despalme, cortes en caja y demoliciones de pavimento existente', pctDuracion: [5, 10],
        palabrasClave: ['despalme', 'corte en caja', 'excavacion en caja', 'demolicion de pavimento', 'fresado', 'acarreo'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'DRS', orden: 30, nombre: 'Drenaje sanitario y pluvial (zanjas, tubería, pozos de visita, bocas de tormenta)', pctDuracion: [12, 20], critica: true,
        palabrasClave: ['colector', 'drenaje', 'sanitari', 'pluvial', 'pozo de visita', 'bocatormenta', 'boca de tormenta', 'descarga domiciliaria', 'zanja', 'cama de arena'],
        dependeDe: [{ etapa: 'DES', tipo: 'SS', lag: 5, validar: true }],
        nota: 'Se ejecuta primero la red más profunda.' },
      { id: 'AGP', orden: 35, nombre: 'Agua potable (tubería, válvulas, tomas domiciliarias, prueba hidrostática)', pctDuracion: [8, 14], critica: true,
        palabrasClave: ['agua potable', 'toma domiciliaria', 'valvula', 'caja de valvulas', 'hidrante', 'tuberia pead', 'prueba hidrostatica'],
        dependeDe: [{ etapa: 'DRS', tipo: 'SS', lag: 10, motivo: 'Va arriba del drenaje; arranca cuando el drenaje avanza.', validar: true }] },
      { id: 'ELE', orden: 38, nombre: 'Redes eléctricas / telecom subterráneas (ductos y registros)', pctDuracion: [4, 8],
        palabrasClave: ['ducto', 'registro electrico', 'banco de ductos', 'red electrica subterranea', 'fibra optica', 'telecom'],
        dependeDe: [{ etapa: 'DES', tipo: 'SS', lag: 10, validar: true }] },
      { id: 'TER', orden: 40, nombre: 'Terracerías, terraplenes y capa subrasante', pctDuracion: [8, 14], critica: true,
        palabrasClave: ['terraceria', 'terraplen', 'subrasante', 'mejoramiento', 'compactacion al 95', 'compactacion al 90', 'prestamo de banco'],
        dependeDe: [{ etapa: 'DRS', tipo: 'FS', lag: 0 }, { etapa: 'AGP', tipo: 'FS', lag: 1, regla: 'pruebaHidrostaticaAntesDeRelleno' }, { etapa: 'ELE', tipo: 'FS', lag: 0 }] },
      { id: 'GUA', orden: 50, nombre: 'Guarniciones y banquetas', pctDuracion: [6, 12],
        palabrasClave: ['guarnicion', 'banqueta', 'rampa', 'cuneta', 'lavadero', 'bordillo'],
        dependeDe: [{ etapa: 'TER', tipo: 'SS', lag: 5, validar: true }] },
      { id: 'BAS', orden: 55, nombre: 'Sub-base y base hidráulica (+ riego de impregnación)', pctDuracion: [6, 12], critica: true,
        palabrasClave: ['sub-base', 'subbase', 'base hidraulica', 'grava controlada', 'riego de impregnacion'],
        dependeDe: [{ etapa: 'TER', tipo: 'FS', lag: 0 }] },
      { id: 'CAR', orden: 60, nombre: 'Carpeta asfáltica o losa de concreto hidráulico', pctDuracion: [6, 12], critica: true,
        palabrasClave: ['carpeta', 'concreto asfaltico', 'riego de liga', 'concreto hidraulico', 'mr-', 'losa de rodamiento', 'adoquin', 'empedrado', 'pavimento'],
        dependeDe: [{ etapa: 'BAS', tipo: 'FS', lag: 2, regla: 'riegoImpregnacionAntesDeCarpeta' }, { etapa: 'GUA', tipo: 'FS', lag: 0 }] },
      { id: 'ALU', orden: 65, nombre: 'Alumbrado público y mobiliario urbano', pctDuracion: [4, 8],
        palabrasClave: ['alumbrado', 'luminaria', 'poste', 'mobiliario urbano', 'bolardo', 'arborizacion', 'jardineria'],
        dependeDe: [{ etapa: 'GUA', tipo: 'FS', lag: 0 }] },
      { id: 'SEN', orden: 80, nombre: 'Señalamiento horizontal/vertical, limpieza y entrega', pctDuracion: [2, 5],
        palabrasClave: ['señalamiento', 'pintura de transito', 'termoplastica', 'vialeta', 'boya', 'tope', 'limpieza final', 'entrega'],
        dependeDe: [{ etapa: 'CAR', tipo: 'FS', lag: 0 }, { etapa: 'ALU', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['compavsa.com.mx', 'tijuana.gob.mx (especificaciones)', 'unam.mx (terracerías)', 'scribd/slideshare (procesos de pavimentación)']
  },

  // ═══════════════════════════════════════════════════════════
  remodelacion: {
    id: 'remodelacion',
    valorSelector: 'Remodelación',
    label: 'Remodelación y Acabados',
    perfilMotorActual: 'remodelacion',
    palabrasDeteccion: ['remodelacion', 'adecuacion', 'interiores', 'rehabilitacion', 'mantenimiento', 'acondicionamiento', 'fit out', 'oficina'],
    referenciaDuracion: 'Muy variable; la logística del inmueble (horarios, retiro de escombro) suele marcar el ritmo.',
    estrategia: 'Tablaroca a una cara → instalaciones ocultas → pruebas → cierre. Pintura antes del piso definitivo (o proteger el piso).',
    etapas: [
      { id: 'PRO', orden: 10, nombre: 'Protecciones, tapiales y desconexión de servicios', pctDuracion: [2, 5],
        palabrasClave: ['proteccion', 'tapial', 'desconexion', 'señalizacion de seguridad', 'preliminar'],
        dependeDe: [] },
      { id: 'DEM', orden: 20, nombre: 'Desmantelamientos, demoliciones y retiro de escombro', pctDuracion: [6, 12],
        palabrasClave: ['desmantelamiento', 'demolicion', 'retiro', 'desmontaje', 'acarreo de escombro', 'escombro'],
        dependeDe: [{ etapa: 'PRO', tipo: 'FS', lag: 0 }] },
      { id: 'BAS', orden: 30, nombre: 'Trazo y bastidores de tablaroca (cerrados a una cara)', pctDuracion: [6, 10],
        palabrasClave: ['trazo', 'bastidor', 'canal', 'poste metalico', 'tablaroca', 'durock', 'muro divisorio', 'albañileria'],
        dependeDe: [{ etapa: 'DEM', tipo: 'FS', lag: 0 }] },
      { id: 'INS', orden: 40, nombre: 'Instalaciones ocultas (eléctrica, voz y datos, HVAC, rociadores, plomería)', pctDuracion: [15, 25], critica: true,
        palabrasClave: ['electric', 'cableado', 'conduit', 'voz y datos', 'cableado estructurado', 'hvac', 'aire acondicionado', 'ducto', 'rociador', 'sprinkler', 'detector', 'hidraulic', 'sanitari', 'plomeria'],
        dependeDe: [{ etapa: 'BAS', tipo: 'SS', lag: 3, motivo: 'Se entrelaza con los bastidores.' }] },
      { id: 'PRU', orden: 45, nombre: 'Pruebas de presión y continuidad antes de cerrar', pctDuracion: [1, 3],
        palabrasClave: ['prueba de presion', 'prueba de continuidad', 'certificacion de red', 'prueba'],
        dependeDe: [{ etapa: 'INS', tipo: 'FS', lag: 0 }] },
      { id: 'CIE', orden: 50, nombre: 'Aislamiento, cierre de tablaroca y junteo', pctDuracion: [5, 10],
        palabrasClave: ['aislamiento', 'colchoneta', 'lana mineral', 'cierre de muro', 'junteo', 'encintado', 'masillado'],
        dependeDe: [{ etapa: 'PRU', tipo: 'FS', lag: 0 }] },
      { id: 'PLA', orden: 60, nombre: 'Plafones (retícula o tablaroca corrida)', pctDuracion: [5, 10],
        palabrasClave: ['plafon', 'reticula', 'cielo falso', 'falso plafon'],
        dependeDe: [{ etapa: 'CIE', tipo: 'SS', lag: 3 }] },
      { id: 'PIN', orden: 70, nombre: 'Pintura y acabados de muros', pctDuracion: [5, 10],
        palabrasClave: ['pintura', 'sellador', 'papel tapiz', 'lambrin', 'vinilica', 'esmalte'],
        dependeDe: [{ etapa: 'PLA', tipo: 'FS', lag: 0 }] },
      { id: 'PIS', orden: 80, nombre: 'Pisos (autonivelante, alfombra modular, vinílico, porcelanato) y zoclo', pctDuracion: [6, 12],
        palabrasClave: ['piso', 'autonivelante', 'alfombra', 'vinilico', 'lvt', 'spc', 'porcelanato', 'loseta', 'zoclo'],
        dependeDe: [{ etapa: 'PIN', tipo: 'FS', lag: 0 }] },
      { id: 'CAN', orden: 85, nombre: 'Cancelería de cristal, carpintería y herrajes', pctDuracion: [5, 10],
        palabrasClave: ['canceleria', 'cristal templado', 'vidrio', 'carpinteria', 'puerta', 'mueble fijo', 'cocineta', 'herraje', 'herreria'],
        dependeDe: [{ etapa: 'PIS', tipo: 'SS', lag: 2 }] },
      { id: 'FIN', orden: 90, nombre: 'Luminarias, accesorios eléctricos y pruebas finales', pctDuracion: [3, 6],
        palabrasClave: ['luminaria', 'lampara', 'apagador', 'contacto', 'placa', 'accesorio', 'wc', 'lavabo'],
        dependeDe: [{ etapa: 'PIN', tipo: 'FS', lag: 0 }] },
      { id: 'ENT', orden: 100, nombre: 'Retoques, limpieza profunda y entrega', pctDuracion: [2, 4],
        palabrasClave: ['retoque', 'limpieza', 'entrega', 'mobiliario'],
        dependeDe: [{ etapa: 'CAN', tipo: 'FS', lag: 0 }, { etapa: 'FIN', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['obramaestra.com', 'arquiconceptos.com', 'cemix.com']
  },

  // ═══════════════════════════════════════════════════════════
  industrial: {
    id: 'industrial',
    valorSelector: 'Industrial',
    label: 'Industrial / Comercial (Naves, Bodegas, Centros)',
    perfilMotorActual: 'industrial',
    palabrasDeteccion: ['nave', 'bodega', 'industrial', 'almacen', 'planta', 'centro de distribucion', 'centro comercial', 'hangar', 'estructura metalica'],
    referenciaDuracion: 'Nave de 3,000-5,000 m²: 16 a 24 semanas.',
    estrategia: 'Fabricar el acero en taller desde el día 1 en paralelo con plataforma y cimentación. El firme industrial va bajo cubierta y al final de la obra negra para que la maquinaria de montaje no lo dañe.',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Preliminares, plataforma y terracerías', pctDuracion: [6, 12],
        palabrasClave: ['limpieza', 'despalme', 'trazo', 'nivelacion', 'plataforma', 'terraceria', 'tepetate', 'corte', 'relleno', 'preliminar'],
        dependeDe: [] },
      { id: 'CIM', orden: 20, nombre: 'Cimentación: zapatas, dados, contratrabes y anclas', pctDuracion: [10, 16], critica: true,
        palabrasClave: ['excavacion', 'plantilla', 'zapata', 'dado', 'pedestal', 'ancla', 'anchor bolt', 'contratrabe', 'pilote', 'cimentacion'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }],
        nota: 'Anclas fijadas con plantilla metálica de precisión antes del colado.' },
      { id: 'FAB', orden: 25, nombre: 'Fabricación de estructura metálica en taller (corte, soldadura, sandblast, primario)', pctDuracion: [15, 25],
        palabrasClave: ['taller', 'fabricacion', 'habilitado de acero', 'sandblast', 'primario', 'pintura intumescente', 'placa base en taller'],
        dependeDe: [{ etapa: 'PRE', tipo: 'SS', lag: 0, motivo: 'Corre en paralelo desde el inicio.' }] },
      { id: 'MON', orden: 30, nombre: 'Montaje de estructura (columnas, armaduras, contraventeos, largueros, torqueo)', pctDuracion: [10, 16], critica: true,
        palabrasClave: ['montaje', 'columna metalica', 'armadura', 'larguero', 'polin', 'contraventeo', 'estructura metalica', 'grout', 'torqueo', 'grua'],
        dependeDe: [{ etapa: 'CIM', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }, { etapa: 'FAB', tipo: 'FS', lag: 0 }] },
      { id: 'CUB', orden: 40, nombre: 'Cubierta y fachadas (lámina, aislamiento, traslúcidas, canalones)', pctDuracion: [10, 16], critica: true,
        palabrasClave: ['cubierta', 'lamina', 'kr-18', 'r-101', 'multipanel', 'traslucida', 'colchoneta', 'canalon', 'caballete', 'fachada', 'faldon'],
        dependeDe: [{ etapa: 'MON', tipo: 'SS', lag: 7, motivo: 'Se cubre por crujías conforme queda rigidizada la estructura.', validar: true }] },
      { id: 'FIR', orden: 50, nombre: 'Firme industrial (base, barrera de vapor, malla/fibra, colado, endurecedor, juntas)', pctDuracion: [8, 14], critica: true,
        palabrasClave: ['firme', 'piso industrial', 'fibra', 'barrera de vapor', 'endurecedor', 'pulido', 'junta de control', 'sello de juntas'],
        dependeDe: [{ etapa: 'CUB', tipo: 'SS', lag: 7, validar: true }] },
      { id: 'INS', orden: 55, nombre: 'Instalaciones (eléctrica, subestación, iluminación, contra incendio, hidrosanitaria, pluvial)', pctDuracion: [12, 20],
        palabrasClave: ['subestacion', 'transformador', 'charola', 'high-bay', 'electric', 'contra incendio', 'hidrante', 'rociador', 'bomba', 'bajada pluvial', 'hidraulic', 'sanitari', 'instalacion'],
        dependeDe: [{ etapa: 'CUB', tipo: 'SS', lag: 5 }] },
      { id: 'MUR', orden: 60, nombre: 'Muros perimetrales bajos, portones y cortinas', pctDuracion: [4, 8],
        palabrasClave: ['muro de block', 'muro perimetral', 'porton', 'cortina', 'puerta de emergencia', 'cortina enrollable'],
        dependeDe: [{ etapa: 'MON', tipo: 'FS', lag: 0 }] },
      { id: 'AND', orden: 70, nombre: 'Andenes, oficinas, áreas exteriores y acabados', pctDuracion: [6, 12],
        palabrasClave: ['anden', 'rampa niveladora', 'oficina', 'estacionamiento', 'patio de maniobras', 'pintura', 'acabado'],
        dependeDe: [{ etapa: 'FIR', tipo: 'SS', lag: 5, validar: true }] },
      { id: 'ENT', orden: 90, nombre: 'Pruebas (hermeticidad, eléctricas, contra incendio) y entrega', pctDuracion: [2, 5],
        palabrasClave: ['prueba', 'hermeticidad', 'puesta en marcha', 'limpieza final', 'limpieza fina', 'entrega', 'manual'],
        dependeDe: [{ etapa: 'FIR', tipo: 'FS', lag: 0 }, { etapa: 'INS', tipo: 'FS', lag: 0 }, { etapa: 'MUR', tipo: 'FS', lag: 0 }, { etapa: 'AND', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['anovelingenieria.com', 'constructoresrivera.com', 'gerdaucorsa.com.mx', 'formaindustrial.com', 'unam.mx']
  },

  // ═══════════════════════════════════════════════════════════
  salud: {
    id: 'salud',
    valorSelector: 'Salud',
    label: 'Salud (Hospitales, Clínicas, Consultorios)',
    perfilMotorActual: 'edificacion',
    nuevo: true,
    palabrasDeteccion: ['hospital', 'clinica', 'consultorio', 'quirofano', 'centro de salud', 'unidad medica', 'imss', 'issste', 'laboratorio clinico', 'urgencias'],
    referenciaDuracion: 'Depende de la cartera de servicios; las ventanas de ingreso de equipo mayor (tomógrafo, resonador, manejadoras) se planean meses antes.',
    estrategia: 'Obra gris tipo edificación + instalaciones especiales (gases medicinales, HVAC con presiones, energía de emergencia) + blindaje radiológico antes de acabados + comisionamiento riguroso antes de la licencia sanitaria.',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Preliminares y trazo', pctDuracion: [2, 4],
        palabrasClave: ['limpieza', 'despalme', 'trazo', 'nivelacion', 'tapial', 'preliminar'],
        dependeDe: [] },
      { id: 'CIM', orden: 20, nombre: 'Excavación y cimentación (losas reforzadas en imagenología)', pctDuracion: [8, 12], critica: true,
        palabrasClave: ['excavacion', 'plantilla', 'zapata', 'contratrabe', 'losa de cimentacion', 'pila', 'cimentacion'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'EST', orden: 30, nombre: 'Estructura (columnas, trabes, losas, entrepisos técnicos)', pctDuracion: [18, 28], critica: true,
        palabrasClave: ['columna', 'trabe', 'losa', 'losacero', 'cimbra', 'entrepiso tecnico', 'intersticio', 'estructura'],
        excluir: ['impermeabil', 'firme', 'piso'],
        dependeDe: [{ etapa: 'CIM', tipo: 'FS', lag: 0 }] },
      { id: 'ALB', orden: 40, nombre: 'Muros perimetrales, divisorios y obra negra', pctDuracion: [8, 14],
        palabrasClave: ['muro', 'block', 'tabique', 'tablaroca', 'durock', 'castillo', 'dala'],
        excluir: ['aplanado', 'pintura', 'plomo', 'plomada'],
        dependeDe: [{ etapa: 'EST', tipo: 'SS', lag: 20, validar: true }] },
      { id: 'INS', orden: 50, nombre: 'Instalaciones principales (hidrosanitaria, eléctrica normal y de emergencia, baja tensión)', pctDuracion: [15, 22], critica: true,
        palabrasClave: ['hidraulic', 'sanitari', 'cisterna', 'electric', 'charola', 'planta de emergencia', 'transferencia', 'tablero de aislamiento', 'tierra fisica', 'voz y datos', 'llamado de enfermeras'],
        dependeDe: [{ etapa: 'EST', tipo: 'SS', lag: 20, validar: true }] },
      { id: 'GAS', orden: 55, nombre: 'Red de gases medicinales (oxígeno, aire, vacío, óxido nitroso)', pctDuracion: [6, 10],
        palabrasClave: ['gases medicinales', 'oxigeno', 'aire medicinal', 'vacio', 'oxido nitroso', 'central de gases', 'toma mural', 'cobre tipo l', 'cobre tipo k'],
        dependeDe: [{ etapa: 'INS', tipo: 'SS', lag: 5 }] },
      { id: 'HVC', orden: 58, nombre: 'HVAC hospitalario (manejadoras, ductos, filtros HEPA, presiones)', pctDuracion: [10, 16], critica: true,
        palabrasClave: ['hvac', 'aire acondicionado', 'manejadora', 'unidad manejadora', 'ducto', 'hepa', 'extraccion', 'inyeccion', 'chiller'],
        dependeDe: [{ etapa: 'EST', tipo: 'SS', lag: 25, validar: true }] },
      { id: 'RAD', orden: 60, nombre: 'Blindaje radiológico (plomo en muros, puertas y vidrios)', pctDuracion: [2, 4],
        palabrasClave: ['plomo', 'plomada', 'blindaje', 'rayos x', 'vidrio plomado', 'puerta plomada', 'radioproteccion'],
        dependeDe: [{ etapa: 'ALB', tipo: 'SS', lag: 10 }] },
      { id: 'ACA', orden: 70, nombre: 'Acabados sanitarios (piso vinílico con curva sanitaria, pintura epóxica, plafón hermético)', pctDuracion: [12, 18],
        palabrasClave: ['piso vinilico', 'curva sanitaria', 'pintura epoxica', 'plafon', 'recubrimiento', 'piso', 'azulejo', 'pintura', 'carpinteria', 'puerta', 'canceleria'],
        dependeDe: [{ etapa: 'RAD', tipo: 'FS', lag: 0 }, { etapa: 'INS', tipo: 'SS', lag: 20 }, { etapa: 'GAS', tipo: 'SS', lag: 10 }] },
      { id: 'EQP', orden: 80, nombre: 'Equipamiento médico fijo (péndulos, cabeceras, equipo mayor) y conexiones', pctDuracion: [6, 10], critica: true,
        palabrasClave: ['equipo medico', 'pendulo', 'cabecera', 'lampara quirurgica', 'tomografo', 'resonador', 'mastografo', 'esterilizador', 'equipamiento'],
        dependeDe: [{ etapa: 'ACA', tipo: 'SS', lag: 15, validar: true }, { etapa: 'HVC', tipo: 'FS', lag: 0 }] },
      { id: 'COM', orden: 90, nombre: 'Pruebas y comisionamiento (gases, eléctrica, balanceo HVAC, levantamiento radiológico)', pctDuracion: [3, 6], critica: true,
        palabrasClave: ['prueba', 'comisionamiento', 'balanceo', 'certificacion', 'levantamiento radiologico', 'pureza', 'puesta en marcha'],
        dependeDe: [{ etapa: 'EQP', tipo: 'FS', lag: 0 }, { etapa: 'GAS', tipo: 'FS', lag: 0 }] },
      { id: 'ENT', orden: 100, nombre: 'Sanitización terminal, capacitación y entrega', pctDuracion: [1, 3],
        palabrasClave: ['sanitizacion', 'limpieza final', 'limpieza profunda', 'capacitacion', 'entrega', 'licencia sanitaria'],
        dependeDe: [{ etapa: 'COM', tipo: 'FS', lag: 0 }, { etapa: 'ACA', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['smarqh.com', 'hospitecnia.com', 'humatem.org', 'udb.edu.sv', 'gob.mx (NOM-016-SSA3)']
  },

  // ═══════════════════════════════════════════════════════════
  educacion: {
    id: 'educacion',
    valorSelector: 'Educación',
    label: 'Educación (Escuelas, Aulas, Universidades)',
    perfilMotorActual: 'edificacion',
    nuevo: true,
    palabrasDeteccion: ['escuela', 'aula', 'primaria', 'secundaria', 'preparatoria', 'universidad', 'kinder', 'jardin de niños', 'inifed', 'plantel', 'bachillerato'],
    referenciaDuracion: 'Edificio de aulas + sanitarios + obra exterior: del orden de 24 semanas en programas de obra pública; suele tener fecha límite por inicio de ciclo escolar.',
    estrategia: 'Aulas y sanitarios en paralelo; las redes generales y la obra exterior se hacen cuando ya no entra maquinaria pesada; plaza cívica y canchas al final, de preferencia en temporada seca.',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Preliminares, cercado de seguridad e instalaciones provisionales', pctDuracion: [3, 6],
        palabrasClave: ['limpieza', 'despalme', 'trazo', 'nivelacion', 'cerca provisional', 'bodega', 'caseta', 'preliminar'],
        dependeDe: [] },
      { id: 'CIA', orden: 20, nombre: 'Cimentación de edificio de aulas', pctDuracion: [10, 15], critica: true,
        palabrasClave: ['excavacion', 'plantilla', 'zapata', 'contratrabe', 'dala de desplante', 'cimentacion'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'SAN', orden: 25, nombre: 'Núcleo de sanitarios: red sanitaria enterrada, cimentación, muros y losa', pctDuracion: [10, 16],
        palabrasClave: ['sanitarios', 'modulo sanitario', 'mingitorio', 'trampa de grasa', 'registro sanitario', 'fosa septica'],
        dependeDe: [{ etapa: 'CIA', tipo: 'SS', lag: 5, motivo: 'Simultáneo o ligeramente posterior a las aulas.' }] },
      { id: 'EST', orden: 30, nombre: 'Estructura de aulas (columnas, muros, losa o estructura metálica con cubierta)', pctDuracion: [15, 22], critica: true,
        palabrasClave: ['columna', 'trabe', 'muro', 'block', 'castillo', 'losa', 'cimbra', 'estructura metalica', 'cubierta'],
        excluir: ['aplanado', 'pintura', 'azulejo', 'lambrin', 'impermeabil'],
        dependeDe: [{ etapa: 'CIA', tipo: 'FS', lag: 0 }] },
      { id: 'INS', orden: 40, nombre: 'Instalaciones ocultas (eléctrica, voz y datos, hidráulica)', pctDuracion: [8, 12],
        palabrasClave: ['electric', 'conduit', 'cableado', 'voz y datos', 'hidraulic', 'sanitari', 'tinaco', 'cisterna'],
        dependeDe: [{ etapa: 'EST', tipo: 'SS', lag: 7 }] },
      { id: 'ALB', orden: 50, nombre: 'Albañilería, pretiles, aplanados e impermeabilización', pctDuracion: [8, 14],
        palabrasClave: ['pretil', 'chaflan', 'aplanado', 'impermeabil', 'firme', 'albañileria'],
        dependeDe: [{ etapa: 'EST', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }] },
      { id: 'ACA', orden: 60, nombre: 'Pisos antiderrapantes, lambrines, cancelería, puertas y herrería', pctDuracion: [8, 14],
        palabrasClave: ['piso', 'loseta', 'lambrin', 'azulejo', 'ventana', 'aluminio', 'puerta', 'herreria', 'barra de apoyo'],
        dependeDe: [{ etapa: 'ALB', tipo: 'SS', lag: 7 }] },
      { id: 'RED', orden: 70, nombre: 'Obra exterior: redes generales (hidráulica, eléctrica, pluvial, sanitaria), cisterna y banquetas', pctDuracion: [10, 15],
        palabrasClave: ['red general', 'acometida', 'subestacion', 'red pluvial', 'colector', 'banqueta', 'guarnicion', 'andador', 'captacion pluvial'],
        dependeDe: [{ etapa: 'ALB', tipo: 'SS', lag: 10, motivo: 'Cuando los edificios ya están en cerramientos.', validar: true }] },
      { id: 'PLZ', orden: 80, nombre: 'Plaza cívica, canchas deportivas y áreas verdes', pctDuracion: [6, 12],
        palabrasClave: ['plaza civica', 'cancha', 'asta bandera', 'tablero de basquetbol', 'porteria', 'area verde', 'jardineria', 'techumbre'],
        dependeDe: [{ etapa: 'RED', tipo: 'FS', lag: 0 }] },
      { id: 'PIN', orden: 85, nombre: 'Pintura, señalización y muebles sanitarios', pctDuracion: [4, 8],
        palabrasClave: ['pintura', 'señalizacion', 'wc', 'lavabo', 'mingitorio', 'luminaria', 'apagador', 'contacto'],
        dependeDe: [{ etapa: 'ALB', tipo: 'FS', lag: 7, regla: 'aplanadoAntesDePintura' }, { etapa: 'ACA', tipo: 'SS', lag: 5 }] },
      { id: 'ENT', orden: 100, nombre: 'Pruebas de instalaciones, limpieza y entrega', pctDuracion: [1, 3],
        palabrasClave: ['prueba', 'limpieza final', 'limpieza fina', 'entrega'],
        dependeDe: [{ etapa: 'PIN', tipo: 'FS', lag: 0 }, { etapa: 'PLZ', tipo: 'FS', lag: 0 }, { etapa: 'SAN', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['piedeplano.com', 'inifech.gob.mx', 'hidalgo.gob.mx', 'guerrero.gob.mx', 'gob.mx (INIFED)']
  },

  // ═══════════════════════════════════════════════════════════
  gasolinera: {
    id: 'gasolinera',
    valorSelector: 'Estación de Servicio',
    label: 'Estación de Servicio (Gasolineras, Gas LP)',
    perfilMotorActual: 'industrial',
    nuevo: true,
    palabrasDeteccion: ['gasolinera', 'estacion de servicio', 'dispensario', 'tanque de almacenamiento', 'asea', 'gas lp', 'diesel', 'combustible'],
    referenciaDuracion: 'Las pruebas de hermeticidad y la Revisión de Seguridad de Pre-arranque (ASEA) son hitos que condicionan el cierre.',
    estrategia: 'Fosa y tanques primero; tuberías con pendiente hacia tanques; pruebas de hermeticidad ANTES de pavimentar; techumbre, edificio y pavimentos en paralelo; cierre con instalaciones a prueba de explosión y pre-arranque.',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Preliminares, trazo y despalme', pctDuracion: [3, 5],
        palabrasClave: ['limpieza', 'despalme', 'trazo', 'nivelacion', 'demolicion', 'preliminar'],
        dependeDe: [] },
      { id: 'FOS', orden: 20, nombre: 'Excavación de fosa, plantilla, losa de fondo y anclajes antiflotación', pctDuracion: [8, 12], critica: true,
        palabrasClave: ['fosa', 'excavacion de fosa', 'losa de fondo', 'antiflotacion', 'flejes', 'tirante', 'ademe', 'abatimiento'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'TAN', orden: 30, nombre: 'Instalación de tanques de doble pared y relleno de protección', pctDuracion: [4, 8], critica: true,
        palabrasClave: ['tanque', 'doble pared', 'monitoreo intersticial', 'relleno de grava', 'boca de tanque'],
        dependeDe: [{ etapa: 'FOS', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }] },
      { id: 'TUB', orden: 40, nombre: 'Trincheras y tuberías de producto, recuperación de vapores y venteo; contenedores (sumps)', pctDuracion: [8, 12], critica: true,
        palabrasClave: ['tuberia de producto', 'recuperacion de vapores', 'venteo', 'sump', 'contenedor de derrames', 'llenado remoto', 'trinchera', 'tuberia flexible'],
        dependeDe: [{ etapa: 'TAN', tipo: 'FS', lag: 0 }] },
      { id: 'HER', orden: 45, nombre: 'Pruebas de hermeticidad de tanques y líneas (unidad de inspección)', pctDuracion: [1, 3], critica: true,
        palabrasClave: ['hermeticidad', 'prueba neumatica', 'prueba hidrostatica', 'dictamen', 'unidad de inspeccion'],
        dependeDe: [{ etapa: 'TUB', tipo: 'FS', lag: 0 }] },
      { id: 'CIM', orden: 50, nombre: 'Cimentación de techumbre y edificio (tienda, oficinas, sanitarios)', pctDuracion: [6, 10],
        palabrasClave: ['zapata', 'dado', 'ancla', 'cimentacion', 'contratrabe', 'plantilla'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'TEC', orden: 55, nombre: 'Estructura metálica y cubierta de techumbre de despacho', pctDuracion: [6, 10],
        palabrasClave: ['techumbre', 'estructura metalica', 'cubierta', 'lamina', 'faldon', 'canopy', 'columna metalica'],
        dependeDe: [{ etapa: 'CIM', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }] },
      { id: 'EDI', orden: 60, nombre: 'Edificio (muros, losa, instalaciones y acabados)', pctDuracion: [12, 18],
        palabrasClave: ['muro', 'block', 'losa', 'aplanado', 'piso', 'azulejo', 'pintura', 'sanitario', 'tienda', 'oficina'],
        dependeDe: [{ etapa: 'CIM', tipo: 'FS', lag: 0 }] },
      { id: 'PAV', orden: 70, nombre: 'Islas de despacho, guarniciones y pavimento de concreto hidráulico', pctDuracion: [8, 12], critica: true,
        palabrasClave: ['isla', 'guarnicion', 'pavimento', 'concreto hidraulico', 'losa de concreto', 'banqueta', 'rampa'],
        dependeDe: [{ etapa: 'HER', tipo: 'FS', lag: 0, motivo: 'No se pavimenta sin hermeticidad aprobada.' }, { etapa: 'TEC', tipo: 'SS', lag: 3 }] },
      { id: 'ELE', orden: 75, nombre: 'Instalación eléctrica a prueba de explosión, tierras y pararrayos', pctDuracion: [6, 10],
        palabrasClave: ['prueba de explosion', 'clasificacion de areas', 'tierra fisica', 'pararrayos', 'electric', 'tablero', 'paro de emergencia', 'luminaria'],
        dependeDe: [{ etapa: 'TUB', tipo: 'SS', lag: 5 }] },
      { id: 'DIS', orden: 80, nombre: 'Montaje de dispensarios, control volumétrico y sistemas de seguridad', pctDuracion: [3, 6],
        palabrasClave: ['dispensario', 'control volumetrico', 'consola', 'valvula de presion vacio', 'extintor', 'sistema contra incendio'],
        dependeDe: [{ etapa: 'PAV', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }, { etapa: 'ELE', tipo: 'FS', lag: 0 }] },
      { id: 'IMG', orden: 85, nombre: 'Imagen comercial, señalización y obras exteriores', pctDuracion: [2, 5],
        palabrasClave: ['imagen', 'totem', 'anuncio', 'señalizacion', 'pintura de transito', 'jardineria'],
        dependeDe: [{ etapa: 'TEC', tipo: 'FS', lag: 0 }] },
      { id: 'ARR', orden: 100, nombre: 'Revisión de Seguridad de Pre-arranque (ASEA) y entrega', pctDuracion: [2, 4],
        palabrasClave: ['pre-arranque', 'prearranque', 'rspa', 'arranque', 'entrega'],
        dependeDe: [{ etapa: 'DIS', tipo: 'FS', lag: 0 }, { etapa: 'EDI', tipo: 'FS', lag: 0 }, { etapa: 'IMG', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['regenera.mx (NOM-005-ASEA-2016)', 'gasolinerasmx.com', 'tecnocontrol.com.mx', 'dof.gob.mx', 'gob.mx (ASEA)']
  },

  // ═══════════════════════════════════════════════════════════
  hidraulica: {
    id: 'hidraulica',
    valorSelector: 'Obra Hidráulica',
    label: 'Obra Hidráulica (Plantas de Tratamiento, Tanques, Cárcamos)',
    perfilMotorActual: 'infraestructura',
    nuevo: true,
    palabrasDeteccion: ['planta de tratamiento', 'ptar', 'potabilizadora', 'tanque de regulacion', 'carcamo', 'reactor', 'sedimentador', 'clarificador', 'tanque elevado'],
    referenciaDuracion: 'La prueba de estanqueidad (llenado de 1 a 1.5 m por día, saturación de 24-72 h y medición de 3-5 días) es un hito que debe programarse.',
    estrategia: 'Losa de fondo → muros con banda water stop → prueba de estanqueidad ANTES de rellenar alrededor → equipos electromecánicos → arranque en seco, con agua limpia y luego operativo.',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Preliminares, trazo y caminos internos', pctDuracion: [3, 5],
        palabrasClave: ['limpieza', 'despalme', 'trazo', 'nivelacion', 'camino', 'preliminar'],
        dependeDe: [] },
      { id: 'EXC', orden: 20, nombre: 'Excavación, abatimiento de nivel freático y plantilla', pctDuracion: [6, 10], critica: true,
        palabrasClave: ['excavacion', 'abatimiento', 'bombeo', 'achique', 'tablestaca', 'plantilla', 'solado'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'LOF', orden: 30, nombre: 'Losa de fondo (acero, pasos y tuberías ahogadas, colado)', pctDuracion: [8, 12], critica: true,
        palabrasClave: ['losa de fondo', 'losa de cimentacion', 'pasamuro', 'tuberia ahogada', 'aditivo impermeabilizante'],
        dependeDe: [{ etapa: 'EXC', tipo: 'FS', lag: 0 }] },
      { id: 'MUR', orden: 40, nombre: 'Muros de tanques con banda water stop (colado por etapas)', pctDuracion: [12, 20], critica: true,
        palabrasClave: ['muro', 'water stop', 'banda de pvc', 'junta de construccion', 'cimbra metalica', 'muro de tanque'],
        dependeDe: [{ etapa: 'LOF', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }] },
      { id: 'LTA', orden: 45, nombre: 'Losas tapa, pasarelas y canales', pctDuracion: [5, 10],
        palabrasClave: ['losa tapa', 'pasarela', 'canal', 'vertedor', 'losa'],
        excluir: ['losa de fondo'],
        dependeDe: [{ etapa: 'MUR', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }] },
      { id: 'EST', orden: 50, nombre: 'Prueba de estanqueidad (llenado gradual, saturación y medición)', pctDuracion: [3, 6], critica: true,
        palabrasClave: ['estanqueidad', 'prueba hidrostatica', 'prueba de llenado', 'hermeticidad'],
        dependeDe: [{ etapa: 'MUR', tipo: 'FS', lag: 7, regla: 'curadoConcreto' }],
        nota: 'Se hace antes de rellenar alrededor para poder ver filtraciones.' },
      { id: 'REL', orden: 55, nombre: 'Rellenos perimetrales, recubrimientos e impermeabilización', pctDuracion: [4, 8],
        palabrasClave: ['relleno', 'recubrimiento', 'impermeabil', 'epoxico', 'cristalizacion'],
        dependeDe: [{ etapa: 'EST', tipo: 'FS', lag: 0 }] },
      { id: 'EDI', orden: 60, nombre: 'Edificios de operación (casa de sopladores, laboratorio, cuarto eléctrico)', pctDuracion: [8, 14],
        palabrasClave: ['caseta', 'casa de sopladores', 'laboratorio', 'cuarto electrico', 'oficina', 'edificio'],
        dependeDe: [{ etapa: 'EXC', tipo: 'SS', lag: 10, validar: true }] },
      { id: 'TUB', orden: 65, nombre: 'Interconexión de tuberías, válvulas y compuertas', pctDuracion: [8, 12],
        palabrasClave: ['tuberia', 'valvula', 'compuerta', 'interconexion', 'pead', 'acero inoxidable', 'brida', 'medidor de flujo'],
        dependeDe: [{ etapa: 'EST', tipo: 'FS', lag: 0 }] },
      { id: 'EQP', orden: 70, nombre: 'Montaje de equipos electromecánicos (bombas, sopladores, difusores, rastras)', pctDuracion: [8, 12], critica: true,
        palabrasClave: ['bomba', 'soplador', 'difusor', 'agitador', 'rastra', 'puente barredor', 'tornillo', 'equipo electromecanico', 'filtro'],
        dependeDe: [{ etapa: 'EST', tipo: 'FS', lag: 0 }, { etapa: 'EDI', tipo: 'SS', lag: 10 }] },
      { id: 'ELE', orden: 75, nombre: 'Eléctrica, control e instrumentación (CCM, PLC/SCADA, sensores)', pctDuracion: [6, 10],
        palabrasClave: ['electric', 'subestacion', 'ccm', 'plc', 'scada', 'instrumentacion', 'sensor', 'tablero'],
        dependeDe: [{ etapa: 'EDI', tipo: 'SS', lag: 15 }, { etapa: 'EQP', tipo: 'SS', lag: 5 }] },
      { id: 'ARR', orden: 90, nombre: 'Arranque: pruebas en seco, con agua limpia y puesta en marcha', pctDuracion: [4, 8], critica: true,
        palabrasClave: ['arranque', 'puesta en marcha', 'comisionamiento', 'prueba en seco', 'estabilizacion', 'inoculacion', 'capacitacion', 'entrega'],
        dependeDe: [{ etapa: 'EQP', tipo: 'FS', lag: 0 }, { etapa: 'ELE', tipo: 'FS', lag: 0 }, { etapa: 'TUB', tipo: 'FS', lag: 0 }, { etapa: 'REL', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['castellanaenergia.com', 'scribd / slideshare (pruebas de estanqueidad en tanques)']
  },

  // ═══════════════════════════════════════════════════════════
  energia_solar: {
    id: 'energia_solar',
    valorSelector: 'Energía Solar',
    label: 'Energía Solar (Parques y Sistemas Fotovoltaicos)',
    perfilMotorActual: 'industrial',
    nuevo: true,
    palabrasDeteccion: ['solar', 'fotovoltaic', 'paneles solares', 'modulos fv', 'inversor', 'tracker', 'seguidor solar', 'parque solar'],
    referenciaDuracion: 'Se avanza por bloques de potencia; hincado, estructura y módulos trabajan como tren de frentes.',
    estrategia: 'Hincado de pilotes → estructura/trackers → módulos, en cadena por bloques; zanjas y cableado en paralelo; subestación y línea de interconexión como frente independiente desde temprano.',
    etapas: [
      { id: 'PRE', orden: 10, nombre: 'Topografía, despalme, caminos internos y drenaje', pctDuracion: [6, 10],
        palabrasClave: ['topograf', 'replanteo', 'despalme', 'desmonte', 'camino interno', 'cuneta', 'drenaje', 'cerco perimetral', 'preliminar'],
        dependeDe: [] },
      { id: 'HIN', orden: 20, nombre: 'Hincado de pilotes (con pretaladrado si el terreno es duro)', pctDuracion: [10, 16], critica: true,
        palabrasClave: ['hincado', 'pilote', 'perfil hincado', 'pretaladrado', 'hincapostes'],
        dependeDe: [{ etapa: 'PRE', tipo: 'SS', lag: 10, validar: true }] },
      { id: 'EST', orden: 30, nombre: 'Montaje de estructura fija o trackers', pctDuracion: [12, 18], critica: true,
        palabrasClave: ['estructura', 'tracker', 'seguidor', 'tubo de torsion', 'larguero', 'mesa'],
        dependeDe: [{ etapa: 'HIN', tipo: 'SS', lag: 7, validar: true }] },
      { id: 'MOD', orden: 40, nombre: 'Instalación de módulos fotovoltaicos y conexión de strings', pctDuracion: [12, 18], critica: true,
        palabrasClave: ['modulo', 'panel', 'string', 'mc4', 'grapa'],
        dependeDe: [{ etapa: 'EST', tipo: 'SS', lag: 7, validar: true }] },
      { id: 'ZAN', orden: 45, nombre: 'Zanjas, ductos y cableado de CC y CA (media tensión)', pctDuracion: [10, 16],
        palabrasClave: ['zanja', 'ducto', 'caviducto', 'cableado', 'cable de cc', 'media tension', 'string box', 'caja concentradora'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0 }] },
      { id: 'INV', orden: 50, nombre: 'Inversores y centros de transformación (power stations)', pctDuracion: [5, 10],
        palabrasClave: ['inversor', 'centro de transformacion', 'power station', 'skid', 'transformador'],
        dependeDe: [{ etapa: 'ZAN', tipo: 'SS', lag: 10 }] },
      { id: 'SUB', orden: 60, nombre: 'Subestación elevadora y línea de interconexión', pctDuracion: [15, 25], critica: true,
        palabrasClave: ['subestacion', 'linea de transmision', 'interconexion', 'celda', 'transformador de potencia', 'bahia'],
        dependeDe: [{ etapa: 'PRE', tipo: 'FS', lag: 0, motivo: 'Frente independiente desde temprano.' }] },
      { id: 'COM', orden: 90, nombre: 'Pruebas, energización y operación comercial', pctDuracion: [4, 8], critica: true,
        palabrasClave: ['prueba', 'energizacion', 'sincronizacion', 'comisionamiento', 'operacion comercial', 'entrega'],
        dependeDe: [{ etapa: 'MOD', tipo: 'FS', lag: 0 }, { etapa: 'INV', tipo: 'FS', lag: 0 }, { etapa: 'SUB', tipo: 'FS', lag: 0 }] }
    ],
    fuentes: ['alusinsolar.com', 'enel.com', 'accasoftware.com', 'greening-e.mx']
  }
};

// ─────────────────────────────────────────────────────────────
// 3. UTILIDADES (sin dependencias, listas para usarse en el motor)
// ─────────────────────────────────────────────────────────────
export function normalizarTexto(str = '') {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Detecta el tipo de obra a partir del valor del selector, nombre del proyecto o texto de partidas.
export function detectarTipoObra(textoProyecto = '') {
  const t = normalizarTexto(textoProyecto);
  for (const tipo of Object.values(TIPOS_OBRA)) {
    if (t === normalizarTexto(tipo.label) || t === tipo.id || t === normalizarTexto(tipo.valorSelector)) return tipo.id;
  }
  let mejor = { id: 'vivienda', puntos: 0 };
  for (const tipo of Object.values(TIPOS_OBRA)) {
    const puntos = tipo.palabrasDeteccion.filter(p => t.includes(normalizarTexto(p))).length;
    if (puntos > mejor.puntos) mejor = { id: tipo.id, puntos };
  }
  return mejor.id;
}

// Clasifica un concepto en la etapa con más coincidencias de palabras clave (gana la frase más específica).
export function clasificarConcepto(descripcion = '', partida = '', tipoObraId = 'vivienda') {
  const tipo = TIPOS_OBRA[tipoObraId] || TIPOS_OBRA.vivienda;
  const desc = normalizarTexto(descripcion);
  const full = `${desc} ${normalizarTexto(partida)}`;
  let mejor = null;
  for (const etapa of tipo.etapas) {
    // Exclusión al inicio de palabra: "piso" excluye "piso porcelanato" pero no "losa de entrepiso".
    if ((etapa.excluir || []).some(x => new RegExp(`(^|[^a-z0-9])${normalizarTexto(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(desc))) continue;
    let puntos = 0;
    for (const kw of etapa.palabrasClave) {
      const k = normalizarTexto(kw);
      if (desc.includes(k)) puntos += 2 + k.split(' ').length;      // coincidencia en descripción pesa más
      else if (full.includes(k)) puntos += 1;                        // coincidencia solo en partida
      if (desc.startsWith(k)) puntos += 3;                           // el sustantivo inicial define el concepto ("Pintura … y limpieza fina")
    }
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { etapa, puntos };
  }
  return mejor ? mejor.etapa : null;
}

// Validación interna: enlaces a etapas existentes y sin ciclos.
export function validarBaseDatos() {
  const errores = [];
  for (const tipo of Object.values(TIPOS_OBRA)) {
    const ids = new Set(tipo.etapas.map(e => e.id));
    if (ids.size !== tipo.etapas.length) errores.push(`${tipo.id}: ids de etapa duplicados`);
    for (const e of tipo.etapas) {
      for (const d of e.dependeDe) {
        if (!ids.has(d.etapa)) errores.push(`${tipo.id}.${e.id}: depende de etapa inexistente ${d.etapa}`);
        if (!['FS', 'SS'].includes(d.tipo)) errores.push(`${tipo.id}.${e.id}: tipo de enlace inválido ${d.tipo}`);
        if (d.regla && !REGLAS_ESPERA[d.regla]) errores.push(`${tipo.id}.${e.id}: regla inexistente ${d.regla}`);
      }
    }
    const byId = new Map(tipo.etapas.map(e => [e.id, e]));
    const estado = new Map();
    const visitar = (id, ruta) => {
      if (estado.get(id) === 1) { errores.push(`${tipo.id}: ciclo ${[...ruta, id].join(' → ')}`); return; }
      if (estado.get(id) === 2) return;
      estado.set(id, 1);
      for (const d of byId.get(id)?.dependeDe || []) visitar(d.etapa, [...ruta, id]);
      estado.set(id, 2);
    };
    for (const e of tipo.etapas) visitar(e.id, []);
  }
  return errores;
}

// ─────────────────────────────────────────────────────────────
// 4. MOTOR DE PROPUESTA (Auto-Programar)
// ─────────────────────────────────────────────────────────────

// Etapas cuyos conceptos arrancan juntos (frentes simultáneos) en lugar de encadenarse uno tras otro.
function etapaEsParalela(etapa) {
  if (etapa.interno === 'paralelo') return true;
  if (etapa.interno === 'secuencial') return false;
  return /instalacion|carpinteria|canceleria|herreria|equipamiento|gases|hvac/i.test(normalizarTexto(etapa.nombre));
}

// Elige el tipo de obra que mejor explica el presupuesto (más conceptos clasificados) + pistas del nombre del proyecto.
export function detectarTipoPorConceptos(conceptos = [], textoProyecto = '') {
  const pista = textoProyecto ? detectarTipoObra(textoProyecto) : null;
  const tieneTexto = textoProyecto && Object.values(TIPOS_OBRA).some(t =>
    t.palabrasDeteccion.some(p => normalizarTexto(textoProyecto).includes(normalizarTexto(p))));
  let mejor = { id: 'vivienda', puntos: -1 };
  for (const tipo of Object.values(TIPOS_OBRA)) {
    let puntos = 0;
    conceptos.forEach(c => { if (clasificarConcepto(c.descripcion, c.partida, tipo.id)) puntos += 1; });
    if (tieneTexto && pista === tipo.id) puntos += Math.max(3, Math.ceil(conceptos.length * 0.3));
    if (puntos > mejor.puntos) mejor = { id: tipo.id, puntos };
  }
  return mejor.id;
}

// Genera la propuesta: etapa de cada concepto + enlaces FI/II con esperas técnicas.
// conceptos: [{ id, clave, descripcion, partida, durationDays }] en el orden del presupuesto.
// Devuelve { tipoId, filas: [{ id, etapa, heredada, links: [{id, type, lag, motivo}] }], resumenEtapas }
export function generarPropuesta(conceptos = [], tipoObraId = 'vivienda') {
  const tipo = TIPOS_OBRA[tipoObraId] || TIPOS_OBRA.vivienda;
  const etapasById = new Map(tipo.etapas.map(e => [e.id, e]));

  // 1. Clasificar (los no reconocidos heredan la etapa del concepto anterior de su misma partida)
  const filas = [];
  let ultimaPorPartida = new Map();
  let ultimaGlobal = null;
  conceptos.forEach(c => {
    let etapa = clasificarConcepto(c.descripcion, c.partida, tipo.id);
    let heredada = false;
    if (!etapa) {
      etapa = ultimaPorPartida.get(c.partida) || ultimaGlobal || tipo.etapas[0];
      heredada = true;
    }
    ultimaPorPartida.set(c.partida, etapa);
    ultimaGlobal = etapa;
    filas.push({ id: c.id, concepto: c, etapa, heredada, links: [] });
  });

  // 2. Agrupar por etapa respetando el orden del presupuesto
  const porEtapa = new Map();
  filas.forEach(f => {
    if (!porEtapa.has(f.etapa.id)) porEtapa.set(f.etapa.id, []);
    porEtapa.get(f.etapa.id).push(f);
  });

  // 3. Resolver dependencias saltando etapas sin conceptos.
  //    Si el enlace exterior es FI, se conserva FI (conservador: espera a que termine la etapa anterior real).
  const resolver = (etapaId, visit = new Set()) => {
    if (visit.has(etapaId)) return [];
    visit.add(etapaId);
    const out = [];
    for (const d of etapasById.get(etapaId)?.dependeDe || []) {
      if (porEtapa.has(d.etapa)) {
        out.push({ etapa: d.etapa, tipo: d.tipo, lag: d.lag || 0, regla: d.regla, motivo: d.motivo });
      } else {
        resolver(d.etapa, new Set(visit)).forEach(inner => {
          if (d.tipo === 'FS') out.push({ ...inner, tipo: 'FS', lag: (d.lag || 0) + (inner.tipo === 'FS' ? (inner.lag || 0) : 0) });
          else out.push({ ...inner, lag: (inner.lag || 0) + (d.lag || 0) });
        });
      }
    }
    const dedup = new Map();
    out.forEach(o => {
      const k = `${o.etapa}|${o.tipo}`;
      if (!dedup.has(k) || dedup.get(k).lag < o.lag) dedup.set(k, o);
    });
    return [...dedup.values()];
  };

  // 4. Construir enlaces concepto a concepto
  porEtapa.forEach((lista, etapaId) => {
    const etapa = etapasById.get(etapaId);
    const paralela = etapaEsParalela(etapa);
    const deps = resolver(etapaId);
    lista.forEach((f, idx) => {
      if (paralela || idx === 0) {
        deps.forEach(d => {
          const pred = porEtapa.get(d.etapa);
          const predParalela = etapaEsParalela(etapasById.get(d.etapa));
          const motivo = d.regla && REGLAS_ESPERA[d.regla] ? REGLAS_ESPERA[d.regla].descripcion : (d.motivo || '');
          if (d.tipo === 'FS') {
            const destinos = predParalela ? pred : [pred[pred.length - 1]];
            destinos.forEach(p => f.links.push({ id: p.id, type: 'FS', lag: d.lag, motivo }));
          } else {
            f.links.push({ id: pred[0].id, type: 'SS', lag: d.lag, motivo });
          }
        });
      } else {
        f.links.push({ id: lista[idx - 1].id, type: 'FS', lag: 0, motivo: 'Secuencia dentro de la misma etapa.' });
      }
    });
  });

  // 5. La etapa de cierre (la última del proceso) arranca cuando terminen todos los frentes abiertos
  const ultimaEtapa = tipo.etapas.reduce((a, b) => (b.orden > a.orden ? b : a), tipo.etapas[0]);
  const cierre = porEtapa.get(ultimaEtapa.id);
  if (cierre && cierre.length) {
    const idsCierre = new Set(cierre.map(f => f.id));
    const tieneSucesor = new Set();
    filas.forEach(f => f.links.forEach(l => tieneSucesor.add(l.id)));
    const primero = cierre[0];
    const yaEnlazados = new Set(primero.links.filter(l => l.type === 'FS').map(l => l.id));
    const filaById = new Map(filas.map(f => [f.id, f]));
    const dependeDelCierre = (id) => {
      const vis = new Set(); const st = [id];
      while (st.length) {
        const cur = st.pop();
        if (idsCierre.has(cur)) return true;
        if (vis.has(cur)) continue;
        vis.add(cur);
        (filaById.get(cur)?.links || []).forEach(l => st.push(l.id));
      }
      return false;
    };
    filas.forEach(f => {
      if (idsCierre.has(f.id) || tieneSucesor.has(f.id) || yaEnlazados.has(f.id) || dependeDelCierre(f.id)) return;
      primero.links.push({ id: f.id, type: 'FS', lag: 0, motivo: 'El cierre y la entrega esperan a que terminen todos los frentes.' });
    });
  }

  const resumenEtapas = tipo.etapas
    .filter(e => porEtapa.has(e.id))
    .map(e => ({ id: e.id, nombre: e.nombre, conceptos: porEtapa.get(e.id).length, critica: !!e.critica }));

  return { tipoId: tipo.id, filas, resumenEtapas };
}
