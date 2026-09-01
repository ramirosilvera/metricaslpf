-- outfit_prendas no tenía created_at: el orden de las prendas dentro de un
-- outfit guardado quedaba a merced del orden físico de Postgres (no
-- garantizado sin ORDER BY), así que la UI podía mostrarlas en un orden
-- distinto cada carga. Se agrega la columna para poder ordenar de forma
-- determinística por el momento real en que el usuario agregó cada prenda.
alter table armario.outfit_prendas
  add column if not exists created_at timestamptz not null default now();
