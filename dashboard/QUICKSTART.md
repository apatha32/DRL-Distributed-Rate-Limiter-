# Quick Start Guide - DRL Dashboard

## ⚡ 30-Second Setup

### Option 1: Using npm (Recommended)

```bash
cd dashboard
npm install
npm run dev
```

Then open `http://localhost:3000` in your browser.

### Option 2: Using setup scripts

**macOS/Linux:**
```bash
cd dashboard
chmod +x setup.sh
./setup.sh
npm run dev
```

**Windows:**
```bash
cd dashboard
setup.bat
npm run dev
```

## 📋 Requirements

- Node.js 16+ ([Download](https://nodejs.org))
- npm or yarn
- DRL backend running on `localhost:8000` (for real data)

## 🎯 First Time Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Visit the dashboard:**
   Open [http://localhost:3000](http://localhost:3000)

4. **Explore the features:**
   - Dashboard: View real-time metrics
   - Algorithms: Learn about rate limiting algorithms
   - Metrics: Deep-dive into performance data
   - Demo: Try the interactive simulator

## 🚀 Build for Production

```bash
npm run build
npm run preview
```

The production build will be in the `dist/` directory.

## 📦 Available Commands

```bash
npm run dev       # Start development server (http://localhost:3000)
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint checks
```

## 🐳 Docker Setup

```bash
# Build image
docker build -t drl-dashboard .

# Run container
docker run -p 3000:3000 drl-dashboard
```

## 🔗 Backend Connection

The dashboard expects your DRL backend on `http://localhost:8000`.

**To change the backend URL:**

Edit `dashboard/vite.config.ts`:
```typescript
proxy: {
  '/api': {
    target: 'http://your-backend:8000',  // Change this
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '/v1'),
  },
}
```

## 📱 Features Overview

### 🏠 Dashboard
- Real-time KPIs and metrics
- Live charts showing trends
- Algorithm performance comparison
- Request volume and latency tracking

### 🧮 Algorithms
- Token Bucket explanation
- Fixed Window details
- Sliding Window visualization
- Performance comparison matrix
- Pseudocode examples

### 📊 Metrics
- Detailed performance analysis
- Latency percentiles (P50, P95, P99)
- Error distribution
- Per-client metrics
- System health indicators

### 🎮 Demo
- Interactive rate limiter simulator
- Real-time event stream
- Configurable parameters
- Algorithm behavior demonstration

## 🐛 Troubleshooting

### Port 3000 already in use?

```bash
# Kill process on port 3000 (macOS/Linux)
lsof -ti:3000 | xargs kill -9

# Or use a different port
npm run dev -- --port 3001
```

### Backend not responding?

1. Check if DRL backend is running:
   ```bash
   curl http://localhost:8000/health
   ```

2. If backend is on different port, update `vite.config.ts`

3. Check for CORS errors in browser console

### npm install fails?

```bash
# Clear npm cache
npm cache clean --force

# Try again
npm install
```

### Chart not displaying?

- Check browser console for errors
- Verify Recharts is installed: `npm list recharts`
- Ensure data is being loaded correctly

## 💡 Tips

1. **Use mock data during development:**
   - The demo page uses simulated data
   - Real metrics need backend connection

2. **Theme toggle:**
   - Click the sun/moon icon in the navbar
   - Currently set to dark theme by default

3. **Responsive design:**
   - Works on mobile, tablet, and desktop
   - Try resizing your browser

4. **Performance:**
   - Data updates every 5 seconds
   - Charts are optimized for smooth rendering
   - Build with `npm run build` for production

## 📚 Documentation

- [Features Guide](./FEATURES.md) - Complete feature list
- [API Integration](./API_INTEGRATION.md) - Backend API setup
- [Docker Guide](./DOCKER.md) - Docker deployment
- [Main README](./README.md) - Detailed documentation

## 🆘 Need Help?

1. Check the documentation files
2. Look at component props in source code
3. Check browser DevTools console for errors
4. Visit the [DRL GitHub](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-)

## 🎓 Learning Resources

- **Recharts Docs:** https://recharts.org/
- **React Docs:** https://react.dev/
- **Tailwind CSS:** https://tailwindcss.com/
- **TypeScript:** https://www.typescriptlang.org/

## 🚢 Deployment

### Vercel (Recommended)
```bash
npm install -g vercel
vercel
```

### Netlify
```bash
npm run build
netlify deploy --prod --dir=dist
```

### Docker Hub
```bash
docker build -t your-username/drl-dashboard .
docker push your-username/drl-dashboard
```

## 📞 Support

For issues specific to the dashboard, check the [documentation](./README.md).

For DRL backend issues, visit the [main repository](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-).

---

**Happy monitoring! 🎉**
