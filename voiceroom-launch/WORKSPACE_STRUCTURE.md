# VoiceRoom Release Workspace 구조

> 이 문서는 단순 폴더 설명이 아니라, **개발 / 출시 / 운영을 역할별로 분리한 작업 공간 설계**다.

---

## 1. 현재 구조 (1.0 출시 준비)

```
원본 프로젝트
C:\Users\Admin\projects\voiceroom
        │
        │  (복사 + 출시 통합)
        ▼
출시 작업 공간 (Release Integration Workspace)
C:\Users\Admin\Documents\Codex\2026-07-24\
voiceroom-c-users-admin-documents-codex\
work\voiceroom-integration
```

| 위치 | 역할 | 하는 일 | 하지 않는 일 |
|------|------|---------|--------------|
| `projects/voiceroom` | **원본 저장소 (Source)** | 마스터 코드, Git 히스토리, Expo/Supabase/패키지, 일상 개발 | 출시 직전 핫픽스·심사 대응을 여기만에서 섞지 않음 |
| `.../work/voiceroom-integration` | **출시 통합 작업공간** | App Store·TestFlight·IAP·정책·심사 대응·출시 버그 수정 | 다음 버전 신기능 본진 개발 |
| `release/integration-local-2026-07-25` | **출시 전용 브랜치** | 빌드, 버그 수정, 심사 대응 | feature 브랜치처럼 신규 기능 쌓기 |
| `DEVLOG.md` | **개발일지** | 날짜별 무엇을/왜/다음 할 일 | README 대체용이 아님 — 출시 이력의 단일 기록 |
| TestFlight Build 4 | **베타 빌드** | staging 검증 | 그대로 App Review 제출 |
| Staging Supabase | **테스트 서버** | Build 4 연동·E2E | 운영 트래픽 |
| Production Supabase | **운영 서버** | (아직 미배포) | staging 검증 전 배포 금지 |

### 왜 원본과 출시 공간을 나누는가

출시 직전에는 아래가 **동시에** 생긴다.

- 코드·버그 수정
- App Store / TestFlight 대응
- 인앱결제 · 개인정보처리방침 · 심사 대응

원본만 건드리면 **신기능 개발**과 **출시 준비**가 한 트리에서 섞인다.  
그래서 출시만을 위한 **안전한 복사본(Release Workspace)** 을 둔다. 상용 팀에서도 release branch / release freeze 와 같은 이유로 동일하게 분리한다.

### 브랜치 의미

일반적인 Git 흐름:

```
main → develop → feature/* → release/* → hotfix/*
```

현재 `release/integration-local-2026-07-25` 는:

- `release/` → 출시 준비 전용
- 신규 기능 브랜치가 아님
- 버그 수정 · 심사 대응 · 빌드용

### DEVLOG.md 규칙

매 작업마다 짧게 남긴다.

```text
2026-07-24
- RevenueCat 연결
- TestFlight Build 4 생성
- 버그 수정
- 다음: 실기기 통화 E2E
```

이어가기 위한 정보: **언제 / 무엇을 / 왜 / 다음**.

### 현재까지 진행선

```
앱 코드 → 빌드 → TestFlight Build 4 → RevenueCat(staging) → (다음) 실기기 E2E
                                              ↓
                                    production 아직 미배포
                                              ↓
                                         App Store 심사
```

순서 고정:

1. staging에서 테스트 완료  
2. production 배포  
3. production 연결 후보 빌드  
4. App Store 제출  

---

## 2. 출시 이후 권장 구조 (운영 분리)

1.0 출시 후 아래처럼 **로컬/원격 작업 공간을 역할별로 더 나누면** 운영이 수월하다.

```
projects/
  voiceroom           ← 개발(main) — 일상 feature
  voiceroom-release   ← 출시 전용 — 1.0 고정·심사·스토어 대응
  voiceroom-hotfix    ← 긴급 수정 — 운영(1.0)만 패치
  voiceroom-next      ← 다음 버전(1.1) — 신기능과 운영 분리
```

| 폴더 | 대응 브랜치 예 | 목적 |
|------|----------------|------|
| `voiceroom` | `main` / `develop` | 본진 개발 |
| `voiceroom-release` | `release/1.0.x` | 출시·스토어 메타·빌드 파이프라인 |
| `voiceroom-hotfix` | `hotfix/1.0.x-*` | 장애·심사 거절·긴급 패치 → release/main에만 반영 |
| `voiceroom-next` | `develop` / `release/1.1` | 1.0 운영과 무관한 1.1 기능 |

### 얻는 것

- **1.0 운영**과 **1.1 개발**을 동시에 진행
- 긴급 버그는 **운영 버전(hotfix)** 에만 반영
- 신기능 실험이 출시/운영 트리를 오염시키지 않음

### 반영 규칙 (간단)

```
hotfix 수정
  → release/1.0.x 에 머지 → 스토어 빌드
  → main 에도 cherry-pick/머지 (이력 동기화)
  → next(1.1) 필요 시 선택 반영

next(1.1) 기능
  → 절대 직접 production hotfix 트리에 섞지 않음
  → 1.1 release 게이트를 통과한 뒤에만 승격
```

---

## 3. 이 Cursor 문서 저장소와의 관계

| 저장소/경로 | 역할 |
|-------------|------|
| `projects/voiceroom` | 원본 코드 (Windows 로컬) |
| Codex `voiceroom-integration` | **현재 1.0 출시 통합 작업의 실제 코드 작업처** |
| `vegi-wang` / `voiceroom-launch/` | 출시 **계획·정책 사이트·구조 문서** (앱 런타임 코드 아님) |

앱 수정·EAS 빌드·Supabase 배포는 **항상 Release Workspace (`voiceroom-integration`)** 에서 하고,  
이 폴더의 문서는 게이트·정책 URL·구조 합의용으로 유지한다.

---

## 4. 작업자가 헷갈리지 않게 — 한 줄 규칙

1. **새 기능?** → `projects/voiceroom` (또는 출시 후 `voiceroom-next`)  
2. **1.0 출시·심사·TestFlight·IAP?** → `voiceroom-integration` + `release/...`  
3. **운영 중 긴급 장애?** → (출시 후) `voiceroom-hotfix`  
4. **무엇을 했는지 남기기?** → 해당 워크스페이스의 `DEVLOG.md`  
5. **staging 통과 전 production 금지**

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-30 | Release Workspace 역할 분리·DEVLOG·출시 후 4폴더 운영안 문서화 |
