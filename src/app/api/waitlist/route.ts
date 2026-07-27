import { NextResponse } from "next/server";
import { addEntry, countEntries } from "@/lib/waitlist";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  return NextResponse.json({ total: await countEntries() });
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

  const result = await addEntry(email, (interest ?? "").slice(0, 40) || "전체");
  return NextResponse.json(result, { status: 201 });
}
