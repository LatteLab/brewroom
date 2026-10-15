'use client';

import { useState, useEffect, useCallback } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getAudienceCountAction,
  getEventsForPickerAction,
  getSemesterStatusesAction,
  searchUsersAction,
} from '@/app/actions/email';
import { Search, X, Users, Loader2 } from 'lucide-react';
import type { AudienceFilter } from '@/lib/types/email';

interface AudiencePickerProps {
  value: AudienceFilter;
  onChange: (filter: AudienceFilter) => void;
}

export function AudiencePicker({ value, onChange }: AudiencePickerProps) {
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  // Event picker state
  const [events, setEvents] = useState<{ id: string; name: string; date: Date }[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  // Semester status picker state
  const [statuses, setStatuses] = useState<string[]>([]);
  const [statusesLoaded, setStatusesLoaded] = useState(false);

  // Manual user picker state
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string | null; email: string | null; image: string | null }[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<{ id: string; name: string | null; email: string | null; image: string | null }[]>([]);
  const [searching, setSearching] = useState(false);

  // Fetch recipient count whenever the filter changes
  const fetchCount = useCallback(async (filter: AudienceFilter) => {
    // Don't fetch for incomplete filters
    if (filter.type === 'event' && !filter.eventId) {
      setRecipientCount(null);
      return;
    }
    if (filter.type === 'semester_status' && !filter.semesterStatus) {
      setRecipientCount(null);
      return;
    }
    if (filter.type === 'manual' && filter.userIds.length === 0) {
      setRecipientCount(0);
      return;
    }

    setCountLoading(true);
    try {
      const count = await getAudienceCountAction(filter);
      setRecipientCount(count);
    } catch {
      setRecipientCount(null);
    } finally {
      setCountLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount(value);
  }, [value, fetchCount]);

  // Load events when switching to event type
  useEffect(() => {
    if (value.type === 'event' && !eventsLoaded) {
      getEventsForPickerAction().then((evts) => {
        setEvents(evts);
        setEventsLoaded(true);
      });
    }
  }, [value.type, eventsLoaded]);

  // Load semester statuses when switching to semester_status type
  useEffect(() => {
    if (value.type === 'semester_status' && !statusesLoaded) {
      getSemesterStatusesAction().then((s) => {
        setStatuses(s);
        setStatusesLoaded(true);
      });
    }
  }, [value.type, statusesLoaded]);

  // User search debounce
  useEffect(() => {
    if (value.type !== 'manual' || userSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchUsersAction(userSearch);
        // Filter out already selected users
        const selectedIds = new Set(selectedUsers.map((u) => u.id));
        setSearchResults(results.filter((r) => !selectedIds.has(r.id)));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [userSearch, value.type, selectedUsers]);


  const handleTypeChange = (type: string) => {
    switch (type) {
      case 'all':
        onChange({ type: 'all' });
        break;
      case 'event':
        onChange({ type: 'event', eventId: '' });
        break;
      case 'semester_status':
        onChange({ type: 'semester_status', semesterStatus: '' });
        break;
      case 'manual':
        onChange({ type: 'manual', userIds: selectedUsers.map((u) => u.id) });
        break;
    }
  };

  const addUser = (user: { id: string; name: string | null; email: string | null; image: string | null }) => {
    const updated = [...selectedUsers, user];
    setSelectedUsers(updated);
    setSearchResults((prev) => prev.filter((r) => r.id !== user.id));
    setUserSearch('');
    onChange({ type: 'manual', userIds: updated.map((u) => u.id) });
  };

  const removeUser = (userId: string) => {
    const updated = selectedUsers.filter((u) => u.id !== userId);
    setSelectedUsers(updated);
    onChange({ type: 'manual', userIds: updated.map((u) => u.id) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Audience</Label>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {countLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : recipientCount !== null ? (
            <span>{recipientCount} recipient{recipientCount !== 1 ? 's' : ''}</span>
          ) : (
            <span>--</span>
          )}
        </div>
      </div>

      <RadioGroup
        value={value.type}
        onValueChange={handleTypeChange}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2"
      >
        {[
          { value: 'all', label: 'All Members' },
          { value: 'event', label: 'Event' },
          { value: 'semester_status', label: 'Semester Status' },
          { value: 'manual', label: 'Manual' },
        ].map((option) => (
          <div key={option.value}>
            <RadioGroupItem value={option.value} id={`audience-${option.value}`} className="peer sr-only" />
            <Label
              htmlFor={`audience-${option.value}`}
              className="flex items-center justify-center rounded-md border-2 border-muted bg-transparent px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 [&>svg]:size-4"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {/* Type-specific sub-controls */}
      {value.type === 'event' && (
        <div className="space-y-2">
          <Select
            value={value.eventId || ''}
            onValueChange={(eventId) => onChange({ ...value, eventId })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent className="max-h-60 [&_[data-slot=select-scroll-up-button]]:hidden [&_[data-slot=select-scroll-down-button]]:hidden">
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name} ({new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.type === 'semester_status' && (
        <Select
          value={value.semesterStatus || ''}
          onValueChange={(semesterStatus) => onChange({ ...value, semesterStatus })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a semester status" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {statuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value.type === 'manual' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="pl-10"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="w-full flex items-center gap-3 p-2 hover:bg-muted transition-colors text-left"
                  onClick={() => addUser(user)}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {user.name?.split(' ').map((n) => n[0]).join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{user.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selected users */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {selectedUsers.map((user) => (
                <Badge key={user.id} variant="secondary" className="gap-1 pr-1">
                  {user.name || user.email}
                  <button
                    type="button"
                    onClick={() => removeUser(user.id)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
