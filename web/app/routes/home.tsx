import { HomeEditorial } from '../components/home-editorial';
import { Footer } from '../components/footer';
import { WhatsAppContact } from '../components/catalog';
import { publicMeta } from '../seo';
export const meta = () => publicMeta('Barber Linderos — El buen estilo no pasa de moda', 'Barbería de caballeros en Linderos: cortes de cabello, arreglo de barba y cuidado masculino. Conoce nuestros servicios y prepara tu visita.', '/');
export default function Home() { return <><HomeEditorial /><Footer /><WhatsAppContact /></>; }
