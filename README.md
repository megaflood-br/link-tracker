# Link Tracker

Sistema pequeno, no estilo Bitly, para criar atalhos e medir acessos. Os atalhos públicos ficam na raiz do domínio (`/maps`); o painel fica em `/link-tracker/admin`.

## Rodar localmente

```bash
copy .env.example .env
```

No `.env` local, deixe `BASE_PATH` vazio e `PUBLIC_URL=http://localhost:3847`. Depois:

```bash
npm install
npm start
```

Abra [http://localhost:3847/admin](http://localhost:3847/admin).

## Instalar no TinyCP (mesmo domínio, sem subdomínio)

Os arquivos do rastreador ficam em `/var/www/renovesuabeleza.com.br/link-tracker`. O site HTML continua na raiz. O TinyCP só encaminha `/link-tracker/` para o Node.

### 1. SSH no servidor

```bash
cd /var/www/renovesuabeleza.com.br
git clone https://github.com/megaflood-br/link-tracker.git link-tracker
cd link-tracker
```

Se a pasta já existir:

```bash
cd /var/www/renovesuabeleza.com.br/link-tracker
git pull
```

### 2. Node 22

```bash
node -v
```

Se não for v22+:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

### 3. Arquivo `.env`

```bash
cp .env.example .env
nano .env
```

```env
PORT=3847
ADMIN_PASSWORD=uma-senha-forte
SESSION_SECRET=um-texto-longo-e-aleatorio
PUBLIC_URL=https://renovesuabeleza.com.br
BASE_PATH=/link-tracker
```

```bash
chmod 600 .env
npm install --omit=dev
chown -R www-data:www-data /var/www/renovesuabeleza.com.br/link-tracker
```

### 4. Serviço systemd

`/etc/systemd/system/link-tracker.service`:

```ini
[Unit]
Description=Link Tracker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/renovesuabeleza.com.br/link-tracker
ExecStart=/usr/bin/node src/server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now link-tracker
systemctl status link-tracker
```

### 5. Proxy no TinyCP (domínio principal)

Em **Web → renovesuabeleza.com.br → Proxy**:

- **From URL:** `/link-tracker/`
- **To URL:** `http://127.0.0.1:3847/link-tracker/`

As duas terminam com `/`. Isso cobre o painel.

No **Custom config** do mesmo domínio, cole isto para os atalhos curtos (`/maps`) e para proteger os arquivos do app:

```nginx
location ~ ^/([a-zA-Z0-9][a-zA-Z0-9_-]{0,47})$ {
  proxy_pass http://127.0.0.1:3847/$1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location ~ ^/link-tracker/\.env { deny all; return 404; }
location ^~ /link-tracker/data { deny all; return 404; }
location ^~ /link-tracker/src { deny all; return 404; }
location ^~ /link-tracker/node_modules { deny all; return 404; }
```

Não use como slug o nome de uma página HTML que já exista na raiz (por exemplo `index`).

### 6. Botões no site HTML

```html
<a href="https://renovesuabeleza.com.br/maps">Como chegar</a>
<a href="https://renovesuabeleza.com.br/avaliacao">Avaliar no Google</a>
```

Painel: https://renovesuabeleza.com.br/link-tracker/admin
