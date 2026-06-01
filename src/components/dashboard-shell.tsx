"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  CirclePower,
  Gauge,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";

type Role = "ADMIN" | "USER";
type ServerStatus = "ONLINE" | "OFFLINE" | "STARTING" | "STOPPING" | "RESTARTING" | "UNKNOWN";

type GameServerDto = {
  id: string;
  name: string;
  description: string;
  status: ServerStatus;
  systemdServiceName?: string;
  execStart: string;
  execStartBase: string | null;
  execStartExtra: string;
  startupSettings: {
    fsGame: string;
    punkbuster: boolean;
    configFile: string;
    rconPassword: string;
    extraParameters: string;
  };
  assignedUserIds: string[];
};

type UserDto = {
  id: string;
  name: string;
  email: string;
  role: Role;
  serverIds: string[];
};

const statusStyle: Record<ServerStatus, string> = {
  ONLINE: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  OFFLINE: "border-neutral-500/30 bg-neutral-500/10 text-neutral-300",
  STARTING: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  STOPPING: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  RESTARTING: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  UNKNOWN: "border-white/10 bg-white/5 text-neutral-300",
};

export function DashboardShell({ currentUser }: { currentUser: SessionUser }) {
  const [view, setView] = useState<"servers" | "users">("servers");
  const [servers, setServers] = useState<GameServerDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const isAdmin = currentUser.role === "ADMIN";
  const onlineCount = useMemo(
    () => servers.filter((server) => server.status === "ONLINE").length,
    [servers],
  );

  const loadData = useCallback(async () => {
    const serverResponse = await fetch("/api/servers");
    if (serverResponse.ok) {
      const data = await serverResponse.json();
      setServers(data.servers);
    }

    if (isAdmin) {
      const userResponse = await fetch("/api/users");
      if (userResponse.ok) {
        const data = await userResponse.json();
        setUsers(data.users);
      }
    }

    setLoading(false);
  }, [isAdmin]);

  const refreshLiveStatuses = useCallback(async () => {
    if (servers.length === 0) {
      return;
    }

    await Promise.allSettled(
      servers.map((server) => fetch(`/api/servers/${server.id}/status`)),
    );
    await loadData();
  }, [loadData, servers]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (view !== "servers") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshLiveStatuses();
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [refreshLiveStatuses, view]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#111827] text-neutral-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(135deg,#162033_0%,#0a1020_48%,#061b22_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:72px_72px]" />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/10 bg-[#07111f]/85 px-4 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl lg:block">
        <Brand />
        <nav className="mt-8 space-y-2">
          <NavButton active={view === "servers"} onClick={() => setView("servers")} icon={Server}>
            Servers
          </NavButton>
          {isAdmin ? (
            <NavButton active={view === "users"} onClick={() => setView("users")} icon={Users}>
              Users
            </NavButton>
          ) : null}
        </nav>
        <button
          onClick={logout}
          className="absolute bottom-5 left-4 right-4 flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 text-sm font-medium text-neutral-300 transition hover:bg-white/5"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>

      <main className="relative z-10 pb-24 lg:ml-64 lg:pb-8">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a1220]/80 px-4 py-4 shadow-lg shadow-black/15 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-cyan-200">Signed in as {currentUser.name}</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {view === "users" ? "User Access" : "Server Control"}
              </h1>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <Stat label="Servers" value={servers.length} />
              <Stat label="Online" value={onlineCount} />
              <span className="rounded-md border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100">
                {currentUser.role}
              </span>
            </div>
          </div>
        </header>

        <section className="px-4 py-6 sm:px-6 lg:px-8">
          {view === "servers" ? (
            <ServerOverview
              currentUser={currentUser}
              servers={servers}
              onlineCount={onlineCount}
            />
          ) : null}

          {message ? (
            <div className="mb-4 rounded-md border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              {message}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 text-neutral-300">
              Loading panel...
            </div>
          ) : view === "users" && isAdmin ? (
            <UsersPanel users={users} servers={servers} reload={loadData} setMessage={setMessage} />
          ) : (
            <ServersPanel
              isAdmin={isAdmin}
              servers={servers}
              reload={loadData}
              setMessage={setMessage}
            />
          )}
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-3 border-t border-white/10 bg-neutral-950/95 p-2 backdrop-blur lg:hidden">
        <MobileButton active={view === "servers"} onClick={() => setView("servers")} icon={LayoutDashboard}>
          Servers
        </MobileButton>
        {isAdmin ? (
          <MobileButton active={view === "users"} onClick={() => setView("users")} icon={Users}>
            Users
          </MobileButton>
        ) : (
          <span />
        )}
        <MobileButton active={false} onClick={logout} icon={LogOut}>
          Logout
        </MobileButton>
      </nav>
    </div>
  );
}

