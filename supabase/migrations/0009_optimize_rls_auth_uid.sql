-- Envuelve auth.uid() en (select ...) en las 3 policies "dueño" del
-- schema armario, para que Postgres lo evalúe una sola vez por query en
-- vez de una vez por fila -- mismo efecto de seguridad, mejor plan de
-- ejecución en escala. Encontrado por los advisors reales de performance
-- de Supabase (auth_rls_initplan) en una auditoría integral, no supuesto.
-- Ya ejecutado contra el proyecto real.

drop policy if exists "prendas: dueño" on armario.prendas;
create policy "prendas: dueño" on armario.prendas
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "outfits: dueño" on armario.outfits;
create policy "outfits: dueño" on armario.outfits
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "outfit_prendas: dueño" on armario.outfit_prendas;
create policy "outfit_prendas: dueño" on armario.outfit_prendas
  for all
  using (
    exists (select 1 from armario.outfits o where o.id = outfit_id and o.user_id = (select auth.uid()))
    and exists (select 1 from armario.prendas p where p.id = prenda_id and p.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from armario.outfits o where o.id = outfit_id and o.user_id = (select auth.uid()))
    and exists (select 1 from armario.prendas p where p.id = prenda_id and p.user_id = (select auth.uid()))
  );
