import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GenerateAiModule } from './generate-video/generate-video.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoMixerModule } from './video-mixer/video-mixer.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { GalleryModule } from './gallery/gallery.module';
import { GenerateImageModule } from './generate-image/generate-image.module';
import { GenerateProModule } from './generate-pro/generate-pro.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379'; 

        const isTls = redisUrl.startsWith('rediss://');

        return {
          throttlers: [
            {
              name: 'default',
              ttl: 1000,    // 1 detik
              limit: 20,    // 20 request
            },
          ],
          storage: new ThrottlerStorageRedisService(
            new Redis(redisUrl, {
              family: 4,
              tls: isTls ? { rejectUnauthorized: false } : undefined,
            })
          ),
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('NODE_ENV') === 'production';

        return {
          type: configService.get<any>('DB_CONNECTION'),
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT') || 3306,
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
          timezone: 'Z',
          autoLoadEntities: true,
          synchronize: !isProduction,
          logging: !isProduction,
        };
      },
    }),
    EventEmitterModule.forRoot(),
    GenerateAiModule,
    GenerateImageModule,
    VideoMixerModule,
    GalleryModule,
    GenerateProModule,
    NotificationsModule,
  ],
  controllers: [],
  providers: [{
    provide: APP_GUARD,
    useClass: ThrottlerGuard,
  }],
})
export class AppModule { }