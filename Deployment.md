# SkillPulse Deployment Plan

End-to-end plan for getting SkillPulse running on AWS via Terraform + GitHub Actions. This is a **plan**, not the final code — we'll write the actual `.tf` and `.yml` files in the chapters.

---

## 1. Goal

One push to `main` →
1. `ci.yml` builds the backend image and pushes to Docker Hub.
2. `cd.yml` SSHes into a pre-provisioned EC2 instance.
3. EC2 pulls the new image and restarts the compose stack.
4. `http://<ec2-public-ip>` serves the latest SkillPulse.

The EC2 instance itself is created **once** by Terraform, run locally by the instructor. After that, every deploy is automated.

---

## 2. Architecture

```
                    ┌─────────────────────────────────────┐
                    │              GitHub                 │
                    │  ┌──────────┐    ┌──────────────┐   │
   git push ───────►│  │  Repo    │───►│   Actions    │   │
                    │  └──────────┘    │  ci.yml→cd.yml│  │
                    └────────────────────────┬─────────┘
                                             │
                       ┌─────────────────────┼─────────────────┐
                       │                     │                 │
                       ▼                     ▼                 ▼
              ┌─────────────────┐   ┌─────────────────┐  ┌──────────┐
              │   Docker Hub    │   │      SSH        │  │  Secrets │
              │  (image push)   │   │  (deploy step)  │  │ (DH+EC2) │
              └────────┬────────┘   └────────┬────────┘  └──────────┘
                       │                     │
                       ▼                     ▼
              ┌──────────────────────────────────────────┐
              │       EC2 (t3.medium, Ubuntu, us-west-2) │
              │  ┌──────┐  ┌──────────┐  ┌────────────┐  │
              │  │nginx │──│ backend  │──│  mysql 8   │  │
              │  └──────┘  └──────────┘  └────────────┘  │
              │            docker compose                │
              └──────────────────────────────────────────┘
                              ▲
                              │  port 80 open to world
                          End user
```

One EC2 box runs everything (MySQL included, in a container with a named volume). No ALB, no RDS, no autoscaling. Course-grade simplicity.

---

## 3. Prerequisites (instructor-side, one-time)

- AWS account with billing alarm set
- AWS CLI configured locally (`aws configure`) — Terraform reads creds from there
- Terraform CLI installed (`>= 1.6`)
- A Docker Hub account + access token (not password)
- A **public** GitHub repo with the SkillPulse code

---

## 4. Repository Layout (after this work)

The repo IS the app — no `skillpulse/` subfolder. Repo root contains the compose file, app dirs, and the `terraform/` + `.github/` infra.

```
SkillPulse/
├── CLAUDE.md
├── Deployment.md                  ← this file
├── README.md
├── .gitignore
├── docker-compose.yml             ← backend uses image: (see §8)
├── .env.example
├── backend/                       ← Go + Gin REST API
├── frontend/                      ← HTML/CSS/JS
├── nginx/                         ← reverse-proxy config
├── mysql/                         ← init.sql
├── chapters/
│   └── ...
├── terraform/
│   ├── main.tf                    ← provider, EC2, key pair, SG
│   ├── variables.tf               ← region, instance_type, repo_url, dockerhub_username
│   ├── outputs.tf                 ← public IP, ssh user, private key
│   ├── user_data.sh.tpl           ← bootstrap template (docker, compose, app dir)
│   └── .gitignore                 ← state files, .pem
└── .github/
    └── workflows/
        ├── ci.yml                 ← build + push to Docker Hub
        └── cd.yml                 ← SSH + compose pull/up (split, uses workflow_run)
```

`terraform/` runs locally (not in CI). State is local — fine for a course.

---

## 5. Terraform Resources

### `main.tf`
- `provider "aws"` — region from variable
- `tls_private_key` — generates a 4096-bit RSA key in-memory
- `aws_key_pair` — registers the public half with EC2
- `aws_security_group`:
  - ingress 22 from `var.ssh_ingress_cidr` (default `0.0.0.0/0`, with a comment to lock down for real use)
  - ingress 80 from `0.0.0.0/0`
  - egress all
- `aws_instance`:
  - AMI: latest Ubuntu 22.04 LTS via `data "aws_ami"` filter (Canonical owner ID `099720109477`)
  - `instance_type = var.instance_type` (default `t3.medium`)
  - `key_name = aws_key_pair.this.key_name`
  - `vpc_security_group_ids = [aws_security_group.this.id]`
  - `user_data = templatefile("${path.module}/user_data.sh.tpl", { repo_url = var.repo_url, dockerhub_username = var.dockerhub_username })`
  - `root_block_device { volume_size = 20 }` — give MySQL room
  - tags: `Name = "skillpulse"`

### `variables.tf`
```hcl
variable "region"             { default = "us-west-2" }
variable "instance_type"      { default = "t3.medium" }
variable "ssh_ingress_cidr"   { default = "0.0.0.0/0" }   # tighten in real use
variable "key_pair_name"      { default = "skillpulse-key" }

variable "repo_url" {
  description = "Public GitHub repo URL containing the SkillPulse code"
  # e.g. "https://github.com/LondheShubham153/github-actions-masterclass.git"
}

variable "dockerhub_username" {
  description = "Docker Hub username — written into .env on the EC2 box"
}
```

