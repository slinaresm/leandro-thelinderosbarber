import { useEffect, useState } from 'react';
import { get } from '../http';

type Service = { id?: string; name: string; description?: string; price: number; duration_minutes: number };
type Barber = { id: string; name: string; specialty?: string };
const reference: Service[] = [
  { name: 'Corte de cabello', price: 10000, duration_minutes: 45 },
  { name: 'Corte + barba', price: 15000, duration_minutes: 60 },
  { name: 'Servicio premium', price: 18000, duration_minutes: 90 },
];
export function Services() {
  const [services, setServices] = useState(reference);
  const [status, setStatus] = useState('reference');
  useEffect(() => {
    let live = true;
    get<{ services: Service[] }>('/services').then(data => {
      if (!Array.isArray(data.services)) throw new Error('Catálogo inválido');
      if (live) { setServices(data.services); setStatus('ready'); }
    }).catch(() => { if (live) setStatus('failed'); });
    return () => { live = false; };
  }, []);
  return <><div id="services-list" className="v-services">
    {services.map((service, index) => <article key={service.id || service.name} className="v-service"><span className="service-index">{String(index + 1).padStart(2, '0')} / {['EL CLÁSICO', 'EL COMPLETO', 'EL RITUAL'][index] || 'DE LA CASA'}</span>
      <div className="service-info"><h3>{service.name}</h3><p>{service.description || 'Servicio de barbería con asesoría de estilo y atención al detalle.'}</p></div>
      <div className="service-meta"><span className="service-price">{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(service.price)}</span><span className="service-duration">{service.duration_minutes} minutos</span></div>
      <a className="service-book" href={'/reservar' + (service.id ? '?serviceId=' + encodeURIComponent(service.id) : '')} aria-label={'Reservar ' + service.name}>Reservar servicio <span aria-hidden="true">↗</span></a>
    </article>)}
    {services.length === 0 && <p className="loading-copy">Pronto compartiremos nuestra carta. Consulta los servicios al reservar.</p>}
  </div><p className="service-footnote" role="status">{status === 'ready' ? 'Precios en pesos chilenos (CLP). Consulta los horarios disponibles al reservar.' : status === 'failed' ? 'No pudimos actualizar la carta. Precios de referencia; confirma precio y disponibilidad al reservar.' : 'Carta de referencia. Confirma precio y disponibilidad al reservar.'}</p></>;
}

export function Barbers() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    let live = true;
    get<{ barbers: Barber[] }>('/barbers').then(data => {
      if (!Array.isArray(data.barbers)) throw new Error('Equipo inválido');
      if (live) { setBarbers(data.barbers); setStatus('ready'); }
    }).catch(() => { if (live) setStatus('failed'); });
    return () => { live = false; };
  }, []);
  return <div id="barbers-list" className="v-team">
    {barbers.map(barber => <article key={barber.id} className="v-barber"><div className="barber-monogram" aria-hidden="true">{barber.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</div><h3>{barber.name}</h3><p>{barber.specialty || 'Barbero de la casa'}</p><a href={'/reservar?barberId=' + encodeURIComponent(barber.id)}>RESERVAR CON ÉL <span aria-hidden="true">↗</span></a></article>)}
    {barbers.length === 0 && <p className="loading-copy" role="status">{status === 'loading' ? 'Conociendo al equipo…' : status === 'failed' ? 'No pudimos consultar el equipo. Inténtalo de nuevo más tarde.' : 'Consulta el equipo disponible al reservar tu hora.'}</p>}
  </div>;
}

export function WhatsAppContact() {
  const [number, setNumber] = useState('');
  useEffect(() => {
    let live = true;
    get<{ whatsappBusinessNumber: string }>('/config').then(data => {
      if (live && typeof data.whatsappBusinessNumber === 'string' && /^[1-9]\d{7,14}$/.test(data.whatsappBusinessNumber)) setNumber(data.whatsappBusinessNumber);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return number ? <a className="whatsapp-contact" href={'https://wa.me/' + number} target="_blank" rel="noopener noreferrer" aria-label="Consultar por WhatsApp, abre en otra pestaña">Conversemos por WhatsApp ↗</a> : null;
}
