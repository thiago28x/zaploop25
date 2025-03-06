@echo off
echo Killing any process on port 4002...

REM Find the PID of the process using port 4002
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4002"') do (
  set "PID=%%a"
  goto :killProcess
)

:killProcess
REM If a PID was found, kill the process
if defined PID (
  echo Process found with PID: %PID%
  taskkill /F /PID %PID%
  echo Process with PID %PID% has been terminated.
) else (
  echo No process found using port 4002.
)

echo Done.
pause 