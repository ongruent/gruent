FROM golang:1.26.5-bookworm

# iproute2 is used to route to the local runtime cluster
# (see services/runtime/deploy/local/route-to-runtime.sh)
RUN apt-get update \
    && apt-get install -y --no-install-recommends iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install Air for hot reloading
RUN go install github.com/air-verse/air@latest

# Set working directory
WORKDIR /gruent

COPY . .

# Start with Air
CMD ["air", "-c", "/gruent/services/http-api/.air.toml"]
