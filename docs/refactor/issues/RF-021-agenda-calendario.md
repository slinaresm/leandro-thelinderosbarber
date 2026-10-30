# RF-021 · Agenda administrativa mensual

Calendario de lunes a domingo con navegación anterior/siguiente, selector de mes, Hoy y selección diaria. Cantidades y primeras citas por día, filtros por estado/barbero/búsqueda y detalle cronológico de las reservas del día o mes. Conserva mes/día en URL y las acciones confirmadas de completar, cancelar y reprogramar. El panel del barbero conserva su listado.

Cambio OpenSpec: agenda-calendario-mensual. Fechas civiles locales, cálculo de cuadrícula en UTC para evitar desfases. Usa las lecturas existentes y no cambia API, permisos o base de datos. Validación local aprobada: cuatro pruebas de calendario y cinco regresiones del modelo del dashboard, siete escenarios de integración con MariaDB/PHP/navegador real, tipos y compilación. Capturas a 1440 y 390 px. Ver [evidencia](../evidencia/RF-021-pruebas.json). Publicado el 2026-10-30.


## Entrega

[Publicación 41124068929](https://github.com/slinaresm/leandro-thelinderosbarber/actions/runs/41124068929) aprobada: 91 archivos publicados y 101 anteriores respaldados/verificados, recursos anteriores conservados y cero escrituras a la base. Agenda, ingreso, portada, health y CSRF respondieron 200. Se descargaron y comprobaron el código del calendario y sus estilos; el dashboard continúa incluido. Ver [recibo](../evidencia/RF-021-publicacion.json) y [HTTP remoto](../evidencia/RF-021-http-publicacion.json). Pruebas autenticadas y capturas en entorno local con datos sintéticos; no se accedió a la contraseña administrativa remota.
