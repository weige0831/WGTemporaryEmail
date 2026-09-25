package main

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"os"
	"sync"
	"time"
)

// configReloadInterval is how often the MX server checks config.yaml for
// changes made by the admin panel. Kept short because a domain added or removed
// in the panel changes which mail this server accepts.
const configReloadInterval = 5 * time.Second

var (
	configFilePath string
	configHashMu   sync.Mutex
	configHash     string
)

// SetConfigPath records where config.yaml lives, so any code path can ask for
// an immediate re-read (see reloadIfChanged).
func SetConfigPath(path string) {
	configFilePath = path
}

// reloadIfChanged re-reads config.yaml when its content differs from the last
// loaded version and returns the new config, or nil when nothing changed (or
// the new content does not parse - the previous config is kept).
//
// The watcher calls this on a timer; the SMTP path calls it when a recipient
// domain is unknown, so a domain added seconds ago is honoured immediately
// instead of bouncing the sender with a permanent 550.
func reloadIfChanged(path string) *Config {
	configHashMu.Lock()
	defer configHashMu.Unlock()

	current := hashFile(path)
	if current == "" || current == configHash {
		return nil
	}

	cfg, err := LoadConfig(path)
	if err != nil {
		log.Printf("Config reload failed (keeping previous config): %v", err)
		return nil
	}

	configHash = current
	SetCurrentConfig(cfg)
	log.Printf("Config reloaded: domains=%v, max message size=%d MB",
		cfg.Domains, cfg.Server.MaxMsgSizeMB)
	return cfg
}

// watchConfig polls config.yaml and hot-reloads it when it changes. A failed
// reload keeps the previous config and retries on the next tick. The optional
// onReload callback runs after every successful reload (used to re-evaluate
// TLS support).
func watchConfig(path string, initiallyLoadedHash string, onReload func(*Config)) {
	SetConfigPath(path)
	configHash = initiallyLoadedHash

	ticker := time.NewTicker(configReloadInterval)
	defer ticker.Stop()

	for range ticker.C {
		// Content hash rather than mtime+size: a rewrite that preserves both
		// (rsync -p, restoring a backup, editing within the same second at the
		// same length) would otherwise never be picked up.
		if cfg := reloadIfChanged(path); cfg != nil && onReload != nil {
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
