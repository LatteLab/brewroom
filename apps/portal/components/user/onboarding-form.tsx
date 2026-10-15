'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { completeOnboardingAction } from '@/app/actions/profile';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export function OnboardingForm() {
  const [isPending, startTransition] = useTransition();
  const [major, setMajor] = useState('');
  const [classYear, setClassYear] = useState('');
  const [interests, setInterests] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');

  const canSubmit = major.trim() && classYear.trim() && interests.trim();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await completeOnboardingAction(formData);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Something went wrong');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="major">
          Major <span className="text-destructive">*</span>
        </Label>
        <Input
          id="major"
          name="major"
          placeholder="e.g. Computer Science"
          value={major}
          onChange={(e) => setMajor(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="classYear">
          Class Year <span className="text-destructive">*</span>
        </Label>
        <Input
          id="classYear"
          name="classYear"
          placeholder="e.g. 2026, PhD, MEng 2028"
          value={classYear}
          onChange={(e) => setClassYear(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="interests">
          Interests <span className="text-destructive">*</span>
        </Label>
        <Input
          id="interests"
          name="interests"
          placeholder="e.g. AI, robotics, coffee"
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">
          Bio <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Textarea
          id="bio"
          name="bio"
          placeholder="Tell us a bit about yourself..."
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          Phone <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="e.g. (617) 555-1234"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={!canSubmit || isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          'Get Started'
        )}
      </Button>
    </form>
  );
}
