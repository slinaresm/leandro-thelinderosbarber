import { PolicyEditorial } from '../components/policy-editorial';
import { Footer } from '../components/footer';
import { publicMeta } from '../seo';
export const meta = () => publicMeta('Políticas de servicio y reservas — Barber Linderos', 'Conoce las políticas de reservas, cancelaciones, atención y compras de Barber Linderos. Francisco Javier Krugger 3881, Linderos.', '/politicas-de-servicio');
export default function Policies() { return <><PolicyEditorial /><Footer /></>; }
