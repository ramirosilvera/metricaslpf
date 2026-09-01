-- Hallazgo de la 2da ronda de revisión de Consejo (moda/color): el motor
-- recomendaba una corbata "excelente" sobre un buzo o una remera -- una
-- corbata necesita una camisa con cuello debajo, no es una cuestión de
-- color. No hay ningún campo existente que distinga eso (textura/estilo/
-- ocasion son compartidos con cinturones y bufandas, que sí van sobre
-- cualquier cosa), así que se agrega como columna real, mismo criterio que
-- suela_contraste (migración 0014): default false preserva el
-- comportamiento de cualquier prenda existente.
alter table armario.prendas add column requiere_cuello boolean not null default false;
