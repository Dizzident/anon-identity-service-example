# CI/CD Pipeline Guide

## 🚀 GitHub Actions Workflows

This project uses GitHub Actions for continuous integration and deployment. All workflows are located in the `.github/workflows/` directory.

## 📊 Workflow Overview

### 1. **CI Workflow** (`ci.yml`)
**Triggers**: Push to main, Pull requests to main

#### Jobs:
- **Test Matrix**: Runs tests on Node.js 18 and 20
  - Linting with ESLint
  - TypeScript type checking
  - Unit tests with coverage reporting
  - Security audit
  - Build verification

- **Docker Build**: Validates Dockerfile and builds image
  - Dockerfile linting with hadolint
  - Multi-stage build test
  - Health check verification

- **Code Quality**: Additional quality checks
  - Dependency updates check
  - Bundle size analysis
  - Type coverage reporting

### 2. **Release Workflow** (`release.yml`)
**Triggers**: Git tags (v*)

- Creates GitHub releases automatically
- Builds and publishes Docker images to GitHub Container Registry
- Multi-platform support (linux/amd64, linux/arm64)
- Semantic versioning for Docker tags

### 3. **CodeQL Analysis** (`codeql.yml`)
**Triggers**: Push to main, Pull requests, Weekly schedule

- Security vulnerability scanning
- Code quality analysis
- JavaScript/TypeScript analysis
- Results published to Security tab

### 4. **Coverage Report** (`coverage.yml`)
**Triggers**: Pull requests to main

- Generates detailed coverage reports
- Posts coverage summary as PR comment
- Uploads coverage to Codecov (if configured)
- Enforces coverage thresholds

### 5. **NPM Publish** (`publish-npm.yml`)
**Triggers**: GitHub release created

- Publishes package to npm registry
- Publishes to GitHub Packages
- Includes provenance attestation

## 🔧 Setup Requirements

### Repository Secrets
Configure these secrets in your repository settings:

```yaml
NPM_TOKEN         # npm authentication token (optional)
CODECOV_TOKEN     # Codecov integration token (optional)
```

### Repository Settings
1. Enable "Allow GitHub Actions to create and approve pull requests"
2. Set up branch protection rules for `main`:
   - Require pull request reviews
   - Require status checks to pass
   - Require branches to be up to date

## 📋 Status Checks

The following checks must pass before merging:

- ✅ Test (18.x)
- ✅ Test (20.x)
- ✅ Docker Build
- ✅ Lint
- ✅ CodeQL
- ✅ All Checks Passed

## 🏷️ Release Process

1. **Create a Release**:
   ```bash
   # Update version in package.json
   npm version patch|minor|major
   
   # Push with tags
   git push origin main --tags
   ```

2. **Automated Steps**:
   - GitHub Release created with changelog
   - Docker images built and pushed
   - npm package published (if NPM_TOKEN configured)

3. **Docker Images**:
   ```bash
   # Latest version
   docker pull ghcr.io/dizzident/anon-identity-service-example:latest
   
   # Specific version
   docker pull ghcr.io/dizzident/anon-identity-service-example:1.0.0
   ```

## 🛡️ Security Features

### Dependency Management
- **Dependabot** automatically creates PRs for:
  - npm dependencies (weekly)
  - Docker base images (weekly)
  - GitHub Actions (weekly)

### Security Scanning
- **CodeQL** runs on every PR and weekly
- **npm audit** runs in CI pipeline
- **Dependency review** on PRs

## 📈 Monitoring

### Build Status
Check workflow runs at: `https://github.com/Dizzident/anon-identity-service-example/actions`

### Coverage Reports
- View in PR comments
- HTML reports in workflow artifacts
- Codecov dashboard (if configured)

### Performance Metrics
- Bundle size tracked in CI
- Build times visible in Actions tab
- Test execution time per Node version

## 🔍 Troubleshooting

### Common Issues

1. **Coverage Threshold Failure**:
   ```bash
   # Run coverage locally
   npm run test:coverage
   ```

2. **TypeScript Errors**:
   ```bash
   # Check types locally
   npm run build
   ```

3. **Linting Failures**:
   ```bash
   # Fix automatically
   npm run lint:fix
   ```

4. **Docker Build Failures**:
   ```bash
   # Test locally
   docker build -t test .
   ```

### Debugging Workflows

1. Enable debug logging:
   - Add secret: `ACTIONS_STEP_DEBUG` = `true`
   - Add secret: `ACTIONS_RUNNER_DEBUG` = `true`

2. Download artifacts:
   - Go to workflow run
   - Click "Artifacts" section
   - Download logs and reports

## 🚦 Best Practices

1. **Before Creating PR**:
   - Run `npm test` locally
   - Run `npm run lint`
   - Run `npm run build`
   - Update tests for new features

2. **Commit Messages**:
   - Use conventional commits
   - Examples: `feat:`, `fix:`, `docs:`, `test:`

3. **PR Guidelines**:
   - Fill out PR template completely
   - Link related issues
   - Add screenshots if UI changes

4. **Dependencies**:
   - Review Dependabot PRs promptly
   - Test thoroughly after updates
   - Check for breaking changes

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Dockerfile Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)