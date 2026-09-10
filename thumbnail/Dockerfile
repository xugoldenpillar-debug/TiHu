FROM mcr.microsoft.com/playwright/python:v1.51.0-noble

RUN python -m pip install --no-cache-dir --no-deps -i https://pypi.tuna.tsinghua.edu.cn/simple \
    playwright==1.51.0 greenlet==3.1.1 pyee==12.1.1 typing_extensions==4.12.2

ENV HOME=/tmp \
    TMPDIR=/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /renderer
COPY --chown=65532:65532 entry.py /renderer/entry.py
USER 65532:65532
ENTRYPOINT ["python", "-I", "/renderer/entry.py"]
