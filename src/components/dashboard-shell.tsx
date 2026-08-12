"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  CirclePower,
  Gauge,
  GripVertical,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  Server,
  Shield,
  Square,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
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
  ONLINE: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  OFFLINE: "border-neutral-500/30 bg-neutral-500/10 text-neutral-300",
  STARTING: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  STOPPING: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  RESTARTING: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  UNKNOWN: "border-white/10 bg-white/5 text-neutral-300",
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
                {view === "users" ? "User Access" : view === "nodes" ? "Server Nodes" : view === "teamspeak" ? "TeamSpeak" : "Server Control"}
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

      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 border-t border-white/10 bg-neutral-950/95 p-2 backdrop-blur lg:hidden">
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
          <MiniMetric
            label="Startup edits"
            value={currentUser.role === "ADMIN" || currentUser.role === "STARTUP_USER" ? "Full command" : "Arguments only"}
          />
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
        <section className="rounded-lg border border-cyan-300/15 bg-[#07111f]/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">CoDBase linked files</p>
              <p className="mt-1 text-sm text-neutral-400">
                Sync new files from CoDBase #1 into match servers without replacing per-server configs.
              </p>
            </div>
            <button
              type="button"
              onClick={updateCodbaseLinks}
              disabled={updatingCodbaseLinks}
              className="flex h-11 items-center justify-center gap-2 rounded-md border border-cyan-300/25 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${updatingCodbaseLinks ? "animate-spin" : ""}`} />
              Update CoDBase links
            </button>
          </div>
        </section>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#09111d]/70 shadow-2xl shadow-black/25 backdrop-blur-xl">
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(120px,0.7fr)_minmax(230px,0.9fr)] border-b border-white/10 bg-white/[0.07] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-300 lg:grid">
          <span>Server name</span>
          <span>Address</span>
          <span className="text-right">Operations</span>
        </div>
        <div className="divide-y divide-white/10">
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
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 text-neutral-300">
          No servers are assigned to this account.
        </div>
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
      className={`bg-[#081321]/40 transition ${dragging ? "opacity-60" : ""}`}
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
        className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 border-b border-white/10 bg-[linear-gradient(90deg,rgba(34,211,238,.08),rgba(255,255,255,.035),rgba(34,211,238,.08))] px-4 py-4"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          onGroupDragStart();
        }}
        onDragEnd={onGroupDragEnd}
      >
        <span
          className="hidden h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md border border-white/10 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200 active:cursor-grabbing lg:flex"
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
            <h2 className="truncate text-lg font-semibold uppercase tracking-wide text-cyan-100 sm:text-xl">
              {group.label}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {group.servers.length} {group.servers.length === 1 ? "server" : "servers"}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-9 w-9 items-center justify-center justify-self-end rounded-md text-neutral-400 transition hover:bg-white/5 hover:text-white"
          aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
        >
          <ChevronDown className={`h-5 w-5 transition ${collapsed ? "-rotate-90" : ""}`} />
        </button>
      </div>
      {!collapsed ? (
        <div className="divide-y divide-white/10">
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
      className={`group bg-[#0d1624]/45 transition open:bg-[linear-gradient(135deg,rgba(15,23,42,.88),rgba(8,47,73,.55))] ${
        dragging ? "opacity-50" : ""
      }`}
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
      <summary className="grid cursor-pointer gap-3 px-4 py-3 transition hover:bg-white/[0.045] lg:grid-cols-[minmax(220px,1.4fr)_minmax(120px,0.7fr)_minmax(230px,0.9fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {draggable ? (
            <span
              className="hidden h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md border border-white/10 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200 active:cursor-grabbing lg:flex"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          ) : null}
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
              {playerSummaryLabel ? (
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-mono text-sm font-semibold text-neutral-100">
                  {playerSummaryLabel}
                </span>
              ) : null}
              {versionLabel ? (
                <span className="text-xs font-semibold uppercase tracking-wide text-cyan-100/70">
                  {versionLabel}
                </span>
              ) : null}
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
          {isVoice ? "Refresh clients" : "Refresh players"}
        </button>
      </div>

      {players?.hostname ? (
        <p className="mt-3 truncate text-sm text-neutral-400">{stripCodColors(players.hostname)}</p>
      ) : null}

      {isVoice ? <TeamSpeakExternalViewer /> : null}

      {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}

      {!isVoice && players && players.players.length > 0 ? (
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

      {players && players.players.length === 0 && !isVoice ? (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-400">
          No players online right now.
        </p>
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
    <div className="mt-4 rounded-md border border-white/10 bg-white/[0.03] p-3">
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
    <section className="rounded-lg border border-white/10 bg-[#07111f]/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Live console</p>
          <p className="mt-1 text-sm text-neutral-400">
            {connected ? "Streaming systemd logs" : "Last 200 lines when connected"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setLines([]);
              setError("");
              setConnected((current) => !current);
            }}
            className={`h-9 rounded-md border px-3 text-sm font-medium transition ${
              connected
                ? "border-red-400/30 text-red-100 hover:bg-red-400/10"
                : "border-cyan-300/30 text-cyan-100 hover:bg-cyan-300/10"
            }`}
          >
            {connected ? "Disconnect" : "Connect"}
          </button>
          <button
            type="button"
            onClick={() => setLines([])}
            className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-neutral-300 transition hover:bg-white/5"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={consoleRef}
        className="max-h-80 min-h-48 overflow-y-auto bg-black/30 p-3 font-mono text-xs leading-5 text-neutral-300"
      >
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <p key={`${line}-${index}`} className="whitespace-pre-wrap break-words">
              {line}
            </p>
          ))
        ) : (
          <p className="text-neutral-500">Connect to view live service logs.</p>
        )}
      </div>

      {error ? <p className="border-t border-white/10 px-4 py-2 text-sm text-red-200">{error}</p> : null}

      {!isVoiceServer ? (
        <form onSubmit={sendRconCommand} className="flex flex-col gap-2 border-t border-white/10 p-3 sm:flex-row">
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            maxLength={200}
            className="min-h-10 flex-1 rounded-md border border-white/10 bg-neutral-900 px-3 font-mono text-sm text-white outline-none ring-cyan-400/20 transition placeholder:text-neutral-500 focus:border-cyan-300 focus:ring-4"
            placeholder="RCON command, for example: status"
          />
          <button
            type="submit"
            disabled={rconBusy || !command.trim()}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </form>
      ) : (
        <p className="border-t border-white/10 px-4 py-3 text-sm text-neutral-400">
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
        {canEditFullStartup && !isVoiceServer ? (
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
        ) : !canEditFullStartup && !isVoiceServer ? (
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
          {canUpgradeCod16 ? (
            <button
              type="button"
              onClick={isCod16 ? downgradeCod16 : upgradeCod16}
              className={`h-10 rounded-md border px-4 text-sm font-semibold transition ${
                isCod16
                  ? "border-amber-400/35 text-amber-100 hover:bg-amber-400/10"
                  : "border-emerald-400/30 text-emerald-100 hover:bg-emerald-400/10"
              }`}
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
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_180px_180px_120px]">
            <Input name="name" placeholder="Server name" />
            <Input name="description" placeholder="Description" />
            <select
              name="nodeId"
              required
              defaultValue={nodes.find((node) => node.isLocal)?.id ?? nodes[0]?.id ?? ""}
              className="h-11 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none ring-cyan-400/20 transition focus:border-cyan-300 focus:ring-4"
            >
              <option value="">Machine</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
            <select
              name="ownerUserId"
              required
              className="h-11 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none ring-cyan-400/20 transition focus:border-cyan-300 focus:ring-4"
            >
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
          {ownerUsers.length === 0 ? (
            <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              Create or edit a user with an SFTP username before adding servers.
            </p>
          ) : null}
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
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 text-neutral-300">
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
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">TeamSpeak servers</p>
          <p className="text-sm text-neutral-400">Connect TeamSpeak ServerQuery API keys and assign access.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200"
        >
          <Plus className="h-4 w-4" />
          Add TeamSpeak
        </button>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-4 border-t border-white/10 pt-4">
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
          <div className="rounded-lg border border-white/10 bg-[#07111f]/70 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Assign users</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {users.map((user) => (
                <label key={user.id} className="flex min-h-10 items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-200">
                  <input type="checkbox" name="assignedUserIds" value={user.id} className="h-4 w-4 accent-cyan-300" />
                  <span className="truncate">{user.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
              <Plus className="h-4 w-4" />
              Create
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
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{server.name}</p>
          <p className="mt-1 text-sm text-neutral-400">{server.description || `${server.host}:${server.voicePort}`}</p>
        </div>
        <button
          type="button"
          onClick={loadLive}
          disabled={loading}
          className="flex h-10 items-center gap-2 rounded-md border border-cyan-300/25 px-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10 disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {live ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-[#07111f]/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{live.info.virtualserverName}</p>
              <p className="mt-1 text-xs text-neutral-500">{live.info.status} · uptime {Math.floor(live.info.uptime / 60)} min</p>
            </div>
            <span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-sm font-semibold text-emerald-100">
              {live.info.clientCount}/{live.info.maxClients}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {live.clients.map((client) => (
              <div key={client.id} className="grid gap-2 rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <span className="truncate text-neutral-100">{client.nickname}</span>
                  <span className="ml-2 text-xs text-neutral-500">DB {client.databaseId}</span>
                </div>
              </div>
            ))}
            {live.clients.length === 0 ? <p className="text-sm text-neutral-500">No clients online.</p> : null}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}

      <section className="mt-4 rounded-lg border border-cyan-300/15 bg-[#07111f]/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-cyan-100">Management tools</p>
            <p className="mt-1 text-xs text-neutral-500">Client actions, channel view, and privilege keys.</p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="rounded-lg border border-white/10 bg-neutral-950/35 p-3">
            <p className="text-sm font-semibold text-white">Online clients</p>
            <div className="mt-3 max-h-80 space-y-2 overflow-auto">
              {live?.clients.map((client) => (
                <div
                  key={client.id}
                  className="grid gap-3 rounded-md border border-white/10 bg-neutral-900 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-100">{client.nickname}</p>
                    <p className="mt-1 text-xs text-neutral-500">Database ID {client.databaseId}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 md:w-[280px]">
                    <button
                      type="button"
                      onClick={() => runClientAction("poke", client.id)}
                      className="h-9 rounded-md border border-cyan-300/25 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/10"
                    >
                      Poke
                    </button>
                    <button
                      type="button"
                      onClick={() => runClientAction("kick", client.id)}
                      className="h-9 rounded-md border border-amber-400/30 px-3 text-xs font-semibold text-amber-100 hover:bg-amber-400/10"
                    >
                      Kick
                    </button>
                    <button
                      type="button"
                      onClick={() => runClientAction("ban", client.id)}
                      className="h-9 rounded-md border border-red-400/30 px-3 text-xs font-semibold text-red-100 hover:bg-red-400/10"
                    >
                      Ban 1h
                    </button>
                  </div>
                </div>
              ))}
              {!live ? <p className="text-sm text-neutral-500">Refresh the server to load online clients.</p> : null}
              {live && live.clients.length === 0 ? <p className="text-sm text-neutral-500">No clients online.</p> : null}
            </div>
          </section>

          <div className="grid gap-3">
            <section className="rounded-lg border border-white/10 bg-neutral-950/35 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Channel viewer</p>
                <button
                  type="button"
                  onClick={loadChannels}
                  className="h-9 rounded-md border border-white/10 px-3 text-xs font-semibold text-neutral-200 hover:bg-white/5"
                >
                  Load channels
                </button>
              </div>
              <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                {channels.map((channel) => (
                  <div key={channel.id} className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm">
                    <p className="truncate font-medium text-neutral-100">{channel.name}</p>
                    {channel.clients.length ? (
                      <p className="mt-1 truncate text-xs text-neutral-500">
                        {channel.clients.map((client) => client.nickname).join(", ")}
                      </p>
                    ) : null}
                  </div>
                ))}
                {channels.length === 0 ? <p className="text-sm text-neutral-500">No channel data loaded.</p> : null}
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-neutral-950/35 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Privilege keys</p>
                <button
                  type="button"
                  onClick={loadGroups}
                  className="h-9 rounded-md border border-white/10 px-3 text-xs font-semibold text-neutral-200 hover:bg-white/5"
                >
                  Load groups
                </button>
              </div>
              <form onSubmit={createPrivilegeKey} className="mt-3 grid gap-2">
                <select name="groupId" required className="h-10 min-w-0 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none">
                  <option value="">Server group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <Input name="description" placeholder="Description" defaultValue="Created from Intuitive Gamepanel" required={false} />
                <button className="h-10 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
                  Create key
                </button>
              </form>
              {privilegeKey ? (
                <p className="mt-3 break-all rounded-md border border-emerald-300/20 bg-emerald-300/10 p-2 font-mono text-xs text-emerald-100">
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
        <button className="h-10 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
          Save TeamSpeak settings
        </button>
      </form>

      {isAdmin ? (
        <details className="mt-4 rounded-lg border border-white/10 bg-[#07111f]/70 p-3">
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
                <label key={user.id} className="flex min-h-10 items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    name="assignedUserIds"
                    value={user.id}
                    defaultChecked={server.assignedUserIds.includes(user.id)}
                    className="h-4 w-4 accent-cyan-300"
                  />
                  <span className="truncate">{user.name}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="h-10 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
                Save connection
              </button>
              <button
                type="button"
                onClick={removeServer}
                className="flex h-10 items-center gap-2 rounded-md border border-red-400/30 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-400/10"
              >
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
      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Machines</p>
            <p className="text-sm text-neutral-400">Register local or remote Ubuntu machines that can host services.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200"
          >
            <Plus className="h-4 w-4" />
            Add node
          </button>
        </div>

        {open ? (
          <form onSubmit={submit} className="mt-4 border-t border-white/10 pt-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_180px_minmax(0,1fr)]">
              <Input name="name" placeholder="Machine name" />
              <Input name="baseUrl" placeholder="https://node.example.com:8443 or local" />
              <Input name="publicIp" placeholder="Public IP" />
              <Input name="apiToken" placeholder="Agent token" required={false} />
            </div>
            <label className="mt-3 flex min-h-10 items-center gap-2 text-sm text-neutral-300">
              <input name="isLocal" type="checkbox" className="h-4 w-4 accent-cyan-300" />
              This is the same machine as the panel
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
                <Plus className="h-4 w-4" />
                Create node
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
    <form onSubmit={submit} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{node.name}</p>
          <p className="mt-1 text-sm text-neutral-500">{node.isLocal ? "Local node" : "Remote agent"}</p>
        </div>
        <span className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-100">
          {node.publicIp}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Input name="name" defaultValue={node.name} placeholder="Machine name" />
        <Input name="publicIp" defaultValue={node.publicIp} placeholder="Public IP" />
        <Input name="baseUrl" defaultValue={node.baseUrl} placeholder="Agent URL" />
        <Input name="apiToken" placeholder={node.hasApiToken ? "New token optional" : "Agent token"} required={false} />
      </div>
      <label className="mt-3 flex min-h-10 items-center gap-2 text-sm text-neutral-300">
        <input name="isLocal" type="checkbox" defaultChecked={node.isLocal} className="h-4 w-4 accent-cyan-300" />
        This is the same machine as the panel
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="h-10 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
          Save
        </button>
        <button
          type="button"
          onClick={removeNode}
          disabled={node.id === "local"}
          className="flex h-10 items-center gap-2 rounded-md border border-red-400/30 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
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
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Users</p>
          <p className="text-sm text-neutral-400">Create panel accounts, optional SFTP access, and server assignments.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200"
        >
          <Plus className="h-4 w-4" />
          Add user
        </button>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-5 border-t border-white/10 pt-4">
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Panel account</p>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,.7fr)_140px]">
              <Input name="name" placeholder="Name" />
              <Input name="email" type="email" placeholder="Email" />
              <Input name="password" type="password" placeholder="Password" />
              <select name="role" className="h-11 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none">
                <option value="USER">User</option>
                <option value="STARTUP_USER">Startup user</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-[#07111f]/70 p-3">
            <label className="flex min-h-11 items-center gap-3 text-sm text-neutral-200">
              <input
                type="checkbox"
                name="createSftpUser"
                checked={createSftpUser}
                onChange={(event) => setCreateSftpUser(event.target.checked)}
                className="h-4 w-4 accent-cyan-300"
              />
              <span>
                <span className="block font-semibold text-white">Create jailed SFTP user</span>
                <span className="text-neutral-500">Creates a Linux SFTP login under /opt/game-servers/username.</span>
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
            <button className="flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200">
              <Plus className="h-4 w-4" />
              Create user
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
    <form onSubmit={submit} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="name" defaultValue={user.name} placeholder="Name" />
        <Input name="email" type="email" defaultValue={user.email} placeholder="Email" />
        <Input name="password" type="password" placeholder="New password optional" required={false} />
        <Input name="sftpUsername" defaultValue={user.sftpUsername ?? ""} placeholder="SFTP username / folder" required={false} />
        <select name="role" defaultValue={user.role} className="h-11 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none">
          <option value="USER">User</option>
          <option value="STARTUP_USER">Startup user</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <ServerCheckboxes servers={servers} selected={user.serverIds} />
      <TeamSpeakCheckboxes servers={teamspeakServers} selected={user.teamspeakIds} />
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
  const groupedServers = groupServersByGame(servers);

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-[#07111f]/70">
      <div className="border-b border-white/10 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Server access</p>
        <p className="mt-1 text-sm text-neutral-400">Assign only the servers this user should control.</p>
      </div>
      <div className="divide-y divide-white/10">
        {groupedServers.map((group) => (
          <details key={group.gameKey} className="group/server-access">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-3 text-sm text-neutral-200 transition hover:bg-white/[0.035]">
              <span className="flex min-w-0 items-center gap-2">
                <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500 transition group-open/server-access:rotate-180" />
                <span className="truncate font-semibold text-white">{group.label}</span>
              </span>
              <span className="shrink-0 text-xs text-neutral-500">{group.servers.length}</span>
            </summary>
            <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.servers.map((server) => (
                <label
                  key={server.id}
                  className="flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-200"
                >
                  <input
                    type="checkbox"
                    name="serverIds"
                    value={server.id}
                    defaultChecked={selected.includes(server.id)}
                    className="h-4 w-4 accent-cyan-300"
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
    <div className="mt-4 rounded-lg border border-white/10 bg-[#07111f]/70">
      <div className="border-b border-white/10 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">TeamSpeak access</p>
        <p className="mt-1 text-sm text-neutral-400">Assign the TeamSpeak servers this user may manage.</p>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {servers.map((server) => (
          <label
            key={server.id}
            className="flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-200"
          >
            <input
              type="checkbox"
              name="teamspeakIds"
              value={server.id}
              defaultChecked={selected.includes(server.id)}
              className="h-4 w-4 accent-cyan-300"
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
    sftpUsername: formData.get("sftpUsername") || undefined,
    serverIds: formData.getAll("serverIds"),
    teamspeakIds: formData.getAll("teamspeakIds"),
    createSftpUser: formData.get("createSftpUser") === "on",
    sftpPassword: formData.get("sftpPassword") || undefined,
  };
}
