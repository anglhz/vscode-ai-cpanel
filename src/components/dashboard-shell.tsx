"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronsLeft,
  ChevronsRight,
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
  X,
} from "lucide-react";
import Link from "next/link";
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

type ServerPlayersDto = {
  hostname: string;
  mapName: string;
  gameType: string;
  maxClients: number | null;
  playerCount: number;
  players: {
    name: string;
    score: string;
    ping: string;
  }[];
  retrievedAt: number | null;
};

const statusStyle: Record<ServerStatus, string> = {
  ONLINE: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  OFFLINE: "border-neutral-500/30 bg-neutral-500/10 text-neutral-300",
  STARTING: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  STOPPING: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  RESTARTING: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  UNKNOWN: "border-white/10 bg-white/5 text-neutral-300",
};
const SERVER_PUBLIC_IP = process.env.NEXT_PUBLIC_SERVER_PUBLIC_IP ?? "144.76.41.252";
const SERVER_GAME_OPTIONS = [
  { value: "cod1", label: "Call of Duty 1", binary: "cod_lnxded" },
  { value: "cod2", label: "Call of Duty 2", binary: "cod2_lnxded" },
  { value: "cod4", label: "Call of Duty 4", binary: "cod4x18_dedrun" },
  { value: "ts3", label: "TeamSpeak 3", binary: "teamspeak3-server_linux_amd64/ts3server_startscript.sh" },
] as const;

