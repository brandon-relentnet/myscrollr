FROM python:3.12-slim

WORKDIR /app

# Install system deps for asyncpg (libpq) and cryptography
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY *.py .

CMD ["python", "main.py"]
