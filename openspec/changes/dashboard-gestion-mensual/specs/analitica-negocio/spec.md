## ADDED Requirements

### Requirement: Dashboard mensual y evolución por barbero
El administrador SHALL seleccionar un mes y consultar ingresos de servicios completados y pedidos pagados, evolución de doce meses y desglose mensual por identidad de barbero. Los meses sin actividad SHALL mostrar cero y los costos desconocidos permanecerán desconocidos. Las ventas de tienda SHALL atribuirse al mes local de creación del pedido, coherente con la analítica existente, sin atribuirlas a barberos.

#### Scenario: Dos barberos con el mismo nombre
- **WHEN** existen atenciones de integrantes distintos con igual nombre
- **THEN** sus ingresos se mantienen separados por identidad en la comparación y la matriz anual

#### Scenario: Cambio de precio y estados de reserva
- **WHEN** una reserva conserva su precio snapshot y otras están confirmadas, canceladas o ausentes
- **THEN** solo la completada aporta su precio persistido al ingreso realizado

### Requirement: Lectura global accesible y recuperable
El dashboard SHALL presentar ticket promedio, clientes atendidos, completadas, confirmadas, cancelaciones, ausencias y pedidos pendientes con gráficos y valores numéricos accesibles. Un error de lectura SHALL permitir reintentar sin presentar faltantes como cero. Los importes fuera del rango entero seguro SHALL impedir mostrar sumas incorrectas.

#### Scenario: Mes vacío o error de lectura
- **WHEN** no hay actividad o falla una fuente de datos
- **THEN** distingue el mes sin actividad de la información no disponible y permite recuperar las lecturas fallidas
