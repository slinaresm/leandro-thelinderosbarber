# Proposal

## Why
RF-020 convierte Resumen en un dashboard para conocer el estado mensual y anual del negocio y el aporte de cada barbero. El resumen actual obliga a leer tablas y no presenta ingresos mensuales por integrante.

## What Changes
- Selección de mes con indicadores, variación respecto al mes anterior y evolución anual.
- Ingresos de servicios y tienda diferenciados, comparación de barberos y matriz mensual por barbero.
- Actividad, cancelaciones, ausencias, ticket promedio y pendientes con enlaces a operación.
- Gráficos accesibles, tablas de datos y estados de vacío/error en móvil.

## Capabilities
### New Capabilities
### Modified Capabilities
- `analitica-negocio`: dashboard mensual con desgloses verificables y criterios de ingreso explícitos.

## Impact
Solo React y pruebas; API, JWT y datos permanecen intactos. Se usan las lecturas administrativas existentes de reservas, pedidos, barberos y analítica. Sin dependencias nuevas. Publicación mediante el workflow de actualización pública existente tras validación.
