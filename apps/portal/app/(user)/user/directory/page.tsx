import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getDirectoryList } from '@/lib/db/event-queries';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { formatYearLabel } from '@/lib/utils';

export default async function DirectoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const members = await getDirectoryList();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">Member Directory</h1>
        <div className="grid gap-3 sm:grid-cols-2">
            {members.map((member) => (
              <Link key={member.id} href={`/user/directory/${member.id}`}>
                <div className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.image || undefined} />
                    <AvatarFallback>
                      {member.name?.split(' ').map(n => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{member.name || 'Unknown'}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {[member.classYear && formatYearLabel(member.classYear), member.major]
                        .filter(Boolean).join(' · ') || 'Latte Lab Member'}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {members.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              No members yet.
            </div>
          )}
      </div>
    </div>
  );
}
