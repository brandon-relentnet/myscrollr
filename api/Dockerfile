FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install git for fetching dependencies
RUN apk add --no-cache git

# Copy the module files
COPY go.mod ./

# Copy the source code first so 'go mod tidy' can see the imports
COPY . .

# Fetch dependencies and generate go.sum inside the builder
RUN go mod tidy
RUN go mod download

# Build the Go app
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

######## Start a new stage from scratch #######
FROM alpine:latest  

WORKDIR /root/

# Install curl for health checks
RUN apk --no-cache add curl

# Copy the Pre-built binary from the previous stage
COPY --from=builder /app/main .

# Expose port 8080 to the outside world
EXPOSE 8080

# Command to run the executable
CMD ["./main"]