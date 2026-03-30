# ShopKind — Ecommerce App on Kubernetes

> A containerized Node.js ecommerce application with a full CI/CD pipeline powered by GitHub Actions,
> security scanning, Docker Hub image registry, and Helm deployment on a local kind cluster
> running Calico as the CNI.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Setup — Step by Step](#local-setup--step-by-step)
  - [Step 1 — Create the kind Cluster](#step-1--create-the-kind-cluster)
  - [Step 2 — Install Calico CNI](#step-2--install-calico-cni)
  - [Step 3 — Install NGINX Ingress Controller](#step-3--install-nginx-ingress-controller)
  - [Step 4 — Install Metrics Server](#step-4--install-metrics-server)
  - [Step 5 — Add Local DNS Entry](#step-5--add-local-dns-entry)
  - [Step 6 — Configure GitHub Secrets](#step-6--configure-github-secrets)
  - [Step 7 — Push and Deploy](#step-7--push-and-deploy)
- [Access the App](#access-the-app)
- [Manual Deploy (without pipeline)](#manual-deploy-without-pipeline)
- [CI/CD Pipeline](#cicd-pipeline)
- [Security Scanning](#security-scanning)
- [Helm Chart](#helm-chart)
- [API Reference](#api-reference)
- [Local Development](#local-development)
- [Useful kubectl Commands](#useful-kubectl-commands)
- [Tear Down](#tear-down)
- [Troubleshooting](#troubleshooting)

---

## Project Overview

```
git push → GitHub Actions → Security Scans → Docker Build → Docker Hub → Trivy → Helm Deploy → kind
```

| Layer | Technology |
|---|---|
| App | Node.js + Express |
| Containerization | Docker (multi-stage, non-root) |
| Image Registry | Docker Hub |
| CI/CD | GitHub Actions |
| SAST | Semgrep |
| Secret Scanning | Gitleaks |
| Dependency Audit | npm audit + Snyk |
| Image Scanning | Trivy |
| Deployment | Helm 3 |
| Cluster | kind (Kubernetes in Docker) |
| CNI | Calico (via Tigera Operator) |
| Ingress | NGINX Ingress Controller |
| Autoscaling | Horizontal Pod Autoscaler (HPA) |

---

## Project Structure

```
ecommerce-app/
├── app/
│   ├── index.js              # Express API
│   ├── index.test.js         # Jest unit tests
│   ├── package.json
│   └── public/
│       └── index.html        # Storefront UI
├── helm/
│   └── ecommerce/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── _helpers.tpl
│           ├── deployment.yaml
│           ├── service.yaml  # NodePort 30300
│           ├── ingress.yaml
│           └── hpa.yaml
├── .github/
│   └── workflows/
│       └── ci-cd.yml
├── Dockerfile
├── .dockerignore
├── kind-config.yaml          # Calico CNI, podSubnet 192.168.0.0/16
└── README.md
```

---

## Prerequisites

| Tool | Install |
|---|---|
| Docker Desktop | https://www.docker.com/products/docker-desktop |
| kind | `brew install kind` or https://kind.sigs.k8s.io |
| kubectl | `brew install kubectl` |
| Helm 3 | `brew install helm` |
| Node.js 20+ | https://nodejs.org (local dev only) |

You also need a **GitHub** account and a **Docker Hub** account.

---

## Local Setup — Step by Step

### Step 1 — Create the kind Cluster

```bash
kind create cluster --name devsecops-lab2 --config kind-config.yaml
```

> ⚠️ After this step your nodes will show `NotReady`. That is expected — Calico has not been
> installed yet and there is no CNI to assign pod IPs.

Verify the cluster was created (nodes will be NotReady — that's fine for now):

```bash
kubectl get nodes
```

---

### Step 2 — Install Calico CNI

This is **required**. Without Calico, pods cannot get IP addresses and nodes stay `NotReady`.

**2a. Install the Tigera Operator:**

```bash
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.31.4/manifests/tigera-operator.yaml
```

**2b. Apply the Calico custom resources (uses the 192.168.0.0/16 pod CIDR):**

```bash
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.31.4/manifests/custom-resources.yaml
```

**2c. Wait for Calico to become ready (takes 2–3 minutes):**

```bash
kubectl wait --for=condition=ready pod --all -n calico-system --timeout=180s
```

**2d. Verify all nodes are now Ready:**

```bash
kubectl get nodes
```

You should see all 3 nodes with status `Ready`.

---

### Step 3 — Install NGINX Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

Wait for it to be ready:

```bash
kubectl wait \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  -n ingress-nginx \
  --timeout=120s
```

---

### Step 4 — Install Metrics Server

Required for the Horizontal Pod Autoscaler (HPA) to work. kind does not ship with it.

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

Patch it to allow insecure TLS (required on kind):

```bash
kubectl patch deployment metrics-server -n kube-system --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

Verify it's running:

```bash
kubectl get deployment metrics-server -n kube-system
```

---

### Step 5 — Add Local DNS Entry

This lets your browser resolve `ecommerce.local` to your machine:

```bash
# macOS / Linux
echo "127.0.0.1 ecommerce.local" | sudo tee -a /etc/hosts
```

Verify:

```bash
ping -c 1 ecommerce.local
```

---

### Step 6 — Configure GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

#### `DOCKERHUB_USERNAME`
Your Docker Hub login username — nothing to generate, you already have it.

#### `DOCKERHUB_TOKEN`
1. Log in at hub.docker.com
2. Avatar → **Account Settings** → **Personal access tokens**
3. **Generate new token** → name it `github-actions` → permissions: **Read & Write**
4. Copy the token immediately — it won't be shown again

#### `KUBECONFIG_DATA`
Your cluster's kubeconfig, base64-encoded:

```bash
kind get kubeconfig --name devsecops-lab2 | base64
```

Copy the full output and paste it as the secret value.

> **Important — GitHub-hosted runners vs local cluster:**
> GitHub Actions runners run in the cloud and cannot reach `localhost` on your machine.
> You have two options:
>
> **Option A (recommended) — Self-hosted runner:**
> Run a GitHub Actions runner on the same machine as your cluster.
> In your repo → Settings → Actions → Runners → New self-hosted runner.
> Follow the instructions, then change `runs-on: ubuntu-latest` to `runs-on: self-hosted`
> in the `deploy` job inside `.github/workflows/ci-cd.yml`.
>
> **Option B — Tunnel:**
> Expose your cluster API server temporarily with cloudflared or ngrok, then update
> the server URL in your kubeconfig before base64-encoding it.

#### Optional secrets

| Secret | Purpose | Where |
|---|---|---|
| `SNYK_TOKEN` | Snyk dependency scan | https://snyk.io |
| `SEMGREP_APP_TOKEN` | Semgrep cloud dashboard | https://semgrep.dev |

Both are optional — the pipeline uses `continue-on-error: true` for those steps.

---

### Step 7 — Push and Deploy

Once secrets are set:

```bash
git add .
git commit -m "feat: initial deploy"
git push origin main
```

Watch the pipeline: **GitHub repo → Actions tab**.

The deploy job runs last and only triggers on pushes to `main`.

---

## Access the App

After a successful deploy you have **two ways** to reach the app:

### Via NodePort (always works, no DNS needed)
```
http://localhost:30300
```

### Via Ingress (needs ecommerce.local in /etc/hosts)
```
http://ecommerce.local
```

### API endpoints
```bash
curl http://localhost:30300/health
curl http://localhost:30300/api/products
curl http://localhost:30300/api/products/1
```

---

## Manual Deploy (without pipeline)

To build and deploy directly from your machine:

```bash
# Build the image
docker build -t YOUR_DOCKERHUB_USERNAME/ecommerce-app:latest .

# Push to Docker Hub
docker push YOUR_DOCKERHUB_USERNAME/ecommerce-app:latest

# Deploy with Helm
helm upgrade --install ecommerce helm/ecommerce/ \
  --namespace ecommerce \
  --create-namespace \
  --set image.repository=YOUR_DOCKERHUB_USERNAME/ecommerce-app \
  --set image.tag=latest \
  --wait

# Verify
kubectl rollout status deployment/ecommerce -n ecommerce
kubectl get pods,svc -n ecommerce
```

---

## CI/CD Pipeline

Defined in `.github/workflows/ci-cd.yml`. Runs on every push to `main` or `develop`.

```
git push
    │
    ▼
[1] 🧪 Unit Tests  (Jest + supertest)
    │
    ├─────────────────────────────────────────┐
    ▼                  ▼                      ▼
[2] 🔍 SAST      [3] 🕵️ Secrets      [4] 🔐 Deps     [5] ⎈ Helm Lint
  Semgrep           Gitleaks            npm audit         helm lint +
  owasp-top-ten     full git history    + Snyk            template dry-run
    │
    └────────── all gates pass ───────────────┘
                        │
                        ▼
              [6] 🐳 Build & Push
                  Docker Hub
                  Tags: sha-xxxxxxx, branch, latest
                  Includes SBOM attestation
                        │
                        ▼
              [7] 🛡️ Trivy Image Scan
                  CRITICAL + HIGH CVEs
                  → GitHub Security tab
                        │
                   main branch only
                        │
                        ▼
              [8] 🚀 Helm Deploy
                  helm upgrade --install
                  namespace: ecommerce
                  NodePort 30300
                  --atomic (auto-rollback on failure)
```

### Image tagging

| Tag | When |
|---|---|
| `sha-abc1234` | Every push |
| `main` / `develop` | Branch name on every push |
| `latest` | Only on pushes to `main` |

---

## Security Scanning

| Tool | What it scans | Where results appear |
|---|---|---|
| **Semgrep** | Source code — OWASP Top 10, Node.js rules | Actions log |
| **Gitleaks** | Full git history for secrets | Actions log (fails the build) |
| **npm audit** | Node.js dependency CVEs | Actions log |
| **Snyk** | Deep dependency analysis | Actions log + Snyk dashboard |
| **Trivy** | Final Docker image (OS + libs) | Actions log + GitHub Security tab |

### Dockerfile hardening
- Multi-stage build — no build tools in the final image
- Non-root user (UID 1001)
- `readOnlyRootFilesystem: true` in the pod security context
- All Linux capabilities dropped (`drop: [ALL]`)
- `allowPrivilegeEscalation: false`

---

## Helm Chart

### Resources deployed

| Resource | Details |
|---|---|
| `Deployment` | 2 replicas, non-root, liveness + readiness probes |
| `Service` | NodePort 30300 → pod port 3000 |
| `Ingress` | NGINX, host: ecommerce.local |
| `HPA` | 2–5 replicas at 70% CPU |

### Useful Helm commands

```bash
# List releases
helm list -n ecommerce

# Dry-run without deploying
helm template ecommerce helm/ecommerce/ --set image.tag=latest

# Upgrade with a specific tag
helm upgrade ecommerce helm/ecommerce/ -n ecommerce --set image.tag=sha-abc1234

# Roll back to previous release
helm rollback ecommerce -n ecommerce

# Uninstall
helm uninstall ecommerce -n ecommerce
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | App health + version |
| GET | `/api/products` | All products |
| GET | `/api/products/:id` | Single product (404 if not found) |
| GET | `/` | Storefront UI |

**Example responses:**

```bash
# Health
curl http://localhost:30300/health
# {"status":"healthy","version":"1.0.0"}

# Products
curl http://localhost:30300/api/products
# {"products":[...],"total":5}
```

---

## Local Development

Run without Docker or Kubernetes:

```bash
cd app
npm install
npm start
# → http://localhost:3000
```

Run tests:

```bash
cd app
npm test
```

Build and run with Docker only:

```bash
docker build -t ecommerce-app:dev .
docker run -p 3000:3000 ecommerce-app:dev
# → http://localhost:3000
```

---

## Useful kubectl Commands

```bash
# All resources in the ecommerce namespace
kubectl get all -n ecommerce

# Pod logs (live)
kubectl logs -f deployment/ecommerce -n ecommerce

# Exec into a running pod
kubectl exec -it deployment/ecommerce -n ecommerce -- sh

# Describe a pod (good for debugging CrashLoopBackOff)
kubectl describe pod -n ecommerce

# Watch HPA scaling
kubectl get hpa -n ecommerce -w

# Check Calico pods
kubectl get pods -n calico-system

# Check ingress controller
kubectl get pods -n ingress-nginx

# Export kubeconfig (for scripts)
kind get kubeconfig --name devsecops-lab2 > ~/.kube/devsecops-lab2.kubeconfig
```

---

## Tear Down

```bash
# Delete the cluster (removes everything)
kind delete cluster --name devsecops-lab2

# Remove the /etc/hosts entry
# macOS:
sudo sed -i '' '/ecommerce.local/d' /etc/hosts

# Linux:
sudo sed -i '/ecommerce.local/d' /etc/hosts
```

---

## Troubleshooting

### Nodes stuck in NotReady after cluster creation
Calico has not been installed yet — this is expected. Follow Step 2 to install Calico.

```bash
kubectl get pods -n calico-system   # check Calico pod status
```

### Pods in ImagePullBackOff
The cluster can't pull the image from Docker Hub.

```bash
kubectl describe pod -n ecommerce   # look at the Events section
```

Check that:
- `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets are correct
- The image was pushed successfully (check hub.docker.com)
- The `image.repository` in `values.yaml` matches your Docker Hub username

### Ingress returns 404 or connection refused
```bash
kubectl get pods -n ingress-nginx         # is the controller running?
kubectl get ingress -n ecommerce          # is the ingress resource created?
cat /etc/hosts | grep ecommerce           # is the DNS entry there?
```

As a fallback, use NodePort directly: `http://localhost:30300`

### HPA shows `<unknown>` for CPU metrics
Metrics Server is not installed or not patched for kind's insecure TLS.

```bash
kubectl get deployment metrics-server -n kube-system
kubectl top pods -n ecommerce   # should show CPU/mem if working
```

Re-apply Step 4 if needed.

### GitHub Actions deploy job can't reach the cluster
GitHub-hosted runners cannot access `localhost`. Set up a self-hosted runner:

1. GitHub repo → Settings → Actions → Runners → New self-hosted runner
2. Follow the setup instructions on that page
3. In `.github/workflows/ci-cd.yml`, change the deploy job to:

```yaml
deploy:
  runs-on: self-hosted
```

### Check pipeline image tag mismatch
The pipeline tags images as `sha-XXXXXXX` (first 7 chars of the commit SHA).

```bash
# Find the exact tag that was pushed
docker pull YOUR_DOCKERHUB_USERNAME/ecommerce-app --all-tags
```

---

## License

MIT
