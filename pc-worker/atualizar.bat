@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo  Atualizando o yt-dlp (o YouTube muda com frequencia)...
".venv\Scripts\python.exe" -m pip install --upgrade "yt-dlp[default]"
echo  Pronto.
pause
