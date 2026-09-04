-- Pedido explícito del usuario: "quiero que en mis prendas se pueda
-- agregar la opción de que una prenda necesita cambio... todavía es
-- usable pero necesita cambio en breve. Lo que no es usable directamente
-- no está en mi placard." Un dato real de la prenda (como suela_contraste
-- o requiere_cuello), no una regla de compatibilidad -- el motor de
-- puntaje/combinación no cambia nada, esto es puramente informativo para
-- avisarle al usuario en la UI.
alter table armario.prendas add column necesita_cambio boolean not null default false;
