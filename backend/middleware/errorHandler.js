function notFound(req, res, next) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : (err.status || 500);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor.' : (err.message || 'Solicitud inválida.') });
}

module.exports = { notFound, errorHandler };
