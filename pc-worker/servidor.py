"""
Karaokê do Romas — serviço do PC (Fase 2)

Servidor HTTP simples (só biblioteca padrão do Python) que o app chama pela
rede de casa para separar a voz de músicas que não têm versão karaokê.

Uso:
    python servidor.py              (porta 8765)
    python servidor.py --porta 9000

Endpoints (JSON):
    GET    /saude                         diagnóstico (ffmpeg, yt-dlp, demucs, GPU)
    GET    /trabalhos                     lista de trabalhos
    POST   /trabalhos                     {"url": "...", "titulo"?, "artista"?, "video_id"?}
    POST   /trabalhos/arquivo             corpo = bytes do áudio; cabeçalhos X-Nome-Arquivo, X-Titulo, X-Artista (URL-encoded)
    GET    /trabalhos/<id>                estado de um trabalho
    GET    /trabalhos/<id>/instrumental   MP3 sem voz
    GET    /trabalhos/<id>/vocal          MP3 só com a voz
    POST   /trabalhos/<id>/tentar-de-novo refaz um trabalho com erro
    DELETE /trabalhos/<id>                apaga o trabalho e os arquivos

Use só na rede de casa. Não abra esta porta no roteador para a internet.
"""

from __future__ import annotations

import argparse
import json
import re
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

from processamento import Fila, diagnostico

VERSAO = "1.0.0"
LIMITE_UPLOAD = 200 * 1024 * 1024  # 200 MB
_ID = r"[0-9a-f]{12}"

fila: Optional[Fila] = None


