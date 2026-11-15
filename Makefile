GITHUB_USERNAME ?= YOUR_USERNAME

# ─── Setup ────────────────────────────────────────────────────────────────────

.PHONY: install-k3s
install-k3s: ## Install K3s with bundled components disabled
	curl -sfL https://get.k3s.io | sh -s - \
	  --disable traefik \
	  --disable servicelb \
	  --disable local-storage \
	  --disable metrics-server

.PHONY: kubeconfig
kubeconfig: ## Copy K3s kubeconfig to ~/.kube/config
	mkdir -p ~/.kube
	sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
	sudo chown $$USER:$$USER ~/.kube/config

.PHONY: lid-suspend-off
lid-suspend-off: ## Disable laptop suspend on lid close
	@grep -q "^HandleLidSwitch=ignore" /etc/systemd/logind.conf && echo "Lid suspend already disabled" || { \
	  sudo sed -i 's/#HandleLidSwitch=suspend/HandleLidSwitch=ignore/' /etc/systemd/logind.conf; \
	  sudo systemctl restart systemd-logind; \
	  echo "Lid suspend disabled"; \
	}

.PHONY: gpu-node-setup
gpu-node-setup: ## Set up GPU support on this node (NVIDIA driver → CUDA → container toolkit → k3s → device plugin)
	bash gpu-node-setup.sh

.PHONY: set-github-username
set-github-username: ## Replace YOUR_USERNAME in all YAML files (usage: make set-github-username GITHUB_USERNAME=myuser)
	@if [ "$(GITHUB_USERNAME)" = "YOUR_USERNAME" ]; then \
	  echo "Error: pass your username — make set-github-username GITHUB_USERNAME=myuser"; exit 1; \
	fi
	find gitops/ -type f -name "*.yaml" \
	  -exec sed -i 's/YOUR_USERNAME/$(GITHUB_USERNAME)/g' {} +
	@echo "Done. Commit and push to GitHub before running make bootstrap."

# ─── App Secrets ──────────────────────────────────────────────────────────────

OPENAI_API_KEY ?= ""
ANTHROPIC_API_KEY ?= ""

.PHONY: litellm-secret
litellm-secret: ## Create LiteLLM API key secrets (usage: make litellm-secret OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-...)
	@if [ -z "$(OPENAI_API_KEY)" ] && [ -z "$(ANTHROPIC_API_KEY)" ]; then \
	  echo "Error: pass at least one key — make litellm-secret OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-..."; exit 1; \
	fi
	@kubectl get secret litellm-keys -n litellm >/dev/null 2>&1 && echo "litellm-keys secret already exists" || { \
	  MASTER_KEY=$$(openssl rand -hex 32); \
	  kubectl create namespace litellm --dry-run=client -o yaml | kubectl apply -f -; \
	  kubectl create secret generic litellm-keys \
	    --namespace litellm \
	    --from-literal=openai-api-key=$(OPENAI_API_KEY) \
	    --from-literal=anthropic-api-key=$(ANTHROPIC_API_KEY) \
	    --from-literal=master-key=$$MASTER_KEY; \
	  kubectl create namespace ollama --dry-run=client -o yaml | kubectl apply -f -; \
	  kubectl create secret generic litellm-master-key \
	    --namespace ollama \
	    --from-literal=master-key=$$MASTER_KEY; \
	}

.PHONY: litellm-master-key
litellm-master-key: ## Print the LiteLLM master key (for use with llm CLI and aider)
	@kubectl get secret litellm-keys -n litellm -o jsonpath='{.data.master-key}' | base64 -d && echo

.PHONY: homarr-secret
homarr-secret: ## Create the Homarr database encryption key secret
	@kubectl get secret db-encryption -n homelab >/dev/null 2>&1 && echo "db-encryption secret already exists" || \
	  kubectl create secret generic db-encryption \
	    --namespace homelab \
	    --from-literal=db-encryption-key=$$(openssl rand -hex 32)

# ─── Cloudflare Tunnel ────────────────────────────────────────────────────────

TUNNEL_TOKEN ?= ""

.PHONY: cloudflared-secret
cloudflared-secret: ## Create the cloudflared tunnel token secret (usage: make cloudflared-secret TUNNEL_TOKEN=<token>)
	@if [ -z "$(TUNNEL_TOKEN)" ]; then \
	  echo "Error: pass your token — make cloudflared-secret TUNNEL_TOKEN=<token>"; exit 1; \
	fi
	@kubectl get secret cloudflared-token -n cloudflared >/dev/null 2>&1 && echo "cloudflared-token secret already exists" || \
	  kubectl create secret generic cloudflared-token \
	    --namespace cloudflared \
	    --from-literal=token=$(TUNNEL_TOKEN)

