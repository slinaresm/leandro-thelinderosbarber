## ADDED Requirements
### Requirement: Revisión visual de compra
Compras SHALL separar datos, productos y revisión; mostrar cantidades, subtotales y total antes de confirmar, sin presentar importes inválidos como cero. La factura será opcional y sus propuestas requerirán revisión. Los reintentos SHALL conservar clave/carga y bloquear edición; consultar historial o actualizar no borrará el borrador ni repetirá escrituras.
#### Scenario: Importe incompleto y reintento
- **WHEN** se vacía un costo o se pierde la respuesta de una compra
- **THEN** no se presenta un total parcial como válido y el reintento conserva la operación original
### Requirement: Historial de compras consultable
El administrador SHALL buscar compras por proveedor, factura o productos, filtrar mes, ordenar por fecha y recorrer páginas; cada registro tendrá detalle desplegable y acceso permitido al comprobante. La interfaz SHALL ser usable en móvil y distinguir historial vacío, búsqueda sin coincidencias y error de consulta.
#### Scenario: Consulta sin coincidencias
- **WHEN** los filtros no encuentran compras
- **THEN** se permite restablecerlos sin perder el borrador en edición
