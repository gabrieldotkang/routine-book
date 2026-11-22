# Project Specification: RoutineBook (PWA)

## 1. 프로젝트 개요 및 목적
- **앱 이름:** RoutineBook (습관과 독서의 기록)
- **핵심 컨셉:** 루티너리(Routinery)의 '순차 실행 타이머'와 북모리(Bookmory)의 '독서 페이지·서재 관리'를 하나로 결합한 크로스 플랫폼(PC, 갤럭시, 아이패드) PWA.
- **배포 경로:** GitHub Pages (`https://<username>.github.io/routine-book/`)

---

## 2. 기술 스택 및 아키텍처
- **Frontend:** React (Vite), Tailwind CSS v4 (`@tailwindcss/vite`), `lucide-react`
- **Audio:** Web Audio API (외부 음원 파일 없이 차분한 신디사이저 종소리 생성)
- **Local-First 저장소:** `localStorage` 즉시 읽기/쓰기 (`rb_books`, `rb_routine`, `rb_logs`, `rb_streak`, `rb_last_date`, `rb_completed_steps`, `rb_steps_date`)
- **Cloud 동기화:** Google Identity Services (OAuth 2.0) + Google Drive REST API v3
  - 스코프: `https://www.googleapis.com/auth/drive.appdata`
  - 저장 위치: 비공개 앱 전용 폴더(`appDataFolder`) 내 `routine_book_sync.json`
  - 동기화 방식: 로그인 시 원격 데이터 Pull, 로컬 데이터 변경 시 2초 디바운스(Debounce) 후 Multipart PATCH/POST 업로드
- **PWA 구성:** `vite-plugin-pwa` (`base: '/routine-book/'`, `start_url: '/routine-book/'`, `192x192` 및 `512x512` PNG 아이콘, iOS/iPadOS Safari `apple-mobile-web-app-capable` 메타 태그)

---

## 3. 디자인 시스템 (Editorial Paper & Analog Chronograph)
전형적인 다크/네온 AI UI를 배제하고 **따뜻한 종이 질감의 서재**와 **아날로그 시계** 감성을 유지한다.
- **컬러 팔레트:**
  - 배경(Paper): `#FAF8F5` / 카드 배경: `#FFFFFF` / 테두리: `#E6E0D4`
  - 기본 활자(Ink): `#1E1D1A` / 보조 텍스트: `#78736A`
  - 독서 포인트(Forest Green): `#2C5E4F`
  - 영어 포인트(Navy Ink): `#2B4C7E`
  - 일반·스트릭 포인트(Terracotta): `#C85A32`
- **타이포그래피:**
  - 본문: `Pretendard`
  - 앱 타이틀·도서명·인용구: `Noto Serif KR` (명조체)
  - 타이머 숫자·페이지·날짜: `JetBrains Mono` (`font-variant-numeric: tabular-nums`)
- **시각 디테일:**
  - 외곽 미세 눈금 트랙이 포함된 원형 SVG 타이머 다이얼
  - 실제 책 비율의 양장본 미니 커버 및 책갈피 스타일 진행률 바
  - 좌측 컬러 보더가 있는 만년필 독서 노트 카드

---

## 4. 핵심 기능 및 세부 비즈니스 로직 (필수 준수 사항)

### ① 루틴 타이머 및 직접 편집
- **독립적 단계 완료 상태 (`completedStepIds`):**
  - 사용자가 루틴 목록에서 중간이나 마지막 항목을 먼저 클릭해 이동하더라도, 위쪽 항목들이 자동으로 완료 처리되지 않는다.
  - 타이머가 `00:00`이 되거나 '현재 단계 완료' 버튼을 눌러 실제로 마친 항목만 완료(초록색 체크 및 취소선)로 표시되며, 다른 항목을 선택해도 기존 완료 상태는 그대로 유지된다.
  - 등록된 모든 단계를 완료하면 전체 회차가 완료된 것으로 간주하여 체크 상태를 초기화한다. (날짜가 바뀌어도 자동 초기화)
- **루틴 편집기:**
  - 화면 내에서 루틴 제목 수정, 단계 추가/삭제, 순서 이동(위/아래), 목표 시간(분) 설정, 카테고리(`normal` 일반, `english` 영어학습, `reading` 독서기록) 지정을 직접 편집하고 저장할 수 있다.

### ② 독서 연동 (Timer-to-Reading Bridge)
- 카테고리가 `reading`인 단계가 시작될 때 현재 '읽는 중'인 도서 선택 모달을 띄운다.
- 해당 독서 단계가 완료되면 '독서 기록 모달'이 열리며, 마지막으로 읽은 페이지 번호와 한 줄 메모를 입력받아 도서 진행률(`currentPage`)과 독서 노트(`readingLogs`)에 자동 반영한다. (전체 페이지 도달 시 `status: 'done'` 완독 처리)

### ③ 서재 및 독서노트 삭제 규칙 (연쇄 삭제 및 일괄 선택 삭제)
- **도서 삭제 시 연쇄 삭제:** 나의 서재에서 도서를 삭제하면 해당 도서와 연결된 **독서 문장 & 메모(`readingLogs`)도 함께 자동 삭제**된다.
- **독서 문장 & 메모 단독 삭제:** 독서 노트 영역의 개별 메모도 단독으로 삭제할 수 있다.
- **일괄 선택 삭제:** 나의 서재와 독서 노트 각각의 상단 `선택` 버튼을 누르면 체크박스 모드로 전환되며, 전체 선택 또는 다중 선택 후 한꺼번에 삭제할 수 있다.

### ④ 연속 실천 일수 (불꽃 배지) 관리
- **정확한 일일 카운트:** 하루에 루틴 전체를 여러 번 반복 완료하더라도 `lastCompletedDate`를 비교해 **하루 1회만 연속 일수가 증가**한다. 어제 완료 기록이 없으면 1일부터 다시 시작한다.
- **수동 수정 지원:** 상단 헤더의 불꽃 배지(`N일`)를 클릭하면 모달이 열리며 사용자가 원하는 연속 달성 일수로 직접 수정할 수 있다.

---

## 5. 새 채팅 요청 시 지시사항
위 명세를 기준으로 기존 코드 구조와 디자인 톤을 일관되게 유지하면서 다음 요청사항을 반영해줘:
- 매일 성장 루틴 항목을 빠르게 완료할 수 있다
- 영어 문장 암기 & 쉐도잉은 영어 문장 연습으로 문구를 수정한다
- 영어 문장 연습을 하고 나서 영어문장을 기록할 수 있도록 하고 서재 & 독서노트 처럼 영어학습 탭을 만들어서 매일의 적었던 문장과 책 한권을 연습했으면 어느정도 연습하고 있는지 서재 & 독서노트 처럼 확인할 수 있어야 한다