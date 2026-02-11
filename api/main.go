package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"

	"github.com/brandon-relentnet/myscrollr/api/core"
)

// @title Scrollr API
// @version 2.0
// @description Gateway API for Scrollr — routes requests to self-registered integration services.
// @host api.myscrollr.relentnet.dev
// @BasePath /
// @securityDefinitions.apikey LogtoAuth
// @in header
// @name Authorization
// @description Type 'Bearer ' followed by your Logto JWT.
func main() {
	_ = godotenv.Load()

	// Root context — cancelled on shutdown signal
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Infrastructure
	core.ConnectDB()
	defer core.DBPool.Close()

	core.ConnectRedis()
	defer core.Rdb.Close()

	core.InitHub(ctx)
	core.InitAuth()

	// Start Redis-based integration discovery (ctx-aware)
	core.StartDiscovery(ctx)

	// Build and start the gateway server
	srv := core.NewServer()
	srv.Setup()

	// Start Fiber in a goroutine so we can listen for shutdown signals
	go func() {
		if err := srv.Listen(); err != nil {
			log.Printf("Server error: %v", err)
		}
	}()

	// Wait for termination signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	sig := <-quit
	log.Printf("Received signal %v, shutting down...", sig)

	// Cancel discovery goroutine
	cancel()

	// Gracefully shut down Fiber
	if err := srv.App.Shutdown(); err != nil {
		log.Printf("Error during server shutdown: %v", err)
	}

	log.Println("Scrollr API shut down gracefully")
}
