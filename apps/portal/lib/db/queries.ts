import { db } from './index';
import { adminWhitelist, users } from './schema';
import { eq, gte, desc, sql } from 'drizzle-orm';
import type { AdminWhitelist, User, NewUser } from './schema';

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
 * Check if a user has completed their profile (major, classYear, and interests all set).
 */
export async function isProfileComplete(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ major: users.major, classYear: users.classYear, interests: users.interests })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return true;
  return !!(user.major && user.classYear && user.interests);
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

// ============================================================================
// User Queries
// ============================================================================

/**
 * Get all users ordered by creation date (newest first)
 */
export async function getAllUsers(): Promise<User[]> {
  return await db
    .select()
    .from(users)
    .orderBy(users.createdAt);
}

/**
 * Get a user by their ID
 */
export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user || null;
}

/**
 * Get a user by their email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user || null;
}

/**
 * Create a new user (typically called by database trigger, but useful for testing)
 */
export async function createUser(data: NewUser): Promise<User> {
  const [user] = await db
    .insert(users)
    .values(data)
    .returning();

  return user;
}

// ============================================================================
// Dashboard Analytics Queries
// ============================================================================

/**
 * Get the most recent N users
 */
export async function getRecentUsers(limit: number = 5): Promise<User[]> {
  return await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

/**
 * Get users who joined within the last N days
 */
export async function getUsersFromLastDays(days: number): Promise<User[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return await db
    .select()
    .from(users)
    .where(gte(users.createdAt, cutoffDate));
}

// ============================================================================
// Profile Seed
// ============================================================================

/**
 * On first login, apply pre-seeded profile data from the profile_seed table.
 * Populates only null fields so it never overwrites data the user has set.
 * Deletes the seed row after applying (self-cleaning).
 */
export async function applyProfileSeed(userId: string, email: string): Promise<void> {
  let rows: Awaited<ReturnType<typeof db.execute>>;
  try {
    rows = await db.execute(
      sql`SELECT name, major, class_year, interests FROM profile_seed WHERE email = ${email.toLowerCase()} LIMIT 1`
    );
  } catch (err) {
    // Postgres error 42P01 = "undefined_table" — import script hasn't been run yet. Ignore silently.
    if ((err as { code?: string })?.code === '42P01') return;
    throw err;
  }
  if (!rows.length) return;
  const seed = rows[0] as Record<string, string | null>;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;

  const updates: Partial<typeof users.$inferInsert> = {};
  if (!user.name && seed.name) updates.name = seed.name;
  if (!user.major && seed.major) updates.major = seed.major;
  if (!user.classYear && seed.class_year) updates.classYear = seed.class_year;
  if (!user.interests && seed.interests) updates.interests = seed.interests;

  if (Object.keys(updates).length > 0) {
    await db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, userId));
  }
  await db.execute(sql`DELETE FROM profile_seed WHERE email = ${email.toLowerCase()}`);
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
