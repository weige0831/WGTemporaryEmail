package main

import (
	"crypto/tls"
	"os"
	"sync"
	"time"
)

// certLoader lazily loads the TLS keypair and reloads it when the files
// change on disk, so certbot renewals take effect without restarting the
// MX server. It is used as tls.Config.GetCertificate, which the SMTP
// library invokes on every STARTTLS handshake.
type certLoader struct {
	mu       sync.Mutex
	certFile string
	keyFile  string
	certMod  time.Time
	keyMod   time.Time
	keyPair  *tls.Certificate
	loaded   bool
}

func newCertLoader(certFile, keyFile string) *certLoader {
	return &certLoader{certFile: certFile, keyFile: keyFile}
}

// getCertificate implements tls.Config.GetCertificate.
func (l *certLoader) getCertificate(_ *tls.ClientHelloInfo) (*tls.Certificate, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	certInfo, err := os.Stat(l.certFile)
	if err != nil {
		return nil, err
	}
	keyInfo, err := os.Stat(l.keyFile)
	if err != nil {
		return nil, err
	}

	if l.loaded && certInfo.ModTime().Equal(l.certMod) && keyInfo.ModTime().Equal(l.keyMod) {
		return l.keyPair, nil
	}

	pair, err := tls.LoadX509KeyPair(l.certFile, l.keyFile)
	if err != nil {
		return nil, err
	}
	l.keyPair = &pair
	l.certMod = certInfo.ModTime()
	l.keyMod = keyInfo.ModTime()
	l.loaded = true
	return l.keyPair, nil
}

// FilesExist reports whether both certificate files exist on disk.
func (l *certLoader) FilesExist() bool {
	if _, err := os.Stat(l.certFile); err != nil {
		return false
	}
	if _, err := os.Stat(l.keyFile); err != nil {
		return false
	}
	return true
}

// buildTLSConfig creates the STARTTLS config backed by a lazy cert loader.
func buildTLSConfig(certFile, keyFile string) *tls.Config {
	return &tls.Config{
		GetCertificate: newCertLoader(certFile, keyFile).getCertificate,
		MinVersion:     tls.VersionTLS12, // Require TLS 1.2 or higher
		CipherSuites: []uint16{
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
		},
		PreferServerCipherSuites: true,
	}
}
