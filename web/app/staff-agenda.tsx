import { useState } from 'react';
import { StaffCalendar } from './staff-calendar';
import { money, statusText, today } from './client';
import { mutate } from './http';
import { ConfirmAction, RecordForm, ResourceState, useResource } from './staff';
type Visit = { id: string; client_id: string; date: string; start_time: string; status: string; service_name: string; client_name?: string; client_phone?: string; barber_name?: string; price: number; duration_minutes: number };
function Reschedule({ visit, reload }: { visit: Visit; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  return <><button disabled={visit.status !== 'confirmed'} onClick={() => setEdit(!edit)}>Proponer otro horario</button>{edit && <div><p>Se conservan precio y duración originales; el servidor valida la disponibilidad al guardar.</p><RecordForm title="Reprogramar visita" confirmationTitle="Confirmar nuevo horario" confirmation="Se cambiará esta visita al día y hora propuestos; se conservarán el precio y la duración originales." method="PATCH" endpoint={'/reservations/' + encodeURIComponent(visit.id) + '/reschedule'} fields={[{ name: 'date', label: 'Nueva fecha', type: 'date', required: true, value: visit.date }, { name: 'startTime', label: 'Nueva hora', type: 'time', required: true, value: visit.start_time.slice(0, 5) }]} onSaved={async () => { await reload(); setEdit(false); }} submit="Guardar nuevo horario" /></div>}</>;
}
function VisitCard({ visit, reload }: { visit: Visit; reload: () => Promise<void> }) {
  return <article className="client-card" key={visit.id} data-testid="staff-visit"><h3>{visit.service_name}</h3><p>{visit.client_name || 'Cliente'}{visit.client_phone ? ' · ' + visit.client_phone : ''}{visit.barber_name ? ' · ' + visit.barber_name : ''}</p><p>{visit.date} · {visit.start_time.slice(0, 5)} · {money(Number(visit.price))} · {visit.duration_minutes} minutos · <strong>{statusText[visit.status] || visit.status}</strong></p>
      <ConfirmAction disabled={visit.status !== 'confirmed'} label="Completar visita" description="Confirma que realizaste esta atención. La finalización acreditará diez puntos una sola vez." action={async () => { const result = await mutate<{ loyalty: { points: number; level: string } }>('/reservations/' + encodeURIComponent(visit.id) + '/complete', {}, 'PATCH'); await reload(); return 'Visita completada. Fidelización: ' + result.loyalty.points + ' puntos · ' + result.loyalty.level; }} />
      <ConfirmAction disabled={visit.status !== 'confirmed'} label="Cancelar visita" description="La cancelación libera el horario y no se puede deshacer desde esta acción." action={async () => { await mutate('/reservations/' + encodeURIComponent(visit.id) + '/cancel', {}, 'PATCH'); await reload(); }} /><Reschedule visit={visit} reload={reload} />
    </article>;
}
export function StaffAgenda({ revision, calendar = false }: { revision: number; calendar?: boolean }) {
  const resource = useResource<{ reservations: Visit[] }>('/reservations', revision);
  const [date, setDate] = useState(''), [status, setStatus] = useState(''), [name, setName] = useState('');
  const visits = resource.data?.reservations.filter(row => (!date || row.date === date) && (!status || row.status === status) && (!name || (row.client_name + ' ' + row.barber_name + ' ' + row.service_name).toLowerCase().includes(name.toLowerCase())));
  if (calendar) return <><ResourceState resource={resource} />{resource.data && !resource.error && <StaffCalendar visits={resource.data.reservations} updating={resource.loading}>{visit => <VisitCard visit={visit} reload={resource.reload} />}</StaffCalendar>}</>;
  return <><div className="staff-filters"><label>Fecha de agenda<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label><button onClick={() => setDate(today())}>Ver hoy</button><button onClick={() => setDate('')}>Todas las fechas</button><label>Estado<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos</option>{['confirmed', 'completed', 'cancelled', 'no_show'].map(value => <option key={value} value={value}>{statusText[value]}</option>)}</select></label><label>Filtrar cliente, barbero o servicio<input value={name} onChange={event => setName(event.target.value)} /></label></div>
    <ResourceState resource={resource} />{visits?.length === 0 && <p>No hay visitas para estos filtros.</p>}
    {visits?.map(visit => <VisitCard key={visit.id} visit={visit} reload={resource.reload} />)}
  </>;
}
