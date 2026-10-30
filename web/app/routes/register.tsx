import { AuthForm } from '../components/auth';
export const meta = () => [{ title: 'Crear cuenta — Barber Linderos' }, { name: 'robots', content: 'noindex, nofollow' }];
export default function Register() { return <AuthForm register />; }
