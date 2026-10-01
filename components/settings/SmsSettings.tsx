"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type SmsSettingsData = { enabled: boolean; phone: string; sendingReady: boolean; recent: Array<{ status: string; reason: string; created_at: string; error_code?: string }> };
export function SmsSettings() {
  const { user } = useAuth();
  const [data, setData] = useState<SmsSettingsData | null>(null);
  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const request = useCallback(async (path: string, body?: unknown) => {
    if (!user) throw new Error("Sign in to manage SMS alerts");
    const response = await fetch(path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "SMS request failed");
    return result;
  }, [user]);
  const refresh = useCallback(async () => {
    const result = await request("/api/sms/settings") as SmsSettingsData;
    setData(result); setPhone(result.phone); setEnabled(result.enabled);
  }, [request]);
  useEffect(() => {
    let active = true;
    request("/api/sms/settings").then((result: SmsSettingsData) => { if (active) { setData(result); setPhone(result.phone); setEnabled(result.enabled); } }).catch((error: Error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [request]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await request("/api/sms/settings", { phone, enabled }); await refresh(); setMessage("SMS settings saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save SMS settings"); }
    finally { setBusy(false); }
  }
  async function test() {
    setConfirm(false); setBusy(true); setMessage("");
    try { const result = await request("/api/sms/test", { confirmed: true }); setMessage(result.message); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not process test SMS"); }
    finally { setBusy(false); }
  }
  const unchanged = phone === data?.phone && enabled === data?.enabled;
  return <section className="mt-6 rounded-2xl border border-litter-border bg-litter-card p-4">
    <h3 className="text-sm font-semibold text-litter-text">SMS Alerts</h3>
    <p className="mt-1 text-xs text-theme-muted">Receive cat activity and litter-box alerts even when this website is closed. Your device still needs internet. Alert preferences and quiet hours apply.</p>
    <form onSubmit={save} className="mt-4 space-y-3">
      <label htmlFor="sms-phone" className="block text-sm text-litter-text">Philippine mobile number</label>
      <input id="sms-phone" type="tel" autoComplete="tel" placeholder="09171234567" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={busy} className="w-full rounded-xl border border-litter-border bg-litter-bg p-3 text-litter-text" />
      <label className="flex items-start gap-2 text-sm text-litter-text"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={busy} className="mt-1" />Send alerts by SMS to this number. I agree to receive these messages.</label>
      <button type="submit" disabled={busy} className="rounded-xl bg-litter-primary px-4 py-2 text-white disabled:opacity-50">{busy ? "Please wait…" : "Save SMS settings"}</button>
    </form>
    {data && !data.sendingReady && <p className="mt-3 text-xs text-theme-muted">SMS sending has not been enabled on the server yet.</p>}
    <div className="mt-3 flex gap-3 text-sm"><button type="button" disabled={busy || !data?.enabled || !data.sendingReady || !unchanged} onClick={() => setConfirm(true)} className="text-litter-primary disabled:opacity-50">Send test SMS</button><button type="button" disabled={busy} onClick={() => { void refresh().catch((error: Error) => setMessage(error.message)); }} className="text-theme-muted">Refresh status</button></div>
    <p role="status" className="mt-3 text-sm text-theme-muted">{message}</p>
    {data?.recent.map((record, index) => <p key={`${record.created_at}-${index}`} className="mt-2 text-xs text-theme-muted">{record.reason}: {record.status === "accepted" ? "Accepted by provider; awaiting delivery" : record.status === "unknown" ? "Unconfirmed — check provider before retrying" : record.status} · {new Date(record.created_at).toLocaleString()}</p>)}
    <ConfirmDialog isOpen={confirm} onClose={() => setConfirm(false)} onConfirm={() => { void test(); }} title="Send one test SMS?" message={`Send to ${data?.phone || phone}? This uses your IPROG SMS credits.`} confirmText="Send test SMS" variant="info" />
  </section>;
}
