# Recommended Additional Dependencies for CI/CD

To get the most out of the GitHub Actions workflows, consider adding these development dependencies:

## Install for Local Testing

```bash
# Install linting tools
pip install flake8 black isort pylint

# Install security tools
pip install bandit safety

# Install coverage tools
pip install pytest-cov coverage

# Install all at once
pip install flake8 black isort pylint bandit safety pytest-cov coverage
```

## Or Update requirements.txt

Add to `requirements.txt`:

```
# Development & Testing
pytest==7.4.3
pytest-asyncio==0.21.1
pytest-cov==4.1.0
testcontainers==3.7.1

# Linting & Formatting
flake8==6.1.0
black==23.12.0
isort==5.13.2
pylint==3.0.3

# Security
bandit==1.7.5
safety==2.3.5

# Code coverage
coverage==7.3.2
```

## What Each Tool Does

| Tool | Purpose | Cost |
|------|---------|------|
| **flake8** | Python style guide enforcement | Light |
| **black** | Automatic code formatting | Light |
| **isort** | Import statement organization | Light |
| **pylint** | Advanced code analysis | Medium |
| **bandit** | Security vulnerability scanner | Light |
| **safety** | Dependency vulnerability checker | Light |
| **pytest-cov** | Code coverage reporting | Light |

## Command Reference

```bash
# Run tests locally
pytest tests/ -v

# Check code style
flake8 src tests

# Auto-format code
black src tests

# Organize imports
isort src tests

# Security scan
bandit -r src

# Check dependencies
safety check

# Generate coverage report
pytest tests/ --cov=src --cov-report=html
```

## Next Steps

1. Update `requirements.txt` with dev tools
2. Run workflows locally: `pytest tests/` 
3. Commit your code and push to test GitHub Actions
4. Monitor workflow runs in the Actions tab
