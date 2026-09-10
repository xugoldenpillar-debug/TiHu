FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt pyproject.toml ./
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
COPY tihu ./tihu
COPY web ./web
RUN useradd -r -u 10001 tihu && mkdir -p /app/.local && chown -R tihu:tihu /app
USER tihu
CMD ["uvicorn","tihu.api:app","--host","0.0.0.0","--port","8000","--no-access-log"]
