# RF-022 · Interfaz de compras

Editor por pasos visibles con factura opcional, datos del documento, líneas compactas, subtotales y resumen de cantidades/costo total. Historial por fecha con búsqueda, mes, paginación y detalle desplegable. Conserva revisión humana, privacidad, clave/carga del reintento y estados de error sin repetir escrituras. Cambio OpenSpec: compras-interfaz-operativa.

Solo front: sin cambios de API o base de datos. Totales enteros seguros; un costo incompleto o fuera de rango no se muestra como cero. Colecciones y filtros locales. Validación local aprobada: cinco pruebas de modelo y ocho escenarios de integración con PHP/MariaDB/navegador real, tipos, compilación y capturas a 1440/390 px. Ver [evidencia](../evidencia/RF-022-pruebas.json). Publicado el 2026-10-30.


## Entrega

[Publicación 41127100861](https://github.com/slinaresm/leandro-thelinderosbarber/actions/runs/41127100861) aprobada: 91 archivos publicados y 106 anteriores respaldados/verificados, recursos anteriores conservados y cero escrituras a la base. Compras, ingreso, portada, health y CSRF respondieron 200. Código/estilos nuevos descargados y comprobados; dashboard y calendario continúan incluidos. Ver [recibo](../evidencia/RF-022-publicacion.json) y [HTTP remoto](../evidencia/RF-022-http-publicacion.json). Las pruebas autenticadas y capturas se realizaron con datos sintéticos en el entorno local; no se leyó la contraseña administrativa remota.
