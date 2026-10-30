# Design
## Context
JWT verifica users.deleted_at y lee rol vigente. Las tablas clients/barbers relacionan perfiles por user_id; no deben borrarse al cambiar acceso. Composer en hosting usa classmap authoritative, por lo que un controlador nuevo requiere actualizar los mapas generados de producción.
## Goals / Non-Goals
**Goals:** administrar cuentas de todos los roles, conservar historial y evitar bloqueo administrativo o sesiones obsoletas.
**Non-Goals:** borrado físico, lectura de contraseñas, envío de credenciales, recuperación por correo o modificación de fidelización.
## Decisions
- Controlador dedicado y endpoints /users protegidos por JWT/admin y CSRF existente; proyección explícita sin hashes/tokens. Validación estricta y correo normalizado.
- Baja lógica usa deleted_at; DELETE y cambio de estado desactivan sin eliminar. Revocar sesiones ante baja, contraseña, correo o rol. Reactivar no restaura sesiones previas.
- Transacciones bloquean usuarios en orden estable y revalidan al actor desde DB para serializar cambios administrativos concurrentes. No se permite auto-baja ni cambio del propio rol; conservar al menos un admin activo.
- Crear perfil del rol cuando falta, conservar perfiles previos y desactivar catálogo de barbero cuando deja ese rol. Al volver a barbero, un perfil anterior conserva su estado de catálogo; se gestiona en Barberos.
- Contraseñas iniciales/nuevas de 12 caracteres mínimo y 72 bytes máximo, bcrypt; auditoría excluye hashes, contraseñas y sesiones.
- Despliegue privado limitado a controlador, rutas y dos mapas Composer, con respaldo, cierre público breve, transferencia verificada y rollback. Comprobar rutas no cacheadas y mismo sufijo de autoload; luego publicar front.
## Risks / Trade-offs
- Bloquear usuarios serializa operaciones administrativas; apropiado para el volumen actual, transacciones breves con hash calculado antes del bloqueo.
- Cambio de correo propio o contraseña cierra la propia sesión → anunciarlo antes de confirmar y volver al ingreso.
- Sin SSH/CLI remoto → actualizar solo archivos compatibles sin migraciones; abortar antes de escribir si hay caché de rutas o mapas incompatibles.
## Migration Plan
PHPUnit sobre MariaDB aislada, integración navegador con cuentas sintéticas y concurrencia real, formatter/tipos/build. Desplegar API y comprobar /api/users no autenticado devuelve 401; publicar front y verificar códigos/estilos y health. No crear usuarios de prueba en producción.
