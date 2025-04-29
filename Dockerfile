# Dockerfile for Lexicon Multi-Cloud Serverless Function

# Build stage for dependencies and testing
FROM node:20-slim AS builder

# Add version labels
ARG VERSION
LABEL name="lexicon-builder"
LABEL version=${VERSION:-1.0.0}

# Create app directory with proper ownership
WORKDIR /usr/src/app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies for development/testing
RUN npm install

# Copy source files
COPY . .

# Set cloud environment detection variables if provided
# These variables will only be set in the container if explicitly provided
# during docker build or docker run, which avoids conflicts in cloud environments
# Google Cloud Run detection 
ARG K_SERVICE
ENV K_SERVICE=${K_SERVICE:-}

# AWS detection 
ARG AWS_EXECUTION_ENV
ENV AWS_EXECUTION_ENV=${AWS_EXECUTION_ENV:-}

# Azure detection
ARG FUNCTIONS_WORKER_RUNTIME
ENV FUNCTIONS_WORKER_RUNTIME=${FUNCTIONS_WORKER_RUNTIME:-}
ARG WEBSITE_SITE_NAME
ENV WEBSITE_SITE_NAME=${WEBSITE_SITE_NAME:-}

# Run tests when not in production mode and SKIP_TESTS is not true
ARG NODE_ENV=production
ARG SKIP_TESTS=false
RUN if [ "$NODE_ENV" != "production" ] && [ "$SKIP_TESTS" != "true" ]; then \
      echo "Running tests"; \
      if [ -d "tests" ] && [ -f "tests/jest.setup.js" ]; then \
        npm test; \
      else \
        echo "Skipping tests: setup files not found"; \
      fi; \
    fi

# Production stage with minimal footprint
FROM node:20-slim AS production

# Add version labels
ARG VERSION
LABEL name="lexicon"
LABEL version=${VERSION:-1.0.0}

# Pass cloud provider detection environment variables to production stage
ARG K_SERVICE
ENV K_SERVICE=$K_SERVICE
ARG AWS_EXECUTION_ENV
ENV AWS_EXECUTION_ENV=$AWS_EXECUTION_ENV
ARG FUNCTIONS_WORKER_RUNTIME
ENV FUNCTIONS_WORKER_RUNTIME=$FUNCTIONS_WORKER_RUNTIME
ARG WEBSITE_SITE_NAME
ENV WEBSITE_SITE_NAME=$WEBSITE_SITE_NAME

# Create a non-root user for running the application
RUN groupadd -r lexicon && \
    useradd -r -g lexicon -m -d /home/lexicon lexicon

# Set working directory 
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
# Copy package-lock.json if it exists after the builder stage has created it
COPY --from=builder /usr/src/app/package-lock.json ./package-lock.json

# Install only production dependencies
RUN npm install --only=production && \
    npm cache clean --force

# Copy all JavaScript files from the builder stage
# This ensures all application code is included without listing each file
COPY --from=builder /usr/src/app/*.js ./

# Set ownership to non-root user
RUN chown -R lexicon:lexicon /usr/src/app

# Use non-root user
USER lexicon

# Set default port (can be overridden at runtime)
ARG PORT=8080
ENV PORT=$PORT

# Expose the port the app runs on
EXPOSE $PORT

# Start the application
CMD [ "node", "index.js" ]
