# Proposal

## Why
RF-021 convierte Administración / Agenda en un calendario mensual. El listado actual no permite ver la distribución de reservas entre los días del mes ni recorrer meses de forma directa.

## What Changes
- Calendario de lunes a domingo con fecha actual, selección de día y cantidad/vista previa de reservas.
- Mes anterior, siguiente, selector de mes y Hoy; mes y día conservados en URL.
- Filtros de estado, barbero y búsqueda; detalle cronológico del día o del mes con las acciones existentes.
- Diseño adaptable y navegación de días por teclado. El panel de barbero conserva su listado actual.

## Capabilities
### New Capabilities
### Modified Capabilities
- `paneles-operacion`: navegación mensual y selección diaria de la agenda administrativa.

## Impact
Solo React, pruebas y evidencia. Sin migraciones ni cambios de API, permisos, reservas o fidelización. Se conserva /reservations y publicación pública con respaldo.
