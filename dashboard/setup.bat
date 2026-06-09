@echo off
echo.
echo 🚀 Installing DRL Dashboard dependencies...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install it first.
    exit /b 1
)

echo 📦 Node version: 
node --version
echo 📦 npm version:
npm --version
echo.

REM Install dependencies
echo 📥 Installing npm packages...
call npm install

if errorlevel 1 (
    echo ❌ Installation failed. Please check the error messages above.
    exit /b 1
)

echo.
echo ✅ Installation complete!
echo.
echo 🎯 Quick Start:
echo    npm run dev      - Start development server
echo    npm run build    - Build for production
echo    npm run preview  - Preview production build
echo.
echo 🌐 Dashboard will be available at: http://localhost:3000
echo.
echo 💡 Tip: Make sure your DRL backend is running on http://localhost:8000
echo.
