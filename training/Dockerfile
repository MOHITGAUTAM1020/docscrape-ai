FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin make git python3 python3-pil python3-bidi wget unzip ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git init /opt/tesstrain && git -C /opt/tesstrain remote add origin https://github.com/tesseract-ocr/tesstrain.git && git -C /opt/tesstrain fetch --depth 1 origin 405346a3a67d8e4e049341d1da6a4b752e0b8351 && git -C /opt/tesstrain checkout --detach FETCH_HEAD && git init /opt/langdata && git -C /opt/langdata remote add origin https://github.com/tesseract-ocr/langdata_lstm.git && git -C /opt/langdata fetch --depth 1 origin 07930fd9f246622c26eb5de794d9212ceac432d3 && git -C /opt/langdata checkout --detach FETCH_HEAD
RUN tesseract --version && command -v lstmtraining && command -v combine_tessdata
COPY worker.mjs /opt/worker.mjs
WORKDIR /opt/tesstrain
ENV OMP_THREAD_LIMIT=2
CMD ["node", "/opt/worker.mjs"]
