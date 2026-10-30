# RF-022 · Interfaz de compras

Editor por pasos visibles con factura opcional, datos del documento, líneas compactas, subtotales y resumen de cantidades/costo total. Historial por fecha con búsqueda, mes, paginación y detalle desplegable. Conserva revisión humana, privacidad, clave/carga del reintento y estados de error sin repetir escrituras. Cambio OpenSpec: compras-interfaz-operativa.

Solo front: sin cambios de API o base de datos. Totales enteros seguros; un costo incompleto o fuera de rango no se muestra como cero. Colecciones y filtros locales. Validación local aprobada: cinco pruebas de modelo y ocho escenarios de integración con PHP/MariaDB/navegador real, tipos, compilación y capturas a 1440/390 px. Ver [evidencia](../evidencia/RF-022-pruebas.json). Publicación en curso.
