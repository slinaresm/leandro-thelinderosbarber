# Proposal
## Why
RF-022 mejora Compras: el formulario actual mezcla extracción, campos y líneas extensas, sin total visible antes de confirmar, y el historial abre todos los detalles a la vez.
## What Changes
- Flujo visual de datos, productos y revisión, con factura opcional desplegable.
- Subtotales, cantidades y total seguro visibles; resumen lateral adaptable y estados de borrador, reintento y confirmación.
- Historial compacto con búsqueda, filtro mensual, orden por fecha, páginas y detalle de productos/comprobante.
## Capabilities
### New Capabilities
### Modified Capabilities
- `paneles-operacion`: revisión visual y consulta de compras administrativas.
## Impact
Solo React y pruebas. Sin cambios de API, proveedores, archivos privados ni transacciones de stock. Preserva clave/carga de reintento y revisión obligatoria de extracción. Publicación con respaldo.
