import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Order } from '../orders/entities/order.entity';
import { SettingsService } from './settings.service';
import { DHAKA_TZ } from '../../common/utils/dhaka-time';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly settings: SettingsService) {}

  async sendEscalationEmail(order: Order): Promise<void> {
    const config = await this.settings.getRaw();

    if (!config.enabled) return;
    if (!config.smtpHost) {
      this.logger.warn(
        `Escalation email skipped for order [${order.id}] — SMTP host not configured`,
      );
      return;
    }

    const recipients: string[] = config.recipients
      ? (JSON.parse(config.recipients) as string[])
      : [];
    if (recipients.length === 0) {
      this.logger.warn(
        `Escalation email skipped for order [${order.id}] — no recipients configured`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      // port 587 requires STARTTLS upgrade — Gmail rejects without this
      ...(!config.smtpSecure && { requireTLS: true }),
      auth:
        config.smtpUser && config.smtpPass
          ? { user: config.smtpUser, pass: config.smtpPass }
          : undefined,
    });

    const subject = this.render(config.subjectTemplate, order);
    const html = this.render(
      config.bodyTemplate ?? (await this.settings.getDefaultBodyTemplate()),
      order,
    );
    const from = config.fromEmail
      ? `"${config.fromName}" <${config.fromEmail}>`
      : (config.smtpUser ?? 'noreply@tiffinbd.com');

    try {
      await transporter.sendMail({
        from,
        to: recipients.join(', '),
        subject,
        html,
      });
      this.logger.log(
        `Escalation email sent for order [${order.id}] to [${recipients.join(', ')}]`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to send escalation email for order [${order.id}]: ${String(err)}`,
      );
      throw err;
    }
  }

  async sendTestEmail(): Promise<void> {
    const mockOrder = {
      id: 'test-order-id',
      externalId: 'TEST-001',
      branchName: 'Test Branch',
      customer: { name: 'Test Customer', phone: '01700000000' },
      totalAmount: 850,
      escalatedAt: new Date(),
      items: [
        { name: 'Chicken Biryani', quantity: 2, price: 250 },
        { name: 'Mango Lassi', quantity: 1, price: 120 },
      ],
    } as unknown as Order;

    // Let errors propagate — caller (controller) surfaces them to the client
    await this.sendEscalationEmail(mockOrder);
  }

  private render(template: string, order: Order): string {
    const items = order.items
      .map((i) => `${i.quantity}&times; ${i.name}`)
      .join('<br>');

    return template
      .replace(/\{\{orderId\}\}/g, order.id)
      .replace(/\{\{externalId\}\}/g, order.externalId)
      .replace(/\{\{branchName\}\}/g, order.branchName ?? 'Unknown')
      .replace(/\{\{customerName\}\}/g, order.customer?.name ?? '—')
      .replace(/\{\{phone\}\}/g, order.customer?.phone ?? '—')
      .replace(/\{\{totalAmount\}\}/g, Number(order.totalAmount).toFixed(2))
      .replace(
        /\{\{escalatedAt\}\}/g,
        order.escalatedAt
          ? new Date(order.escalatedAt).toLocaleString('en-GB', { timeZone: DHAKA_TZ })
          : '—',
      )
      .replace(/\{\{items\}\}/g, items);
  }
}
