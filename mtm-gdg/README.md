# MTM GDG Event Manager (3-tier)

| Tier | Tech | K8s object |
|------|------|-----------|
| Presentation | Static HTML + Nginx (proxies `/api` to backend) | `frontend` Deployment + NodePort 30080 |
| Application  | Node.js / Express REST API | `backend` Deployment (2 replicas) + ClusterIP |
| Data         | PostgreSQL 16 with a 1Gi PVC | `postgres` Deployment + ClusterIP |

## 1. Edit three things
1. `k8s/01-secret.yaml` – set the DB password and admin token.
2. `Jenkinsfile` – set `REGISTRY` to your Docker Hub username.
3. Push this folder to a Git repo Jenkins can read.

## 2. Get Jenkins running on Kubernetes (skip if you have one)
```bash
kubectl apply -f jenkins/jenkins-on-k8s.yaml
kubectl -n jenkins logs deploy/jenkins        # copy the initial admin password
# open http://<node-ip>:32000, install suggested plugins
```
Jenkins needs `docker` and `kubectl` on the agent. The easiest way is a one-time install inside the Jenkins container:
```bash
kubectl -n jenkins exec -it deploy/jenkins -- bash -c '
  apt-get update && apt-get install -y docker.io &&
  curl -LO "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" &&
  install kubectl /usr/local/bin/kubectl'
```

## 3. Add two Jenkins credentials (Manage Jenkins → Credentials)
- `dockerhub-creds` – Username with password (Docker Hub user + access token)
- `kubeconfig` – Secret file (your cluster kubeconfig)

## 4. Create the pipeline
New Item → Pipeline → "Pipeline script from SCM" → your Git URL → script path `Jenkinsfile` → Build Now.

## 5. Open the site
`http://<node-ip>:30080`
Click **Organizer login**, paste your admin token, and publish events or view registrations.

## Run without Jenkins (quick test)
```bash
docker build -t YOU/mtm-gdg-backend:1 backend  && docker build -t YOU/mtm-gdg-frontend:1 frontend
docker push YOU/mtm-gdg-backend:1 && docker push YOU/mtm-gdg-frontend:1
sed -i "s|DOCKER_REGISTRY|YOU|g; s|IMAGE_TAG|1|g" k8s/20-backend.yaml k8s/30-frontend.yaml
kubectl apply -f k8s/00-namespace.yaml && kubectl apply -f k8s/
```
Minikube: `minikube service frontend -n mtm-gdg`.

## API
`GET /api/events` · `POST /api/events` (admin) · `DELETE /api/events/:id` (admin) ·
`POST /api/events/:id/register` · `GET /api/events/:id/registrations` (admin)
Admin calls need the header `x-admin-token`.
