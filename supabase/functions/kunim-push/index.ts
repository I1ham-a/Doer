// Күнім: sends due reminders as Web Push notifications. Called every minute by pg_cron.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC")!,
    Deno.env.get("VAPID_PRIVATE")!,
  );
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.rpc("kunim_due");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let sent = 0, failed = 0;
  const errors: string[] = [];
  for (const row of data ?? []) {
    try {
      await webpush.sendNotification(row.sub, JSON.stringify({ title: row.title, body: row.body, tag: row.tag }), { TTL: 3600 });
      sent++;
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      errors.push(String(code ?? (e as Error).message).slice(0, 120));
      if (code === 404 || code === 410) await db.rpc("kunim_unsub", { e: row.endpoint });
    }
  }
  return Response.json({ due: (data ?? []).length, sent, failed, errors });
});
