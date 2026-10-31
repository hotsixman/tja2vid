# tja2vid

TJA 채보와 음원을 넣으면 **OpenTaiko 스타일 오토플레이 영상**을 만들어 주는 웹 앱입니다.
Svelte 5 + Vite로 만들었고, 모든 처리(채보 해석, 렌더링, 인코딩)는 브라우저 안에서 이루어집니다. 서버로 업로드되는 파일은 없습니다.

## 기능

- TJA 해석: `#BPMCHANGE`, `#SCROLL`, `#MEASURE`, `#DELAY`, `#GOGOSTART/END`, `#BARLINEON/OFF`, 분기(`#BRANCHSTART`, `#N/#E/#M`), 풍선(`BALLOON`, `BALLOONNOR/EXP/MAS`), 여러 난이도, `#START P1/P2`
- 인코딩 자동 감지 (BOM → UTF-8 → Shift_JIS), 수동 선택 가능 (EUC-KR/CP949, GB18030 등)
- 오토플레이 시뮬레이션: 판정, 콤보, 점수, 게이지, 연타/풍선 (연타 속도 조절)
- OpenTaiko 기본 스킨("Open-World Memories") 에셋과 GameConfig.ini 좌표를 사용한 화면 구성
  - 노트 + 노트 아래 문구 (Don/Do/Ko/Ka/Kat …), 마디선, 판정 원, 판정 문구, 폭발 이펙트, 날아가는 노트, 레인 플래시
  - 북 타격 애니메이션, 콤보, 점수, 난이도 아이콘, 클리어 게이지와 혼, GOGO 타임 불꽃, 연타/풍선 카운터, 배경, 곡 제목
