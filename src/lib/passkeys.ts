import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { api, type Account } from './api'

// Passkey ceremonies: the server issues a challenge, the device signs it with
// Face ID / Touch ID / PIN, the server verifies and sets the session cookie.

export const passkeysSupported = () => browserSupportsWebAuthn()

export async function signInWithPasskey(): Promise<Account> {
  const { flowId, options } = await api.loginOptions()
  const response = await startAuthentication({ optionsJSON: options })
  return (await api.loginVerify(flowId, response)).account
}

// New account (password + name), or — when already signed in — another
// device's passkey for the current account (no arguments needed).
export async function createPasskey(body: { password?: string; name?: string } = {}): Promise<Account> {
  const { flowId, options } = await api.registerOptions(body)
  const response = await startRegistration({ optionsJSON: options })
  return (await api.registerVerify(flowId, response)).account
}

// Turn WebAuthn's terse DOMExceptions into something a person can act on.
export function passkeyError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Cancelled — or no passkey for this app on this device.'
  if (name === 'InvalidStateError') return 'This device already has a passkey for this account.'
  return e instanceof Error ? e.message : String(e)
}
