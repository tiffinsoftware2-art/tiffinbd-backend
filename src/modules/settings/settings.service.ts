import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EscalationConfig } from './entities/escalation-config.entity';
import { ManualOrderConfig } from './entities/manual-order-config.entity';
import { UpdateEscalationConfigDto } from './dto/update-escalation-config.dto';
import { UpdateManualOrderConfigDto } from './dto/update-manual-order-config.dto';
import { OrderSource } from '../normalization/dto/unified-order.dto';
import { isVatExcluded, parseVatExcludedSources } from './vat-exclusion';

const DEFAULT_BODY = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#ef4444;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;">&#9888; Order Escalated</h2>
    <p style="margin:4px 0 0;">Order #{{externalId}} was not accepted in time</p>
  </div>
  <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#64748b;font-size:14px;width:120px;">Branch</td><td style="padding:8px 0;font-weight:600;">{{branchName}}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Customer</td><td style="padding:8px 0;font-weight:600;">{{customerName}}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Phone</td><td style="padding:8px 0;font-weight:600;">{{phone}}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Total</td><td style="padding:8px 0;font-weight:600;">&#2547;{{totalAmount}}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Escalated At</td><td style="padding:8px 0;font-weight:600;">{{escalatedAt}}</td></tr>
    </table>
    <div style="margin-top:16px;">
      <p style="color:#64748b;font-size:14px;margin-bottom:8px;">Items:</p>
      <p style="font-size:14px;line-height:1.8;">{{items}}</p>
    </div>
  </div>
</div>`;

export interface SafeEscalationConfig {
  id: number;
  enabled: boolean;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPassSet: boolean; // never expose actual password
  fromEmail: string | null;
  fromName: string;
  recipients: string[];
  subjectTemplate: string;
  bodyTemplate: string;
  updatedAt: Date;
}

// The API-facing shape of manual_order_config: identical to the entity except
// that vatExcludedSources arrives parsed and validated, never as a raw JSON
// string and never null. Decimal fields pass through exactly as TypeORM
// returns them, unchanged — the dashboard already coerces with Number().
export interface SafeManualOrderConfig {
  id: number;
  vatPercent: number;
  deliveryCharge: number;
  platformFee: number;
  vatExcludedSources: OrderSource[];
  updatedAt: Date;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(EscalationConfig)
    private readonly repo: Repository<EscalationConfig>,
    @InjectRepository(ManualOrderConfig)
    private readonly manualOrderConfigRepo: Repository<ManualOrderConfig>,
  ) {}

  async getRaw(): Promise<EscalationConfig> {
    let config = await this.repo.findOneBy({ id: 1 });
    if (!config) {
      config = this.repo.create({ id: 1 });
      config = await this.repo.save(config);
    }
    return config;
  }

  async getEscalationConfig(): Promise<SafeEscalationConfig> {
    const config = await this.getRaw();
    return this.toSafe(config);
  }

  async updateEscalationConfig(
    dto: UpdateEscalationConfigDto,
  ): Promise<SafeEscalationConfig> {
    let config = await this.repo.findOneBy({ id: 1 });
    if (!config) config = this.repo.create({ id: 1 });

    if (dto.enabled !== undefined) config.enabled = dto.enabled;
    if (dto.smtpHost !== undefined) config.smtpHost = dto.smtpHost || null;
    if (dto.smtpPort !== undefined) config.smtpPort = dto.smtpPort;
    if (dto.smtpSecure !== undefined) config.smtpSecure = dto.smtpSecure;
    if (dto.smtpUser !== undefined) config.smtpUser = dto.smtpUser || null;
    if (dto.smtpPass) config.smtpPass = dto.smtpPass; // empty string = keep existing
    if (dto.fromEmail !== undefined) config.fromEmail = dto.fromEmail || null;
    if (dto.fromName !== undefined)
      config.fromName = dto.fromName || 'TiffinBD';
    if (dto.recipients !== undefined)
      config.recipients = JSON.stringify(dto.recipients);
    if (dto.subjectTemplate !== undefined)
      config.subjectTemplate = dto.subjectTemplate;
    if (dto.bodyTemplate !== undefined)
      config.bodyTemplate = dto.bodyTemplate || null;

    const saved = await this.repo.save(config);
    return this.toSafe(saved);
  }

  private toSafe(config: EscalationConfig): SafeEscalationConfig {
    return {
      id: config.id,
      enabled: config.enabled,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUser: config.smtpUser,
      smtpPassSet: !!config.smtpPass,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      recipients: config.recipients
        ? (JSON.parse(config.recipients) as string[])
        : [],
      subjectTemplate: config.subjectTemplate,
      bodyTemplate: config.bodyTemplate ?? DEFAULT_BODY,
      updatedAt: config.updatedAt,
    };
  }

  getDefaultBodyTemplate(): string {
    return DEFAULT_BODY;
  }

  // ── Manual Order VAT% (see ADR-005) ────────────────────────────────────────

  // Returns the raw entity — OrdersService depends on this shape. The parsed,
  // API-facing shape is getManualOrderConfigSafe() below.
  async getManualOrderConfig(): Promise<ManualOrderConfig> {
    let config = await this.manualOrderConfigRepo.findOneBy({ id: 1 });
    if (!config) {
      config = this.manualOrderConfigRepo.create({
        id: 1,
        vatPercent: 0,
        deliveryCharge: 27,
        platformFee: 3,
        vatExcludedSources: null,
      });
      config = await this.manualOrderConfigRepo.save(config);
    }
    return config;
  }

  async getManualOrderConfigSafe(): Promise<SafeManualOrderConfig> {
    return this.toSafeManualOrder(await this.getManualOrderConfig());
  }

  async updateManualOrderConfig(
    dto: UpdateManualOrderConfigDto,
  ): Promise<SafeManualOrderConfig> {
    const config = await this.getManualOrderConfig();
    config.vatPercent = dto.vatPercent;
    config.deliveryCharge = dto.deliveryCharge;
    config.platformFee = dto.platformFee;
    config.vatExcludedSources = JSON.stringify(dto.vatExcludedSources);
    return this.toSafeManualOrder(
      await this.manualOrderConfigRepo.save(config),
    );
  }

  // Is VAT excluded by default for orders from this source? Delegates to the
  // dependency-free rule in vat-exclusion.ts so the logic stays testable
  // without a NestJS test harness (ADR-005 Addendum 6, decision 8).
  vatExcludedFor(config: ManualOrderConfig, source: OrderSource): boolean {
    return isVatExcluded(
      config.vatExcludedSources,
      source,
      Object.values(OrderSource),
    );
  }

  private toSafeManualOrder(config: ManualOrderConfig): SafeManualOrderConfig {
    return {
      id: config.id,
      vatPercent: config.vatPercent,
      deliveryCharge: config.deliveryCharge,
      platformFee: config.platformFee,
      vatExcludedSources: parseVatExcludedSources(
        config.vatExcludedSources,
        Object.values(OrderSource),
      ) as OrderSource[],
      updatedAt: config.updatedAt,
    };
  }
}
