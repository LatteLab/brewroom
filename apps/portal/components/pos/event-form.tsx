'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPosEventAction, updatePosEventAction } from '@/app/actions/pos';
import type { PosEvent } from '@/lib/db/schema';
import { easternInput } from '@/lib/pos';
import styles from './pos.module.css';

export function PosEventForm({ event, initialStart, initialEnd }: { event?: PosEvent; initialStart?: string; initialEnd?: string }) {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const [name, setName] = useState(event?.name ?? '');
  const [startsAt, setStart] = useState(event ? easternInput(event.startsAt) : initialStart ?? '');
  const [endsAt, setEnd] = useState(event ? easternInput(event.endsAt) : initialEnd ?? '');
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); setError(''); setSaved(false); startTransition(async () => { const result = event ? await updatePosEventAction(event.id, { name, startsAt, endsAt }) : await createPosEventAction({ name, startsAt, endsAt }); if (!result.ok) { setError(result.error); return; } if (!event) router.push(`/admin/pos/${result.event.id}`); else { setSaved(true); router.refresh(); } }); }}>
    <label>Event name<input value={name} required maxLength={160} onChange={e => setName(e.target.value)} placeholder="Concord fall pop-up" /></label>
    <div className={styles.twoColumns}><label>Start, Eastern time<input type="datetime-local" value={startsAt} required onChange={e => setStart(e.target.value)} /></label><label>End, Eastern time<input type="datetime-local" value={endsAt} required onChange={e => setEnd(e.target.value)} /></label></div>
    <p className={styles.muted}>Times use Eastern, including daylight saving time. The window does not automatically stop logging.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{saved && <p role="status">Event saved.</p>}
    <button className={styles.primary} disabled={pending} type="submit">{pending ? 'Saving…' : event ? 'Save event' : 'Create event with fall menu'}</button>
  </form>;
}
