@echo off
REM Wrapper: PowerShell encoding often silently fails on Windows; use Node instead.
cd /d "%~dp0.."
node scripts\configure-hermes-local.mjs
if errorlevel 1 exit /b 1
