package main

import (
	"time"
)

// easternLocation is the canonical US Eastern time location used by Yahoo
// Fantasy and most US sports leagues to define "today" for daily-coverage
// stats. Cached once to avoid repeated LoadLocation calls.
var easternLocation = loadEastern()

func loadEastern() *time.Location {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		return time.FixedZone("ET", -5*3600)
	}
	return loc
}

// todayInEastern returns today's date string in the format Yahoo expects
// for `type=date;date=YYYY-MM-DD` URLs. Uses America/New_York because MLB,
// NFL, NBA, and NHL all define their fantasy "day" relative to that zone.
func todayInEastern() string {
	return time.Now().In(easternLocation).Format("2006-01-02")
}
