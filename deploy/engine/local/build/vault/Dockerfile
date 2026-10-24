FROM hashicorp/vault:latest

# Switch to root to install packages (the base image runs as a non-root user)
USER root

# Install missing dependencies
RUN apk add jq

# Set the working directory
WORKDIR /vault

# Copy the configuration files and scripts
COPY ./deploy/engine/local/build/vault/config ./config

# Ensure scripts are executable
RUN chmod +x ./config/*.sh

# Switch back to the non-root vault user for runtime
USER vault

# Set the entry point to the custom entrypoint script
ENTRYPOINT ["./config/entrypoint.sh"]
