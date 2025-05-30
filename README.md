# Anonymous Identity Service Example

![CI](https://github.com/Dizzident/anon-identity-service-example/workflows/CI/badge.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![License](https://img.shields.io/badge/license-ISC-blue)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![Coverage](https://img.shields.io/badge/coverage-check-yellow)

A Node.js web server that demonstrates enterprise-grade verification of W3C Verifiable Credentials and Presentations using the `anon-identity` npm package v1.0.5. This service showcases advanced features including session management, batch processing, structured presentation requests, and comprehensive error handling.

## 🎯 Purpose

This example service demonstrates:
- How to verify W3C Verifiable Credentials and Presentations
- Selective disclosure of credential attributes
- DID-based authentication and authorization
- Real-time credential revocation checking
- Standards-compliant decentralized identity implementation

## 📋 Requirements

- Node.js 18+
- Redis (for session and DID document caching)
- `anon-identity` npm package v1.0.5+

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/example/anon-identity-service-example.git
cd anon-identity-service-example

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start Redis (using Docker)
docker-compose up -d redis

# Run the development server
npm run dev
```

## 🏗️ Architecture

The service is built with:
- **Express.js** - Web framework
- **TypeScript** - Type safety and better developer experience
- **Redis** - Session and revocation list storage
- **Socket.io** - Real-time revocation notifications
- **Jest** - Testing framework

## 📚 Documentation

- [Development Plan](./DEVELOPMENT_PLAN.md) - Comprehensive development roadmap
- [Project Structure](./PROJECT_STRUCTURE.md) - Detailed implementation guide
- [anon-identity Requirements](./ANON_IDENTITY_REQUIREMENTS.md) - Required features for the npm package
- [API Documentation](./docs/API.md) - Complete API reference
- [Integration Guide](./docs/INTEGRATION.md) - How to integrate with your service

## 🔑 Key Features

### 1. Enterprise Session Management
Built-in session lifecycle with automatic cleanup:
```javascript
const session = await serviceProvider.createSession({
  holderDID: result.holderDID,
  credentialIds: result.credentialIds,
  attributes: result.disclosedAttributes,
  expiresIn: 3600,
  metadata: { endpoint: '/profile' }
});
```

### 2. High-Performance Batch Processing
Concurrent verification for scalability:
```javascript
const batchResults = await serviceProvider.batchVerifyPresentations(
  presentations,
  { maxConcurrency: 10, timeoutMs: 15000 }
);
```

### 3. Structured Presentation Requests
Advanced attribute constraints and validation:
```javascript
const request = await serviceProvider.createPresentationRequest({
  credentialTypes: ['BasicProfileCredential'],
  attributeConstraints: [
    {
      name: 'age',
      required: true,
      minValue: 18,
      maxValue: 120
    },
    {
      name: 'country',
      required: true,
      allowedValues: ['US', 'CA', 'UK']
    }
  ]
});
```

### 4. Comprehensive Error Handling
Detailed error categorization and context:
```javascript
if (!result.isValid) {
  result.errors.forEach(error => {
    console.log(`${error.code}: ${error.message}`);
    console.log('Context:', error.context);
  });
}
```

## 🛡️ Security Features

- Ed25519 cryptographic signature verification
- DID document validation and resolution
- Session-based authentication with automatic expiry
- Batch processing with timeout protection
- Structured attribute constraints and validation
- Rate limiting on verification endpoints
- No storage of personal data
- Real-time revocation checking
- Replay attack protection with challenges
- Comprehensive audit logging with error context

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## 🐳 Docker Deployment

```bash
# Build and run with Docker
docker-compose up

# Or build manually
docker build -t anon-identity-service .
docker run -p 3000:3000 anon-identity-service
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/presentation/request` | Create structured presentation request |
| GET | `/service/requirements` | Get required credentials and attributes |
| POST | `/auth/verify-presentation` | Verify a single Verifiable Presentation |
| POST | `/auth/batch-verify` | Batch verify multiple presentations |
| POST | `/auth/batch-revocation` | Batch check revocation status |
| POST | `/session/create` | Create session from verified presentation |
| GET | `/session/:id/validate` | Validate existing session |
| POST | `/session/:id/extend` | Extend session expiry |
| DELETE | `/session/:id` | Invalidate session |
| GET | `/analytics/batch-stats` | Get batch processing statistics |
| GET | `/profile` | Protected endpoint requiring valid session |
| WS | `/updates` | WebSocket for real-time credential updates |

## 🤝 Contributing

This is an example project designed to demonstrate best practices. Feel free to:
- Report issues
- Suggest improvements
- Submit pull requests
- Use as a template for your own services

## 📄 License

MIT License - See [LICENSE](./LICENSE) file for details

## 🔗 Related Projects

- [anon-identity](https://npmjs.com/package/anon-identity) - W3C DID and Verifiable Credentials library
- [W3C DID Specification](https://www.w3.org/TR/did-core/) - Decentralized Identifiers standard
- [W3C VC Data Model](https://www.w3.org/TR/vc-data-model/) - Verifiable Credentials standard

## 🆘 Support

- [Documentation](./docs)
- [GitHub Issues](https://github.com/example/anon-identity-service-example/issues)
- [Discord Community](https://discord.gg/example)

---

Built with ❤️ to demonstrate privacy-preserving authentication