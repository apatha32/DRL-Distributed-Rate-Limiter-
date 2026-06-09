#!/bin/bash

echo "🚀 Installing DRL Dashboard dependencies..."
cd "$(dirname "$0")"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it first."
    exit 1
fi

echo "📦 Node version: $(node --version)"
echo "📦 npm version: $(npm --version)"

# Install dependencies
echo "📥 Installing npm packages..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Installation complete!"
    echo ""
    echo "🎯 Quick Start:"
    echo "   npm run dev      - Start development server"
    echo "   npm run build    - Build for production"
    echo "   npm run preview  - Preview production build"
    echo ""
    echo "🌐 Dashboard will be available at: http://localhost:3000"
    echo ""
    echo "💡 Tip: Make sure your DRL backend is running on http://localhost:8000"
else
    echo "❌ Installation failed. Please check the error messages above."
    exit 1
fi
