# Design

## Context
Las lecturas administrativas existentes devuelven reservas completas con barber_id y precio snapshot resuelto, pedidos con total/estado/created_at y barberos incluyendo inactivos. La analítica from/to aporta costos y margen comercial con semántica de creación del pedido.

## Goals / Non-Goals
**Goals:** sumar datos persistidos y presentar visión mensual/anual en React sin despliegue de API.
**Non-Goals:** contabilidad de caja, comisiones, utilidad neta o pagos externos; no existen esos datos suficientes.

## Decisions
- Modelo puro y probado para agrupación por barber_id y mes. Fechas de reservas son locales; timestamps comerciales se convierten de UTC a America/Santiago. Validar enteros y sumas seguras.
- Consultar reservas/pedidos/barberos una vez por revisión; filtrar meses localmente. Consultar costos del mes con el endpoint analítico existente. Los GET independientes no constituyen un snapshot atómico conjunto; mantener feedback de actualización y reconsulta común.
- Gráficos propios con HTML/CSS y valores/tablas accesibles: columnas apiladas mensuales y barras por barbero. Sin librerías nuevas ni scripts externos.
- KPI global suma servicios completados y pedidos pagados; ranking y matriz de barberos solo servicios. Comparación contra mes anterior, sin porcentaje infinito al partir de cero; mes actual advierte comparación parcial.
- Costos/margen de tienda separados de compras; no denominar utilidad neta al ingreso.

## Risks / Trade-offs
- Lecturas completas crecen con el negocio → reutiliza contratos actuales; no presentar como consulta paginada o agregación de servidor. Futura optimización requiere endpoint agregado.
- Lecturas independientes pueden cambiar durante reconsulta → no prometer consistencia transaccional conjunta; permitir actualizar y no convertir errores en ceros.

## Migration Plan
Pruebas de modelo, tipos, compilación y navegador real con MariaDB sintética. Publicar solo front con respaldo y verificar archivos y health HTTP. Sin migraciones ni reinicios de API.
