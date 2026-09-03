-- Auditoría de sastrería (Consejo, ronda de auditoría del motor): tercer
-- eje real de un conjunto, después del color y del registro/formalidad, y
-- el único sin ningún dato -- el motor no distingue una campera oversize de
-- una ajustada, ni un jogger holgado de un pantalón chino de corte recto.
-- Volumen arriba pide volumen contenido abajo (y al revés); acumular
-- volumen en las dos puntas es el error de proporción más común de un
-- placard urbano real. No es un choque (a diferencia del registro o el
-- cuero) -- es una cuestión de grado, así que el motor solo la usa para
-- degradar "excelente" a "muy_bueno" con una sugerencia, nunca para
-- bloquear una combinación (ver `chocanEnVolumen` en recommend.ts).
--
-- Mismo criterio que corte_calzado/patron/posicion_accesorio: default
-- 'regular' preserva el comportamiento de todo el catálogo/placard ya
-- cargado (nadie pierde una recomendación por no tener este dato).
alter table armario.prendas add column calce text not null default 'regular'
  check (calce in ('ajustado', 'regular', 'holgado'));
