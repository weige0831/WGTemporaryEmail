# WGTemporaryEmail

プライバシー最優先の、セルフホスト可能な使い捨て一時メールサービス。

**デモサイト：[https://mail.twcdk.com](https://mail.twcdk.com/)** · API リファレンス：[https://mail.twcdk.com/api](https://mail.twcdk.com/api) · 管理パネル：`https://mail.twcdk.com/admin`

WGTemporaryEmail は2つの優れたオープンソースプロジェクトを統合し、本番運用可能な完成品へと拡張したものです。

| 元プロジェクト | 役割 | 本プロジェクトでの拡張 |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | バックエンド（FastAPI API + Go MX サーバー + PostgreSQL） | 管理 API（`/api/v1/admin/*`）と管理パネル、初回セットアップウィザード、設定のホットリロード、MX 設定のホットリロード、ストレージ上限の自動クリーンアップ、バグ修正（例: `max_emails_per_address` のハードコード）、セキュリティ強化 |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | ユーザーフロントエンド（Next.js 15） | `web/` への統合、同一オリジン API 呼び出し、nginx による静的ホスティング、中国語管理パネル `/admin`、初回ウィザード `/setup`、XSS サニタイズ（DOMPurify）、16言語対応 |

すべてのプロジェクトは MIT ライセンスで、原作者の著作権表示を保持しています。素晴らしい仕事をしてくれた [Lm36](https://github.com/Lm36) に感謝します。

## 機能

- **RFC 準拠の MX サーバー** - ポート25で任意のプロバイダーからメールを受信
- **ユーザーフロントエンド** - 受信トレイ、添付ファイル、生メールのダウンロード、DKIM/SPF/DMARC バッジ、ダークモード
- **管理パネル**（16言語）- 統計、メール/アドレス/ドメイン管理、設定のホットアップデート、手動クリーンアップ
- **初回セットアップウィザード** - ブラウザ上でドメイン・ホスト名・管理トークン・パネルドメインを設定
- **Let's Encrypt 自動化** - 管理パネルからワンクリック発行、自動更新。MX とパネル HTTPS で1枚の証明書を共有し、更新後も MX の再起動は不要
- **ストレージ制御** - `max_storage_mb` 上限、最も古いメールから自動削除。アドレスごとのメール数上限もあり
- **アクセス制御** - パネルドメインを設定後、IP/他ドメインからのユーザーパネルアクセスを遮断可能。管理パネルと API は常に到達可能
- **セキュリティ** - レート制限、XSS サニタイズ、ORM による SQL 保護、定数時間トークン比較、非 root コンテナ、DB パスワード必須、弱いデフォルトなし
- **16言語** - English、简体中文、繁體中文、日本語、한국어、Español、Français、Deutsch、Português、Русский、العربية（RTL）、हिन्दी、Italiano、Türkçe、Bahasa Indonesia、Tiếng Việt

## アーキテクチャ

```
インターネット
  │
  ├─ :25  ───────────────► mx     (Go SMTP、15秒ごとに config.yaml をホットリロード)
  │
  └─ :80 / :443 ────────► web    (nginx：静的フロントエンド + リバースプロキシ)
       ├─ /                  ユーザーパネル（16言語）
       ├─ /admin             管理パネル（16言語）
       ├─ /setup             初回セットアップウィザード
       ├─ /api/* ──────────► api    (FastAPI、内部ネットワークのみ)
       ├─ /docs、/openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (certbot サイドカー用)
            │
            └──► postgres（内部のみ）
```

- `api` と `postgres` はホストにポート公開せず、すべて nginx 経由です。
- `certbot` サイドカーが HTTP-01 webroot 方式で証明書を発行・更新し、証明書や設定の変更時は `web` が nginx を自動リロードします。

## デプロイ

### 要件

- DNS を管理できるドメイン（メール受信には MX レコードが必要）
- パブリック IP を持つ VPS。ポート **25** と **80** が到達可能（パネル HTTPS には 443）
- Docker + Docker Compose、約1GBメモリ（小さい VPS では swap 推奨）、数GBのディスク

### 方法A：対話式セットアップスクリプト

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

受信ドメイン、メールホスト名、Web ポート、CORS、TLS の選択を尋ねられ、`config.yaml`（ランダムな管理トークン付き）と `.env` を生成し、DNS レコードを表示して `docker compose up -d --build` を実行します。

### 方法B：手動セットアップ

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) config.yaml を編集：domains、server.hostname、admin.token、DB パスワード
# 2) .env を編集：DB_PASSWORD（必須）、WEB_PORT（既定 80）
mkdir -p certs
docker compose up -d --build
```

初回アクセス時は **/setup ウィザード**が開きます（サンプル設定は `setup.initialized: false` のため）。ブラウザ上で同じ内容を入力すれば完了です。

### DNS レコード

```
mail.あなたのドメイン.  IN  A    <サーバーIP>      # メールホスト名
あなたのドメイン.       IN  MX  10 mail.あなたのドメイン.
```

あわせて VPS プロバイダーに、サーバー IP の逆引き（PTR）を `mail.あなたのドメイン` に設定するよう依頼してください。

### TLS / パネル HTTPS の有効化

1. 管理パネル → システム設定 → パネルアクセスドメイン：`mail.あなたのドメイン` などを入力し、DNS の A レコードをサーバーへ向ける
2. TLS 証明書カード → メールアドレスを入力 → **証明書を発行 / 更新**（SAN 証明書がメールホスト名とパネルドメインの両方をカバー）
3. `tls.enabled` をオン — MX が即座に STARTTLS を開始（再起動不要）
4. パネル HTTPS は 443 で自動提供され、証明書は自動更新されます

### アクセス制御

管理パネル → 機能スイッチ → **IP / 他のドメインからのユーザーパネルアクセスを許可**：

- オン（既定）：どのアドレスからもユーザーパネルにアクセス可能
- オフ：非公式ドメインや IP からのアクセスは公式パネルドメインへリダイレクト。`/admin`、`/api/*`、`/docs`、証明書検証パスは常にどのアドレスからも到達可能で、自分を締め出す心配はありません

### 更新

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### アンインストール

```bash
docker compose down -v   # -v はすべてのメールデータも削除
```

## 管理パネルと API

- 管理トークン：`config.yaml` の `admin.token`（`setup.sh` またはセットアップウィザードが生成）
- ワンクリックでオンラインテストできる API リファレンス：`/api`、Swagger：`/docs`
- [docs/admin-panel.md](docs/admin-panel.md) と [docs/security.md](docs/security.md) も参照

## 多言語ドキュメント

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [デプロイガイド](docs/deployment.md)（[简体中文](docs/deployment.zh-CN.md)）· [管理パネル](docs/admin-panel.md) · [セキュリティ](docs/security.md)

## ライセンス

[MIT](LICENSE) — [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) と [Lm36/mailbucket](https://github.com/Lm36/mailbucket)（いずれも MIT）に基づきます。
