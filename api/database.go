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
	databaseURL = strings.Trim(databaseURL, "\"")
	databaseURL = strings.Trim(databaseURL, "'")

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

		fmt.Printf("Failed to connect to DB, retrying in 2 seconds... (%d attempts left) Error: %v\n", retries-i-1, err)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatalf("Unable to connect to database after retries: %v", err)
	}

	dbPool = pool
	log.Println("Successfully connected to PostgreSQL database")

	// Ensure tables exist
	_, err = dbPool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS users (
			id VARCHAR(100) PRIMARY KEY,
			email VARCHAR(255),
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS yahoo_users (
			guid VARCHAR(100) PRIMARY KEY,
			user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
			refresh_token TEXT NOT NULL,
			last_sync TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		log.Printf("Warning: Failed to create tables: %v", err)
	}
}

func UpsertUser(id, email string) error {
	_, err := dbPool.Exec(context.Background(), `
		INSERT INTO users (id, email)
		VALUES ($1, $2)
		ON CONFLICT (id) DO UPDATE
		SET email = EXCLUDED.email;
	`, id, email)
	return err
}

func LinkYahooUser(guid, userId, refreshToken string) error {
	_, err := dbPool.Exec(context.Background(), `
		INSERT INTO yahoo_users (guid, user_id, refresh_token)
		VALUES ($1, $2, $3)
		ON CONFLICT (guid) DO UPDATE
		SET user_id = EXCLUDED.user_id, refresh_token = EXCLUDED.refresh_token;
	`, guid, userId, refreshToken)
	return err
}

func UpsertYahooUser(guid, refreshToken string) error {
	_, err := dbPool.Exec(context.Background(), `
		INSERT INTO yahoo_users (guid, refresh_token)
		VALUES ($1, $2)
		ON CONFLICT (guid) DO UPDATE
		SET refresh_token = EXCLUDED.refresh_token;
	`, guid, refreshToken)
	return err
}