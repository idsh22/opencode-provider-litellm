import type { Plugin } from '@opencode/plugin'
import { resolvePluginConfig, getProviderId } from './utils.js'

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

  console.log(
    `[opencode-provider-litellm] loaded (provider: ${providerId}, auth: ${isGcloudAuth ? 'gcloud-token' : 'api-key'})`,
  )
}
