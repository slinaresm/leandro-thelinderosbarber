export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
let sessionEpoch = 0;
export function renewSessionRequests() { sessionEpoch++; }

const messages: Record<number, string> = {
  400: 'Revisa los datos ingresados e inténtalo de nuevo.',
  401: 'No pudimos validar tu sesión o tus credenciales. Vuelve a ingresar.',
  403: 'No tienes permiso para realizar esta acción.',
  409: 'Los datos ya existen o cambiaron. Revisa e inténtalo de nuevo.',
  429: 'Se alcanzó el límite de intentos. Espera unos minutos antes de reintentar.',
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const epoch = sessionEpoch;
  const target = new URL('/api' + path, 'https://same-origin.invalid');
  if (!path.startsWith('/') || path.startsWith('//') || /[\u0000-\u0020\\]/.test(path) || target.origin !== 'https://same-origin.invalid' || !target.pathname.startsWith('/api/') || target.hash || path.split(/[/?]/).some(part => part === '..' || part === '.')) throw new Error('Ruta API inválida.');
  let response: Response;
  try {
    response = await fetch(target.pathname + target.search, { ...init, credentials: 'same-origin',
      signal: init.signal || AbortSignal.timeout(15000), headers: { Accept: 'application/json', ...init.headers } });
  } catch {
    throw new ApiError(0, 'No pudimos conectar. Comprueba tu conexión e inténtalo de nuevo.');
  }
  if (!response.ok) {
    if (response.status === 401 && epoch === sessionEpoch && !['/auth/login', '/auth/register', '/auth/me'].includes(path)) {
      window.dispatchEvent(new Event('session-invalid'));
    }
    // No presentar HTML de proxies ni texto no contractual del servidor.
    throw new ApiError(response.status, messages[response.status] || 'El servicio no está disponible. Inténtalo más tarde.');
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; }
  catch { throw new ApiError(502, 'Recibimos una respuesta inesperada. Inténtalo de nuevo.'); }
}

export const get = <T,>(path: string) => request<T>(path);
let mutations: Promise<unknown> = Promise.resolve();
async function write<T>(path: string, body: object | undefined, method: string, headers: Record<string, string>): Promise<T> {
  const { csrfToken } = await get<{ csrfToken: string }>('/auth/csrf');
  if (typeof csrfToken !== 'string' || !csrfToken) throw new ApiError(503, 'No pudimos preparar el formulario. Recarga e inténtalo de nuevo.');
  const multipart = body instanceof FormData;
  return request<T>(path, { method, headers: { ...headers, ...(!multipart ? { 'Content-Type': 'application/json' } : {}), 'X-CSRF-Token': csrfToken },
    body: multipart ? body : JSON.stringify(body ?? {}), signal: AbortSignal.timeout(path === '/purchases/extract' ? 30000 : 15000) });
}
export function mutate<T>(path: string, body?: object, method: 'POST' | 'PATCH' | 'DELETE' = 'POST', headers: Record<string, string> = {}): Promise<T> {
  const pending = mutations.then(() => write<T>(path, body, method, headers));
  mutations = pending.catch(() => {});
  return pending;
}
