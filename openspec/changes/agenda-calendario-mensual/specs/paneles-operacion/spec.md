## ADDED Requirements

### Requirement: Calendario administrativo mensual
La agenda administrativa SHALL mostrar los días del mes de lunes a domingo, permitir navegar a meses anteriores y siguientes, elegir un mes y volver a Hoy. Cada día SHALL mostrar su cantidad de reservas según filtros y permitir consultar su detalle cronológico. Mes y día SHALL conservarse al recargar el enlace; el día actual y el seleccionado serán distinguibles sin depender solo de color.

#### Scenario: Cambio de año y mes bisiesto
- **WHEN** se navega entre diciembre y enero o se abre febrero de un año bisiesto
- **THEN** el calendario ubica correctamente todos los días y permite regresar al mes anterior

### Requirement: Operación diaria filtrada y accesible
El administrador SHALL filtrar por barbero, estado y búsqueda, consultar un día vacío y volver a todas las reservas del mes. Las acciones existentes de completar, cancelar y reprogramar SHALL conservar confirmaciones y permisos. El calendario SHALL adaptarse a móvil y permitir recorrer días con teclado. Un error de lectura no se mostrará como ausencia de reservas.

#### Scenario: Día seleccionado sin resultados
- **WHEN** se selecciona un día sin reservas coincidentes
- **THEN** se muestra un estado vacío recuperable sin ocultar la navegación mensual ni los filtros
