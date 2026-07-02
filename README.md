# AI Entertainment CEO 🎤

3명이 실시간으로 접속해서 각자 엔터테인먼트 회사를 운영하는 1년(12턴)짜리 경영 시뮬레이션 게임 MVP입니다.

## 지금 만들어진 기능 (MVP 범위)
- **방 코드 시스템**: "새 게임 만들기"로 방을 만들면 6자리 코드가 생성됨. 다른 사람은 코드 입력하거나 공유된 링크로 그 방에 입장
- 이름/회사명 입력 → 한 방에 3명 모이면 자동 시작
- 매 턴: 연습생 모집 / 트레이닝 / 그룹 결성 / 컴백·데뷔 / 마케팅 / 휴식 / 투자 중 하나 선택
- 3명 다 선택하면 서버가 계산 → AI가 "왜 그런 결과가 나왔는지" 설명 + 뉴스 문구 생성
- 실시간 동기화 (Firestore) + 접속 끊김 감지 (Realtime Database presence, 방 단위로 분리)
- 12턴 종료 시 각 회사의 AI 결산 기사 생성
- 여러 방이 동시에 열릴 수 있음 (친구 그룹마다 서로 다른 방에서 동시 플레이 가능)

아직 없는 것 (다음 단계): 병크 시스템, 작곡가 계약, 연말 시상식, 해외진출 등 세부 액션. 뼈대가 잡혔으니 하나씩 추가하면 됩니다.

---

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → "프로젝트 추가"
2. 프로젝트 이름 입력 후 생성 (Google 애널리틱스는 꺼도 무방)
3. 왼쪽 메뉴 **Firestore Database** → "데이터베이스 만들기" → 위치는 `asia-northeast3(서울)` 추천 → **테스트 모드**로 시작 (나중에 `firestore.rules` 파일 내용 붙여넣기)
4. 왼쪽 메뉴 **Realtime Database** → "데이터베이스 만들기" → 위치는 가까운 곳 아무거나 → **테스트 모드**로 시작 (나중에 `database.rules.json` 내용 붙여넣기)

### 보안 규칙 적용
- Firestore → 규칙 탭 → 이 프로젝트의 `firestore.rules` 파일 내용을 그대로 붙여넣고 게시
- Realtime Database → 규칙 탭 → `database.rules.json` 내용을 그대로 붙여넣고 게시

### 웹 앱 등록 (클라이언트 설정값 받기)
1. 프로젝트 설정(톱니바퀴) → 일반 → 아래로 스크롤 → "앱 추가" → 웹(</>) 선택
2. 앱 닉네임 아무거나 입력 → 등록
3. 나오는 `firebaseConfig` 객체 값을 복사해서 `public/firebase-config.js` 파일의 `window.FIREBASE_CONFIG` 안에 붙여넣기
4. `databaseURL`은 Realtime Database 페이지 상단에 표시된 URL을 그대로 넣기

### 서버용 비공개 키 받기 (백엔드에서만 사용, 절대 공개 금지)
1. 프로젝트 설정 → 서비스 계정 탭 → "새 비공개 키 생성" → JSON 파일 다운로드
2. 이 JSON 파일 내용을 통째로 한 줄로 만들어서 `.env` 파일의 `FIREBASE_SERVICE_ACCOUNT_JSON`에 넣기
   (아래 "환경변수 설정" 참고)

---

## 2. NVIDIA API 키 받기

1. https://build.nvidia.com 접속 → 로그인 → 원하는 모델(`meta/llama-3.3-70b-instruct` 등) 페이지에서 API 키 발급
2. `.env`의 `NVIDIA_API_KEY`에 넣기

---

## 3. 환경변수 설정 (.env 파일)

이 프로젝트 최상위 폴더에 `.env`라는 파일을 새로 만들고, `.env.example`을 참고해서 아래처럼 채우세요:

```
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...", ... 전체 JSON을 한 줄로 ...}
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxx
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
PORT=3000
```

> 팁: 다운로드한 서비스 계정 JSON 파일을 열어서 전체를 복사한 뒤, 줄바꿈이 포함된 상태 그대로 `.env`의 값 부분에 붙여넣으면 됩니다. (따옴표로 감싸지 마세요)

---

## 4. 로컬에서 실행해보기

터미널(명령 프롬프트)을 열고:

```bash
cd kpop-ceo-game
npm install
npm start
```

`서버 실행 중: http://localhost:3000` 이라고 뜨면 성공. 브라우저에서 `http://localhost:3000` 열기.
같은 게임을 3명이 테스트하려면 브라우저 3개(또는 시크릿창 3개)를 열어서 각각 다른 이름으로 입장하면 됩니다.
(시크릿창마다 `localStorage`가 분리되어서 서로 다른 playerId를 갖게 됩니다.)

---

## 5. 배포하기 (친구들과 실제로 플레이하려면)

### 백엔드 (서버) 배포 — Render 추천
1. https://render.com 가입 → New → Web Service
2. 이 프로젝트 코드를 GitHub 저장소에 올린 뒤 연결 (또는 파일 직접 업로드 방식 사용)
3. Build Command: `npm install` / Start Command: `npm start`
4. Environment 탭에서 `.env`에 넣었던 값들을 그대로 등록 (FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_DATABASE_URL, NVIDIA_API_KEY, NVIDIA_MODEL)
5. 배포되면 `https://xxxx.onrender.com` 같은 주소가 생김

### 프론트엔드 배포 — Firebase Hosting 추천 (이전에 써봤던 방식)
1. `public/firebase-config.js`의 `window.API_BASE_URL`을 방금 받은 Render 주소로 변경
2. `firebase deploy --only hosting` (firebase-tools CLI 설치 및 `firebase init hosting` 먼저 필요, public 폴더를 배포 대상으로 지정)
3. 배포된 링크를 친구 2명에게 공유하면 끝

---

## 폴더 구조

```
kpop-ceo-game/
├── server/
│   ├── index.js         # Express 서버, API 라우트
│   ├── gameLogic.js      # 연습생 생성, 트렌드, 턴 결과 계산 공식
│   ├── ai.js              # NVIDIA API 호출 (원인 설명 + 뉴스 생성)
│   └── firebaseAdmin.js  # Firebase Admin SDK 초기화
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js             # 클라이언트 로직 (Firebase 실시간 구독 + UI)
│   └── firebase-config.js # 여기에 본인 Firebase 프로젝트 설정값 입력
├── firestore.rules
├── database.rules.json
├── .env.example
└── package.json
```

## 다음에 추가하면 좋을 것들
- 병크 시스템 (gameLogic.js의 resolveAction에 랜덤 이벤트 로직 추가)
- 작곡가 계약 (연습생처럼 작곡가 풀 만들어서 comeback 액션에 반영)
- 연말 시상식 (turn === 12일 때 각 그룹 인기 비교해서 수상자 산출)
- 그룹 인기(popularity) 필드를 실제로 활용해서 다음 턴 컴백 보너스에 반영