function ServerOverview({
  currentUser,
  servers,
  onlineCount,
}: {
  currentUser: SessionUser;
  servers: GameServerDto[];
  onlineCount: number;
}) {
  const offlineCount = servers.length - onlineCount;

  return (
    <section className="mb-6 grid overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/25 backdrop-blur-xl lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="bg-[linear-gradient(135deg,rgba(14,165,233,.34),rgba(30,64,175,.2)_45%,rgba(15,23,42,.16))] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-cyan-100">Intuitive Gamepanel</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Server Command Center
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
              Manage assigned game and voice servers, startup arguments, and live service actions from one panel.
            </p>
          </div>
          <span className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white">
            {currentUser.role}
          </span>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <OverviewStat icon={Server} label="Servers" value={servers.length} tone="cyan" />
          <OverviewStat icon={Activity} label="Online" value={onlineCount} tone="emerald" />
          <OverviewStat icon={Gauge} label="Offline" value={offlineCount} tone="amber" />
        </div>
      </div>

      <aside className="border-t border-white/10 bg-[#071e3f]/80 p-5 sm:p-6 lg:border-l lg:border-t-0">
        <p className="text-sm font-semibold text-cyan-100">Operations</p>
        <div className="mt-5 space-y-3">
          <MiniMetric label="Control mode" value="systemd" />
          <MiniMetric label="Access" value={currentUser.role === "ADMIN" ? "All servers" : "Assigned only"} />
          <MiniMetric label="Startup edits" value={currentUser.role === "ADMIN" ? "Full command" : "Arguments only"} />
        </div>
      </aside>
    </section>
  );
}

function OverviewStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Server;
  label: string;
  value: number;
  tone: "cyan" | "emerald" | "amber";
}) {
  const tones = {
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <Icon className="h-5 w-5" />
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="text-sm text-slate-200">{label}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/10 px-3 py-2">
      <span className="text-sm text-blue-100">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-300 text-neutral-950">
        <Shield className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-200">Intuitive</p>
        <p className="text-lg font-semibold">Gamepanel</p>
      </div>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Server;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
        active ? "bg-cyan-300 text-neutral-950" : "text-neutral-300 hover:bg-white/5"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function MobileButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Server;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium ${
        active ? "bg-cyan-300 text-neutral-950" : "text-neutral-300"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function ServersPanel({
  isAdmin,
  servers,
  reload,
  setMessage,
}: {
  isAdmin: boolean;
  servers: GameServerDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  return (
    <div className="space-y-6">
      {isAdmin ? <ServerForm reload={reload} setMessage={setMessage} /> : null}
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#09111d]/70 shadow-2xl shadow-black/25 backdrop-blur-xl">
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(120px,0.7fr)_minmax(230px,0.9fr)] border-b border-white/10 bg-white/[0.07] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-300 lg:grid">
          <span>Server name</span>
          <span>Address</span>
          <span className="text-right">Operations</span>
        </div>
        <div className="divide-y divide-white/10">
          {servers.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              isAdmin={isAdmin}
              reload={reload}
              setMessage={setMessage}
            />
          ))}
        </div>
      </div>
      {servers.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 text-neutral-300">
          No servers are assigned to this account.
        </div>
      ) : null}
    </div>
  );
}

