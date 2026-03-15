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
	sudo sed -i 's/#HandleLidSwitch=suspend/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
	sudo systemctl restart systemd-logind

.PHONY: set-github-username
set-github-username: ## Replace YOUR_USERNAME in all YAML files (usage: make set-github-username GITHUB_USERNAME=myuser)
	@if [ "$(GITHUB_USERNAME)" = "YOUR_USERNAME" ]; then \
	  echo "Error: pass your username — make set-github-username GITHUB_USERNAME=myuser"; exit 1; \
	fi
	find gitops/ -type f -name "*.yaml" \
	  -exec sed -i 's/YOUR_USERNAME/$(GITHUB_USERNAME)/g' {} +
	@echo "Done. Commit and push to GitHub before running make bootstrap."

# ─── ArgoCD ───────────────────────────────────────────────────────────────────

.PHONY: install-argocd
install-argocd: ## Install ArgoCD into the argocd namespace
	kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
	kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
	kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=120s

.PHONY: argocd-password
argocd-password: ## Print the initial ArgoCD admin password
	@kubectl get secret argocd-initial-admin-secret -n argocd \
	  -o jsonpath="{.data.password}" | base64 -d && echo

.PHONY: bootstrap
bootstrap: ## Apply the app-of-apps to kick off all deployments
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
