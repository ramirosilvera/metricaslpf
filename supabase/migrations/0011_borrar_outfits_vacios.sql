-- outfits no tiene FK hacia prendas (solo outfit_prendas, la tabla de
-- unión, con on delete cascade). Al borrar una prenda, la cascada puede
-- vaciar por completo el outfit_prendas de un outfit sin tocar la fila de
-- outfits en sí -- queda un registro "fantasma" (sin prendas, sin nombre
-- porque guardarOutfit siempre inserta nombre:null) que nadie puede volver
-- a borrar desde la UI. Este trigger lo limpia en la misma transacción que
-- generó el vacío, sea por el borrado de una prenda o por cualquier otro
-- delete futuro sobre outfit_prendas.
create or replace function armario.borrar_outfit_si_vacio()
returns trigger
language plpgsql
security definer
set search_path = armario
as $$
begin
  delete from armario.outfits o
  where o.id = old.outfit_id
    and not exists (
      select 1 from armario.outfit_prendas op where op.outfit_id = o.id
    );
  return old;
end;
$$;

drop trigger if exists trg_borrar_outfit_vacio on armario.outfit_prendas;
create trigger trg_borrar_outfit_vacio
after delete on armario.outfit_prendas
for each row
execute function armario.borrar_outfit_si_vacio();