### `outputs.tf`
```hcl
output "ec2_public_ip"  { value = aws_instance.this.public_ip }
output "ec2_user"       { value = "ubuntu" }
output "ssh_private_key" {
  value     = tls_private_key.this.private_key_pem
  sensitive = true
}
```

After `apply`, the instructor runs `terraform output -raw ssh_private_key > skillpulse-key.pem` once, then pastes that content into a GitHub secret.

---

## 6. `user_data.sh.tpl` (bootstrap on first boot)

Templated by Terraform — `${repo_url}` and `${dockerhub_username}` get filled in at apply time.

```bash
#!/bin/bash
set -euxo pipefail

# Install Docker + Compose plugin
apt-get update -y
apt-get install -y ca-certificates curl gnupg git

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

usermod -aG docker ubuntu

# Clone the repo (the repo root IS the app dir — compose file at root)
sudo -u ubuntu git clone ${repo_url} /home/ubuntu/skillpulse

# Build the .env file for compose
sudo -u ubuntu cp /home/ubuntu/skillpulse/.env.example /home/ubuntu/skillpulse/.env
echo "DOCKERHUB_USERNAME=${dockerhub_username}" | sudo -u ubuntu tee -a /home/ubuntu/skillpulse/.env

# Compose will pull the backend image from Docker Hub on first `up` (after CI runs once)
```

---

## 7. Outputs → GitHub Secrets

After `terraform apply`, copy these values into the repo's **Settings → Secrets and variables → Actions**:

| Terraform output | GitHub secret name | Notes |
|---|---|---|
| `ec2_public_ip` | `EC2_HOST` | e.g. `54.218.10.42` |
| `ec2_user` | `EC2_USER` | always `ubuntu` |
| `ssh_private_key` | `EC2_SSH_KEY` | full PEM, including BEGIN/END lines |

Plus, set up these manually (not from Terraform):

| Secret | Where to get it |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub → Account Settings → Security → New Access Token |

Five secrets total.

---

## 8. Compose Change Required

Current `docker-compose.yml`:

```yaml
backend:
  build: ./backend
```

We swap it to:

```yaml
backend:
  image: ${DOCKERHUB_USERNAME}/skillpulse-backend:latest
```

`DOCKERHUB_USERNAME` is read from the `.env` file on the EC2 box (written by `user_data.sh.tpl`, see §6). So compose substitutes the username at `up` time.

For local dev, learners either set `DOCKERHUB_USERNAME` in their own `.env`, or they can temporarily flip the line back to `build: ./backend` while iterating on the backend.

---

## 9. End-to-End Deployment Flow

**One-time (instructor):**
1. `cd terraform && terraform init`
2. `terraform apply -var "repo_url=https://github.com/<USER>/<REPO>.git" -var "dockerhub_username=<USER>"`
3. Capture outputs → paste into GitHub secrets (5 secrets total)
4. Verify EC2 is reachable: `ssh -i skillpulse-key.pem ubuntu@<ip>` and `docker --version`

**Every push to `main` (automated):**
1. **`ci.yml`** runs:
   - checkout
   - login to Docker Hub
   - build + push `skillpulse-backend:latest` and `:${sha}`
2. **`cd.yml`** runs (triggered via `workflow_run` after `ci.yml` succeeds on `main`):
   - SSH into EC2
   - `cd ~/skillpulse && docker compose pull && docker compose up -d`
3. Refresh `http://<ec2-public-ip>` → new version live.

---

## 10. Cost Estimate (us-west-2)

| Resource | Monthly (approx) |
|---|---|
| t3.medium (730 hrs) | ~$30 |
| 20 GiB gp3 EBS | ~$1.60 |
| Data transfer | ~$1 (light traffic) |
| **Total running 24/7** | **~$33/mo** |
| **Total if stopped between sessions** | **~$2/mo** |

For a recording, run `terraform apply` → record → `terraform destroy`. Total cost: a few cents per session.

---

## 11. Decisions Locked

| Decision | Choice |
|---|---|
| AWS region | `us-west-2` (Oregon) |
| Instance type | `t3.medium` |
| AMI | Ubuntu 22.04 LTS (latest from Canonical) |
| Repo visibility | **Public** — user_data clones over HTTPS, no deploy key needed |
| Compose change | Backend service swapped to `image:` (read from `.env` on EC2) |
| CI/CD layout | **Split** — `ci.yml` builds & pushes; `cd.yml` triggered via `workflow_run` |
| Terraform run location | Local, one-time — not in a GitHub Actions workflow |
| Terraform state | Local file, gitignored |
| MySQL | Container on EC2 with a named volume (no RDS) |
| SSH ingress | `0.0.0.0/0` for course simplicity (callout to lock down in real use) |
| Domain / TLS | None — IP-only access |

Next up: write `terraform/*.tf`, `user_data.sh.tpl`, `.github/workflows/ci.yml`, `.github/workflows/cd.yml`, and then the chapter READMEs.
