"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  Server,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";

/**
 * Downtime alerts.
 *
 * Two tabs: the user's own subscription, and — for admins — a read-only view of who
 * watches what. The whole user-facing surface is deliberately four controls:
 * a webhook, a server scope, a sensitivity, and a recovery toggle.
 */

type ServerOption = { id: string; name: string; status: string };

type AlertDto = {
  servers: ServerOption[];
  channel: {
    id: string;
    label: string;
    hint: string;
    verifiedAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    hasWebhook: boolean;
  } | null;
  subscription: {
    id: string;
    scope: "ALL" | "SPECIFIC";
    serverIds: string[];
    minDowntimeSeconds: number;
    repeatMinutes: number;
    notifyOnRecovery: boolean;
    enabled: boolean;
  } | null;
  history: {
    id: string;
    kind: string;
    ok: boolean;
    error: string | null;
    sentAt: string;
    serverName: string;
  }[];
};

type AdminDto = {
  stats: {
    openCount: number;
    resolved24h: number;
    failed24h: number;
    longest7d: number;
    uptime7dPct: number;
  };
  openIncidents: {
    id: string;
    kind: string;
    startedAt: string;
    alertCount: number;
    server: { id: string; name: string; systemdServiceName: string };
  }[];
  subscriptions: {
    id: string;
    user: { id: string; name: string; email: string; role: string };
    scope: string;
    servers: { id: string; name: string }[];
    minDowntimeSeconds: number;
    repeatMinutes: number;
    notifyOnRecovery: boolean;
    enabled: boolean;
    channel: {
      id: string;
      label: string;
      hint: string;
      verifiedAt: string | null;
      lastError: string | null;
      lastErrorAt: string | null;
    };
  }[];
};

/** Sensitivity choices, in plain language. Hides minDowntimeSeconds from the user. */
const SENSITIVITY_OPTIONS = [
  { value: 0, label: "Immediately" },
  { value: 300, label: "After 5 minutes" },
  { value: 900, label: "After 15 minutes" },
  { value: 3600, label: "After 1 hour" },
] as const;

