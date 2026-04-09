import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips unknown properties
      forbidNonWhitelisted: true, // throws error on unknown properties
      transform: true, // auto-transforms payloads to DTO instances
    }),
  );
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
