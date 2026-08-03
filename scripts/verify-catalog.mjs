/**
 * 카탈로그 환산표를 **실제 KAMIS 응답의 단위 문자열**과 대조해 검증하고,
 * src/lib/catalog-items.ts 의 unitVerified 플래그와
 * docs/CATALOG_VERIFICATION.md 리포트를 갱신한다.
 *
 * 사용:
 *   node scripts/verify-catalog.mjs [fixture.json]
 *
 * fixture는 /api/debug/kamis-catalog 응답. 인자를 생략하면
 * db/fixtures/ 의 최신 파일을 쓴다. 최신 데이터로 다시 검증하려면:
 *   curl -s https://vegi-wang.vercel.app/api/debug/kamis-catalog \
 *     -o db/fixtures/kamis-catalog-$(date +%F).json
 *
 * 판정 기준 — 추정하지 않는다:
 *   1. KAMIS에 도매 시세가 존재하는가 (없으면 경락가 원천이 없다)
 *   2. 카탈로그 weightKg == parseUnitKg(KAMIS 도매 단위)
 *   3. 내부 모순 없음 (kgPerConsumerUnit <= weightKg,
 *      auctionUnit 문자열과 weightKg 일치)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

/** KAMIS 품목명이 카탈로그 품목명과 다른 경우의 명시적 별칭 */
const KAMIS_ALIASES = {
  "대파": ["파"],
};

/**
 * 가락 경매결과의 품목명 별칭.
 *
 * 가락은 카탈로그와 다른 표기를 쓰는 품목이 있다. 이름 하나만 질의하면
 * 부분매칭이 0건이 되어 그 품목은 **수집 자체가 안 된다** — 화면에서
 * 조용히 사라지는 경로라 KAMIS 별칭보다 위험하다.
 * 확인: /api/debug/sources?items=... (2026-08-03 실측)
 */
const GARAK_ALIASES = {
  "멜론": ["메론"],
  "피마늘": ["마늘"],
};

/**
 * 가락 거래단량 실측 근거.
 *
 * KAMIS 도매 단위와 대조하는 검증은 **KAMIS가 원천일 때만** 타당하다.
 * 청과의 경락가 원천은 가락이고, 가락은 행마다 UUN(거래단량)을 주므로
 * 원/kg 환산이 행 단위로 자기완결한다. 두 소스의 단위가 다르다는 이유로
 * 품목을 버리면, 근거가 있는 값을 근거 없다며 감추는 셈이 된다.
 *
 * 그래서 KAMIS 대조를 대신할 수 있는 유일한 것이 원천 실측이다.
 * 추정이 아니라 **관측**이어야 하므로 측정일·최빈 단량·행수를 함께 적는다.
 * 갱신하려면 raw_auction에서 해당 품목의 unit 분포를 다시 뽑을 것.
 */
const GARAK_UNIT_EVIDENCE = {
  "수박": { weightKg: 10, unit: "10kg", rows: 209, total: 1085, measured: "2026-08-03" },
  "피마늘": { weightKg: 20, unit: "20kg", rows: 75, total: 77, measured: "2026-08-03" },
  "참다래(수입)": { weightKg: 6, unit: "6kg", rows: 31, total: 49, measured: "2026-07-20~08-03" },
  "레몬(수입)": { weightKg: 18, unit: "18kg", rows: 20, total: 29, measured: "2026-07-20~08-03" },
  "아보카도(수입)": { weightKg: 5, unit: "5kg", rows: 1, total: 1, measured: "2026-07-20~08-03" },
};

/**
 * 해수부 위판 표준코드명(mprcStdCodeNm) 별칭 후보.
 *
 * 매칭 실패는 "값이 틀림"이 아니라 "품목이 안 보임"으로 끝나므로 안전하다.
 * 실제 코드명은 `/api/debug/fish-market`이 내려주는 목록으로 확정한다.
 */
const FISH_ALIASES = {
  "물오징어": ["오징어", "살오징어"],
  "조기": ["참조기"],
  "꽃게": ["꽃게"],
  "새우": ["흰다리새우", "대하"],
};

/** 국내 산지 위판 원천이 없는 품목 (수입산 등) */
const NO_DOMESTIC_LANDING = new Set(["수입조기"]);

