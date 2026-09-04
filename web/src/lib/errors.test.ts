import { describe, expect, it } from 'vitest'
import { parseError } from './errors'

describe('parseError', () => {
  it('splits a CODE:message raised by an RPC', () => {
    const error = new Error('INSUFFICIENT_STOCK:only 3 available in WH1-R01-B004')
    expect(parseError(error)).toEqual({
      code: 'INSUFFICIENT_STOCK',
      title: 'Not enough stock',
      message: 'Only 3 available in WH1-R01-B004',
    })
  })

  it('keeps the server wording for a code it does not know', () => {
    const result = parseError(new Error('SOME_NEW_RULE:the warehouse is closed'))
    expect(result.code).toBe('SOME_NEW_RULE')
    expect(result.title).toBe('Something went wrong')
    expect(result.message).toBe('The warehouse is closed')
  })

  it('does not mistake a colon in prose for a code', () => {
    const result = parseError(new Error('Something failed: try again'))
    expect(result.code).toBe('UNKNOWN')
    expect(result.message).toBe('Something failed: try again')
  })

  it('recognises the perishable-expiry guard', () => {
    const result = parseError(new Error('EXPIRY_REQUIRED:OAT-0007 is perishable; expiry_date is required'))
    expect(result.title).toBe('Expiry date required')
  })

  it('maps a dropped connection to an offline message', () => {
    expect(parseError(new TypeError('Failed to fetch')).code).toBe('OFFLINE')
  })

  it('maps an expired session', () => {
    expect(parseError({ message: 'JWT expired' }).code).toBe('SESSION_EXPIRED')
  })

  it('turns a raw RLS rejection into something a user can act on', () => {
    const result = parseError({
      message: 'new row violates row-level security policy for table "products"',
    })
    expect(result.code).toBe('FORBIDDEN')
    expect(result.message).toBe('Your role does not permit this action.')
  })

  it('survives being handed nothing', () => {
    expect(parseError(null).message).toBe('Unknown error')
    expect(parseError(undefined).code).toBe('UNKNOWN')
  })
})
