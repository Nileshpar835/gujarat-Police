# # # FROM python:3.11-slim

# # # WORKDIR /app

# # # # libgl1/libglib for opencv; tesseract-ocr for pytesseract
# # # RUN apt-get update && apt-get install -y --no-install-recommends \
# # #     libgl1 libglib2.0-0 tesseract-ocr \
# # #     && rm -rf /var/lib/apt/lists/*

# # # COPY requirements.txt .
# # # RUN pip install --no-cache-dir -r requirements.txt

# # # COPY . .

# # # CMD ["python", "main.py"]
# # FROM python:3.11-slim

# # WORKDIR /app

# # RUN apt-get update && apt-get install -y --no-install-recommends \
# #     libgl1 \
# #     libglib2.0-0 \
# #     tesseract-ocr \
# #     && rm -rf /var/lib/apt/lists/*

# # COPY requirements.txt .
# # RUN pip install --no-cache-dir -r requirements.txt

# # COPY . .

# # CMD ["python", "main.py"]
# FROM python:3.11-slim

# WORKDIR /app

# RUN apt-get update && apt-get install -y --no-install-recommends \
#     libgl1 \
#     libglib2.0-0 \
#     tesseract-ocr \
#     && rm -rf /var/lib/apt/lists/*

# COPY requirements.txt .

# RUN pip install --no-cache-dir --timeout=300 --retries=10 -r requirements.txt

# COPY . .

# CMD ["python", "main.py"]
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir --timeout=600 --retries=10 -r requirements.txt

COPY . .

CMD ["python", "main.py"]