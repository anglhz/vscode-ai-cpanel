export const GAME_KEYS = ["cod1", "coduo", "cod2", "cod4", "ts3"] as const;
export type GameKey = (typeof GAME_KEYS)[number];

export const GAME_PROFILES: Record<
  GameKey,
  {
    label: string;
    defaultBinaryName: string;
    serviceType: "simple" | "forking";
  }
> = {
  cod1: {
    label: "Call of Duty",
    defaultBinaryName: "cod_lnxded",
    serviceType: "simple",
  },
  coduo: {
    label: "Call of Duty: United Offensive",
    defaultBinaryName: "coduo_lnxded",
    serviceType: "simple",
  },
  cod2: {
    label: "Call of Duty 2",
    defaultBinaryName: "cod2_lnxded",
    serviceType: "simple",
  },
  cod4: {
    label: "Call of Duty: Modern Warfare",
    defaultBinaryName: "cod4x18_dedrun",
    serviceType: "simple",
  },
  ts3: {
    label: "TeamSpeak 3",
    defaultBinaryName: "teamspeak3-server_linux_amd64/ts3server_startscript.sh",
    serviceType: "forking",
  },
} as const;

export function isGameKey(value: string): value is GameKey {
  return GAME_KEYS.includes(value as GameKey);
}