function parseUnitKg(unit) {
  if (!unit) return null;
  const kg = unit.match(/([\d.]+)\s*kg/i);
  if (kg) return parseFloat(kg[1]);
  const g = unit.match(/([\d.]+)\s*g(?![a-z])/i);
  if (g) return parseFloat(g[1]) / 1000;
  return null;
}

function loadFixture() {
  const arg = process.argv[2];
  if (arg) return JSON.parse(readFileSync(resolve(ROOT, arg), "utf8"));
  const dir = resolve(ROOT, "db/fixtures");
  // 전 부류(100~600) fixture가 있으면 우선한다 — 감자·버섯 등이 여기에만 있다
  const all = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const files = all
    .filter((f) => f.startsWith("kamis-catalog-all-"))
    .sort();
  if (!files.length) {
    files.push(
      ...all.filter((f) => f.startsWith("kamis-catalog-")).sort(),
    );
  }
  if (!files.length) {
    console.error("db/fixtures 에 kamis-catalog-*.json 이 없습니다.");
    process.exit(1);
  }
  const chosen = files.at(-1);
  console.log(`fixture: db/fixtures/${chosen}\n`);
  return JSON.parse(readFileSync(resolve(dir, chosen), "utf8"));
}

/** catalog-items.ts 의 객체 리터럴을 읽는다 (한 줄 = 한 품목) */
function loadCatalog() {
  const src = readFileSync(resolve(ROOT, "src/lib/catalog-items.ts"), "utf8");
  const field = (line, key) => {
    const m = line.match(new RegExp(`\\b${key}:\\s*("([^"]*)"|[\\d.]+|true|false)`));
    if (!m) return undefined;
    if (m[2] !== undefined) return m[2];
    if (m[1] === "true") return true;
    if (m[1] === "false") return false;
    return parseFloat(m[1]);
  };
  const items = [];
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("{ id:")) continue;
    items.push({
      _line: raw,
      id: field(line, "id"),
      name: field(line, "name"),
      category: field(line, "category"),
      queryName: field(line, "queryName"),
      auctionUnit: field(line, "auctionUnit"),
      weightKg: field(line, "weightKg"),
      consumerUnit: field(line, "consumerUnit"),
      kgPerConsumerUnit: field(line, "kgPerConsumerUnit"),
      grade: field(line, "grade"),
      origin: field(line, "origin"),
      kamisCategoryCode: field(line, "kamisCategoryCode"),
    });
  }
  return { src, items };
}

const fixture = loadFixture();
const { src, items } = loadCatalog();

const kamisByName = new Map();
for (const row of fixture.items) kamisByName.set(row.name, row);

function findKamis(item) {
  const candidates = [
    item.name,
    item.queryName,
    item.name.replace(/\(.*?\)/g, "").trim(),
    ...(KAMIS_ALIASES[item.name] ?? []),
  ].filter(Boolean);
  for (const c of candidates) {
    const hit = kamisByName.get(c);
    if (hit) return { row: hit, matchedAs: c };
  }
  return { row: null, matchedAs: null };
}

