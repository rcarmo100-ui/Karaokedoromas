@echo off
chcp 65001 >nul
echo.
echo  ===== Karaoke do Romas - acesso de qualquer lugar (Tailscale) =====
echo.
where tailscale >/dev/null 2>&1
if errorlevel 1 (
  echo  Tailscale nao encontrado. Instalando pelo winget...
  winget install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements
  echo.
  echo  Depois de instalar: abra o Tailscale, entre com sua conta Google
  echo  e rode este arquivo de novo.
  pause
  exit /b 1
)
echo  Publicando o servico do PC (porta 8765) com HTTPS na sua rede Tailscale...
tailscale serve --bg localhost:8765
echo.
tailscale serve status
echo.
echo  Copie o endereco https://....ts.net mostrado acima e cole na aba PC do app.
echo  Se apareceu um link pedindo para ativar HTTPS, abra o link, ative e rode este arquivo de novo.
echo  O iniciar.bat continua precisando estar aberto.
echo.
pause
