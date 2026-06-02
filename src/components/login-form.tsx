"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Lock, Server, Shield } from "lucide-react";

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#111827] px-4 py-10 text-neutral-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(135deg,#162033_0%,#0a1020_48%,#061b22_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:72px_72px]" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/30 backdrop-blur-xl lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="hidden bg-[linear-gradient(135deg,rgba(14,165,233,.34),rgba(30,64,175,.2)_45%,rgba(15,23,42,.16))] p-8 lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-300 text-neutral-950">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">Intuitive</p>
              <p className="text-lg font-semibold text-white">Gamepanel</p>
            </div>
          </div>

          <div className="mt-16">
            <p className="text-sm font-medium text-cyan-100">Secure operations</p>
            <h1 className="mt-2 max-w-lg text-4xl font-semibold tracking-tight text-white">
              Manage game and voice servers from one command center.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-200">
              Control systemd services, assign users, and keep startup settings organized without exposing raw shell commands.
            </p>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4 text-cyan-100">
              <Server className="h-5 w-5" />
              <p className="mt-4 text-sm font-semibold">Server control</p>
            </div>
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-100">
              <Activity className="h-5 w-5" />
              <p className="mt-4 text-sm font-semibold">Live status</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-300 text-neutral-950">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-cyan-200">Intuitive</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Gamepanel</h1>
            </div>
          </div>
          <div className="mb-8">
            <p className="text-sm font-medium text-cyan-200">Welcome back</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Sign in</h2>
            <p className="mt-2 text-sm text-neutral-400">Use your panel account to continue.</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-300">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="h-12 w-full rounded-md border border-white/10 bg-neutral-900 px-3 text-white outline-none ring-cyan-400/30 transition focus:border-cyan-300 focus:ring-4"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-300">Password</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-12 w-full rounded-md border border-white/10 bg-neutral-900 px-3 text-white outline-none ring-cyan-400/30 transition focus:border-cyan-300 focus:ring-4"
              />
            </label>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 font-semibold text-neutral-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Lock className="h-4 w-4" />
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
