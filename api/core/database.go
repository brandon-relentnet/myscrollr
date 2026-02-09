package core

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DBPool is the global PostgreSQL connection pool.
var DBPool *pgxpool.Pool

// GetEncryptionKey reads and decodes the AES-256-GCM encryption key from env.
func GetEncryptionKey() []byte {
	key := os.Getenv("ENCRYPTION_KEY")
	if key == "" {
		log.Fatal("ENCRYPTION_KEY must be set for secure token storage")
	}
	decodedKey, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(decodedKey) != 32 {
		log.Fatal("ENCRYPTION_KEY must be a 32-byte base64 encoded string")
	}
	return decodedKey
}

// Encrypt encrypts a plaintext string using AES-256-GCM and returns a
// base64-encoded ciphertext.
func Encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(GetEncryptionKey())
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// ConnectDB initialises the PostgreSQL connection pool and creates core tables.
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

	// Create core tables (user_streams, user_preferences)
	_, err = DBPool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS user_streams (
			id              SERIAL PRIMARY KEY,
			logto_sub       TEXT NOT NULL,
			stream_type     TEXT NOT NULL,
			enabled         BOOLEAN NOT NULL DEFAULT true,
			visible         BOOLEAN NOT NULL DEFAULT true,
			config          JSONB NOT NULL DEFAULT '{}',
			created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE(logto_sub, stream_type)
		);
	`)
	if err != nil {
		log.Printf("Warning: Failed to create user_streams table: %v", err)
	}

	_, err = DBPool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS user_preferences (
			logto_sub      TEXT PRIMARY KEY,
			feed_mode      TEXT NOT NULL DEFAULT 'comfort',
			feed_position  TEXT NOT NULL DEFAULT 'bottom',
			feed_behavior  TEXT NOT NULL DEFAULT 'overlay',
			feed_enabled   BOOLEAN NOT NULL DEFAULT true,
			enabled_sites  JSONB NOT NULL DEFAULT '[]',
			disabled_sites JSONB NOT NULL DEFAULT '[]',
			updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
		);
	`)
	if err != nil {
		log.Printf("Warning: Failed to create user_preferences table: %v", err)
	}
}
