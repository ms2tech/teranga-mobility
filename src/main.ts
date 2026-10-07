import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  // Console opérateur : public/console-operateur.html est servie sur « / ».
  // Le build sort dans dist/src, d'où les deux « .. » pour retrouver public/.
  app.useStaticAssets(join(__dirname, '..', '..', 'public'), {
    index: 'console-operateur.html',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚐 Téranga Mobility API — http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`🖥️  Console opérateur — http://localhost:${port}/`);
}

void bootstrap();
