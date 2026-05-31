import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyLogin } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
  }

  const user = await verifyLogin(parsed.data.email, parsed.data.password);

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await createSession(user);
  return NextResponse.json({ user });
}
