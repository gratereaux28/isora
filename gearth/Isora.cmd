@echo off
setlocal
rem Forward G-Earth arguments without changing the working folder or copying files.
"%~dp0Isora.exe" %*
exit /b %errorlevel%