function ServerRow({
  server,
  isAdmin,
  reload,
  setMessage,
}: {
  server: GameServerDto;
  isAdmin: boolean;
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [busy, setBusy] = useState("");

  async function runAction(action: "start" | "stop" | "restart") {
    setBusy(action);
    const response = await fetch(`/api/servers/${server.id}/${action}`, { method: "POST" });
    setBusy("");

    if (!response.ok) {
      setMessage("Server action failed. Check app logs and sudoers/systemd configuration.");
      return;
    }

    setMessage(`${server.name} ${action} command accepted.`);
    await reload();
  }

  async function refreshStatus() {
    setBusy("status");
    await fetch(`/api/servers/${server.id}/status`);
    setBusy("");
    await reload();
  }

  const address = getServerAddress(server.execStart);

  return (
    <details className="group bg-[#0d1624]/45 open:bg-[linear-gradient(135deg,rgba(15,23,42,.88),rgba(8,47,73,.55))]">
      <summary className="grid cursor-pointer gap-3 px-4 py-3 transition hover:bg-white/[0.045] lg:grid-cols-[minmax(220px,1.4fr)_minmax(120px,0.7fr)_minmax(230px,0.9fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500 transition group-open:rotate-180" />
          <span
            className={`h-3.5 w-3.5 shrink-0 rounded-full ring-4 ${
              server.status === "ONLINE"
                ? "bg-emerald-400 ring-emerald-400/15"
                : "bg-neutral-500 ring-neutral-500/15"
            }`}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-white">{server.name}</h2>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusStyle[server.status]}`}>
                {server.status}
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-neutral-400 lg:hidden">{server.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-7 lg:pl-0">
          <span className="rounded-md border border-cyan-300/20 bg-cyan-400/15 px-2.5 py-1 font-mono text-sm font-medium text-cyan-100 shadow-lg shadow-cyan-950/20">
            {address}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 pl-7 lg:pl-0">
          <ActionButton onClick={() => runAction("start")} disabled={Boolean(busy)} icon={CirclePower}>
            Start
          </ActionButton>
          <ActionButton onClick={() => runAction("restart")} disabled={Boolean(busy)} icon={RefreshCw}>
            Restart
          </ActionButton>
          <ActionButton onClick={() => runAction("stop")} disabled={Boolean(busy)} icon={Square}>
            Stop
          </ActionButton>
        </div>
      </summary>

      <div className="grid gap-5 border-t border-white/10 bg-black/10 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Description</p>
            <p className="mt-1 text-sm leading-6 text-neutral-300">{server.description}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton onClick={refreshStatus} disabled={Boolean(busy)} icon={RefreshCw}>
              Refresh status
            </ActionButton>
            <span className="rounded-md border border-white/10 bg-[#0a1220] px-3 py-2 text-sm text-neutral-400">
              {isAdmin && server.systemdServiceName ? server.systemdServiceName : "Assigned server"}
            </span>
          </div>
        </div>
        <ServerConfigEditor
          server={server}
          isAdmin={isAdmin}
          reload={reload}
          setMessage={setMessage}
        />
      </div>
    </details>
  );
}

function ServerConfigEditor({
  server,
  isAdmin,
  reload,
  setMessage,
}: {
  server: GameServerDto;
  isAdmin: boolean;
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = isAdmin
      ? {
          name: formData.get("name"),
          description: formData.get("description"),
          systemdServiceName: formData.get("systemdServiceName"),
          execStart: formData.get("execStart"),
        }
      : {
          name: formData.get("name"),
          description: formData.get("description"),
          fsGame: formData.get("fsGame"),
          punkbuster: formData.get("punkbuster") === "true",
          configFile: formData.get("configFile"),
          rconPassword: formData.get("rconPassword"),
          extraParameters: formData.get("extraParameters"),
        };

    const response = await fetch(`/api/servers/${server.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setMessage("Server startup line updated.");
      await reload();
    } else {
      setMessage("Could not update server startup line.");
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#07111f]/90 shadow-xl shadow-black/20">
      <div className="border-b border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-cyan-100">
        Startup configuration
      </div>
      <form onSubmit={submit} className="space-y-3 p-3">
        <Input name="name" defaultValue={server.name} placeholder="Server name" />
        <Input name="description" defaultValue={server.description} placeholder="Description" />
        {isAdmin ? (
          <>
            <Input
              name="systemdServiceName"
              defaultValue={server.systemdServiceName}
              placeholder="game-server-1.service"
            />
          </>
        ) : null}
        {isAdmin ? (
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
              ExecStart
            </span>
            <textarea
              name="execStart"
              required
              rows={4}
              defaultValue={server.execStart}
              className="w-full resize-y rounded-md border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-xs leading-5 text-white outline-none ring-cyan-400/20 transition placeholder:text-neutral-500 focus:border-cyan-300 focus:ring-4"
              placeholder="/opt/game-servers/server-1/server_binary +set net_port 28960"
            />
          </label>
        ) : (
          <>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                +set fs_game
              </span>
              <input
                name="fsGame"
                defaultValue={server.startupSettings.fsGame}
                className="w-full resize-y rounded-md border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-xs leading-5 text-white outline-none ring-cyan-400/20 transition placeholder:text-neutral-500 focus:border-cyan-300 focus:ring-4"
                placeholder="__rPAMv115b5"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                +set sv_punkbuster
              </span>
              <select
                name="punkbuster"
                defaultValue={server.startupSettings.punkbuster ? "true" : "false"}
                className="h-11 w-full rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none ring-cyan-400/20 transition focus:border-cyan-300 focus:ring-4"
              >
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                +exec
              </span>
              <input
                name="configFile"
                defaultValue={server.startupSettings.configFile}
                className="w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-xs leading-5 text-white outline-none ring-cyan-400/20 transition placeholder:text-neutral-500 focus:border-cyan-300 focus:ring-4"
                placeholder="server_config.cfg"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                rconpassword
              </span>
              <input
                name="rconPassword"
                type="password"
                defaultValue={server.startupSettings.rconPassword}
                className="w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-xs leading-5 text-white outline-none ring-cyan-400/20 transition placeholder:text-neutral-500 focus:border-cyan-300 focus:ring-4"
                placeholder="RCON password"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                Extra parameters
              </span>
              <textarea
                name="extraParameters"
                rows={3}
                defaultValue={server.startupSettings.extraParameters}
                className="w-full resize-y rounded-md border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-xs leading-5 text-white outline-none ring-cyan-400/20 transition placeholder:text-neutral-500 focus:border-cyan-300 focus:ring-4"
                placeholder="+set g_gametype sd"
              />
            </label>
          </>
        )}
        <button className="h-10 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
          Save configuration
        </button>
      </form>
    </section>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  className = "",
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: typeof Server;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#0b1625] px-2 text-sm font-medium text-neutral-200 shadow-lg shadow-black/10 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 ${className}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{children}</span>
    </button>
  );
}

function getServerAddress(execStart: string) {
  const port = execStart.match(/\+set\s+net_port\s+(\d+)/)?.[1];

  return port ? `:${port}` : "Port unknown";
}

function ServerForm({
  reload,
  setMessage,
}: {
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description"),
        systemdServiceName: formData.get("systemdServiceName"),
        execStart: formData.get("execStart"),
      }),
    });

    if (response.ok) {
      form.reset();
      setMessage("Server created.");
      await reload();
    } else {
      setMessage("Could not create server. Check the service name format.");
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
      <Input name="name" placeholder="Server name" />
      <Input name="description" placeholder="Description" />
      <Input name="systemdServiceName" placeholder="game-server-1.service" />
      <button className="flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200 xl:row-span-2 xl:h-full">
        <Plus className="h-4 w-4" />
        Add
      </button>
      <textarea
        name="execStart"
        required
        rows={3}
        className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-xs leading-5 text-white outline-none ring-cyan-400/20 transition placeholder:text-neutral-500 focus:border-cyan-300 focus:ring-4 xl:col-span-3"
        placeholder="/opt/game-servers/server-1/server_binary +set net_port 28960"
      />
    </form>
  );
}

function UsersPanel({
  users,
  servers,
  reload,
  setMessage,
}: {
  users: UserDto[];
  servers: GameServerDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  return (
    <div className="space-y-6">
      <UserForm servers={servers} reload={reload} setMessage={setMessage} />
      <div className="grid gap-4 xl:grid-cols-2">
        {users.map((user) => (
          <UserEditor key={user.id} user={user} servers={servers} reload={reload} setMessage={setMessage} />
        ))}
      </div>
    </div>
  );
}

function UserForm({
  servers,
  reload,
  setMessage,
}: {
  servers: GameServerDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = userPayload(form);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      form.reset();
      setMessage("User created.");
      await reload();
    } else {
      setMessage("Could not create user.");
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Input name="name" placeholder="Name" />
        <Input name="email" type="email" placeholder="Email" />
        <Input name="password" type="password" placeholder="Password" />
        <select name="role" className="h-11 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none">
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <ServerCheckboxes servers={servers} selected={[]} />
      <button className="mt-4 flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
        <Plus className="h-4 w-4" />
        Create user
      </button>
    </form>
  );
}

function UserEditor({
  user,
  servers,
  reload,
  setMessage,
}: {
  user: UserDto;
  servers: GameServerDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userPayload(event.currentTarget)),
    });

    setMessage(response.ok ? "User updated." : "Could not update user.");
    await reload();
  }

  async function removeUser() {
    const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    setMessage(response.ok ? "User deleted." : "Could not delete user.");
    await reload();
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="name" defaultValue={user.name} placeholder="Name" />
        <Input name="email" type="email" defaultValue={user.email} placeholder="Email" />
        <Input name="password" type="password" placeholder="New password optional" required={false} />
        <select name="role" defaultValue={user.role} className="h-11 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none">
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <ServerCheckboxes servers={servers} selected={user.serverIds} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="h-10 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
          Save
        </button>
        <button
          type="button"
          onClick={removeUser}
          className="flex h-10 items-center gap-2 rounded-md border border-red-400/30 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-400/10"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </form>
  );
}

function ServerCheckboxes({ servers, selected }: { servers: GameServerDto[]; selected: string[] }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {servers.map((server) => (
        <label key={server.id} className="flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-200">
          <input
            type="checkbox"
            name="serverIds"
            value={server.id}
            defaultChecked={selected.includes(server.id)}
            className="h-4 w-4 accent-cyan-300"
          />
          {server.name}
        </label>
      ))}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      required
      {...props}
      className="h-11 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none ring-cyan-400/20 transition placeholder:text-neutral-500 focus:border-cyan-300 focus:ring-4"
    />
  );
}

function userPayload(form: HTMLFormElement) {
  const formData = new FormData(form);
  return {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password") || undefined,
    role: formData.get("role"),
    serverIds: formData.getAll("serverIds"),
  };
}
