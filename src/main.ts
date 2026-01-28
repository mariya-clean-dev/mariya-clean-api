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
      'https://maria-staging.netlify.app',
      'http://localhost:3000',

      // 👇 ADD THESE
      'https://hoppscotch.io',
      'https://hoppscotch.yourdomain.com', // if self-hosted
    ],
    credentials: true,

    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],

    exposedHeaders: ['Authorization'],
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
