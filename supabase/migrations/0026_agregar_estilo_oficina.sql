-- Pedido explícito del usuario, revisado como asesor de imagen/sastre:
-- "formal y oficina se mezclan... quiero un estilo oficina por un lado, y
-- el estilo formal solamente el traje (pantalón de vestir, camisa,
-- corbata, cinturón y saco). Formal es formal." Distinción real de
-- vestuario de oficina: "formal" (traje completo, con saco -- ver el
-- nuevo chequeo en recommend.ts que exige saco para calificar) vs.
-- "oficina" (elegante sport: pantalón de vestir + camisa o sweater, SIN
-- corbata ni saco). Mismo patrón que las migraciones de Textura de esta
-- sesión (0024/0025): agrega un valor real al enum, no un tag cosmético,
-- porque ahora el motor lo usa para filtrar de verdad (ver
-- outfitSirveParaEstilo en recommend.ts).
alter table armario.prendas drop constraint prendas_estilo_check;
alter table armario.prendas add constraint prendas_estilo_check
  check (estilo in ('casual','formal','deportivo','urbano','clasico','oficina') or estilo is null);

alter table armario.prendas drop constraint prendas_estilos_secundarios_check;
alter table armario.prendas add constraint prendas_estilos_secundarios_check
  check (estilos_secundarios <@ array['casual','formal','deportivo','urbano','clasico','oficina']);
