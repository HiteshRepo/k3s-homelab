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

# ─── Help ─────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
