# Design
## Context
PurchaseEditor conserva borrador y clave idempotente en memoria; PurchaseSales confirma stock/costos en servidor. Se reutilizan esos estados y contratos. La sección requiere una mejor jerarquía visual, no nuevas operaciones.
## Goals / Non-Goals
**Goals:** edición compacta, revisión monetaria clara, historial fácil de consultar y recuperación sin duplicar compras.
**Non-Goals:** cambiar extracción, crear proveedores, editar compras confirmadas o habilitar integraciones.
## Decisions
- Separar Compras en un módulo dedicado, dejando pedidos/movimientos intactos.
- Distribución principal/resumen lateral; en móvil el resumen sigue a las líneas. Mostrar subtotales y total únicamente cuando los enteros y sumas sean seguros.
- Factura opcional en details nativo; extracción mantiene archivos privados y checkbox de revisión.
- Historial con filtros locales por mes/texto, fecha descendente y diez registros por página. Detalle nativo desplegable, cantidades/costos snapshot y descarga existente.
- Mantener editor montado durante reconsulta y filtros del historial. Reintento conserva clave/carga y campos bloqueados; éxito identifica compra registrada.
## Risks / Trade-offs
- Colecciones completas de API → no presentar filtros/paginación como operaciones del servidor.
- La lectura de factura puede no estar disponible → ofrecer entrada manual sin simular éxito ni habilitar proveedores.
## Migration Plan
Pruebas de cálculos, compra manual, extracción/revisión, errores, reintento e interfaz móvil/escritorio. Publicar solo front y verificar HTTP/archivos.
