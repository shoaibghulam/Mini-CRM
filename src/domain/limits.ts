/** Text length limits. Mirror the CHECK constraints in supabase/migrations/0006_hardening.sql. */
export const LIMITS = {
  siteName: 200,
  siteAddress: 500,
  taskTitle: 200,
  taskDescription: 5000,
  statusComment: 2000,
} as const;
