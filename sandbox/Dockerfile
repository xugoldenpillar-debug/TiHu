FROM node:22-bookworm-slim
ARG PI_VERSION=0.85.1
RUN npm install -g "@earendil-works/pi-coding-agent@${PI_VERSION}" \
 && npm cache clean --force \
 && mkdir -p /opt/tihu /workspace \
 && chmod 1777 /workspace
COPY entry.mjs /opt/tihu/entry.mjs
WORKDIR /workspace
ENV PI_OFFLINE=1 PI_TELEMETRY=0 NODE_ENV=production
ENTRYPOINT ["node","/opt/tihu/entry.mjs"]
