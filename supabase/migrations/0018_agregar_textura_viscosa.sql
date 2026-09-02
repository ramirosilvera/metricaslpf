-- Pedido del usuario, revisado como ingeniero textil: los sweaters de
-- entretiempo son de fibra liviana (viscosa/poliéster), no lana -- ninguna
-- textura del enum describía viscosa/rayón (mismo criterio que denim en
-- 0012, acolchado en 0013 y poliéster en 0014: se usa para dibujar un
-- brillo real en el maniquí, no es solo un tag).
alter table armario.prendas drop constraint prendas_textura_check;
alter table armario.prendas add constraint prendas_textura_check
  check (textura in
    ('algodon','seda','cuero_liso','lino','lana','pana','corderoy','tejido_grueso','denim','acolchado','poliester','viscosa') or textura is null);
