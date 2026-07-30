# VoiceRoom 출시 추적

이 폴더는 **VoiceRoom iOS 출시**를 위한 실행 계획·작업공간 구조·정책 페이지를 담습니다.

> 실제 앱 코드 작업처는 Codex Release Workspace `voiceroom-integration`입니다.  
> 이 저장소(`vegi-wang`)에는 출시 게이트 문서와 공개 정책 사이트만 둡니다.

## 문서

| 파일 | 설명 |
|------|------|
| [WORKSPACE_STRUCTURE.md](./WORKSPACE_STRUCTURE.md) | 원본 vs 출시 작업공간 분리, DEVLOG, 출시 후 release/hotfix/next 구조 |
| [VOICEROOM_LAUNCH_PLAN.md](./VOICEROOM_LAUNCH_PLAN.md) | 출시까지 5파동·17단계 실행 계획 |
| [policy-site/](./policy-site/) | 개인정보처리방침·이용약관·지원 페이지 (정적 HTTPS 배포용) |

## 역할 한 줄

| 어디 | 무엇 |
|------|------|
| `projects/voiceroom` | 원본 개발 본진 |
| `voiceroom-integration` | **1.0 출시 통합 작업 (지금 여기)** |
| `voiceroom-launch/` (본 폴더) | 계획·구조·정책 URL |

## 지금 할 일

1. Release Workspace에서 `DEVLOG.md` 기준으로 Build 4 실기기 E2E
2. `policy-site` Vercel 배포 후 ASC Privacy/Support URL 등록
3. production은 staging Pass 이후에만
4. 1.0 출시 후 `WORKSPACE_STRUCTURE.md` §2 폴더 분리 적용 검토
