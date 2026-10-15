import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();

  // If user is authenticated, redirect to /user
  if (session?.user) {
    redirect('/user');
  }

  // If not authenticated, redirect to login
  redirect('/login');
}
