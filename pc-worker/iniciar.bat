@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo  O servico ainda nao foi instalado. Rode primeiro o instalar.bat
  pause
  exit /b 1
)
title Karaoke do Romas - servico do PC
".venv\Scripts\python.exe" servidor.py %*
pause