export function DashboardShell({ currentUser }: { currentUser: SessionUser }) {
  const [view, setView] = useState<"servers" | "users">("servers");
  const [servers, setServers] = useState<GameServerDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});

  const isAdmin = currentUser.role === "ADMIN";
  const onlineCount = useMemo(
    () => servers.filter((server) => server.status === "ONLINE").length,
    [servers],
  );
  const activePlayerCount = useMemo(
    () => Object.values(playerCounts).reduce((total, count) => total + count, 0),
    [playerCounts],
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

  const refreshPlayerCounts = useCallback(async () => {
    const gameServers = servers.filter(isQueryableGameServer);

    if (gameServers.length === 0) {
      setPlayerCounts({});
      return;
    }

    const results = await Promise.allSettled(
      gameServers.map(async (server) => {
        const response = await fetch(`/api/servers/${server.id}/players`);

        if (!response.ok) {
          return [server.id, 0] as const;
        }

        const data = (await response.json()) as ServerPlayersDto;
        return [server.id, data.playerCount] as const;
      }),
    );

    setPlayerCounts(
      Object.fromEntries(
        results.map((result, index) =>
          result.status === "fulfilled" ? result.value : ([gameServers[index].id, 0] as const),
        ),
      ),
    );
  }, [servers]);

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

  useEffect(() => {
    if (view !== "servers") {
      return;
    }

    const initialTimer = window.setTimeout(() => {
      void refreshPlayerCounts();
    }, 0);
    const interval = window.setInterval(() => {
      void refreshPlayerCounts();
    }, 10_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [refreshPlayerCounts, view]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = window.setTimeout(() => setMessage(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#111827] text-neutral-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(135deg,#162033_0%,#0a1020_48%,#061b22_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:72px_72px]" />

      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-white/10 bg-[#07111f]/85 px-4 py-8 shadow-2xl shadow-black/30 backdrop-blur-xl transition-[width] duration-200 lg:block ${
          sidebarCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div className={`flex items-center gap-2 ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
          <Link href="/dashboard" aria-label="Go to dashboard start">
            <Brand collapsed={sidebarCollapsed} />
          </Link>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-300 transition hover:bg-white/5 ${
              sidebarCollapsed ? "absolute right-[-1.25rem] top-14 bg-[#07111f] shadow-lg shadow-black/20" : ""
            }`}
            title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
        <nav className={sidebarCollapsed ? "mt-12 space-y-3" : "mt-8 space-y-2"}>
          <NavButton active={view === "servers"} onClick={() => setView("servers")} icon={Server} collapsed={sidebarCollapsed}>
            Servers
          </NavButton>
          {isAdmin ? (
            <NavButton active={view === "users"} onClick={() => setView("users")} icon={Users} collapsed={sidebarCollapsed}>
              Users
            </NavButton>
          ) : null}
        </nav>
        <button
          onClick={logout}
          className="absolute bottom-5 left-4 right-4 flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 text-sm font-medium text-neutral-300 transition hover:bg-white/5"
        >
          <LogOut className="h-4 w-4" />
          {sidebarCollapsed ? null : "Sign out"}
        </button>
      </aside>

      <main
        className={`relative z-10 pb-24 transition-[margin] duration-200 lg:pb-8 ${
          sidebarCollapsed ? "lg:ml-20" : "lg:ml-64"
        }`}
      >
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
              activePlayerCount={activePlayerCount}
            />
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

      {message ? (
        <div className="fixed bottom-20 right-4 z-50 w-[min(calc(100vw-2rem),380px)] rounded-lg border border-cyan-300/25 bg-[#07111f]/95 p-4 text-sm text-cyan-50 shadow-2xl shadow-black/50 backdrop-blur-xl lg:bottom-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,.8)]" />
            <p className="min-w-0 flex-1 leading-5">{message}</p>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss message"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ServerOverview({
  currentUser,
  servers,
  onlineCount,
  activePlayerCount,
}: {
  currentUser: SessionUser;
  servers: GameServerDto[];
  onlineCount: number;
  activePlayerCount: number;
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

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewStat icon={Server} label="Servers" value={servers.length} tone="cyan" />
          <OverviewStat icon={Activity} label="Online" value={onlineCount} tone="emerald" />
          <OverviewStat icon={Gauge} label="Offline" value={offlineCount} tone="amber" />
          <OverviewStat icon={Users} label="Active players" value={activePlayerCount} tone="violet" />
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
  tone: "cyan" | "emerald" | "amber" | "violet";
}) {
  const tones = {
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-100",
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

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-300 text-neutral-950">
        <Shield className="h-5 w-5" />
      </div>
      <div className={collapsed ? "hidden" : ""}>
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
  collapsed = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Server;
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
        active ? "bg-cyan-300 text-neutral-950" : "text-neutral-300 hover:bg-white/5"
      }`}
      title={collapsed ? String(children) : undefined}
    >
      <Icon className="h-4 w-4" />
      {collapsed ? null : children}
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
  const [players, setPlayers] = useState<ServerPlayersDto | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState("");

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

  async function loadPlayers() {
    setPlayersLoading(true);
    setPlayersError("");
    const response = await fetch(`/api/servers/${server.id}/players`);
    setPlayersLoading(false);

    if (!response.ok) {
      setPlayers(null);
      setPlayersError("Could not load player data.");
      return;
    }

    setPlayers(await response.json());
  }

  const address = getServerAddress(server.execStart);
  const isOffline = server.status === "OFFLINE" || server.status === "UNKNOWN";

  return (
    <details
      className="group bg-[#0d1624]/45 open:bg-[linear-gradient(135deg,rgba(15,23,42,.88),rgba(8,47,73,.55))]"
      onToggle={(event) => {
        if (event.currentTarget.open && !players && !playersLoading) {
          void loadPlayers();
        }
      }}
    >
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

        <div className={`grid gap-2 pl-7 lg:pl-0 ${isOffline ? "grid-cols-1" : "grid-cols-2"}`}>
          {isOffline ? (
            <ActionButton
              onClick={() => runAction("start")}
              disabled={Boolean(busy)}
              icon={CirclePower}
              tone="start"
            >
              Start
            </ActionButton>
          ) : (
            <>
              <ActionButton
                onClick={() => runAction("restart")}
                disabled={Boolean(busy)}
                icon={RefreshCw}
                tone="restart"
              >
                Restart
              </ActionButton>
              <ActionButton
                onClick={() => runAction("stop")}
                disabled={Boolean(busy)}
                icon={Square}
                tone="stop"
              >
                Stop
              </ActionButton>
            </>
          )}
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
          <PlayersPanel
            players={players}
            loading={playersLoading}
            error={playersError}
            onRefresh={loadPlayers}
          />
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

function PlayersPanel({
  players,
  loading,
  error,
  onRefresh,
}: {
  players: ServerPlayersDto | null;
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
}) {
  const maxClients = players?.maxClients ? `/${players.maxClients}` : "";
  const onlineLabel = players?.gameType === "ts3" ? "Clients online" : "Players online";

  return (
    <section className="rounded-lg border border-white/10 bg-[#07111f]/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{onlineLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-2xl font-semibold text-white">
              {players ? `${players.playerCount}${maxClients}` : loading ? "Loading..." : "0"}
            </p>
            {players?.mapName ? (
              <span className="rounded-md border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-100">
                {players.mapName}
              </span>
            ) : null}
            {players?.gameType ? (
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-medium uppercase text-neutral-300">
                {players.gameType}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          className="flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm font-medium text-neutral-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh players
        </button>
      </div>

      {players?.hostname ? (
        <p className="mt-3 truncate text-sm text-neutral-400">{stripCodColors(players.hostname)}</p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}

      {players && players.players.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-md border border-white/10">
          <div className="grid grid-cols-[1fr_72px_72px] bg-white/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            <span>Name</span>
            <span className="text-right">Score</span>
            <span className="text-right">Ping</span>
          </div>
          <div className="max-h-72 divide-y divide-white/10 overflow-y-auto">
            {players.players.map((player, index) => (
              <div
                key={`${player.name}-${index}`}
                className="grid grid-cols-[1fr_72px_72px] px-3 py-2 text-sm text-neutral-200"
              >
                <span className="truncate">{stripCodColors(player.name)}</span>
                <span className="text-right font-mono text-neutral-300">{player.score}</span>
                <span className="text-right font-mono text-neutral-300">{player.ping}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {players && players.players.length === 0 ? (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-400">
          {players.gameType === "ts3" ? "No clients connected right now." : "No players online right now."}
        </p>
      ) : null}
    </section>
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
  const isVoiceServer = isVoiceGameServer(server);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = isAdmin
      ? {
          name: formData.get("name"),
          description: formData.get("description"),
          systemdServiceName: formData.get("systemdServiceName"),
          execStart: isVoiceServer ? server.execStart : formData.get("execStart"),
        }
      : {
          name: formData.get("name"),
          description: formData.get("description"),
          fsGame: isVoiceServer ? "" : formData.get("fsGame"),
          punkbuster: isVoiceServer ? false : formData.get("punkbuster") === "true",
          configFile: isVoiceServer ? "" : formData.get("configFile"),
          rconPassword: isVoiceServer ? "" : formData.get("rconPassword"),
          extraParameters: isVoiceServer ? "" : formData.get("extraParameters"),
        };

    const response = await fetch(`/api/servers/${server.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setMessage("Server configuration updated.");
      await reload();
    } else {
      setMessage("Could not update server configuration.");
    }
  }

  async function deleteServer() {
    if (!isAdmin || !window.confirm(`Delete ${server.name} from the panel?`)) {
      return;
    }

    const response = await fetch(`/api/servers/${server.id}`, { method: "DELETE" });

    if (response.ok) {
      setMessage("Server deleted.");
      await reload();
    } else {
      setMessage("Could not delete server.");
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
        {isAdmin && !isVoiceServer ? (
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
        ) : !isAdmin && !isVoiceServer ? (
          <>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                +set fs_game
              </span>
              <input
                name="fsGame"
                defaultValue={server.startupSettings.fsGame}
                className="w-full resize-y rounded-md border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-xs leading-5 text-white outline-none ring-cyan-400/20 transition placeholder:text-neutral-500 focus:border-cyan-300 focus:ring-4"
                placeholder=""
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
                placeholder=""
              />
            </label>
          </>
        ) : isVoiceServer ? (
          <p className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-400">
            TeamSpeak servers do not use editable game startup arguments in this panel.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button className="h-10 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
            Save configuration
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={deleteServer}
              className="flex h-10 items-center gap-2 rounded-md border border-red-400/30 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-400/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete server
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  className = "",
  tone = "neutral",
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: typeof Server;
  className?: string;
  tone?: "neutral" | "start" | "restart" | "stop";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-white/10 bg-[#0b1625] text-neutral-200 hover:border-cyan-300/40 hover:bg-cyan-300/10",
    start: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:border-emerald-300/60 hover:bg-emerald-500/25",
    restart: "border-amber-400/35 bg-amber-500/15 text-amber-100 hover:border-amber-300/70 hover:bg-amber-500/25",
    stop: "border-red-400/35 bg-red-500/15 text-red-100 hover:border-red-300/70 hover:bg-red-500/25",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-lg shadow-black/10 transition disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone]} ${className}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}

function getServerAddress(execStart: string) {
  const port = execStart.match(/\+set\s+net_port\s+(\d+)/)?.[1] ?? execStart.match(/default_voice_port=(\d+)/)?.[1];

  return port ? `${SERVER_PUBLIC_IP}:${port}` : "Port unknown";
}

function stripCodColors(value: string) {
  return value.replace(/\^[0-9]/g, "");
}

function getServerGame(server: GameServerDto) {
  return server.systemdServiceName?.match(/^([a-zA-Z0-9_-]+)-\d+\.service$/)?.[1] ?? "";
}

function isVoiceGameServer(server: GameServerDto) {
  return getServerGame(server) === "ts3";
}

function isQueryableGameServer(server: GameServerDto) {
  return !isVoiceGameServer(server) && Boolean(server.execStart.match(/\+set\s+net_port\s+\d+/));
}

function ServerForm({
  reload,
  setMessage,
}: {
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [selectedGame, setSelectedGame] = useState<(typeof SERVER_GAME_OPTIONS)[number]["value"]>("cod1");
  const [open, setOpen] = useState(false);
  const selectedGameOption = SERVER_GAME_OPTIONS.find((game) => game.value === selectedGame) ?? SERVER_GAME_OPTIONS[0];
  const isTeamspeak = selectedGame === "ts3";

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
        ownerFolder: formData.get("ownerFolder"),
        game: formData.get("game"),
        port: formData.get("port"),
        maxClients: formData.get("maxClients"),
        binaryName: isTeamspeak ? selectedGameOption.binary : formData.get("binaryName"),
      }),
    });

    if (response.ok) {
      form.reset();
      setSelectedGame("cod1");
      setOpen(false);
      setMessage("Server created.");
      await reload();
    } else {
      setMessage("Could not create server. Check the service name format.");
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Servers</p>
          <p className="text-sm text-neutral-400">Create a new game or voice service when needed.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200"
        >
          <Plus className="h-4 w-4" />
          Add server
        </button>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-4 border-t border-white/10 pt-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px_180px_120px]">
            <Input name="name" placeholder="Server name" />
            <Input name="description" placeholder="Description" />
            <Input name="ownerFolder" placeholder="Alias" />
            <select
              name="game"
              value={selectedGame}
              onChange={(event) => setSelectedGame(event.target.value as typeof selectedGame)}
              className="h-11 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none ring-cyan-400/20 transition focus:border-cyan-300 focus:ring-4"
            >
              {SERVER_GAME_OPTIONS.map((game) => (
                <option key={game.value} value={game.value}>
                  {game.label}
                </option>
              ))}
            </select>
            <Input name="port" type="number" placeholder="28960" />
          </div>
          <div className={`mt-5 grid gap-4 ${isTeamspeak ? "sm:grid-cols-1 lg:max-w-xs" : "sm:grid-cols-2 lg:max-w-xl"}`}>
            {!isTeamspeak ? (
              <label className="block">
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Max clients
                </span>
                <Input name="maxClients" type="number" placeholder="12" defaultValue={12} />
              </label>
            ) : (
              <input type="hidden" name="maxClients" value="32" />
            )}
            {!isTeamspeak ? (
              <label className="block">
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Binary
                </span>
                <Input name="binaryName" placeholder={selectedGameOption.binary} defaultValue={selectedGameOption.binary} key={selectedGame} />
              </label>
            ) : (
              <input type="hidden" name="binaryName" value={selectedGameOption.binary} />
            )}
          </div>
          {isTeamspeak ? (
            <p className="mt-3 text-sm text-neutral-400">
              TeamSpeak uses the bundled start script automatically, so no startup binary is needed here.
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
              <Plus className="h-4 w-4" />
              Create server
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 rounded-md border border-white/10 px-4 text-sm font-semibold text-neutral-300 transition hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
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
  const [createSftpUser, setCreateSftpUser] = useState(false);

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
      <label className="mt-4 flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-200">
        <input
          type="checkbox"
          name="createSftpUser"
          checked={createSftpUser}
          onChange={(event) => setCreateSftpUser(event.target.checked)}
          className="h-4 w-4 accent-cyan-300"
        />
        Create jailed SFTP user
      </label>
      {createSftpUser ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Input name="sftpUsername" placeholder="SFTP username, for example mcfly" />
          <Input name="sftpPassword" type="password" placeholder="SFTP password" />
        </div>
      ) : null}
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
    createSftpUser: formData.get("createSftpUser") === "on",
    sftpUsername: formData.get("sftpUsername") || undefined,
    sftpPassword: formData.get("sftpPassword") || undefined,
  };
}
