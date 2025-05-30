# Examples

This directory contains example implementations demonstrating how to use the Anonymous Identity Service.

## Available Examples

### 1. Client Example (`client-example.ts`)

A comprehensive example showing the full client-side workflow:

- Creating user wallets and credentials
- Getting service requirements
- Creating selective disclosure presentations
- Verifying presentations and managing sessions
- Accessing protected resources
- Real-time WebSocket monitoring

**Run the example:**
```bash
npm run build
node dist/examples/client-example.js
```

### 2. Batch Processing Example (`batch-example.ts`)

Demonstrates high-performance batch operations:

- Creating multiple user credentials
- Batch presentation verification
- Batch revocation checking
- Performance scaling analysis
- Statistics and monitoring

**Run the example:**
```bash
npm run build
node dist/examples/batch-example.js
```

## Prerequisites

Before running the examples, make sure:

1. **Service is running:**
   ```bash
   npm run dev
   # or
   npm run build && npm start
   ```

2. **Redis is available (optional but recommended):**
   ```bash
   docker run -d -p 6379:6379 redis:alpine
   # or
   docker-compose up -d redis
   ```

## Example Flow

Here's what happens in the client example:

```
🔧 Initialize identity components
   ├── Create user wallet with Ed25519 keys
   ├── Create identity provider for issuing credentials
   └── Generate DIDs for user and issuer

📋 Create user credential
   ├── Define user attributes (age, country, subscription, etc.)
   ├── Issue verifiable credential
   └── Store in user wallet

📡 Setup WebSocket monitoring
   ├── Connect to service WebSocket
   ├── Subscribe to credential status updates
   └── Subscribe to session updates

🔍 Get service requirements
   ├── Query /service/requirements?endpoint=/profile
   ├── Receive required credential types and attributes
   └── Get challenge for replay protection

🎭 Create selective disclosure presentation
   ├── Select only required attributes to disclose
   ├── Create cryptographic proof
   └── Include challenge for security

🔐 Verify presentation and create session
   ├── Submit presentation to /auth/verify-presentation
   ├── Service validates signatures and requirements
   ├── Session created with verified attributes
   └── Receive session ID for subsequent requests

🔒 Access protected resources
   ├── Use session ID as Bearer token
   ├── Access /profile endpoint
   ├── Try /profile/premium (may require additional attributes)
   └── Get activity summary

📢 Real-time monitoring
   ├── Receive credential status updates via WebSocket
   ├── Get notified of session expiration
   └── Monitor revocation events
```

## Integration Tips

### For Wallet Developers

1. **Store credentials securely:** Use encrypted storage with user passphrases
2. **Implement selective disclosure:** Only share required attributes
3. **Monitor credential status:** Subscribe to WebSocket updates
4. **Handle revocation gracefully:** Update UI when credentials are revoked

### For Service Providers

1. **Define clear requirements:** Specify exactly what attributes you need
2. **Use structured requests:** Leverage attribute constraints for validation
3. **Implement session management:** Use the built-in session system
4. **Monitor performance:** Use batch operations for high throughput

### For Identity Providers

1. **Issue standards-compliant credentials:** Follow W3C VC specification
2. **Implement revocation:** Provide signed revocation lists
3. **Support selective disclosure:** Enable privacy-preserving presentations
4. **Maintain security:** Use proper key management and rotation

## Error Handling

The examples include comprehensive error handling:

```typescript
try {
  const result = await serviceProvider.verifyPresentation(presentation, endpoint);
  // Handle success
} catch (error) {
  if (error instanceof InvalidPresentationError) {
    // Handle verification errors
  } else if (error instanceof SessionExpiredError) {
    // Handle session expiration
  } else {
    // Handle other errors
  }
}
```

## Production Considerations

When adapting these examples for production:

1. **Security:**
   - Use hardware security modules (HSMs) for key storage
   - Implement proper key rotation
   - Use secure communication (HTTPS/WSS)

2. **Performance:**
   - Use batch operations for high throughput
   - Implement caching strategies
   - Monitor and optimize verification times

3. **Reliability:**
   - Implement retry logic with exponential backoff
   - Use persistent storage (Redis/Database)
   - Set up proper monitoring and alerting

4. **Privacy:**
   - Minimize data collection
   - Implement data retention policies
   - Provide clear privacy notices

## Troubleshooting

### Common Issues

1. **Connection Errors:**
   ```
   Error: connect ECONNREFUSED 127.0.0.1:3000
   ```
   Solution: Make sure the service is running on port 3000

2. **Redis Connection Issues:**
   ```
   Cache service connection failed
   ```
   Solution: The service will continue without cache, but start Redis for full functionality

3. **WebSocket Connection Issues:**
   ```
   WebSocket connection failed
   ```
   Solution: Check firewall settings and ensure WebSocket is enabled

4. **Verification Failures:**
   ```
   Invalid presentation: Missing required attributes
   ```
   Solution: Check service requirements and ensure your presentation includes all required attributes

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

This will provide detailed information about:
- Credential verification steps
- Session management operations
- WebSocket events
- Cache operations

## Next Steps

After running the examples:

1. **Explore the API:** Use the OpenAPI documentation at `/service/api-docs`
2. **Monitor operations:** Check `/service/statistics` for performance metrics
3. **Test edge cases:** Try invalid presentations, expired sessions, etc.
4. **Scale testing:** Use the batch example to test performance limits
5. **Custom integration:** Adapt the examples for your specific use case