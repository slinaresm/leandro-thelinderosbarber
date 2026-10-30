import { StaffPanel } from '../staff-panel';
export const meta = () => [{ title: 'Administración — Barber Linderos' }, { name: 'robots', content: 'noindex, nofollow' }];
export default function Admin() { return <StaffPanel role="admin" />; }
