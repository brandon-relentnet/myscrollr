package main

import (
	"log"

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

	// Infrastructure
	core.ConnectDB()
	defer core.DBPool.Close()

	core.ConnectRedis()
	defer core.Rdb.Close()

	core.InitHub()
	core.InitAuth()

	// Start Redis-based integration discovery
	core.StartDiscovery()

	// Build and start the gateway server
	srv := core.NewServer()
	srv.Setup()

	if err := srv.Listen(); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}
