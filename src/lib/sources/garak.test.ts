import { describe, expect, it } from "vitest";
import { aggregateByPummok, parseGarakXml } from "./garak";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <list>
    <PUMMOK>사과</PUMMOK><PUMJONG>후지</PUMJONG><UUN>10kg</UUN>
    <DDD>특</DDD><PPRICE>58,000</PPRICE><SSANGI>경북 청송</SSANGI><ADJ_DT>20260727</ADJ_DT>
  </list>
  <list>
    <PUMMOK>사과</PUMMOK><PUMJONG>후지</PUMJONG><UUN>10kg</UUN>
    <DDD>상</DDD><PPRICE>55,000</PPRICE><SSANGI>경북 영주</SSANGI><ADJ_DT>20260727</ADJ_DT>
  </list>
  <list>
    <PUMMOK>배추</PUMMOK><PUMJONG>고랭지</PUMJONG><UUN>10kg</UUN>
    <DDD>상</DDD><PPRICE>9,800</PPRICE><SSANGI>강원 평창</SSANGI><ADJ_DT>20260727</ADJ_DT>
  </list>
</response>`;

describe("parseGarakXml", () => {
  it("반복 XML 행에서 경락가(PPRICE)를 가진 항목만 추출한다", () => {
    const rows = parseGarakXml(SAMPLE_XML);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      pummok: "사과",
      pumjong: "후지",
      grade: "특",
      price: 58000,
      origin: "경북 청송",
    });
  });

  it("쉼표가 섞인 가격 문자열을 숫자로 정규화한다", () => {
    const rows = parseGarakXml(SAMPLE_XML);
    expect(rows.every((r) => typeof r.price === "number")).toBe(true);
    expect(rows[1].price).toBe(55000);
  });

  it("PPRICE가 없는 잡음/빈 응답에는 안전하다", () => {
    expect(parseGarakXml("<response></response>")).toEqual([]);
    expect(parseGarakXml("<a><b>x</b></a>")).toEqual([]);
  });
});

describe("aggregateByPummok", () => {
  it("품목명별 평균 경락가를 계산한다", () => {
    const agg = aggregateByPummok(parseGarakXml(SAMPLE_XML));
    expect(agg.get("사과")).toBe(56500); // (58000 + 55000) / 2
    expect(agg.get("배추")).toBe(9800);
  });
});
