-- Pedido del usuario: que toda prenda deportiva tenga por defecto textura
-- "poliéster" -- ninguna textura del enum describía tela técnica sintética,
-- así que se agrega (mismo criterio que "denim" en 0012 y "acolchado" en
-- 0013: se usa para dibujar un patrón visual real en el maniquí, no es solo
-- un tag).
alter table armario.prendas drop constraint prendas_textura_check;
alter table armario.prendas add constraint prendas_textura_check
  check (textura in
    ('algodon','seda','cuero_liso','lino','lana','pana','corderoy','tejido_grueso','denim','acolchado','poliester') or textura is null);
