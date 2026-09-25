package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	// Create temporary config file
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "test_config.yaml")

	validConfig := `
domains:
  - tempmail.example.com
  - temp.test

database:
  url: postgresql://user:pass@localhost:5432/tempmail
  pool_size: 10

server:
  api_port: 8000
  mx_port: 2525
  max_message_size_mb: 15
  hostname: mail.tempmail.test

tls:
  enabled: true
  cert_file: /path/to/cert.pem
  key_file: /path/to/key.pem

validation:
  check_dkim: true
  check_spf: true
  check_dmarc: true
  store_results: true

logging:
  level: info
  format: json
`

	err := os.WriteFile(configPath, []byte(validConfig), 0644)
	if err != nil {
		t.Fatalf("Failed to write test config: %v", err)
	}

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	// Verify loaded values
	if len(cfg.Domains) != 2 {
		t.Errorf("LoadConfig() domains count = %v, want 2", len(cfg.Domains))
	}

	if cfg.Domains[0] != "tempmail.example.com" {
		t.Errorf("LoadConfig() domains[0] = %v, want tempmail.example.com", cfg.Domains[0])
	}

	if cfg.Database.URL != "postgresql://user:pass@localhost:5432/tempmail" {
		t.Errorf("LoadConfig() database URL incorrect")
	}

	if cfg.Server.MXPort != 2525 {
		t.Errorf("LoadConfig() MXPort = %v, want 2525", cfg.Server.MXPort)
	}

	if cfg.Server.MaxMsgSizeMB != 15 {
		t.Errorf("LoadConfig() MaxMsgSizeMB = %v, want 15", cfg.Server.MaxMsgSizeMB)
	}

	if !cfg.Validation.CheckDKIM {
		t.Error("LoadConfig() CheckDKIM should be true")
	}

	if !cfg.TLS.Enabled {
		t.Error("LoadConfig() TLS.Enabled should be true")
	}
}

func TestLoadConfigDefaults(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "minimal_config.yaml")

	minimalConfig := `
domains:
  - tempmail.test

database:
  url: postgresql://localhost/tempmail
`

	err := os.WriteFile(configPath, []byte(minimalConfig), 0644)
	if err != nil {
		t.Fatalf("Failed to write test config: %v", err)
	}

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	// Verify defaults
	if cfg.Server.MXPort != 25 {
		t.Errorf("LoadConfig() default MXPort = %v, want 25", cfg.Server.MXPort)
	}

	if cfg.Server.MaxMsgSizeMB != 10 {
		t.Errorf("LoadConfig() default MaxMsgSizeMB = %v, want 10", cfg.Server.MaxMsgSizeMB)
	}

	if cfg.Database.PoolSize != 10 {
		t.Errorf("LoadConfig() default PoolSize = %v, want 10", cfg.Database.PoolSize)
	}

	if cfg.Server.Hostname != "mail.tempmail.local" {
		t.Errorf("LoadConfig() default Hostname = %v, want mail.tempmail.local", cfg.Server.Hostname)
	}

	if cfg.Tempmail.MaxEmailsPerAddress != 100 {
		t.Errorf("LoadConfig() default MaxEmailsPerAddress = %v, want 100", cfg.Tempmail.MaxEmailsPerAddress)
	}
}

func TestLoadConfigMissingFile(t *testing.T) {
	_, err := LoadConfig("/nonexistent/config.yaml")

	if err == nil {
		t.Error("LoadConfig() should return error for missing file")
	}
}

func TestLoadConfigInvalidYAML(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "invalid.yaml")

	invalidYAML := `
domains: [
  invalid yaml
`

	err := os.WriteFile(configPath, []byte(invalidYAML), 0644)
	if err != nil {
		t.Fatalf("Failed to write test config: %v", err)
	}

	_, err = LoadConfig(configPath)

	if err == nil {
		t.Error("LoadConfig() should return error for invalid YAML")
	}
}

func TestLoadConfigMissingRequired(t *testing.T) {
	tests := []struct {
		name   string
		config string
		errMsg string
	}{
		{
			name: "missing database URL",
			config: `
domains:
  - tempmail.test
database:
  pool_size: 10
`,
			errMsg: "database.url is required",
		},
		{
			name: "missing domains",
			config: `
database:
  url: postgresql://localhost/tempmail
`,
			errMsg: "at least one domain is required",
		},
		{
			name: "empty domains list",
			config: `
domains: []
database:
  url: postgresql://localhost/tempmail
`,
			errMsg: "at least one domain is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			configPath := filepath.Join(tmpDir, "test.yaml")

			err := os.WriteFile(configPath, []byte(tt.config), 0644)
			if err != nil {
				t.Fatalf("Failed to write test config: %v", err)
			}

			_, err = LoadConfig(configPath)

			if err == nil {
				t.Errorf("LoadConfig() should return error: %s", tt.errMsg)
			}
		})
	}
}

func TestConfigGetMaxMessageSize(t *testing.T) {
	tests := []struct {
		name      string
		sizeMB    int
		wantBytes int64
	}{
		{
			name:      "10 MB",
			sizeMB:    10,
			wantBytes: 10 * 1024 * 1024,
		},
		{
			name:      "1 MB",
			sizeMB:    1,
			wantBytes: 1024 * 1024,
		},
		{
			name:      "25 MB",
			sizeMB:    25,
			wantBytes: 25 * 1024 * 1024,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &Config{
				Server: ServerConfig{
					MaxMsgSizeMB: tt.sizeMB,
				},
			}

			if got := cfg.GetMaxMessageSize(); got != tt.wantBytes {
				t.Errorf("GetMaxMessageSize() = %v, want %v", got, tt.wantBytes)
			}
		})
	}
}

