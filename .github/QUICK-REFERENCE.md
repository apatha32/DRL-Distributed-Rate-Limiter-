# GitHub Actions Quick Reference

## 📁 File Structure

```
.github/
├── workflows/
│   ├── test.yml              # Unit & integration tests
│   ├── lint.yml              # Code quality checks
│   ├── docker-build.yml      # Build & push Docker images
│   ├── load-test.yml         # Performance benchmarks
│   └── security.yml          # Security vulnerability scans
├── CI-CD-SETUP.md            # Comprehensive setup guide
├── BADGES.md                 # Status badges for README
├── DEV-DEPENDENCIES.md       # Dev tools & dependencies
└── QUICK-REFERENCE.md        # This file
```

## 🚀 Getting Started

### 1. Push to main branch
```bash
git add .github/
git commit -m "Add GitHub Actions CI/CD workflows"
git push origin main
```

### 2. Go to Actions tab
https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/actions

### 3. Watch workflows run
All workflows will trigger automatically on push/PR.

---

## 📊 Workflow Triggers at a Glance

| Workflow | Push main | Push develop | PR | Tag | Schedule |
|----------|-----------|--------------|----|----|----------|
| Tests | ✅ | ✅ | ✅ | - | - |
| Lint | ✅ | ✅ | ✅ | - | - |
| Docker Build | ✅ | - | ✅ | ✅ | - |
| Load Test | ✅ | - | - | - | Daily 2AM |
| Security | ✅ | ✅ | ✅ | - | Daily 3AM |

---

## 🔑 Key Secrets & Configuration

### GitHub Tokens (Automatic)
- `${{ secrets.GITHUB_TOKEN }}` - Auto-provided for Docker pushes
  - No setup needed!
  - Expires after workflow completes

### Optional Custom Secrets

To add manual secrets (e.g., DockerHub, Slack):

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add secret name and value
4. Reference in workflows: `${{ secrets.SECRET_NAME }}`

**Example: Slack notifications**
```yaml
- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 🎯 Common Tasks

### Monitor a specific workflow
```bash
gh run list --workflow=test.yml
```

### Re-run a failed workflow
```bash
gh run rerun <run-id>
```

### View workflow logs
```bash
gh run view <run-id> --log
```

### Download artifacts
```bash
gh run download <run-id> --name load-test-results
```

### Manually trigger a workflow
```bash
# Create a tag to trigger Docker build
git tag v1.0.0
git push origin v1.0.0

# Or push to main
git push origin main
```

---

## 🔧 Common Modifications

### Change Python version
**File:** `.github/workflows/test.yml`
```yaml
strategy:
  matrix:
    python-version: ['3.11', '3.12']  # Add 3.12
```

### Add test coverage threshold
**File:** `.github/workflows/test.yml`
```yaml
- name: Check coverage
  run: pytest --cov=src --cov-fail-under=80
```

### Skip a workflow for a commit
```bash
git commit -m "Fix typo [skip ci]"  # Skips all workflows
```

### Run workflow only on specific files changed
**File:** `.github/workflows/test.yml`
```yaml
on:
  push:
    paths:
      - 'src/**'
      - 'tests/**'
      - 'requirements.txt'
```

### Add Docker registry other than GHCR
**File:** `.github/workflows/docker-build.yml`
```yaml
- name: Login to DockerHub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}
    password: ${{ secrets.DOCKERHUB_TOKEN }}
```

---

## ⚡ Performance Tips

### Speed up tests
```yaml
# In test.yml
- name: Set up Python
  uses: actions/setup-python@v4
  with:
    python-version: '3.11'
    cache: 'pip'  # Cache pip dependencies
```

### Cache Docker layers
```yaml
# In docker-build.yml - already enabled!
cache-from: type=gha
cache-to: type=gha,mode=max
```

### Run tests in parallel (if possible)
```yaml
- name: Run tests
  run: pytest tests/ -n auto  # Requires pytest-xdist
```

---

## 🐛 Troubleshooting

### Workflow not triggering?

**Check:**
- Branch name matches `main` or `develop`
- File syntax is valid: `yamllint .github/workflows/`
- Branch protection rules not blocking
- Workflows are enabled: Settings → Actions → General

**Fix:**
```bash
# Test YAML syntax
yamllint .github/workflows/test.yml

# Or use online tool: https://www.yamllint.com/
```

### Tests pass locally but fail in CI?

**Common causes:**
- Missing environment variables → Check `env:` in workflow
- Port conflicts → CI uses isolated containers (shouldn't be an issue)
- Flaky tests → Use `-vv` flag for verbose output
- Service startup delays → Increase timeout/retry count

**Debug:**
```bash
# Run test with more verbose output
pytest tests/ -vv -s --tb=long

# Check service health
docker ps
docker logs <container-id>
```

### Docker push fails

**Check:**
- Workflow has `push: true` condition
- Running on `main` branch or version tag
- Token has write permissions
- Repository is public or Docker settings configured

**Fix:**
```yaml
push: ${{ github.event_name != 'pull_request' && 
          (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/')) }}
```

### Out of disk space in runner

**Solution:** Clear Docker cache in workflow
```yaml
- name: Free disk space
  run: |
    docker system prune -af
    rm -rf /usr/local/lib/android  # Optional
```

---

## 📚 Next Steps

1. ✅ Push workflow files to repo
2. ✅ Monitor first workflow run in Actions tab
3. ⬜ Add status badges to main README
4. ⬜ Configure branch protection rules (Settings → Branches)
5. ⬜ Set up notifications (Slack/Discord/Email)
6. ⬜ Configure code coverage tracking (Codecov)
7. ⬜ Add deployment workflow (when ready)

---

## 🔗 Useful Links

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [GitHub CLI](https://cli.github.com/)
- [Docker on GitHub Actions](https://docs.docker.com/build/ci/github-actions/)
- [Pytest Documentation](https://docs.pytest.org/)
- [YAML Validation](https://www.yamllint.com/)

---

## 💡 Pro Tips

✨ **Use workflow_dispatch** to manually trigger workflows:
```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'staging'
```

✨ **Use concurrency** to cancel old runs:
```yaml
concurrency:
  group: ${{ github.ref }}
  cancel-in-progress: true
```

✨ **Use conditional steps** for complex logic:
```yaml
- name: Run only on main
  if: github.ref == 'refs/heads/main'
  run: echo "Running on main branch"
```

✨ **Save artifacts** for later inspection:
```yaml
- uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: test-results.xml
    retention-days: 30
```
