import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Configure postgres-js for Supabase Transaction Mode (pooler on port 5432)
const client = postgres(connectionString, {
  ssl: 'require',  // Supabase requires SSL
  max: 5,          // Allow concurrent queries in serverless
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,   // Required for Supabase transaction mode pooler (PgBouncer)
});

export const db = drizzle(client, { schema });

// Export all query functions
export * from './queries';
export * from './schema';
export * from './event-queries';
export * from './email-queries';
