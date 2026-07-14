FROM docker.m.daocloud.io/library/python:3.11-slim

WORKDIR /app

COPY ocr-sidecar/requirements.txt .
RUN pip install --no-cache-dir --disable-pip-version-check --default-timeout=120 \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    -r requirements.txt \
    && pip install --no-cache-dir --disable-pip-version-check --default-timeout=120 \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    opencv-contrib-python-headless==4.10.0.84

RUN sed -i 's|http://deb.debian.org/debian|https://mirrors.tuna.tsinghua.edu.cn/debian|g; s|http://deb.debian.org/debian-security|https://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY ocr-sidecar/app.py .

EXPOSE 4188

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4188"]
