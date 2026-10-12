# The processor as a container (plan J5.2 step 5): ghcr.io/tryscope/scope-journeys-envoy, built by the
# release workflow from the published packages at the same version, run as a sidecar or a
# deployment beside Envoy with the install's variables in its environment.
FROM node:24-alpine
ARG VERSION
WORKDIR /app
RUN npm install --no-audit --no-fund --omit=dev scope-journeys@${VERSION} scope-journeys-envoy@${VERSION}
ENV JOURNEYS_EXT_PROC_LISTEN=0.0.0.0:9000
EXPOSE 9000
USER node
ENTRYPOINT ["npx", "--no-install", "journeys-ext-proc"]
