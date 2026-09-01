-- Reporte real del usuario (captura del selector "+ Prenda"): cinturón,
-- corbata y bufanda -- las tres únicas prendas categoria=accesorio del
-- catálogo -- se veían con el mismo ícono (una tira con hebilla), porque
-- ese ícono nunca distinguía nada más fino que "accesorio". requiere_cuello
-- (migración 0015) ya distingue la corbata para la lógica de combinación,
-- pero no alcanza para el dibujo: una bufanda tampoco requiere_cuello y sin
-- embargo se usa al cuello igual que la corbata, no a la cintura como un
-- cinturón. Se agrega el dato real que faltaba -- dónde se usa la prenda en
-- el cuerpo -- para que el ícono chico (PrendaIcon) y el maniquí grande
-- (Maniqui) puedan dibujar cada accesorio en su lugar real. Default
-- 'cintura' preserva el dibujo actual (el único que existía) para
-- cualquier accesorio ya cargado, es decir, los cinturones.
alter table armario.prendas
  add column posicion_accesorio text not null default 'cintura'
  check (posicion_accesorio in ('cuello', 'cintura'));
