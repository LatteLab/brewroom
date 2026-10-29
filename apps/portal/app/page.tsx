import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect(session.user.isAdmin ? '/admin' : '/user');
  }

  redirect('/login');
}
