package main

import (
	"fmt"
	"os"
	"strings"
	"sync/atomic"

	"gopkg.in/yaml.v3"
)

// currentConfig holds the most recently loaded config. New SMTP sessions
// read it so config.yaml changes (e.g. domains added via the admin panel)
// take effect without a restart.
var currentConfig atomic.Value // stores *Config

// SetCurrentConfig stores a freshly loaded config for hot reload.
func SetCurrentConfig(cfg *Config) {
	currentConfig.Store(cfg)
}

// GetCurrentConfig returns the latest loaded config, or nil if none is set.
func GetCurrentConfig() *Config {
	v := currentConfig.Load()
	if v == nil {
		return nil
	}
	cfg, ok := v.(*Config)
	if !ok || cfg == nil {
		return nil
	}
	return cfg
}

// ServerConfig groups the [server] section. A named type (rather than an
// anonymous struct) keeps the struct literals in tests stable when a field is
// added.
type ServerConfig struct {
	APIPort      int    `yaml:"api_port"`
	MXPort       int    `yaml:"mx_port"`
	MaxMsgSizeMB int    `yaml:"max_message_size_mb"`
	Hostname     string `yaml:"hostname"`
	// Concurrency and abuse limits. 0 values fall back to the defaults below,
	// except the two pointer fields where a present 0 means "no limit".
	MaxConnections int `yaml:"max_connections"`
	// Per source IP, per hour. Absent -> 300. Present and 0 (or negative) ->
	// unlimited, which is what an operator running a high-volume sink wants.
	MaxMessagesPerHourIP *int `yaml:"max_messages_per_hour_per_ip"`
	// Per message. Absent -> 100. Present and 0 -> unlimited.
	MaxMIMEParts *int `yaml:"max_mime_parts"`
}

// Config holds the MX server configuration loaded from YAML
type Config struct {
	Domains []string `yaml:"domains"`

	Database struct {
		URL      string `yaml:"url"`
		PoolSize int    `yaml:"pool_size"`
	} `yaml:"database"`

	Server ServerConfig `yaml:"server"`

	TLS struct {
		Enabled  bool   `yaml:"enabled"`
		CertFile string `yaml:"cert_file"`
		KeyFile  string `yaml:"key_file"`
	} `yaml:"tls"`

	Tempmail struct {
		AddressLifetimeHours int    `yaml:"address_lifetime_hours"`
		MaxEmailsPerAddress  int    `yaml:"max_emails_per_address"`
		CleanupIntervalHours int    `yaml:"cleanup_interval_hours"`
		AddressFormat        string `yaml:"address_format"`
	} `yaml:"tempmail"`

	Validation struct {
		CheckDKIM    bool `yaml:"check_dkim"`
		CheckSPF     bool `yaml:"check_spf"`
		CheckDMARC   bool `yaml:"check_dmarc"`
		StoreResults bool `yaml:"store_results"`
	} `yaml:"validation"`

	Logging struct {
		Level  string `yaml:"level"`
		Format string `yaml:"format"`
	} `yaml:"logging"`
}

// LoadConfig loads configuration from YAML file
func LoadConfig(configPath string) (*Config, error) {
	// Read YAML file
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Parse YAML
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Validate required fields
	if cfg.Database.URL == "" {
		return nil, fmt.Errorf("database.url is required")
	}

	if len(cfg.Domains) == 0 {
		return nil, fmt.Errorf("at least one domain is required")
	}

	// Set defaults
	if cfg.Server.MXPort == 0 {
		cfg.Server.MXPort = 25
	}
	if cfg.Server.Hostname == "" {
		cfg.Server.Hostname = "mail.tempmail.local"
	}
	if cfg.Server.MaxMsgSizeMB == 0 {
		cfg.Server.MaxMsgSizeMB = 10
	}
	if cfg.Database.PoolSize == 0 {
		cfg.Database.PoolSize = 10
	}
	if cfg.Tempmail.MaxEmailsPerAddress == 0 {
		cfg.Tempmail.MaxEmailsPerAddress = 100
	}

	// Set TLS defaults
	if cfg.TLS.CertFile == "" {
		cfg.TLS.CertFile = "/config/certs/cert.pem"
	}
	if cfg.TLS.KeyFile == "" {
		cfg.TLS.KeyFile = "/config/certs/key.pem"
	}

	return &cfg, nil
}

// GetMaxMessageSize returns max message size in bytes
func (c *Config) GetMaxMessageSize() int64 {
	return int64(c.Server.MaxMsgSizeMB) * 1024 * 1024
}

// GetDomainMap returns domains as a map for fast lookup.
//
// Entries are trimmed and lowercased so a hand-edited config ("Example.com ",
// "Example.COM") still matches incoming RCPT domains, which are lowercased
// before the lookup; before this, such an entry was silently unmatchable while
// the startup log advertised the domain as accepted.
func (c *Config) GetDomainMap() map[string]bool {
	domains := make(map[string]bool)
	for _, domain := range c.Domains {
		normalized := strings.ToLower(strings.TrimSpace(domain))
		if normalized != "" {
			domains[normalized] = true
		}
	}
	return domains
}

// GetMaxConnections caps concurrent SMTP connections (0 -> default 200).
// Without a cap a single host can hold thousands of idle sessions open.
func (c *Config) GetMaxConnections() int {
	if c.Server.MaxConnections > 0 {
		return c.Server.MaxConnections
	}
	return 200
}

// GetMaxMessagesPerHourIP caps accepted messages per source IP per hour.
//
// The key is absent -> 300 (a defensive default). The key is present and 0 or
// negative -> no limit, so an operator can switch the flood guard off without
// patching the binary (a mail sink fed by a large sender pool needs this).
func (c *Config) GetMaxMessagesPerHourIP() int {
	if c.Server.MaxMessagesPerHourIP == nil {
		return 300
	}
	return *c.Server.MaxMessagesPerHourIP
}

// GetMaxMIMEParts caps the number of MIME parts parsed from one message.
// Absent -> 100; present and 0 -> unlimited.
func (c *Config) GetMaxMIMEParts() int {
	if c.Server.MaxMIMEParts == nil {
		return 100
	}
	return *c.Server.MaxMIMEParts
}
