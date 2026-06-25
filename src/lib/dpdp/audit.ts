import { createServiceClient } from "@/lib/supabase/service-client";
import type { DpdpAuditEventType } from "@/lib/types";

export async function recordDpdpAuditEvent(
  customerId: string,
  eventType: DpdpAuditEventType,
  metadata: Record<string, unknown> = {},
) {
  const supabase = createServiceClient();

  const { error } = await supabase.from("dpdp_audit_log").insert({
    customer_id: customerId,
    event_type: eventType,
    metadata,
  });

  if (error) throw error;
}

export async function fetchDpdpAuditLog(customerId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("dpdp_audit_log")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
