# Link Tracker

Sistema pequeno, no estilo Bitly, para criar atalhos e medir acessos. Use no seu site HTML no lugar dos links diretos de Google Maps, avaliação, WhatsApp etc.

## Como funciona

1. Você cria um atalho no painel, por exemplo `maps` apontando para o Google Maps.
2. No site, o botão passa a abrir `http://seu-dominio/maps`.
3. O sistema registra o clique e redireciona a pessoa ao destino.

## Rodar localmente

```bash
copy .env.example .env
npm install
npm start
```

Abra [http://localhost:3847/admin](http://localhost:3847/admin). A senha inicial é a de `ADMIN_PASSWORD` no `.env`.

## Encaixar no site HTML

Troque o `href` dos botões pelos links curtos:

```html
<a href="http://localhost:3847/maps">Como chegar</a>
<a href="http://localhost:3847/avaliacao">Avaliar no Google</a>
<a href="http://localhost:3847/whatsapp">Falar no WhatsApp</a>
```

Quando o rastreador estiver online, use o domínio público no lugar de `localhost`.

## Produção

1. Altere `ADMIN_PASSWORD`, `SESSION_SECRET` e `PUBLIC_URL` no `.env`.
2. Hospede este projeto em qualquer serviço com Node 22+ (VPS, Railway, Render).
3. Aponte um subdomínio, por exemplo `l.seusite.com`, para este app.
4. No site HTML, use `https://l.seusite.com/maps`.
