# VoiceRoom 정책·지원 사이트

정적 HTML입니다. App Store Connect의 **Privacy Policy URL** / **Support URL**에 사용할 공개 HTTPS 페이지입니다.

## 로컬 미리보기

```bash
npx --yes serve voiceroom-launch/policy-site -p 4173
```

## Vercel 배포

1. Vercel에서 이 디렉터리(`voiceroom-launch/policy-site`)를 Root Directory로 지정하거나, 해당 폴더만 별도 프로젝트로 import
2. 배포 후 URL 확인:
   - `https://<domain>/privacy/`
   - `https://<domain>/terms/`
   - `https://<domain>/support/`
3. `support@voiceroom.app` 플레이스홀더를 실제 메일로 교체
4. `VOICEROOM_LAUNCH_PLAN.md` Step 2 완료 기준으로 DEVLOG에 URL 기록

## ASC 매핑

| ASC 필드 | 경로 |
|----------|------|
| Privacy Policy URL | `/privacy/` |
| Support URL | `/support/` |
| (선택) 약관 | `/terms/` — 앱 메타/인앱 링크 |
