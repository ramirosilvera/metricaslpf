-- Pedido explícito del usuario: "incorpora al catálogo de prendas camisas
-- ralladas... inspírate en usos y costumbres, moda". Una camisa a rayas es,
-- por definición, DOS colores (el fondo y la raya) -- el modelo actual solo
-- guarda un color por prenda (color_hex/h/s/l), así que no había forma
-- honesta de representar un estampado real sin este segundo color. Mismo
-- criterio de esta sesión en cada revisión anterior: nunca prometer un
-- detalle visual (nombre/tag) sin poder dibujarlo de verdad -- de hecho
-- "camisa-cuadros" ya existía en el catálogo con ese problema exacto (el
-- nombre decía "a cuadros", pero se dibujaba como una camisa lisa de un
-- solo color), corregido en esta misma migración.
--
-- patron: liso (default, el 99% del catálogo hasta ahora) | rayas | cuadros.
-- color2_*: el segundo color del estampado -- null cuando patron='liso'
-- (no hay estampado, no hay segundo color que guardar).
alter table armario.prendas add column patron text not null default 'liso'
  check (patron in ('liso', 'rayas', 'cuadros'));
-- mismo formato/rango que color_hex/h/s/l ya validan más arriba en el
-- schema (0006) -- nullable a propósito: sin estampado (patron='liso',
-- el default) no hay segundo color que guardar.
alter table armario.prendas add column color2_hex text check (color2_hex ~ '^#[0-9A-Fa-f]{6}$');
alter table armario.prendas add column color2_h numeric check (color2_h >= 0 and color2_h < 360);
alter table armario.prendas add column color2_s numeric check (color2_s between 0 and 100);
alter table armario.prendas add column color2_l numeric check (color2_l between 0 and 100);
