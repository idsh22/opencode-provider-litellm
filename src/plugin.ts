import type { Plugin } from '@opencode/plugin'
import { resolvePluginConfig, getProviderId } from './utils.js'
import { discoverModels, toProviderInfo, toModelInfos } from './discovery.js'
import { getGcloudToken } from './gcloud-token.js'
import { loadModelCache, saveModelCache } from './model-cache.js'
import type { DiscoveredModel } from './types.js'

function isGcloudTokenAuth(): boolean {
  const value = process.env.LITELLM_GCLOUD_TOKEN_AUTH
  return !!value && value !== '' && value !== '0'
}

export async function setup(ctx: Plugin.Context): Promise<void> {
  const pluginConfig = resolvePluginConfig(ctx.options)
  if (pluginConfig === null) {
    throw new Error(
      isGcloudTokenAuth()
        ? "Plugin config error: set LITELLM_URL (LITELLM_KEY is optional when LITELLM_GCLOUD_TOKEN_AUTH=1)."
        : "Plugin config error: set 'url' and 'apiKey' in plugin options, " +
          'or set LITELLM_URL and LITELLM_KEY environment variables.',
    )
  }

  const providerId = getProviderId()

  const isGcloudAuth = isGcloudTokenAuth()

  // When gcloud token auth is enabled, fetch a live token instead of using
  // the static apiKey.
  const getToken = async (): Promise<string> => {
    if (isGcloudAuth) {
      return (await getGcloudToken()) ?? ''
    }
    return pluginConfig.apiKey
  }

  // Seed the provider from the model cache so opencode has something to
  // work with while live discovery runs.
  const state: { token: string; models: Record<string, DiscoveredModel> } = {
    token: await getToken(),
    models: (await loadModelCache(ctx, providerId)) ?? {},
  }

  // The transform callback is replayed on every registry rebuild, so it
  // must stay synchronous and read from captured state only.
  await ctx.provider.transform((editor) => {
    editor.add({
      info: toProviderInfo(providerId, pluginConfig.url, state.token),
      models: toModelInfos(providerId, state.models),
    })
  })

  // Discover live models, update the cache, and rebuild the registry.
  try {
    const discovered = await discoverModels(pluginConfig, getToken)

    if (Object.keys(discovered).length === 0) {
      console.warn('[opencode-provider-litellm] No models discovered')
    } else {
      state.models = discovered
      state.token = await getToken()
      await saveModelCache(ctx, providerId, discovered)
      console.log(`[opencode-provider-litellm] Discovered ${Object.keys(discovered).length} models`)
      await ctx.provider.reload()
    }
  } catch (error: unknown) {
    console.warn(`[opencode-provider-litellm] Model discovery failed: ${error}`)
  }

  console.log(
    `[opencode-provider-litellm] loaded (provider: ${providerId}, auth: ${isGcloudAuth ? 'gcloud-token' : 'api-key'})`,
  )
}
