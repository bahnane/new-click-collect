import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from './api-error-codes';

type ErrorResponseObject = {
  code?: string;
  message?: string | string[];
  details?: unknown;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const rawResponse = exception.getResponse();
      const normalized = this.normalizeHttpExceptionResponse(
        statusCode,
        rawResponse,
      );

      response.status(statusCode).json({
        statusCode,
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalizeHttpExceptionResponse(
    statusCode: number,
    rawResponse: string | object,
  ): { code: string; message: string; details?: unknown } {
    if (typeof rawResponse === 'string') {
      return {
        code: this.defaultCodeForStatus(statusCode),
        message: rawResponse,
      };
    }

    const responseObject = rawResponse as ErrorResponseObject;
    const message = Array.isArray(responseObject.message)
      ? 'Validation failed'
      : (responseObject.message ?? 'Request failed');

    const details = responseObject.details
      ? responseObject.details
      : Array.isArray(responseObject.message)
        ? { errors: responseObject.message }
        : undefined;

    return {
      code: responseObject.code ?? this.defaultCodeForStatus(statusCode),
      message,
      details,
    };
  }

  private defaultCodeForStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.AUTH_UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.AUTH_FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.RESOURCE_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT;
      default:
        return ErrorCodes.INTERNAL_SERVER_ERROR;
    }
  }
}
