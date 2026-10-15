/**
 * One-time script to seed the profile_seed table from a Google Form CSV export.
 * Usage: npx tsx scripts/import-profiles.ts "<path/to/responses.csv>"
 *
 * The script is idempotent — re-running updates existing rows via ON CONFLICT.
 */

import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';

// Must run before any DB module is imported so DATABASE_URL is set
loadEnvConfig(path.join(__dirname, '..'));

// ============================================================================
// CSV Parser — handles quoted fields with embedded commas and escaped quotes
// ============================================================================

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      // Quoted field
      let field = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ',') i++;
    } else {
      // Unquoted field
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function parseCsv(content: string): string[][] {
  // Split into lines, but quoted fields can span multiple lines
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      // Skip \r in \r\n
      if (ch === '\r' && content[i + 1] === '\n') i++;
      if (current.trim()) rows.push(parseCsvRow(current));
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) rows.push(parseCsvRow(current));
  return rows;
}

// ============================================================================
// Dept/Year Parser
// ============================================================================

interface ParsedDeptYear {
  major: string | null;
  classYear: string | null;
}

function parseDeptYear(raw: string): ParsedDeptYear {
  if (!raw || !raw.trim()) return { major: null, classYear: null };

  let text = raw.trim();

  // Normalize course number dot separators: 6.9 → 6-9, 6.14 → 6-14
  text = text.replace(/\b(\d{1,2})\.(\d{1,2})\b/g, '$1-$2');

  // Remove "started YYYY" (PhD start year ≠ class year)
  text = text.replace(/,?\s*started\s+\d{4}\b/gi, '');

  // Extract 4-digit class year (2023–2035 range; rejects joke years like 2067)
  let classYear: string | null = null;
  const year4Match = text.match(/\b(202[3-9]|203[0-5])\b/);
  if (year4Match) {
    classYear = year4Match[1];
  }

  // Extract 2-digit year shorthand if no 4-digit found
  if (!classYear) {
    const year2Match = text.match(/(?:co\s*'|'|(?<=,\s*))([2-9]\d)['"]?\b/i);
    if (year2Match) {
      const yr = parseInt(year2Match[1], 10);
      if (yr >= 23 && yr <= 35) {
        classYear = '20' + year2Match[1];
      }
    }
  }

  // Now clean major: remove year references and noise from text
  let major = text;

  // Remove 4-digit years in valid range
  major = major.replace(/\b202[3-9]\b/g, '');
  major = major.replace(/\b203[0-5]\b/g, '');

  // Remove 2-digit year shorthands: co'29, '29, 29', 28"
  major = major.replace(/\bco\s*'[2-9]\d\b/gi, '');
  major = major.replace(/'[2-9]\d['"]?\b/g, '');
  major = major.replace(/\b[2-9]\d['"]?\b/g, '');

  // Remove "Class of", "Class or" (typo), "c/o", "CO " (Class Of abbreviation at word boundary)
  major = major.replace(/\bclass\s+(?:of|or)\b/gi, '');
  major = major.replace(/\bc\/o\b/gi, '');
  major = major.replace(/\bCO\b/g, '');

  // Remove "Course " prefix
  major = major.replace(/\bCourse\s+/gi, '');

  // Remove parenthetical notes entirely
  major = major.replace(/\([^)]*\)/g, '');

  // Remove noise words/phrases
  const noiseWords = [
    'originally a', 'but taking more time',
    'Postdoctoral Associate', 'Postdoctoral',
    'Exchange Student in',
    'grad student',
    'First Year', 'first year',
    'Undecided',
    'started',
    'alum',
    'MEng',
    "Master's", "Masters",
    'PhD',
    'sophomore', 'freshman', 'junior', 'senior',
    '1st', '2nd', '3rd', '4th',
    'G', // standalone "G" for graduate
  ];
  for (const word of noiseWords) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    major = major.replace(re, '');
  }

  // Remove standalone "year" word
  major = major.replace(/\byear\b/gi, '');

  // Clean up multiple spaces, then trim separators
  major = major.replace(/\s{2,}/g, ' ').trim();

  // Remove leading/trailing separators: , ; + & - / and or
  major = major.replace(/^[\s,;+&\-/]+/g, '');
  major = major.replace(/[\s,;+&\-/]+$/g, '');
  major = major.replace(/\s+(?:and|or)\s*$/gi, '');
  major = major.replace(/^\s*(?:and|or)\s+/gi, '');
  major = major.trim();

  // Truncate to 100 chars
  if (major.length > 100) major = major.slice(0, 100).trim();

  return {
    major: major || null,
    classYear,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-profiles.ts "<path/to/responses.csv>"');
    process.exit(1);
  }

  const absPath = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  console.log(`Reading CSV: ${absPath}`);
  const content = fs.readFileSync(absPath, 'utf-8');
  const rows = parseCsv(content);

  // Row 0 is the header
  const dataRows = rows.slice(1);
  console.log(`Total rows (excluding header): ${dataRows.length}`);

  // Deduplicate by email — keep latest by timestamp
  // Columns: 0=Timestamp, 1=Name, 2=Affiliation, 3=DeptYear, 4=Email, 5=Kerberos,
  //          6=CoffeeDrink, 7=MyersBriggs, 8=Interests, 9-15=Availability, ...
  const byEmail = new Map<string, string[]>();

  for (const row of dataRows) {
    const email = (row[4] ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue; // skip blank/invalid emails

    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, row);
    } else {
      // Compare timestamps and keep newer
      const existingTs = new Date(existing[0]).getTime();
      const newTs = new Date(row[0]).getTime();
      if (newTs > existingTs) {
        byEmail.set(email, row);
      }
    }
  }

  console.log(`Unique emails: ${byEmail.size}`);

  // Dynamic imports here so DATABASE_URL is set before the postgres client initializes
  const { db } = await import('../lib/db/index.js');
  const { sql } = await import('drizzle-orm');

  // Create profile_seed table if not exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS profile_seed (
      email      TEXT PRIMARY KEY,
      name       TEXT,
      major      TEXT,
      class_year TEXT,
      interests  TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Upsert each deduplicated row
  let inserted = 0;
  let skipped = 0;

  for (const [email, row] of byEmail) {
    const name = (row[1] ?? '').trim() || null;
    const rawDeptYear = (row[3] ?? '').trim();
    const rawInterests = (row[8] ?? '').trim();

    const { major, classYear } = parseDeptYear(rawDeptYear);
    const interests = rawInterests ? rawInterests.slice(0, 300) : null;

    // Skip rows where all profile fields are null
    if (!name && !major && !classYear && !interests) {
      skipped++;
      continue;
    }

    await db.execute(sql`
      INSERT INTO profile_seed (email, name, major, class_year, interests)
      VALUES (${email}, ${name}, ${major}, ${classYear}, ${interests})
      ON CONFLICT (email) DO UPDATE SET
        name       = EXCLUDED.name,
        major      = EXCLUDED.major,
        class_year = EXCLUDED.class_year,
        interests  = EXCLUDED.interests
    `);
    inserted++;
  }

  console.log(`Upserted: ${inserted} rows`);
  if (skipped > 0) console.log(`Skipped (all-null profile): ${skipped} rows`);
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
