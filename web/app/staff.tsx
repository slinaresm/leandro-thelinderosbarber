import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { get, mutate, ApiError } from './http';
import { errorText } from './client';
import { useSession, type User } from './session';
import { roleHome } from './paths.mjs';

export function StaffGuard({ role, children }: { role: 'admin' | 'barbero'; children: (user: User) => ReactNode }) {
  const session = useSession(), location = useLocation();
  if (session.status === 'checking') return <main id="contenido" className="status-page"><p role="status">Comprobando tu sesión…</p></main>;
  if (session.status === 'error') return <main id="contenido" className="status-page"><h1>No pudimos comprobar tu sesión</h1><p role="alert">{session.error}</p><button onClick={() => void session.refresh()}>Reintentar</button></main>;
  if (!session.user) return <Navigate replace to={'/ingresar?returnTo=' + encodeURIComponent(location.pathname + location.search + location.hash)} />;
  if (session.user.role !== role) return <main id="contenido" className="status-page"><h1>Acceso no permitido</h1><Link to={roleHome(session.user.role)}>Ir a mi cuenta</Link></main>;
  return <section key={session.user.id}>{children(session.user)}</section>;
}
export function useResource<T>(path: string, revision = 0) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const epoch = useRef(0);
  const reload = useCallback(async () => {
    const current = ++epoch.current; setLoading(true);
    try { const value = await get<T>(path); if (current === epoch.current) { setData(value); setError(''); } }
    catch (error) { if (current === epoch.current) setError(errorText(error)); }
    finally { if (current === epoch.current) setLoading(false); }
  }, [path]);
  useEffect(() => { setData(null); void reload(); return () => { epoch.current++; }; }, [reload]);
  useEffect(() => { if (revision) void reload(); }, [revision, reload]);
  return { data, error, loading, reload };
}
export function ResourceState({ resource }: { resource: { error: string; loading: boolean; reload: () => Promise<void> } }) {
  return <>{resource.loading && <p role="status">Actualizando datos…</p>}{resource.error && <p className="form-error" role="alert">{resource.error} Los datos anteriores pueden estar desactualizados. <button onClick={resource.reload}>Reintentar consulta</button></p>}</>;
}
export type Field = { name: string; label: string; type?: 'text' | 'email' | 'password' | 'number' | 'time' | 'date' | 'textarea' | 'checkbox' | 'file' | 'select'; value?: string | number | boolean | null; required?: boolean; min?: number; max?: number; maxLength?: number; nullable?: boolean; options?: [string, string][]; accept?: string; step?: number };
export function RecordForm({ title, fields, endpoint, method = 'POST', onSaved, submit = 'Guardar', headers = {}, extra = {}, confirmation, confirmationTitle = 'Confirmar cambios' }: { title: string; fields: Field[]; endpoint: string; method?: 'POST' | 'PATCH'; onSaved: () => Promise<void> | void; submit?: string; headers?: Record<string, string>; extra?: Record<string, unknown>; confirmation?: string; confirmationTitle?: string }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');
  const lock = useRef(false), alert = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null), reviewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  async function send(form: HTMLFormElement) {
    if (lock.current) return;
    const input = new FormData(form), values: Record<string, unknown> = { ...extra };
    let multipart = false;
    try {
      for (const field of fields) {
        if (field.type === 'file') {
          const file = input.get(field.name);
          if (file instanceof File && file.size) { if (file.size > 8388608) throw new Error('Cada archivo admite como máximo 8 MiB.'); multipart = true; values[field.name] = file; }
          else if (field.required) throw new Error('Selecciona el archivo requerido.');
          continue;
        }
        const value = String(input.get(field.name) ?? '');
        if (field.type === 'checkbox') values[field.name] = input.has(field.name);
        else if (value === '' && field.nullable) values[field.name] = null;
        else if (value === '' && !field.required) continue;
        else if (field.type === 'number') { const number = Number(value); if (!Number.isSafeInteger(number) || number < (field.min ?? 0) || number > (field.max ?? Number.MAX_SAFE_INTEGER)) throw new Error('Revisa los números: deben ser enteros dentro del rango permitido.'); values[field.name] = number; }
        else { if (field.type === 'password' && new TextEncoder().encode(value).length > 72) throw new Error('La contraseña admite como máximo 72 bytes.'); values[field.name] = value; }
      }
      const body = multipart ? new FormData() : values;
      if (body instanceof FormData) for (const [key, value] of Object.entries(values)) { if (value instanceof File) body.append(key, value); else body.append(key, value === null ? '' : typeof value === 'boolean' ? value ? '1' : '0' : String(value)); }
      lock.current = true; setPending(true); setError(''); setSaved('');
      await mutate(endpoint, body, method, headers); setSaved('Cambios confirmados.'); if (method === 'POST') form.reset(); await onSaved();
    } catch (error) { setError(error instanceof ApiError && error.status === 0 ? 'No conocemos el resultado. Actualiza los datos antes de volver a enviar.' : errorText(error)); }
    finally { lock.current = false; setPending(false); }
  }
  return <form ref={formRef} className="staff-form" onSubmit={event => { event.preventDefault(); if (confirmation) reviewDialog.current?.showModal(); else void send(event.currentTarget); }} aria-label={title} aria-busy={pending}><fieldset disabled={pending}><legend>{title}</legend><p className="staff-form-help">Los campos marcados con * son obligatorios.</p><div className="staff-fields">{fields.map(field => <label key={field.name} className={field.type === 'checkbox' ? 'check-label' : field.type === 'textarea' || field.type === 'file' ? 'staff-field-wide' : ''}>{field.label}{field.required && <span className="staff-required" aria-hidden="true"> *</span>}
    {field.type === 'select' ? <select aria-label={field.label} name={field.name} defaultValue={String(field.value ?? '')} required={field.required}>{field.options?.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select> : field.type === 'textarea' ? <textarea aria-label={field.label} name={field.name} defaultValue={String(field.value ?? '')} required={field.required} maxLength={field.maxLength ?? 10000} /> : <input aria-label={field.label} type={field.type || 'text'} name={field.name} defaultValue={field.type === 'file' || field.type === 'checkbox' ? undefined : String(field.value ?? '')} defaultChecked={field.type === 'checkbox' ? Boolean(Number(field.value)) : undefined} required={field.required} min={field.min} max={field.type === 'number' ? field.max ?? Number.MAX_SAFE_INTEGER : field.max} step={field.type === 'number' ? 1 : field.type === 'time' ? field.step ?? 60 : undefined} minLength={field.type === 'password' ? 12 : undefined} maxLength={field.maxLength ?? (field.type === 'password' ? 72 : 200)} accept={field.accept} autoComplete={field.type === 'password' ? 'new-password' : undefined} />}
  </label>)}</div><div className="staff-form-actions"><button type="submit">{pending ? 'Guardando…' : submit}</button><span>Revisa los datos antes de guardar.</span></div></fieldset>{confirmation && <dialog ref={reviewDialog} aria-label={confirmationTitle}><h2>{confirmationTitle}</h2><p>{confirmation}</p><button type="button" onClick={() => { reviewDialog.current?.close(); if (formRef.current) void send(formRef.current); }}>{confirmationTitle + ' definitivamente'}</button><button className="staff-secondary" type="button" onClick={() => reviewDialog.current?.close()}>Volver sin cambios</button></dialog>}{error && <p ref={alert} tabIndex={-1} className="form-error" role="alert">{error}</p>}{saved && <p className="staff-success" role="status">✓ {saved}</p>}</form>;
}
export function ConfirmAction({ label, description, action, disabled = false }: { label: string; description: string; action: () => Promise<string | void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), lock = useRef(false);
  useEffect(() => { if (open) dialog.current?.showModal(); else { dialog.current?.close(); } }, [open]);
  function close() { if (!lock.current) { setOpen(false); trigger.current?.focus(); } }
  async function confirm() {
    if (lock.current) return; lock.current = true; setPending(true); setError('');
    try { const result = await action(); setMessage(result || 'Operación confirmada.'); setOpen(false); trigger.current?.focus(); }
    catch (error) { setError(error instanceof ApiError && error.status === 409 ? 'El estado cambió o hay un conflicto. Actualiza y revisa antes de reintentar.' : error instanceof ApiError && error.status === 0 ? 'Resultado no confirmado. Actualiza antes de reintentar; no repetimos la acción automáticamente.' : errorText(error)); }
    finally { lock.current = false; setPending(false); }
  }
  return <span className="staff-action"><button ref={trigger} type="button" disabled={disabled} onClick={() => { setOpen(true); setError(''); setMessage(''); }}>{label}</button><dialog ref={dialog} onCancel={event => { event.preventDefault(); close(); }} aria-label={label}><h2>{label}</h2><p>{description}</p>{error && <p role="alert">{error}</p>}<button disabled={pending} onClick={confirm}>{pending ? 'Confirmando…' : label + ' definitivamente'}</button><button className="staff-secondary" disabled={pending} onClick={close}>Volver sin cambios</button></dialog>{message && <span role="status">{message}</span>}</span>;
}
export const numberField = (name: string, label: string, value = 0, min = 0): Field => ({ name, label, type: 'number', required: true, value, min });
export const fileField = (name: string, label: string): Field => ({ name, label, type: 'file', accept: 'image/jpeg,image/png,image/webp' });
