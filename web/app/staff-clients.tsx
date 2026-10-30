import { useState } from 'react';
import { imagePath, localDate, money, statusText } from './client';
import { mutate } from './http';
import { ConfirmAction, RecordForm, ResourceState, fileField, useResource, type Field } from './staff';
type Client = { id: string; name: string; email: string; phone: string | null; loyalty_level?: string; loyalty_points?: number };
type Photo = { id: string; type: string; photo_url: string; created_at: string; barber_name: string };
function StaffPhoto({ photo, reload }: { photo: Photo; reload: () => Promise<void> }) {
  const [failed, setFailed] = useState(false), src = imagePath(photo.photo_url, true);
  return <figure className="client-card client-photo">{src && !failed ? <img src={src} alt={'Foto ' + photo.type + ' de la atención'} onError={() => setFailed(true)} /> : <p>Foto no disponible.</p>}<figcaption>{photo.type === 'antes' ? 'Antes' : 'Después'} · {photo.barber_name} · {localDate(photo.created_at)}</figcaption><ConfirmAction label="Eliminar foto" description="Se retirará el acceso a esta foto y se programará la limpieza del archivo." action={async () => { await mutate('/photos/' + encodeURIComponent(photo.id), {}, 'DELETE'); await reload(); }} /></figure>;
}
function ClientDetails({ client, admin, revision, photosOnly }: { client: Client; admin: boolean; revision: number; photosOnly: boolean }) {
  const history = useResource<{ history: { id: string; date: string; start_time: string; service_name: string; price: number; duration_minutes: number; status: string; barber_name: string }[] }>('/clients/' + encodeURIComponent(client.id) + '/history', revision);
  const photos = useResource<{ photos: Photo[] }>('/photos?clientId=' + encodeURIComponent(client.id), revision);
  const reservations = useResource<{ reservations: { id: string; client_id: string; status: string; date: string; start_time: string }[] }>('/reservations', revision);
  return <section className="staff-detail"><h3>{client.name}</h3><p>{client.email} · {client.phone || 'Sin teléfono'} · {client.loyalty_level || 'Sin nivel'}{client.loyalty_points !== undefined ? ' · ' + client.loyalty_points + ' puntos' : ''}</p>
    {!photosOnly && <><h3>Historial autorizado</h3><ResourceState resource={history} />{history.data?.history.length === 0 && <p>Sin visitas registradas.</p>}{history.data?.history.map(visit => <article className="client-card" key={visit.id}><h4>{visit.service_name}</h4><p>{visit.date} · {visit.start_time} · {visit.barber_name} · {statusText[visit.status]} · {money(Number(visit.price))} · {visit.duration_minutes} minutos</p></article>)}</>}
    <h3>Fotos de atención</h3><ResourceState resource={photos} />{!admin && <RecordForm title="Subir foto de atención" endpoint="/photos" extra={{ client_id: client.id }} fields={[{ name: 'type', label: 'Momento de la foto', type: 'select', required: true, value: 'antes', options: [['antes', 'Antes'], ['despues', 'Después']] }, { name: 'reservation_id', label: 'Reserva vinculada (opcional)', type: 'select', options: [['', 'Sin vincular a una reserva'], ...(reservations.data?.reservations.filter(row => row.client_id === client.id && row.status !== 'cancelled').map(row => [row.id, row.date + ' ' + row.start_time.slice(0, 5)] as [string, string]) || [])] }, { ...fileField('photo', 'Imagen de atención'), required: true }]} onSaved={photos.reload} />}
    {photos.data?.photos.length === 0 && <p>Sin fotos disponibles.</p>}<div className="photo-grid">{photos.data?.photos.map(photo => <StaffPhoto key={photo.id} photo={photo} reload={photos.reload} />)}</div>
  </section>;
}
export function StaffClients({ barberId, revision, photosOnly = false }: { barberId?: string; revision: number; photosOnly?: boolean }) {
  const resource = useResource<{ clients: Client[] }>(barberId ? '/barbers/' + encodeURIComponent(barberId) + '/clients' : '/clients', revision);
  const [selected, setSelected] = useState(''), [filter, setFilter] = useState('');
  const clients = resource.data?.clients || [], client = clients.find(row => row.id === selected);
  return <><ResourceState resource={resource} /><label>Buscar cliente<input value={filter} onChange={event => setFilter(event.target.value)} /></label><label>Cliente<select value={client ? selected : ''} onChange={event => setSelected(event.target.value)}><option value="">Selecciona un cliente</option>{clients.filter(row => (row.name + ' ' + row.email).toLowerCase().includes(filter.toLowerCase())).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{clients.length === 0 && resource.data && <p>No hay clientes disponibles para esta cuenta.</p>}{client && <ClientDetails key={client.id} client={client} admin={!barberId} revision={revision} photosOnly={photosOnly} />}</>;
}
export function StaffNotes({ barberId, revision }: { barberId: string; revision: number }) {
  const resource = useResource<{ notes: { id: string; content: string; created_at: string }[] }>('/notes', revision);
  const clients = useResource<{ clients: Client[] }>('/barbers/' + encodeURIComponent(barberId) + '/clients', revision);
  const fields: Field[] = [{ name: 'client_id', label: 'Cliente vinculado (opcional)', type: 'select', options: [['', 'Nota general privada'], ...(clients.data?.clients.map(client => [client.id, client.name] as [string, string]) || [])] }, { name: 'content', label: 'Contenido de la nota', type: 'textarea', required: true, maxLength: 10000 }];
  return <><p>Solo tú puedes leer o borrar tus notas; no se publican al cliente ni al administrador.</p><RecordForm title="Nueva nota privada" fields={fields} endpoint="/notes" onSaved={resource.reload} /><ResourceState resource={resource} />{resource.data?.notes.length === 0 && <p>No tienes notas guardadas.</p>}{resource.data?.notes.map(note => <article className="client-card" key={note.id}><p className="preserve-lines">{note.content}</p><p>{localDate(note.created_at)}</p><ConfirmAction label="Eliminar nota" description="Esta nota privada se eliminará de forma permanente." action={async () => { await mutate('/notes/' + encodeURIComponent(note.id), {}, 'DELETE'); await resource.reload(); }} /></article>)}</>;
}
