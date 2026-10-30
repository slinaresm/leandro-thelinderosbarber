# Proposal
## Why
RF-023 incorpora el módulo ausente de Usuarios. Las cuentas solo se crean mediante registro de clientes o alta de barberos; no hay administración general de datos, roles, contraseñas y acceso.
## What Changes
- API privada y sección Usuarios: búsqueda/filtros, alta de tres roles, edición, cambio de contraseña, baja lógica y reactivación.
- Conservación de perfiles e historial, revocación de sesiones y auditoría sin contraseñas.
- Protección contra pérdida del acceso administrativo por acciones propias o concurrentes.
## Capabilities
### New Capabilities
### Modified Capabilities
- `identidad-api`: gestión administrativa de cuentas y revocación al cambiar acceso.
## Impact
Controlador/rutas PHP, React y pruebas. Sin nuevas tablas ni dependencias. Se reutiliza deleted_at como baja de acceso y se conservan perfiles. El despliegue privado debe actualizar el autoload de producción junto con el controlador, sin sobrescribir entorno, almacenamiento ni datos.