const results = [];
for (const item of items) {
  const { row, matchedAs } = findKamis(item);
  const problems = [];
  const evidence = [];

  const isSeafood = item.category === "수산";

  if (isSeafood) {
    /*
     * 수산의 원/kg 원천은 해수부 위판장이다.
     * csmtAmount(금액) ÷ csmtWt(중량)이므로 거래단위 문자열을 파싱할 필요가
     * 없고, 따라서 KAMIS 도매 단위와 weightKg를 대조할 이유도 없다.
     * weightKg는 "실제 경매 N kg 얼마" 표시에만 쓰인다.
     */
    if (NO_DOMESTIC_LANDING.has(item.name)) {
      problems.push(
        "국내 산지 위판 원천 없음 (수입산) — 위판장 API로 커버되지 않는다",
      );
    } else {
      evidence.push(
        "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요",
      );
      const fishAlias = FISH_ALIASES[item.name];
      if (fishAlias) {
        evidence.push(`위판 표준코드명 후보 ${fishAlias.map((a) => `"${a}"`).join(", ")}`);
      }
    }
    if (row?.hasRetail) {
      const retailKg = parseUnitKg(row.retailUnit);
      if (retailKg != null) {
        evidence.push(`KAMIS 소매 단위 "${row.retailUnit}" 중량 기반 — 원/kg 환산 가능`);
      } else if (item.kgPerConsumerUnit > 0) {
        evidence.push(
          `KAMIS 소매 단위 "${row.retailUnit}"는 개수 기반 — 카탈로그 ${item.kgPerConsumerUnit}kg/${item.consumerUnit}로 환산`,
        );
      } else {
        problems.push(
          `KAMIS 소매 단위 "${row.retailUnit}" 환산 근거 없음 (kgPerConsumerUnit 미설정)`,
        );
      }
    }
  } else if (GARAK_UNIT_EVIDENCE[item.name]) {
    /*
     * 원천(가락) 실측이 있는 품목은 KAMIS 대조를 건너뛴다.
     * 대조 대상이 아니라 대조의 근거 자체가 원천에서 나왔기 때문이다.
     */
    const g = GARAK_UNIT_EVIDENCE[item.name];
    if (Math.abs(g.weightKg - item.weightKg) > 1e-6) {
      problems.push(
        `weightKg=${item.weightKg} ≠ 가락 실측 최빈 거래단량 "${g.unit}"(${g.weightKg}kg)`,
      );
    } else {
      evidence.push(
        `가락 실측 거래단량 최빈 "${g.unit}" ${g.rows}/${g.total}행 (${g.measured}) — 행 단위 원/kg 환산이 자기완결`,
      );
    }
  } else if (!row) {
    problems.push("KAMIS 품목 목록에 없음 — 별칭 선언 또는 카탈로그 제외 필요");
  } else {
    if (matchedAs !== item.name) evidence.push(`KAMIS 품목명 "${matchedAs}"로 매칭`);
    if (!row.hasWholesale) {
      problems.push(
        `KAMIS 도매 시세 없음 (소매 단위 "${row.retailUnit}"만 존재) — 경락가 원천이 없다`,
      );
    } else {
      const kamisKg = parseUnitKg(row.wholesaleUnit);
      if (kamisKg == null) {
        problems.push(
          `KAMIS 도매 단위 "${row.wholesaleUnit}"가 개수 기반 — 중량 근거를 소스에서 얻을 수 없음`,
        );
      } else if (Math.abs(kamisKg - item.weightKg) > 1e-6) {
        problems.push(
          `weightKg=${item.weightKg} ≠ KAMIS 도매 단위 "${row.wholesaleUnit}"(${kamisKg}kg)`,
        );
      } else {
        evidence.push(`KAMIS 도매 단위 "${row.wholesaleUnit}" = ${kamisKg}kg 일치`);
      }
    }
  }

  const declared = parseUnitKg(item.auctionUnit);
  if (declared != null && Math.abs(declared - item.weightKg) > 1e-6) {
    problems.push(
      `auctionUnit "${item.auctionUnit}"(${declared}kg) ≠ weightKg=${item.weightKg}`,
    );
  }
  if (item.kgPerConsumerUnit > item.weightKg) {
    problems.push(
      `소비자단위 ${item.consumerUnit}(${item.kgPerConsumerUnit}kg) > 거래단위 전체(${item.weightKg}kg)`,
    );
  }

  results.push({
    item,
    kamis: row,
    matchedAs,
    ok: problems.length === 0,
    problems,
    evidence,
  });
}

/* ── catalog-items.ts 전체 재생성 ───────────────────────────
 * 줄 단위 정규식 패치는 verificationNote 안의 이스케이프된 따옴표에서
 * 깨진다. 파싱된 값으로 파일 전체를 다시 쓰는 편이 안전하다.
 */

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

function serialize(r) {
  const it = r.item;
  const note = r.ok ? r.evidence.join(" / ") : r.problems.join(" / ");
  const kamisAlias = KAMIS_ALIASES[it.name];
  const garakAlias = it.category !== "수산" ? GARAK_ALIASES[it.name] : null;
  const fishAlias = it.category === "수산" ? FISH_ALIASES[it.name] : null;
  const aliasParts = [];
  if (kamisAlias) {
    aliasParts.push(`kamis: [${kamisAlias.map((a) => `"${esc(a)}"`).join(", ")}]`);
  }
  if (garakAlias) {
    aliasParts.push(`garak: [${garakAlias.map((a) => `"${esc(a)}"`).join(", ")}]`);
  }
  if (fishAlias) {
    aliasParts.push(`fishMarket: [${fishAlias.map((a) => `"${esc(a)}"`).join(", ")}]`);
  }
  const parts = [
    `id: "${esc(it.id)}"`,
    `name: "${esc(it.name)}"`,
    `category: "${esc(it.category)}"`,
  ];
  if (it.queryName) parts.push(`queryName: "${esc(it.queryName)}"`);
  parts.push(
    `auctionUnit: "${esc(it.auctionUnit)}"`,
    `weightKg: ${it.weightKg}`,
    `consumerUnit: "${esc(it.consumerUnit)}"`,
    `kgPerConsumerUnit: ${it.kgPerConsumerUnit}`,
    `grade: "${esc(it.grade)}"`,
    `origin: "${esc(it.origin)}"`,
  );
  if (it.kamisCategoryCode) {
    parts.push(`kamisCategoryCode: "${esc(it.kamisCategoryCode)}"`);
  }
  if (aliasParts.length) {
    parts.push(`aliases: { ${aliasParts.join(", ")} }`);
  }
  parts.push(
    `unitVerified: ${r.ok}`,
    `verificationNote: "${esc(note)}"`,
  );
  return `  { ${parts.join(", ")} },`;
}

