import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 베지왕",
  description:
    "베지왕이 수집하는 개인정보 항목, 이용 목적, 보유 기간, 처리 위탁과 국외 이전에 대한 안내입니다.",
};

const EFFECTIVE_DATE = "2026년 8월 1일";
const CONTACT = "gallery.jeoul@gmail.com";

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-black/10 pt-6">
      <h2 className="text-lg font-bold tracking-tight">
        <span className="mr-2 font-mono text-sm font-normal text-foreground/40">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/75">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-brand">
        베지왕
      </p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
        개인정보처리방침
      </h1>
      <p className="mt-3 text-sm text-foreground/60">
        시행일 {EFFECTIVE_DATE}
      </p>

      <div className="mt-6 rounded-xl bg-white/70 p-4 text-sm leading-relaxed text-foreground/75 ring-1 ring-black/5">
        베지왕은 시세 알림 신청에 필요한 <b>최소한의 정보만</b> 받습니다.
        이름·전화번호·주소·결제정보는 수집하지 않으며, 어떤 정보도 제3자에게
        판매하거나 제공하지 않습니다.
      </div>

      <div className="mt-10 space-y-8">
        <Section n="1." title="수집하는 항목과 목적">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-black/15 text-xs text-foreground/50">
                <th className="py-2 pr-4 font-semibold">항목</th>
                <th className="py-2 pr-4 font-semibold">목적</th>
                <th className="py-2 font-semibold">필수 여부</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-black/5">
                <td className="py-2 pr-4 font-medium">이메일 주소</td>
                <td className="py-2 pr-4">시세 알림 발송, 중복 신청 확인</td>
                <td className="py-2">필수</td>
              </tr>
              <tr className="border-b border-black/5">
                <td className="py-2 pr-4 font-medium">관심 부류·품목</td>
                <td className="py-2 pr-4">
                  알림 대상 품목 선별, 수요가 많은 품목 우선 확보
                </td>
                <td className="py-2">선택</td>
              </tr>
            </tbody>
          </table>
          <p>
            수집 방법은 이용자가 직접 입력하는 것뿐입니다. 쿠키를 이용한 행태정보
            수집, 광고 식별자 연동, 제3자 트래커는 사용하지 않습니다.
          </p>
        </Section>

        <Section n="2." title="보유 기간과 파기">
          <p>
            수신거부(구독 해지) 또는 삭제 요청을 받으면 <b>지체 없이 파기</b>
            합니다. 서비스를 종료하는 경우에도 보관하지 않고 전량 파기합니다.
            그 외에는 알림 발송 목적이 유지되는 동안 보관합니다.
          </p>
          <p>
            전자적 파일 형태의 정보는 복구할 수 없는 방법으로 삭제합니다.
          </p>
        </Section>

        <Section n="3." title="처리 위탁과 국외 이전">
          <p>
            서비스 운영을 위해 아래에 처리를 위탁하고 있으며, 서버가 국외에 있어
            개인정보가 국외로 이전됩니다.
          </p>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-black/15 text-xs text-foreground/50">
                <th className="py-2 pr-4 font-semibold">수탁자</th>
                <th className="py-2 pr-4 font-semibold">업무</th>
                <th className="py-2 font-semibold">이전 국가</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-black/5">
                <td className="py-2 pr-4 font-medium">Vercel Inc.</td>
                <td className="py-2 pr-4">웹 서비스 호스팅</td>
                <td className="py-2">미국</td>
              </tr>
              <tr className="border-b border-black/5">
                <td className="py-2 pr-4 font-medium">Supabase Inc.</td>
                <td className="py-2 pr-4">데이터베이스 보관</td>
                <td className="py-2">일본(도쿄)</td>
              </tr>
            </tbody>
          </table>
          <p>
            이전 항목은 위 1항의 수집 항목과 같고, 이전 시기는 이용자가 신청한
            시점입니다. 보유 기간은 위 2항과 같습니다. 이전을 거부하실 수 있으나
            거부 시 알림 서비스를 제공할 수 없습니다.
          </p>
        </Section>

        <Section n="4." title="제3자 제공">
          <p>
            제공하지 않습니다. 법령에 따라 수사기관이 적법한 절차로 요구하는
            경우를 제외하고, 어떤 경우에도 외부에 제공하거나 판매하지 않습니다.
          </p>
        </Section>

        <Section n="5." title="이용자의 권리">
          <p>
            언제든지 자신의 개인정보에 대해 <b>열람·정정·삭제·처리정지</b>를
            요구할 수 있습니다. 아래 연락처로 요청하시면 지체 없이 조치하고
            결과를 알려드립니다. 알림 메일 하단의 수신거부 링크로도 즉시 해지할
            수 있습니다.
          </p>
        </Section>

        <Section n="6." title="안전성 확보 조치">
          <p>
            데이터베이스는 행 수준 보안(Row Level Security)을 적용해 외부에서
            직접 조회·수정할 수 없도록 차단했습니다. 접근 권한은 운영자 1인으로
            제한하며, 전송 구간은 전부 암호화(HTTPS)됩니다.
          </p>
        </Section>

        <Section n="7." title="개인정보 보호책임자">
          <p>
            문의·요청은 아래로 보내주시면 됩니다.
            <br />
            <a
              href={`mailto:${CONTACT}`}
              className="font-semibold text-brand underline underline-offset-2"
            >
              {CONTACT}
            </a>
          </p>
          <p className="text-foreground/55">
            처리 결과에 만족하지 못하시면 개인정보분쟁조정위원회(1833-6972),
            개인정보침해신고센터(118)에 도움을 요청하실 수 있습니다.
          </p>
        </Section>

        <Section n="8." title="방침 변경">
          <p>
            내용이 변경되면 시행 7일 전부터 이 페이지에 공지합니다. 이용자에게
            불리한 변경은 30일 전에 알립니다.
          </p>
        </Section>
      </div>

      <div className="mt-12 flex flex-wrap gap-4 border-t border-black/10 pt-6 text-sm">
        <Link
          href="/"
          className="font-semibold text-brand underline underline-offset-2"
        >
          ← 베지왕 홈
        </Link>
        <Link
          href="/policy"
          className="font-semibold text-brand underline underline-offset-2"
        >
          가격 공개 원칙
        </Link>
      </div>
    </main>
  );
}
