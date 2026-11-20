# Helmshell container image (published as ghcr.io/mrddream/helmshell by .github/workflows/docker.yml).
#
# The container starts as root only long enough to recreate your host user (same UID/GID/home, see
# deploy/container-start.sh), then drops privileges and drives the host's tmux server through its
# socket. See deploy/docker-compose.yml for the expected volumes, variables and hardening.

# Base image pinned by digest (ubuntu:26.04): no silent image change.
FROM ubuntu:26.04@sha256:d66b366dac61b575bee2aef07e9c26e8070096fbe84a3d4d3eb0da069b5d76db

LABEL org.opencontainers.image.title="Helmshell" \
      org.opencontainers.image.description="Self-hosted web console to drive your Linux server and AI coding agents (Claude Code, Codex) from the browser" \
      org.opencontainers.image.source="https://github.com/MrDDream/Helmshell" \
      org.opencontainers.image.url="https://github.com/MrDDream/Helmshell" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      python3 tmux git openssh-client ca-certificates locales-all \
 && rm -rf /var/lib/apt/lists/*

COPY . /opt/helmshell

ENV HELMSHELL_DOCKER=1 \
    HELMSHELL_DIR=/opt/helmshell \
    LANG=C.UTF-8

EXPOSE 8787

HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD python3 -c "import socket; socket.create_connection(('127.0.0.1', 8787), 5)"

ENTRYPOINT ["bash", "/opt/helmshell/deploy/container-start.sh"]
