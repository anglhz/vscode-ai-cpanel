"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  CirclePower,
  Clock,
  Gauge,
  GripVertical,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  Server,
  Square,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import type { SessionUser } from "@/lib/auth";

type Role = "ADMIN" | "USER" | "STARTUP_USER";
type ServerStatus = "ONLINE" | "OFFLINE" | "STARTING" | "STOPPING" | "RESTARTING" | "UNKNOWN";

type GameServerDto = {
  id: string;
  name: string;
  description: string;
  status: ServerStatus;
  displayOrder: number;
  addressPort: string | null;
  gameVersion: string;
  node: NodeDto | null;
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
  sftpUsername: string | null;
  serverIds: string[];
  teamspeakIds: string[];
};

type NodeDto = {
  id: string;
  name: string;
  baseUrl: string;
  publicIp: string;
  hasApiToken: boolean;
  isLocal: boolean;
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
  channels?: {
    id: string;
    parentId: string;
    order: string;
    name: string;
    clients: {
      name: string;
      score: string;
      ping: string;
    }[];
  }[];
  retrievedAt: number | null;
};

type TeamSpeakServerDto = {
  id: string;
  name: string;
  description: string;
  host: string;
  queryPort: number;
  voicePort: number;
  hasApiKey: boolean;
  hasQueryPassword: boolean;
  queryUsername: string;
  assignedUserIds: string[];
};

type TeamSpeakLiveDto = {
  info: {
    virtualserverName: string;
    welcomeMessage: string;
    clientCount: number;
    maxClients: number;
    uptime: number;
    status: string;
  };
  clients: {
    id: string;
    databaseId: string;
    nickname: string;
    type: string;
    channelId: string;
  }[];
};

type TeamSpeakChannelDto = {
  id: string;
  parentId: string;
  order: string;
  name: string;
  clients: TeamSpeakLiveDto["clients"];
};

type TeamSpeakGroupDto = {
  id: string;
  name: string;
  type: string;
};

type PlayersPanelKind = "game" | "voice";

const statusStyle: Record<ServerStatus, string> = {
  ONLINE: "gp-pill-emerald",
  OFFLINE: "gp-pill-neutral",
  STARTING: "gp-pill-cyan",
  STOPPING: "gp-pill-amber",
  RESTARTING: "gp-pill-violet",
  UNKNOWN: "gp-pill-neutral",
};
const SERVER_PUBLIC_IP = process.env.NEXT_PUBLIC_SERVER_PUBLIC_IP ?? "144.76.41.252";
const SERVER_GAME_OPTIONS = [
  { value: "cod1", label: "Call of Duty", binary: "cod_lnxded" },
  { value: "coduo", label: "Call of Duty: United Offensive", binary: "coduo_lnxded" },
  { value: "cod2", label: "Call of Duty 2", binary: "cod2_lnxded" },
  { value: "cod4", label: "Call of Duty: Modern Warfare", binary: "cod4x18_dedrun" },
  { value: "ts3", label: "TeamSpeak 3", binary: "teamspeak3-server_linux_amd64/ts3server_startscript.sh" },
] as const;
const SERVER_GAME_LABELS: Record<string, string> = Object.fromEntries(
  SERVER_GAME_OPTIONS.map((game) => [game.value, game.label]),
);

