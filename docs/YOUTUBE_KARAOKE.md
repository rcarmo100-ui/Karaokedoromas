# Fase 1 — Karaokê pelo YouTube

## O que faz

A tela **Cantar** (`/cantar`) é o coração da Fase 1:

- **Busca** a versão karaokê de qualquer música no YouTube (digite o nome da música ou do artista).
- **Toca o vídeo dentro do app**, no player embutido do YouTube. Nada é baixado e não precisa de PC ligado.
- **Fila da festa**: adicione várias músicas, com o nome de quem vai cantar. A fila fica salva no aparelho e passa sozinha para a próxima quando uma música termina.
- **Favoritas**: toque na estrela para salvar. As favoritas aparecem na biblioteca da tela inicial e tocam sem gastar busca.
- **Letra sincronizada (opcional)**: botão "Letra" busca a letra no [LRCLIB](https://lrclib.net), gratuito. Como o tempo da letra vem da gravação original, a versão karaokê pode ter introdução diferente. Use os botões **−/+** para adiantar ou atrasar a letra. Nas favoritas, o ajuste fica salvo.
- **Colar link**: sem chave da API (ou com a cota esgotada), dá para colar o link de um vídeo do YouTube no campo de busca.

## Custo

Zero. Tudo usa serviços gratuitos:

| Serviço | Para quê | Limite grátis |
|---|---|---|
| YouTube Data API v3 | Busca pelo nome | 10.000 unidades/dia ≈ **100 buscas por dia** |
| Player do YouTube | Tocar os vídeos | Sem limite |
| LRCLIB | Letras sincronizadas | Sem chave, uso livre |

Para economizar cota, cada busca fica guardada no aparelho por 24h (repetir a mesma busca não gasta nada) e tocar uma favorita não gasta busca.

## Como criar a chave da API do YouTube (uma vez só, ~5 minutos)

1. Acesse <https://console.cloud.google.com/> com sua conta Google.
2. No topo, clique no seletor de projeto → **Novo projeto** → nome `karaoke-do-romas` → **Criar**.
3. Com o projeto selecionado, vá em **APIs e serviços → Biblioteca**, procure **YouTube Data API v3** e clique em **Ativar**.
4. Vá em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**. Copie a chave.
5. (Recomendado) Clique na chave criada → em **Restrições de API**, escolha **Restringir chave** e marque só **YouTube Data API v3** → **Salvar**. Assim, se alguém pegar a chave, ela só serve para buscar no YouTube.
6. Na pasta do projeto, crie (ou edite) o arquivo **`.env.local`** com a linha:

   ```
   NEXT_PUBLIC_YOUTUBE_API_KEY=cole_sua_chave_aqui
   ```

7. Reinicie o app (`npm run dev`). Pronto: a busca pelo nome passa a funcionar.

Não precisa cadastrar cartão de crédito para usar essa API.

> A chave fica visível para quem usar o app no navegador (é assim com toda API chamada direto do navegador). Por isso o passo 5 é importante. Não coloque essa chave no GitHub. O `.env.local` não é enviado.

## Limitações conhecidas

- **Precisa de internet.** O vídeo vem do YouTube. Sem internet, a tela Cantar não toca.
- **Alguns vídeos não podem tocar fora do YouTube.** A busca já filtra os que não permitem, mas se acontecer, o app avisa e oferece pular para a próxima ou abrir no YouTube.
- **Celular: o primeiro play pode precisar de um toque.** Os navegadores bloqueiam som automático até você interagir com a página.
- **Tela cheia no iPhone:** o Safari do iPhone não deixa colocar a página em tela cheia. Use o botão de tela cheia do próprio vídeo (a letra do app não aparece nesse modo).
- **A estimativa de música/artista vem do título do vídeo.** Quando o título é confuso, a letra pode não ser encontrada.

## Arquivos

| Arquivo | O que é |
|---|---|
| `src/app/cantar/page.tsx` | Página `/cantar` |
| `src/app/cantar/components/CantarClient.tsx` | Tela: busca, player, letra, fila, favoritas |
| `src/components/YouTubeKaraokePlayer.tsx` | Player do YouTube embutido (IFrame API) |
| `src/hooks/useKaraokeQueue.ts` | Fila salva no aparelho |
| `src/lib/youtube.ts` | Busca na API, leitura de links, título → música/artista |
| `src/lib/lrclib.ts` | Letras sincronizadas (LRCLIB) |

Alterados: `localDB.ts` (campos do YouTube na música), `songRepository.ts` (salvar favorita), `AppNav.tsx` (menu "Cantar"), `SongLibraryGrid.tsx` e `RecentSongsRow.tsx` (favoritas do YouTube abrem na tela Cantar).

## Fase 2: músicas sem versão karaokê

Na busca, marque **"Buscar a música original"** e toque em **PC** num resultado. O PC de casa separa a voz e o app salva o instrumental (com voz guia ajustável) na aba **Salvas**, tocando sem internet. Instalação e uso: [`pc-worker/LEIA-ME.md`](../pc-worker/LEIA-ME.md).

## Próximo passo sugerido

Para usar no celular **fora de casa**, publique o app de graça na Vercel: passo a passo em [`docs/PUBLICAR.md`](PUBLICAR.md).
