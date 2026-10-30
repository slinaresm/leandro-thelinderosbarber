import { CreateRecord, StaffCollection, StateBadge } from './staff-collection';
import { useRef, useState } from 'react';
import { localDate } from './client';
import { mutate } from './http';
import { ConfirmAction, RecordForm, ResourceState, useResource, type Field } from './staff';
export { StaffDashboard as StaffOverview } from './staff-dashboard';

type Promotion = { id: string; title: string; description: string | null; segment: string; active: number; created_at: string };
const segments: [string, string][] = [['todos', 'Todos'], ['nuevos', 'Nuevos'], ['recurrentes', 'Recurrentes'], ['inactivos', 'Inactivos'], ['vip', 'VIP'], ['cumpleanos', 'Cumpleaños']];
function promotionFields(row?: Promotion): Field[] { return [{ name: 'title', label: 'Título', required: true, value: row?.title }, { name: 'description', label: 'Descripción', type: 'textarea', nullable: true, value: row?.description }, { name: 'segment', label: 'Segmento', type: 'select', required: true, value: row?.segment || 'todos', options: segments }, { name: 'active', label: 'Promoción activa', type: 'checkbox', value: row ? row.active : true }]; }
function PromotionEdit({ row, reload }: { row: Promotion; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState(false), [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <><button ref={trigger} className="staff-edit-toggle" aria-expanded={edit} onClick={() => { setEdit(!edit); setSaved(false); }}>{edit ? 'Cerrar edición' : 'Editar promoción'}</button>{edit && <RecordForm title={'Editar ' + row.title} fields={promotionFields(row)} endpoint={'/promotions/' + row.id} method="PATCH" onSaved={async () => { await reload(); setEdit(false); setSaved(true); trigger.current?.focus(); }} />}{saved && <p className="staff-success" role="status">Cambios guardados en {row.title}.</p>}</>;
}
export function StaffPromotions({ revision }: { revision: number }) {
  const resource = useResource<{ promotions: Promotion[] }>('/promotions', revision), counts = useResource<{ segments: Record<string, number> }>('/promotions/segments/counts', revision);
  return <><p>Las promociones se registran para revisión. Guardarlas no envía campañas ni aplica descuentos automáticamente.</p><ResourceState resource={counts} />{counts.data && <ul>{Object.entries(counts.data.segments).map(([segment, count]) => <li key={segment}>{segments.find(([key]) => key === segment)?.[1] || segment}: {count}</li>)}</ul>}<CreateRecord title="Crear promoción"><RecordForm title="Crear promoción" endpoint="/promotions" fields={promotionFields()} onSaved={resource.reload} /></CreateRecord><ResourceState resource={resource} />{resource.data && <StaffCollection rows={resource.data.promotions} label="promociones" name={row => row.title} search={row => row.title + " " + (row.description || "")} state={row => Number(row.active) ? "Activo" : "Inactivo"}>{row => <article className="client-card" key={row.id}><h3>{row.title}</h3><p className="preserve-lines">{row.description}</p><p>{segments.find(([key]) => key === row.segment)?.[1]} · <StateBadge active={row.active} /> · {localDate(row.created_at)}</p><PromotionEdit row={row} reload={resource.reload} /><ConfirmAction label={Number(row.active) ? 'Desactivar promoción' : 'Reactivar promoción'} description="Cambiará el estado de esta promoción guardada." action={async () => { await mutate('/promotions/' + row.id, { active: !Number(row.active) }, 'PATCH'); await resource.reload(); }} /></article>}</StaffCollection>}</>;
}
