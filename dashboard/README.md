# DRL Dashboard - Distributed Rate Limiter

A professional React dashboard for monitoring and demonstrating distributed rate limiting systems. Built with TypeScript, Tailwind CSS, and Recharts.

## 🎯 Features

### Dashboard
- **Real-time metrics** with live updating statistics
- **Algorithm distribution** visualization with pie charts
- **Performance monitoring** with latency tracking
- **Live request trends** showing allowed vs blocked requests
- **Client performance** table with detailed metrics

### Algorithms
- **Algorithm comparison** with detailed pros/cons
- **Performance characteristics** visualization
- **Latency analysis** vs request load
- **Pseudocode examples** for each algorithm
- **Comparison matrix** with all key metrics

### Metrics
- **Request volume** tracking over time
- **Latency percentiles** (P50, P95, P99)
- **Error distribution** by type
- **Client metrics** with block rates
- **System health** indicators

### Demo
- **Interactive simulator** with real-time events
- **Configurable parameters** (algorithm, RPS, rate limit)
- **Live event stream** showing requests
- **Performance statistics** updated in real-time
- **Algorithm-specific** behavior demonstration

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation

```bash
cd dashboard
npm install
```

### Development

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000`

### Build

```bash
npm run build
```

Production-ready build in `dist/` directory.

## 📊 Architecture

```
src/
├── components/
│   ├── Navbar.tsx           # Navigation & theme toggle
│   ├── StatCard.tsx         # KPI display component
│   └── ChartCard.tsx        # Chart wrapper component
├── pages/
│   ├── Dashboard.tsx        # Main dashboard
│   ├── Algorithms.tsx       # Algorithm comparison
│   ├── MetricsDetail.tsx    # Detailed metrics
│   └── Demo.tsx             # Interactive simulator
├── App.tsx                  # Main app component
├── main.tsx                 # Entry point
└── index.css               # Global styles with Tailwind
```

## 🎨 Design System

- **Color Scheme**: Dark theme with cyan/blue accents
- **Glass Effect**: Frosted glass cards with backdrop blur
- **Typography**: System font stack with semantic hierarchy
- **Spacing**: Consistent padding/margins using Tailwind scale
- **Responsiveness**: Mobile-first design with breakpoints

## 📈 Metrics Tracked

### Request Metrics
- Total requests
- Allowed requests (success rate)
- Blocked requests (block rate)
- Active clients

### Performance Metrics
- P50 latency
- P95 latency
- P99 latency
- Average latency

### Algorithm Metrics
- Token Bucket: 1.2ms avg latency, O(1) complexity
- Fixed Window: 0.8ms avg latency, O(1) complexity
- Sliding Window: 2.3ms avg latency, O(N) complexity

## 🔗 Integration

The dashboard is configured to proxy API requests to your backend:

```
/api/* → http://localhost:8000/v1/*
```

Update `vite.config.ts` to change the backend URL:

```typescript
proxy: {
  '/api': {
    target: 'http://your-backend:port',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '/your-path'),
  },
}
```

## 🛠 Customization

### Colors
Edit `tailwind.config.js`:
```javascript
colors: {
  primary: {
    500: '#0ea5e9',  // Cyan
    600: '#0284c7',  // Dark cyan
    // ...
  }
}
```

### Data Sources
Replace mock data in page components with real API calls:

```typescript
// Example: Dashboard.tsx
useEffect(() => {
  fetch('/api/metrics')
    .then(res => res.json())
    .then(data => setStats(data))
}, [])
```

### Charts
Customize Recharts components in each page component. See [Recharts documentation](https://recharts.org/).

## 📦 Dependencies

- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Recharts** - Chart library
- **Lucide Icons** - Icons
- **Vite** - Build tool
- **Axios** - HTTP client (ready to use)

## 🎓 Learning Resources

### Rate Limiting Algorithms
- **Token Bucket**: Best for burst-friendly APIs
- **Fixed Window**: Simple baseline approach
- **Sliding Window**: Most accurate rate limiting

### Performance Tips
1. Real-time updates use 100ms intervals
2. Chart data limited to last 50 events
3. Responsive design optimized for mobile
4. Glass effect uses CSS backdrop-filter

## 🐛 Troubleshooting

### Backend Connection Issues
- Ensure backend is running on `http://localhost:8000`
- Check CORS headers from backend
- Verify API endpoint paths in `vite.config.ts`

### Chart Not Displaying
- Verify data structure matches chart expectations
- Check browser console for errors
- Ensure ResponsiveContainer has defined height

### Styling Issues
- Clear browser cache: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Rebuild Tailwind: `npm run build`

## 📝 License

MIT

## 🤝 Contributing

Feel free to extend this dashboard with additional features:
- More detailed metrics
- Custom time ranges
- Export functionality
- Real-time alerts
- Performance optimizations

## 📞 Support

For issues or questions about the DRL system, visit the [main repository](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-)
