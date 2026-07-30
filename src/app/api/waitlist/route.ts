import { NextResponse } from "next/server";
import { getRepositories } from "@/server/repos";
import {
  getWaitlistTotal,
  registerWaitlist,
} from "@/server/services/waitlist";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const repos = getRepositories();
  return NextResponse.json({ total: await getWaitlistTotal(repos) });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { email, interest } = (body ?? {}) as {
    email?: string;
    interest?: string;
  };

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "올바른 이메일을 입력해 주세요." },
      { status: 400 },
    );
  }

  const repos = getRepositories();
  const result = await registerWaitlist(
    repos,
    email,
    (interest ?? "").slice(0, 200) || "전체",
  );
  return NextResponse.json(result, { status: 201 });
}
