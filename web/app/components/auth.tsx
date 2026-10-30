import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useSession } from '../session';
import { roleHome, safeReturnTo } from '../paths.mjs';

export function AuthForm({ register = false }: { register?: boolean }) {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const alert = useRef<HTMLParagraphElement>(null);
  const lock = useRef(false);
  const returnTo = new URLSearchParams(location.search).get('returnTo');
  if (session.status === 'checking') return <main id="contenido" className="status-page"><p role="status">Comprobando tu sesión…</p></main>;
  if (session.user) return <Navigate replace to={safeReturnTo(returnTo, session.user.role)} />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (new TextEncoder().encode(String(data.password)).length > 72) {
      setError('La contraseña debe tener como máximo 72 bytes. Usa una más corta.');
      requestAnimationFrame(() => alert.current?.focus()); return;
    }
    lock.current = true; setPending(true); setError('');
    try {
      const user = await session.authenticate(register ? 'register' : 'login', data);
      form.reset();
      navigate(safeReturnTo(returnTo, user.role) || roleHome(user.role), { replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No pudimos completar la solicitud.');
      requestAnimationFrame(() => alert.current?.focus());
    } finally { lock.current = false; setPending(false); }
  }
  const alternate = (register ? '/ingresar' : '/registro') + (returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : '');
  return <main id="contenido" className="login-stage">
    <section className="login-intro" aria-labelledby="login-title"><p className="login-kicker">Barber Linderos <span aria-hidden="true">✦</span> Tu próxima visita</p>
      <h1 id="login-title">Tu estilo<br /><em>continúa aquí.</em></h1><p>Ingresa para revisar tus reservas, preparar tu próxima visita y mantener el ritual siempre a tu medida.</p>
      <div className="login-intro__details" aria-label="Beneficios de tu cuenta"><span>Gestiona tus horas</span><span>Reserva con tu barbero</span></div>
    </section>
    <section className="auth-wrap" aria-label={register ? 'Crear una cuenta' : 'Acceso a tu cuenta'}><div className="auth-card"><p className="auth-eyebrow">Tu cuenta Linderos</p>
      <h2>{register ? 'Crea tu cuenta' : 'Bienvenido de vuelta'}</h2><p className="sub">{register ? 'Prepara tu próxima visita.' : 'Ingresa tus datos para continuar.'}</p>
      {session.status === 'error' && <p className="form-error" role="alert">{session.error} <button type="button" onClick={() => void session.refresh()}>Comprobar sesión</button></p>}
      <div className="card auth-card__panel"><form onSubmit={submit} aria-busy={pending}>
        {register && <div className="field"><label htmlFor="auth-name">Nombre completo</label><input id="auth-name" name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Tu nombre" disabled={pending} /></div>}
        <div className="field"><label htmlFor="auth-email">Email</label><input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="tu@email.com" disabled={pending} /></div>
        {register && <div className="field"><label htmlFor="auth-phone">Teléfono (opcional)</label><input id="auth-phone" name="phone" type="tel" autoComplete="tel" maxLength={32} placeholder="+56 9 1234 5678" disabled={pending} /></div>}
        <div className="field"><label htmlFor="auth-password">Contraseña</label><input id="auth-password" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} maxLength={72} aria-describedby={register ? 'password-help' : undefined} disabled={pending} />
          {register && <p id="password-help" className="field-help">Al menos 12 caracteres; máximo 72 bytes.</p>}
        </div>
        {error && <p ref={alert} tabIndex={-1} className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Procesando…' : register ? 'Crear cuenta' : 'Entrar a mi cuenta'} <span aria-hidden="true">↗</span></button>
      </form></div>
      <p className="auth-foot">{register ? '¿Ya tienes cuenta? ' : '¿Primera vez en Linderos? '}<Link to={alternate}>{register ? 'Inicia sesión' : 'Crea tu cuenta'}</Link></p><Link className="login-back" to="/">← Volver al inicio</Link>
    </div></section>
  </main>;
}
