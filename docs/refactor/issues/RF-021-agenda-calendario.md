# RF-021 · Agenda administrativa mensual

Calendario de lunes a domingo con navegación anterior/siguiente, selector de mes, Hoy y selección diaria. Cantidades y primeras citas por día, filtros por estado/barbero/búsqueda y detalle cronológico de las reservas del día o mes. Conserva mes/día en URL y las acciones confirmadas de completar, cancelar y reprogramar. El panel del barbero conserva su listado.

Cambio OpenSpec: agenda-calendario-mensual. Fechas civiles locales, cálculo de cuadrícula en UTC para evitar desfases. Usa las lecturas existentes y no cambia API, permisos o base de datos. Validación local aprobada: cuatro pruebas de calendario y cinco regresiones del modelo del dashboard, siete escenarios de integración con MariaDB/PHP/navegador real, tipos y compilación. Capturas a 1440 y 390 px. Ver [evidencia](../evidencia/RF-021-pruebas.json). Publicación en curso.
