# tja2vid

TJA 채보와 음원을 넣으면 **태고 스타일 오토플레이 영상**을 만들어 주는 웹 앱입니다.
Svelte 5 + Vite로 만들었고, 모든 처리(채보 해석, 렌더링, 인코딩)는 브라우저 안에서 이루어집니다. 서버로 업로드되는 파일은 없습니다.

## 기능

- TJA 해석: `#BPMCHANGE`, `#SCROLL`, `#MEASURE`, `#DELAY`, `#GOGOSTART/END`, `#BARLINEON/OFF`, 분기(`#BRANCHSTART`, `#N/#E/#M`), 풍선(`BALLOON`, `BALLOONNOR/EXP/MAS`), 여러 난이도, `#START P1/P2`
- 인코딩 자동 감지 (BOM → UTF-8 → Shift_JIS), 수동 선택 가능 (EUC-KR/CP949, GB18030 등)
- 오토플레이 시뮬레이션: 판정, 콤보, 점수, 게이지, 연타/풍선 (연타 속도 조절)
- 화면: 노트 + 노트 아래 문구, 마디선, 판정, 폭발 이펙트, 날아가는 노트, 레인 플래시, 북 타격, 콤보, 점수, 난이도, 클리어 게이지와 혼, GOGO 타임, 연타/풍선 카운터, 배경, 댄서, 캐릭터, 곡 제목
- 플레이 전 곡 로딩 화면 (옵션, 길이 조절)
- 시간이 걸리는 작업(스킨·음원 불러오기, 오디오 준비, 영상 만들기) 중에는 진행 상황 창이 떠서 다른 조작을 막습니다
- 실시간 미리보기 (타격음 포함)
- **60fps / 120fps** 선택, 720p ~ 4K 해상도, 화질 선택
- WebCodecs로 인코딩: MP4 (H.264 + AAC/Opus), 지원하지 않는 브라우저에서는 WebM (VP9 + Opus)
- 스킨 교체: zip 또는 폴더로 불러오기, 브라우저에 기본 스킨으로 기억

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 열고 `.tja` 파일과 음원 파일을 함께 선택하거나 창에 끌어다 놓으면 됩니다.
여러 음원을 같이 넣으면 TJA의 `WAVE:` 값과 이름이 같은 파일을 고릅니다.

### 배포 (GitHub Pages)

`.github/workflows/deploy-pages.yml`이 `main`에 푸시될 때 테스트 → 빌드 → GitHub Pages 배포를 수행합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions**로 바꿔야 합니다.
`npm run build` 결과물(`dist/`)은 `base: './'` 이므로 어느 경로에 올려도 동작합니다.

### 브라우저 요구 사항

WebCodecs(`VideoEncoder`)와 `OffscreenCanvas`가 필요합니다. 최신 Chrome / Edge 를 권장합니다. 다른 브라우저는 WebCodecs 지원 범위(특히 오디오 인코더)에 따라 동작이 다를 수 있습니다.
결과 영상은 메모리에 모았다가 내려받으므로, 긴 곡을 4K/120fps로 뽑을 때는 메모리 사용량에 유의하세요.

## 스킨

### 기본 스킨 "Neon Night"

기본 스킨은 이 프로젝트의 오리지널 스킨입니다. 이미지·소리 파일 없이 **코드로 그려서** 만듭니다(`src/lib/skin/builtin.ts`). 타격음도 합성음입니다. 그래서 저장소와 배포본에는 제3자 에셋이 전혀 들어 있지 않습니다.

### 다른 스킨 불러오기

앱의 **스킨 zip 불러오기…** 또는 **스킨 폴더 불러오기…**로 스킨을 불러올 수 있습니다.
"불러온 zip을 이 브라우저의 기본 스킨으로 기억"을 켜 두면 zip이 브라우저(IndexedDB)에 저장되어 다음에 열 때도 그 스킨이 기본으로 쓰입니다. **기본 스킨으로**를 누르면 저장이 지워집니다.
스킨 파일은 브라우저 안에서만 쓰이며 어디에도 업로드되지 않습니다. 다른 사람이 만든 스킨은 그 스킨의 이용 조건을 지켜서 사용하세요.

zip/폴더 안의 스킨 루트(설정 파일이 있는 폴더)는 자동으로 찾으며, 다음 순서로 해석합니다.

1. **`skin.json`** — 기본 매니페스트 위에 덮어씁니다.
2. **OpenTaiko 형식** (`GameConfig.ini` + `SkinConfig.ini`, `Graphics/5_Game/...`) — 1P 좌표를 적용합니다.
3. **TJAPlayer3 형식** (`SkinConfig.ini`만 있는 옛 스킨, `#include` 지원) — OpenTaiko의 1280×720 기본값 위에 스킨 값을 적용하고, `5_Background/0/1P_Up_1st.png …` 배경과 `2_Dancer/<번호>/` 댄서도 자동으로 인식합니다. `Judge.png`는 60px(720p 기준) 행으로 나눕니다.

OpenTaiko / TJAPlayer3 형식에서는 다음도 자동으로 인식합니다.

