"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, Loader2, Lock, Mail, Server } from "lucide-react";
import { BrandLogo } from "./brand-logo";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    setLoading(false);

    if (!response.ok) {
      setError("Invalid email or password.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 text-gp-ink">
      <div className="gp-ambient" />
      <div className="gp-grid-overlay" />

      <section className="gp-rise relative grid w-full max-w-5xl overflow-hidden rounded-[26px] border border-white/[0.08] bg-white/[0.03] shadow-[0_50px_120px_-50px_rgba(0,0,0,1)] backdrop-blur-2xl lg:grid-cols-[minmax(0,1fr)_430px]">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-9 lg:flex">
          <div
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(620px 420px at 12% 4%, rgba(59,130,246,.34), transparent 62%), radial-gradient(520px 380px at 88% 96%, rgba(251,146,60,.16), transparent 64%)",
            }}
          />

          <div className="relative">
            <div className="flex items-center gap-3">
              <BrandLogo size="lg" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200/80">
                  Intuitive
                </p>
                <p className="text-lg font-semibold tracking-tight text-white">Gamepanel</p>
              </div>
            </div>

            <div className="mt-14">
              <p className="text-sm font-medium text-blue-200">Secure operations</p>
              <h1 className="mt-3 max-w-md text-[2.6rem] font-semibold leading-[1.08] tracking-tight text-white">
                Manage game and voice servers from one command center.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-gp-dim">
                Control systemd services, assign users, and keep startup settings organized
                without exposing raw shell commands.
              </p>
            </div>
          </div>

          <div className="relative mt-12 grid gap-3 sm:grid-cols-2">
            <div className="gp-card-quiet flex items-center gap-3 p-4">
              <span className="gp-icon-tile gp-icon-tile-blue">
                <Server className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Server control</p>
                <p className="truncate text-xs text-gp-mute">systemd units, live state</p>
              </div>
            </div>
            <div className="gp-card-quiet flex items-center gap-3 p-4">
              <span className="gp-icon-tile gp-icon-tile-emerald">
                <Activity className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Live status</p>
                <p className="truncate text-xs text-gp-mute">players, logs, RCON</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="relative border-t border-white/[0.08] bg-[#070b14]/70 p-6 backdrop-blur-xl sm:p-9 lg:border-l lg:border-t-0">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandLogo size="md" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200/80">
                Intuitive
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-white">Gamepanel</h1>
            </div>
          </div>

          <div className="mb-7">
            <p className="text-sm font-medium text-blue-200">Welcome back</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Sign in</h2>
            <p className="mt-2 text-sm text-gp-dim">Use your panel account to continue.</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="gp-eyebrow mb-2 block">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gp-mute" />
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="gp-input pl-10"
                />
              </div>
            </label>

            <label className="block">
              <span className="gp-eyebrow mb-2 block">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gp-mute" />
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="gp-input pl-10"
                />
              </div>
            </label>

            {error ? (
              <p className="gp-pill gp-pill-red w-full justify-center px-3 py-2 text-xs">{error}</p>
            ) : null}

            <button type="submit" disabled={loading} className="gp-btn gp-btn-primary w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              {loading ? "Signing in..." : "Sign in"}
              {loading ? null : <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="gp-divider mt-7" />

          <p className="mt-5 text-center text-xs text-gp-mute">
            Access is limited to accounts provisioned by a panel administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
