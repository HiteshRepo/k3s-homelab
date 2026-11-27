package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	vaultPath string
	apiKey    string
)

func main() {
	vaultPath = os.Getenv("VAULT_PATH")
	if vaultPath == "" {
		vaultPath = "/vault"
	}

	apiKey = os.Getenv("CAPTURE_API_KEY")
	if apiKey == "" {
		fmt.Fprintln(os.Stderr, "CAPTURE_API_KEY not set — all requests will be rejected")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/capture", withAuth(handleCapture))
	http.HandleFunc("/capture/voice", withAuth(handleVoice))

	fmt.Printf("brain-capture listening on :%s, vault=%s\n", port, vaultPath)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}

func withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" || token != apiKey {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "ok")
}

func handleCapture(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Text  string `json:"text"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Text == "" {
		http.Error(w, "body must be JSON with a non-empty text field", http.StatusBadRequest)
		return
	}

	now := time.Now()
	filename := now.Format("2006-01-02-1504") + ".md"
	if req.Title != "" {
		slug := strings.ToLower(strings.NewReplacer(" ", "-", "/", "-").Replace(req.Title))
		filename = now.Format("2006-01-02-1504") + "-" + slug + ".md"
	}

	draftsDir := filepath.Join(vaultPath, "drafts")
	if err := os.MkdirAll(draftsDir, 0755); err != nil {
		http.Error(w, "failed to create drafts dir", http.StatusInternalServerError)
		return
	}

	heading := now.Format("2006-01-02 15:04")
	if req.Title != "" {
		heading = req.Title
	}
	content := fmt.Sprintf("# %s\n\n%s\n", heading, req.Text)

	if err := os.WriteFile(filepath.Join(draftsDir, filename), []byte(content), 0644); err != nil {
		http.Error(w, "failed to write file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"file": filename})
}

func handleVoice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseMultipartForm(64 << 20); err != nil {
		http.Error(w, "failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("audio")
	if err != nil {
		http.Error(w, "audio field required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".m4a"
	}

	now := time.Now()
	filename := now.Format("2006-01-02-1504") + "-voice" + ext

	attachmentsDir := filepath.Join(vaultPath, "Attachments")
	if err := os.MkdirAll(attachmentsDir, 0755); err != nil {
		http.Error(w, "failed to create attachments dir", http.StatusInternalServerError)
		return
	}

	dst, err := os.Create(filepath.Join(attachmentsDir, filename))
	if err != nil {
		http.Error(w, "failed to create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "failed to save file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"file": filename})
}
