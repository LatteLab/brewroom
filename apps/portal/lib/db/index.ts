import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Configure postgres-js for Supabase Transaction Mode (pooler on port 5432)
const disableSsl = process.env.DATABASE_SSL === 'disable';
if (disableSsl && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname)) {
  throw new Error('DATABASE_SSL=disable is allowed only for a loopback database.');
}
const client = postgres(connectionString, {
  ssl: disableSsl ? false : 'require',
  max: 5,          // Allow concurrent queries in serverless
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,   // Required for Supabase transaction mode pooler (PgBouncer)
});

export const db = drizzle(client, { schema });

// Export all query functions
export * from './admin-queries';
export * from './user-queries';
export * from './schema';
export * from './event-queries';
export * from './email-queries';
