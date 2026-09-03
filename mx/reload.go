package main

import (
	"log"
	"os"
	"time"
)

// configReloadInterval is how often the MX server checks config.yaml for
// changes made by the admin panel.
const configReloadInterval = 15 * time.Second

// watchConfig polls config.yaml and hot-reloads it when it changes. A failed
// reload keeps the previous config and retries on the next tick. The optional
// onReload callback runs after every successful reload (used to re-evaluate
// TLS support).
func watchConfig(configPath string, onReload func(*Config)) {
	var lastMod time.Time
	var lastSize int64
	if fi, err := os.Stat(configPath); err == nil {
		lastMod = fi.ModTime()
		lastSize = fi.Size()
	}

	ticker := time.NewTicker(configReloadInterval)
	defer ticker.Stop()

	for range ticker.C {
		fi, err := os.Stat(configPath)
		if err != nil {
			continue
		}
		if fi.ModTime().Equal(lastMod) && fi.Size() == lastSize {
			continue
		}

		cfg, err := LoadConfig(configPath)
		if err != nil {
			log.Printf("Config reload failed (keeping previous config): %v", err)
			continue
		}

		lastMod = fi.ModTime()
		lastSize = fi.Size()
		SetCurrentConfig(cfg)
		log.Printf("Config reloaded: domains=%v, max message size=%d MB",
			cfg.Domains, cfg.Server.MaxMsgSizeMB)

		if onReload != nil {
			onReload(cfg)
		}
	}
}
