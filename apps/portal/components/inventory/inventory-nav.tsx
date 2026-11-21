'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './inventory.module.css';

const tabs = [
  { href: '/admin/inventory', label: 'Stock' },
  { href: '/admin/inventory/recipes', label: 'Recipes' },
  { href: '/admin/inventory/events', label: 'Event planning' },
  { href: '/admin/inventory/equipment', label: 'Equipment' },
  { href: '/admin/inventory/data', label: 'Import / export' },
];

export function InventoryNav() {
  const pathname = usePathname();
  return <nav className={styles.tabs} aria-label="Inventory sections">{tabs.map(tab => {
    const current = tab.href === '/admin/inventory' ? pathname === tab.href : pathname === tab.href || pathname.startsWith(tab.href + '/');
    return <Link key={tab.href} href={tab.href} aria-current={current ? 'page' : undefined}>{tab.label}</Link>;
  })}</nav>;
}