# ─── ArgoCD ───────────────────────────────────────────────────────────────────

.PHONY: install-argocd
install-argocd: ## Install ArgoCD into the argocd namespace
	@kubectl get deployment argocd-server -n argocd >/dev/null 2>&1 && echo "ArgoCD already installed" || { \
	  kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -; \
	  kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.3/manifests/install.yaml; \
	  kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=120s; \
	}

.PHONY: argocd-password
argocd-password: ## Print the initial ArgoCD admin password
	@kubectl get secret argocd-initial-admin-secret -n argocd \
	  -o jsonpath="{.data.password}" | base64 -d && echo

APP ?= ""

.PHONY: sync
sync: ## Force sync an ArgoCD application (usage: make sync APP=litellm)
	@if [ -z "$(APP)" ]; then \
	  echo "Error: pass an app name — make sync APP=litellm"; exit 1; \
	fi
	kubectl patch application $(APP) -n argocd --type merge \
	  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{}}}'

.PHONY: bootstrap
bootstrap: ## Apply the app-of-apps to kick off all deployments
	@kubectl get application app-of-apps -n argocd >/dev/null 2>&1 && echo "app-of-apps already bootstrapped" || \
	  kubectl apply -f gitops/app-of-apps.yaml

# ─── TLS ──────────────────────────────────────────────────────────────────────

.PHONY: trust-homelab-cert
trust-homelab-cert: ## Trust the homelab self-signed cert system-wide (idempotent)
	@CERT=$$(echo | openssl s_client -connect litellm.lab.hiteshp.in:443 \
	  -servername litellm.lab.hiteshp.in 2>/dev/null | openssl x509); \
	CERT_FILE="/usr/local/share/ca-certificates/homelab.crt"; \
	if [ -f "$$CERT_FILE" ] && [ "$$(cat $$CERT_FILE)" = "$$CERT" ]; then \
	  echo "homelab cert already trusted and up to date"; \
	else \
	  echo "$$CERT" | sudo tee "$$CERT_FILE" > /dev/null; \
	  sudo update-ca-certificates; \
	  echo "homelab cert trusted"; \
	fi

# ─── Port Forwards ────────────────────────────────────────────────────────────

.PHONY: pf-litellm
pf-litellm: ## Port-forward LiteLLM to localhost:4000 (foreground, for one-off use)
	kubectl port-forward -n litellm svc/litellm 4000:4000

.PHONY: pf-litellm-service
pf-litellm-service: ## Install systemd service to keep LiteLLM port-forward running on boot
	@sed 's/User=hitesh/User=$(USER)/' gitops/manifests/litellm/litellm-portforward.service \
	  | sudo tee /etc/systemd/system/litellm-portforward.service > /dev/null
	@sudo systemctl daemon-reload
	@sudo systemctl enable --now litellm-portforward
	@echo "litellm-portforward service enabled and started"

# ─── Status ───────────────────────────────────────────────────────────────────

.PHONY: watch
watch: ## Watch all ArgoCD application sync status
	kubectl get applications -n argocd -w

.PHONY: status
status: ## Print sync status of all ArgoCD applications
	kubectl get applications -n argocd

.PHONY: traefik-ip
traefik-ip: ## Print the LoadBalancer IP assigned to Traefik
	@kubectl get svc -n traefik-system traefik -o jsonpath='{.status.loadBalancer.ingress[0].ip}' && echo

# ─── Kopia Backup ─────────────────────────────────────────────────────────────

KOPIA_POD = $(shell kubectl get pod -n kopia -o jsonpath='{.items[0].metadata.name}')
KOPIA_CMD = kubectl exec -n kopia $(KOPIA_POD) --
KOPIA_LOCAL = $(KOPIA_CMD) kopia --config-file=/app/config/repository-local.config

B2_KEY_ID ?= ""
B2_APPLICATION_KEY ?= ""
KOPIA_PASSWORD ?= ""

.PHONY: kopia-secret
kopia-secret: ## Create Kopia B2 credentials secret (usage: make kopia-secret B2_KEY_ID=... B2_APPLICATION_KEY=... KOPIA_PASSWORD=...)
	@kubectl get secret kopia-b2-credentials -n kopia >/dev/null 2>&1 && echo "kopia-b2-credentials secret already exists" || { \
	  kubectl create namespace kopia --dry-run=client -o yaml | kubectl apply -f -; \
	  kubectl create secret generic kopia-b2-credentials \
	    --namespace kopia \
	    --from-literal=B2_KEY_ID=$(B2_KEY_ID) \
	    --from-literal=B2_APPLICATION_KEY=$(B2_APPLICATION_KEY) \
	    --from-literal=KOPIA_PASSWORD=$(KOPIA_PASSWORD); \
	}

