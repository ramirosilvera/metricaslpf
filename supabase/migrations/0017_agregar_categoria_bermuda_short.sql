-- Pedido explícito del usuario: agregar Bermudas y shorts deportivos al
-- catálogo -- hoy "pantalon" es la única categoría de prenda de piernas
-- (jean, chino, vestir, jogger... todos comparten categoria="pantalon",
-- diferenciados solo por color/textura/estilo). Un bermuda o un short
-- deportivo no son "un pantalón más" para el maniquí: terminan a la altura
-- de la rodilla o del muslo, no del tobillo -- una diferencia de largo real
-- que si se metiera adentro de "pantalon" obligaría a mentir sobre el largo
-- de la prenda para poder dibujarla bien (Maniqui.tsx). Se agregan como dos
-- categorías propias, no una sola "short" genérica, porque el bermuda
-- (~rodilla, tela tipo chino/algodón) y el short deportivo (~medio muslo,
-- tela técnica) tienen largos distintos y merecen su propia geometría en el
-- maniquí -- no dos variantes del mismo dibujo.
alter table armario.prendas drop constraint prendas_categoria_check;
alter table armario.prendas add constraint prendas_categoria_check
  check (categoria in
    ('pantalon','bermuda','short_deportivo','remera','buzo','sweater','camisa','calzado','campera','accesorio'));
