FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

ENV PYTHONUNBUFFERED=1
ENV FAIL_MODE=open
ENV ALGORITHM=token_bucket
ENV ENABLE_RL=true

EXPOSE 8000

# Railway (and most PaaS hosts) inject $PORT; default to 8000 for docker-compose
CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
