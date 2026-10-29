import Link from 'next/link';
import styles from './pos.module.css';
export function PosAccessDenied() {
  return <main className={styles.denied}><h1>POS access is required</h1><p>This station is available to designated Latte Lab staff. Ask the team lead to add your signed-in email to the POS staff list.</p><Link href="/user" className={styles.secondary}>Back to member portal</Link></main>;
}