export function DashboardShell({ currentUser }: { currentUser: SessionUser }) {
  const [view, setView] = useState<"servers" | "teamspeak" | "users" | "nodes">("servers");
  const [servers, setServers] = useState<GameServerDto[]>([]);
  const [teamspeakServers, setTeamspeakServers] = useState<TeamSpeakServerDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [nodes, setNodes] = useState<NodeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [playerCounts, setPlayerCounts] = useState<Record<string, { count: number; maxClients: number | null }>>({});

  const isAdmin = currentUser.role === "ADMIN";
  const onlineCount = useMemo(
    () => servers.filter((server) => server.status === "ONLINE").length,
    [servers],
  );
  const activePlayerCount = useMemo(
    () => Object.values(playerCounts).reduce((total, players) => total + players.count, 0),
    [playerCounts],
  );

  const loadData = useCallback(async () => {
    const serverResponse = await fetch("/api/servers");
    if (serverResponse.ok) {
      const data = await serverResponse.json();
      setServers(data.servers);
    }

    const teamspeakResponse = await fetch("/api/teamspeak");
    if (teamspeakResponse.ok) {
      const data = await teamspeakResponse.json();
      setTeamspeakServers(data.servers);
    }

    if (isAdmin) {
      const userResponse = await fetch("/api/users");
      if (userResponse.ok) {
        const data = await userResponse.json();
        setUsers(data.users);
      }

      const nodeResponse = await fetch("/api/nodes");
      if (nodeResponse.ok) {
        const data = await nodeResponse.json();
        setNodes(data.nodes);
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
          return [server.id, { count: 0, maxClients: null }] as const;
        }

        const data = (await response.json()) as ServerPlayersDto;
        return [server.id, { count: data.playerCount, maxClients: data.maxClients }] as const;
      }),
    );

    setPlayerCounts(
      Object.fromEntries(
        results.map((result, index) =>
          result.status === "fulfilled"
            ? result.value
            : ([gameServers[index].id, { count: 0, maxClients: null }] as const),
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
    <div className="relative min-h-screen text-gp-ink">
      <div className="gp-ambient" />
      <div className="gp-grid-overlay" />

      <aside
        className={`gp-rail left-3 top-3 bottom-3 lg:flex lg:flex-col lg:px-3 lg:py-4 transition-[width] duration-200 ${
          sidebarCollapsed ? "lg:w-[4.75rem]" : "lg:w-[15rem]"
        }`}
      >
        <div className={`flex items-center gap-2 ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
          <Link href="/dashboard" aria-label="Go to dashboard start" className="min-w-0">
            <Brand collapsed={sidebarCollapsed} />
          </Link>
        </div>

        <nav className={`mt-7 flex flex-col gap-2 ${sidebarCollapsed ? "items-center" : "items-stretch"}`}>
          <NavButton active={view === "servers"} onClick={() => setView("servers")} icon={Server} collapsed={sidebarCollapsed}>
            Servers
          </NavButton>
          <NavButton active={view === "teamspeak"} onClick={() => setView("teamspeak")} icon={Activity} collapsed={sidebarCollapsed}>
            TeamSpeak
          </NavButton>
          {isAdmin ? (
            <NavButton active={view === "users"} onClick={() => setView("users")} icon={Users} collapsed={sidebarCollapsed}>
              Users
            </NavButton>
          ) : null}
          {isAdmin ? (
            <NavButton active={view === "nodes"} onClick={() => setView("nodes")} icon={Server} collapsed={sidebarCollapsed}>
              Nodes
            </NavButton>
          ) : null}
        </nav>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setSidebarCollapsed((value) => !value)}
          className={`gp-nav-item ${sidebarCollapsed ? "mx-auto" : "w-full justify-start gap-3 px-3"}`}
          title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {sidebarCollapsed ? null : <span className="truncate text-[13px] font-medium">Collapse</span>}
        </button>

        <button
          onClick={logout}
          className={`gp-nav-item mt-2 ${sidebarCollapsed ? "mx-auto" : "w-full justify-start gap-3 px-3"}`}
          title="Sign out"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {sidebarCollapsed ? null : <span className="truncate text-[13px] font-medium">Sign out</span>}
        </button>

        <div
          className={`mt-3 flex items-center gap-3 rounded-[15px] border border-white/[0.08] bg-white/[0.04] p-2.5 ${
            sidebarCollapsed ? "justify-center" : ""
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-[11px] font-bold text-white">
            {currentUser.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          {sidebarCollapsed ? null : (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">{currentUser.name}</p>
              <p className="truncate text-[11px] text-gp-mute">{currentUser.role}</p>
            </div>
          )}
        </div>
      </aside>

      <main
        className={`relative z-10 pb-28 transition-[padding] duration-200 lg:pb-8 ${
          sidebarCollapsed ? "lg:pl-[6.5rem]" : "lg:pl-[16.75rem]"
        }`}
      >
        <header className="px-4 pt-4 sm:px-6 lg:px-7">
          <div className="gp-card gp-rise flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {/* The rail carries the mark from lg up; show it inline below that. */}
              <BrandLogo size="sm" className="lg:hidden" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-200/80">
                  <Greeting name={currentUser.name} />
                </p>
                <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">
                  {view === "users" ? "User Access" : view === "nodes" ? "Server Nodes" : view === "teamspeak" ? "TeamSpeak" : "Server Control"}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Stat label="Servers" value={servers.length} />
              <Stat label="Online" value={onlineCount} />
              <span className="gp-pill gp-pill-blue">{currentUser.role}</span>
              <LiveClock />
            </div>
          </div>
        </header>

        <section className="px-4 py-6 sm:px-6 lg:px-7">
          {view === "servers" ? (
            <ServerOverview
              currentUser={currentUser}
              servers={servers}
              onlineCount={onlineCount}
              activePlayerCount={activePlayerCount}
            />
          ) : null}

          {loading ? (
            <div className="gp-card flex items-center gap-3 p-6 text-gp-dim">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading panel...
            </div>
          ) : view === "teamspeak" ? (
            <TeamSpeakPanel
              isAdmin={isAdmin}
              servers={teamspeakServers}
              users={users}
              reload={loadData}
              setMessage={setMessage}
            />
          ) : view === "nodes" && isAdmin ? (
            <NodesPanel nodes={nodes} reload={loadData} setMessage={setMessage} />
          ) : view === "users" && isAdmin ? (
            <UsersPanel users={users} servers={servers} teamspeakServers={teamspeakServers} reload={loadData} setMessage={setMessage} />
          ) : (
            <ServersPanel
              isAdmin={isAdmin}
              currentUser={currentUser}
              servers={servers}
              users={users}
              nodes={nodes}
              playerCounts={playerCounts}
              reload={loadData}
              setMessage={setMessage}
            />
          )}
        </section>
      </main>

      <nav className="fixed bottom-3 left-3 right-3 z-30 grid grid-cols-4 gap-1 rounded-[22px] border border-white/[0.08] bg-[#070b14]/95 p-1.5 shadow-[0_26px_60px_-28px_rgba(0,0,0,1)] backdrop-blur-xl lg:hidden">
        <MobileButton active={view === "servers"} onClick={() => setView("servers")} icon={LayoutDashboard}>
          Servers
        </MobileButton>
        <MobileButton active={view === "teamspeak"} onClick={() => setView("teamspeak")} icon={Activity}>
          TS3
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
        <div className="gp-toast gp-rise fixed bottom-24 right-4 z-50 w-[min(calc(100vw-2rem),380px)] p-4 text-sm text-white lg:bottom-6 lg:right-6">
          <div className="flex items-start gap-3">
            <span className="gp-dot gp-dot-online mt-1.5" />
            <p className="min-w-0 flex-1 leading-5">{message}</p>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="gp-icon-btn h-7 w-7 shrink-0"
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
  const onlineRatio = servers.length > 0 ? onlineCount / servers.length : 0;

  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-3">
      <div className="gp-card gp-rise p-5 sm:p-6 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="gp-eyebrow">Intuitive Gamepanel</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">
              Server Command Center
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gp-dim">
              Manage assigned game and voice servers, startup arguments, and live service actions from one panel.
            </p>
          </div>
          <span className="gp-pill gp-pill-blue">{currentUser.role}</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <OverviewStat icon={Server} label="Servers" value={servers.length} tone="blue" />
          <OverviewStat icon={Activity} label="Online" value={onlineCount} tone="emerald" />
          <OverviewStat icon={Gauge} label="Offline" value={offlineCount} tone="amber" />
          <OverviewStat icon={Users} label="Active players" value={activePlayerCount} tone="violet" />
        </div>
      </div>

      <div className="grid gap-4">
        <div className="gp-card gp-rise p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="gp-title">Service health</p>
            <span className="gp-pill gp-pill-neutral">Live</span>
          </div>
          <div className="mt-5 flex items-center gap-5">
            <Ring value={onlineRatio} label="Online" />
            <div className="min-w-0 flex-1 space-y-3">
              <Meter label="Online" value={onlineCount} max={servers.length} tone="emerald" />
              <Meter label="Offline" value={offlineCount} max={servers.length} tone="amber" />
            </div>
          </div>
        </div>

        <div className="gp-card gp-rise p-5">
          <p className="gp-title">Operations</p>
          <div className="mt-4 space-y-2">
            <MiniMetric label="Control mode" value="systemd" />
            <MiniMetric label="Access" value={currentUser.role === "ADMIN" ? "All servers" : "Assigned only"} />
            <MiniMetric
              label="Startup edits"
              value={currentUser.role === "ADMIN" || currentUser.role === "STARTUP_USER" ? "Full command" : "Arguments only"}
            />
          </div>
        </div>
      </div>
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
  tone: "blue" | "emerald" | "amber" | "violet";
}) {
  const tones = {
    blue: "gp-icon-tile-blue",
    emerald: "gp-icon-tile-emerald",
    amber: "gp-icon-tile-amber",
    violet: "gp-icon-tile-violet",
  };

  return (
    <div className="gp-inset gp-interactive p-4">
      <span className={`gp-icon-tile h-9 w-9 rounded-xl ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-0.5 truncate text-xs text-gp-dim">{label}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
      <span className="truncate text-xs text-gp-dim">{label}</span>
      <span className="truncate text-xs font-semibold text-white">{value}</span>
    </div>
  );
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandLogo size="md" />
      <div className={collapsed ? "hidden" : "min-w-0"}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200/70">Intuitive</p>
        <p className="truncate text-[15px] font-semibold tracking-tight text-white">Gamepanel</p>
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
      className={`gp-nav-item ${collapsed ? "" : "w-full justify-start gap-3 px-3"} ${
        active ? "gp-nav-item-active" : ""
      }`}
      title={collapsed ? String(children) : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {collapsed ? null : <span className="truncate text-[13px] font-medium">{children}</span>}
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
      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition ${
        active
          ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-[0_12px_28px_-14px_rgba(59,130,246,.95)]"
          : "text-gp-dim"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="gp-pill gp-pill-neutral">
      <span className="text-gp-mute">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </span>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const gradientId = `gp-ring-${useId().replace(/:/g, "")}`;
  const size = 108;
  const stroke = 10;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,.09)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,.68,0,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tracking-tight text-white">
          {Math.round(clamped * 100)}%
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gp-mute">{label}</span>
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  max,
  tone = "blue",
}: {
  label: string;
  value: number;
  max: number;
  tone?: "blue" | "emerald" | "amber";
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fills = {
    blue: "linear-gradient(90deg,#22d3ee,#3b82f6)",
    emerald: "linear-gradient(90deg,#34d399,#10b981)",
    amber: "linear-gradient(90deg,#fbbf24,#fb923c)",
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="truncate text-gp-mute">{label}</span>
        <span className="font-semibold text-white">{value}</span>
      </div>
      <div className="gp-meter mt-1.5">
        <div className="gp-meter-fill" style={{ width: `${percent}%`, backgroundImage: fills[tone] }} />
      </div>
    </div>
  );
}

function Greeting({ name }: { name: string }) {
  const [label, setLabel] = useState("Welcome back");

  useEffect(() => {
    function update() {
      const hour = new Date().getHours();
      setLabel(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
    }

    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <>
      {label}, <span className="font-medium text-white/90">{name}</span>
    </>
  );
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <span className="gp-pill gp-pill-neutral">
      <Clock className="h-3.5 w-3.5" />
      {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
    </span>
  );
}

function ServersPanel({
  isAdmin,
  currentUser,
  servers,
  users,
  nodes,
  playerCounts,
  reload,
  setMessage,
}: {
  isAdmin: boolean;
  currentUser: SessionUser;
  servers: GameServerDto[];
  users: UserDto[];
  nodes: NodeDto[];
  playerCounts: Record<string, { count: number; maxClients: number | null }>;
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [orderedServers, setOrderedServers] = useState(servers);
  const [draggedServerId, setDraggedServerId] = useState("");
  const [draggedGameKey, setDraggedGameKey] = useState("");
  const [updatingCodbaseLinks, setUpdatingCodbaseLinks] = useState(false);
  const [collapsedGames, setCollapsedGames] = useState<Record<string, boolean>>({});
  const groupedServers = useMemo(() => groupServersByGame(orderedServers), [orderedServers]);
  const canUpdateCodbaseLinks = isMcflySessionUser(currentUser);
  const canEditFullStartup = currentUser.role === "ADMIN" || currentUser.role === "STARTUP_USER";

  useEffect(() => {
    const timer = window.setTimeout(() => setOrderedServers(servers), 0);
    return () => window.clearTimeout(timer);
  }, [servers]);

  async function saveOrder(nextServers: GameServerDto[]) {
    const response = await fetch("/api/servers/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverIds: nextServers.map((server) => server.id) }),
    });

    if (response.ok) {
      setMessage("Server order updated.");
      await reload();
    } else {
      setMessage("Could not update server order.");
      setOrderedServers(servers);
    }
  }

  function moveDraggedServer(targetServerId: string) {
    if (!draggedServerId || draggedServerId === targetServerId) {
      return;
    }

    const fromIndex = orderedServers.findIndex((server) => server.id === draggedServerId);
    const toIndex = orderedServers.findIndex((server) => server.id === targetServerId);

    if (fromIndex < 0 || toIndex < 0 || getServerGame(orderedServers[fromIndex]) !== getServerGame(orderedServers[toIndex])) {
      return;
    }

    const nextServers = [...orderedServers];
    const [movedServer] = nextServers.splice(fromIndex, 1);
    nextServers.splice(toIndex, 0, movedServer);
    setOrderedServers(nextServers);
    void saveOrder(nextServers);
  }

  function moveDraggedGroup(targetGameKey: string) {
    if (!draggedGameKey || draggedGameKey === targetGameKey) {
      return;
    }

    const fromIndex = groupedServers.findIndex((group) => group.gameKey === draggedGameKey);
    const toIndex = groupedServers.findIndex((group) => group.gameKey === targetGameKey);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const nextGroups = [...groupedServers];
    const [movedGroup] = nextGroups.splice(fromIndex, 1);
    nextGroups.splice(toIndex, 0, movedGroup);

    const nextServers = nextGroups.flatMap((group) => group.servers);
    setOrderedServers(nextServers);
    void saveOrder(nextServers);
  }

  async function updateCodbaseLinks() {
    setUpdatingCodbaseLinks(true);
    const response = await fetch("/api/servers/codbase/update-links", { method: "POST" });
    setUpdatingCodbaseLinks(false);
    const data = (await response.json().catch(() => null)) as { error?: string; updated?: number } | null;

    if (response.ok) {
      setMessage(`CoDBase links updated for ${data?.updated ?? 0} servers.`);
    } else {
      setMessage(data?.error ?? "Could not update CoDBase links.");
    }
  }

  return (
    <div className="space-y-6">
      {isAdmin ? <ServerForm users={users} nodes={nodes} reload={reload} setMessage={setMessage} /> : null}
      {canUpdateCodbaseLinks ? (
        <section className="gp-card gp-rise p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="gp-title">CoDBase linked files</p>
              <p className="mt-1 text-sm text-gp-dim">
                Sync new files from CoDBase #1 into match servers without replacing per-server configs.
              </p>
            </div>
            <button
              type="button"
              onClick={updateCodbaseLinks}
              disabled={updatingCodbaseLinks}
              className="gp-btn gp-btn-ghost"
            >
              <RefreshCw className={`h-4 w-4 ${updatingCodbaseLinks ? "animate-spin" : ""}`} />
              Update CoDBase links
            </button>
          </div>
        </section>
      ) : null}
      <div className="gp-card gp-rise overflow-hidden">
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(120px,0.7fr)_minmax(230px,0.9fr)] items-center border-b border-white/[0.08] bg-white/[0.03] px-4 py-3 lg:grid">
          <span className="gp-eyebrow">Server name</span>
          <span className="gp-eyebrow">Address</span>
          <span className="gp-eyebrow text-right">Operations</span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {groupedServers.map((group) => (
            <GameServerGroup
              key={group.gameKey}
              group={group}
              collapsed={Boolean(collapsedGames[group.gameKey])}
              dragging={draggedGameKey === group.gameKey}
              draggedServerId={draggedServerId}
              playerCounts={playerCounts}
              isAdmin={isAdmin}
              canEditFullStartup={canEditFullStartup}
              reload={reload}
              setMessage={setMessage}
              onToggle={() =>
                setCollapsedGames((current) => ({
                  ...current,
                  [group.gameKey]: !current[group.gameKey],
                }))
              }
              onGroupDragStart={() => setDraggedGameKey(group.gameKey)}
              onGroupDragEnd={() => setDraggedGameKey("")}
              onGroupDrop={() => moveDraggedGroup(group.gameKey)}
              onServerDragStart={(serverId) => setDraggedServerId(serverId)}
              onServerDragEnd={() => setDraggedServerId("")}
              onServerDrop={moveDraggedServer}
            />
          ))}
        </div>
      </div>
      {servers.length === 0 ? (
        <div className="gp-card p-6 text-gp-dim">No servers are assigned to this account.</div>
      ) : null}
    </div>
  );
}

function GameServerGroup({
  group,
  collapsed,
  dragging,
  draggedServerId,
  playerCounts,
  isAdmin,
  canEditFullStartup,
  reload,
  setMessage,
  onToggle,
  onGroupDragStart,
  onGroupDragEnd,
  onGroupDrop,
  onServerDragStart,
  onServerDragEnd,
  onServerDrop,
}: {
  group: ReturnType<typeof groupServersByGame>[number];
  collapsed: boolean;
  dragging: boolean;
  draggedServerId: string;
  playerCounts: Record<string, { count: number; maxClients: number | null }>;
  isAdmin: boolean;
  canEditFullStartup: boolean;
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
  onToggle: () => void;
  onGroupDragStart: () => void;
  onGroupDragEnd: () => void;
  onGroupDrop: () => void;
  onServerDragStart: (serverId: string) => void;
  onServerDragEnd: () => void;
  onServerDrop: (serverId: string) => void;
}) {
  return (
    <section
      className={`transition ${dragging ? "opacity-60" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onGroupDrop();
      }}
    >
      <div
        className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 border-b border-white/[0.08] bg-white/[0.035] px-4 py-4"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          onGroupDragStart();
        }}
        onDragEnd={onGroupDragEnd}
      >
        <span
          className="gp-icon-btn hidden cursor-grab lg:flex active:cursor-grabbing"
          title="Drag game group to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-center justify-center gap-4 text-center"
        >
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold uppercase tracking-[0.18em] text-blue-100">
              {group.label}
            </h2>
            <p className="mt-1 text-xs text-gp-mute">
              {group.servers.length} {group.servers.length === 1 ? "server" : "servers"}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="gp-icon-btn justify-self-end"
          aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
        >
          <ChevronDown className={`h-5 w-5 transition ${collapsed ? "-rotate-90" : ""}`} />
        </button>
      </div>
      {!collapsed ? (
        <div className="divide-y divide-white/[0.06]">
          {group.servers.map((server) => (
            <section
              key={server.id}
              className="contents"
            >
              <ServerRow
                server={server}
                playerSummary={playerCounts[server.id]}
                isAdmin={isAdmin}
                canEditFullStartup={canEditFullStartup}
                reload={reload}
                setMessage={setMessage}
                draggable
                dragging={draggedServerId === server.id}
                onDragStart={() => onServerDragStart(server.id)}
                onDragEnd={onServerDragEnd}
                onDropOnRow={() => onServerDrop(server.id)}
              />
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ServerRow({
  server,
  playerSummary,
  isAdmin,
  canEditFullStartup,
  reload,
  setMessage,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOnRow,
}: {
  server: GameServerDto;
  playerSummary?: { count: number; maxClients: number | null };
  isAdmin: boolean;
  canEditFullStartup: boolean;
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnRow: () => void;
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
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setPlayers(null);
      setPlayersError(data?.error ?? "Could not load player data.");
      return;
    }

    setPlayers(await response.json());
  }

  const address = getServerAddress(server);
  const isOffline = server.status === "OFFLINE" || server.status === "UNKNOWN";
  const rowPlayerSummary = players
    ? { count: players.playerCount, maxClients: players.maxClients }
    : playerSummary;
  const playerSummaryLabel = formatPlayerSummary(rowPlayerSummary);
  const versionLabel = server.gameVersion ? `v${server.gameVersion}` : "";

  return (
    <details
      className={`group transition open:bg-white/[0.02] ${dragging ? "opacity-50" : ""}`}
      draggable={draggable}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (draggable) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onDropOnRow();
      }}
      onToggle={(event) => {
        if (event.currentTarget.open && !players && !playersLoading) {
          void loadPlayers();
        }
      }}
    >
      <summary className="grid list-none cursor-pointer gap-3 px-4 py-3.5 transition hover:bg-white/[0.035] [&::-webkit-details-marker]:hidden lg:grid-cols-[minmax(220px,1.4fr)_minmax(120px,0.7fr)_minmax(230px,0.9fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {draggable ? (
            <span className="gp-icon-btn hidden cursor-grab lg:flex active:cursor-grabbing" title="Drag to reorder">
              <GripVertical className="h-4 w-4" />
            </span>
          ) : null}
          <ChevronDown className="h-4 w-4 shrink-0 text-gp-mute transition group-open:rotate-180" />
          <span className={`gp-dot ${server.status === "ONLINE" ? "gp-dot-online" : "gp-dot-idle"}`} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-white">{server.name}</h2>
              <span className={`gp-pill ${statusStyle[server.status]}`}>{server.status}</span>
              {playerSummaryLabel ? (
                <span className="gp-pill gp-pill-neutral font-mono">
                  <Users className="h-3 w-3" />
                  {playerSummaryLabel}
                </span>
              ) : null}
              {versionLabel ? (
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-200/70">
                  {versionLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs text-gp-mute lg:hidden">{server.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-7 lg:pl-0">
          <span className="gp-pill gp-pill-cyan font-mono">{address}</span>
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

      <div className="grid gap-5 border-t border-white/[0.08] bg-black/20 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <div className="space-y-4">
          <div className="gp-inset p-4">
            <p className="gp-eyebrow">Description</p>
            <p className="mt-1.5 text-sm leading-6 text-gp-dim">{server.description}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton onClick={refreshStatus} disabled={Boolean(busy)} icon={RefreshCw}>
              Refresh status
            </ActionButton>
            <span className="gp-inset flex items-center px-3 py-2 text-xs text-gp-dim">
              {isAdmin && server.systemdServiceName ? server.systemdServiceName : "Assigned server"}
            </span>
          </div>
          <PlayersPanel
            players={players}
            loading={playersLoading}
            error={playersError}
            onRefresh={loadPlayers}
            kind={isVoiceGameServer(server) ? "voice" : "game"}
          />
          <ServerConsole server={server} setMessage={setMessage} />
        </div>
        <ServerConfigEditor
          server={server}
          isAdmin={isAdmin}
          canEditFullStartup={canEditFullStartup}
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
  kind,
}: {
  players: ServerPlayersDto | null;
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
  kind: PlayersPanelKind;
}) {
  const maxClients = players?.maxClients ? `/${players.maxClients}` : "";
  const isVoice = kind === "voice" || players?.gameType === "ts3";
  const onlineLabel = isVoice ? "Clients online" : "Players online";

  return (
    <section className="gp-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="gp-eyebrow">{onlineLabel}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p className="text-2xl font-semibold tracking-tight text-white">
              {players ? `${players.playerCount}${maxClients}` : loading ? "Loading..." : "0"}
            </p>
            {players?.mapName ? <span className="gp-pill gp-pill-cyan">{players.mapName}</span> : null}
            {players?.gameType ? (
              <span className="gp-pill gp-pill-neutral uppercase">{players.gameType}</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          className="gp-btn gp-btn-ghost h-9"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {isVoice ? "Refresh clients" : "Refresh players"}
        </button>
      </div>

      {players && players.maxClients ? (
        <div className="mt-4">
          <Meter label="Occupancy" value={players.playerCount} max={players.maxClients} />
        </div>
      ) : null}

      {players?.hostname ? (
        <p className="mt-3 truncate text-xs text-gp-mute">{stripCodColors(players.hostname)}</p>
      ) : null}

      {isVoice ? <TeamSpeakExternalViewer /> : null}

      {error ? <p className="gp-pill gp-pill-red mt-3 w-full justify-center py-2">{error}</p> : null}

      {!isVoice && players && players.players.length > 0 ? (
        <div className="gp-inset mt-4 overflow-hidden">
          <div className="grid grid-cols-[1fr_72px_72px] border-b border-white/[0.07] bg-white/[0.03] px-3 py-2">
            <span className="gp-eyebrow">Name</span>
            <span className="gp-eyebrow text-right">Score</span>
            <span className="gp-eyebrow text-right">Ping</span>
          </div>
          <div className="gp-scroll max-h-72 divide-y divide-white/[0.05] overflow-y-auto">
            {players.players.map((player, index) => (
              <div
                key={`${player.name}-${index}`}
                className="grid grid-cols-[1fr_72px_72px] px-3 py-2 text-sm text-neutral-200 transition hover:bg-white/[0.03]"
              >
                <span className="truncate">{stripCodColors(player.name)}</span>
                <span className="text-right font-mono text-xs text-gp-dim">{player.score}</span>
                <span className="text-right font-mono text-xs text-gp-dim">{player.ping}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {players && players.players.length === 0 && !isVoice ? (
        <p className="gp-inset mt-4 px-3 py-2 text-sm text-gp-dim">No players online right now.</p>
      ) : null}
    </section>
  );
}

function TeamSpeakExternalViewer() {
  useEffect(() => {
    const viewerUrl =
      "https://www.tsviewer.com/ts3viewer.php?ID=1131191&text=757575&text_size=12&text_family=1&text_s_color=ffffff&text_s_weight=normal&text_s_style=normal&text_s_variant=normal&text_s_decoration=none&text_i_color=&text_i_weight=normal&text_i_style=normal&text_i_variant=normal&text_i_decoration=none&text_c_color=&text_c_weight=normal&text_c_style=normal&text_c_variant=normal&text_c_decoration=none&text_u_color=ffffff&text_u_weight=normal&text_u_style=normal&text_u_variant=normal&text_u_decoration=none&text_s_color_h=&text_s_weight_h=bold&text_s_style_h=normal&text_s_variant_h=normal&text_s_decoration_h=none&text_i_color_h=000000&text_i_weight_h=bold&text_i_style_h=normal&text_i_variant_h=normal&text_i_decoration_h=none&text_c_color_h=&text_c_weight_h=normal&text_c_style_h=normal&text_c_variant_h=normal&text_c_decoration_h=none&text_u_color_h=&text_u_weight_h=bold&text_u_style_h=normal&text_u_variant_h=normal&text_u_decoration_h=none&iconset=default_colored_2014_tsv";

    function initViewer() {
      const display = (window as Window & { ts3v_display?: { init: (url: string, id: number, height: number) => void } })
        .ts3v_display;
      display?.init(viewerUrl, 1131191, 100);
    }

    if (document.querySelector('script[src="https://static.tsviewer.com/short_expire/js/ts3viewer_loader.js"]')) {
      initViewer();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://static.tsviewer.com/short_expire/js/ts3viewer_loader.js";
    script.async = true;
    script.onload = initViewer;
    document.body.appendChild(script);
  }, []);

  return (
    <div className="gp-inset mt-4 p-3">
      <div id="ts3viewer_1131191" />
    </div>
  );
}

function ServerConsole({
  server,
  setMessage,
}: {
  server: GameServerDto;
  setMessage: (message: string) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [rconBusy, setRconBusy] = useState(false);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const isVoiceServer = isVoiceGameServer(server);

  useEffect(() => {
    const consoleElement = consoleRef.current;

    if (consoleElement) {
      consoleElement.scrollTop = consoleElement.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    if (!connected) {
      return;
    }

    const events = new EventSource(`/api/servers/${server.id}/logs`);

    events.addEventListener("log", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { line?: string };
      if (data.line) {
        setLines((current) => [...current.slice(-299), data.line as string]);
      }
    });

    events.addEventListener("console-error", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { message?: string };
      setError(data.message ?? "Console stream failed.");
    });

    events.addEventListener("close", () => {
      setConnected(false);
    });

    events.onerror = () => {
      setError("Console stream disconnected.");
      setConnected(false);
      events.close();
    };

    return () => {
      events.close();
    };
  }, [connected, server.id]);

  async function sendRconCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = command.trim();

    if (!trimmed) {
      return;
    }

    setRconBusy(true);
    const response = await fetch(`/api/servers/${server.id}/rcon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: trimmed }),
    });
    const data = (await response.json().catch(() => null)) as { output?: string; error?: string } | null;
    setRconBusy(false);

    if (!response.ok) {
      const message = data?.error ?? "Could not send RCON command.";
      setError(message);
      setMessage(message);
      return;
    }

    setLines((current) => [
      ...current.slice(-294),
      `> ${trimmed}`,
      ...(data?.output ? data.output.split(/\r?\n/).filter(Boolean) : ["RCON command sent."]),
    ]);
    setCommand("");
  }

  return (
    <section className="gp-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`gp-dot ${connected ? "gp-dot-online" : "gp-dot-idle"}`} />
          <div>
            <p className="gp-title">Live console</p>
            <p className="mt-0.5 text-xs text-gp-mute">
              {connected ? "Streaming systemd logs" : "Last 200 lines when connected"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setLines([]);
              setError("");
              setConnected((current) => !current);
            }}
            className={`gp-btn h-9 ${connected ? "gp-btn-danger" : "gp-btn-success"}`}
          >
            {connected ? "Disconnect" : "Connect"}
          </button>
          <button type="button" onClick={() => setLines([])} className="gp-btn gp-btn-ghost h-9">
            Clear
          </button>
        </div>
      </div>

      <div
        ref={consoleRef}
        className="gp-scroll max-h-80 min-h-48 overflow-y-auto bg-black/40 p-3 font-mono text-xs leading-5 text-neutral-300"
      >
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <p key={`${line}-${index}`} className="whitespace-pre-wrap break-words">
              {line}
            </p>
          ))
        ) : (
          <p className="text-gp-mute">Connect to view live service logs.</p>
        )}
      </div>

      {error ? <p className="border-t border-white/[0.08] px-4 py-2 text-xs text-red-300">{error}</p> : null}

      {!isVoiceServer ? (
        <form onSubmit={sendRconCommand} className="flex flex-col gap-2 border-t border-white/[0.08] p-3 sm:flex-row">
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            maxLength={200}
            className="gp-input flex-1 font-mono"
            placeholder="RCON command, for example: status"
          />
          <button type="submit" disabled={rconBusy || !command.trim()} className="gp-btn gp-btn-primary">
            <Send className="h-4 w-4" />
            Send
          </button>
        </form>
      ) : (
        <p className="border-t border-white/[0.08] px-4 py-3 text-sm text-gp-dim">
          TeamSpeak commands are managed from the TeamSpeak page.
        </p>
      )}
    </section>
  );
}

function ServerConfigEditor({
  server,
  isAdmin,
  canEditFullStartup,
  reload,
  setMessage,
}: {
  server: GameServerDto;
  isAdmin: boolean;
  canEditFullStartup: boolean;
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const isVoiceServer = isVoiceGameServer(server);
  const canUpgradeCod16 = canEditFullStartup && !isVoiceServer && getServerGame(server) === "cod1";
  const isCod16 = canUpgradeCod16 && server.gameVersion === "1.6";

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
      : canEditFullStartup
        ? {
            name: formData.get("name"),
            description: formData.get("description"),
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

  async function upgradeCod16() {
    if (!window.confirm(`Upgrade ${server.name} to CoD1 1.6X startup? The server will not restart automatically.`)) {
      return;
    }

    const response = await fetch(`/api/servers/${server.id}/cod16-upgrade`, { method: "POST" });
    const data = (await response.json().catch(() => null)) as { error?: string; runtimeDirectory?: string } | null;

    if (response.ok) {
      setMessage(data?.runtimeDirectory ? `CoD1 1.6X startup enabled at ${data.runtimeDirectory}.` : "CoD1 1.6X startup enabled.");
      await reload();
    } else {
      setMessage(data?.error ?? "Could not upgrade CoD1 server to 1.6X.");
    }
  }

  async function downgradeCod16() {
    if (!window.confirm(`Downgrade ${server.name} back to CoD1 v1.5 startup? The server will not restart automatically.`)) {
      return;
    }

    const response = await fetch(`/api/servers/${server.id}/cod16-downgrade`, { method: "POST" });
    const data = (await response.json().catch(() => null)) as { error?: string; serverDirectory?: string } | null;

    if (response.ok) {
      setMessage(data?.serverDirectory ? `CoD1 v1.5 startup restored at ${data.serverDirectory}.` : "CoD1 v1.5 startup restored.");
      await reload();
    } else {
      setMessage(data?.error ?? "Could not downgrade CoD1 server to v1.5.");
    }
  }

  return (
    <section className="gp-card overflow-hidden">
      <div className="border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <p className="gp-title">Startup configuration</p>
      </div>
      <form onSubmit={submit} className="space-y-3 p-4">
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
        {canEditFullStartup && !isVoiceServer ? (
          <label className="block">
            <span className="gp-eyebrow mb-2 block">ExecStart</span>
            <textarea
              name="execStart"
              required
              rows={4}
              defaultValue={server.execStart}
              className="gp-textarea font-mono text-xs"
              placeholder="/opt/game-servers/server-1/server_binary +set net_port 28960"
            />
          </label>
        ) : !canEditFullStartup && !isVoiceServer ? (
          <>
            <label className="block">
              <span className="gp-eyebrow mb-2 block">+set fs_game</span>
              <input
                name="fsGame"
                defaultValue={server.startupSettings.fsGame}
                className="gp-input font-mono text-xs"
                placeholder=""
              />
            </label>
            <label className="block">
              <span className="gp-eyebrow mb-2 block">+set sv_punkbuster</span>
              <select
                name="punkbuster"
                defaultValue={server.startupSettings.punkbuster ? "true" : "false"}
                className="gp-select"
              >
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </label>
            <label className="block">
              <span className="gp-eyebrow mb-2 block">+exec</span>
              <input
                name="configFile"
                defaultValue={server.startupSettings.configFile}
                className="gp-input font-mono text-xs"
                placeholder="server_config.cfg"
              />
            </label>
            <label className="block">
              <span className="gp-eyebrow mb-2 block">rconpassword</span>
              <input
                name="rconPassword"
                type="password"
                defaultValue={server.startupSettings.rconPassword}
                className="gp-input font-mono text-xs"
                placeholder="RCON password"
              />
            </label>
            <label className="block">
              <span className="gp-eyebrow mb-2 block">Extra parameters</span>
              <textarea
                name="extraParameters"
                rows={3}
                defaultValue={server.startupSettings.extraParameters}
                className="gp-textarea font-mono text-xs"
                placeholder=""
              />
            </label>
          </>
        ) : isVoiceServer ? (
          <p className="gp-inset px-3 py-2 text-sm text-gp-dim">
            TeamSpeak servers do not use editable game startup arguments in this panel.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="gp-btn gp-btn-primary">Save configuration</button>
          {isAdmin ? (
            <button type="button" onClick={deleteServer} className="gp-btn gp-btn-danger">
              <Trash2 className="h-4 w-4" />
              Delete server
            </button>
          ) : null}
          {canUpgradeCod16 ? (
            <button
              type="button"
              onClick={isCod16 ? downgradeCod16 : upgradeCod16}
              className={`gp-btn ${isCod16 ? "gp-btn-warn" : "gp-btn-success"}`}
            >
              {isCod16 ? "Downgrade to v1.5" : "Upgrade to v1.6"}
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
    neutral: "gp-btn-ghost",
    start: "gp-btn-success",
    restart: "gp-btn-warn",
    stop: "gp-btn-danger",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`gp-btn w-full min-w-0 ${tones[tone]} ${className}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}

function getServerAddress(server: GameServerDto) {
  const port =
    server.addressPort ??
    server.execStart.match(/\+set\s+net_port\s+(\d+)/)?.[1] ??
    server.execStart.match(/default_voice_port=(\d+)/)?.[1];
  const ip = server.node?.publicIp || SERVER_PUBLIC_IP;

  return port ? `${ip}:${port}` : "Port unknown";
}

function stripCodColors(value: string) {
  return value.replace(/\^[0-9]/g, "");
}

function formatPlayerSummary(summary?: { count: number; maxClients: number | null }) {
  if (!summary) {
    return "";
  }

  return summary.maxClients ? `${summary.count}/${summary.maxClients}` : String(summary.count);
}

function isMcflySessionUser(user: SessionUser) {
  const normalizedName = user.name.trim().toLowerCase();
  const emailLocalPart = user.email.split("@")[0]?.trim().toLowerCase();

  return normalizedName === "mcfly" || emailLocalPart === "mcfly";
}

function getServerGame(server: GameServerDto) {
  const serviceGame = server.systemdServiceName?.match(/^([a-zA-Z0-9_-]+)-\d+\.service$/)?.[1];
  const pathGame = server.execStart.match(/\/(cod1|coduo|cod2|cod4|ts3)\//)?.[1];

  return serviceGame ?? pathGame ?? "other";
}

function getServerGameLabel(gameKey: string) {
  return SERVER_GAME_LABELS[gameKey] ?? "Other servers";
}

function groupServersByGame(servers: GameServerDto[]) {
  const groups = new Map<string, GameServerDto[]>();

  for (const server of servers) {
    const gameKey = getServerGame(server);
    groups.set(gameKey, [...(groups.get(gameKey) ?? []), server]);
  }

  return Array.from(groups.entries()).map(([gameKey, groupServers]) => ({
    gameKey,
    label: getServerGameLabel(gameKey),
    servers: groupServers,
  }));
}

function isVoiceGameServer(server: GameServerDto) {
  return getServerGame(server) === "ts3";
}

function isQueryableGameServer(server: GameServerDto) {
  return !isVoiceGameServer(server) && Boolean(server.addressPort ?? server.execStart.match(/\+set\s+net_port\s+\d+/));
}

function ServerForm({
  users,
  nodes,
  reload,
  setMessage,
}: {
  users: UserDto[];
  nodes: NodeDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [selectedGame, setSelectedGame] = useState<(typeof SERVER_GAME_OPTIONS)[number]["value"]>("cod1");
  const [open, setOpen] = useState(false);
  const selectedGameOption = SERVER_GAME_OPTIONS.find((game) => game.value === selectedGame) ?? SERVER_GAME_OPTIONS[0];
  const isTeamspeak = selectedGame === "ts3";
  const ownerUsers = users.filter((user) => user.sftpUsername);

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
        ownerUserId: formData.get("ownerUserId"),
        nodeId: formData.get("nodeId"),
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
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not create server.");
    }
  }

  return (
    <section className="gp-card gp-rise p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="gp-title">Servers</p>
          <p className="mt-1 text-sm text-gp-dim">Create a new game or voice service when needed.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="gp-btn gp-btn-primary">
          <Plus className="h-4 w-4" />
          Add server
        </button>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-4 border-t border-white/[0.08] pt-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_180px_180px_120px]">
            <Input name="name" placeholder="Server name" />
            <Input name="description" placeholder="Description" />
            <select
              name="nodeId"
              required
              defaultValue={nodes.find((node) => node.isLocal)?.id ?? nodes[0]?.id ?? ""}
              className="gp-select"
            >
              <option value="">Machine</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
            <select name="ownerUserId" required className="gp-select">
              <option value="">User</option>
              {ownerUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.sftpUsername})
                </option>
              ))}
            </select>
            <select
              name="game"
              value={selectedGame}
              onChange={(event) => setSelectedGame(event.target.value as typeof selectedGame)}
              className="gp-select"
            >
              {SERVER_GAME_OPTIONS.map((game) => (
                <option key={game.value} value={game.value}>
                  {game.label}
                </option>
              ))}
            </select>
            <Input name="port" type="number" placeholder="28960" />
          </div>
          {ownerUsers.length === 0 ? (
            <p className="gp-pill gp-pill-amber mt-3 w-full justify-center py-2">
              Create or edit a user with an SFTP username before adding servers.
            </p>
          ) : null}
          <div className={`mt-5 grid gap-4 ${isTeamspeak ? "sm:grid-cols-1 lg:max-w-xs" : "sm:grid-cols-2 lg:max-w-xl"}`}>
            {!isTeamspeak ? (
              <label className="block">
                <span className="gp-eyebrow mb-2 block">Max clients</span>
                <Input name="maxClients" type="number" placeholder="12" defaultValue={12} />
              </label>
            ) : (
              <input type="hidden" name="maxClients" value="32" />
            )}
            {!isTeamspeak ? (
              <label className="block">
                <span className="gp-eyebrow mb-2 block">Binary</span>
                <Input name="binaryName" placeholder={selectedGameOption.binary} defaultValue={selectedGameOption.binary} key={selectedGame} />
              </label>
            ) : (
              <input type="hidden" name="binaryName" value={selectedGameOption.binary} />
            )}
          </div>
          {isTeamspeak ? (
            <p className="mt-3 text-sm text-gp-dim">
              TeamSpeak uses the bundled start script automatically, so no startup binary is needed here.
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="gp-btn gp-btn-primary">
              <Plus className="h-4 w-4" />
              Create server
            </button>
            <button type="button" onClick={() => setOpen(false)} className="gp-btn gp-btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function TeamSpeakPanel({
  isAdmin,
  servers,
  users,
  reload,
  setMessage,
}: {
  isAdmin: boolean;
  servers: TeamSpeakServerDto[];
  users: UserDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  return (
    <div className="space-y-6">
      {isAdmin ? <TeamSpeakForm users={users} reload={reload} setMessage={setMessage} /> : null}
      <div className="grid gap-4">
        {servers.map((server) => (
          <TeamSpeakCard
            key={server.id}
            isAdmin={isAdmin}
            server={server}
            users={users}
            reload={reload}
            setMessage={setMessage}
          />
        ))}
      </div>
      {servers.length === 0 ? (
        <div className="gp-card p-6 text-gp-dim">
          No TeamSpeak servers are assigned to this account.
        </div>
      ) : null}
    </div>
  );
}

function TeamSpeakForm({
  users,
  reload,
  setMessage,
}: {
  users: UserDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/teamspeak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description"),
        host: formData.get("host"),
        queryPort: formData.get("queryPort"),
        voicePort: formData.get("voicePort"),
        apiKey: formData.get("apiKey"),
        queryUsername: formData.get("queryUsername"),
        queryPassword: formData.get("queryPassword"),
        assignedUserIds: formData.getAll("assignedUserIds"),
      }),
    });

    if (response.ok) {
      form.reset();
      setOpen(false);
      setMessage("TeamSpeak server added.");
      await reload();
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not add TeamSpeak server.");
    }
  }

  return (
    <section className="gp-card gp-rise p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="gp-title">TeamSpeak servers</p>
          <p className="mt-1 text-sm text-gp-dim">Connect TeamSpeak ServerQuery API keys and assign access.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="gp-btn gp-btn-primary">
          <Plus className="h-4 w-4" />
          Add TeamSpeak
        </button>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-4 border-t border-white/[0.08] pt-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_160px]">
            <Input name="name" placeholder="Display name" />
            <Input name="host" placeholder="127.0.0.1 or public IP" />
            <Input name="queryPort" type="number" defaultValue={10011} placeholder="10011" />
            <Input name="voicePort" type="number" defaultValue={9987} placeholder="9987" />
          </div>
          <Input name="description" placeholder="Description" required={false} />
          <div className="grid gap-3 lg:grid-cols-3">
            <Input name="apiKey" placeholder="ServerQuery API key optional" required={false} />
            <Input name="queryUsername" placeholder="Query login, e.g. serveradmin" required={false} />
            <Input name="queryPassword" type="password" placeholder="Query password optional" required={false} />
          </div>
          <div className="gp-inset p-3">
            <p className="gp-eyebrow mb-2">Assign users</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {users.map((user) => (
                <label key={user.id} className="gp-check">
                  <input type="checkbox" name="assignedUserIds" value={user.id} />
                  <span className="truncate">{user.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="gp-btn gp-btn-primary">
              <Plus className="h-4 w-4" />
              Create
            </button>
            <button type="button" onClick={() => setOpen(false)} className="gp-btn gp-btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function TeamSpeakCard({
  isAdmin,
  server,
  users,
  reload,
  setMessage,
}: {
  isAdmin: boolean;
  server: TeamSpeakServerDto;
  users: UserDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [live, setLive] = useState<TeamSpeakLiveDto | null>(null);
  const [channels, setChannels] = useState<TeamSpeakChannelDto[]>([]);
  const [groups, setGroups] = useState<TeamSpeakGroupDto[]>([]);
  const [privilegeKey, setPrivilegeKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadLive() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/teamspeak/${server.id}`);
    setLoading(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Could not load TeamSpeak data.");
      return;
    }

    setLive(await response.json());
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/teamspeak/${server.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        virtualserverName: formData.get("virtualserverName"),
        welcomeMessage: formData.get("welcomeMessage"),
        maxClients: formData.get("maxClients"),
        password: formData.get("password"),
      }),
    });

    if (response.ok) {
      setMessage("TeamSpeak settings saved.");
      await loadLive();
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not save TeamSpeak settings.");
    }
  }

  async function loadChannels() {
    const response = await fetch(`/api/teamspeak/${server.id}/channels`);

    if (response.ok) {
      const data = (await response.json()) as { channels: TeamSpeakChannelDto[] };
      setChannels(data.channels);
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not load channels.");
    }
  }

  async function loadGroups() {
    const response = await fetch(`/api/teamspeak/${server.id}/groups`);

    if (response.ok) {
      const data = (await response.json()) as { groups: TeamSpeakGroupDto[] };
      setGroups(data.groups);
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not load server groups.");
    }
  }

  async function runClientAction(action: "poke" | "kick" | "ban", clientId: string) {
    const response = await fetch(`/api/teamspeak/${server.id}/client-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, clientId, message: `${action} from Intuitive Gamepanel` }),
    });

    if (response.ok) {
      setMessage(`TeamSpeak ${action} sent.`);
      await loadLive();
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? `Could not run ${action}.`);
    }
  }

  async function createPrivilegeKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/teamspeak/${server.id}/privilege-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: formData.get("groupId"),
        description: formData.get("description"),
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as { token: string };
      setPrivilegeKey(data.token);
      setMessage("Privilege key created.");
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not create privilege key.");
    }
  }

  async function saveAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/teamspeak/${server.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description"),
        host: formData.get("host"),
        queryPort: formData.get("queryPort"),
        voicePort: formData.get("voicePort"),
        apiKey: formData.get("apiKey") || undefined,
        queryUsername: formData.get("queryUsername") || undefined,
        queryPassword: formData.get("queryPassword") || undefined,
        assignedUserIds: formData.getAll("assignedUserIds"),
      }),
    });

    if (response.ok) {
      setMessage("TeamSpeak connection updated.");
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not update TeamSpeak connection.");
    }
    await reload();
  }

  async function removeServer() {
    const response = await fetch(`/api/teamspeak/${server.id}`, { method: "DELETE" });
    setMessage(response.ok ? "TeamSpeak server deleted." : "Could not delete TeamSpeak server.");
    await reload();
  }

  return (
    <section className="gp-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold tracking-tight text-white">{server.name}</p>
          <p className="mt-1 text-sm text-gp-dim">{server.description || `${server.host}:${server.voicePort}`}</p>
        </div>
        <button type="button" onClick={loadLive} disabled={loading} className="gp-btn gp-btn-ghost h-9">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {live ? (
        <div className="gp-inset mt-4 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{live.info.virtualserverName}</p>
              <p className="mt-1 text-xs text-gp-mute">
                {live.info.status} · uptime {Math.floor(live.info.uptime / 60)} min
              </p>
            </div>
            <span className="gp-pill gp-pill-emerald">
              {live.info.clientCount}/{live.info.maxClients}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {live.clients.map((client) => (
              <div
                key={client.id}
                className="grid gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <span className="truncate text-neutral-100">{client.nickname}</span>
                  <span className="ml-2 text-xs text-gp-mute">DB {client.databaseId}</span>
                </div>
              </div>
            ))}
            {live.clients.length === 0 ? <p className="text-sm text-gp-mute">No clients online.</p> : null}
          </div>
        </div>
      ) : null}
      {error ? <p className="gp-pill gp-pill-red mt-3 w-full justify-center py-2">{error}</p> : null}

      <section className="gp-card-quiet mt-4 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="gp-title">Management tools</p>
            <p className="mt-1 text-xs text-gp-mute">Client actions, channel view, and privilege keys.</p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="gp-inset p-3">
            <p className="text-sm font-semibold text-white">Online clients</p>
            <div className="gp-scroll mt-3 max-h-80 space-y-2 overflow-auto">
              {live?.clients.map((client) => (
                <div
                  key={client.id}
                  className="grid gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-100">{client.nickname}</p>
                    <p className="mt-1 text-xs text-gp-mute">Database ID {client.databaseId}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 md:w-[280px]">
                    <button
                      type="button"
                      onClick={() => runClientAction("poke", client.id)}
                      className="gp-btn gp-btn-ghost h-9 px-3 text-xs"
                    >
                      Poke
                    </button>
                    <button
                      type="button"
                      onClick={() => runClientAction("kick", client.id)}
                      className="gp-btn gp-btn-warn h-9 px-3 text-xs"
                    >
                      Kick
                    </button>
                    <button
                      type="button"
                      onClick={() => runClientAction("ban", client.id)}
                      className="gp-btn gp-btn-danger h-9 px-3 text-xs"
                    >
                      Ban 1h
                    </button>
                  </div>
                </div>
              ))}
              {!live ? <p className="text-sm text-gp-mute">Refresh the server to load online clients.</p> : null}
              {live && live.clients.length === 0 ? <p className="text-sm text-gp-mute">No clients online.</p> : null}
            </div>
          </section>

          <div className="grid gap-3">
            <section className="gp-inset p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Channel viewer</p>
                <button type="button" onClick={loadChannels} className="gp-btn gp-btn-ghost h-8 px-3 text-xs">
                  Load channels
                </button>
              </div>
              <div className="gp-scroll mt-3 max-h-56 space-y-2 overflow-auto">
                {channels.map((channel) => (
                  <div key={channel.id} className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-sm">
                    <p className="truncate font-medium text-neutral-100">{channel.name}</p>
                    {channel.clients.length ? (
                      <p className="mt-1 truncate text-xs text-gp-mute">
                        {channel.clients.map((client) => client.nickname).join(", ")}
                      </p>
                    ) : null}
                  </div>
                ))}
                {channels.length === 0 ? <p className="text-sm text-gp-mute">No channel data loaded.</p> : null}
              </div>
            </section>

            <section className="gp-inset p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Privilege keys</p>
                <button type="button" onClick={loadGroups} className="gp-btn gp-btn-ghost h-8 px-3 text-xs">
                  Load groups
                </button>
              </div>
              <form onSubmit={createPrivilegeKey} className="mt-3 grid gap-2">
                <select name="groupId" required className="gp-select">
                  <option value="">Server group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <Input name="description" placeholder="Description" defaultValue="Created from Intuitive Gamepanel" required={false} />
                <button className="gp-btn gp-btn-primary">Create key</button>
              </form>
              {privilegeKey ? (
                <p className="mt-3 break-all rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2 font-mono text-xs text-emerald-100">
                  {privilegeKey}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </section>

      <form onSubmit={saveSettings} className="mt-4 grid gap-3">
        <Input name="virtualserverName" placeholder="Server name" defaultValue={live?.info.virtualserverName ?? server.name} />
        <Input name="welcomeMessage" placeholder="Welcome message" defaultValue={live?.info.welcomeMessage ?? ""} required={false} />
        <Input name="maxClients" type="number" placeholder="Max clients" defaultValue={live?.info.maxClients || 32} />
        <Input name="password" type="password" placeholder="Server password optional; leave empty to clear" required={false} />
        <button className="gp-btn gp-btn-primary">Save TeamSpeak settings</button>
      </form>

      {isAdmin ? (
        <details className="gp-card-quiet mt-4 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-200">Admin connection settings</summary>
          <form onSubmit={saveAdmin} className="mt-3 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input name="name" defaultValue={server.name} placeholder="Display name" />
              <Input name="description" defaultValue={server.description} placeholder="Description" required={false} />
              <Input name="host" defaultValue={server.host} placeholder="Host" />
              <Input name="apiKey" placeholder={server.hasApiKey ? "New API key optional" : "API key"} required={false} />
              <Input name="queryUsername" defaultValue={server.queryUsername} placeholder="Query login" required={false} />
              <Input name="queryPassword" type="password" placeholder={server.hasQueryPassword ? "New query password optional" : "Query password"} required={false} />
              <Input name="queryPort" type="number" defaultValue={server.queryPort} placeholder="Query port" />
              <Input name="voicePort" type="number" defaultValue={server.voicePort} placeholder="Voice port" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {users.map((user) => (
                <label key={user.id} className="gp-check">
                  <input
                    type="checkbox"
                    name="assignedUserIds"
                    value={user.id}
                    defaultChecked={server.assignedUserIds.includes(user.id)}
                  />
                  <span className="truncate">{user.name}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="gp-btn gp-btn-primary">Save connection</button>
              <button type="button" onClick={removeServer} className="gp-btn gp-btn-danger">
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </form>
        </details>
      ) : null}
    </section>
  );
}

function NodesPanel({
  nodes,
  reload,
  setMessage,
}: {
  nodes: NodeDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        baseUrl: formData.get("baseUrl"),
        publicIp: formData.get("publicIp"),
        apiToken: formData.get("apiToken"),
        isLocal: formData.get("isLocal") === "on",
      }),
    });

    if (response.ok) {
      form.reset();
      setOpen(false);
      setMessage("Node created.");
      await reload();
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not create node.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="gp-card gp-rise p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="gp-title">Machines</p>
            <p className="mt-1 text-sm text-gp-dim">Register local or remote Ubuntu machines that can host services.</p>
          </div>
          <button type="button" onClick={() => setOpen((value) => !value)} className="gp-btn gp-btn-primary">
            <Plus className="h-4 w-4" />
            Add node
          </button>
        </div>

        {open ? (
          <form onSubmit={submit} className="mt-4 border-t border-white/[0.08] pt-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_180px_minmax(0,1fr)]">
              <Input name="name" placeholder="Machine name" />
              <Input name="baseUrl" placeholder="https://node.example.com:8443 or local" />
              <Input name="publicIp" placeholder="Public IP" />
              <Input name="apiToken" placeholder="Agent token" required={false} />
            </div>
            <label className="mt-3 flex min-h-10 items-center gap-2 text-sm text-gp-dim">
              <input name="isLocal" type="checkbox" className="h-4 w-4 accent-blue-500" />
              This is the same machine as the panel
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="gp-btn gp-btn-primary">
                <Plus className="h-4 w-4" />
                Create node
              </button>
              <button type="button" onClick={() => setOpen(false)} className="gp-btn gp-btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {nodes.map((node) => (
          <NodeEditor key={node.id} node={node} reload={reload} setMessage={setMessage} />
        ))}
      </div>
    </div>
  );
}

function NodeEditor({
  node,
  reload,
  setMessage,
}: {
  node: NodeDto;
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/nodes/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        baseUrl: formData.get("baseUrl"),
        publicIp: formData.get("publicIp"),
        apiToken: formData.get("apiToken") || undefined,
        isLocal: formData.get("isLocal") === "on",
      }),
    });

    setMessage(response.ok ? "Node updated." : "Could not update node.");
    await reload();
  }

  async function removeNode() {
    const response = await fetch(`/api/nodes/${node.id}`, { method: "DELETE" });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setMessage(response.ok ? "Node deleted." : data?.error ?? "Could not delete node.");
    await reload();
  }

  return (
    <form onSubmit={submit} className="gp-card gp-interactive p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">{node.name}</p>
          <p className="mt-1 text-xs text-gp-mute">{node.isLocal ? "Local node" : "Remote agent"}</p>
        </div>
        <span className="gp-pill gp-pill-blue font-mono">{node.publicIp}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Input name="name" defaultValue={node.name} placeholder="Machine name" />
        <Input name="publicIp" defaultValue={node.publicIp} placeholder="Public IP" />
        <Input name="baseUrl" defaultValue={node.baseUrl} placeholder="Agent URL" />
        <Input name="apiToken" placeholder={node.hasApiToken ? "New token optional" : "Agent token"} required={false} />
      </div>
      <label className="mt-3 flex min-h-10 items-center gap-2 text-sm text-gp-dim">
        <input name="isLocal" type="checkbox" defaultChecked={node.isLocal} className="h-4 w-4 accent-blue-500" />
        This is the same machine as the panel
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="gp-btn gp-btn-primary">Save</button>
        <button
          type="button"
          onClick={removeNode}
          disabled={node.id === "local"}
          className="gp-btn gp-btn-danger"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </form>
  );
}

function UsersPanel({
  users,
  servers,
  teamspeakServers,
  reload,
  setMessage,
}: {
  users: UserDto[];
  servers: GameServerDto[];
  teamspeakServers: TeamSpeakServerDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  return (
    <div className="space-y-6">
      <UserForm servers={servers} teamspeakServers={teamspeakServers} reload={reload} setMessage={setMessage} />
      <div className="grid gap-4 xl:grid-cols-2">
        {users.map((user) => (
          <UserEditor key={user.id} user={user} servers={servers} teamspeakServers={teamspeakServers} reload={reload} setMessage={setMessage} />
        ))}
      </div>
    </div>
  );
}

function UserForm({
  servers,
  teamspeakServers,
  reload,
  setMessage,
}: {
  servers: GameServerDto[];
  teamspeakServers: TeamSpeakServerDto[];
  reload: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [createSftpUser, setCreateSftpUser] = useState(false);
  const [open, setOpen] = useState(false);

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
      setCreateSftpUser(false);
      setOpen(false);
      setMessage("User created.");
      await reload();
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not create user.");
    }
  }

  return (
    <section className="gp-card gp-rise p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="gp-title">Users</p>
          <p className="mt-1 text-sm text-gp-dim">Create panel accounts, optional SFTP access, and server assignments.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="gp-btn gp-btn-primary">
          <Plus className="h-4 w-4" />
          Add user
        </button>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-5 border-t border-white/[0.08] pt-4">
          <section>
            <p className="gp-eyebrow mb-3">Panel account</p>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,.7fr)_140px]">
              <Input name="name" placeholder="Name" />
              <Input name="email" type="email" placeholder="Email" />
              <Input name="password" type="password" placeholder="Password" />
              <select name="role" className="gp-select">
                <option value="USER">User</option>
                <option value="STARTUP_USER">Startup user</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </section>

          <section className="gp-inset p-3">
            <label className="flex min-h-11 items-center gap-3 text-sm text-neutral-200">
              <input
                type="checkbox"
                name="createSftpUser"
                checked={createSftpUser}
                onChange={(event) => setCreateSftpUser(event.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
              <span>
                <span className="block font-semibold text-white">Create jailed SFTP user</span>
                <span className="text-gp-mute">Creates a Linux SFTP login under /opt/game-servers/username.</span>
              </span>
            </label>
            {createSftpUser ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input name="sftpUsername" placeholder="SFTP username" />
                <Input name="sftpPassword" type="password" placeholder="SFTP password" />
              </div>
            ) : null}
          </section>

          <ServerCheckboxes servers={servers} selected={[]} />
          <TeamSpeakCheckboxes servers={teamspeakServers} selected={[]} />

          <div className="flex flex-wrap gap-2">
            <button className="gp-btn gp-btn-primary">
              <Plus className="h-4 w-4" />
              Create user
            </button>
            <button type="button" onClick={() => setOpen(false)} className="gp-btn gp-btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function UserEditor({
  user,
  servers,
  teamspeakServers,
  reload,
  setMessage,
}: {
  user: UserDto;
  servers: GameServerDto[];
  teamspeakServers: TeamSpeakServerDto[];
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
    <form onSubmit={submit} className="gp-card gp-interactive p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="name" defaultValue={user.name} placeholder="Name" />
        <Input name="email" type="email" defaultValue={user.email} placeholder="Email" />
        <Input name="password" type="password" placeholder="New password optional" required={false} />
        <Input name="sftpUsername" defaultValue={user.sftpUsername ?? ""} placeholder="SFTP username / folder" required={false} />
        <select name="role" defaultValue={user.role} className="gp-select">
          <option value="USER">User</option>
          <option value="STARTUP_USER">Startup user</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <ServerCheckboxes servers={servers} selected={user.serverIds} />
      <TeamSpeakCheckboxes servers={teamspeakServers} selected={user.teamspeakIds} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="gp-btn gp-btn-primary">Save</button>
        <button type="button" onClick={removeUser} className="gp-btn gp-btn-danger">
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </form>
  );
}

