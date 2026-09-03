# Mailbucket Frontend

A privacy-focused temporary email service frontend for https://mailbucket.cc

> **整合说明**：本目录已集成进 tempmail-server 仓库。用户前端（原 mailbucket）位于 `/`，
> 新增的中文管理面板位于 `/admin`。构建产物为纯静态文件（`npm run build` 输出到 `out/`），
> 由仓库根目录的 docker-compose 用 Nginx 容器托管，并把 `/api/*` 反代到后端。
> 开发时如后端不在同源，请在 `.env.local` 设置 `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`。

## Features

- **Single-Page Interface**: All-in-one inbox experience like popular tempmail services
- **Instant Email Creation**: Generate random or custom temporary email addresses
- **Real-Time Updates**: Auto-refresh emails every 15 seconds
- **Dark Mode**: Seamless light/dark theme switching
- **Email Management**: View, search, filter, and delete emails
- **Attachment Support**: Download email attachments safely
- **Security Indicators**: DKIM, SPF, and DMARC validation badges
- **Privacy First**: No ads, no tracking, no data collection
- **Fully Responsive**: Works on desktop, tablet, and mobile devices

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Tempmail-server backend running (see [github.com/lm36/tempmail-server](https://github.com/lm36/tempmail-server))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/lm36/mailbucket.git
cd mailbucket
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file:
```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

### Build for Production

```bash
npm run build
npm start
```

## Production Deployment

This frontend requires the [tempmail-server](https://github.com/lm36/tempmail-server) backend to function. The repos are kept separate to allow independent development and deployment.

### 1. Backend Setup

First, clone and set up the tempmail-server backend:

```bash
git clone https://github.com/lm36/tempmail-server.git
cd tempmail-server
# Follow the setup instructions in the tempmail-server README
# The backend will run:
# - MX server on 0.0.0.0:25 (with DNS records configured)
# - API on localhost:8000
# - PostgreSQL in Docker
```

### 2. Frontend Setup

Clone and build the frontend:

```bash
# Clone to /var/www or your preferred location
sudo git clone https://github.com/lm36/mailbucket.git /var/www/mailbucket
cd /var/www/mailbucket

# Install dependencies
npm install

# Configure environment variables
cp .env.local.example .env.local
nano .env.local
```

**Important:** Update `.env.local` with your production API URL:
```bash
NEXT_PUBLIC_API_URL=https://mailbucket.cc
```

**CORS Configuration:** Make sure to configure CORS in your tempmail-server to allow requests from your frontend domain (e.g., `https://mailbucket.cc`).

Build for production:
```bash
npm run build
```

### 3. Systemd Service (Recommended)

Run the Next.js app as a systemd service for automatic startup and process management:

```bash
# Copy the example service file
sudo cp examples/mailbucket.service /etc/systemd/system/

# Edit the service file to match your setup
sudo nano /etc/systemd/system/mailbucket.service
# Update: User, WorkingDirectory, NEXT_PUBLIC_API_URL

# Set proper ownership
sudo chown -R www-data:www-data /var/www/mailbucket

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable mailbucket
sudo systemctl start mailbucket

# Check status
sudo systemctl status mailbucket

# View logs
sudo journalctl -u mailbucket -f
```

See `examples/mailbucket.service` for the full service configuration.

### 4. Nginx Reverse Proxy

Configure Nginx to proxy both the frontend and API on the same domain:

**Configuration** (`/etc/nginx/sites-available/mailbucket`):
```nginx
server {
    listen 80;
    server_name mailbucket.cc;

    # Proxy API requests to backend
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy all other requests to Next.js frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/mailbucket /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL/TLS with Let's Encrypt

Secure your site with free SSL certificates:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mailbucket.cc
```

Certbot will automatically update your Nginx configuration and set up auto-renewal.

### Deployment Checklist

- [ ] tempmail-server is running and accessible on localhost:8000
- [ ] CORS is configured in tempmail-server to allow your domain
- [ ] `.env.local` has the correct `NEXT_PUBLIC_API_URL`
- [ ] Frontend is built with `npm run build`
- [ ] Systemd service is running (`systemctl status mailbucket`)
- [ ] Nginx is configured and running for both frontend and API
- [ ] SSL certificates are installed and auto-renewal is enabled
- [ ] DNS records are properly configured

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API URL

## Project Structure

```
mailbucket-frontend/
├── app/                    # Next.js App Router pages
│   ├── about/             # About page
│   ├── privacy/           # Privacy policy page
│   ├── layout.tsx         # Root layout with theme provider
│   ├── page.tsx           # Main inbox page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── theme-provider.tsx
│   └── theme-toggle.tsx
└── lib/                  # Utilities
    ├── api.ts           # API client
    └── utils.ts         # Helper functions
```

## Features in Detail

### Email Address Creation
- Generate random email addresses instantly
- Create custom usernames (3-64 characters)
- Select from multiple domains (if available)
- Addresses expire automatically (configurable on backend)

### Inbox Management
- View all received emails in a clean list
- Search emails by subject, sender, or content
- Auto-refresh every 15 seconds (toggleable)
- Delete emails

### Email Viewer
- HTML and plain text view toggle
- Full email headers
- Security validation badges (DKIM, SPF, DMARC)
- Attachment download
- Raw email (.eml) download
- Email metadata (size, timestamp)

### Privacy & Security
- No user registration required
- No tracking or monitoring
- Access tokens stored locally only
- Automatic data deletion on expiration
- Open source and auditable

## API Integration

The frontend integrates with the tempmail-server backend API. See [github.com/lm36/tempmail-server](https://github.com/lm36/tempmail-server) for details.

### Key Endpoints Used

- `GET /api/v1/domains` - List available domains
- `POST /api/v1/addresses` - Create temporary address
- `GET /api/v1/{token}/emails` - List emails
- `GET /api/v1/{token}/emails/{id}` - Get email details
- `DELETE /api/v1/{token}/emails/{id}` - Delete email
- `GET /api/v1/{token}/emails/{id}/attachments/{id}` - Download attachment
- `GET /api/v1/{token}/emails/{id}/raw` - Download raw email

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)
