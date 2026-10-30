# Design

## Context
RF-016 ya centraliza mutaciones y confirmaciones en staff.tsx y separa catálogos por módulos. Las API devuelven colecciones completas salvo movimientos; se conservarán sus contratos.

## Goals / Non-Goals
**Goals:** reducir ruido inicial, facilitar localizar y revisar registros, conservar reglas y borradores en reconsultas.
**Non-Goals:** cambiar proveedores, permisos, autenticación, contabilidad o añadir eliminación física.

## Decisions
- Reutilizar una colección tipada con búsqueda normalizada, estado, orden español y páginas de diez registros. El servidor sigue siendo autoridad de todos los cambios.
- Creación desplegable con details nativo y edición contextual; evita gestionar una segunda capa de diálogos y conserva borradores. Confirmaciones sensibles permanecen en dialog.
- Navegación agrupada lateral en escritorio y desplegable en móvil; título y descripción contextual. Mantener query tab y alias.
- Paleta carbón, marfil y acento rojo coherente con el sitio; tarjetas compactas, campos en dos columnas y tablas con scroll contenido.

## Risks / Trade-offs
- Paginación local requiere descargar la colección completa → no presentar como paginación de servidor; movimientos mantienen su paginación existente.
- CSS compartido afecta barbero → comprobar también sus recorridos existentes.
- Cambios en la ubicación de creación afectan pruebas → adaptar apertura explícita y mantener pruebas reales de guardado/permisos.

## Migration Plan
Validar tipos, compilación y flujos en navegador con datos sintéticos. Publicación del front mediante workflow existente sin tocar API ni datos. RF-017 conserva sus pendientes independientes.