const byCat = (c) =>
  results
    .filter((r) => r.item.category === c)
    .map(serialize)
    .join("\n");

const header = src.slice(0, src.indexOf("export const CATALOG_ITEMS"));
const rebuilt = `${header}export const CATALOG_ITEMS: CatalogItem[] = [
  // ── 채소 ──────────────────────────────────────────────
${byCat("채소")}

  // ── 과일 ──────────────────────────────────────────────
${byCat("과일")}

  // ── 수산 ──────────────────────────────────────────────
${byCat("수산")}
];
`;
writeFileSync(resolve(ROOT, "src/lib/catalog-items.ts"), rebuilt, "utf8");

/* ── 리포트 ────────────────────────────────────────────────── */

const passed = results.filter((r) => r.ok);
const failed = results.filter((r) => !r.ok);

const section = (title, rows) =>
  rows.length
    ? `### ${title} (${rows.length})\n\n| 품목 | 거래단위 | weightKg | 판정 근거 |\n|---|---|---:|---|\n` +
      rows
        .map(
          (r) =>
            `| ${r.item.name} | ${r.item.auctionUnit} | ${r.item.weightKg} | ${
              r.ok ? r.evidence.join("<br>") : r.problems.join("<br>")
            } |`,
        )
        .join("\n") +
      "\n"
    : "";

const doc = `# 카탈로그 환산표 검증 리포트

> 자동 생성: \`node scripts/verify-catalog.mjs\`
> 대조 기준: KAMIS \`/api/debug/kamis-catalog\` 실응답 (${fixture.date})

**${passed.length}개 통과 / ${failed.length}개 미통과 (총 ${results.length}개)**

미통과 품목은 \`unitVerified: false\`로 표시되어 서빙에서 제외된다.
환산 근거가 없는 값을 노출하느니 품목 수를 줄이는 쪽을 택한다.

${section("통과", passed)}
${section("미통과", failed)}
## 미통과 사유 분류

| 사유 | 건수 | 대응 |
|---|---:|---|
| KAMIS 도매 시세 없음 | ${failed.filter((r) => r.problems.some((p) => p.includes("도매 시세 없음"))).length} | 경락가 원천 부재. 해수부 위판장 API 등 별도 소스 확보 전까지 비노출 |
| 도매 단위가 개수 기반 | ${failed.filter((r) => r.problems.some((p) => p.includes("개수 기반"))).length} | 가락 UUN으로 실중량 확인 후 수기 확정 필요 |
| weightKg 불일치 | ${failed.filter((r) => r.problems.some((p) => p.includes("≠ KAMIS"))).length} | 카탈로그 값을 KAMIS 단위로 정정 |
| 내부 모순 | ${failed.filter((r) => r.problems.some((p) => p.includes(">") || p.includes("auctionUnit"))).length} | 카탈로그 수기 정정 |
| KAMIS 목록에 없음 | ${failed.filter((r) => r.problems.some((p) => p.includes("목록에 없음"))).length} | 별칭 선언 또는 카탈로그 제외 |
`;

writeFileSync(resolve(ROOT, "docs/CATALOG_VERIFICATION.md"), doc, "utf8");

console.log(`통과 ${passed.length} / 미통과 ${failed.length} (총 ${results.length})\n`);
for (const r of failed) {
  console.log(`  ✗ ${r.item.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
}
console.log("\n→ src/lib/catalog-items.ts, docs/CATALOG_VERIFICATION.md 갱신됨");
