-- ==============================================================================
-- MIGRACIÓN IDEMPOTENTE: PARÁMETROS DE PROYECTO EJECUTIVO (ADM_ARQ)
-- ==============================================================================
-- Agrega soporte opcional para configuración económica extendida del despacho
-- en public.proyectos manteniendo 100% de compatibilidad con esquemas existentes.
--
-- Mapeo de columnas numéricas existentes para Proyecto Ejecutivo:
--   pct_indirectos       -> % Gastos Indirectos de Oficina y Software
--   pct_financiamiento   -> % Reserva para Imprevistos / Cambios del Cliente
--   pct_utilidad         -> % Utilidad del Despacho (sincronizado con 1. PRESUPUESTO)
--   pct_adicionales      -> % Impresiones, Ploteo y Visitas a Sitio
--   pct_fasar            -> % Factor de Nómina / Prestaciones de Oficina (opcional)
--   pct_seguros_fianzas  -> Obsoleto para Proyecto Ejecutivo (default 0.0000)
--   iva_pct              -> % IVA Trasladado base (16%, 8%, 0%, etc.)
--   config_ejecutiva     -> JSONB (margenUtilidadGlobal, applyNominaFactor,
--                           aplicarIva, ivaPct, aplicarRetenciones,
--                           retencionIsrPct, retencionIvaPct, notas, vistaModo)

ALTER TABLE public.proyectos
  ADD COLUMN IF NOT EXISTS pct_seguros_fianzas NUMERIC(8, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS pct_fasar NUMERIC(8, 4) DEFAULT 35.0000,
  ADD COLUMN IF NOT EXISTS config_ejecutiva JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.proyectos.config_ejecutiva IS
  'Configuración extendida de Proyecto Ejecutivo (Cost-Plus, factor opcional de nómina H.H., IVA y retenciones ISR/IVA).';
