-- Pedido explícito del usuario: "algunas prendas pueden funcionar para más
-- de un estilo" (ej. un sweater mostaza sirve tanto para oficina/clásico
-- como para un fin de semana casual). `estilo` sigue siendo el registro
-- PRINCIPAL de la prenda (lo que ya usa registroOutfit() para el badge del
-- outfit, sin cambios) -- esta columna nueva es aditiva: estilos ADICIONALES
-- en los que la prenda también funciona. Array vacío por defecto en TODAS
-- las filas existentes -- ningún dato se inventa ni cambia de
-- comportamiento hasta que el usuario cargue uno a propósito.
alter table armario.prendas add column if not exists estilos_secundarios text[] not null default '{}';

-- Mismos 5 valores que el check de `estilo` de la migración base -- <@ valida
-- que CADA elemento del array esté en la lista permitida (no que el array
-- entero sea igual, así que un array vacío o de 1-2 elementos pasa igual).
alter table armario.prendas drop constraint if exists prendas_estilos_secundarios_check;
alter table armario.prendas add constraint prendas_estilos_secundarios_check
  check (estilos_secundarios <@ array['casual','formal','deportivo','urbano','clasico']::text[]);
