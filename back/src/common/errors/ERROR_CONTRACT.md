# API Error Contract

All API errors follow this payload shape:

- statusCode: number
- code: string
- message: string
- details: object | undefined
- path: string
- timestamp: ISO date string

Example:

{
  "statusCode": 401,
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "Invalid email or password",
  "details": null,
  "path": "/auth/login",
  "timestamp": "2026-04-24T20:00:00.000Z"
}

## Login-related codes

- AUTH_INVALID_CREDENTIALS
- AUTH_ACCOUNT_SUSPENDED
- AUTH_ACCOUNT_INVITED_NOT_ACTIVATED
- VALIDATION_ERROR

## Register-related codes

- AUTH_EMAIL_ALREADY_USED
- VALIDATION_ERROR

## Preferred language update

- VALIDATION_ERROR
- AUTH_UNAUTHORIZED
- AUTH_FORBIDDEN

## Shared auth codes

- AUTH_EMAIL_ALREADY_USED
- AUTH_REFRESH_TOKEN_REQUIRED
- AUTH_REFRESH_TOKEN_INVALID
- AUTH_REFRESH_TOKEN_EXPIRED_OR_REVOKED
- AUTH_INVITE_TOKEN_INVALID_OR_EXPIRED
- AUTH_INVITE_TOKEN_WRONG_ROLE
- AUTH_RESET_TOKEN_INVALID_OR_EXPIRED
- AUTH_USER_NOT_FOUND
- AUTH_CURRENT_PASSWORD_INVALID
- AUTH_NEW_PASSWORD_SAME_AS_CURRENT

## Generic fallback codes

- BAD_REQUEST
- AUTH_UNAUTHORIZED
- AUTH_FORBIDDEN
- RESOURCE_NOT_FOUND
- CONFLICT
- INTERNAL_SERVER_ERROR
