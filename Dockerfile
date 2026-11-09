# One container: builds the React app, then serves it and the API from FastAPI on $PORT.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    CIVICPULSE_ENV=production \
    CIVICPULSE_FRONTEND_DIST=/app/frontend/dist \
    CIVICPULSE_TRUST_PROXY=1 \
    CIVICPULSE_EXTRACTOR=rules \
    CIVICPULSE_VERIFIER=auto
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY backend/models backend/models
COPY data data
COPY scripts scripts
COPY --from=web /web/dist frontend/dist
RUN useradd --create-home civic && mkdir -p /data && chown -R civic /app /data
USER civic
EXPOSE 8000
CMD ["sh", "-c", "python scripts/bootstrap.py && cd backend && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