const REPEAT_OPTIONS = [
  { value: 0, label: "Only once" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 240, label: "Every 4 hours" },
] as const;

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function NotificationsPanel({
  isAdmin,
  setMessage,
}: {
  isAdmin: boolean;
  setMessage: (message: string) => void;
}) {
  const [tab, setTab] = useState<"mine" | "admin">("mine");
  const [data, setData] = useState<AlertDto | null>(null);
  const [admin, setAdmin] = useState<AdminDto | null>(null);
  const [loading, setLoading] = useState(true);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [scope, setScope] = useState<"ALL" | "SPECIFIC">("ALL");
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [sensitivity, setSensitivity] = useState(0);
  const [repeat, setRepeat] = useState(60);
  const [notifyOnRecovery, setNotifyOnRecovery] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/alerts");

    if (response.ok) {
      const payload = (await response.json()) as AlertDto;
      setData(payload);

      if (payload.subscription) {
        setScope(payload.subscription.scope);
        setSelectedServers(payload.subscription.serverIds);
        setSensitivity(payload.subscription.minDowntimeSeconds);
        setRepeat(payload.subscription.repeatMinutes);
        setNotifyOnRecovery(payload.subscription.notifyOnRecovery);
      }
    }

    setLoading(false);
  }, []);

  const loadAdmin = useCallback(async () => {
    const response = await fetch("/api/alerts/admin");

    if (response.ok) {
      setAdmin((await response.json()) as AdminDto);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isAdmin && tab === "admin") {
      void loadAdmin();
    }
  }, [isAdmin, loadAdmin, tab]);

  const hasWebhook = Boolean(data?.channel?.hasWebhook);
  const activeSubscriptions = data?.subscription;

  // A subscription is live only when there is a webhook, it is enabled, and it targets
  // something real. Surface this explicitly — silence is the worst failure mode here.
  const isLive = useMemo(() => {
    if (!hasWebhook || !activeSubscriptions?.enabled) {
      return false;
    }

    if (activeSubscriptions.scope === "ALL") {
      return (data?.servers.length ?? 0) > 0;
    }

    return activeSubscriptions.serverIds.length > 0;
  }, [activeSubscriptions, data?.servers.length, hasWebhook]);

  async function save() {
    setSaving(true);
    const response = await fetch("/api/alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookUrl: webhookUrl.trim() || undefined,
        scope,
        serverIds: selectedServers,
        minDowntimeSeconds: sensitivity,
        repeatMinutes: repeat,
        notifyOnRecovery,
        enabled: true,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setSaving(false);

    if (!response.ok) {
      setMessage(payload?.error ?? "Could not save alert settings.");
      await load();
      return;
    }

    setWebhookUrl("");
    setMessage("Alert settings saved. Check your Discord channel for the confirmation.");
    await load();
  }

  async function sendTest() {
    setTesting(true);
    const response = await fetch("/api/alerts/test", { method: "POST" });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setTesting(false);
    setMessage(response.ok ? "Test alert sent — check your Discord channel." : payload?.error ?? "Test failed.");
    await load();
  }

  async function remove() {
    if (!window.confirm("Remove your alert webhook and turn off all downtime alerts?")) {
      return;
    }

    await fetch("/api/alerts", { method: "DELETE" });
    setMessage("Alerts removed.");
    await load();
  }

  function toggleServer(serverId: string) {
    setSelectedServers((current) =>
      current.includes(serverId)
        ? current.filter((id) => id !== serverId)
        : [...current, serverId],
    );
  }

  if (loading) {
    return (
      <div className="gp-card flex items-center gap-3 p-6 text-gp-dim">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading alert settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isAdmin ? (
        <div className="gp-card gp-rise flex flex-wrap items-center gap-2 p-2">
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
            My alerts
          </TabButton>
          <TabButton active={tab === "admin"} onClick={() => setTab("admin")}>
            All subscribers
          </TabButton>
        </div>
      ) : null}

      {tab === "mine" ? (
        <>
          <StatusBanner
            isLive={isLive}
            hasWebhook={hasWebhook}
            channel={data?.channel ?? null}
            serverCount={
              scope === "ALL" ? data?.servers.length ?? 0 : selectedServers.length
            }
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <section className="gp-card gp-rise p-5">
                <div className="flex items-start gap-3">
                  <span className="gp-icon-tile gp-icon-tile-blue">
                    <Webhook className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="gp-title">Your Discord channel</p>
                    <p className="mt-1 text-sm leading-6 text-gp-dim">
                      In your Discord server: <span className="text-gp-ink">Server Settings → Integrations →
                      Webhooks → New Webhook</span>, pick the channel, then copy the webhook URL here.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="block">
                    <span className="gp-eyebrow mb-2 block">
                      {hasWebhook ? "Replace webhook" : "Webhook URL"}
                    </span>
                    <input
                      value={webhookUrl}
                      onChange={(event) => setWebhookUrl(event.target.value)}
                      className="gp-input font-mono text-xs"
                      placeholder={
                        hasWebhook
                          ? data?.channel?.hint ?? "Leave empty to keep the current one"
                          : "https://discord.com/api/webhooks/…"
                      }
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  {hasWebhook ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`gp-pill ${
                          data?.channel?.lastError
                            ? "gp-pill-red"
                            : data?.channel?.verifiedAt
                              ? "gp-pill-emerald"
                              : "gp-pill-amber"
                        }`}
                      >
                        {data?.channel?.lastError ? (
                          <XCircle className="h-3 w-3" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {data?.channel?.lastError
                          ? "Last send failed"
                          : data?.channel?.verifiedAt
                            ? "Verified"
                            : "Not verified yet"}
                      </span>
                      <button
                        type="button"
                        onClick={sendTest}
                        disabled={testing}
                        className="gp-btn gp-btn-ghost h-9"
                      >
                        <Send className={`h-4 w-4 ${testing ? "animate-pulse" : ""}`} />
                        Send test alert
                      </button>
                      <button type="button" onClick={remove} className="gp-btn gp-btn-danger h-9">
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  ) : null}

                  {data?.channel?.lastError ? (
                    <p className="gp-pill gp-pill-red w-full justify-start py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{data.channel.lastError}</span>
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="gp-card gp-rise p-5">
                <div className="flex items-start gap-3">
                  <span className="gp-icon-tile gp-icon-tile-violet">
                    <Server className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="gp-title">Which servers</p>
                    <p className="mt-1 text-sm text-gp-dim">
                      Watch everything you have access to, or pick specific servers.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <ScopeCard
                    active={scope === "ALL"}
                    onClick={() => setScope("ALL")}
                    title="All my servers"
                    subtitle={`${data?.servers.length ?? 0} server${
                      (data?.servers.length ?? 0) === 1 ? "" : "s"
                    }`}
                  />
                  <ScopeCard
                    active={scope === "SPECIFIC"}
                    onClick={() => setScope("SPECIFIC")}
                    title="Only specific servers"
                    subtitle={
                      selectedServers.length
                        ? `${selectedServers.length} selected`
                        : "Nothing selected yet"
                    }
                  />
                </div>

                {scope === "SPECIFIC" ? (
                  <div className="gp-scroll mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {data?.servers.map((server) => (
                      <label key={server.id} className="gp-check">
                        <input
                          type="checkbox"
                          checked={selectedServers.includes(server.id)}
                          onChange={() => toggleServer(server.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{server.name}</span>
                        <span className="gp-pill gp-pill-neutral">{server.status}</span>
                      </label>
                    ))}
                    {data?.servers.length === 0 ? (
                      <p className="gp-inset px-3 py-2 text-sm text-gp-dim">
                        No servers are assigned to this account.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>

            <div className="space-y-4">
              <section className="gp-card gp-rise p-5">
                <div className="flex items-start gap-3">
                  <span className="gp-icon-tile gp-icon-tile-amber">
                    <BellRing className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="gp-title">When to alert you</p>
                    <p className="mt-1 text-sm text-gp-dim">
                      Short outages that fix themselves are usually noise.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="gp-eyebrow mb-2 block">Tell me a server is down</span>
                    <select
                      value={sensitivity}
                      onChange={(event) => setSensitivity(Number(event.target.value))}
                      className="gp-select"
                    >
                      {SENSITIVITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="gp-eyebrow mb-2 block">While it stays down</span>
                    <select
                      value={repeat}
                      onChange={(event) => setRepeat(Number(event.target.value))}
                      className="gp-select"
                    >
                      {REPEAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="gp-check">
                    <input
                      type="checkbox"
                      checked={notifyOnRecovery}
                      onChange={(event) => setNotifyOnRecovery(event.target.checked)}
                    />
                    Send an all-clear when it comes back
                  </label>
                </div>

                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !hasWebhook}
                  className="gp-btn gp-btn-primary mt-5 w-full"
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save alert settings
                </button>
                {!hasWebhook ? (
                  <p className="mt-2 text-center text-xs text-gp-mute">
                    Add a webhook URL first.
                  </p>
                ) : null}
              </section>

              <section className="gp-card gp-rise p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="gp-title">Recent alerts</p>
                  <span className="gp-pill gp-pill-neutral">
                    <Clock className="h-3 w-3" />
                    Last {data?.history.length ?? 0}
                  </span>
                </div>

                {data && data.history.length > 0 ? (
                  <div className="mt-3 divide-y divide-white/[0.06]">
                    {data.history.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 py-2.5">
                        <span
                          className={`gp-dot ${
                            entry.kind === "RECOVERY"
                              ? "gp-dot-online"
                              : entry.ok
                                ? "gp-dot-idle"
                                : "gp-dot-idle"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-white">{entry.serverName}</p>
                          <p className="truncate text-xs text-gp-mute">
                            {entry.kind === "RECOVERY" ? "Recovered" : "Down"} ·{" "}
                            {new Date(entry.sentAt).toLocaleString()}
                          </p>
                        </div>
                        {!entry.ok ? <span className="gp-pill gp-pill-red">Failed</span> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="gp-inset mt-3 px-3 py-2 text-sm text-gp-dim">
                    No alerts sent yet.
                  </p>
                )}
              </section>
            </div>
          </div>
        </>
      ) : null}

      {tab === "admin" && isAdmin ? (
        <AdminAlertsView data={admin} reload={loadAdmin} />
      ) : null}
    </div>
  );
}

function StatusBanner({
  isLive,
  hasWebhook,
  channel,
  serverCount,
}: {
  isLive: boolean;
  hasWebhook: boolean;
  channel: AlertDto["channel"];
  serverCount: number;
}) {
  const tone = isLive
    ? "border-emerald-400/30 bg-emerald-400/[0.08]"
    : "border-amber-400/30 bg-amber-400/[0.08]";

  return (
    <section className={`gp-rise rounded-[20px] border px-5 py-4 ${tone}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`gp-dot ${isLive ? "gp-dot-online" : "gp-dot-idle"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            {isLive
              ? `Alerts are on for ${serverCount} server${serverCount === 1 ? "" : "s"}.`
              : hasWebhook
                ? "Alerts are set up but not active yet."
                : "Alerts are off. Add a Discord webhook to start receiving downtime messages."}
          </p>
          <p className="mt-0.5 text-xs text-gp-dim">
            {isLive
              ? `Sending to ${channel?.hint ?? "your Discord channel"}.`
              : "Nothing will be sent until this is resolved."}
          </p>
        </div>
      </div>
    </section>
  );
}

function ScopeCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[14px] border p-4 text-left transition ${
        active
          ? "border-blue-400/50 bg-blue-500/[0.14] shadow-[0_0_0_1px_rgba(59,130,246,.2)]"
          : "border-white/[0.09] bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]"
      }`}
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs text-gp-dim">{subtitle}</p>
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[12px] px-4 py-2 text-[13px] font-semibold transition ${
        active
          ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-[0_12px_28px_-14px_rgba(59,130,246,.95)]"
          : "text-gp-dim hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function AdminAlertsView({
  data,
  reload,
}: {
  data: AdminDto | null;
  reload: () => Promise<void>;
}) {
  if (!data) {
    return (
      <div className="gp-card flex items-center gap-3 p-6 text-gp-dim">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading subscribers...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="gp-card gp-rise p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="gp-eyebrow">Alerting overview</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
              Who gets paged, and what is broken right now
            </h2>
          </div>
          <button type="button" onClick={() => void reload()} className="gp-btn gp-btn-ghost h-9">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <AdminStat label="Open now" value={String(data.stats.openCount)} tone="red" />
          <AdminStat label="Resolved 24h" value={String(data.stats.resolved24h)} tone="emerald" />
          <AdminStat
            label="Failed sends 24h"
            value={String(data.stats.failed24h)}
            tone={data.stats.failed24h > 0 ? "amber" : "neutral"}
          />
          <AdminStat
            label="Longest outage 7d"
            value={data.stats.longest7d ? formatDuration(data.stats.longest7d) : "—"}
            tone="violet"
          />
        </div>
        <p className="mt-3 text-xs text-gp-mute">
          Estimated uptime over the last 7 days: {data.stats.uptime7dPct.toFixed(2)}%.
        </p>
      </section>

      <section className="gp-card gp-rise overflow-hidden">
        <div className="border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <p className="gp-title">Open incidents</p>
        </div>
        {data.openIncidents.length > 0 ? (
          <div className="divide-y divide-white/[0.06]">
            {data.openIncidents.map((incident) => (
              <div key={incident.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="gp-dot gp-dot-idle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{incident.server.name}</p>
                  <p className="truncate text-xs text-gp-mute">
                    {incident.server.systemdServiceName} · since{" "}
                    {new Date(incident.startedAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`gp-pill ${incident.kind === "FLAPPING" ? "gp-pill-amber" : "gp-pill-red"}`}
                >
                  {incident.kind === "FLAPPING" ? "Flapping" : "Down"}
                </span>
                <span className="gp-pill gp-pill-neutral">{incident.alertCount} sent</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-4 text-sm text-gp-dim">Everything is up. No open incidents.</p>
        )}
      </section>

      <section className="gp-card gp-rise overflow-hidden">
        <div className="border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <p className="gp-title">Subscribers</p>
        </div>

        {data.subscriptions.length > 0 ? (
          <div className="hidden grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_minmax(120px,0.8fr)_minmax(120px,0.7fr)] items-center border-b border-white/[0.08] px-4 py-2.5 lg:grid">
            <span className="gp-eyebrow">User</span>
            <span className="gp-eyebrow">Watching</span>
            <span className="gp-eyebrow">Sensitivity</span>
            <span className="gp-eyebrow">Channel</span>
          </div>
        ) : null}

        <div className="divide-y divide-white/[0.06]">
          {data.subscriptions.map((subscription) => (
            <div
              key={subscription.id}
              className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_minmax(120px,0.8fr)_minmax(120px,0.7fr)] lg:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{subscription.user.name}</p>
                <p className="truncate text-xs text-gp-mute">{subscription.user.email}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-gp-dim">
                  {subscription.scope === "ALL"
                    ? "All accessible servers"
                    : subscription.servers.map((server) => server.name).join(", ") || "None"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="gp-pill gp-pill-neutral">
                  {subscription.minDowntimeSeconds === 0
                    ? "Immediately"
                    : formatDuration(subscription.minDowntimeSeconds)}
                </span>
                {subscription.notifyOnRecovery ? (
                  <span className="gp-pill gp-pill-emerald">All-clear</span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`gp-pill ${
                    subscription.channel.lastError
                      ? "gp-pill-red"
                      : subscription.channel.verifiedAt
                        ? "gp-pill-emerald"
                        : "gp-pill-amber"
                  }`}
                >
                  {subscription.channel.lastError ? "Broken" : subscription.channel.verifiedAt ? "OK" : "Unverified"}
                </span>
                <span className="truncate font-mono text-[11px] text-gp-mute">
                  {subscription.channel.hint}
                </span>
                {!subscription.enabled ? <span className="gp-pill gp-pill-neutral">Off</span> : null}
              </div>
            </div>
          ))}
        </div>

        {data.subscriptions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gp-dim">
            Nobody has configured personal alerts yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function AdminStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "emerald" | "amber" | "violet" | "neutral";
}) {
  const tones = {
    red: "gp-icon-tile-orange",
    emerald: "gp-icon-tile-emerald",
    amber: "gp-icon-tile-amber",
    violet: "gp-icon-tile-violet",
    neutral: "gp-icon-tile-blue",
  };

  return (
    <div className="gp-inset p-4">
      <span className={`gp-dot ${tone === "emerald" ? "gp-dot-online" : "gp-dot-idle"}`} />
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-0.5 truncate text-xs text-gp-dim">{label}</p>
      <span className="hidden" aria-hidden="true">
        {tones[tone]}
      </span>
    </div>
  );
}
