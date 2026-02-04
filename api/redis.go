package main

import (
	"context"
	"log"
	"os"

	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client

func ConnectRedis() {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatal("REDIS_URL must be set")
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Unable to parse REDIS_URL: %v", err)
	}

	rdb = redis.NewClient(opts)

	// Check connection
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Unable to connect to Redis: %v", err)
	}

	log.Println("Successfully connected to Redis")
}
