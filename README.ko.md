# WGTemporaryEmail

프라이버시 우선의 셀프호스팅 일회용 임시 이메일 서비스.

**데모 사이트: [https://mail.twcdk.com](https://mail.twcdk.com/)** · API 레퍼런스: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · 관리 패널: `https://mail.twcdk.com/admin`

WGTemporaryEmail은 두 개의 훌륭한 오픈소스 프로젝트를 통합하고, 완전한 운영용 제품으로 확장한 것입니다.

| 원본 프로젝트 | 역할 | 본 프로젝트의 확장 |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | 백엔드 (FastAPI API + Go MX 서버 + PostgreSQL) | 관리 API(`/api/v1/admin/*`)와 관리 패널, 최초 설정 마법사, 설정 핫 리로드, MX 설정 핫 리로드, 저장 상한 자동 정리, 버그 수정(예: `max_emails_per_address` 하드코딩), 보안 강화 |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | 사용자 프론트엔드 (Next.js 15) | `web/` 통합, 동일 출처 API 호출, nginx 정적 호스팅, 중국어 관리 패널 `/admin`, 최초 마법사 `/setup`, XSS 살균(DOMPurify), 16개 언어 i18n |

모든 프로젝트는 MIT 라이선스이며 원저작자의 저작권 표기를 유지합니다. 훌륭한 작업을 해주신 [Lm36](https://github.com/Lm36)님께 감사드립니다.

## 기능

- **RFC 호환 MX 서버** - 포트 25에서 모든 제공업체의 메일을 수신
- **사용자 프론트엔드** - 받은 편지함, 첨부파일, 원본 메일 다운로드, DKIM/SPF/DMARC 배지, 다크 모드
- **관리 패널**(16개 언어) - 통계, 메일/주소/도메인 관리, 설정 핫 업데이트, 수동 정리
- **최초 설정 마법사** - 브라우저에서 도메인·호스트명·관리 토큰·패널 도메인 설정
- **Let's Encrypt 자동화** - 관리 패널에서 원클릭 발급, 자동 갱신. MX와 패널 HTTPS가 한 장의 인증서를 공유하며 갱신 후 MX 재시작 불필요
- **저장 제어** - `max_storage_mb` 상한, 가장 오래된 메일부터 자동 삭제. 주소당 메일 수 제한 포함
- **접근 제어** - 패널 도메인 바인딩 후 IP/다른 도메인의 사용자 패널 접근 차단 가능. 관리 패널과 API는 항상 접근 가능
- **보안** - 속도 제한, XSS 살균, ORM 기반 SQL 보호, 상수 시간 토큰 비교, 비루트 컨테이너, DB 비밀번호 필수, 취약한 기본값 없음
- **16개 언어** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية(RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## 아키텍처

```
인터넷
  │
  ├─ :25  ───────────────► mx     (Go SMTP, 15초마다 config.yaml 핫 리로드)
  │
  └─ :80 / :443 ────────► web    (nginx: 정적 프론트엔드 + 리버스 프록시)
       ├─ /                  사용자 패널(16개 언어)
       ├─ /admin             관리 패널(16개 언어)
       ├─ /setup             최초 설정 마법사
       ├─ /api/* ──────────► api    (FastAPI, 내부 네트워크 전용)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (certbot 사이드카용)
            │
            └──► postgres(내부 전용)
```

- `api`와 `postgres`는 호스트에 포트를 공개하지 않으며 모든 트래픽은 nginx를 통합니다.
- `certbot` 사이드카가 HTTP-01 webroot 방식으로 인증서를 발급·갱신하며, 인증서나 설정 변경 시 `web`이 nginx를 자동 리로드합니다.

## 배포

### 요구 사항

- DNS를 관리할 수 있는 도메인(메일 수신에 MX 레코드 필수)
- 공인 IP가 있는 VPS. 포트 **25**와 **80** 접근 가능(패널 HTTPS는 443)
- Docker + Docker Compose, 약 1GB 메모리(작은 VPS는 swap 권장), 수 GB 디스크

### 방법 A: 대화형 설치 스크립트

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

수신 도메인, 메일 호스트명, 웹 포트, CORS, TLS 옵션을 묻고 `config.yaml`(랜덤 관리 토큰 포함)과 `.env`를 생성한 뒤 DNS 레코드를 출력하고 `docker compose up -d --build`를 실행합니다.

### 방법 B: 수동 설정

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) config.yaml 편집: domains, server.hostname, admin.token, DB 비밀번호
# 2) .env 편집: DB_PASSWORD(필수), WEB_PORT(기본 80)
mkdir -p certs
docker compose up -d --build
```

첫 방문 시 **/setup 마법사**가 열립니다(예제 설정은 `setup.initialized: false`). 브라우저에서 같은 내용을 입력하면 됩니다.

### DNS 레코드

```
mail.내도메인.  IN  A    <서버 IP>      # 메일 호스트명
내도메인.       IN  MX  10 mail.내도메인.
```

또한 VPS 제공업체에 서버 IP의 역방향 DNS(PTR)를 `mail.내도메인`으로 설정해 달라고 요청하세요.

### TLS / 패널 HTTPS 활성화

1. 관리 패널 → 시스템 설정 → 패널 접속 도메인: `mail.내도메인` 등을 입력하고 DNS A 레코드를 서버로 연결
2. TLS 인증서 카드 → 이메일 입력 → **인증서 발급 / 갱신**(SAN 인증서가 메일 호스트명과 패널 도메인을 모두 포함)
3. `tls.enabled` 켜기 — MX가 즉시 STARTTLS 시작(재시작 불필요)
4. 패널 HTTPS는 443에서 자동 제공되며 인증서는 자동 갱신됩니다

### 접근 제어

관리 패널 → 기능 스위치 → **IP / 다른 도메인으로 사용자 패널 접속 허용**:

- 켬(기본): 어느 주소에서든 사용자 패널 접근 가능
- 끔: 비공식 도메인과 IP의 접근은 공식 패널 도메인으로 리디렉션됩니다. `/admin`, `/api/*`, `/docs`, 인증서 검증 경로는 항상 어느 주소에서든 접근 가능하므로 스스로 잠기는 일이 없습니다

### 업데이트

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### 제거

```bash
docker compose down -v   # -v는 모든 메일 데이터도 삭제
```

## 관리 패널과 API

- 관리 토큰: `config.yaml`의 `admin.token`(`setup.sh` 또는 설정 마법사가 생성)
- 원클릭 온라인 테스트가 가능한 API 레퍼런스: `/api`, Swagger: `/docs`
- [docs/admin-panel.md](docs/admin-panel.md)와 [docs/security.md](docs/security.md) 참조

## 다국어 문서

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [배포 가이드](docs/deployment.md)([简体中文](docs/deployment.zh-CN.md)) · [관리 패널](docs/admin-panel.md) · [보안](docs/security.md)

## 라이선스

[MIT](LICENSE) — [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) 및 [Lm36/mailbucket](https://github.com/Lm36/mailbucket)(모두 MIT) 기반.
