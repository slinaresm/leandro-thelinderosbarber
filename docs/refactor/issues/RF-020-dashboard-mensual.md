# RF-020 · Dashboard mensual del negocio

Resumen se convierte en dashboard con mes seleccionado, total mensual de servicios y tienda, comparación con mes anterior, doce meses de evolución, ingresos mensuales de cada barbero, detalle del equipo y estado de reservas/pedidos. Cambio OpenSpec: dashboard-gestion-mensual.

Criterios monetarios: servicios completados por fecha local de atención y precio snapshot de la API; tienda solo pedidos pagados, por mes local de creación coherente con analítica existente. No representa fecha efectiva de cobro. Ticket medio de servicios = ingreso por servicios / atenciones completadas. Ventas de tienda sin asignación inventada a barberos. Costos y margen comercial desconocidos permanecen desconocidos; no son utilidad neta del negocio. Mes actual parcial frente al mes anterior completo.

El modelo se deriva de lecturas administrativas existentes y no crea mutaciones. La API aplica roles. Los GET independientes no son un snapshot atómico conjunto. Sin dependencias nuevas. Validación local aprobada: cinco pruebas de modelo, seis escenarios de integración con PHP/MariaDB y navegador real, typecheck/build y capturas a 1440/390 px. Ver [evidencia](../evidencia/RF-020-pruebas.json). Publicado el 2026-10-30.


## Entrega

[Publicación 41118207607](https://github.com/slinaresm/leandro-thelinderosbarber/actions/runs/41118207607) aprobada: 91 archivos publicados y 96 anteriores respaldados/verificados, recursos anteriores conservados y cero escrituras a la base de datos. Portada, ingreso, Resumen, health y CSRF respondieron 200; código y estilos nuevos descargados y comprobados. Ver [recibo](../evidencia/RF-020-publicacion.json) y [HTTP remoto](../evidencia/RF-020-http-publicacion.json). Las pruebas autenticadas y capturas corresponden al entorno local con datos sintéticos; no se leyó ni reutilizó la contraseña administrativa remota.
