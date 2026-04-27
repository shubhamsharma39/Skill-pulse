# GitHub Actions Masterclass

## Project Overview

- **Course**: GitHub Actions Masterclass
- **Creator**: Shubham Londhe (TrainWithShubham)
- **Audience**: Absolute beginners. Assumes Git/GitHub basics. No prior CI/CD experience.
- **Goal**: By the end, a learner can push code to GitHub and have it auto-build a Docker image, push it to Docker Hub, and deploy to an EC2 instance.
- **Style**: Super lean. Two workflows only. No advanced patterns (no matrix, no reusable workflows, no OIDC, no self-hosted runners). Concepts are introduced only when the next workflow needs them.

## Sample Project: SkillPulse

A personal **Skill Tracker / Learning Dashboard** — Go (Gin) backend + MySQL + Nginx + vanilla HTML/CSS/JS frontend, all wired up with Docker Compose. The app is already in `skillpulse/` — the course doesn't teach the app, it teaches how to ship it.

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | HTML/CSS/JS (vanilla) |
| Backend | Go (Gin framework) |
| Database | MySQL 8.0 |
| Web Server | Nginx (reverse proxy + static) |
| Containers | Docker + Docker Compose |
| **CI/CD** | **GitHub Actions** |
| **Registry** | **Docker Hub** |
| **Infrastructure** | **Terraform** (one-time, run locally by instructor) |
| **Deployment target** | **AWS EC2 t3.medium (Ubuntu, us-west-2)** via SSH |

## Course Structure (5 Chapters)

