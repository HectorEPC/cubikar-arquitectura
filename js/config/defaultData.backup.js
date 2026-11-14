// js/config/defaultData.js
// Árbol de Entregables por Defecto para Proyectos Arquitectónicos (Tabla de Alcances)

export const defaultTreeData = [
  {
    id: '1',
    clave: '1',
    descripcion: 'ESTUDIOS PRELIMINARES Y TOPOGRAFÍA',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    color: '#6366f1',
    expanded: true,
    selected: true,
    children: [
      {
        id: '1.1',
        clave: '1.1',
        descripcion: 'Levantamiento topográfico planimétrico y altimétrico con estación total',
        unidad: 'estudio',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 8500,
        horasHombre: 6,
        estatus: 'aprobado',
        avancePorcentaje: 100,
        responsableEmail: 'roberto.mendez.obras@gmail.com',
        archivos: [
          { nombre: 'Topografia_Curvas_Nivel.dwg', fecha: '2026-11-02' }
        ],
        selected: true
      },
      {
        id: '1.2',
        clave: '1.2',
        descripcion: 'Estudio de mecánica de suelos, sondeos y memoria geotécnica',
        unidad: 'estudio',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 16000,
        horasHombre: 4,
        estatus: 'aprobado',
        avancePorcentaje: 100,
        responsableEmail: 'mariana.torres.costos@gmail.com',
        archivos: [
          { nombre: 'Informe_Geotecnia_Laboratorio.pdf', fecha: '2026-11-04' }
        ],
        selected: true
      }
    ]
  },
  {
    id: '2',
    clave: '2',
    descripcion: 'ANTEPROYECTO ARQUITECTÓNICO',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    color: '#3b82f6',
    expanded: true,
    selected: true,
    children: [
      {
        id: '2.1',
        clave: '2.1',
        descripcion: 'Programa arquitectónico, esquemas conceptuales y zonificación funcional',
        unidad: 'lote',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 0,
        horasHombre: 18,
        estatus: 'aprobado',
        avancePorcentaje: 100,
        selected: true
      },
      {
        id: '2.2',
        clave: '2.2',
        descripcion: 'Plantas arquitectónicas esquemáticas, volumetría y modelo 3D',
        unidad: 'juego',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 0,
        horasHombre: 28,
        estatus: 'en_proceso',
        avancePorcentaje: 75,
        selected: true
      },
      {
        id: '2.3',
        clave: '2.3',
        descripcion: 'Renders fotorrealistas de fachada principal, posterior e interiores clave',
        unidad: 'render',
        cantidad: 4,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 6000,
        horasHombre: 12,
        estatus: 'en_proceso',
        avancePorcentaje: 50,
        selected: true
      }
    ]
  },
  {
    id: '3',
    clave: '3',
    descripcion: 'PROYECTO EJECUTIVO / PLANOS ARQUITECTÓNICOS',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    color: '#0ea5e9',
    expanded: true,
    selected: true,
    children: [
      {
        id: '3.1',
        clave: '3.1',
        descripcion: 'Plantas arquitectónicas acotadas, amuebladas y niveles (Baja, Alta, Azotea)',
        unidad: 'plano',
        cantidad: 3,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 0,
        horasHombre: 36,
        estatus: 'en_proceso',
        avancePorcentaje: 40,
        selected: true
      },
      {
        id: '3.2',
        clave: '3.2',
        descripcion: 'Cortes generales longitudinales y transversales por fachada',
        unidad: 'plano',
        cantidad: 2,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 0,
        horasHombre: 20,
        estatus: 'pendiente',
        avancePorcentaje: 0,
        selected: true
      },
      {
        id: '3.3',
        clave: '3.3',
        descripcion: 'Fachadas arquitectónicas (Norte, Sur, Oriente, Poniente) con acabados',
        unidad: 'plano',
        cantidad: 2,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 0,
        horasHombre: 16,
        estatus: 'pendiente',
        avancePorcentaje: 0,
        selected: true
      },
      {
        id: '3.4',
        clave: '3.4',
        descripcion: 'Criterio de acabados, carpintería, cancelería y herrería',
        unidad: 'plano',
        cantidad: 3,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 0,
        horasHombre: 24,
        estatus: 'pendiente',
        avancePorcentaje: 0,
        selected: true
      }
    ]
  },
  {
    id: '4',
    clave: '4',
    descripcion: 'INGENIERÍAS Y ESPECIALIDADES TÉCNICAS',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    color: '#a855f7',
    expanded: true,
    selected: true,
    children: [
      {
        id: '4.1',
        clave: '4.1',
        descripcion: 'Cálculo estructural, planos de cimentación, armados y memoria de diseño',
        unidad: 'proyecto',
        cantidad: 1,
        precioUnitario: 38000,
        costoDirecto: 31800,
        costoSubcontrato: 38000,
        proveedorElegidoId: 'cot_demo_est_1',
        proveedorElegidoNombre: 'Ing. Roberto Garza (Cálculo Estructural)',
        cotizaciones: [
          {
            id: 'cot_demo_est_1',
            proveedor: 'Ing. Roberto Garza (Cálculo Estructural)',
            telefono: '+52 81 8234 5678',
            email: 'roberto.garza@estructurasrg.com',
            monto: 38000,
            tiempoEntrega: '15 días hábiles',
            archivoNombre: 'Cotizacion_Estructural_Ing_Garza.pdf',
            notas: 'Incluye memoria de cálculo tridimensional, planos de zapatas, columnas, trabes, 2 revisiones y firma de DRO.',
            fecha: '2026-11-05',
            isGanador: true
          },
          {
            id: 'cot_demo_est_2',
            proveedor: 'Cálculos y Diseños Estructurales S.A.',
            telefono: '+52 55 9876 5432',
            email: 'ventas@cydestructuras.mx',
            monto: 44500,
            tiempoEntrega: '12 días hábiles',
            archivoNombre: 'Propuesta_Tecnica_CYD.pdf',
            notas: 'Plazo más rápido de 12 días, pero no incluye firma de perito DRO (costo adicional de gestoría).',
            fecha: '2026-11-04',
            isGanador: false
          },
          {
            id: 'cot_demo_est_3',
            proveedor: 'Ing. Marco Antonio Ruiz (Estructurista)',
            telefono: '+52 81 2345 6789',
            email: 'marco.ruiz.calculo@gmail.com',
            monto: 32000,
            tiempoEntrega: '25 días hábiles',
            archivoNombre: 'Presupuesto_Ing_Ruiz.pdf',
            notas: 'Propuesta más económica pero el plazo de 25 días excede la fecha de entrega del anteproyecto.',
            fecha: '2026-11-03',
            isGanador: false
          }
        ],
        horasHombre: 10,
        estatus: 'en_proceso',
        avancePorcentaje: 35,
        selected: true
      },
      {
        id: '4.2',
        clave: '4.2',
        descripcion: 'Proyecto de instalación eléctrica, iluminación, contactos y cuadros de carga',
        unidad: 'proyecto',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 14000,
        horasHombre: 8,
        estatus: 'pendiente',
        avancePorcentaje: 0,
        selected: true
      },
      {
        id: '4.3',
        clave: '4.3',
        descripcion: 'Proyecto de instalación hidrosanitaria, pluvial e isométricos',
        unidad: 'proyecto',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 12000,
        horasHombre: 8,
        estatus: 'pendiente',
        avancePorcentaje: 0,
        selected: true
      }
    ]
  },
  {
    id: '5',
    clave: '5',
    descripcion: 'TRÁMITES, LICENCIAS Y GESTORÍA',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    color: '#10b981',
    expanded: true,
    selected: true,
    children: [
      {
        id: '5.1',
        clave: '5.1',
        descripcion: 'Constancia de alineamiento, número oficial y factibilidad de uso de suelo',
        unidad: 'trámite',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 4500,
        horasHombre: 6,
        estatus: 'aprobado',
        avancePorcentaje: 100,
        selected: true
      },
      {
        id: '5.2',
        clave: '5.2',
        descripcion: 'Integración de expediente y gestión para Licencia de Construcción',
        unidad: 'trámite',
        cantidad: 1,
        precioUnitario: 0,
        costoDirecto: 0,
        costoSubcontrato: 5500,
        horasHombre: 10,
        estatus: 'en_proceso',
        avancePorcentaje: 40,
        selected: true
      }
    ]
  }
];

export const defaultSettings = {
  apiKey: '',
  applySobrecosto: false,
  applyDesgloseIndirectos: false,
  pctIndirectos: 12.00,
  pctFinanciamiento: 0.00,
  pctUtilidad: 35.00,
  pctAdicionales: 0.00,
  pctSegurosFianzas: 0.00,
  pctFasar: 0.00,
  ivaPct: 16.00,
  currency: 'MXN',
  currencySymbol: '$',
  showCurrencyCode: false,
  companyName: 'Estudio de Arquitectura',
  companySubtitle: 'Proyectos Ejecutivos y Gestión de Obra',
  companyLogo: '',
  projectName: 'Proyecto Arquitectónico Base',
  projectLocation: 'Ciudad de México, CDMX'
};
