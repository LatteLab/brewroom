'use client';

import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Circle } from 'lucide-react';
import type { User } from '@/lib/db/schema';

const FIELDS: { label: string; key: keyof User }[] = [
  { label: 'Name', key: 'name' },
  { label: 'Profile photo', key: 'image' },
  { label: 'Major', key: 'major' },
  { label: 'Class year', key: 'classYear' },
  { label: 'Interests', key: 'interests' },
  { label: 'Bio', key: 'bio' },
  { label: 'Phone', key: 'phone' },
  { label: 'Location', key: 'location' },
];

export function ProfileCompleteness({ user }: { user: User }) {
  const filled = FIELDS.filter((f) => !!user[f.key]);
  const percent = Math.round((filled.length / FIELDS.length) * 100);

  if (percent === 100) return null;

  return (
    <Card className="mb-6">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Profile {percent}% complete</p>
          <p className="text-xs text-muted-foreground">{filled.length}/{FIELDS.length} fields</p>
        </div>
        <Progress value={percent} className="h-2 mb-4" />
        <div className="grid grid-cols-2 gap-1.5">
          {FIELDS.map((f) => {
            const done = !!user[f.key];
            return (
              <div key={f.key} className="flex items-center gap-1.5 text-xs">
                {done
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  : <Circle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                }
                <span className={done ? 'text-muted-foreground' : 'text-foreground'}>{f.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
