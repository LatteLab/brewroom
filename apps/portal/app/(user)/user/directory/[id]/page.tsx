import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getUserById } from '@/lib/db/queries';
import { getUserAttendanceHistory } from '@/lib/db/event-queries';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Phone, MapPin, GraduationCap, BookOpen, CalendarCheck } from 'lucide-react';
import { formatYearLabel } from '@/lib/utils';

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const [user, attended] = await Promise.all([
    getUserById(id),
    getUserAttendanceHistory(id),
  ]);
  if (!user || !user.isVisibleInDirectory) notFound();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <Avatar className="h-24 w-24 mb-4">
              <AvatarImage src={user.image || undefined} />
              <AvatarFallback className="text-2xl">
                {user.name?.split(' ').map(n => n[0]).join('') || '?'}
              </AvatarFallback>
            </Avatar>
            <h1 className="text-2xl font-bold">{user.name || 'Unknown'}</h1>
            {(user.classYear || user.major) && (
              <p className="text-muted-foreground mt-1">
                {[user.classYear && formatYearLabel(user.classYear), user.major]
                  .filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="space-y-6">
            {/* Bio */}
            {user.bio && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">{user.bio}</p>
                </CardContent>
              </Card>
            )}

            {/* Contact & Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{user.email}</span>
                </div>
                {user.phone && !user.hidePhone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.phone}</span>
                  </div>
                )}
                {user.location && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.location}</span>
                  </div>
                )}
                {user.major && (
                  <div className="flex items-center gap-3">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.major}</span>
                  </div>
                )}
                {user.interests && (
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.interests}</span>
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Attendance History */}
            {attended.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4" />
                    Events Attended
                    <span className="text-sm font-normal text-muted-foreground ml-auto">{attended.length}</span>
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
    </div>
  );
}
