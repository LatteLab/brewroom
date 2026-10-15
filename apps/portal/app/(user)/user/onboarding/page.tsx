import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/user/onboarding-form';

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) redirect('/login');
  if (session.user.profileComplete) redirect('/user/events');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            Welcome to Latte Lab ☕
          </h1>
          <p className="text-muted-foreground text-sm">
            Tell us a bit about yourself to get started.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
