import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: [
      'https://cleanmaria.com',
      'https://staging.cleanmaria.com',
      'http://localhost:3000',
    ],
    credentials: true, // ✅ if you're using cookies/auth
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });
  // Stripe webhook needs raw body
  app.use(
    '/api/webhooks/stripe',
    json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf; // 👈 Capture raw body here
      },
    }),
  );

  // For all other routes
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT || 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
