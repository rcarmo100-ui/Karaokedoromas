# AUDIO_AI_POC — Separação Vocal Local no Navegador

## Objetivo

Prova de conceito isolada para testar separação de áudio **Vocal vs Instrumental** diretamente no navegador, sem envio de dados para servidor, sem integração com a biblioteca principal do Karaokê.

Perguntas que esta POC responde:

1. O modelo roda dentro do navegador?
2. WebGPU funciona?
3. WASM/CPU funciona como fallback?
4. A qualidade do instrumental é aceitável?

---

## Modelo Utilizado

| Campo | Valor |
|---|---|
| Nome | UVR-MDX-NET-Inst_HQ_3 |
| Tipo | ONNX (Open Neural Network Exchange) |
| Tamanho aproximado | ~64 MB |
| Stems | 2 (Vocal + Instrumental) |
| Fonte | Hugging Face — `Delik/uvr-mdx-net-inst-hq-3-onnx` |
| URL do modelo | `https://huggingface.co/Delik/uvr-mdx-net-inst-hq-3-onnx/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx` |

---

## Versão do onnxruntime-web

| Pacote | Versão |
|---|---|
| `onnxruntime-web` | `1.30.0` |

---

## Método de Execução

### Prioridade
1. **WebGPU** — detectado via `navigator.gpu.requestAdapter()`
2. **WASM/CPU** — fallback automático se WebGPU falhar ou não estiver disponível

### Detecção
- WebGPU é detectado explicitamente no `useEffect` ao montar a página
- Nunca é simulado — se não disponível, o fallback é ativado e informado na UI

---

## Tamanho do Modelo

~64 MB (download único, armazenado em cache local)

---

## Estratégia de Cache

- Utiliza a **Cache API** do navegador (`caches.open()`)
- Chave de cache: `audio-ai-poc-model-v1`
- O modelo é baixado apenas quando o usuário clica em "Baixar modelo"
- Após o download, é armazenado via `cache.put()`
- Em sessões futuras, é recuperado via `cache.match()` sem novo download
- Falha de cache é não-fatal (o download pode ser repetido)

---

## Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `src/app/audio-ai-poc/page.tsx` | Página principal da POC |
| `docs/AUDIO_AI_POC.md` | Este documento |

---

## Arquivos Modificados

| Arquivo | Modificação |
|---|---|
| `src/components/AppNav.tsx` | Adicionado link de navegação "POC Vocal" (`/audio-ai-poc`) |
| `package.json` | Adicionada dependência `onnxruntime-web@1.30.0` |

---

## Dependências Adicionadas

| Pacote | Versão | Motivo |
|---|---|---|
| `onnxruntime-web` | `1.30.0` | Inferência ONNX no navegador (WebGPU + WASM) |

---

## Funcionalidades Implementadas

- Download do modelo com barra de progresso e tamanho em MB
- Cache local do modelo via Cache API (sem re-download)
- Seleção de arquivo de áudio (MP3, WAV, M4A)
- Exibição de nome, tamanho e duração do arquivo
- Detecção explícita de WebGPU
- Fallback automático para WASM/CPU
- Processamento local com log em tempo real
- Medição de tempo de processamento
- Players de áudio para Vocal e Instrumental (play/pause, volume, seek)
- Botões de download para `vocal.wav` e `instrumental.wav`
- Painel de diagnóstico técnico (browser, WebGPU, provider, modelo, arquivo, tempo, status)
- Exibição de erros reais sem ocultação

---

## Limitações

- O modelo UVR-MDX-NET-Inst_HQ_3 espera entrada em formato específico (float32, mono, 44100Hz). A implementação faz mix-down para mono antes da inferência.
- A forma exata do tensor de entrada/saída depende do modelo exportado. Se o modelo exportado tiver nomes de input/output diferentes, pode ser necessário ajuste.
- Arquivos muito longos (>5 min) podem causar problemas de memória em dispositivos com RAM limitada.
- WebGPU está disponível apenas em Chrome 113+, Edge 113+, e alguns builds do Firefox Nightly.
- M4A pode não ser decodificável em todos os navegadores (depende do suporte nativo do browser).
- O processamento é síncrono na thread principal — pode travar a UI em arquivos grandes.

---

## Testes Realizados

| Teste | Status |
|---|---|
| Build Next.js | A verificar após instalação de dependências |
| TypeScript | A verificar |
| Lint | A verificar |

---

## Testes NÃO Realizados

| Teste | Motivo |
|---|---|
| Runtime no navegador | Requer teste manual pelo usuário |
| Qualidade do instrumental | Requer teste manual com arquivo real |
| WebGPU real | Requer hardware compatível |
| WASM/CPU fallback real | Requer teste manual |
| Arquivos grandes (>5 min) | Não testado |
| Safari / Firefox | Não testado |

---

## Próximos Passos (após validação da POC)

1. Validar as 4 perguntas da POC no navegador real
2. Se aprovado: mover processamento para Web Worker (evitar bloqueio da UI)
3. Integrar com IndexedDB da biblioteca principal
4. Criar `ProcessingJob` no Firebase
5. Integrar resultados ao player principal
6. Implementar processamento em chunks para arquivos longos

---

## Checkpoint

`AUDIO_AI_POC_V1_IMPLEMENTADO` — criado após build passar.

> **IMPORTANTE**: IMPLEMENTADO ≠ VALIDADO.
> O checkpoint de validação (`AUDIO_AI_POC_V1_VALIDADO`) será criado somente após teste manual no navegador.

---

## Isolamento

Esta POC **não altera**:
- Firebase / Firestore
- SyncManager / syncEngine
- IndexedDB / localDB
- Player principal (KaraokePlayerClient)
- Service Worker (exceto uso da Cache API nativa do navegador)
- SongLibraryGrid
- CloudImport
- Qualquer funcionalidade existente
