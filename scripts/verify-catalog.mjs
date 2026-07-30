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
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("kamis-catalog-") && f.endsWith(".json"))
    .sort();
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

  if (!row) {
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
  const aliases = KAMIS_ALIASES[it.name];
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
  if (aliases) {
    parts.push(
      `aliases: { kamis: [${aliases.map((a) => `"${esc(a)}"`).join(", ")}] }`,
    );
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
