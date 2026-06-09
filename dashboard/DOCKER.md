# Docker Deployment Guide

## Building the Docker Image

```bash
# From the dashboard directory
docker build -t drl-dashboard:latest .
```

## Running the Container

### Basic Run
```bash
docker run -p 3000:3000 drl-dashboard:latest
```

### With Backend Proxy
If your DRL backend is running on `localhost:8000`:

```bash
docker run -p 3000:3000 \
  -e BACKEND_URL=http://localhost:8000 \
  drl-dashboard:latest
```

### Docker Compose Integration

Add to your main `docker-compose.yml`:

```yaml
dashboard:
  build:
    context: ./dashboard
    dockerfile: Dockerfile
  ports:
    - "3000:3000"
  environment:
    - BACKEND_URL=http://api:8000
  depends_on:
    - api
  networks:
    - drl-network
```

## Environment Variables

No environment variables currently needed, but you can modify `vite.config.ts` to use them:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/v1'),
      },
    },
  },
})
```

## Deployment

### Vercel
```bash
vercel deploy
```

### Netlify
```bash
netlify deploy --prod --dir=dist
```

### AWS S3 + CloudFront
```bash
npm run build
aws s3 sync dist/ s3://your-bucket-name
```

### Docker Hub
```bash
docker tag drl-dashboard:latest your-username/drl-dashboard:latest
docker push your-username/drl-dashboard:latest
```

## Health Check

```bash
curl http://localhost:3000
```

Should return the HTML dashboard.

## Logs

```bash
docker logs <container-id>
```

## Size Optimization

The Docker image is optimized using:
- Multi-stage build (builder + production)
- Alpine Linux base image (small)
- Minimal dependencies in production

Current image size: ~100MB

## Performance Tips

1. Use a CDN in front of the dashboard
2. Enable gzip compression on the server
3. Cache static assets with long TTLs
4. Use HTTP/2 for better performance
5. Consider service workers for offline support
