-- Pedido explícito del usuario: "dale más detalles a las zapatillas...
-- las deportivas que tienen 3 rayas, o las urbanas tmb... revisa todos
-- los estilos... las costuras, cortes y decoración más usadas según usos
-- y costumbres". Antes, "calzado" era una sola silueta genérica de
-- zapatilla con cordones, distinguida solo por suela_contraste -- sin
-- diferencia real entre un mocasín, un zapato de vestir y una zapatilla
-- deportiva más allá del color. Revisado como modista/ingeniero textil:
-- ver el comentario largo de CorteCalzado en types.ts para el porqué de
-- cada uno de los 5 valores (uno por cada Estilo real -- antes el
-- catálogo solo cubría urbano/formal/deportivo).
--
-- Default 'zapatilla_urbana': preserva el dibujo de todo el catálogo
-- anterior (100% zapatillas urbanas hasta esta revisión).
alter table armario.prendas add column corte_calzado text not null default 'zapatilla_urbana'
  check (corte_calzado in ('zapatilla_urbana', 'zapatilla_running', 'zapato_vestir', 'mocasin', 'zapatilla_lona'));