.PHONY: kopia-snapshots
kopia-snapshots: ## List all Kopia snapshots in B2 repository
	$(KOPIA_CMD) kopia snapshot list --all

.PHONY: kopia-snapshots-local
kopia-snapshots-local: ## List all Kopia snapshots in pendrive repository
	$(KOPIA_LOCAL) snapshot list --all

.PHONY: kopia-stats
kopia-stats: ## Show B2 repository storage stats
	$(KOPIA_CMD) kopia content stats

.PHONY: kopia-stats-local
kopia-stats-local: ## Show pendrive repository storage stats
	$(KOPIA_LOCAL) content stats

.PHONY: kopia-backup-now
kopia-backup-now: ## Trigger manual backup to B2 immediately
	kubectl create job -n kopia --from=cronjob/kopia-backup kopia-manual-$(shell date +%Y%m%d%H%M%S)

.PHONY: kopia-backup-b2
kopia-backup-b2: ## Run backup to B2 only (foreground)
	$(KOPIA_CMD) sh -c 'kopia snapshot create /mnt/external/docs & kopia snapshot create /mnt/immich & kopia snapshot create /mnt/pvcs/immich-postgres & kopia snapshot create /mnt/pvcs/open-webui & kopia snapshot create /mnt/pvcs/kopia-config & kopia snapshot create /mnt/k3s-db & wait && echo DONE'

.PHONY: kopia-backup-local
kopia-backup-local: ## Run backup to pendrive only (foreground)
	$(KOPIA_CMD) sh -c 'kopia --config-file=/app/config/repository-local.config snapshot create /mnt/external/docs & kopia --config-file=/app/config/repository-local.config snapshot create /mnt/immich & kopia --config-file=/app/config/repository-local.config snapshot create /mnt/pvcs/immich-postgres & kopia --config-file=/app/config/repository-local.config snapshot create /mnt/pvcs/open-webui & kopia --config-file=/app/config/repository-local.config snapshot create /mnt/pvcs/kopia-config & kopia --config-file=/app/config/repository-local.config snapshot create /mnt/k3s-db & wait && echo DONE'

.PHONY: kopia-logs
kopia-logs: ## Tail Kopia server logs
	kubectl logs -n kopia -l app=kopia -f

# ─── Immich ───────────────────────────────────────────────────────────────────

IMMICH_POD = $(shell kubectl get pod -n immich -l app.kubernetes.io/name=server -o jsonpath='{.items[0].metadata.name}')

.PHONY: immich-status
immich-status: ## Show Immich pod status
	kubectl get pods -n immich

.PHONY: immich-logs
immich-logs: ## Tail Immich server logs
	kubectl logs -n immich -l app.kubernetes.io/name=server -f --tail=50

.PHONY: immich-storage
immich-storage: ## Show Immich library storage usage
	@sudo du -sh /opt/local-path-provisioner/pvc-2a569fe3-80a3-422e-8b99-7d36daaf68cf_immich_immich-library-pvc/

.PHONY: immich-vchord
immich-vchord: ## Create vchord extension (run after fresh postgres init)
	kubectl exec -n immich $(shell kubectl get pod -n immich -l app=immich-postgres -o jsonpath='{.items[0].metadata.name}') -- psql -U immich -d immich -c 'CREATE EXTENSION IF NOT EXISTS vchord CASCADE'

.PHONY: immich-restart
immich-restart: ## Restart Immich server
	kubectl rollout restart deployment/immich-server -n immich

# ─── Storage ──────────────────────────────────────────────────────────────────

.PHONY: storage-status
storage-status: ## Show all storage usage (NVMe, external HDD, pendrives)
	@echo "=== NVMe ===" && df -h / | tail -1
	@echo "=== External HDD ===" && df -h /mnt/external 2>/dev/null | tail -1 || echo "not mounted"
	@echo "=== Pendrive ===" && df -h /mnt/pendrive2 2>/dev/null | tail -1 || echo "not mounted"
	@echo "=== PVCs ===" && sudo du -sh /opt/local-path-provisioner/*/ 2>/dev/null | sort -h

.PHONY: mount-external
mount-external: ## Mount external HDD at /mnt/external
	@mountpoint -q /mnt/external && echo "already mounted" || sudo mount /dev/sda1 /mnt/external

.PHONY: mount-pendrive
mount-pendrive: ## Mount pendrive (sdc1) at /mnt/pendrive2
	@mountpoint -q /mnt/pendrive2 && echo "already mounted" || sudo mount /dev/sdc1 /mnt/pendrive2

# ─── Help ─────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
