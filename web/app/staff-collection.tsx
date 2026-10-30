import { useState, type ReactNode } from 'react';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

/** Collections returned in full by the API; movements retain server pagination. */
export function StaffCollection<T extends { id: string }>({ rows, label, name, search, state, children, empty = 'Crea el primer registro para comenzar.' }: {
  rows: T[]; label: string; name: (row: T) => string; search?: (row: T) => string;
  state?: (row: T) => string; children: (row: T) => ReactNode; empty?: string;
}) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [order, setOrder] = useState('asc'), [page, setPage] = useState(1);
  const filtered = rows.filter(row => (!status || state?.(row) === status) && normalize(search ? search(row) : name(row)).includes(normalize(query)))
    .sort((a, b) => name(a).localeCompare(name(b), 'es', { numeric: true, sensitivity: 'base' }) * (order === 'asc' ? 1 : -1));
  const pages = Math.max(1, Math.ceil(filtered.length / 10)), current = Math.min(page, pages);
  const states = state ? [...new Set(rows.map(state))].sort() : [];
  function clear() { setQuery(''); setStatus(''); setPage(1); }
  return <section className="staff-collection" aria-label={'Listado de ' + label}>
    <div className="staff-toolbar">
      <label className="staff-search">Buscar {label}<input type="search" value={query} placeholder="Escribe un nombre o palabra clave…" onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
      {state && <label>Estado<select aria-label="Estado" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todos los estados</option>{states.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      <label>Ordenar<select aria-label="Ordenar" value={order} onChange={event => { setOrder(event.target.value); setPage(1); }}><option value="asc">Nombre: A a Z</option><option value="desc">Nombre: Z a A</option></select></label>
    </div>
    <div className="staff-results"><p role="status">{filtered.length} de {rows.length} registros{filtered.length > 10 ? ` · Página ${current} de ${pages}` : ''}</p>{(query || status) && <button className="staff-secondary" onClick={clear}>Limpiar filtros</button>}</div>
    {!filtered.length ? <div className="staff-empty"><span aria-hidden="true">⌕</span><h3>{rows.length ? 'No encontramos coincidencias' : 'Todavía no hay registros'}</h3><p>{rows.length ? 'Prueba con otro nombre o elimina los filtros para ver todos los registros.' : empty}</p>{rows.length > 0 && <button onClick={clear}>Ver todos los registros</button>}</div> : <div className="staff-records">{filtered.slice((current - 1) * 10, current * 10).map(row => <div className="staff-record" key={row.id}>{children(row)}</div>)}</div>}
    {pages > 1 && <nav className="staff-pagination" aria-label={'Páginas de ' + label}><button disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</button><span>Página {current} de {pages}</span><button disabled={current >= pages} onClick={() => setPage(current + 1)}>Siguiente</button></nav>}
  </section>;
}

export function CreateRecord({ title, children }: { title: string; children: ReactNode }) {
  return <details className="staff-create"><summary><span aria-hidden="true">＋</span> {title}<span className="staff-create-hint">Abrir / cerrar formulario</span></summary><div className="staff-create-body">{children}</div></details>;
}

export function StateBadge({ active }: { active: number | boolean }) {
  return <span className={'staff-badge ' + (Number(active) ? 'is-active' : 'is-inactive')}>{Number(active) ? 'Activo' : 'Inactivo'}</span>;
}

export function RecordFacts({ items }: { items: [string, ReactNode][] }) {
  return <dl className="staff-record-facts">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
