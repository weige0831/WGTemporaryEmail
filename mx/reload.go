package main

import (
	"crypto/sha256"
	"encoding/hex"
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
	lastHash := hashFile(configPath)

	ticker := time.NewTicker(configReloadInterval)
	defer ticker.Stop()

	for range ticker.C {
		// Content hash rather than mtime+size: a rewrite that preserves both
		// (rsync -p, restoring a backup, editing within the same second at the
		// same length) would otherwise never be picked up.
		currentHash := hashFile(configPath)
		if currentHash == "" || currentHash == lastHash {
			continue
		}

		cfg, err := LoadConfig(configPath)
		if err != nil {
			log.Printf("Config reload failed (keeping previous config): %v", err)
			continue
		}

		lastHash = currentHash
		SetCurrentConfig(cfg)
		log.Printf("Config reloaded: domains=%v, max message size=%d MB",
			cfg.Domains, cfg.Server.MaxMsgSizeMB)

		if onReload != nil {
			onReload(cfg)
		}
	}
}

// hashFile returns a hex sha256 of the file contents, or "" when unreadable.
func hashFile(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
