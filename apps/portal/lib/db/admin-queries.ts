import { db } from './index';
import { adminWhitelist } from './schema';
import { eq } from 'drizzle-orm';
import type { AdminWhitelist } from './schema';
import { getAllUsers } from './user-queries';


// ============================================================================
// Admin Whitelist Queries
// ============================================================================

/**
 * Check if an email is in the admin whitelist
 */
export async function isAdmin(email: string): Promise<boolean> {
  const result = await db
    .select({ id: adminWhitelist.id })
    .from(adminWhitelist)
    .where(eq(adminWhitelist.email, email))
    .limit(1);

  return result.length > 0;
}

/**
 * Get all admin whitelist entries
 */
export async function getAdminWhitelist(): Promise<AdminWhitelist[]> {
  return await db
    .select()
    .from(adminWhitelist)
    .orderBy(adminWhitelist.createdAt);
}

/**
 * Add an email to the admin whitelist
 */
export async function addAdminEmail(email: string): Promise<AdminWhitelist> {
  const [result] = await db
    .insert(adminWhitelist)
    .values({ email })
    .returning();

  return result;
}

/**
 * Remove an email from the admin whitelist by ID
 */
export async function removeAdminEmail(id: string): Promise<void> {
  await db
    .delete(adminWhitelist)
    .where(eq(adminWhitelist.id, id));
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  const allUsers = await getAllUsers();
  const allAdmins = await getAdminWhitelist();

  // Calculate date ranges
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Count users by time period
  const usersThisWeek = allUsers.filter(
    user => user.createdAt && new Date(user.createdAt) >= startOfWeek
  ).length;

  const usersThisMonth = allUsers.filter(
    user => user.createdAt && new Date(user.createdAt) >= startOfMonth
  ).length;

  const usersLastMonth = allUsers.filter(
    user => user.createdAt &&
    new Date(user.createdAt) >= startOfLastMonth &&
    new Date(user.createdAt) <= endOfLastMonth
  ).length;

  return {
    totalUsers: allUsers.length,
    totalAdmins: allAdmins.length,
    usersThisWeek,
    usersThisMonth,
    usersLastMonth,
  };
}
