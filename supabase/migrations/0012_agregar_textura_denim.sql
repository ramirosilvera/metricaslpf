-- El catálogo (catalogo.ts) documentaba explícitamente que no podía marcar
-- jeans/campera de jean como "denim" porque ese valor no existía en el
-- enum de textura -- quedaba sin ambigüedad correcta, pero sin usar. Ahora
-- que la textura se usa para dibujar un patrón visual real en el maniquí
-- (Maniqui.tsx), denim deja de ser un caso ambiguo sin resolver: es la
-- tela más común del placard de cualquiera y merece su propio valor.
alter table armario.prendas drop constraint prendas_textura_check;
alter table armario.prendas add constraint prendas_textura_check
  check (textura in
    ('algodon','seda','cuero_liso','lino','lana','pana','corderoy','tejido_grueso','denim') or textura is null);
