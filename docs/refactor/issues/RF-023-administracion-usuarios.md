# RF-023 · Administración de usuarios

Módulo Usuarios para alta de administradores/barberos/clientes, edición de nombre/correo/teléfono/rol, nueva contraseña, baja lógica y reactivación. Búsqueda/filtros y confirmaciones. Sin borrado físico; mantiene perfiles, reservas e historial. Un cambio de rol crea el perfil faltante y retira al antiguo barbero del catálogo; volver al rol conserva su perfil previo.

JWT/admin y CSRF en servidor; correo único, contraseña bcrypt de 12 caracteres mínimo/72 bytes máximo. Baja/cambio de contraseña/correo/rol revocan sesiones. Prohíbe auto-baja/cambio de rol propio, revalida actor bajo bloqueo y mantiene un admin activo ante concurrencia. Auditoría sin secretos. No envía credenciales ni modifica usuarios reales durante pruebas/despliegue.

Cambio OpenSpec: administracion-usuarios. Sin migraciones. Publicación privada debe incluir controlador, rutas y mapas Composer de producción coherentes; respaldo/rollback y verificación antes del front. Implementado y validado localmente: 14 pruebas PHP/122 aserciones, tres escenarios de navegador (incluida concurrencia real), siete pruebas del publicador privado, tipos/build/formatter y contrato de 73 operaciones. Ver [evidencia](../evidencia/RF-023-pruebas.json). Pendiente de publicación privada y pública.
