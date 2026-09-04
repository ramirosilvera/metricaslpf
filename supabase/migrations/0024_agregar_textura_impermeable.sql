-- Pedido explícito del usuario, revisado como sastre/ingeniero textil:
-- "la campera piloto en realidad es una campera impermeable". Hasta esta
-- revisión "campera-piloto-negra" no llevaba ninguna textura -- el
-- comentario original (ver catalogo.ts) daba por sentado que ninguna
-- Textura del enum describía "nylon/microfibra impermeable" sin inventar
-- un dato falso, así que se dejaba sin cargar. Eso la volvía indistinguible
-- de "campera-negra" (misma categoría, mismo estilo/ocasión, sin ningún
-- dato real que las separe) tanto en el ícono/maniquí como en el resto del
-- motor. Mismo criterio que denim (0012), acolchado (0013), poliéster
-- (0014), viscosa (0018) y frisado (0019): se agrega como textura real
-- (no un tag cosmético), porque dibuja un patrón/brillo real en el ícono y
-- el maniquí, y ahora también distingue esta prenda de una campera de
-- tela lisa.
alter table armario.prendas drop constraint prendas_textura_check;
alter table armario.prendas add constraint prendas_textura_check
  check (textura in
    ('algodon','seda','cuero_liso','lino','lana','pana','corderoy','tejido_grueso','frisado','denim','acolchado','poliester','viscosa','impermeable') or textura is null);
