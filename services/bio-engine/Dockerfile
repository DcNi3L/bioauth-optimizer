# bio-engine: распознавание лиц без состояния (ADR-0012). Модели загружаются при сборке с проверкой
# SHA-256 (NFR-B2), во время работы сеть не нужна.

FROM python:3.12-slim AS models
WORKDIR /src
COPY models.lock.json ./
COPY scripts/fetch_models.py scripts/
COPY models/ models/
RUN python scripts/fetch_models.py --dest models

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /app bio
WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY models.lock.json ./
COPY --from=models /src/models/ models/
COPY app/ app/
USER bio
EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --retries=30 --start-period=15s \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=2).status == 200 else 1)"
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
