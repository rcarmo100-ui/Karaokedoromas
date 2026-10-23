# Serviço do PC — separar a voz (Fase 2)

Para músicas que **não têm versão karaokê no YouTube**. O PC de casa baixa a música original, tira a voz com IA (Demucs) e o app guarda o instrumental na biblioteca do aparelho. Depois de salva, a música toca **sem internet e sem o PC**.

Custo zero: tudo roda no seu computador.

## Instalar (uma vez só, Windows)

1. Copie a pasta `pc-worker` para o PC (ela vem junto com o projeto).
2. Dê dois cliques em **`instalar.bat`**.
   - Ele instala o que faltar: Python 3.11, ffmpeg, Deno (usado pelo yt-dlp para baixar do YouTube), PyTorch, Demucs e yt-dlp.
   - Se tiver placa de vídeo **NVIDIA**, ele instala a versão que usa a placa e separa umas 5× mais rápido.
   - Pode levar de 10 a 20 minutos (baixa uns 2–3 GB).
   - Se ele pedir para fechar e abrir de novo, faça isso e rode o `instalar.bat` mais uma vez.

## Usar

1. Dê dois cliques em **`iniciar.bat`**. Vai abrir uma janela preta mostrando algo assim:

   ```
   Na rede de casa: http://192.168.0.10:8765   <- use este endereço no celular
   ```

2. Na primeira vez, o Windows pergunta se libera o acesso na rede. Marque **Redes privadas** e clique em **Permitir**.
3. No app, abra **Cantar → aba PC**. Se o app estiver aberto pelo endereço do próprio PC, ele já encontra o serviço sozinho. Se não, cole o endereço da janela preta e toque em **Conectar**.
4. Na aba **Buscar**, ache a música **original** (não precisa ser karaokê) e toque em **Separar no PC**. Também dá para colar o link ou enviar um arquivo de áudio na aba PC.
5. Acompanhe na aba PC. Quando ficar pronta, o app salva sozinho na biblioteca, com o instrumental e a voz guia.

Deixe a janela preta aberta enquanto estiver separando músicas. Pode minimizar.

## Usar fora de casa

Com o PC ligado em casa, dá para mandar músicas para separar de qualquer lugar usando o **Tailscale** (grátis). Rode o **`acesso-de-qualquer-lugar.bat`** e siga [`docs/PUBLICAR.md`](../docs/PUBLICAR.md), parte 2.

## Quanto demora

Uma música de ~4 minutos leva cerca de:

- **Com placa NVIDIA:** menos de 1 minuto
- **Só processador:** 3 a 8 minutos, dependendo do PC

Na primeira separação o modelo de IA é baixado (~80 MB), então ela demora um pouco mais.

## Se der problema

| Mensagem | O que fazer |
|---|---|
| "Não consegui baixar do YouTube" | Dê dois cliques em **`atualizar.bat`**. O YouTube muda com frequência e o yt-dlp precisa acompanhar. |
| "O YouTube pediu login" | O vídeo tem restrição de idade. Use outro link ou envie o arquivo de áudio. |
| "Faltou memória" | Feche outros programas e toque em tentar de novo. |
| O app não encontra o PC | Confira se a janela preta está aberta, se o celular está no mesmo Wi-Fi e se o Windows liberou o acesso (passo 2). |

## Segurança

O serviço só deve ser usado **dentro da rede de casa**. Não abra a porta 8765 no roteador.

## Para técnicos

- Sem dependências web: o servidor usa só a biblioteca padrão do Python (`http.server`).
- Arquivos: `servidor.py` (HTTP) e `processamento.py` (fila, yt-dlp, Demucs).
- Resultados ficam em `pc-worker/trabalhos/<id>/` (`instrumental.mp3`, `vocal.mp3`, `info.json`). Pode apagar essa pasta à vontade depois de salvar no app.
- Outro modelo: variável `KARAOKE_MODELO` (padrão `htdemucs`; `htdemucs_ft` é um pouco melhor e 4× mais lento).
- Porta: `iniciar.bat --porta 9000`.
- Em Linux/Mac: `python3 -m venv .venv && .venv/bin/pip install torch torchaudio -r requirements.txt && .venv/bin/python servidor.py` (precisa de `ffmpeg` instalado).
