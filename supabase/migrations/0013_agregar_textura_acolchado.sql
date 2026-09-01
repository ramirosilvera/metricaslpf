-- Pedido del usuario: camperas de tipo pluma (puffer, como las de Uniqlo) --
-- ninguna textura del enum describe nylon/plumón acolchado, así que se
-- agrega "acolchado" (mismo criterio que "denim" en la migración 0012: se
-- usa para dibujar un patrón visual real en el maniquí, no es solo un tag).
alter table armario.prendas drop constraint prendas_textura_check;
alter table armario.prendas add constraint prendas_textura_check
  check (textura in
    ('algodon','seda','cuero_liso','lino','lana','pana','corderoy','tejido_grueso','denim','acolchado') or textura is null);
