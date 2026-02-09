package main

import (
	"log"

	"github.com/joho/godotenv"

	"github.com/brandon-relentnet/myscrollr/api/core"
	"github.com/brandon-relentnet/myscrollr/api/integrations/finance"
	"github.com/brandon-relentnet/myscrollr/api/integrations/fantasy"
	"github.com/brandon-relentnet/myscrollr/api/integrations/rss"
	"github.com/brandon-relentnet/myscrollr/api/integrations/sports"
)

// @title Scrollr API
// @version 1.0
// @description High-performance data API for Scrollr finance, sports, RSS, and fantasy.
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

	// Build the server and register integrations
	srv := core.NewServer()

	srv.RegisterIntegration(finance.New(core.DBPool, core.SendToUser, core.RouteToStreamSubscribers))
	srv.RegisterIntegration(sports.New(core.DBPool, core.SendToUser, core.RouteToStreamSubscribers))
	srv.RegisterIntegration(rss.New(core.DBPool, core.Rdb, core.SendToUser))

	fantasyIntg := fantasy.New(core.DBPool, core.Rdb, core.SendToUser)
	fantasyIntg.Init()
	srv.RegisterIntegration(fantasyIntg)

	srv.Setup()

	if err := srv.Listen(); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}
