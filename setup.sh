#!/bin/bash

echo "🚀 Setting up DockGen AI Frontend"
echo "================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v18 or higher) first."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🔧 Setting up environment file..."

# Create .env.local file if it doesn't exist
if [ ! -f ".env.local" ]; then
    echo "📝 Creating .env.local file..."
    cp env.local.example .env.local
    echo "✅ Frontend environment file created"
else
    echo "✅ .env.local file already exists"
fi

echo "✅ Frontend setup complete!"
echo ""
echo "🚀 To start the frontend:"
echo "   npm run dev"
echo ""
echo "📚 Make sure to:"
echo "   1. Backend API is running on http://localhost:3001"
echo "   2. Update .env.local if backend runs on different port"
echo ""
echo "🌐 Frontend will be available at:"
echo "   http://localhost:3000"
