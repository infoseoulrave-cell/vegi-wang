import { describe, expect, it } from "vitest";
import {
  garakQueryNames,
  itemIdBySourceName,
  sourceLookupNames,
} from "./catalog";
import { CATALOG_ITEMS } from "./catalog-items";

/*
 * 이 파일이 지키는 것은 하나다: **원천에 들어와 있는 행이 이름 때문에
 * 버려지지 않는 것.** 축이 틀리면 값이 이상해서 눈에 띄지만, 이름이 안 맞으면
 * 품목이 조용히 사라진다 — 2026-08-03 실측에서 원천 61품목 중 36품목만
 * 집계되고 있었고 아무 알림도 울리지 않았다.
 */

describe("itemIdBySourceName", () => {
  const garak = itemIdBySourceName("garak");

  it("가락이 \"(수입)\"을 붙여 주는 품목을 버리지 않는다", () => {
    // 원천에는 "참다래(수입)" 행만 오는데 카탈로그는 "참다래"였다.
    // 집계가 괄호를 카탈로그 쪽에서만 벗겨 매칭이 통째로 실패했다.
    expect(garak.get("참다래(수입)")).toBe("kiwi-imported");
    expect(garak.get("아보카도(수입)")).toBe("avocado-imported");
    expect(garak.get("바나나(수입)")).toBe("banana-imported");
  });

  it("국산과 수입을 서로 다른 품목으로 유지한다", () => {
    // 하나로 합치면 유통 경로가 다른 두 가격이 한 평균에 섞인다.
    expect(garak.get("참다래")).toBe("kiwi");
    expect(garak.get("참다래")).not.toBe(garak.get("참다래(수입)"));
    expect(garak.get("바나나")).toBe("banana");
    expect(garak.get("바나나")).not.toBe(garak.get("바나나(수입)"));
  });

  it("가락 표기가 카탈로그와 다른 품목을 매칭한다", () => {
    expect(garak.get("메론")).toBe("melon");
    expect(garak.get("마늘")).toBe("garlic-bulb");
  });

  it("다른 소스의 별칭을 가락 매칭에 끌어오지 않는다", () => {
    // 대파의 KAMIS 별칭은 "파"다. 이걸 가락에 적용하면 가락의 "파"
    // (쪽파·실파 등 다른 품목)가 대파 경락가로 집계된다.
    expect(garak.get("파")).toBeUndefined();
  });

  it("수산 품목을 가락 매핑에 넣지 않는다", () => {
    // 가락은 청과 6개 법인만 조회한다 — 수산은 위판장이 원천이다.
    expect(garak.get("갈치")).toBeUndefined();
    expect(itemIdBySourceName("fishMarket").get("갈치")).toBe("hairtail");
  });

  it("한 이름이 두 품목을 가리키지 않는다", () => {
    const ids = [...garak.values()];
    const names = [...garak.keys()];
    expect(new Set(names).size).toBe(names.length);
    expect(ids.every(Boolean)).toBe(true);
  });
});

describe("garakQueryNames", () => {
  const names = garakQueryNames();

  it("가락 표기 별칭을 조회어에 포함한다", () => {
    // 이름 하나만 던지면 부분매칭 0건 → 그 품목은 수집 자체가 안 된다.
    expect(names).toContain("메론");
    expect(names).toContain("마늘");
  });

  it("괄호를 벗겨 중복 조회를 만들지 않는다", () => {
    // "참다래(수입)"은 "참다래" 질의로 이미 들어온다. 따로 던지면 왕복만 는다.
    expect(names).not.toContain("참다래(수입)");
    expect(new Set(names).size).toBe(names.length);
  });

  it("수산 품목을 가락에 질의하지 않는다", () => {
    expect(names).not.toContain("갈치");
    expect(names).not.toContain("전복");
  });
});

describe("sourceLookupNames", () => {
  it("소스별로 별칭을 분리한다", () => {
    const daepa = CATALOG_ITEMS.find((i) => i.id === "green-onion")!;
    expect(sourceLookupNames(daepa, "kamis")).toContain("파");
    expect(sourceLookupNames(daepa, "garak")).not.toContain("파");
  });
});