func TestConfigGetDomainMap(t *testing.T) {
	cfg := &Config{
		Domains: []string{"tempmail.example.com", "temp.test", "mail.local"},
	}

	domainMap := cfg.GetDomainMap()

	if len(domainMap) != 3 {
		t.Errorf("GetDomainMap() returned %v domains, want 3", len(domainMap))
	}

	expectedDomains := []string{"tempmail.example.com", "temp.test", "mail.local"}
	for _, domain := range expectedDomains {
		if !domainMap[domain] {
			t.Errorf("GetDomainMap() missing domain %v", domain)
		}
	}

	// Check that non-configured domain is not present
	if domainMap["notconfigured.com"] {
		t.Error("GetDomainMap() should not contain unconfigured domains")
	}
}

func TestConfigTLSDefaults(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "test.yaml")

	config := `
domains:
  - tempmail.test
database:
  url: postgresql://localhost/tempmail
tls:
  enabled: false
`

	err := os.WriteFile(configPath, []byte(config), 0644)
	if err != nil {
		t.Fatalf("Failed to write test config: %v", err)
	}

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	// Check TLS defaults
	if cfg.TLS.CertFile != "/config/certs/cert.pem" {
		t.Errorf("LoadConfig() default CertFile = %v, want /config/certs/cert.pem", cfg.TLS.CertFile)
	}

	if cfg.TLS.KeyFile != "/config/certs/key.pem" {
		t.Errorf("LoadConfig() default KeyFile = %v, want /config/certs/key.pem", cfg.TLS.KeyFile)
	}
}

func TestPerIPMessageLimitSemantics(t *testing.T) {
	// absent -> defensive default
	cfg := &Config{}
	if got := cfg.GetMaxMessagesPerHourIP(); got != 300 {
		t.Errorf("absent limit = %d, want 300", got)
	}
	// explicit 0 -> unlimited (0 is returned and allowMessageFrom treats <=0 as no limit)
	zero := 0
	cfg.Server.MaxMessagesPerHourIP = &zero
	if got := cfg.GetMaxMessagesPerHourIP(); got != 0 {
		t.Errorf("explicit 0 = %d, want 0 (unlimited)", got)
	}
	if !allowMessageFrom("203.0.113.5", cfg.GetMaxMessagesPerHourIP()) {
		t.Error("limit 0 must accept mail")
	}
	// positive -> that value
	n := 42
	cfg.Server.MaxMessagesPerHourIP = &n
	if got := cfg.GetMaxMessagesPerHourIP(); got != 42 {
		t.Errorf("limit = %d, want 42", got)
	}
}

func TestMIMEPartsLimitSemantics(t *testing.T) {
	cfg := &Config{}
	if got := cfg.GetMaxMIMEParts(); got != 100 {
		t.Errorf("absent parts limit = %d, want 100", got)
	}
	zero := 0
	cfg.Server.MaxMIMEParts = &zero
	if got := cfg.GetMaxMIMEParts(); got != 0 {
		t.Errorf("explicit 0 = %d, want 0 (unlimited)", got)
	}
	n := 250
	cfg.Server.MaxMIMEParts = &n
	if got := cfg.GetMaxMIMEParts(); got != 250 {
		t.Errorf("parts limit = %d, want 250", got)
	}
}

func TestUnlimitedMessageRateAcceptsMany(t *testing.T) {
	ipWindows = map[string]*ipWindow{}
	zero := 0
	limit := zero
	for i := 0; i < 5000; i++ {
		if !allowMessageFrom("198.51.100.9", limit) {
			t.Fatalf("message %d rejected while the limit is 0 (unlimited)", i+1)
		}
	}
	ipWindows = map[string]*ipWindow{}
}

func TestReloadIfChangedPicksUpNewDomain(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	write := func(domains string) {
		content := "domains:\n" + domains +
			"database:\n  url: postgresql://u:p@localhost:5432/db\n" +
			"server:\n  mx_port: 25\n"
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("- first.test\n")

	base, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	SetCurrentConfig(base)

	// Prime the hash exactly like main() does, then change the file.
	SetConfigPath(path)
	configHash = hashFile(path)

	// A brand new domain must be visible after one forced re-read.
	write("- first.test\n- second.test\n")
	cfg := reloadIfChanged(path)
	if cfg == nil {
		t.Fatal("reloadIfChanged returned nil after the file changed")
	}
	if !cfg.GetDomainMap()["second.test"] {
		t.Errorf("new domain missing after reload: %v", cfg.Domains)
	}

	// Second call with unchanged content must be a no-op.
	if again := reloadIfChanged(path); again != nil {
		t.Error("reloadIfChanged reloaded even though the file did not change")
	}

	// A broken file keeps the previous config and returns nil.
	os.WriteFile(path, []byte("domains: [broken\n"), 0o644)
	if broken := reloadIfChanged(path); broken != nil {
		t.Error("reloadIfChanged accepted an unparsable file")
	}
	if got := GetCurrentConfig(); got == nil || !got.GetDomainMap()["second.test"] {
		t.Error("previous config was not kept after a failed reload")
	}
}
