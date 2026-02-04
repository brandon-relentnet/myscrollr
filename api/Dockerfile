FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install git and swag CLI
RUN apk add --no-cache git && \
    go install github.com/swaggo/swag/cmd/swag@latest

# Copy the module files
COPY go.mod ./

# Copy the source code
COPY . .

# Generate Swagger docs
RUN swag init

# Fetch dependencies
RUN go mod tidy
RUN go mod download

# Build the Go app
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

######## Start a new stage from scratch #######
FROM alpine:latest  

WORKDIR /root/

# Define Build Args
ARG DATABASE_URL
ARG REDIS_URL
ARG YAHOO_CLIENT_ID
ARG YAHOO_CLIENT_SECRET
ARG YAHOO_CALLBACK_URL
ARG DOMAIN_NAME

# Set Envs for Runtime
ENV DATABASE_URL=$DATABASE_URL
ENV REDIS_URL=$REDIS_URL
ENV YAHOO_CLIENT_ID=$YAHOO_CLIENT_ID
ENV YAHOO_CLIENT_SECRET=$YAHOO_CLIENT_SECRET
ENV YAHOO_CALLBACK_URL=$YAHOO_CALLBACK_URL
ENV DOMAIN_NAME=$DOMAIN_NAME

# Install curl for health checks
RUN apk --no-cache add curl

# Copy the Pre-built binary from the previous stage
COPY --from=builder /app/main .
COPY --from=builder /app/docs ./docs

# Expose port 8080 to the outside world
EXPOSE 8080

# Command to run the executable
CMD ["./main"]