import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "가격 공개 원칙 — 베지왕",
  description:
    "베지왕이 무엇을 공개하고 무엇을 공개하지 않는지, 그리고 그 경계를 어디에 두는지에 대한 약속입니다.",
};

const EFFECTIVE_DATE = "2026년 8월 1일";

export default function PolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-brand">
        베지왕
      </p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
        가격 공개 원칙
      </h1>
      <p className="mt-3 text-sm text-foreground/60">시행일 {EFFECTIVE_DATE}</p>

      <p className="mt-8 text-base leading-relaxed text-foreground/80">
        가격을 다루는 서비스는 무엇을 보여줄지보다{" "}
        <b className="font-semibold text-foreground">무엇을 보여주지 않을지</b>를
        먼저 정해야 한다고 생각합니다. 나중에 정하면 그때그때의 변명이 되기
        때문에, 아직 아무 이해관계가 없을 때 미리 적어둡니다.
      </p>

      <ol className="mt-10 space-y-8">
        <li className="border-t border-black/10 pt-6">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-brand">01</span>
            <h2 className="text-lg font-bold tracking-tight">
              시장 레벨 지표는 전면 공개합니다
            </h2>
          </div>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/75">
            <p>
              공영도매시장 경락가, 소매 조사가, 시계열, 분위 —{" "}
              <b>숨기지 않습니다.</b>
            </p>
            <p>
              이것들은 원래 공공 데이터입니다. aT 한국농수산식품유통공사,
              KAMIS, 서울시농수산식품공사가 공공 API로 매일 배포하고 있고,
              누구나 받을 수 있습니다. 베지왕이 하는 일은 상자·단·개로 흩어져
              있는 단위를 <b>원/kg 하나로 통일해</b> 비교할 수 있게 만드는
              것뿐입니다.
            </p>
          </div>
        </li>

        <li className="border-t border-black/10 pt-6">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-brand">02</span>
            <h2 className="text-lg font-bold tracking-tight">
              개별 사업자의 견적과 거래가는 영구히 공개하지 않습니다
            </h2>
          </div>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/75">
            <p>
              어느 중도매인이 어느 식당에 얼마에 팔았는지, 어느 벤더의 견적이
              얼마였는지는 <b>공개 대상이 아닙니다.</b> 집계된 통계만 내보내며,
              표본이 5건 미만인 구간은 아예 표시하지 않습니다.
            </p>
            <p>
              시장 전체의 가격 수준을 아는 것과 특정 사업자의 마진을 들추는 것은
              다른 일입니다. 앞의 것은 소비자에게 필요하고, 뒤의 것은 누구에게도
              필요하지 않습니다.
            </p>
          </div>
        </li>

        <li className="border-t border-black/10 pt-6">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-brand">03</span>
            <h2 className="text-lg font-bold tracking-tight">
              소비자가 지불한 가격은 소비자의 것입니다
            </h2>
          </div>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/75">
            <p>
              이용자가 제보한 실제 구매 가격은 <b>점포 단위로 공개하지 않습니다.</b>{" "}
              지역·업태 단위로만 집계합니다.
            </p>
            <p>
              &ldquo;○○마트 배추 4,900원&rdquo;은 그 매장에 대한 정보이고,
              &ldquo;서울 서남권 대형마트 배추 4,900원대&rdquo;는 시장에 대한
              정보입니다. 우리가 만들려는 건 뒤의 것입니다.
            </p>
          </div>
        </li>
      </ol>

      <div className="mt-12 border-t border-black/10 pt-6">
        <h2 className="text-lg font-bold tracking-tight">덧붙이는 한계</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/75">
          <p>
            베지왕이 보여주는 도매가와 소매가의 차이는 <b>거품이 아닙니다.</b>{" "}
            그 사이에는 물류, 선별, 소분, 저장, 폐기, 임대료, 인건비가 들어
            있습니다. 우리는 그 비용을 계산하지 못하며, 계산하지 못하는 것을
            부당이득이라고 부르지 않습니다.
          </p>
          <p>
            또한 경락가는 <b>유통의 마지막 구간만</b> 보여줍니다. 소비자가를
            100으로 놓으면 경락가는 대략 63 지점이고, 나머지는 산지와 출하
            단계에서 이미 결정됩니다. 화면의 배수를 전체 유통마진으로 읽으시면
            안 됩니다.
          </p>
          <p>
            근거가 없으면 지표를 만들지 않습니다. 환산할 단위를 모르면 그 품목은
            노출하지 않고, 데이터가 없는 날은 직전 영업일 값에 날짜를 붙여
            보여줍니다. <b>빈칸을 그럴듯한 숫자로 메우지 않습니다.</b>
          </p>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap gap-4 border-t border-black/10 pt-6 text-sm">
        <Link
          href="/"
          className="font-semibold text-brand underline underline-offset-2"
        >
          ← 베지왕 홈
        </Link>
        <Link
          href="/privacy"
          className="font-semibold text-brand underline underline-offset-2"
        >
          개인정보처리방침
        </Link>
      </div>
    </main>
  );
}
