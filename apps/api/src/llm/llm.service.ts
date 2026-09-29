import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { ConfigService } from '../config/config.service.js';

/**
 * B1 — LLM provider factory (ADR-0002 §1, FR-13, NFR-4).
 *
 * The API talks to LLMs through the Vercel AI SDK (`ai` + `@ai-sdk/*`). This is a
 * standalone library, NOT tied to Vercel hosting. Provider, model, key and base
 * URL are all selected at runtime from the typed {@link ConfigService} — a live
 * provider swap is a config change only (ADR-0002). Secrets come from env only;
 * keys are never hardcoded (SR-4).
 *
 * The AI SDK exposes one uniform streaming interface (`streamText`) across every
 * provider, so the SSE contract in the answer layer is provider-agnostic. The
 * optional fallback provider is resolved eagerly at construction so a broken
 * fallback config fails fast rather than mid-request.
 */
@Injectable()
export class LlmService {
  /** The primary model, selected by `LLM_PROVIDER`/`LLM_MODEL`. */
  private readonly primary: LanguageModel;

  /**
   * Optional secondary model for NFR-4. Undefined unless both
   * `LLM_FALLBACK_PROVIDER` and `LLM_FALLBACK_MODEL` are configured.
   */
  private readonly fallback: LanguageModel | undefined;

  constructor(private readonly config: ConfigService) {
    const { provider, model, apiKey, baseUrl, fallback } = this.config.llm;
    this.primary = this.buildModel(provider, model, apiKey, baseUrl);
    this.fallback = fallback
      ? this.buildModel(fallback.provider, fallback.model, apiKey, baseUrl)
      : undefined;
  }

  /** The configured primary language model (Anthropic by default). */
  getModel(): LanguageModel {
    return this.primary;
  }

  /**
   * The primary model plus the fallback (if configured), in preference order.
   * The answer layer can walk this list to retry on provider failure (NFR-4).
   */
  getModelsInOrder(): LanguageModel[] {
    return this.fallback ? [this.primary, this.fallback] : [this.primary];
  }

  /**
   * Construct a provider-specific AI SDK model. `apiKey`/`baseUrl` are only
   * passed when set so the SDK falls back to its own env resolution otherwise.
   * `openai-compatible` and `ollama` are served through the OpenAI provider with
   * a custom `baseUrl` (both speak the OpenAI wire protocol).
   */
  private buildModel(
    provider: string,
    model: string,
    apiKey: string | undefined,
    baseUrl: string | undefined,
  ): LanguageModel {
    switch (provider) {
      case 'anthropic': {
        const anthropic = createAnthropic({
          ...(apiKey ? { apiKey } : {}),
          ...(baseUrl ? { baseURL: baseUrl } : {}),
        });
        return anthropic(model);
      }
      case 'openai': {
        const openai = createOpenAI({
          ...(apiKey ? { apiKey } : {}),
          ...(baseUrl ? { baseURL: baseUrl } : {}),
        });
        return openai(model);
      }
      case 'google': {
        const google = createGoogleGenerativeAI({
          ...(apiKey ? { apiKey } : {}),
          ...(baseUrl ? { baseURL: baseUrl } : {}),
        });
        return google(model);
      }
      case 'ollama':
      case 'openai-compatible': {
        // Both expose an OpenAI-compatible endpoint; a base URL is required so
        // the SDK does not silently target api.openai.com.
        if (!baseUrl) {
          throw new InternalServerErrorException(
            `LLM_BASE_URL is required for provider "${provider}"`,
          );
        }
        const compatible = createOpenAI({
          baseURL: baseUrl,
          // OpenAI-compatible/self-hosted endpoints often need no real key; pass
          // a placeholder so the SDK does not throw on a missing key.
          apiKey: apiKey ?? 'not-needed',
        });
        return compatible(model);
      }
      default:
        throw new InternalServerErrorException(`Unsupported LLM provider: ${provider}`);
    }
  }
}
