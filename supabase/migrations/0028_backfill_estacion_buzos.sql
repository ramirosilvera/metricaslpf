-- Consejo, ronda siguiente -- pedido explícito del usuario: "revisá todos
-- los buzos porque no figuran las clasificaciones de invierno o
-- entretiempo". Backfill de datos, no un cambio de esquema: ningún buzo
-- del placard real tenía `estacion` cargada (columna agregada hace rondas
-- para sweater/campera, pero nunca completada para buzo -- ver el
-- historial completo en catalogo.ts). Mismo mapeo textura->estacion que
-- ya usa el catálogo: frisado (más grueso/aislante) -> invierno,
-- tejido_grueso (jersey/French terry, más liviano) -> entretiempo. Solo
-- toca filas con estacion todavía nula -- no pisa una edición manual que
-- el usuario ya haya hecho desde el nuevo editor de "⚙️ Editar" en el
-- placard.
update armario.prendas set estacion = 'invierno' where categoria = 'buzo' and textura = 'frisado' and estacion is null;
update armario.prendas set estacion = 'entretiempo' where categoria = 'buzo' and textura = 'tejido_grueso' and estacion is null;
