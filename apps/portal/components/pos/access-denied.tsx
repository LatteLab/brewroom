import Link from 'next/link';
import styles from './pos.module.css';
export function PosAccessDenied() {
  return <main className={styles.denied}><h1>Administrator access is required</h1><p>POS is available only to Latte Lab admins. Sign in with an admin account to continue.</p><Link href="/user" className={styles.secondary}>Back to member portal</Link></main>;
}
