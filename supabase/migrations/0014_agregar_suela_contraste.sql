-- Corrección de la migración de render anterior: la suela blanca de una
-- zapatilla NO es una regla automática que aplique a toda zapatilla sin
-- distinción (eso rompía la opción real de tener una zapatilla negra o
-- marrón totalmente monocromática) -- es un atributo real de esa prenda en
-- particular, tan válido como "textura" o "estilo". Se agrega como columna
-- propia (no como valor de "textura": no es un material, es un detalle de
-- color de una parte de la prenda) para que Maniqui.tsx la dibuje según el
-- dato real de cada prenda, no según una heurística global.
alter table armario.prendas add column suela_contraste boolean not null default false;
