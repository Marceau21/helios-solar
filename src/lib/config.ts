export const SUPABASE_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
/** Mode démo : actif par défaut tant que Supabase n'est pas configuré. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false" || !SUPABASE_CONFIGURED;