def ip_da_rede() -> str:
    """Descobre o IP do PC na rede de casa (para mostrar no terminal)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def eh_link_youtube(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return False
    host = host.lower()
    return host.endswith("youtube.com") or host == "youtu.be" or host.endswith("youtube-nocookie.com")


class Manipulador(BaseHTTPRequestHandler):
    server_version = f"KaraokeDoRomasPC/{VERSAO}"

    # ── utilidades ──
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers", "Content-Type, X-Nome-Arquivo, X-Titulo, X-Artista"
        )
        # Permite que páginas abertas por outro endereço chamem o PC na rede local (Chrome)
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, codigo: int, dados) -> None:
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def _erro(self, codigo: int, mensagem: str) -> None:
        self._json(codigo, {"erro": mensagem})

    def _ler_corpo(self) -> Optional[bytes]:
        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho > LIMITE_UPLOAD:
            self._erro(413, "Arquivo grande demais (limite de 200 MB).")
            return None
        return self.rfile.read(tamanho) if tamanho else b""

    def _arquivo(self, caminho: Path, nome_download: str) -> None:
        if not caminho.exists():
            self._erro(404, "Arquivo ainda não está pronto.")
            return
        tamanho = caminho.stat().st_size
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(tamanho))
        self.send_header("Content-Disposition", f'inline; filename="{nome_download}"')
        self.end_headers()
        with caminho.open("rb") as f:
            while True:
                bloco = f.read(256 * 1024)
                if not bloco:
                    break
                self.wfile.write(bloco)

    def log_message(self, formato: str, *args) -> None:  # menos barulho no terminal
        if "/saude" in (args[0] if args else ""):
            return
        sys.stderr.write("  %s\n" % (formato % args))

    # ── rotas ──
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        assert fila is not None
        caminho = urlparse(self.path).path.rstrip("/") or "/"

        if caminho in ("/", "/saude"):
            self._json(200, {"ok": True, "versao": VERSAO, "servico": "karaoke-do-romas-pc", **diagnostico()})
            return
        if caminho == "/trabalhos":
            self._json(200, {"trabalhos": fila.listar()})
            return

        m = re.fullmatch(rf"/trabalhos/({_ID})", caminho)
        if m:
            trabalho = fila.obter(m.group(1))
            if not trabalho:
                self._erro(404, "Trabalho não encontrado.")
            else:
                self._json(200, fila.publico(trabalho))
            return

        m = re.fullmatch(rf"/trabalhos/({_ID})/(instrumental|vocal)", caminho)
        if m:
            trabalho = fila.obter(m.group(1))
            if not trabalho:
                self._erro(404, "Trabalho não encontrado.")
                return
            self._arquivo(fila.arquivo_resultado(trabalho.id, m.group(2)), f"{m.group(2)}.mp3")
            return

        self._erro(404, "Endereço não encontrado.")

    def do_POST(self) -> None:  # noqa: N802
        assert fila is not None
        caminho = urlparse(self.path).path.rstrip("/")

        if caminho == "/trabalhos":
            corpo = self._ler_corpo()
            if corpo is None:
                return
            try:
                dados = json.loads(corpo or b"{}")
            except json.JSONDecodeError:
                self._erro(400, "Pedido inválido (JSON).")
                return
            url = str(dados.get("url") or "").strip()
            if not eh_link_youtube(url):
                self._erro(400, "Envie um link do YouTube.")
                return
            trabalho = fila.criar_do_youtube(
                url,
                titulo=str(dados.get("titulo") or "")[:200],
                artista=str(dados.get("artista") or "")[:200],
                video_id=str(dados.get("video_id") or "")[:20],
            )
            self._json(201, fila.publico(trabalho))
            return

        if caminho == "/trabalhos/arquivo":
            corpo = self._ler_corpo()
            if corpo is None:
                return
            if not corpo:
                self._erro(400, "Arquivo vazio.")
                return
            nome = unquote(self.headers.get("X-Nome-Arquivo") or "musica.mp3")
            titulo = unquote(self.headers.get("X-Titulo") or "")[:200]
            artista = unquote(self.headers.get("X-Artista") or "")[:200]
            trabalho = fila.criar_de_arquivo(Path(nome).name, corpo, titulo=titulo, artista=artista)
            self._json(201, fila.publico(trabalho))
            return

        m = re.fullmatch(rf"/trabalhos/({_ID})/tentar-de-novo", caminho)
        if m:
            if fila.tentar_de_novo(m.group(1)):
                self._json(200, fila.publico(fila.obter(m.group(1))))  # type: ignore[arg-type]
            else:
                self._erro(409, "Só dá para tentar de novo um trabalho com erro.")
            return

        self._erro(404, "Endereço não encontrado.")

    def do_DELETE(self) -> None:  # noqa: N802
        assert fila is not None
        caminho = urlparse(self.path).path.rstrip("/")
        m = re.fullmatch(rf"/trabalhos/({_ID})", caminho)
        if not m:
            self._erro(404, "Endereço não encontrado.")
            return
        if fila.apagar(m.group(1)):
            self._json(200, {"ok": True})
        else:
            self._erro(409, "Não dá para apagar agora (não existe ou está processando).")


def main() -> None:
    global fila
    parser = argparse.ArgumentParser(description="Serviço do PC do Karaokê do Romas")
    parser.add_argument("--porta", type=int, default=8765)
    args = parser.parse_args()

    fila = Fila()
    diag = diagnostico()
    ip = ip_da_rede()

    print("")
    print("  Karaokê do Romas — serviço do PC")
    print("  ---------------------------------")
    print(f"  Neste PC:        http://localhost:{args.porta}")
    print(f"  Na rede de casa: http://{ip}:{args.porta}   <- use este endereço no celular")
    print("")
    print(f"  ffmpeg: {'ok' if diag['ffmpeg'] else 'FALTANDO'}   yt-dlp: {'ok' if diag['yt_dlp'] else 'FALTANDO'}   "
          f"demucs: {'ok' if diag['demucs'] else 'FALTANDO'}   placa de vídeo (GPU): {'sim' if diag['gpu'] else 'não (usa o processador)'}")
    print("  Deixe esta janela aberta. Para parar: Ctrl+C")
    print("")

    servidor = ThreadingHTTPServer(("0.0.0.0", args.porta), Manipulador)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n  Serviço encerrado.")


if __name__ == "__main__":
    main()
