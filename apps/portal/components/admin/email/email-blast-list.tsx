'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { BlastWithStats } from '@/lib/types/email';
import { blastStatusColors } from '@/lib/types/email';

function audienceSummary(blast: BlastWithStats): string {
  try {
    const filters = JSON.parse(blast.audienceFilters);
    switch (filters.type) {
      case 'all':
        return 'All Members';
      case 'event':
        return 'Event registrants';
      case 'semester_status':
        return filters.semesterStatus || 'Semester status';
      case 'manual': {
        const count = filters.userIds?.length || 0;
        return `${count} selected user${count !== 1 ? 's' : ''}`;
      }
      default:
        return blast.audienceType;
    }
  } catch {
    return blast.audienceType;
  }
}

export function EmailBlastList({ blasts }: { blasts: BlastWithStats[] }) {
  if (blasts.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <p>No email blasts yet.</p>
        <p className="text-sm mt-1">Click &quot;Compose&quot; to send your first blast.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blasts.map((blast) => (
        <Link key={blast.id} href={`/admin/email/${blast.id}`}>
          <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{blast.subject}</p>
              <p className="text-sm text-muted-foreground">
                {audienceSummary(blast)}
                {blast.sentAt &&
                  ` · ${new Date(blast.sentAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`}
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4">
              {blast.status === 'sent' && (
                <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-2">
                  <span>{blast.stats.delivered} delivered</span>
                  {blast.stats.bounced > 0 && (
                    <span className="text-amber-500">{blast.stats.bounced} bounced</span>
                  )}
                  {blast.stats.failed > 0 && (
                    <span className="text-red-500">{blast.stats.failed} failed</span>
                  )}
                </div>
              )}
              <Badge variant="outline" className={blastStatusColors[blast.status] || ''}>
                {blast.status}
              </Badge>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
