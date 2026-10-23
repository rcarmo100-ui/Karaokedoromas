# Usar de qualquer lugar (grátis)

Hoje o app roda no seu computador (`localhost`). Para abrir no celular **fora de casa**, são dois passos independentes:

1. **Publicar o app** na internet (para a Fase 1: busca no YouTube, fila, letras) — Vercel, grátis.
2. **(Opcional) Alcançar o PC de casa de fora** (para a Fase 2: separar voz) — Tailscale, grátis.

Nenhum dos dois pede cartão de crédito.

---

## 1. Publicar o app na Vercel (~10 minutos, uma vez só)

A Vercel hospeda apps Next.js de graça para uso pessoal e publica sozinha a cada atualização no GitHub.

1. Entre em <https://vercel.com/signup> e escolha **Continue with GitHub** (use a conta `rcarmo100-ui`).
2. Clique em **Add New… → Project** e escolha o repositório **Karaokedoromas** → **Import**.
3. Antes de clicar em Deploy, abra **Environment Variables** e adicione:
   - `NEXT_PUBLIC_YOUTUBE_API_KEY` = sua chave do YouTube
   - As variáveis `NEXT_PUBLIC_FIREBASE_…` do seu `.env.local`, se usar o backup no Firebase (opcional)
4. Clique em **Deploy**. Em 2–3 minutos aparece o endereço, algo como `https://karaokedoromas.vercel.app`.
5. No celular, abra esse endereço e use **"Adicionar à tela inicial"** do navegador. Fica com cara de aplicativo.

### Proteger a chave do YouTube

No app publicado a chave fica visível no navegador. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), abra a chave e:

- **Restrições de aplicativo → Sites (referenciadores HTTP)**, adicione:
  - `https://karaokedoromas.vercel.app/*` (o seu endereço da Vercel)
  - `http://localhost:3000/*`
  - Se também usar pelo IP do PC na rede de casa, adicione o endereço exato, ex. `http://192.168.0.10:3000/*`
- **Restrições de API**: só **YouTube Data API v3**.

Assim, mesmo que alguém copie a chave, ela não funciona em outro site.

### Importante: cada endereço tem sua própria biblioteca

O navegador guarda as músicas salvas **separadas por endereço**. Músicas salvas abrindo `http://192.168.0.10:3000` não aparecem em `https://karaokedoromas.vercel.app`, e vice-versa. Escolha um endereço principal para a família (recomendo o da Vercel) e use sempre ele.

---

## 2. Alcançar o PC de casa de qualquer lugar (Tailscale)

O app publicado usa `https://`, e por segurança o navegador **bloqueia** chamadas dele para endereços `http://` da rede de casa. O Tailscale resolve isso: cria uma rede particular entre seus aparelhos, com endereço `https://` próprio para o PC. Funciona em casa e fora dela.

1. **No PC:** dê dois cliques em `pc-worker/acesso-de-qualquer-lugar.bat`.
   - Na primeira vez ele instala o Tailscale. Abra o Tailscale, entre com sua conta Google e rode o arquivo de novo.
   - Se aparecer um link pedindo para **ativar HTTPS**, abra, ative e rode de novo.
   - No fim ele mostra um endereço como `https://meu-pc.tail1234.ts.net`. Esse é o endereço do PC.
2. **No celular:** instale o app **Tailscale** (Play Store / App Store) e entre com a **mesma conta**.
3. **No app do karaokê:** aba **Cantar → PC**, cole o endereço `https://…ts.net` e toque em **Conectar**.

O `iniciar.bat` continua precisando estar aberto no PC. O endereço do Tailscale continua valendo depois de reiniciar o PC.

Quem só vai cantar (os outros da família) **não precisa** de Tailscale. Só quem for mandar músicas para o PC separar.

---

## Resumo de custos

| Serviço | Para quê | Custo |
|---|---|---|
| Vercel (plano Hobby) | Publicar o app | Grátis para uso pessoal |
| YouTube Data API | Busca pelo nome | Grátis (~100 buscas/dia) |
| LRCLIB | Letras | Grátis |
| Tailscale (plano Personal) | PC de fora de casa | Grátis para uso pessoal |
| Demucs / yt-dlp | Separar voz no PC | Grátis (roda no seu PC) |
