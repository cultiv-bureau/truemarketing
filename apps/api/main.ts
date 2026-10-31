import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, Controller, All, Req, Res, Inject } from '@nestjs/common';
import express, { type Request, type Response } from 'express';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { AppService } from './service.js';
@Controller()
class ApiController {
  constructor(@Inject(AppService) private readonly app: AppService) {}
  @All(['api/{*path}', 'v1/{*path}', 'health'])
  handle(@Req() req: Request, @Res() res: Response) {
    return this.app.handle(req, res);
  }
}
@Module({ controllers: [ApiController], providers: [AppService] })
class AppModule {}
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn', 'log'],
  bodyParser: false,
});
app.use(express.json({ limit: '256kb' }));
app.use((req: Request, res: Response, next: () => void) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  );
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.enableShutdownHooks();
const root = resolve('apps/web/dist');
app.use(express.static(root, { index: false }));
app.use((req: Request, res: Response, next: () => void) => {
  if (req.method === 'GET' && !/^\/(api|v1|health)(\/|$)/.test(req.path) && !req.path.includes('.'))
    return res.sendFile(resolve(root, 'index.html'));
  next();
});
await app.init();
const port = Number(process.env.PORT ?? 4310);
await app.listen(port, '127.0.0.1');
const lanHost = process.env.LAN_HOST;
if (lanHost) {
  const privateAddresses = Object.values(networkInterfaces()).flat().filter(address => address && address.family === 'IPv4' && !address.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)).map(address => address!.address);
  if (!privateAddresses.includes(lanHost)) throw new Error('LAN_HOST must be an existing private IPv4 address on this computer.');
  const lanServer = createServer(app.getHttpAdapter().getInstance());
  await new Promise<void>((resolve, reject) => { lanServer.once('error', reject); lanServer.listen(port, lanHost, () => resolve()); });
  process.once('SIGTERM', () => lanServer.close());
  process.once('SIGINT', () => lanServer.close());
  console.log(`Private-network access: http://${lanHost}:${port}`);
}
console.log(
  `TrueMarketing is ready at http://localhost:${port} · LOCAL SETUP MODE · CRM DISCONNECTED`,
);
