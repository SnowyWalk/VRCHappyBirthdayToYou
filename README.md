# Birthday World 사진 컨트롤러

Next.js + shadcn/ui + Tailwind CSS. 한 화면에서 생일자 이름을 정하고 실제 월드 벽 사진 속 8개 액자에 사진을 넣은 뒤 **BWAT v1 PNG 직접 링크**를 발급합니다.

운영 사이트: [hbd.snowywalk.me](https://hbd.snowywalk.me). EC2 Docker 운영 및 업데이트 방법은 [배포 문서](docs/DOCKER_DEPLOYMENT.md)를 참고하세요.

## 실행

Node.js 24 권장. Windows 작업 공간에서는 Webpack을 사용합니다.

```sh
npm install
npm run dev
```

http://localhost:3000 에 접속합니다. 같은 네트워크에서는 서버 컴퓨터의 LAN IP와 포트 3000을 사용합니다. 외부 접속에는 접근 가능한 HTTPS 도메인과 서버/프록시가 필요합니다.

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm start
```

## 사용

월드의 안내를 보고 들어온 방문자가 바로 쓸 수 있도록 한 화면에서 끝납니다. 첫 화면이 곧 편집 화면이며, 서버에는 처음 **링크 만들기**를 누를 때 앨범이 생깁니다.

1. **① 생일자 이름**: 입력하면 옆의 월드 무대 간판 미리보기에 바로 표시됩니다. 비워 둬도 됩니다. NFC 정규화 UTF-8 최대 128바이트이며 제어 문자는 쓸 수 없습니다.
2. **② 사진**: 실제 월드 벽 사진 위 액자를 누르거나 사진을 끌어다 놓습니다. 비율이 다르면 **사진 맞추기**(자르기/여백, 가로/세로, 위치)가 열립니다. **여러 장 한 번에 넣기**(또는 여러 장 끌어다 놓기)는 빈 액자를 대표 사진부터 순서대로 채우고, 비율이 다른 사진은 가운데를 잘라 넣습니다. 좁은 화면에서는 액자 부분을 확대하고 1–8 번호 버튼을 함께 보여 줍니다. 0–8장 모두 허용합니다.
3. **③ 링크**: 화면 아래에 항상 보이는 막대의 **링크 만들기**를 누르면 저장과 동시에 링크를 클립보드에 복사하고, 월드의 `아틀라스 이미지 URL` 칸을 보여 주는 안내 창을 엽니다. 저장 후 바꾼 내용이 있으면 버튼이 **새 링크 만들기**로 바뀌어 예전 링크를 실수로 복사하지 않게 합니다. 바뀐 내용이 없으면 **링크 복사**만 보입니다.

- 저장하면 주소가 `/edit/{uuid}#key=…`로 바뀌며, 이 주소로 다른 기기에서도 이어서 수정할 수 있습니다. 첫 화면 위쪽의 **이 브라우저에서 만든 링크**에서 바로 이어서 수정하거나 삭제할 수 있습니다. 헤더의 **불러오기**에는 월드용 PNG 링크(`?name=…` 포함), 편집 링크 또는 UUID를 넣을 수 있습니다. PNG 링크만으로는 편집 권한을 주지 않습니다.
- JPG, PNG, WebP 원본은 파일 용량 제한 없이 최대 4천만 픽셀까지 고를 수 있으며, 작은 헤더만 읽어 해상도를 먼저 검사합니다. 브라우저에서 EXIF 방향을 보정하고 긴 변 최대 2048px의 WebP(품질 92%)로 줄여 보냅니다. 서버 제한은 사진당 8MB, 요청 전체 65MB입니다.
- 사진이 바뀌면 앨범 UUID를 유지한 채 새 아틀라스를 발행하고, 이름만 바꾸면 기존 PNG를 재사용합니다. 서버는 현재 아틀라스 PNG와 설정만 보관하며, 재편집 시 아틀라스에서 사진을 복원합니다. 저장할 때마다 만료 시간이 24시간 뒤로 갱신되고, 쓰이지 않는 이전 아틀라스는 바로 삭제합니다.
- 처음에는 기기의 테마를 따르고, 헤더 버튼으로 고른 라이트/다크 테마를 기억합니다.

### 이미지

벽 사진은 홀 내부 `(∓3,4,-1)`에서 좌우 `(±3.5,1.9,2)`를 보는 FOV 95도 캡처(2026-10-04 배치)이며 `(0,300,1600,400)` 영역을 씁니다. 텍스처 네 모서리는 `artifacts/world-{left,right}.json`에 있고 `node artifacts/prepare-spatial-preview.mjs`로 `src/lib/world-view.json` 좌표를 다시 만듭니다. 사이트가 내려보내는 이미지는 `artifacts/source/`의 원본에서 `node artifacts/publish-images.mjs`로 만듭니다: 벽 2400×600 WebP(각 약 100KB), 무대 간판(이름 자리를 지운 정면 캡처), 월드 URL 입력칸 캡처. 파일명에 내용 해시를 넣어 재촬영 뒤에도 캐시된 옛 이미지를 쓰지 않게 하고, 경로는 `src/lib/world-view.json`과 `src/lib/assets.json`에 기록됩니다.

## BWAT v1

원본 규약: Birthday world 프로젝트의 `BIRTHDAY_ATLAS_PROTOCOL_V1.md`. 이 저장소의 `docs/BIRTHDAY_ATLAS_PROTOCOL_V1.md`는 구현 시점 사본입니다.

- 정확히 2048×2048, 8비트 불투명 RGB PNG.
- 상단 64px에 256바이트 헤더를 MSB 우선 8×8 흑백 셀로 기록합니다.
- 고정 panel ID, 활성 개수, 방향/저장 회전, 좌표, 이미지 revision, CRC-32/ISO-HDLC를 기록합니다. 닉네임은 PNG에 넣지 않고 URL의 name 쿼리로 전달합니다. 이름 입력 즉시 표시·복사 링크에 반영되며 빈 이름은 name=로 명시합니다.
- 등록 사진 수 0..8별 규약 템플릿으로 공통 정수 k를 최대화합니다. 필요할 때 시계 방향 90도 저장합니다.
- 사진 사방 4px gutter는 경계 픽셀을 반복하며 사진 내부 좌표만 헤더에 기록합니다.
- 새 원본은 비율 불일치 시 거절합니다. 기존 저장 사진은 방향에 따라 여백을 넣어 변형 없이 이전할 수 있습니다.
- 파일과 발행 메타데이터는 `storage/parties/{sha256}/`에 보존합니다. PNG 직접 GET은 인증·쿠키·리다이렉트 없이 image/png 원본 바이트를 반환합니다. CDN 이미지 변환을 사용하지 않습니다.
- 앨범과 발행 PNG는 마지막 저장 후 24시간이 지나면 만료됩니다. 만료된 링크는 410/404로 막고, 서버 시작 시와 1분 주기 정리 작업에서 아틀라스 파일과 설정 정보를 삭제합니다. 만료 가능한 PNG이므로 응답 캐시는 `no-store`입니다.
- 기존 개별 사진은 아틀라스 복원을 검증한 뒤 삭제하며, 참조가 없는 이전 PNG와 실패한 발행의 잔여 파일도 정리합니다. 공유 PNG는 현재 사용하는 유효 앨범이 남아 있는 동안 보관합니다. 저장 공간이 새 원본 용량과 512MiB의 여유 공간보다 적으면 저장을 거절합니다. 이미 월드에 다운로드된 텍스처는 서버에서 지울 수 없습니다.

| BWAT ID | 웹 패널 ID | Unity 오브젝트 |
| --- | --- | --- |
| 0 | hero-left | Hero portrait -1 |
| 1 | memory-left-0 | Memory -1 0 |
| 2 | memory-left-1 | Memory -1 1 |
| 3 | memory-left-2 | Memory -1 2 |
| 4 | hero-right | Hero portrait 1 |
| 5 | memory-right-0 | Memory 1 0 |
| 6 | memory-right-1 | Memory 1 1 |
| 7 | memory-right-2 | Memory 1 2 |

웹의 아틀라스 생성과 규약 검증을 구현합니다. Unity 프로젝트는 수정하지 않습니다. PC/Quest에서 월드 디코더 적용과 다운로드 허용 정책은 실제 VRChat 클라이언트에서 별도로 확인해야 합니다.

## 서버 설정

`.env.example`을 `.env.local`로 복사해 설정합니다.

```dotenv
PUBLIC_BASE_URL=https://your-domain.example
STORAGE_DIR=./storage
```

PUBLIC_BASE_URL은 반환할 아틀라스 링크의 외부 도메인입니다. 미설정 시 요청 origin을 사용합니다. 프록시 환경에서는 실제 HTTPS 도메인으로 지정하세요. STORAGE_DIR에는 현재 아틀라스와 편집 설정을 보관합니다. 이 디렉터리를 유지해야 컨테이너 교체 후에도 유효 데이터가 보존됩니다.

현재 로컬 실행은 Cloudflare Quick Tunnel로 HTTPS를 제공합니다. `.env.local`의 `PUBLIC_BASE_URL`은 이 공개 주소를 사용하므로 LAN 주소로 편집해도 복사 링크는 HTTPS입니다. 원본 PNG와 이름 쿼리를 그대로 제공하며 이미지 경로에서 리다이렉트하지 않습니다.

터널 실행 파일과 로그는 `%LOCALAPPDATA%\BirthdayWorldStudio`에 있습니다. `tools\cloudflared.exe tunnel --url http://127.0.0.1:3000 --no-autoupdate`로 실행하면 로그에 공개 주소가 표시됩니다. Quick Tunnel을 다시 만들면 주소가 달라지므로 `.env.local`의 `PUBLIC_BASE_URL`을 갱신하고 Next 서버를 재시작해야 합니다. PC 또는 터널 프로세스가 종료되면 공개 주소도 동작하지 않습니다. 장기 운영에는 고정 도메인의 Cloudflare Tunnel 또는 HTTPS 호스팅이 필요합니다. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

VRChat에서 기본 허용 목록에 없는 도메인의 이미지를 읽으려면 `Allow Untrusted URLs` 설정이 필요합니다. HTTPS 다운로드 성공과 실제 월드에서의 다운로드 허용은 별도로 확인하세요. [VRChat Image Loading](https://creators.vrchat.com/worlds/udon/image-loading/)

단일 Node 프로세스용 파일 저장소입니다. 여러 서버에는 공유 DB/락이 필요합니다. revision 충돌은 409이며 먼저 저장한 요청만 성공합니다. 편집 키는 URL fragment와 브라우저 로컬 저장소에 있고 서버에는 해시만 저장합니다.

## API

| 요청 | 동작 |
| --- | --- |
| POST /api/albums | 앨범·편집 키 생성, 첫 발행 전 dataUrl은 빈 문자열 |
| GET /api/albums/{uuid} | Bearer 편집 키 필요, album과 최신 PNG dataUrl |
| PUT /api/albums/{uuid} | Bearer + multipart 저장, PNG 발행 |
| GET /party/{sha256}/atlas.png | 24시간 공개 PNG, no-store 및 no-transform |
| GET /data/{uuid} | 기존 디버깅용 JSON, 월드 입력용 아님 |
| GET /media/{uuid}/{hash} | 현재 아틀라스에서 복원한 공개 사진 PNG |

PUT 필드: nickname, 현재 revision, 제거할 패널 ID 배열 JSON인 remove, 패널 ID를 이름으로 한 변경 이미지 파일. 사진이 그대로면 파일을 보내지 않습니다.

사진 미리보기는 실제 Unity 렌더링과 완전히 같지는 않습니다.

이미지 방향 및 리사이즈 구현 근거: [sharp image operations](https://sharp.pixelplumbing.com/api-operation/), [resizing](https://sharp.pixelplumbing.com/api-resize/).





## EC2 / Docker

Dockerfile, compose.yaml과 Nginx Proxy Manager 공유 네트워크용 compose.npm.yaml을 제공합니다. 사진과 발행 PNG는 birthday-data 볼륨에 보관하며, .env.local과 기존 storage 데이터는 빌드 이미지·Git에 포함하지 않습니다. 최초 실행, NPM 연결, 업데이트, 이관 및 백업은 [Docker 배포 안내](docs/DOCKER_DEPLOYMENT.md)를 참고하세요.
