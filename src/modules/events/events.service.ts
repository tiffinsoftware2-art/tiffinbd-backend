import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect } from 'amqplib';
import type { ChannelModel, Channel } from 'amqplib';

const EXCHANGE = 'tiffinbd.orders';
const EXCHANGE_TYPE = 'topic';

@Injectable()
export class EventsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EventsService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(private readonly config: ConfigService) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    const url = this.config.getOrThrow<string>('app.rabbitmqUrl');
    this.connection = await connect(url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });
    this.logger.log('Connected to RabbitMQ — event publisher ready');
    this.resolveReady();
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // Ignore errors during shutdown
    }
  }

  async publish(routingKey: string, payload: object): Promise<void> {
    await this.readyPromise;
    if (!this.channel) return;
    try {
      this.channel.publish(
        EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true },
      );
    } catch (err: unknown) {
      this.logger.error(`Failed to publish [${routingKey}]: ${String(err)}`);
    }
  }
}
