-- Pedido explícito del usuario: "las camperas deportivas no son solo
-- rompeviento, también hay algunas de entretiempo" -- revisado como sastre
-- e ingeniero textil, verificado contra lo que venden Adidas/Nike/Puma
-- (búsqueda web): la campera deportiva de entretiempo real (el "track
-- jacket"/"campera de buzo") es tela TRICOT -- un punto (no un tejido
-- plano) liviano de poliéster con un brillo característico, cuello alto
-- tipo banda y puño/ruedo acanalados. Es una fibra/estructura
-- genuinamente distinta del poliéster técnico liso del rompeviento (0014)
-- -- mismo criterio que ya separó impermeable (0024) de poliéster: fibra
-- similar, construcción real y visualmente distinta, así que se resuelve
-- con una textura propia, no reusando "poliester" y perdiendo la
-- diferencia real de cuello/puño.
alter table armario.prendas drop constraint prendas_textura_check;
alter table armario.prendas add constraint prendas_textura_check
  check (textura in
    ('algodon','seda','cuero_liso','lino','lana','pana','corderoy','tejido_grueso','frisado','denim','acolchado','poliester','viscosa','impermeable','tricot') or textura is null);
