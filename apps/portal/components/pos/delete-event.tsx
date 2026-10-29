'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deletePosEventAction } from '@/app/actions/pos';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { PosEvent } from '@/lib/db/schema';
import styles from './pos.module.css';

export function DeletePosEvent({ event }: { event: Pick<PosEvent, 'id' | 'name'> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  return <Dialog open={open} onOpenChange={value => {
    if (pending) return;
    setOpen(value); setName(''); setError('');
  }}>
    <DialogTrigger asChild><button type="button" className={styles.danger} aria-label={`Delete ${event.name}`}>Delete event</button></DialogTrigger>
    <DialogContent className={styles.deleteDialog} showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>Delete this event?</DialogTitle>
        <DialogDescription>This permanently deletes <strong>{event.name}</strong>, its menu, and all of its order history. Its drinks will disappear from overall analytics, and its kiosk link will stop working. This cannot be undone.</DialogDescription>
      </DialogHeader>
      <form className={styles.form} onSubmit={e => {
        e.preventDefault(); setError('');
        startTransition(async () => {
          try {
            const result = await deletePosEventAction({ eventId: event.id, nameConfirmation: name });
            if (!result.ok) { setError(result.error); return; }
            setOpen(false); router.push('/admin/pos'); router.refresh();
          } catch {
            setError('Could not confirm deletion. Retry to check and finish deleting this event.');
          }
        });
      }}>
        <label>Type the event name to confirm: <strong>{event.name}</strong>
          <input autoComplete="off" value={name} onChange={e => setName(e.target.value)} disabled={pending} required maxLength={160} />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <DialogFooter>
          <button type="button" className={styles.secondary} disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className={styles.danger} disabled={pending || name.trim() !== event.name}>{pending ? 'Deleting…' : 'Permanently delete event'}</button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
