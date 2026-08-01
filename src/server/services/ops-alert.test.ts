import { describe, expect, it } from "vitest";
import type { IngestRun, IngestRunStatus } from "@/server/domain/models";
import { assessIngest, emptyDayStreak } from "./ops-alert";

function run(
  saleDate: string,
  status: IngestRunStatus,
  rowsUpserted = 0,
): IngestRun {
  return {
    id: `${saleDate}-${status}-${rowsUpserted}`,
    saleDate,
    marketCode: "110001",
    source: "garak",
    status,
    rowsFetched: rowsUpserted,
    rowsUpserted,
    errorMessage: null,
    startedAt: `${saleDate}T08:00:00Z`,
    finishedAt: `${saleDate}T08:01:00Z`,
  };
}

describe("emptyDayStreak", () => {
  it("최신 날짜부터 빈손인 날을 센다", () => {
    expect(
      emptyDayStreak([
        run("2026-08-01", "empty"),
        run("2026-07-31", "empty"),
        run("2026-07-30", "success", 9000),
      ]),
    ).toBe(2);
  });

  it("가장 최근이 성공이면 0이다", () => {
    expect(
      emptyDayStreak([
        run("2026-08-01", "success", 8000),
        run("2026-07-31", "empty"),
      ]),
    ).toBe(0);
  });

  /** 같은 날 수동 재실행이 성공하면 그 날은 성공한 날이다 */
  it("같은 날 재실행은 하루로 접고, 하나라도 성공하면 성공으로 본다", () => {
    expect(
      emptyDayStreak([
        run("2026-08-01", "success", 5000),
        run("2026-08-01", "empty"),
        run("2026-07-31", "success", 4000),
      ]),
    ).toBe(0);
  });

  it("행이 0인 success는 성공으로 치지 않는다", () => {
    expect(emptyDayStreak([run("2026-08-01", "success", 0)])).toBe(1);
  });

  it("입력 순서가 뒤섞여도 날짜로 정렬해 판단한다", () => {
    expect(
      emptyDayStreak([
        run("2026-07-30", "success", 100),
        run("2026-08-01", "empty"),
        run("2026-07-31", "empty"),
      ]),
    ).toBe(2);
  });
});

describe("assessIngest", () => {
  it("정상 수집은 ok", () => {
    const a = assessIngest(
      { status: "success", rowsUpserted: 9000, saleDate: "2026-08-03" },
      [run("2026-07-31", "success", 8000)],
    );
    expect(a.level).toBe("ok");
    expect(a.emptyStreak).toBe(0);
  });

  /**
   * 일요일 휴장으로 하루 비는 것은 정상이다.
   * 여기서 alert를 울리면 매주 울리고, 매주 울리는 알림은 곧 무시당한다.
   */
  it("하루 빈손은 warn에 그친다 (휴장일 수 있음)", () => {
    const a = assessIngest(
      { status: "empty", rowsUpserted: 0, saleDate: "2026-08-02" },
      [run("2026-08-01", "success", 8000)],
    );
    expect(a.level).toBe("warn");
    expect(a.emptyStreak).toBe(1);
  });

  it("이틀 연속 빈손이면 alert", () => {
    const a = assessIngest(
      { status: "empty", rowsUpserted: 0, saleDate: "2026-08-03" },
      [run("2026-08-02", "empty"), run("2026-08-01", "success", 8000)],
    );
    expect(a.level).toBe("alert");
    expect(a.emptyStreak).toBe(2);
  });

  /** 예외는 휴장으로 설명되지 않는다 — 첫날부터 알린다 */
  it("failed는 연속 일수와 무관하게 즉시 alert", () => {
    const a = assessIngest(
      { status: "failed", rowsUpserted: 0, saleDate: "2026-08-03" },
      [run("2026-08-02", "success", 8000)],
    );
    expect(a.level).toBe("alert");
  });

  it("이력이 비어 있어도 판정이 선다", () => {
    expect(
      assessIngest(
        { status: "empty", rowsUpserted: 0, saleDate: "2026-08-03" },
        [],
      ).level,
    ).toBe("warn");
  });

  /** 이번 실행이 recentRuns에 이미 들어 있어도 두 번 세지 않는다 */
  it("이번 실행이 이력에 중복돼도 연속 일수가 부풀지 않는다", () => {
    const a = assessIngest(
      { status: "empty", rowsUpserted: 0, saleDate: "2026-08-03" },
      [run("2026-08-03", "empty"), run("2026-08-02", "success", 8000)],
    );
    expect(a.emptyStreak).toBe(1);
    expect(a.level).toBe("warn");
  });
});
