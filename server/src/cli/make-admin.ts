#!/usr/bin/env bun
/**
 * make-admin.ts — Bootstrap an admin user for the ashlr backend.
 *
 * Usage:
 *   bun run src/cli/make-admin.ts <email>
 *
 * Sets users.is_admin = 1 for the given email. The user must already exist
 * (created via magic-link auth or issue-token CLI). Idempotent.
 */

import { getDb, getUserByEmail, setUserAdmin } from "../db.js";

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();

  if (!email || !email.includes("@")) {
    console.error("Usage: bun run src/cli/make-admin.ts <email>");
    process.exit(1);
  }

  // Ensure DB is initialised
  getDb();

  const user = getUserByEmail(email);
  if (!user) {
    console.error(`No user found with email: ${email}`);
    console.error("Create one first with: bun run src/cli/issue-token.ts <email>");
    process.exit(1);
  }

  if (user.is_admin === 1) {
    console.log(`User ${email} (${user.id}) is already an admin.`);
    process.exit(0);
  }

  setUserAdmin(user.id, true);
  console.log(`Granted admin to: ${user.email} (${user.id})`);
}

await main();
