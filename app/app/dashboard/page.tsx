import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import MissionControl from "./MissionControl";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // 1. Check org existence by calling GET /api/orgs/me
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") || "http";
  
  let orgData = null;
  try {
    const res = await fetch(`${proto}://${host}/api/orgs/me`, {
      headers: {
        cookie: headersList.get("cookie") || "",
      },
    });
    if (res.ok) {
      const data = await res.json();
      orgData = data?.organization;
    }
  } catch (err) {
    console.error("Failed to fetch org via /api/orgs/me:", err);
  }

  if (!orgData) {
    redirect("/onboarding");
  }

  // Initialize Supabase with service role key to check membership & fetch org
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgName = orgData.name;
  const orgId = orgData.id;
  const webhookUrl = `https://phishslayer.tech/api/webhooks/${orgId}`;

  // 3. Fetch initial alerts sorted by created_at desc
  const { data: initialAlerts, error: alertsError } = await supabase
    .from("alerts")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (alertsError) {
    console.error("Failed to fetch initial alerts:", alertsError);
  }

  const alerts = (initialAlerts || []).map(alert => ({
    ...alert,
    // Ensure all nullable columns conform to TypeScript types
    verdict: alert.verdict || null,
    confidence: alert.confidence !== undefined ? alert.confidence : null,
    mitre_techniques: alert.mitre_techniques || null,
    blast_radius: alert.blast_radius || null,
    triaged_at: alert.triaged_at || null,
  }));

  return (
    <MissionControl
      orgId={orgId}
      orgName={orgName}
      webhookUrl={webhookUrl}
      initialAlerts={alerts}
    />
  );
}
