FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV TEXT_SERVICE_HOST=0.0.0.0
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY run.py .
EXPOSE 8000
CMD ["python", "run.py"]
