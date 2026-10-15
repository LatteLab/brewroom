import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getUserById } from '@/lib/db/queries';
import { getUserAttendanceHistory } from '@/lib/db/event-queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ProfileForm } from '@/components/user/profile-form';
import { ProfileCompleteness } from '@/components/user/profile-completeness';
import { CalendarCheck } from 'lucide-react';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const [user, attended] = await Promise.all([
    getUserById(session.user.id),
    getUserAttendanceHistory(session.user.id),
  ]);
  if (!user) redirect('/login');

  const showWelcome = !user.major || !user.classYear || !user.interests;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        {showWelcome && (
          <Alert className="mb-6">
            <AlertTitle>Welcome to Latte Lab! ☕</AlertTitle>
            <AlertDescription>
              Fill in your details below so other members can find you in the directory.
            </AlertDescription>
          </Alert>
        )}
          <ProfileCompleteness user={user} />
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>
                Update your member profile information visible to other members.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm user={user} />
            </CardContent>
          </Card>

          {attended.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4" />
                  My Attendance
                  <span className="text-sm font-normal text-muted-foreground ml-auto">{attended.length} events</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {attended.map((event) => (
                  <div key={event.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{event.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
    </div>
  );
}
