# Troubleshooting Documentation

This directory contains troubleshooting guides for common issues encountered in the Graspr Backend application.

## Available Guides

### [AWS Bedrock Quiz Generation Errors](./AWS_BEDROCK_QUIZ_GENERATION_ERRORS.md)
**Status**: ✅ RESOLVED
**Date**: November 14, 2025
**Issues Covered**:
- **Error 1**: Unknown model provider 'global' (LangChain inference profile incompatibility)
- **Error 2**: LangSmith tracing 403 Forbidden errors

**Quick Summary**:
- Use direct model IDs (e.g., `anthropic.claude-haiku-4-5-20251001-v1:0`) instead of inference profiles
- Disable LangSmith tracing by setting `LANGCHAIN_TRACING_V2=false`

---

## How to Use This Documentation

1. **Check existing guides** - Browse the list above to see if your issue is documented
2. **Search by error message** - Use text search to find specific error messages
3. **Follow solutions step-by-step** - Each guide includes detailed resolution steps
4. **Verify fixes** - Use the verification checklist at the end of each guide

## Contributing

When adding new troubleshooting guides:
1. Create a new markdown file with descriptive name (e.g., `DATABASE_CONNECTION_ISSUES.md`)
2. Include the following sections:
   - Error message (with code block)
   - Root cause
   - Solution (step-by-step)
   - Files modified
   - Prevention tips
   - Verification checklist
3. Update this README with a link to the new guide
4. Use clear status indicators (✅ RESOLVED, 🔄 IN PROGRESS, ⚠️ KNOWN ISSUE)

## Quick Reference

### Common Environment Variables
```bash
# AWS Bedrock
AWS_BEDROCK_REGION=ca-central-1
AWS_BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5-20251001-v1:0

# LangChain
LANGCHAIN_TRACING_V2=false

# AWS Credentials (used for both S3 and Bedrock)
S3_ACCESS_KEY=your-aws-access-key
S3_SECRET_KEY=your-aws-secret-key
```

### Useful Commands
```bash
# Check application logs
docker logs <container-id>

# Verify environment variables in container
docker exec <container-id> env | grep AWS

# Test AWS Bedrock access
aws bedrock list-foundation-models --region ca-central-1
```

## Related Documentation
- [Main CLAUDE.md](../../CLAUDE.md) - Full backend architecture and development guide
- [.env.example](../../.env.example) - Complete environment variable reference
- [Root CLAUDE.md](../../../CLAUDE.md) - Monorepo overview and setup instructions
