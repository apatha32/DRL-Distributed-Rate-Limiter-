# GitHub Actions CI/CD Setup

This repository includes comprehensive CI/CD workflows to ensure code quality, security, and reliability. Below is an overview of each workflow.

## 📋 Workflows Overview

### 1. **Tests** (`.github/workflows/test.yml`)
**Triggers:** Push to `main`/`develop`, Pull Requests

Runs the complete test suite in an isolated environment with real services:
- **Services:** Redis, PostgreSQL, Jaeger (Docker services)
- **Tests:**
  - Unit tests (`tests/test_algorithms.py`)
  - Integration tests (`tests/test_integration.py`)
- **Python:** 3.11
- **Uploads:** Coverage reports to Codecov (if configured)

**Status badge for README:**
```markdown
![Tests](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Tests/badge.svg)
```

---

### 2. **Lint & Code Quality** (`.github/workflows/lint.yml`)
**Triggers:** Push to `main`/`develop`, Pull Requests

Ensures consistent code style and quality:
- **flake8** - Python linting (syntax errors, undefined names)
- **black** - Code formatting checks
- **isort** - Import sorting checks
- **pylint** - Advanced code analysis

Non-blocking warnings help maintain code standards.

**Status badge for README:**
```markdown
![Lint & Code Quality](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Lint%20&%20Code%20Quality/badge.svg)
```

---

### 3. **Docker Build & Push** (`.github/workflows/docker-build.yml`)
**Triggers:** Push to `main`, Tags (`v*`), Pull Requests

Builds and publishes Docker images to GitHub Container Registry (GHCR):
- **Automatic push** to GHCR on `main` branch and tags
- **PR preview** - builds without pushing
- **Tags generated:**
  - Branch name (e.g., `main`, `develop`)
  - Semantic version (e.g., `v1.0.0`, `1.0`, `1`)
  - Git SHA
  - `latest` for main branch
- **Docker buildx** - Multi-platform builds support
- **Caching** - GitHub Actions cache for faster builds

**Using the image:**
```bash
# Pull the latest image
docker pull ghcr.io/YOUR_USERNAME/drl-distributed-rate-limiter-:latest

# Run the container
docker run -p 8000:8000 ghcr.io/YOUR_USERNAME/drl-distributed-rate-limiter-:latest
```

**Status badge for README:**
```markdown
![Docker Build & Push](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Docker%20Build%20&%20Push/badge.svg)
```

---

### 4. **Load Testing** (`.github/workflows/load-test.yml`)
**Triggers:** Push to `main`, Scheduled (daily at 2 AM UTC)

Runs performance benchmarks against the application:
- **Services:** Redis, PostgreSQL
- **Tests:** Locust load tests (`tests/load_test.py`)
- **Environment:** Isolated FastAPI server started for each run
- **Artifacts:** Load test results uploaded for 30 days

Useful for detecting performance regressions.

**Status badge for README:**
```markdown
![Load Testing](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Load%20Testing/badge.svg)
```

---

### 5. **Security Checks** (`.github/workflows/security.yml`)
**Triggers:** Push to `main`/`develop`, Pull Requests, Scheduled (daily at 3 AM UTC)

Identifies security vulnerabilities and dependency issues:
- **Bandit** - Scans for common security issues in Python code
- **Safety** - Checks dependencies against known vulnerabilities
- **PR Comments** - Posts security issues directly on PRs
- **Artifacts:** Security reports saved for 30 days

**Status badge for README:**
```markdown
![Security Checks](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Security%20Checks/badge.svg)
```

---

## 🚀 Quick Setup

### 1. **Enable GitHub Actions**
Actions are enabled by default. Verify in your repo:
- Go to **Settings** → **Actions** → **General**
- Ensure "Allow all actions and reusable workflows" is selected

### 2. **Set Up Container Registry Access** (Optional but Recommended)
For Docker pushes to work:
1. Go to **Settings** → **Actions** → **Runners** → **General**
2. Ensure "Read and write permissions" is enabled
3. The workflows use `${{ secrets.GITHUB_TOKEN }}` automatically

### 3. **Add Status Badges to README**
Update your main `README.md`:
```markdown
## CI/CD Status

![Tests](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Tests/badge.svg)
![Lint & Code Quality](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Lint%20&%20Code%20Quality/badge.svg)
![Docker Build & Push](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Docker%20Build%20&%20Push/badge.svg)
![Load Testing](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Load%20Testing/badge.svg)
![Security Checks](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Security%20Checks/badge.svg)
```

### 4. **Configure Codecov** (Optional)
For code coverage tracking:
1. Go to [codecov.io](https://codecov.io)
2. Sign in with GitHub and enable this repo
3. Add coverage reporting to your tests:
   ```bash
   pip install pytest-cov
   pytest --cov=src --cov-report=xml
   ```

---

## 📊 Workflow Dependencies

```
Pull Request / Push
    ├── Tests (blocks merge if fails)
    ├── Lint & Code Quality (non-blocking)
    ├── Security Checks (blocks merge if fails)
    └── Docker Build & Push (only on main/tags)
```

---

## 🔧 Customization

### Modify Test Matrix
Edit `.github/workflows/test.yml` to test multiple Python versions:
```yaml
matrix:
  python-version: ['3.10', '3.11', '3.12']
```

### Change Schedule
Modify cron expressions for load tests and security checks:
```yaml
schedule:
  - cron: '0 2 * * *'  # 2 AM UTC daily
```

### Add Notifications
Use third-party actions to notify Slack, Discord, etc. on failures:
```yaml
- name: Notify Slack on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
```

### Disable Workflows
Create `.github/workflows/.disabled` or delete the YAML file.

---

## 📚 Useful Commands

### View workflow runs
```bash
# List recent runs
gh run list

# View specific workflow
gh run view <run-id>

# Download logs
gh run download <run-id>
```

### Trigger workflow manually
```bash
# Create a release tag (triggers docker-build.yml)
git tag v1.0.0
git push origin v1.0.0
```

---

## ❓ Troubleshooting

### Workflow not running?
- Check branch protection rules (Settings → Branches)
- Verify workflow file syntax (run `yamllint .github/workflows/*.yml`)
- Check Action logs for error messages

### Tests failing in CI but passing locally?
- Environment variables not set (check `env:` sections)
- Port conflicts (CI uses clean containers)
- Race conditions with services startup

### Docker push failing?
- Verify `secrets.GITHUB_TOKEN` has write permissions
- Check repository visibility (private repos need special config)

---

## 📖 References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Buildx](https://docs.docker.com/buildx/working-with-buildx/)
- [Pytest Documentation](https://docs.pytest.org/)
- [Bandit Security Linter](https://bandit.readthedocs.io/)
