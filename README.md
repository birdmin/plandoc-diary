# 플랜두씨 다이어리 (카드 1 — 계획)

## 준비
1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `sql/schema.sql` 내용 실행
3. Project Settings → API에서 `Project URL`, `anon public` 키 확인
4. `js/config.js`에 두 값 채우기

```js
window.SUPABASE_URL = "https://xxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ...";
```

## GitHub Pages 배포
1. 이 폴더 내용을 그대로 리포지토리 루트(또는 `/docs`)에 push
2. 리포지토리 Settings → Pages → Branch를 `main` (또는 `/docs`)로 설정
3. 발급된 주소로 접속해 확인

## 확인 방법
1. 사이트 접속 → 상단 "계획" 탭 화면이 보임
2. 폼에 제목/기간/우선순위/성공 기준/예상 시간 입력 → 저장
3. 아래 목록에 카드로 표시됨 → "수정" 눌러 값 변경 후 저장 → "이력 보기" 눌러 고치기 전 값이 남아있는지 확인
4. 새로고침, 시크릿 탭에서도 동일하게 보이는지 확인

## 주의
- `js/config.js`의 anon key는 RLS가 켜져 있는 한 공개되어도 되도록 설계된 키입니다.
- service_role 키는 절대 이 리포지토리 어디에도 넣지 마세요.
- 현재 로그인이 없으므로 링크를 아는 누구나 읽고 쓸 수 있습니다 (다음 카드/과제에서 잠금 예정).
