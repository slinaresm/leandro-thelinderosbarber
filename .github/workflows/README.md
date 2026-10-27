# Flujos manuales de producción

Los flujos solo se ejecutan desde la pestaña **Actions** de GitHub y requieren
una palabra de confirmación. Configura un environment llamado `production` y
activa revisión manual allí si quieres una segunda aprobación.

## Secrets requeridos

### Deploy FTPS

- `FTPS_LB_SERVER`: host FTP/FTPS entregado por cPanel.
- `FTPS_LB_USERNAME`: usuario FTP.
- `FTPS_LB_PASSWORD`: contraseña FTP.
- `FTPS_LB_PORT`: normalmente `21` para FTPS explícito.
- `FTPS_LB_FRONTEND_PATH`: directorio remoto del sitio público, por ejemplo `public_html`.
- `FTPS_LB_BACKEND_PATH`: directorio remoto de la aplicación Node.js, fuera de `public_html` cuando cPanel lo permita.

### Migraciones PostgreSQL

- `PG_LB_DATABASE_URL`: cadena PostgreSQL accesible desde GitHub Actions.
- `PG_LB_SSL`: `true` o `false` según indique el hosting.
- `APP_LB_SITE_ORIGIN`: URL pública HTTPS, por ejemplo `https://tudominio.cl`.
- `APP_LB_JWT_SECRET`: secreto de producción de al menos 32 caracteres.

`PG_LB_DATABASE_URL` debe aceptar conexión externa desde GitHub Actions. Si el hosting
solo permite conexiones PostgreSQL desde `localhost`, este flujo no podrá llegar
a la BBDD; en ese caso la migración debe ejecutarse desde una Terminal/SSH del
hosting o mediante un runner alojado en el mismo servidor.

El archivo `.env` no se sube en ningún flujo. Debe crearse y mantenerse
manualmente en el directorio del backend dentro de cPanel.
