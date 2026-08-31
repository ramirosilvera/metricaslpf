-- Matiz — schema `armario`: placard personal, outfits guardados.
-- Reemplaza el schema `metricas_mundial` (Métricas LPF, dado de baja).
-- Idempotente: seguro correrlo de nuevo.

create schema if not exists armario;
grant usage on schema armario to authenticated;

create table if not exists armario.prendas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  categoria text not null check (categoria in
    ('pantalon','remera','buzo','sweater','camisa','calzado','campera','accesorio')),
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  color_h numeric not null check (color_h >= 0 and color_h < 360),
  color_s numeric not null check (color_s between 0 and 100),
  color_l numeric not null check (color_l between 0 and 100),
  textura text check (textura in
    ('algodon','seda','cuero_liso','lino','lana','pana','corderoy','tejido_grueso') or textura is null),
  estilo text check (estilo in ('casual','formal','deportivo','urbano','clasico') or estilo is null),
  ocasion text check (ocasion in ('casual','laburo','formal') or ocasion is null),
  estacion text check (estacion in ('verano','invierno','entretiempo') or estacion is null),
  foto_path text, -- convención: {user_id}/{prenda_id}.webp
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists armario.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text,
  created_at timestamptz not null default now()
);

create table if not exists armario.outfit_prendas (
  outfit_id uuid not null references armario.outfits(id) on delete cascade,
  prenda_id uuid not null references armario.prendas(id) on delete cascade,
  primary key (outfit_id, prenda_id)
);

create index if not exists prendas_user_cat_idx     on armario.prendas (user_id, categoria);
create index if not exists outfits_user_idx         on armario.outfits (user_id);
create index if not exists outfit_prendas_prenda_idx on armario.outfit_prendas (prenda_id);

alter table armario.prendas enable row level security;
alter table armario.outfits enable row level security;
alter table armario.outfit_prendas enable row level security;

grant select, insert, update, delete on armario.prendas        to authenticated;
grant select, insert, update, delete on armario.outfits        to authenticated;
grant select, insert, update, delete on armario.outfit_prendas to authenticated;

drop policy if exists "prendas: dueño" on armario.prendas;
create policy "prendas: dueño" on armario.prendas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "outfits: dueño" on armario.outfits;
create policy "outfits: dueño" on armario.outfits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Valida AMBOS lados (outfit propio Y prenda propia).
drop policy if exists "outfit_prendas: dueño" on armario.outfit_prendas;
create policy "outfit_prendas: dueño" on armario.outfit_prendas
  for all
  using (
    exists (select 1 from armario.outfits o where o.id = outfit_id and o.user_id = auth.uid())
    and exists (select 1 from armario.prendas p where p.id = prenda_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from armario.outfits o where o.id = outfit_id and o.user_id = auth.uid())
    and exists (select 1 from armario.prendas p where p.id = prenda_id and p.user_id = auth.uid())
  );

-- Storage: bucket privado para fotos de prendas, path {user_id}/{prenda_id}.webp.
-- El bucket en sí se crea desde el dashboard o la API de Storage (no hay DDL
-- SQL directo para "create bucket"), pero la policy sobre storage.objects sí:
drop policy if exists "armario-fotos: dueño" on storage.objects;
create policy "armario-fotos: dueño" on storage.objects
  for all
  using (bucket_id = 'armario-fotos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'armario-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
