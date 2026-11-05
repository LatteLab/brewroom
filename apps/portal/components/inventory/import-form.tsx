'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importBundleAction, importInventoryCsvAction } from '@/app/actions/inventory';
import { IMPORT_MAX_CHARS } from '@/lib/validations/inventory';
import posStyles from '../pos/pos.module.css';
import styles from './inventory.module.css';

type Summary = { title: string; lines: string[]; skipped: string[] };

export function ImportForm({ kind }: { kind: 'bundle' | 'csv' }) {
  const router = useRouter();
  const [text, setText] = useState(''); const [error, setError] = useState(''); const [summary, setSummary] = useState<Summary | null>(null);
  const [pending, startTransition] = useTransition();
  const id = `import-${kind}`;
  return <form onSubmit={e => { e.preventDefault(); setError(''); setSummary(null);
    // The server limit is in bytes, and accented or curly characters take more than one.
    if (new TextEncoder().encode(text).length > IMPORT_MAX_CHARS) { setError('That file is too large to import in one go (about 900 KB). Split it and import each part; nothing is deleted between imports.'); return; }
    startTransition(async () => {
    try {
      if (kind === 'bundle') {
        const r = await importBundleAction({ text });
        if (!r.ok) { setError(r.error); return; }
        const lines = [`Inventory: ${r.itemsAdded} added, ${r.itemsUpdated} updated`, `Equipment: ${r.equipmentAdded} added, ${r.equipmentUpdated} updated`, `Recipes: ${r.recipesAdded} added, ${r.recipesUpdated} updated`];
        if (r.guidelinesIgnored) lines.push(`${r.guidelinesIgnored} event guidelines ignored (deadline templates are not part of the portal yet)`);
        setSummary({ title: 'Imported. Nothing was deleted.', lines, skipped: r.skipped });
      } else {
        const r = await importInventoryCsvAction({ text });
        if (!r.ok) { setError(r.error); return; }
        setSummary({ title: 'Imported. Nothing was deleted.', lines: [`${r.added} added, ${r.updated} updated`], skipped: r.skipped });
      }
      setText(''); router.refresh();
    } catch { setError('Could not confirm the import. Refresh and check the data before retrying.'); }
  }); }} className={posStyles.form}>
    <label htmlFor={`${id}-file`}>Choose a {kind === 'bundle' ? '.json data file' : '.csv file'}, or paste it below
      <input id={`${id}-file`} type="file" accept={kind === 'bundle' ? '.json,application/json' : '.csv,text/csv'} disabled={pending} onChange={async e => { const file = e.target.files?.[0]; if (file) setText(await file.text()); }} />
    </label>
    <textarea className={styles.textarea} aria-label={kind === 'bundle' ? 'Data file contents' : 'CSV contents'} value={text} disabled={pending} onChange={e => setText(e.target.value)} placeholder={kind === 'bundle' ? '{ "format": "lattelab-data", "version": 1, ... }' : 'Item,Category,Unit,Bag size,Sealed bags,Open bag,Qty on hand,Par level,Cost per unit,Supplier,Notes'} />
    {error && <p role="alert" className={posStyles.error}>{error}</p>}
    {summary && <div role="status"><p><strong>{summary.title}</strong></p><ul className={styles.list}>{summary.lines.map(line => <li key={line}>{line}</li>)}</ul>
      {summary.skipped.length > 0 && <details><summary className={posStyles.muted}>{summary.skipped.length} row(s) skipped</summary><ul className={styles.list}>{summary.skipped.map(line => <li key={line}>{line}</li>)}</ul></details>}</div>}
    <div><button type="submit" className={posStyles.primary} disabled={pending || !text.trim()}>{pending ? 'Importing…' : 'Import'}</button></div>
  </form>;
}
