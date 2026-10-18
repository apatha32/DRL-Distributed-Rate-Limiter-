import { describe, expect, it } from 'vitest'
import { ApiNotConnectedError, errorMessage, requireJson } from './api'

describe('requireJson', () => {
  it('passes JSON API responses through', () => {
    const res = { headers: { 'content-type': 'application/json' }, data: { ok: true } }
    expect(requireJson(res)).toBe(res)
  })

  it('rejects an HTML page (dashboard rewrite) with a clear message', () => {
    const html = { headers: { 'content-type': 'text/html; charset=utf-8' }, data: '<!doctype html>' }
    expect(() => requireJson(html)).toThrow(ApiNotConnectedError)
    try {
      requireJson(html)
    } catch (err) {
      expect(errorMessage(err)).toMatch(/VITE_API_URL/)
    }
  })
})
