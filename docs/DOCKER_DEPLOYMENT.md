# EC2 Docker 배포

앱은 한 개의 Node 프로세스로 실행하고, 사진·앨범·발행 PNG는 Docker named volume에 보관합니다. TLS와 도메인은 Nginx Proxy Manager에서 연결합니다. Linux amd64와 arm64 모두 해당 서버에서 직접 빌드할 수 있습니다.

## 현재 운영 환경

- 사이트: https://hbd.snowywalk.me
- 저장소: https://github.com/SnowyWalk/VRCHappyBirthdayToYou
- EC2 프로젝트 경로: `/home/ubuntu/VRCHappyBirthdayToYou`
- NPM 공유 네트워크: `proxy`, 전달 대상: `http://birthday-world:3000`
- NPM에서 Let's Encrypt 인증서, HTTP → HTTPS 강제 이동, HTTP/2를 설정했습니다.
- 사진과 앨범은 `vrchappybirthdaytoyou_birthday-data` 볼륨에 저장됩니다. 링크와 업로드 사진은 마지막 저장 후 24시간 동안 유지되고 앱 시작 시와 1분 주기 정리 작업으로 만료 데이터를 삭제합니다. 기존 로컬 데이터는 자동 이관하지 않았습니다.

이 서버의 수동 업데이트 명령 (`.env`에 `NPM_NETWORK`가 있으면 `compose.npm.yaml`을 자동으로 포함):

```sh
cd /home/ubuntu/VRCHappyBirthdayToYou
git pull --ff-only
bash scripts/deploy.sh
```

## GitHub Actions 자동 배포

`main`에 push하면 CI(`verify`)가 통과한 뒤 `deploy` 작업이 EC2에 SSH로 접속해 정확히 그 커밋으로 `scripts/deploy.sh`를 실행합니다. 볼륨은 유지하고 오래된 이미지만 정리하며, 마지막에 `https://hbd.snowywalk.me/` 응답을 확인합니다. 배포는 한 번에 하나씩 순서대로 실행됩니다. 비밀값이 없으면 배포 단계는 경고만 남기고 건너뜁니다.

최초 1회 설정:

1. EC2에서 배포 전용 SSH 키를 만들고 공개 키를 등록합니다.
   ```sh
   ssh-keygen -t ed25519 -N "" -C github-deploy -f ~/.ssh/github_deploy
   cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
   cat ~/.ssh/github_deploy   # 개인 키 → GitHub 비밀값 EC2_SSH_KEY
   ```
   개인 키는 GitHub에 등록한 뒤 서버에서 `rm ~/.ssh/github_deploy`로 지워도 됩니다.
2. EC2 보안 그룹에서 22번 포트가 GitHub Actions 러너에서 접근 가능해야 합니다. 내 IP로만 제한했다면 자동 배포가 접속하지 못합니다.
3. 서버의 `git pull`이 대화형 인증 없이 동작해야 합니다(공개 저장소이거나 서버에 읽기 권한 키 설정).
4. GitHub 저장소 → Settings → Secrets and variables → Actions에 등록합니다.

| 비밀값 | 값 |
| --- | --- |
| `EC2_HOST` | `54.180.125.84` 또는 SSH용 호스트 이름 |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | 위 개인 키 전체 |
| `EC2_PORT` | 선택, 기본 22 |
| `EC2_APP_DIR` | 선택, 기본 `/home/ubuntu/VRCHappyBirthdayToYou` |
| `EC2_KNOWN_HOSTS` | 선택, 권장. 로컬에서 `ssh-keyscan -H 54.180.125.84` 결과. 없으면 매번 keyscan을 신뢰합니다. |

`deploy` 작업은 `production` 환경을 사용하므로 Settings → Environments에서 승인자를 지정하면 배포 전에 수동 승인을 받을 수 있습니다.

배포 검증에서 HTTPS로 사진 8장과 유니코드 이름을 저장하고 2048×2048 PNG를 내려받았습니다. 컨테이너를 재생성한 뒤에도 앨범과 PNG의 SHA-256이 유지됨을 확인했습니다.

DNS 전용 연결 후에는 각 55MiB로 패딩한 정상 PNG 두 장을 합계 110MiB의 HTTPS multipart 요청으로 저장하는 검증도 통과했습니다. 테스트 앨범과 사진은 검증 후 삭제했습니다.

Cloudflare에 `hbd` A 레코드를 `54.180.125.84`, **DNS 전용**으로 설정했습니다. TLS는 NPM의 Let's Encrypt 인증서가 처리합니다. Cloudflare Free/Pro의 요청 전체 업로드 제한(100MB)을 통과하지 않아 여러 장의 대용량 사진을 저장할 수 있습니다. 이 레코드를 프록싱으로 바꾸면 NPM의 512MB 설정과 관계없이 Cloudflare에서 거절될 수 있습니다. [Cloudflare 업로드 제한](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/#upload-limits).

