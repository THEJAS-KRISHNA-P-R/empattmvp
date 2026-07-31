import AdminDashboard from '@/components/admin/AdminDashboard';

export const metadata = {
  title: 'EmpAtt Admin | Field Worker Tracking',
  description: 'Admin dashboard for monitoring field workers, GPS attendance, and journey maps.',
};

export default function AdminPage() {
  return <AdminDashboard />;
}
