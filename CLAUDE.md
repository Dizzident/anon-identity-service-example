# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an example Node.js service that demonstrates how to verify W3C Verifiable Credentials and Presentations using the `anon-identity` npm package. The service acts as a verifier/service provider in a decentralized identity ecosystem.

## Key Technologies

- **anon-identity**: W3C DID and Verifiable Credentials library (v1.0.5) with enterprise features
- **Express.js**: Web server framework
- **TypeScript**: Type-safe development
- **Redis**: Caching for DID documents and sessions
- **Socket.io**: Real-time credential status updates

## Architecture

The service implements the enhanced Service Provider pattern from anon-identity v1.0.5:
1. **ServiceProvider**: Verifies presentations, manages sessions, handles batch operations
2. **SessionManager**: Built-in session lifecycle with automatic cleanup
3. **BatchOperations**: High-performance concurrent verification and revocation checking
4. **PresentationRequest**: Structured credential requirements with attribute constraints
5. **UserWallet**: (Client-side) Creates selective disclosure presentations
6. **IdentityProvider**: (External) Issues verifiable credentials

## Common Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

## Key Files to Understand

- `src/services/service-provider.service.ts` - Enhanced verification with v1.0.5 features
- `src/services/session.service.ts` - Built-in session management integration
- `src/services/batch.service.ts` - Batch verification and performance optimization
- `src/services/presentation-request.service.ts` - Structured presentation requests
- `src/config/service.config.ts` - Advanced service configuration with constraints
- `src/controllers/verification.controller.ts` - Enterprise API endpoints
- `PROJECT_STRUCTURE.md` - Detailed implementation guide for v1.0.5
- `ANON_IDENTITY_ENHANCEMENTS.md` - Future package improvements

## Development Workflow

1. Services create structured presentation requests with attribute constraints
2. Users create selective disclosure presentations matching the requirements
3. Service verifies presentations against structured requests (single or batch)
4. Built-in session management creates and manages user sessions
5. Comprehensive error handling provides detailed verification context
6. Real-time updates notify of credential revocations
7. Analytics track batch processing performance and statistics