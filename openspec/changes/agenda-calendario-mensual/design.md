# Design

## Context
StaffAgenda usa /reservations y comparte acciones entre administración y barbero. Las fechas de atención son locales; la API ya devuelve el alcance autorizado completo.

## Goals / Non-Goals
**Goals:** calendario administrativo mensual con selección diaria y continuidad de acciones existentes.
**Non-Goals:** crear reservas, arrastrar citas, modificar disponibilidad ni rediseñar la agenda del barbero.

## Decisions
- Extraer la tarjeta de visita para reutilizar acciones. Activar calendario solo desde la sección administrativa; mantener el listado del barbero.
- Calendario con tabla semanal y botones de día; lunes como primer día. Cálculos UTC de fechas civiles para evitar desfases de horario de verano.
- URL agendaMonth/agendaDate independientes del mes del dashboard. Cambiar mes limpia el día; Hoy selecciona fecha local de Santiago.
- Mostrar vista previa de dos reservas por día en escritorio y cantidades en móvil. El detalle mantiene información completa y orden cronológico.
- Botones de día con nombre accesible, selección, indicador Hoy y foco por flechas; meses recorribles desde controles nativos. Sin dependencias adicionales.

## Risks / Trade-offs
- La API entrega toda la agenda → reutilizar lectura existente sin nuevas mutaciones, mantener su límite de escalabilidad conocido.
- Datos anteriores ante error → ocultar calendario/resultados y presentar reintento; no anunciar días disponibles basándose en una consulta fallida.

## Migration Plan
Pruebas de fechas, integración real con MariaDB y acciones, capturas escritorio/móvil. Publicar únicamente front con respaldo y comprobar HTTP/archivos servidos.