## 최초 실행

Docker Engine과 Compose v2가 설치된 EC2에서 저장소를 clone한 뒤 실행합니다. 비공개 저장소는 서버에서 읽기 권한이 있는 SSH 키 또는 GitHub 인증을 사용합니다.

```sh
cp .env.docker.example .env
# .env의 PUBLIC_BASE_URL을 실제 HTTPS 도메인으로 변경
docker compose config
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:3000/
```

`PUBLIC_BASE_URL`은 링크에 들어가는 주소이며 실행 시 주입됩니다. 도메인을 바꾼 경우 `.env`를 수정하고 `docker compose up -d`를 실행합니다. 이미지 재빌드는 필요하지 않습니다. 호스트 3000번 포트는 기본적으로 loopback에만 연결됩니다. 다른 앱이 사용 중이면 `.env`의 `APP_PORT`를 변경하세요.

## Nginx Proxy Manager가 Docker로 실행되는 경우

NPM의 기존 네트워크 이름을 `.env`의 `NPM_NETWORK`에 지정합니다. 네트워크 확인:

```sh
docker network ls
docker inspect <NPM-컨테이너-이름> --format '{{json .NetworkSettings.Networks}}'
docker compose -f compose.yaml -f compose.npm.yaml config
docker compose -f compose.yaml -f compose.npm.yaml up -d --build
```

NPM에서 Forward Hostname은 `birthday-world`, Forward Port는 `3000`, Scheme은 `http`로 설정합니다. NPM 컨테이너의 localhost는 앱 컨테이너를 가리키지 않습니다. 외부 네트워크는 앱 실행 전에 존재해야 하며 앱 Compose는 NPM 자체를 수정하지 않습니다.

브라우저가 사진을 최대 2048px로 축소한 뒤 전송합니다. 서버 제한은 사진당 8MB, 요청 전체 65MB로 Cloudflare Free/Pro의 100MB 제한보다 작습니다. Cloudflare DNS 프록시를 사용할 수 있습니다. VRChat의 PNG 요청에는 브라우저 확인이나 CAPTCHA를 적용하지 마세요. NPM Advanced 설정은 다음 값을 권장합니다.

```nginx
client_max_body_size 65m;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

도메인은 `.env`의 `PUBLIC_BASE_URL`과 같아야 합니다. `/party/.../atlas.png?name=...` 요청은 PNG 바이트와 쿼리를 그대로 전달해야 합니다.

## 업데이트

```sh
git pull --ff-only
docker compose up -d --build
docker compose logs --tail=100 birthday-world
```

공유 NPM 네트워크를 사용한다면 위 명령에도 항상 `-f compose.yaml -f compose.npm.yaml`을 넣습니다. 앱을 재생성해도 `birthday-data` 볼륨은 유지됩니다. `docker compose down -v`는 저장된 사진과 앨범을 삭제하므로 일반 업데이트에 사용하지 않습니다.

## 기존 로컬 데이터 이관

새 배포는 빈 저장소로 시작합니다. 기존 데이터를 옮기려면 로컬 `storage/` 폴더를 안전한 SCP 등으로 서버의 별도 폴더에 복사하고, **새 서버에서 아직 앨범을 만들지 않은 상태**에서 실행합니다. 아래 예시는 서버의 `storage-import/`에 데이터가 이미 복사되어 있다고 가정합니다.

```sh
docker compose stop birthday-world
docker compose run --rm --no-deps --user root --volume "$(pwd)/storage-import:/import:ro" birthday-world sh -c 'cp -a /import/. /app/storage/ && chown -R node:node /app/storage'
docker compose up -d
```

데이터 이관은 별도 작업입니다. 기존 로컬·서버 데이터가 있는 경우 먼저 백업하고 합칠 앨범을 확인합니다. 기존 편집 URL의 UUID와 `#key`는 그대로 유지하지만 새 도메인으로 열어야 합니다. 브라우저의 저장된 편집 권한은 도메인마다 별개입니다.

## 백업

일관된 백업을 위해 앱을 잠시 중지하고 볼륨을 내보냅니다. 아래 명령은 현재 실행 중인 앱 이미지에 있는 tar를 사용합니다.

```sh
mkdir -p backups
docker compose stop birthday-world
docker compose run --rm --no-deps --user root --volume "$(pwd)/backups:/backup" birthday-world sh -c 'tar -czf /backup/birthday-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /app/storage .'
docker compose up -d
```

백업에는 원본 사진과 앨범 정보가 포함됩니다. GitHub 저장소에 넣지 말고 따로 보관합니다. 단일 앱 인스턴스로 운영합니다. 대용량 요청과 이미지 변환을 위해 EC2 메모리는 업로드량에 맞춰 확보합니다.

구현 참고: [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/).
