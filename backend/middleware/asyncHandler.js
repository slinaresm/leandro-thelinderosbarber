// Envuelve handlers async de Express para que cualquier rechazo de promesa
// (por ejemplo, un error de conexion a Postgres) llegue al errorHandler global
// en vez de colgar la request o tirar un unhandledRejection.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
