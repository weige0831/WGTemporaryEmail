# WGTemporaryEmail

Um serviço de e-mail temporário descartável, auto-hospedado e focado em privacidade.

**Demo ao vivo: [https://mail.twcdk.com](https://mail.twcdk.com/)** · Referência da API: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · Painel de administração: `https://mail.twcdk.com/admin`

O WGTemporaryEmail é integrado a partir de dois excelentes projetos de código aberto e estendido para um produto completo e pronto para produção:

| Projeto de origem | Papel | Extensões neste projeto |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | Backend (API FastAPI + servidor MX em Go + PostgreSQL) | API de administração (`/api/v1/admin/*`) e painel admin, assistente de configuração inicial, recarga a quente da configuração, recarga a quente do MX, limite de armazenamento com limpeza automática, correções de bugs (ex.: `max_emails_per_address` estava fixo), reforço de segurança |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | Frontend de usuário (Next.js 15) | Integrado em `web/`, chamadas de API de mesma origem, exportação estática servida pelo nginx, painel admin em chinês `/admin`, assistente inicial `/setup`, sanitização XSS (DOMPurify), i18n em 16 idiomas |

Todos os projetos usam a licença MIT, preservando os avisos de copyright originais. Obrigado ao [Lm36](https://github.com/Lm36) pelo excelente trabalho.

## Funcionalidades

- **Servidor MX compatível com RFC** - recebe e-mail de qualquer provedor na porta 25
- **Frontend de usuário** - caixa de entrada, anexos, download do e-mail original, selos DKIM/SPF/DMARC, modo escuro
- **Painel de administração** (16 idiomas) - estatísticas, gestão de e-mails/endereços/domínios, atualização a quente da configuração, limpeza manual
- **Assistente de configuração inicial** - configure domínios, hostname, token admin e domínio do painel pelo navegador
- **Automação Let's Encrypt** - emissão com um clique pelo painel, renovação automática; o MX e o HTTPS do painel compartilham um certificado e as renovações não exigem reiniciar o MX
- **Controle de armazenamento** - limite `max_storage_mb`, os e-mails mais antigos são limpos automaticamente; também há limite de e-mails por endereço
- **Controle de acesso** - vincule um domínio do painel e bloqueie o acesso ao site do usuário por IP/outros domínios; o painel admin e a API permanecem sempre acessíveis
- **Segurança** - limitação de taxa, sanitização XSS, SQL via ORM, comparação de token em tempo constante, contêineres sem root, senha de BD obrigatória, sem padrões fracos
- **16 idiomas** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## Arquitetura

```
Internet
  │
  ├─ :25  ───────────────► mx     (SMTP em Go, recarrega config.yaml a cada 15 s)
  │
  └─ :80 / :443 ────────► web    (nginx: frontend estático + proxy reverso)
       ├─ /                  painel de usuário (16 idiomas)
       ├─ /admin             painel de administração (16 idiomas)
       ├─ /setup             assistente inicial
       ├─ /api/* ──────────► api    (FastAPI, apenas rede interna)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (para o sidecar certbot)
            │
            └──► postgres (apenas interno)
```

- `api` e `postgres` não publicam portas no host; tudo passa pelo nginx.
- O sidecar `certbot` emite e renova certificados via HTTP-01 webroot; o `web` recarrega o nginx automaticamente em mudanças de certificado ou configuração.

## Implantação

### Requisitos

- Um domínio com acesso ao DNS (o registro MX é obrigatório para receber e-mail)
- Um VPS com IP público; portas **25** e **80** acessíveis (443 para HTTPS do painel)
- Docker + Docker Compose, ~1 GB de RAM (adicione swap em VPS pequenos), alguns GB de disco

### Opção A: script de instalação interativo

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

O script pergunta os domínios de recebimento, hostname de e-mail, porta web, CORS e opções TLS, gera `config.yaml` (com token admin aleatório) e `.env`, imprime os registros DNS e executa `docker compose up -d --build`.

### Opção B: configuração manual

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) edite config.yaml: domains, server.hostname, admin.token, senha do BD
# 2) edite .env: DB_PASSWORD (obrigatório), WEB_PORT (padrão 80)
mkdir -p certs
docker compose up -d --build
```

Na primeira visita, o **assistente /setup** é aberto (o exemplo vem com `setup.initialized: false`); preencha os mesmos valores no navegador.

### Registros DNS

```
mail.seu-dominio.  IN  A    <IP do servidor>      # hostname de e-mail
seu-dominio.       IN  MX  10 mail.seu-dominio.
```

Peça também ao provedor do VPS para configurar o DNS reverso (PTR) do IP do servidor como `mail.seu-dominio`.

### Ativar TLS / HTTPS do painel

1. Painel admin → Configuração → Domínio de acesso ao painel: preencha ex. `mail.seu-dominio` e aponte o registro A para o servidor no DNS
2. Cartão de certificado TLS → informe seu e-mail → **Emitir / renovar certificado** (o certificado SAN cobre o hostname de e-mail e o domínio do painel)
3. Ative `tls.enabled` — o MX inicia STARTTLS imediatamente (sem reiniciar)
4. O HTTPS do painel é servido automaticamente na porta 443; a renovação é totalmente automática

### Controle de acesso

Painel admin → Interruptores → **Permitir acesso ao painel de usuário por IP / outros domínios**:

- ATIVADO (padrão): qualquer endereço pode acessar o painel de usuário
- DESATIVADO: domínios não oficiais e IPs são redirecionados ao domínio oficial do painel; `/admin`, `/api/*`, `/docs` e o caminho de desafio ACME permanecem acessíveis de qualquer endereço para que você nunca fique trancado para fora

### Atualizar

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### Desinstalar

```bash
docker compose down -v   # -v também apaga todos os dados de e-mail
```

## Painel de administração e API

- Token admin: `admin.token` em `config.yaml` (gerado pelo `setup.sh` ou pelo assistente)
- Referência da API com testes ao vivo de um clique: `/api`; Swagger: `/docs`
- Consulte [docs/admin-panel.md](docs/admin-panel.md) e [docs/security.md](docs/security.md)

## Documentação multilíngue

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [Guia de implantação](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [Painel de administração](docs/admin-panel.md) · [Segurança](docs/security.md)

## Licença

[MIT](LICENSE) — baseado em [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) e [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (ambos MIT).
