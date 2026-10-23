@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo  ===== Karaoke do Romas - instalacao do servico do PC =====
echo.

rem --- 1. Python 3.11 ---
set "PY="
py -3.11 --version >nul 2>&1 && set "PY=py -3.11"
if not defined PY (
  python --version >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo  Python nao encontrado. Instalando o Python 3.11 pelo winget...
  winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
  echo.
  echo  Python instalado. FECHE esta janela e rode o instalar.bat de novo.
  pause
  exit /b 1
)
echo  Python: %PY%

rem --- 2. ffmpeg ---
where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo  ffmpeg nao encontrado. Instalando pelo winget...
  winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
  set "PRECISA_REABRIR=1"
)

rem --- 3. Deno (o yt-dlp usa para baixar do YouTube) ---
where deno >nul 2>&1
if errorlevel 1 (
  echo  Instalando o Deno pelo winget...
  winget install --id DenoLand.Deno -e --accept-source-agreements --accept-package-agreements
  set "PRECISA_REABRIR=1"
)

rem --- 4. Ambiente Python do servico ---
if not exist ".venv\Scripts\python.exe" (
  echo  Criando o ambiente do servico...
  %PY% -m venv .venv || goto :erro
)
set "VPY=.venv\Scripts\python.exe"
"%VPY%" -m pip install --upgrade pip || goto :erro

rem --- 5. PyTorch: com placa NVIDIA usa a versao CUDA (bem mais rapida) ---
where nvidia-smi >nul 2>&1
if errorlevel 1 (
  echo  Sem placa NVIDIA: instalando versao para processador.
  "%VPY%" -m pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu || goto :erro
) else (
  echo  Placa NVIDIA encontrada: instalando versao com CUDA.
  "%VPY%" -m pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121 || goto :erro
)

rem --- 6. Demucs e yt-dlp ---
"%VPY%" -m pip install -r requirements.txt || goto :erro

echo.
echo  ===== Instalacao concluida! =====
if defined PRECISA_REABRIR echo  Foram instalados programas novos: feche esta janela antes de abrir o iniciar.bat.
echo  Para ligar o servico, de dois cliques em iniciar.bat
echo.
pause
exit /b 0

:erro
echo.
echo  Algo deu errado na instalacao. Tire uma foto desta tela para pedir ajuda.
pause
exit /b 1
