package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var dbPool *pgxpool.Pool

func ConnectDB() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL must be set")
	}

	// Clean up URL: trim whitespace and remove accidental quotes
	databaseURL = strings.TrimSpace(databaseURL)
	databaseURL = strings.Trim(databaseURL, ""'")

	// Fix missing // after protocol (consistent with Rust logic)
	if strings.HasPrefix(databaseURL, "postgres:") && !strings.HasPrefix(databaseURL, "postgres://") {
		databaseURL = strings.Replace(databaseURL, "postgres:", "postgres://", 1)
	} else if strings.HasPrefix(databaseURL, "postgresql:") && !strings.HasPrefix(databaseURL, "postgresql://") {
		databaseURL = strings.Replace(databaseURL, "postgresql:", "postgresql://", 1)
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		log.Fatalf("Unable to parse DATABASE_URL: %v", err)
	}

	// Pool configuration for low latency/high performance
	config.MaxConns = 20
	config.MinConns = 2
	config.MaxConnIdleTime = 30 * time.Minute

	// Retry loop for DB connection
	var pool *pgxpool.Pool
	retries := 5
	for i := 0; i < retries; i++ {
		pool, err = pgxpool.NewWithConfig(context.Background(), config)
		if err == nil {
			err = pool.Ping(context.Background())
			if err == nil {
				break
			}
		}

		fmt.Printf("Failed to connect to DB, retrying in 2 seconds... (%d attempts left) Error: %v
", retries-i-1, err)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatalf("Unable to connect to database after retries: %v", err)
	}

	dbPool = pool
	log.Println("Successfully connected to PostgreSQL database")
}