### Chapter 1: GitHub Actions in 10 Minutes (10-15 min)
- What is CI/CD? Why automate?
- What is GitHub Actions? Workflows, jobs, steps — that's it for now
- The `.github/workflows/` folder
- Free tier basics (don't dwell)
- **Hands-on**: Push SkillPulse to a GitHub repo. Write a one-step `hello.yml` that prints `echo "Hello Actions"` on every push. See it run in the Actions tab.

### Chapter 2: Your First Real Workflow — Triggers & Secrets (10-15 min)
- `on: push` to main
- Repository **secrets** (where they live, how to add them)
- The `secrets.*` context
- **Hands-on**: Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` as repo secrets (we'll use them in Ch 3).

### Chapter 3: ci.yml — Build & Push to Docker Hub (20-25 min)
- The CI mindset: every push → fresh image
- `actions/checkout@v4`
- `docker/login-action@v3` with Docker Hub creds
- `docker/build-push-action@v5`
- Image tag = `${{ github.sha }}` (and `latest` for main)
- **Hands-on**: Write `ci.yml`. Push code. Watch the image appear on Docker Hub.

```yaml
# .github/workflows/ci.yml — what learners will end up with
name: CI

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: docker/login-action@v4
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - uses: docker/build-push-action@v7
        with:
          context: ./backend
          push: true
          tags: |
            ${{ secrets.DOCKERHUB_USERNAME }}/skillpulse-backend:${{ github.sha }}
            ${{ secrets.DOCKERHUB_USERNAME }}/skillpulse-backend:latest
```

### Chapter 4: Provisioning the Server with Terraform (15-20 min)
- Why Terraform? Reproducible, version-controlled infra — one command spins up the whole box
- The `terraform/` folder: `main.tf`, `variables.tf`, `outputs.tf`, `user_data.sh.tpl`
- Resources: `aws_instance` (t3.medium Ubuntu 22.04 in us-west-2), `aws_security_group`, `tls_private_key` + `aws_key_pair`
- `user_data.sh.tpl` installs Docker + Compose, clones the public repo, writes `.env`
- Outputs: `ec2_public_ip`, `ec2_user`, `ssh_private_key` (sensitive)
- **Hands-on**: `terraform init && terraform apply -var "repo_url=..." -var "dockerhub_username=..."`. Capture outputs into 5 GitHub secrets (`EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` from Terraform; `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` manually). SSH in to verify.

> Full plan in `Deployment.md`. Terraform runs locally, once — it's instructor-side prep, not part of the GitHub Actions workflow learners write.

### Chapter 5: cd.yml — Deploy via SSH (20-25 min)
- The CD mindset: after CI succeeds, ship to the server
- `needs:` to chain jobs
- SSH secrets: `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`
- `appleboy/ssh-action@v1` to run remote commands
- On the server: `docker compose pull && docker compose up -d`
- **Hands-on**: Write `cd.yml` (or extend `ci.yml` with a `deploy` job). Push code → image builds → EC2 pulls and restarts. Refresh the browser.

```yaml
# .github/workflows/cd.yml — what learners will end up with
name: CD

on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd ~/skillpulse
            docker compose pull
            docker compose up -d
```

> Course uses the **split** layout above (two files, `cd.yml` triggered via `workflow_run`). It's how real teams separate concerns — and it's a teachable moment for `workflow_run` as a trigger.

## What This Course Deliberately Skips

To keep it lean for beginners, **do not** introduce these unless the user explicitly asks:
- Matrix builds
- Reusable workflows / composite actions
- Self-hosted runners
- OIDC / federated cloud credentials
- CodeQL / Dependabot / advanced security
- Multi-arch builds, buildx cache tuning
- Environments with manual approvals
- GHCR (we use Docker Hub — more familiar to beginners)
- Concurrency groups
- Job summaries / artifacts

If a learner asks "why not X?", the answer is "later — first ship the simple version."

## Repository Structure

```
github-actions-masterclass/
├── CLAUDE.md                        # This file
├── README.md                        # Course overview (TBD)
├── chapters/
│   ├── 01-intro/README.md
│   ├── 02-triggers-secrets/README.md
│   ├── 03-ci-build-push/README.md
│   ├── 04-terraform-ec2/README.md
│   └── 05-cd-ssh-deploy/README.md
├── docker-compose.yml               # backend service uses image: (see §8 of Deployment.md)
├── .env.example
├── backend/                         # Go + Gin REST API
├── frontend/                        # HTML/CSS/JS
├── nginx/                           # Reverse proxy config
├── mysql/                           # init.sql
├── terraform/                       # One-time infra (Ch 4)
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── user_data.sh.tpl
│   └── .gitignore
├── Deployment.md                    # End-to-end deployment plan
└── .github/
    └── workflows/
        ├── ci.yml                   # Build & push (Ch 3)
        └── cd.yml                   # SSH deploy via workflow_run (Ch 5)
```

## Conventions & Guidelines

### Writing Style
- **Tone**: Encouraging, plain language, "you can do this."
- **Level**: Assume zero CI/CD experience. Define every term the first time.
- **Every chapter README**: prerequisites at top, full YAML file (never snippets), screenshots/placeholders for the GitHub UI, "what could go wrong" troubleshooting at the bottom.
- **No jargon dumps.** Introduce a concept only when the next step needs it.

### Code Conventions
- YAML: 2-space indentation
- Action versions (current as of 2026-04): `actions/checkout@v6`, `docker/login-action@v4`, `docker/build-push-action@v7`, `appleboy/ssh-action@v1`. Pin to major; SHA pinning is a security topic for a later course.
- Always show the **full** workflow file, not partial diffs
- Secrets: never echo, never commit, always reference via `${{ secrets.* }}`
- Docker Hub image name: `<dockerhub-username>/skillpulse-backend`

### Required Secrets (full list for the course)

| Secret | Used in | Purpose |
|--------|---------|---------|
| `DOCKERHUB_USERNAME` | ci.yml | Docker Hub login |
| `DOCKERHUB_TOKEN` | ci.yml | Docker Hub access token (not password) |
| `EC2_HOST` | cd.yml | Public IP / DNS of the EC2 instance |
| `EC2_USER` | cd.yml | Usually `ubuntu` |
| `EC2_SSH_KEY` | cd.yml | Private key contents (the `.pem` file body) |

### EC2 Setup (Chapter 4 — Terraform-managed)

Everything below is handled by `terraform/user_data.sh.tpl`. Learners don't run any of it by hand. See `Deployment.md` for the full plan.

- Region: `us-west-2`, AMI: latest Ubuntu 22.04 LTS, instance: `t3.medium`, root volume: 20 GiB
- Security group: ingress 22 (`0.0.0.0/0` for course; lock down in real use) + 80 (`0.0.0.0/0`)
- SSH keypair generated by Terraform (`tls_private_key`), private key surfaced as a sensitive output
- user_data installs Docker + Compose plugin, clones the public repo into `/home/ubuntu/skillpulse`, writes `.env` with `DOCKERHUB_USERNAME` injected by Terraform
- Compose change: backend service uses `image: ${DOCKERHUB_USERNAME}/skillpulse-backend:latest` (not `build:`)
- The CD workflow assumes `~/skillpulse` exists with `docker-compose.yml` and `.env` already in place. Each deploy: `docker compose pull && docker compose up -d`.

## Key GitHub Actions Concepts Covered (and ONLY these)

1. Workflows, jobs, steps
2. The `on:` trigger (push to main)
3. `runs-on: ubuntu-latest`
4. `uses:` (pre-built actions) vs `run:` (shell commands)
5. Repository secrets and the `secrets.*` context
6. `needs:` for job ordering
7. `actions/checkout`, `docker/login-action`, `docker/build-push-action`, `appleboy/ssh-action`

That's the whole vocabulary for the course.
