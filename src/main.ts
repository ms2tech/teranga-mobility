import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';

/**
 * TRUST_PROXY (optionnel) : derrière ngrok ou un hébergeur, tous les clients
 * semblent venir de l'adresse du proxy, et la limitation par IP de la connexion
 * les confond. Valeur conseillée : le NOMBRE de proxys de confiance (1 derrière
 * ngrok). « true » fait confiance à tous les en-têtes X-Forwarded-For : à éviter.
 * Vide ou « false » : désactivé (valeur à garder quand l'API est exposée en direct).
 */
function parseTrustProxy(raw?: string): boolean | number | string | undefined {
  const value = raw?.trim();
  if (!value || value.toLowerCase() === 'false') return undefined;
  if (value.toLowerCase() === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  app.use(cookieParser());
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
  // Pas de CORS : la console est servie par l'API (même origine). Une liste
  // blanche d'origines reviendra avec le site public.
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚐 Téranga Mobility API — http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`🖥️  Console opérateur — http://localhost:${port}/`);
}

void bootstrap();
