# RF-019 · Experiencia de administración

Solicitud: mejorar calidad UX/UI de los CRUD publicados.

Análisis: navegación plana de once enlaces, creación siempre visible, registros sin herramientas para encontrarlos, baja jerarquía visual y directorio de clientes oculto dentro de un selector.

Implementación: cambio OpenSpec `mejorar-administracion-ux`. Criterios: navegación contextual adaptable, creación bajo demanda, formularios legibles con obligatorios y feedback; búsqueda/estado/orden/páginas en catálogos; directorio de clientes y mejor lectura del resto de la operación. Conservar confirmaciones, permisos y transacciones existentes.

Estado: implementado y validado localmente; pendiente de publicación. RF-018 ya corresponde a paridad integral, por eso esta mejora usa RF-019. RF-017 mantiene sus pendientes de hosting independientes.

Validación: typecheck y build aprobados. Primera ejecución: 22 de 24 escenarios; se corrigieron etiquetas de campos y filtros, y la selección final de siete escenarios pasó con la compilación actual. En conjunto, 24 escenarios comprobados, 42 capturas de escritorio/móvil y conservación de borradores por error o eventos. Ver [evidencia](../evidencia/RF-019-pruebas.json) y [vista de servicios](../evidencia/capturas/RF-019/admin-servicios-1440.png).

La paginación es local sobre las colecciones completas de la API; movimientos conserva paginación de servidor. No se cambió la base de datos, credenciales, permisos, lógica de pagos ni stock del hosting. El publicador existente exige API en mantenimiento; no se ejecutó para esta mejora mientras la API está abierta.
