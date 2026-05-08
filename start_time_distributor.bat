@echo off

echo ====================================
echo Starting Jira Time Distributor...
echo ====================================

REM Change to script directory
cd /d %~dp0

REM Optional: activate virtual environment
IF EXIST .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
)

REM Install Flask if missing
python -m pip install flask

REM Start Flask server in background
start cmd /k python app.py

REM Wait 2 seconds for server startup
timeout /t 2 /nobreak > nul

REM Open browser
start http://127.0.0.1:5000