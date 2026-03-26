package core

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DBPool is the global PostgreSQL connection pool.
var DBPool *pgxpool.Pool

// ConnectDB initialises the PostgreSQL connection pool and runs migrations.
func ConnectDB() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL must be set")
	}

	databaseURL = strings.TrimSpace(databaseURL)
	databaseURL = strings.Trim(databaseURL, "\"")
	databaseURL = strings.Trim(databaseURL, "'")

	if strings.HasPrefix(databaseURL, "postgres:") && !strings.HasPrefix(databaseURL, "postgres://") {
		databaseURL = strings.Replace(databaseURL, "postgres:", "postgres://", 1)
	} else if strings.HasPrefix(databaseURL, "postgresql:") && !strings.HasPrefix(databaseURL, "postgresql://") {
		databaseURL = strings.Replace(databaseURL, "postgresql:", "postgresql://", 1)
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		log.Fatalf("Unable to parse DATABASE_URL (redacted)")
	}

	config.MaxConns = DBMaxConns
	config.MinConns = DBMinConns
	config.MaxConnIdleTime = DBMaxConnIdleTime

	var pool *pgxpool.Pool
	retries := DBMaxRetries
	for i := 0; i < retries; i++ {
		pool, err = pgxpool.NewWithConfig(context.Background(), config)
		if err == nil {
			err = pool.Ping(context.Background())
			if err == nil {
				break
			}
		}

		fmt.Printf("Failed to connect to DB, retrying in 2 seconds... (%d attempts left)\n", retries-i-1)
		time.Sleep(DBRetryDelay)
	}

	if err != nil {
		log.Fatalf("Unable to connect to database after retries")
	}

	DBPool = pool
	log.Println("Successfully connected to PostgreSQL database")

	// golang-migrate uses pq driver which requires sslmode to be explicit
	migrateURL := databaseURL
	if !strings.Contains(migrateURL, "sslmode=") {
		if strings.Contains(migrateURL, "?") {
			migrateURL += "&sslmode=disable"
		} else {
			migrateURL += "?sslmode=disable"
		}
	}

	m, err := migrate.New(
		"file://migrations",
		migrateURL,
	)
	if err != nil {
		log.Fatalf("Failed to create migrator: %v", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		m.Close()
		log.Fatalf("Migration failed: %v", err)
	}
	m.Close()
	log.Println("Database migrations applied")

	pruneWebhookEvents()
}

func pruneWebhookEvents() {
	_, err := DBPool.Exec(context.Background(), `
		DELETE FROM stripe_webhook_events WHERE created_at < now() - interval '7 days';
	`)
	if err != nil {
		log.Printf("Warning: Failed to prune old webhook events: %v", err)
	}
}