- 실시간 미리보기 (타격음 포함)
- **60fps / 120fps** 선택, 720p ~ 4K 해상도, 화질 선택
- WebCodecs로 인코딩: MP4 (H.264 + AAC/Opus), 지원하지 않는 브라우저에서는 WebM (VP9 + Opus)
- 스킨 교체 가능 (아래 [스킨](#스킨) 참고)

## 시작하기

```bash
npm install
npm run fetch-assets   # OpenTaiko 기본 스킨 에셋 내려받기 (public/skins/opentaiko/)
npm run dev
```

브라우저에서 http://localhost:5173 을 열고 `.tja` 파일과 음원 파일을 함께 선택하거나 창에 끌어다 놓으면 됩니다.
여러 음원을 같이 넣으면 TJA의 `WAVE:` 값과 이름이 같은 파일을 고릅니다.

정적 배포용 빌드는 `npm run build` → `dist/` 입니다 (`base: './'` 이므로 어느 경로에 올려도 됩니다).
배포 전에 `npm run fetch-assets`를 실행해 두어야 `dist/skins/opentaiko/`에 스킨이 포함됩니다.

### 브라우저 요구 사항

WebCodecs(`VideoEncoder`)와 `OffscreenCanvas`가 필요합니다. 최신 Chrome / Edge 를 권장합니다. 다른 브라우저는 WebCodecs 지원 범위(특히 오디오 인코더)에 따라 동작이 다를 수 있습니다.
렌더링은 실시간보다 빠를 수도, 느릴 수도 있으며 GPU 가속 여부에 따라 차이가 큽니다. 결과 영상은 메모리에 모았다가 내려받으므로, 긴 곡을 4K/120fps로 뽑을 때는 메모리 사용량에 유의하세요.

## OpenTaiko 에셋 라이선스

기본 스킨 에셋은 **이 저장소에 포함되어 있지 않습니다.** `npm run fetch-assets`가 [OpenTaiko](https://github.com/0auBSQ/OpenTaiko) 저장소에서 필요한 파일만 받아 `public/skins/opentaiko/`(git에서 제외됨)에 저장합니다.

이 에셋들은 **OpenTaiko Extended License**(받은 폴더의 `LICENSE.md`)를 따릅니다. 요약하면 OpenTaiko와 관련된 영상·방송에서의 사용(광고 수익 포함)은 허용되지만, 공식 저장소의 직접 포크가 아닌 곳에서의 재배포와 그 밖의 상업적 이용은 금지됩니다. 그래서 에셋을 저장소에 커밋하지 않고, 사용하는 사람이 직접 내려받도록 했습니다. 공개 배포할 때도 이 조건을 확인하세요.

## 스킨

렌더러는 스킨 **매니페스트**(이미지 경로 + 레이아웃 좌표)만 보고 그리기 때문에, 코드를 고치지 않고 스킨을 바꿀 수 있습니다. 없는 이미지는 건너뛰므로 일부만 바꾼 스킨도 동작합니다.

앱의 "스킨 폴더 불러오기…"로 폴더를 고르면 다음 순서로 해석합니다.

1. **`skin.json`이 있는 폴더** — 기본(OpenTaiko) 매니페스트 위에 덮어씁니다.
2. **OpenTaiko 형식 스킨 폴더** (`GameConfig.ini`, `Graphics/5_Game/...`) — 같은 상대 경로에서 이미지를 읽고 `GameConfig.ini` / `SkinConfig.ini`의 1P 좌표를 적용합니다. 그래서 OpenTaiko용 커스텀 스킨을 그대로 쓸 수 있습니다.
3. 그 외 — 기본 매니페스트 경로대로 찾습니다.

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
  "sounds": {
    "don": "sounds/don.wav",
    "ka": "sounds/ka.wav"
  },
  "layout": {
    "scrollField": [523, 286],
    "pxPer4Beats": 1440
  },
  "credits": "My Skin © me"
}
```

- 이미지 키 목록: `src/lib/skin/types.ts`의 `IMAGE_KEYS`
- 레이아웃 필드와 의미: `src/lib/skin/types.ts`의 `SkinLayout`, 기본값은 `src/lib/skin/opentaiko.ts`
- 스프라이트 시트 규칙은 OpenTaiko와 같습니다 (예: `notes`는 13열 시트, `seNotes`는 12행, `judge`는 5행, 폭발은 7프레임 × 4행).

새 스킨을 앱에 내장하려면 `SkinManifest`를 하나 더 만들어 `loadSkin(urlResolver('/skins/<id>/'), MY_MANIFEST)`로 불러오면 됩니다.
그리기 방식 자체를 바꾸고 싶다면 `FrameRenderer` 인터페이스(`render(ctx, songTimeMs)`)를 구현한 새 렌더러를 만들면 미리보기·내보내기에 그대로 연결됩니다.

## 구조

```
src/
  App.svelte                 UI (파일 입력, 옵션, 내보내기)
  lib/components/Preview.svelte  캔버스 미리보기 + 오디오 재생
  lib/tja/                   TJA 디코딩/파싱 → 시간이 매겨진 노트, 마디선, GOGO 구간
  lib/sim/autoplay.ts        오토플레이 시뮬레이션 (타격, 판정, 콤보/점수/게이지 타임라인)
  lib/skin/                  스킨 타입, OpenTaiko 매니페스트 + ini 파서, 로더 (URL / 폴더)
  lib/render/renderer.ts     OpenTaiko 스타일 프레임 렌더러
  lib/audio/mix.ts           음원 + 타격음 믹싱 (OfflineAudioContext)
  lib/video/export.ts        프레임 단위 렌더링 + WebCodecs 인코딩 (mediabunny)
  lib/timeline.ts            영상 시작/끝 계산
scripts/fetch-opentaiko-assets.mjs
test/                        파서/시뮬레이터 테스트 (vitest)
```

## 개발

```bash
npm test         # vitest
npm run check    # svelte-check (타입 검사)
npm run build
```

## 알려진 제한

- 1인 플레이 화면만 지원합니다 (더블 플레이 채보는 P1/P2를 따로 고를 수 있습니다).
- 캐릭터, 댄서, 몹, 단위도장/타워 연출, 쿠스다마 전용 연출, `#JPOSSCROLL`, 세로 스크롤(복소수 `#SCROLL`의 허수부)은 아직 그리지 않습니다.
- 점수는 진타(真打)에 가까운 단순화된 계산이고, 게이지 증가량은 난이도별 근사치입니다.
