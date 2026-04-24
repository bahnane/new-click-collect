import { NestFactory } from '@nestjs/core';
import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ErrorCodes } from './common/errors/api-error-codes';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalFilters(new ApiExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Validation failed',
          details: {
            errors: errors.map((error) => ({
              field: error.property,
              constraints: Object.values(error.constraints ?? {}),
            })),
          },
        }),
    }),
  );

  const frontendOrigin = process.env.FRONTEND_URL;
  const allowedOrigins = frontendOrigin
    ? frontendOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : true;

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