function ServerCheckboxes({ servers, selected }: { servers: GameServerDto[]; selected: string[] }) {
  const groupedServers = groupServersByGame(servers);

  return (
    <div className="gp-inset mt-4 overflow-hidden">
      <div className="border-b border-white/[0.07] px-3 py-2.5">
        <p className="gp-eyebrow">Server access</p>
        <p className="mt-1 text-xs text-gp-dim">Assign only the servers this user should control.</p>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {groupedServers.map((group) => (
          <details key={group.gameKey} className="group/server-access">
            <summary className="flex list-none cursor-pointer items-center justify-between gap-3 px-3 py-3 text-sm text-neutral-200 transition hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-2">
                <ChevronDown className="h-4 w-4 shrink-0 text-gp-mute transition group-open/server-access:rotate-180" />
                <span className="truncate font-semibold text-white">{group.label}</span>
              </span>
              <span className="shrink-0 text-xs text-gp-mute">{group.servers.length}</span>
            </summary>
            <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.servers.map((server) => (
                <label key={server.id} className="gp-check">
                  <input
                    type="checkbox"
                    name="serverIds"
                    value={server.id}
                    defaultChecked={selected.includes(server.id)}
                  />
                  <span className="truncate">{server.name}</span>
                </label>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function TeamSpeakCheckboxes({ servers, selected }: { servers: TeamSpeakServerDto[]; selected: string[] }) {
  if (servers.length === 0) {
    return null;
  }

  return (
    <div className="gp-inset mt-4 overflow-hidden">
      <div className="border-b border-white/[0.07] px-3 py-2.5">
        <p className="gp-eyebrow">TeamSpeak access</p>
        <p className="mt-1 text-xs text-gp-dim">Assign the TeamSpeak servers this user may manage.</p>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {servers.map((server) => (
          <label key={server.id} className="gp-check">
            <input
              type="checkbox"
              name="teamspeakIds"
              value={server.id}
              defaultChecked={selected.includes(server.id)}
            />
            <span className="truncate">{server.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      required
      {...props}
      className="gp-input"
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
    sftpUsername: formData.get("sftpUsername") || undefined,
    serverIds: formData.getAll("serverIds"),
    teamspeakIds: formData.getAll("teamspeakIds"),
    createSftpUser: formData.get("createSftpUser") === "on",
    sftpPassword: formData.get("sftpPassword") || undefined,
  };
}
