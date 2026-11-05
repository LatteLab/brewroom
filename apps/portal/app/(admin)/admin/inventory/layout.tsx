import { SidebarTrigger } from '@/components/ui/sidebar';
import { InventoryNav } from '@/components/inventory/inventory-nav';
import { requireInventoryAdmin } from '@/lib/inventory-access';
import posStyles from '@/components/pos/pos.module.css';
import styles from '@/components/inventory/inventory.module.css';

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requireInventoryAdmin();
  return <div className={posStyles.adminPage}>
    <div className={styles.header}><SidebarTrigger className="md:hidden" /><h1>Inventory</h1></div>
    <p className={posStyles.muted}>Stock, the recipe book and equipment, kept in step with POS drink logging.</p>
    <InventoryNav />
    {children}
  </div>;
}
