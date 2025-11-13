import { AIProvider } from './base';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';

export type ProviderType = 'claude' | 'openai' | 'gemini';

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
}

export function createAIProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case 'claude':
      if (!config.apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required for Claude provider');
      }
      return new ClaudeProvider(config.apiKey);

    case 'openai':
      if (!config.apiKey) {
        throw new Error('OPENAI_API_KEY is required for OpenAI provider');
      }
      return new OpenAIProvider(config.apiKey);

    case 'gemini':
      if (!config.apiKey) {
        throw new Error('GEMINI_API_KEY is required for Gemini provider');
      }
      return new GeminiProvider(config.apiKey);

    default:
      throw new Error(`Unknown AI provider: ${config.type}`);
  }
}
