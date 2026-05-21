# GitHub Actions Badges

Add these badges to your main `README.md` to display CI/CD status:

## Basic Status Badges

```markdown
# DRL - Distributed Rate Limiter

![Tests](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Tests/badge.svg?branch=main)
![Lint](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Lint%20&%20Code%20Quality/badge.svg?branch=main)
![Docker](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Docker%20Build%20&%20Push/badge.svg?branch=main)
![Security](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Security%20Checks/badge.svg?branch=main)
```

## Step-by-Step Badge Integration

1. Replace `YOUR_USERNAME` with your GitHub username
2. Paste into your README.md under the project title
3. Commit and push - GitHub will render the badges

## Customization

### Link badges to Actions page
```markdown
[![Tests](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Tests/badge.svg?branch=main)](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/actions/workflows/test.yml)
```

### Show specific branch
```markdown
![Tests](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Tests/badge.svg?branch=develop)
```

### Example section for README

```markdown
## Status & Quality

| Check | Status |
|-------|--------|
| **Tests** | ![Tests](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Tests/badge.svg?branch=main) |
| **Code Quality** | ![Lint](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Lint%20&%20Code%20Quality/badge.svg?branch=main) |
| **Security** | ![Security](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Security%20Checks/badge.svg?branch=main) |
| **Docker Build** | ![Docker](https://github.com/YOUR_USERNAME/DRL-Distributed-Rate-Limiter-/workflows/Docker%20Build%20&%20Push/badge.svg?branch=main) |
```

## Verify Badge URLs

After pushing, verify badges work:
1. Go to **Actions** tab on GitHub
2. Click any workflow on the left sidebar
3. Select a run to see the current status
4. The badge URL follows this pattern: `https://github.com/OWNER/REPO/workflows/WORKFLOW_NAME/badge.svg`

Need help? See [GitHub Actions Badges Documentation](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/adding-a-workflow-status-badge)
