# DockGen AI Frontend

AI-Powered Dockerfile Generator Frontend Application

## 🚀 Features

- 🤖 **AI-powered Dockerfile generation** for JavaScript frameworks (React, Next.js, Vue, Angular)
- 🐳 **Automatic Docker image building** with real Docker commands
- 🔍 **GitHub repository analysis** and tech stack detection
- 📝 **Syntax validation** and error handling
- 🚀 **One-click deployment** workflow
- 📊 **Real-time progress tracking** with status updates
- 💾 **Generation history** and result management

## 🛠️ Tech Stack

- **Frontend:** Next.js (App Router) + TypeScript + Shadcn/UI + Tailwind CSS
- **UI Components:** Radix UI + Lucide React
- **Styling:** Tailwind CSS
- **State Management:** React Hooks

## ⚡ Quick Start

### Prerequisites

- Node.js (v18 or higher)
- Backend API running on http://localhost:3001

### Installation

```bash
# Install dependencies
npm install

# Create environment file
cp env.local.example .env.local
```

### Environment Configuration

Create a `.env.local` file in the frontend directory:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🎯 Usage

1. **Open the application** at `http://localhost:3000`
2. **Enter GitHub repository URL** (e.g., `https://github.com/username/repository`)
3. **Provide GitHub Personal Access Token** (for private repos)
4. **Click "Generate & Build Image"**
5. **Watch the AI agent:**
   - Fetch the repository
   - Detect the tech stack
   - Validate syntax
   - Generate optimized Dockerfile
   - Build the Docker image
6. **View results:**
   - Generated Dockerfile
   - Detected tech stack
   - Build status and image ID
   - Copy or download the Dockerfile

## 🏗️ Architecture

### Frontend (Next.js)
- **React components** with TypeScript
- **Shadcn/UI** for consistent design system
- **Tailwind CSS** for styling
- **Real-time status polling** for generation progress
- **Responsive design** for all devices

### Components Structure
```
src/
├── app/                 # Next.js App Router pages
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Home page
├── components/         # Reusable UI components
│   └── ui/            # Shadcn/UI components
└── lib/               # API client and utilities
    ├── api.ts         # API client
    └── utils.ts       # Utility functions
```

## 🚀 Deployment

### Production Build
```bash
npm run build
npm start
```

### Environment Variables (Production)
```bash
NEXT_PUBLIC_API_URL=https://your-backend-domain.com/api
```

## 🔧 API Integration

The frontend communicates with the backend API through the `ApiClient` class:

- **Health Check:** `GET /health`
- **Generate Dockerfile:** `POST /api/generation/generate`
- **Get Status:** `GET /api/generation/status/:id`
- **Get History:** `GET /api/generation/history`
- **Push Dockerfile:** `POST /api/generation/push-dockerfile`

## 📊 Features

### Real-time Status Updates
- Polls backend for generation status
- Shows progress indicators
- Handles connection errors gracefully
- Automatic timeout protection

### User Interface
- Modern, responsive design
- Dark/light mode support
- Loading states and animations
- Error handling and user feedback

### Dockerfile Management
- Copy to clipboard functionality
- Download as file
- Push to GitHub repository
- Syntax highlighting

## 🧪 Testing

```bash
# Run linting
npm run lint

# Type checking
npx tsc --noEmit
```

## 📝 Development

### Adding New Features
1. **Components:** Add components in `src/components/`
2. **Pages:** Add pages in `src/app/`
3. **API:** Update API client in `src/lib/api.ts`
4. **Styling:** Use Tailwind CSS classes

### Code Style
- **TypeScript** for type safety
- **ESLint** for code quality
- **Tailwind CSS** for styling
- **Shadcn/UI** for components

## 🔒 Security

- **Input validation** on client side
- **Error message sanitization**
- **Secure API communication**
- **CORS handling**

## 📱 Responsive Design

- **Mobile-first** approach
- **Tablet and desktop** optimized
- **Touch-friendly** interactions
- **Accessible** components