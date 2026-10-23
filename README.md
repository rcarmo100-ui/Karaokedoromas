# Karaokê do Romas

Karaokê pessoal para cantar com a família: busca a versão karaokê de qualquer música no YouTube, toca no celular ou na TV, com fila da festa, favoritas e letra sincronizada.

## Como rodar

Precisa do [Node.js](https://nodejs.org/) 20 ou mais novo.

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. Para abrir no celular na mesma rede Wi-Fi, use o IP do computador, por exemplo `http://192.168.0.10:3000`.

### Busca pelo nome (opcional, grátis)

Sem configurar nada, a tela **Cantar** funciona colando o link de um vídeo do YouTube. Para buscar pelo nome da música, crie a chave gratuita da API do YouTube e coloque no arquivo `.env.local`:

```
NEXT_PUBLIC_YOUTUBE_API_KEY=sua_chave
```

Passo a passo completo em [`docs/YOUTUBE_KARAOKE.md`](docs/YOUTUBE_KARAOKE.md).

### Músicas sem versão karaokê (opcional, grátis)

O PC de casa pode tirar a voz de qualquer música (IA Demucs). O resultado fica salvo no aparelho e toca **sem internet**, com controle de "voz guia". Instalação no Windows com dois cliques: veja [`pc-worker/LEIA-ME.md`](pc-worker/LEIA-ME.md).

## Telas

| Tela | Endereço | Para quê |
|---|---|---|
| Cantar | `/cantar` | Buscar, tocar, fila, salvas, letra e separação no PC |
| Início | `/` | Biblioteca de músicas e favoritas |
| Adicionar | `/add-music-screen` | Adicionar arquivo de áudio próprio |
| Sync | `/sync-storage` | Backup opcional no Firebase |

## Documentação

- [`docs/YOUTUBE_KARAOKE.md`](docs/YOUTUBE_KARAOKE.md): Fase 1, karaokê pelo YouTube
- [`pc-worker/LEIA-ME.md`](pc-worker/LEIA-ME.md): Fase 2, separar a voz no PC de casa
- [`docs/PUBLICAR.md`](docs/PUBLICAR.md): Fase 3, usar de qualquer lugar (Vercel + Tailscale, grátis)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): arquitetura local-first (IndexedDB, sync, PWA)
- [`docs/IMPLEMENTATION_LOG.md`](docs/IMPLEMENTATION_LOG.md): histórico de versões

## Scripts

- `npm run dev`: modo desenvolvimento (porta 3000)
- `npm run build` e `npm run start`: versão de produção
- `npm run lint`: verificação de código
