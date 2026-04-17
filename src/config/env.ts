import { z } from "zod";

const ServerEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  LINE_USER_ID: z.string().min(1),
  AUTOMATION_SECRET: z.string().min(16),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function loadServerEnv(): ServerEnv {
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid server env vars: ${missing}`);
  }
  return parsed.data;
}
