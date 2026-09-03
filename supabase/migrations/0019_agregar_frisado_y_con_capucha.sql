-- Pedido del usuario, revisado como modista/ingeniero textil: hay dos
-- diferencias reales en los buzos que el catálogo/placard no reflejaban.
--
-- 1. Peso de la tela: un buzo frisado (interior afelpado/cepillado, más
--    grueso y aislante) es una textura real y puntualmente distinta del
--    jersey/French terry liso que ya cubre "tejido_grueso" -- mismo
--    criterio que denim (0012), acolchado (0013), poliéster (0014) y
--    viscosa (0018): se usa para dibujar un patrón real en el ícono/
--    maniquí, no es solo un tag. El usuario fue explícito en que esto NO
--    es una diferencia de estación ("tampoco los llamaría de invierno o de
--    entretiempo"), a diferencia de sweater/campera -- por eso se resuelve
--    con textura, no con la columna estacion que ya existe.
alter table armario.prendas drop constraint prendas_textura_check;
alter table armario.prendas add constraint prendas_textura_check
  check (textura in
    ('algodon','seda','cuero_liso','lino','lana','pana','corderoy','tejido_grueso','frisado','denim','acolchado','poliester','viscosa') or textura is null);

-- 2. Capucha: no todo buzo es hoodie -- reportado con dos prendas reales
-- del placard del usuario mostrando capucha cuando en realidad son
-- crewneck. Antes de esta columna, Maniqui.tsx le dibujaba capucha a
-- CUALQUIER prenda categoria='buzo' sin excepción, así que no había forma
-- de cargar la diferencia. Mismo patrón que suela_contraste (0014) y
-- requiere_cuello (0015): un detalle real de la prenda, no una regla
-- automática por categoría. Default true: preserva el dibujo de todos los
-- buzos ya cargados (el catálogo era 100% hoodie hasta esta revisión).
alter table armario.prendas add column con_capucha boolean not null default true;
