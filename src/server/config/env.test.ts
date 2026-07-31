import { describe, expect, it } from "vitest";
import { isUsableDatabaseUrl } from "./env";

/**
 * 프로덕션 배포가 통째로 실패한 원인의 회귀 테스트.
 *
 * Vercel 환경변수 값 칸에 "DATABASE_URL=postgresql://..." 처럼 키 이름째
 * 붙여넣으면 postgres 클라이언트가 ERR_INVALID_URL로 던지고, 그게 페이지
 * 프리렌더를 죽여 빌드가 실패한다. 형식을 먼저 검사해 메모리로 물러난다.
 */
describe("isUsableDatabaseUrl", () => {
  it("정상 연결 문자열을 통과시킨다", () => {
    expect(
      isUsableDatabaseUrl(
        "postgresql://postgres.abc:pw@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
      ),
    ).toBe(true);
    expect(isUsableDatabaseUrl("postgres://u:p@localhost:5432/db")).toBe(true);
  });

  it("키 이름이 값에 섞인 경우를 거른다", () => {
    expect(
      isUsableDatabaseUrl("DATABASE_URL=postgresql://u:p@host:5432/db"),
    ).toBe(false);
  });

  it("대괄호 자리표시자가 남은 경우를 거른다", () => {
    expect(
      isUsableDatabaseUrl("postgresql://u:[YOUR-PASSWORD]@host:5432/db"),
    ).toBe(false);
  });

  it("빈 값·공백·다른 스킴을 거른다", () => {
    expect(isUsableDatabaseUrl("")).toBe(false);
    expect(isUsableDatabaseUrl("   ")).toBe(false);
    expect(isUsableDatabaseUrl(null)).toBe(false);
    expect(isUsableDatabaseUrl(undefined)).toBe(false);
    expect(isUsableDatabaseUrl("mysql://u:p@host:3306/db")).toBe(false);
    expect(isUsableDatabaseUrl("그냥문자열")).toBe(false);
  });

  it("앞뒤 공백은 허용한다", () => {
    expect(isUsableDatabaseUrl("  postgresql://u:p@host:5432/db  ")).toBe(true);
  });
});
