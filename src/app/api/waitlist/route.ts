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

  const { email, interest, consent } = (body ?? {}) as {
    email?: string;
    interest?: string;
    consent?: boolean;
  };

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "올바른 이메일을 입력해 주세요." },
      { status: 400 },
    );
  }

  /*
   * 동의는 서버에서도 막는다. 폼의 체크박스만으로는 API 직접 호출로 뚫린다.
   * 개인정보보호법 제15조는 '동의를 받아' 수집하도록 정하고 있고,
   * 동의 없이 들어온 레코드는 사후에 구제할 방법이 없다.
   */
  if (consent !== true) {
    return NextResponse.json(
      { error: "개인정보 수집·이용 동의가 필요합니다." },
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
