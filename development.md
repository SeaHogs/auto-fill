# AWS Integration Guide

## Quick Start
1. Change `useMockService` to `false` in SERVICE_CONFIG
2. Add your AWS credentials
3. Deploy

## Configuration
```javascript
const SERVICE_CONFIG = {
    useMockService: false,  // ← Change this
    apiEndpoint: 'YOUR_API_GATEWAY_URL',
    apiKey: 'YOUR_API_KEY',
    aws: {
        region: 'us-east-1',
        comprehendEndpoint: 'YOUR_ENDPOINT'
    }
};
