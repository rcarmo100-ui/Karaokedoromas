"""
Karaokê do Romas — processamento no PC (Fase 2)

Fila de trabalhos: baixa o áudio (YouTube ou arquivo enviado) e separa a voz
do instrumental com o Demucs. Um trabalho por vez, em segundo plano.

Cada trabalho fica numa pasta própria dentro de `trabalhos/`:
    trabalhos/<id>/info.json        estado e dados da música
    trabalhos/<id>/original.<ext>   áudio de entrada
    trabalhos/<id>/instrumental.mp3 resultado (sem voz)
    trabalhos/<id>/vocal.mp3        resultado (só a voz, usada como "voz guia")
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Optional

PASTA_BASE = Path(__file__).resolve().parent
PASTA_TRABALHOS = PASTA_BASE / "trabalhos"

# Estados (em português, iguais aos que o app mostra)
NA_FILA = "na_fila"
BAIXANDO = "baixando"
SEPARANDO = "separando"
PRONTO = "pronto"
ERRO = "erro"

MODELO_DEMUCS = os.environ.get("KARAOKE_MODELO", "htdemucs")


@dataclass
class Trabalho:
    id: str
    status: str = NA_FILA
    progresso: int = 0              # 0–100 da etapa atual
    mensagem: str = "Aguardando na fila"
    origem: str = ""                # link do YouTube ou nome do arquivo
    video_id: str = ""
    titulo: str = ""
    artista: str = ""
    duracao: Optional[float] = None
    criado_em: float = field(default_factory=time.time)
    atualizado_em: float = field(default_factory=time.time)
    arquivo_original: str = ""

    def publico(self, pasta_base: Path) -> dict:
        dados = asdict(self)
        dados.pop("arquivo_original", None)
        dados["tem_instrumental"] = (pasta_base / self.id / "instrumental.mp3").exists()
        dados["tem_vocal"] = (pasta_base / self.id / "vocal.mp3").exists()
        return dados


class ErroDeProcessamento(Exception):
    """Erro com mensagem já amigável para mostrar no app."""


# ── Ferramentas ──────────────────────────────────────────────────────────────


def tem_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def tem_modulo(nome: str) -> bool:
    try:
        __import__(nome)
        return True
    except Exception:
        return False


def tem_gpu() -> bool:
    try:
        import torch  # type: ignore

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def diagnostico() -> dict:
    return {
        "ffmpeg": tem_ffmpeg(),
        "yt_dlp": tem_modulo("yt_dlp"),
        "demucs": tem_modulo("demucs"),
        "gpu": tem_gpu(),
        "modelo": MODELO_DEMUCS,
    }


# ── Etapas padrão (podem ser trocadas nos testes) ────────────────────────────

AtualizaProgresso = Callable[[int, str], None]


def baixar_do_youtube(url: str, pasta: Path, progresso: AtualizaProgresso) -> dict:
    """Baixa só o áudio. Retorna título, artista, duração, id e caminho do arquivo."""
    try:
        import yt_dlp  # type: ignore
    except ImportError as exc:
        raise ErroDeProcessamento("yt-dlp não está instalado. Rode o instalar.bat de novo.") from exc

    def gancho(d: dict) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            feito = d.get("downloaded_bytes") or 0
            if total:
                progresso(int(feito * 100 / total), "Baixando o áudio do YouTube")

    opcoes = {
        "format": "bestaudio/best",
        "outtmpl": str(pasta / "original.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [gancho],
    }
    try:
        with yt_dlp.YoutubeDL(opcoes) as ydl:
            info = ydl.extract_info(url, download=True)
            caminho = Path(ydl.prepare_filename(info))
    except Exception as exc:  # yt-dlp lança vários tipos
        texto = str(exc)
        if "Sign in to confirm" in texto or "age" in texto.lower():
            raise ErroDeProcessamento(
                "O YouTube pediu login para este vídeo (restrição de idade ou verificação). Tente outro link."
            ) from exc
        if "Private video" in texto or "unavailable" in texto.lower():
            raise ErroDeProcessamento("Vídeo indisponível ou privado.") from exc
        raise ErroDeProcessamento(
            "Não consegui baixar do YouTube. Se continuar, atualize o yt-dlp (atualizar.bat)."
        ) from exc

    if not caminho.exists():
        candidatos = sorted(pasta.glob("original.*"))
        if not candidatos:
            raise ErroDeProcessamento("O download terminou mas o arquivo não apareceu.")
        caminho = candidatos[0]

    return {
        "arquivo": caminho,
        "titulo": info.get("track") or info.get("title") or "",
        "artista": info.get("artist") or info.get("creator") or "",
        "duracao": info.get("duration"),
        "video_id": info.get("id") or "",
    }


_PERCENTUAL = re.compile(r"(\d{1,3})%\|")


def separar_com_demucs(entrada: Path, pasta: Path, progresso: AtualizaProgresso) -> None:
    """Roda o Demucs (2 trilhas: voz e resto) e deixa instrumental.mp3 e vocal.mp3 na pasta."""
    if not tem_modulo("demucs"):
        raise ErroDeProcessamento("Demucs não está instalado. Rode o instalar.bat de novo.")
    if not tem_ffmpeg():
        raise ErroDeProcessamento("ffmpeg não encontrado. Veja o passo do ffmpeg no LEIA-ME.")

    saida = pasta / "demucs"
    comando = [
        sys.executable, "-m", "demucs",
        "--two-stems", "vocals",
        "-n", MODELO_DEMUCS,
        "--mp3", "--mp3-bitrate", "256",
        "-o", str(saida),
        str(entrada),
    ]
    processo = subprocess.Popen(
        comando,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=str(pasta),
    )
    assert processo.stdout is not None
    ultimas_linhas: list[str] = []
    buffer = b""
    while True:
        bloco = processo.stdout.read(256)
        if not bloco:
            break
        buffer += bloco
        # A barra de progresso usa \r; quebramos em \r e \n
        partes = re.split(rb"[\r\n]", buffer)
        buffer = partes.pop()
        for parte in partes:
            linha = parte.decode("utf-8", errors="replace").strip()
            if not linha:
                continue
            ultimas_linhas = (ultimas_linhas + [linha])[-15:]
            achado = _PERCENTUAL.search(linha)
            if achado:
                progresso(min(99, int(achado.group(1))), "Separando a voz (Demucs)")
            elif "Downloading" in linha or "download" in linha.lower():
                progresso(0, "Baixando o modelo de IA (só na primeira vez)")
    codigo = processo.wait()
    if codigo != 0:
        detalhe = " | ".join(ultimas_linhas[-3:])
        if "CUDA out of memory" in detalhe or "out of memory" in detalhe.lower():
            raise ErroDeProcessamento("Faltou memória para separar. Feche outros programas e tente de novo.")
        raise ErroDeProcessamento(f"O Demucs falhou (código {codigo}). {detalhe}"[:400])

    resultados = list(saida.rglob("no_vocals.mp3"))
    vozes = list(saida.rglob("vocals.mp3"))
    if not resultados or not vozes:
        raise ErroDeProcessamento("O Demucs terminou mas não gerou os arquivos esperados.")
    shutil.move(str(resultados[0]), pasta / "instrumental.mp3")
    shutil.move(str(vozes[0]), pasta / "vocal.mp3")
    shutil.rmtree(saida, ignore_errors=True)


# ── Fila ─────────────────────────────────────────────────────────────────────


class Fila:
    """Guarda os trabalhos e processa um por vez numa thread separada."""

    def __init__(
        self,
        pasta: Path = PASTA_TRABALHOS,
        baixar: Callable[[str, Path, AtualizaProgresso], dict] = baixar_do_youtube,
        separar: Callable[[Path, Path, AtualizaProgresso], None] = separar_com_demucs,
    ) -> None:
        self.pasta = pasta
        self.baixar = baixar
        self.separar = separar
        self._trabalhos: dict[str, Trabalho] = {}
        self._trava = threading.Lock()
        self._sinal = threading.Event()
        self.pasta.mkdir(parents=True, exist_ok=True)
        self._carregar_do_disco()
        threading.Thread(target=self._laco, name="fila-karaoke", daemon=True).start()

    # Persistência simples em info.json
    def _carregar_do_disco(self) -> None:
        for info in self.pasta.glob("*/info.json"):
            try:
                dados = json.loads(info.read_text(encoding="utf-8"))
                trabalho = Trabalho(**{k: v for k, v in dados.items() if k in Trabalho.__dataclass_fields__})
            except Exception:
                continue
            # Trabalho interrompido (PC desligado no meio) volta para a fila
            if trabalho.status in (BAIXANDO, SEPARANDO):
                trabalho.status = NA_FILA
                trabalho.progresso = 0
                trabalho.mensagem = "Retomando após reinício"
            self._trabalhos[trabalho.id] = trabalho
        if any(t.status == NA_FILA for t in self._trabalhos.values()):
            self._sinal.set()

    def _salvar(self, trabalho: Trabalho) -> None:
        trabalho.atualizado_em = time.time()
        pasta = self.pasta / trabalho.id
        pasta.mkdir(parents=True, exist_ok=True)
        temporario = pasta / "info.json.tmp"
        temporario.write_text(json.dumps(asdict(trabalho), ensure_ascii=False, indent=2), encoding="utf-8")
        temporario.replace(pasta / "info.json")

    # API usada pelo servidor
    def listar(self) -> list[dict]:
        with self._trava:
            itens = sorted(self._trabalhos.values(), key=lambda t: t.criado_em, reverse=True)
            return [t.publico(self.pasta) for t in itens]

    def obter(self, id_: str) -> Optional[Trabalho]:
        with self._trava:
            return self._trabalhos.get(id_)

    def publico(self, trabalho: Trabalho) -> dict:
        return trabalho.publico(self.pasta)

    def arquivo_resultado(self, id_: str, tipo: str) -> Path:
        return self.pasta / id_ / f"{tipo}.mp3"

    def criar_do_youtube(self, url: str, titulo: str = "", artista: str = "", video_id: str = "") -> Trabalho:
        trabalho = Trabalho(id=uuid.uuid4().hex[:12], origem=url, titulo=titulo, artista=artista, video_id=video_id)
        with self._trava:
            # Mesmo vídeo já pronto ou em andamento: reaproveita
            if video_id:
                for existente in self._trabalhos.values():
                    if existente.video_id == video_id and existente.status != ERRO:
                        return existente
            self._trabalhos[trabalho.id] = trabalho
            self._salvar(trabalho)
        self._sinal.set()
        return trabalho

    def criar_de_arquivo(self, nome: str, conteudo: bytes, titulo: str = "", artista: str = "") -> Trabalho:
        extensao = Path(nome).suffix.lower() or ".mp3"
        if not re.fullmatch(r"\.[a-z0-9]{1,5}", extensao):
            extensao = ".mp3"
        trabalho = Trabalho(
            id=uuid.uuid4().hex[:12],
            origem=nome,
            titulo=titulo or Path(nome).stem,
            artista=artista,
        )
        pasta = self.pasta / trabalho.id
        pasta.mkdir(parents=True, exist_ok=True)
        destino = pasta / f"original{extensao}"
        destino.write_bytes(conteudo)
        trabalho.arquivo_original = destino.name
        with self._trava:
            self._trabalhos[trabalho.id] = trabalho
            self._salvar(trabalho)
        self._sinal.set()
        return trabalho

    def apagar(self, id_: str) -> bool:
        with self._trava:
            trabalho = self._trabalhos.get(id_)
            if not trabalho or trabalho.status in (BAIXANDO, SEPARANDO):
                return False
            del self._trabalhos[id_]
        shutil.rmtree(self.pasta / id_, ignore_errors=True)
        return True

    def tentar_de_novo(self, id_: str) -> bool:
        with self._trava:
            trabalho = self._trabalhos.get(id_)
            if not trabalho or trabalho.status != ERRO:
                return False
            trabalho.status = NA_FILA
            trabalho.progresso = 0
            trabalho.mensagem = "Aguardando na fila"
            self._salvar(trabalho)
        self._sinal.set()
        return True

    # Processamento
    def _proximo(self) -> Optional[Trabalho]:
        with self._trava:
            pendentes = [t for t in self._trabalhos.values() if t.status == NA_FILA]
            return min(pendentes, key=lambda t: t.criado_em) if pendentes else None

    def _atualizar(self, trabalho: Trabalho, **campos) -> None:
        with self._trava:
            for chave, valor in campos.items():
                setattr(trabalho, chave, valor)
            self._salvar(trabalho)

    def _laco(self) -> None:
        while True:
            self._sinal.wait()
            trabalho = self._proximo()
            if trabalho is None:
                self._sinal.clear()
                continue
            self.processar(trabalho)

    def processar(self, trabalho: Trabalho) -> None:
        pasta = self.pasta / trabalho.id
        pasta.mkdir(parents=True, exist_ok=True)
        ultimo_salvo = [0.0]

        def progresso_de(status: str) -> AtualizaProgresso:
            def atualiza(valor: int, mensagem: str) -> None:
                # Evita gravar em disco a cada linha do Demucs
                agora = time.time()
                if agora - ultimo_salvo[0] < 0.5 and valor not in (0, 100):
                    trabalho.progresso = valor
                    return
                ultimo_salvo[0] = agora
                self._atualizar(trabalho, status=status, progresso=valor, mensagem=mensagem)

            return atualiza

        try:
            # 1) Áudio de entrada
            entrada = pasta / trabalho.arquivo_original if trabalho.arquivo_original else None
            if entrada is None or not entrada.exists():
                if not trabalho.origem.startswith("http"):
                    raise ErroDeProcessamento("Arquivo de áudio não encontrado.")
                self._atualizar(trabalho, status=BAIXANDO, progresso=0, mensagem="Baixando o áudio do YouTube")
                for antigo in pasta.glob("original.*"):
                    antigo.unlink(missing_ok=True)
                info = self.baixar(trabalho.origem, pasta, progresso_de(BAIXANDO))
                entrada = Path(info["arquivo"])
                self._atualizar(
                    trabalho,
                    arquivo_original=entrada.name,
                    titulo=trabalho.titulo or info.get("titulo", ""),
                    artista=trabalho.artista or info.get("artista", ""),
                    duracao=info.get("duracao") or trabalho.duracao,
                    video_id=trabalho.video_id or info.get("video_id", ""),
                )

            # 2) Separação
            self._atualizar(trabalho, status=SEPARANDO, progresso=0, mensagem="Separando a voz (Demucs)")
            self.separar(entrada, pasta, progresso_de(SEPARANDO))

            # 3) Pronto: o original não é mais necessário
            entrada.unlink(missing_ok=True)
            self._atualizar(trabalho, status=PRONTO, progresso=100, mensagem="Pronto para cantar", arquivo_original="")
        except ErroDeProcessamento as exc:
            self._atualizar(trabalho, status=ERRO, progresso=0, mensagem=str(exc))
        except Exception as exc:  # erro inesperado: registra e segue a fila
            self._atualizar(trabalho, status=ERRO, progresso=0, mensagem=f"Erro inesperado: {exc}"[:400])
