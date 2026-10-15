'use client';

import { useState, useTransition } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Users, XCircle, Trophy, BarChart3 } from 'lucide-react';
import { statusColors } from '@/lib/types/event';

interface UserDetailData {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    major?: string | null;
    classYear?: string | null;
    bio?: string | null;
  };
  stats: {
    noShowCount: number;
    eventsAttended: number;
    semesterLotteryWins: number;
    semesterLotteryLosses: number;
  };
  eventHistory: {
    eventName: string;
    eventDate: Date;
    status: string;
  }[];
}

type FetchUserDetail = (userId: string) => Promise<UserDetailData | null>;

export function UserDetailModal({
  userId,
  open,
  onOpenChange,
  fetchUserDetail,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchUserDetail: FetchUserDetail;
}) {
  const [data, setData] = useState<UserDetailData | null>(null);
  const [isPending, startTransition] = useTransition();
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevUserId, setPrevUserId] = useState<string | null>(null);

  // Derive state from props instead of using useEffect
  if (open !== prevOpen || userId !== prevUserId) {
    setPrevOpen(open);
    setPrevUserId(userId);
    if (open && userId) {
      startTransition(async () => {
        const result = await fetchUserDetail(userId);
        setData(result);
      });
    } else if (!open) {
      setData(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Member Details</SheetTitle>
        </SheetHeader>

        {isPending && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        )}

        {data && !isPending && (
          <div className="mt-6 space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={data.user.image || undefined} />
                <AvatarFallback className="text-lg">
                  {data.user.name?.split(' ').map(n => n[0]).join('') || '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{data.user.name || 'Unknown'}</h3>
                <p className="text-sm text-muted-foreground">{data.user.email}</p>
                {(data.user.classYear || data.user.major) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[data.user.classYear && `Class of ${data.user.classYear}`, data.user.major].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {data.user.bio && (
              <p className="text-sm text-muted-foreground">{data.user.bio}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xl font-bold">{data.stats.eventsAttended}</p>
                  <p className="text-xs text-muted-foreground">Attended</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <XCircle className="h-4 w-4 mx-auto mb-1 text-destructive" />
                  <p className="text-xl font-bold">{data.stats.noShowCount}</p>
                  <p className="text-xs text-muted-foreground">No-Shows</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Trophy className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                  <p className="text-xl font-bold">{data.stats.semesterLotteryWins}</p>
                  <p className="text-xs text-muted-foreground">Lottery Wins (semester)</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <BarChart3 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xl font-bold">{data.stats.semesterLotteryLosses}</p>
                  <p className="text-xs text-muted-foreground">Lottery Losses (semester)</p>
                </CardContent>
              </Card>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Event History</h4>
              {data.eventHistory.length > 0 ? (
                <div className="space-y-2">
                  {data.eventHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{h.eventName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.eventDate).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-xs ${statusColors[h.status] || ''}`}>
                        {h.status.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No event history.</p>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
