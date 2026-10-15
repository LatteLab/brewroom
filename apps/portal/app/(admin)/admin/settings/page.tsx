import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { AdminWhitelistManager } from '@/components/admin/settings/whitelist-manager';
import { SemesterManager } from '@/components/admin/settings/semester-manager';
import { getAdminWhitelist } from '@/lib/db';
import { getSemesterData } from '@/app/actions/admin';
import { PageHeader } from '@/components/ui/page-header';

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  if (!session.user.isAdmin) {
    redirect('/user');
  }

  const [whitelist, semesterData] = await Promise.all([
    getAdminWhitelist(),
    getSemesterData(),
  ]);

  return (
    <>
      <PageHeader title="Admin Settings" showSidebarTrigger />

      <div className="flex flex-1 flex-col gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Semester</CardTitle>
            <CardDescription>
              Controls which semester is used for lottery scoring. Auto-detected from MIT academic calendar
              unless manually overridden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SemesterManager data={semesterData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Whitelist</CardTitle>
            <CardDescription>
              Manage which email addresses have admin access. Users with whitelisted emails
              will automatically receive admin privileges when they log in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminWhitelistManager initialWhitelist={whitelist} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
