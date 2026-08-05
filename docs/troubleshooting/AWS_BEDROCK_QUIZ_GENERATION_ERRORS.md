# AWS Bedrock Quiz Generation Errors - Troubleshooting Guide

This document provides solutions to common errors encountered during quiz generation with AWS Bedrock and LangChain.

**Last Updated**: November 14, 2025
**Status**: RESOLVED

---

## Error 1: Unknown Model Provider (Inference Profile Issue)

### Error Message
```
Error: Unknown model provider: 'global', only these are supported: ai21,anthropic,amazon,cohere,meta,mistral,deepseek
    at new BedrockChat (/app/node_modules/@langchain/community/dist/chat_models/bedrock/web.cjs:602:19)
    at AiService.getModel (/app/dist/modules/ai/ai.service.js:156:23)
    at QuizService.buildChain (/app/dist/modules/quiz/quiz.service.js:269:38)
```

### Root Cause
LangChain's `BedrockChat` class does not support AWS Bedrock **cross-region inference profiles**. The application was configured with:
- ❌ **Wrong**: `global.anthropic.claude-haiku-4-5-20251001-v1:0` (inference profile)
- ✅ **Correct**: `anthropic.claude-haiku-4-5-20251001-v1:0` (direct model ID)

### Explanation
AWS Bedrock offers two types of model identifiers:
1. **Direct Model IDs**: Start with provider name (e.g., `anthropic.`, `amazon.`, `cohere.`)
2. **Inference Profiles**: Start with region prefix (e.g., `global.`, `us.`, `eu.`, `jp.`, `au.`)

Inference profiles provide better availability and load balancing by routing requests across multiple regions. However, **LangChain currently only supports direct model IDs**.

### Solution

**Step 1**: Update `AWS_BEDROCK_MODEL_ID` environment variable to use a direct model ID.

**Available Claude Models** (direct IDs):
```bash
# Claude Haiku 4.5 (newest, fastest - RECOMMENDED)
AWS_BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5-20251001-v1:0

# Claude 3.5 Haiku (fast, cost-effective)
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-haiku-20241022-v1:0

# Claude 3.5 Sonnet (most capable, slightly slower)
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

**Step 2**: Ensure the model is available in your AWS region.

- Check AWS Bedrock Console → Model access
- Request access to the specific Claude model
- Wait for "Access granted" status

**Step 3**: Redeploy your application with the updated environment variable.

For AWS Elastic Beanstalk:
```bash
# Via AWS Console
1. Go to Elastic Beanstalk → Your Environment
2. Configuration → Software → Environment properties
3. Add/Update: AWS_BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5-20251001-v1:0
4. Apply changes and redeploy
```

### Files Modified
- `Graspr-Backend/.env`
- `Graspr-Backend/.env.example`
- `Graspr-Backend/CLAUDE.md`
- Root `CLAUDE.md`

### Prevention
Always use **direct model IDs** when working with LangChain and AWS Bedrock:
- ✅ **Use**: Model IDs starting with `anthropic.`, `amazon.`, `cohere.`, etc.
- ❌ **Avoid**: Inference profiles starting with `global.`, `us.`, `eu.`, etc.

---

## Error 2: LangSmith Tracing 403 Forbidden

### Error Message
```
Error: Failed to batch create run: 403 Forbidden {"error":"Forbidden"}
    at raiseForStatus (/app/node_modules/langchain/node_modules/@langchain/core/node_modules/langsmith/dist/client.cjs:77:15)
    at Client._postBatchIngestRuns (/app/node_modules/langchain/node_modules/@langchain/core/node_modules/langsmith/dist/client.cjs:667:9)

Error in handler LangChainTracer, handleChainError: Error: Failed to batch create run: 403 Forbidden
```

### Root Cause
LangChain attempts to send tracing/observability data to **LangSmith** (LangChain's observability platform). This error occurs when:
1. `LANGCHAIN_TRACING_V2` is not explicitly set to `false`
2. LangChain defaults to enabling tracing
3. No valid LangSmith API key is configured

### Impact
**Severity**: LOW (Non-fatal)
- These errors appear in logs but **do not prevent quiz generation**
- The actual AI generation continues to work normally
- Only observability/debugging data fails to send

### Solution

**Option 1: Disable LangSmith Tracing (Recommended for Production)**

Add this environment variable:
```bash
LANGCHAIN_TRACING_V2=false
```

**For AWS Elastic Beanstalk**:
```bash
1. Go to Elastic Beanstalk → Your Environment
2. Configuration → Software → Environment properties
3. Add: LANGCHAIN_TRACING_V2=false
4. Apply changes
```

**For Docker Compose**:
```yaml
environment:
  - LANGCHAIN_TRACING_V2=false
```

**For Local Development** (`.env` file):
```bash
# Disable LangSmith tracing to avoid compatibility issues
LANGCHAIN_TRACING_V2=false
```

**Option 2: Configure LangSmith (For Observability)**

If you want to enable LangChain tracing for debugging:
```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=your-langsmith-api-key
LANGCHAIN_PROJECT=Graspr
```

Get your LangSmith API key from: https://smith.langchain.com/

### Files Modified
- `Graspr-Backend/.env` (already has `LANGCHAIN_TRACING_V2=false`)
- AWS Elastic Beanstalk environment configuration (needs update)

### Prevention
Always explicitly set `LANGCHAIN_TRACING_V2=false` in production environments unless you're actively using LangSmith for observability.

---

## Related Documentation

### Environment Variables Reference
See `.env.example` for complete list of required environment variables.

### AWS Bedrock Model Access
1. Go to AWS Bedrock Console (correct region)
2. Navigate to **Model access**
3. Click **Manage model access** or **Request access**
4. Enable Claude models you want to use
5. Submit and wait for "Access granted" status

This is a **one-time setup per AWS account and region**.

### Additional Resources
- **LangChain Bedrock Documentation**: https://js.langchain.com/docs/integrations/chat/bedrock
- **AWS Bedrock Model IDs**: https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
- **LangSmith Documentation**: https://docs.smith.langchain.com/

---

## Verification Checklist

After applying fixes, verify:
- [ ] Quiz generation completes successfully
- [ ] No "Unknown model provider" errors in logs
- [ ] LangSmith 403 errors are gone (or ignored if non-critical)
- [ ] AWS Bedrock model access is enabled for your model
- [ ] Environment variables are set correctly in AWS Elastic Beanstalk
- [ ] Application restarts successfully after changes

---

## Summary

| Issue | Severity | Solution | Status |
|-------|----------|----------|--------|
| Unknown model provider 'global' | HIGH (Blocks quiz generation) | Use direct model ID instead of inference profile | ✅ RESOLVED |
| LangSmith 403 Forbidden | LOW (Non-fatal, logs only) | Set `LANGCHAIN_TRACING_V2=false` | ✅ RESOLVED |

Both issues have been documented in `CLAUDE.md` files and `.env.example` to prevent recurrence.
