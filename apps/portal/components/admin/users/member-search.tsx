'use client';

import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Users, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  major: string | null;
  classYear: string | null;
}

export function MemberSearch({ members }: { members: Member[] }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchQuery) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.classYear?.toLowerCase().includes(q) ||
      m.major?.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b bg-background/95 backdrop-blur px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {members.length} members
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, major, or class year..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.map((member) => (
          <div
            key={member.id}
            onClick={() => router.push(`/admin/users/${member.id}`)}
            className="flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors border-b hover:bg-muted/50"
          >
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={member.image || undefined} />
              <AvatarFallback className="text-sm">
                {member.name?.split(' ').map(n => n[0]).join('') || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{member.name || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground truncate">{member.email}</p>
            </div>
            <div className="hidden sm:block text-sm text-muted-foreground">
              {[member.classYear, member.major].filter(Boolean).join(' · ')}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            No members found.
          </div>
        )}
      </div>
    </div>
  );
}
