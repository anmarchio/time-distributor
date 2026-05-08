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

REM Start Flask app
python app.py

pause