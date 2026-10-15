import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getUserById } from '@/lib/db/queries';
import { getUserEventHistory, getUserLotteryStats, getUserNoShowCount } from '@/lib/db/event-queries';
import { PageHeader } from '@/components/ui/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ArrowLeft, Mail, Phone, MapPin, GraduationCap,
  BarChart3, Users, Trophy, XCircle,
} from 'lucide-react';

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isAdmin) redirect('/user');

  const { id } = await params;
  const user = await getUserById(id);
  if (!user) notFound();

  const [eventHistory, lotteryStats, noShowCount] = await Promise.all([
    getUserEventHistory(id),
    getUserLotteryStats(id),
    getUserNoShowCount(id),
  ]);

  const eventsAttended = eventHistory.filter(h => h.registration.status === 'checked_in').length;

  return (
    <>
      <PageHeader title="User Details" showSidebarTrigger />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link href="/admin/users">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Directory
            </Button>
          </Link>

          {/* Profile header */}
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center mb-8">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.image || undefined} />
              <AvatarFallback className="text-2xl">
                {user.name?.split(' ').map(n => n[0]).join('') || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{user.name || 'Unknown'}</h1>
              <p className="text-muted-foreground">{user.email}</p>
              {(user.classYear || user.major) && (
                <p className="text-sm text-muted-foreground mt-1">
                  {[user.classYear && `Class of ${user.classYear}`, user.major].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Contact info */}
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-lg">Contact</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.email}</span>
                  </div>
                  {user.phone && (
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
                </CardContent>
              </Card>

              {user.bio && (
                <Card>
                  <CardHeader><CardTitle className="text-lg">About</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{user.bio}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Stats & History */}
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-2xl font-bold">{eventsAttended}</p>
                    <p className="text-xs text-muted-foreground">Attended</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <XCircle className="h-5 w-5 mx-auto mb-1 text-destructive" />
                    <p className="text-2xl font-bold">{noShowCount}</p>
                    <p className="text-xs text-muted-foreground">No-Shows</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Trophy className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                    <p className="text-2xl font-bold">{lotteryStats.wins}</p>
                    <p className="text-xs text-muted-foreground">Lottery Wins</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <BarChart3 className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{lotteryStats.losses}</p>
                    <p className="text-xs text-muted-foreground">Lottery Losses</p>
                  </CardContent>
                </Card>
              </div>

              {/* Event history */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Event History</CardTitle></CardHeader>
                <CardContent>
                  {eventHistory.length > 0 ? (
                    <div className="space-y-3">
                      {eventHistory.map((h) => (
                        <div key={h.registration.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{h.event.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(h.event.date).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {h.registration.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No event history.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
