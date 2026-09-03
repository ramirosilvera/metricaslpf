-- Pedido explícito del usuario: "agregues al catálogo y a mi placard un
-- traje azul marino... corbata azul marina y zapatos marrones". El
-- pantalón de vestir azul marino, la corbata azul marina y los zapatos de
-- cuero marrones ya existían como categorías/presets (pantalon+lana,
-- accesorio+seda, calzado+cuero_liso) -- lo único que faltaba de verdad
-- era el SACO del traje: no existe ninguna categoría para una chaqueta de
-- traje entallada (solapas, botones, se usa abierta sobre camisa/corbata)
-- -- "campera" es ropa de calle/abrigo (cierre de cremallera, cuello
-- camisero simple, ver Maniqui.tsx), semánticamente y visualmente otra
-- prenda, no un traje con otro color.
alter table armario.prendas drop constraint prendas_categoria_check;
alter table armario.prendas add constraint prendas_categoria_check
  check (categoria in
    ('pantalon','bermuda','short_deportivo','remera','buzo','sweater','camisa','calzado','campera','accesorio','saco'));
