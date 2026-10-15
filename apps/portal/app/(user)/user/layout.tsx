import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TopNav } from '@/components/user/top-nav';

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="relative flex min-h-screen flex-col bg-amber-50/40 dark:bg-stone-950">
      {/* Warm ambient glow behind navbar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-56 bg-gradient-to-b from-amber-100/50 via-orange-100/20 to-transparent dark:from-amber-900/15 dark:via-transparent" />
      {/* Side warmth accents */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-orange-100/25 via-transparent to-amber-100/20 dark:from-orange-950/10 dark:to-amber-950/10" />
      <TopNav />
      <main className="relative flex flex-1 flex-col">{children}</main>
    </div>
  );
}
