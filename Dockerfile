FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "import duckdb; con = duckdb.connect(); con.execute('INSTALL httpfs; INSTALL spatial;'); con.close()"

COPY server.py ./
COPY src/ ./src/
COPY web/ ./web/

RUN mkdir -p /app/cache /app/output

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
