FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy module files and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o sports-api .

# --- Runtime stage ---
FROM alpine:latest

WORKDIR /root/

# Install curl for health checks
RUN apk --no-cache add curl

# Copy the binary from the builder
COPY --from=builder /app/sports-api .

EXPOSE 8082

CMD ["./sports-api"]
