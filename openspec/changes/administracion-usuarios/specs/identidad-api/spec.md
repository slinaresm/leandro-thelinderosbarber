## ADDED Requirements
### Requirement: Gestión administrativa de usuarios
Solo admin SHALL listar, crear, editar, desactivar y reactivar cuentas de roles admin/barbero/cliente y establecer contraseñas nuevas. La API SHALL validar campos/correo único y responder sin hashes, contraseñas o tokens. La baja será lógica y los perfiles/historial se conservarán; los perfiles faltantes del nuevo rol se crearán atómicamente.
#### Scenario: Alta y cambio de rol
- **WHEN** un administrador crea un cliente y luego le asigna rol barbero
- **THEN** existe una cuenta, se conserva el perfil cliente y se crea el perfil barbero sin alterar reservas o fidelización
### Requirement: Acceso revocable y administración protegida
Cambiar contraseña, correo, rol o desactivar SHALL revocar sesiones de la cuenta. Reactivar no recuperará tokens anteriores. La API SHALL impedir auto-baja/cambio del propio rol y conservar administración activa ante solicitudes concurrentes, revalidando al actor. La auditoría SHALL registrar acciones sin contraseñas, hashes o tokens.
#### Scenario: Dos administradores actúan concurrentemente
- **WHEN** intentan desactivarse mutuamente
- **THEN** al menos uno conserva acceso y el actor que pierde permisos no puede completar una mutación con autorización obsoleta
#### Scenario: Restablecer acceso
- **WHEN** una cuenta desactivada se reactiva
- **THEN** puede iniciar una sesión nueva y los tokens revocados siguen rechazados
