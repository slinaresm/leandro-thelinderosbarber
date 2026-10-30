# Proposal

## Why
Los CRUD existentes de RF-016 exponen formularios completos antes de los registros, sin búsqueda en catálogos ni jerarquía entre navegación y acciones. RF-019 mejora la operación diaria y la lectura en móvil sin modificar reglas de negocio.

## What Changes
- Navegación lateral agrupada, encabezado contextual y controles adaptables.
- Búsqueda, filtro de estado, orden y paginación local en catálogos; estados vacíos recuperables.
- Creación bajo demanda, edición identificable y formularios con distribución consistente, campos obligatorios y feedback.
- Directorio visible de clientes; mejor lectura de pedidos, compras, métricas y promociones.

## Capabilities
### New Capabilities
### Modified Capabilities
- `paneles-operacion`: requisitos de descubrimiento de registros y formularios de operación accesibles.

## Impact
React: staff-panel, staff, staff-catalogs, staff-clients, staff-business, staff-commerce y staff.css. Sin nuevas dependencias ni cambios de API, permisos, JWT, stock o pagos. Evidencia e issue en docs/refactor.
