FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY src/ ./src/

# Run as an unprivileged user
RUN useradd --create-home --uid 10001 app && chown -R app /app
USER app

ENV FAIL_MODE=open \
    ALGORITHM=token_bucket \
    ENABLE_RL=true

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"PORT\", \"8000\")}/health', timeout=2)"

# Railway (and most PaaS hosts) inject $PORT; default to 8000 for docker-compose.
# --proxy-headers: trust X-Forwarded-* from the platform load balancer.
CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --no-server-header"]
