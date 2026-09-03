package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"time"

	"github.com/emersion/go-smtp"
)

// Backend implements SMTP server backend
type Backend struct {
	cfg       *Config
	db        *DB
	validator *Validator
	domains   map[string]bool
}

// NewBackend creates a new SMTP backend
func NewBackend(cfg *Config, db *DB, validator *Validator) *Backend {
	return &Backend{
		cfg:       cfg,
		db:        db,
		validator: validator,
		domains:   cfg.GetDomainMap(),
	}
}

// NewSession creates a new SMTP session
func (bkd *Backend) NewSession(c *smtp.Conn) (smtp.Session, error) {
	remoteAddr := c.Conn().RemoteAddr().String()
	hostname := c.Hostname()

	// Use the latest config so hot-reloaded settings (domains, message size
	// limit) apply to new sessions without a restart.
	cfg := GetCurrentConfig()
	if cfg == nil {
		cfg = bkd.cfg
	}

	// Check if TLS is enabled
	tlsInfo := ""
	if tlsConn, ok := c.Conn().(*tls.Conn); ok {
		state := tlsConn.ConnectionState()
		tlsInfo = fmt.Sprintf(" [TLS %s]", tlsVersionString(state.Version))
	}

	log.Printf("[%s] New connection from: %s%s", remoteAddr, hostname, tlsInfo)

	return NewSession(remoteAddr, hostname, cfg, bkd.db, bkd.validator, cfg.GetDomainMap()), nil
}

// SMTPServer wraps the SMTP server
type SMTPServer struct {
	server *smtp.Server
	cfg    *Config
}

// NewSMTPServer creates a new SMTP server
func NewSMTPServer(cfg *Config, db *DB) (*SMTPServer, error) {
	// Create validator (if validation is enabled)
	var validator *Validator
	if cfg.Validation.CheckDKIM || cfg.Validation.CheckSPF || cfg.Validation.CheckDMARC {
		validator = NewValidator(cfg)
		log.Printf("Email validation enabled - DKIM: %v, SPF: %v, DMARC: %v",
			cfg.Validation.CheckDKIM, cfg.Validation.CheckSPF, cfg.Validation.CheckDMARC)
	} else {
		log.Println("Email validation disabled")
	}

	// Create backend
	backend := NewBackend(cfg, db, validator)

	// Create SMTP server
	s := smtp.NewServer(backend)

	// Configure server
	s.Addr = fmt.Sprintf("0.0.0.0:%d", cfg.Server.MXPort)
	s.Domain = cfg.Server.Hostname
	s.ReadTimeout = 30 * time.Second
	s.WriteTimeout = 30 * time.Second
	s.MaxMessageBytes = cfg.GetMaxMessageSize()
	s.MaxRecipients = 50 // Reasonable limit for tempmail
	s.AllowInsecureAuth = false
	s.AuthDisabled = true // MX servers don't require authentication

	// Configure TLS if enabled. The certificate is loaded lazily on every
	// STARTTLS handshake (tls.Config.GetCertificate), so renewals apply
	// without a restart.
	if cfg.TLS.Enabled {
		loader := newCertLoader(cfg.TLS.CertFile, cfg.TLS.KeyFile)
		if loader.FilesExist() {
			log.Printf("✓ TLS/STARTTLS enabled (cert: %s)", cfg.TLS.CertFile)
		} else {
			log.Printf("⚠ TLS enabled but certificates not found at %s - STARTTLS will fail until certs are issued", cfg.TLS.CertFile)
		}
		s.TLSConfig = buildTLSConfig(cfg.TLS.CertFile, cfg.TLS.KeyFile)
	} else {
		log.Printf("⚠ TLS/STARTTLS disabled - connections will be unencrypted")
	}

	log.Printf("SMTP MX Server configured:")
	log.Printf("  Listen address: %s", s.Addr)
	log.Printf("  Server domain: %s", s.Domain)
	log.Printf("  Max message size: %d MB", cfg.Server.MaxMsgSizeMB)
	log.Printf("  Max recipients: %d", s.MaxRecipients)
	log.Printf("  Accepted domains: %v", cfg.Domains)

	return &SMTPServer{
		server: s,
		cfg:    cfg,
	}, nil
}

// Start starts the SMTP server
func (s *SMTPServer) Start() error {
	log.Printf("🚀 Starting SMTP MX server on %s", s.server.Addr)
	log.Printf("✉️  Ready to receive emails for domains: %v", s.cfg.Domains)

	if err := s.server.ListenAndServe(); err != nil {
		return fmt.Errorf("SMTP server error: %w", err)
	}
	return nil
}

// ReloadTLS re-evaluates STARTTLS support after a config hot-reload: it
// enables TLS when tls.enabled was switched on (certificates are loaded
// lazily per handshake) and disables it when switched off.
func (s *SMTPServer) ReloadTLS(cfg *Config) {
	if cfg.TLS.Enabled && s.server.TLSConfig == nil {
		s.server.TLSConfig = buildTLSConfig(cfg.TLS.CertFile, cfg.TLS.KeyFile)
		log.Printf("TLS/STARTTLS enabled via config reload (cert: %s)", cfg.TLS.CertFile)
	} else if !cfg.TLS.Enabled && s.server.TLSConfig != nil {
		s.server.TLSConfig = nil
		log.Printf("TLS/STARTTLS disabled via config reload")
	}
}

// Close shuts down the SMTP server
func (s *SMTPServer) Close() error {
	log.Println("Shutting down SMTP server...")
	return s.server.Close()
}

// tlsVersionString returns a human-readable TLS version string
func tlsVersionString(version uint16) string {
	switch version {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return fmt.Sprintf("Unknown (0x%04X)", version)
	}
}
