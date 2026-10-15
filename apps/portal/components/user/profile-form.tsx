'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { updateProfile } from '@/app/actions/profile';
import { useTransition, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import type { User } from '@/lib/db/schema';
import { ProfileImageEditor } from '@/components/user/profile-image-editor';

export function ProfileForm({ user }: { user: User }) {
  const [isPending, startTransition] = useTransition();
  const { update: updateSession } = useSession();
  const [isVisibleInDirectory, setIsVisibleInDirectory] = useState(user.isVisibleInDirectory ?? true);
  const [hidePhone, setHidePhone] = useState(user.hidePhone ?? false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // Booleans: server action uses formData.has() to detect presence
    if (isVisibleInDirectory) formData.set('isVisibleInDirectory', 'on');
    else formData.delete('isVisibleInDirectory');
    if (hidePhone) formData.set('hidePhone', 'on');
    else formData.delete('hidePhone');

    startTransition(async () => {
      try {
        await updateProfile(formData);
        await updateSession();
        toast.success('Profile updated');
      } catch {
        toast.error('Failed to update profile');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ProfileImageEditor
        userId={user.id}
        currentImage={user.image}
        userName={user.name}
      />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={user.email || ''} disabled className="bg-muted" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="major">Major</Label>
          <Input id="major" name="major" defaultValue={user.major || ''} placeholder="e.g. Computer Science" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="classYear">Year / Department</Label>
          <Input id="classYear" name="classYear" defaultValue={user.classYear || ''} placeholder="e.g. 2026, PhD, MEng 2028" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={user.phone || ''} placeholder="e.g. (617) 555-1234" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" defaultValue={user.location || ''} placeholder="e.g. Cambridge, MA" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="interests">Interests</Label>
        <Input id="interests" name="interests" defaultValue={user.interests || ''} placeholder="e.g. AI, robotics, coffee" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" defaultValue={user.bio || ''} placeholder="e.g. I'm a junior studying Course 6, graduating in 2026. From Seattle, always rating food for my Beli, cafe hopping, and trying every latte art tutorial I can find." rows={4} />
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Privacy</h3>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="isVisibleInDirectory" className="text-sm font-medium cursor-pointer">Show me in member directory</Label>
            <p className="text-xs text-muted-foreground">Other members can find and view your profile</p>
          </div>
          <Switch
            id="isVisibleInDirectory"
            checked={isVisibleInDirectory}
            onCheckedChange={setIsVisibleInDirectory}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="hidePhone" className="text-sm font-medium cursor-pointer">Hide my phone number</Label>
            <p className="text-xs text-muted-foreground">Your phone won&apos;t be shown on your profile</p>
          </div>
          <Switch
            id="hidePhone"
            checked={hidePhone}
            onCheckedChange={setHidePhone}
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save Profile'}
      </Button>
    </form>
  );
}
