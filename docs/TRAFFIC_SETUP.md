# 트래픽 인프라 셋업 상태

> 갱신: 2026-08-02

## 자동 완료 (코드·Vercel)

| 항목 | 상태 | 위치 |
|------|------|------|
| Vercel Web Analytics | ✅ 프로젝트 enable + `@vercel/analytics` | 대시보드 Analytics |
| Vercel Speed Insights | ✅ enable + `@vercel/speed-insights` | 대시보드 Speed Insights |
| 이벤트 | ✅ `share` · `waitlist_signup` | Analytics → Events |
| sitemap.xml | ✅ | https://vegi-wang.vercel.app/sitemap.xml |
| robots.txt | ✅ | https://vegi-wang.vercel.app/robots.txt |
| JSON-LD | ✅ WebSite + Organization | layout |
| 검증 meta 훅 | ✅ env로 주입 | `NEXT_PUBLIC_*_SITE_VERIFICATION` |

대시보드: https://vercel.com/seoulrave/vegi-wang/analytics

---

## 로그인 필요 (대표 1회 · 2~5분)

아래 코드를 받으면 채팅에 붙여 주세요. env에 넣고 재배포합니다.

### 1) Google Search Console

1. https://search.google.com/search-console → **속성 추가**  
2. URL 접두어: `https://vegi-wang.vercel.app`  
3. **HTML 태그** 인증 선택 → `content="...."` 값만 복사  
4. 인증 후 **Sitemaps** → `https://vegi-wang.vercel.app/sitemap.xml` 제출

### 2) Google Analytics 4 (선택 · Vercel만으로도 UV 가능)

1. https://analytics.google.com → 계정/속성 만들기 (이름: 베지왕)  
2. 웹 스트림 URL: `https://vegi-wang.vercel.app`  
3. **측정 ID** `G-XXXXXXXX` 복사

### 3) 네이버 서치어드바이저

1. https://searchadvisor.naver.com → 사이트 추가  
2. `https://vegi-wang.vercel.app`  
3. **HTML 메타태그** 인증 → content 값 복사  
4. 인증 후 **요청 → 사이트맵 제출** `https://vegi-wang.vercel.app/sitemap.xml`  
5. (선택) 수집 요청으로 `/` · `/today` 제출

### 채팅에 보낼 형식

```
GOOGLE_VERIFICATION=xxxxxxxx
NAVER_VERIFICATION=yyyyyyyy
GA_ID=G-XXXXXXXX   (있으면)
```

---

## 확인 명령

```bash
curl -sI https://vegi-wang.vercel.app/sitemap.xml | head -5
curl -s https://vegi-wang.vercel.app/robots.txt
```
