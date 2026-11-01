# RF-024 · Edición modal sin recargas automáticas

Ediciones de cuentas, contraseñas, barberos/horarios, servicios, productos, materiales, promociones y reprogramación mediante modal compartido con Guardar/Cancelar y Escape. Confirmaciones sensibles conservadas. Cancelar descarta el borrador sin enviar; error conserva valores; bloqueo durante el envío y retorno del foco.

Se retiran el temporizador de 30 segundos, la suscripción en vivo del panel y la revalidación de sesión por foco/visibilidad. Se mantienen carga inicial, consultas por navegación, actualización manual y consultas posteriores a guardar. La API conserva sus permisos y validaciones. Sin cambios de tablas o datos remotos.

Cambio OpenSpec: mejorar-administracion-ux. Verificado y publicado el 2026-10-31. Ocho pruebas de regresión aprobadas; dos escenarios RF-024 repetidos con la compilación final, incluidas cancelación/Escape en seis módulos, envío bloqueado, error recuperable, móvil y 35 segundos sin consultas automáticas. Tipos/build/OpenSpec aprobados. Publicación 41259138771 con respaldo verificado; comprobación HTTP y archivos de modal sin temporizador aprobada. Pruebas autenticadas locales con MariaDB real; no se usaron cuentas reales para una prueba autenticada remota. Evidencia en RF-024-pruebas.json, RF-024-http-publicacion.json y RF-024-publicacion.json.

Ampliación: Crear también abre modal en servicios, productos, materiales, barberos, promociones y cuentas. Guardar cierra y actualiza el listado; Cancelar/Escape descartan el alta, error conserva los valores y el envío bloquea cierre/doble envío. Cinco escenarios de navegador aprobados con MariaDB real, sin cuentas de prueba remotas. Tipos/build/OpenSpec aprobados. Pendiente de publicación de la creación modal.
