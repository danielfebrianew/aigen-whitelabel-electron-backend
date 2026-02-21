import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

    // Helmet DULU (sebelum CORS)
  app.use(helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,  // tambah ini
    crossOriginEmbedderPolicy: false, // tambah ini
  }));

  // Baru CORS
  app.enableCors({
    origin: [
      'http://localhost:3001',
      'http://localhost:3000',
      'app://-',
      'app://.',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  });

  app.enableShutdownHooks();

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));
  app.setGlobalPrefix('api/v1');

  const server = app.getHttpServer();
  server.setTimeout(600000);
  server.keepAliveTimeout = 600000;
  server.headersTimeout = 601000;

  await app.listen(process.env.PORT ?? 3000);

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