- **폰트:** `Fonts/` 폴더(또는 스킨 루트)의 `.otf` / `.ttf` / `.woff2` 파일을 곡 제목과 로딩 화면에 사용합니다.
- **캐릭터:** `Graphics/5_Game/1_Chara/` 또는 `Graphics/11_Characters/<n>/` (+ `CharaConfig.txt`). Normal / Clear / GoGo 반복 동작과 `_Max`(게이지 MAX), 10콤보 · GOGO 시작 · 클리어 · 혼 MAX · 풍선 동작을 OpenTaiko 규칙대로 재생합니다.
- **로딩 화면:** `Graphics/4_SongLoading/Bg.png · Chara.png · Plate.png`와 `SongLoading_*` 좌표.

### `skin.json` 예시

```json
{
  "id": "my-skin",
  "name": "My Skin",
  "resolution": [1920, 1080],
  "font": "fonts/MyFont.ttf",
  "images": {
    "notes": "notes.png",
    "laneBackground": "lane.png",
    "taikoBase": "drum.png"
  },
  "sounds": { "don": "sounds/don.wav", "ka": "sounds/ka.wav" },
  "layout": { "scrollField": [523, 286], "pxPer4Beats": 1440 },
  "background": {
    "color": "#000",
    "layers": [
      { "image": "bg/sky.png", "width": 1920, "height": 290, "tileX": true, "scrollX": 30 },
      { "image": "bg/sky_clear.png", "width": 1920, "height": 290, "tileX": true, "scrollX": 30, "show": "clear" },
      { "image": "bg/stage.png", "y": 540 }
    ]
  },
  "dancer": {
    "dir": "dancers",
    "folders": ["1", "2"],
    "config": { "count": 2, "x": [700, 1200], "y": [800, 800], "motion": [0, 1, 2, 1], "beat": 4, "gauge": [0, 50] }
  },
  "credits": "My Skin © me"
}
```

- 이미지 키 목록: `src/lib/skin/types.ts`의 `IMAGE_KEYS`. 레이아웃 필드: 같은 파일의 `SkinLayout`.
- `resolution`이 1920×1080이 아니면 레이아웃 기본값은 1280×720 기본값을 비율에 맞게 늘린 값입니다.
- 배경 레이어: `tileX/tileY`(반복), `scrollX/scrollY`(px/초), `bob`([진폭, 박자 주기]), `show`(`always`/`normal`/`clear` — 클리어 게이지 도달 시 교차 페이드), `opacity`.
- 댄서: 프레임은 `<dir>/<folder>/0.png, 1.png …`. `<dir>/DancerConfig.txt`가 있으면 그 값이 우선합니다. 모션은 BPM에 맞춰 `beat` 박자마다 한 바퀴 돕니다.
- 스프라이트 시트 규칙은 OpenTaiko와 같습니다 (예: `notes`는 13열 시트, `seNotes`는 12행, `judge`는 5행, 폭발은 7프레임 × 4행).

그리기 방식 자체를 바꾸고 싶다면 `FrameRenderer` 인터페이스(`render(ctx, songTimeMs)`)를 구현한 새 렌더러를 만들면 미리보기·내보내기에 그대로 연결됩니다.

## 구조

```
src/
  App.svelte                     UI (파일 입력, 옵션, 스킨, 내보내기)
  lib/components/Preview.svelte  캔버스 미리보기 + 오디오 재생
  lib/tja/                       TJA 디코딩/파싱 → 시간이 매겨진 노트, 마디선, GOGO 구간
  lib/sim/autoplay.ts            오토플레이 시뮬레이션 (타격, 판정, 콤보/점수/게이지 타임라인)
  lib/skin/builtin.ts            기본 스킨 "Neon Night" (코드로 생성)
  lib/skin/loader.ts             스킨 로더 (URL / 폴더 / zip, skin.json · OpenTaiko · TJAPlayer3 형식)
  lib/skin/opentaiko.ts          OpenTaiko 형식 경로/레이아웃/ini 해석
  lib/skin/storage.ts            기본 스킨 zip 저장 (IndexedDB)
  lib/render/renderer.ts         프레임 렌더러
  lib/audio/mix.ts               음원 + 타격음 믹싱 (OfflineAudioContext)
  lib/video/export.ts            프레임 단위 렌더링 + WebCodecs 인코딩 (mediabunny)
  lib/timeline.ts                영상 시작/끝 계산
test/                            파서/시뮬레이터/스킨 테스트 (vitest)
```

## 개발

```bash
npm test         # vitest
npm run check    # svelte-check (타입 검사)
npm run build
```

`*.zip`과 `skins/`는 `.gitignore`에 들어 있습니다. 제3자 스킨 파일은 커밋하지 마세요.

## 알려진 제한

- 1인 플레이 화면만 지원합니다 (더블 플레이 채보는 P1/P2를 따로 고를 수 있습니다).
- 캐릭터, 몹, 단위도장/타워 연출, 쿠스다마 전용 연출, `#JPOSSCROLL`, 세로 스크롤(복소수 `#SCROLL`의 허수부)은 아직 그리지 않습니다.
- 점수는 진타(真打)에 가까운 단순화된 계산이고, 게이지 증가량은 난이도별 근사치입니다.
