import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppLanguage, OrderStatus, Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { SentMessageInfo } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

type OrderNotificationPayload = {
  orderId: string;
  storeName: string;
  totalInCents: number;
  itemCount: number;
  pickupStartsAt: Date;
  pickupEndsAt: Date;
};

type MerchantInvitationPayload = {
  activationLink: string;
  storeName: string;
};

type PasswordResetPayload = {
  resetLink: string;
};

type CustomerEmailVerificationPayload = {
  verificationLink: string;
};

type CustomerOrderStatusPayload = OrderNotificationPayload & {
  status: OrderStatus;
  cancellationReason?: string | null;
};

const EmailTemplate = {
  MERCHANT_INVITATION: 'MERCHANT_INVITATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  CUSTOMER_EMAIL_VERIFICATION: 'CUSTOMER_EMAIL_VERIFICATION',
  CUSTOMER_ORDER_PENDING: 'CUSTOMER_ORDER_PENDING',
  MERCHANT_NEW_ORDER: 'MERCHANT_NEW_ORDER',
  CUSTOMER_ORDER_STATUS: 'CUSTOMER_ORDER_STATUS',
} as const;

type EmailTemplate = (typeof EmailTemplate)[keyof typeof EmailTemplate];

const EmailDeliveryStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

type EmailDeliveryStatus =
  (typeof EmailDeliveryStatus)[keyof typeof EmailDeliveryStatus];

type MailTemplatePayloadMap = {
  [EmailTemplate.MERCHANT_INVITATION]: MerchantInvitationPayload;
  [EmailTemplate.PASSWORD_RESET]: PasswordResetPayload;
  [EmailTemplate.CUSTOMER_EMAIL_VERIFICATION]: CustomerEmailVerificationPayload;
  [EmailTemplate.CUSTOMER_ORDER_PENDING]: OrderNotificationPayload;
  [EmailTemplate.MERCHANT_NEW_ORDER]: OrderNotificationPayload;
  [EmailTemplate.CUSTOMER_ORDER_STATUS]: CustomerOrderStatusPayload;
};

type RenderedMail = {
  subject: string;
  text: string;
};

type MailDeliveryProcessingSummary = {
  processed: number;
  sent: number;
  rescheduled: number;
  failed: number;
  skipped: number;
};

type MailDeliveryProcessingResult = {
  outcome: 'sent' | 'rescheduled' | 'failed' | 'skipped';
};

type EmailDeliveryRecord = {
  id: string;
  template: EmailTemplate;
  recipientEmail: string;
  language: AppLanguage;
  payload: Prisma.JsonValue;
  status: EmailDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type EmailDeliveryRow = Omit<EmailDeliveryRecord, 'payload'> & {
  payload: Prisma.JsonValue | string;
};

const DEFAULT_LANGUAGE: AppLanguage = AppLanguage.fr;
const LANGUAGE_TO_LOCALE: Record<AppLanguage, string> = {
  [AppLanguage.fr]: 'fr-FR',
  [AppLanguage.ar]: 'ar-MA',
};
const DEFAULT_DELIVERY_BATCH_SIZE = 20;
const DEFAULT_DELIVERY_MAX_ATTEMPTS = 5;
const DEFAULT_PROCESSING_TIMEOUT_MINUTES = 15;
const DEFAULT_RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 360];

class MailDeliveryRenderError extends Error {}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly defaultLanguage: AppLanguage;
  private readonly currency: string;
  private readonly deliveryBatchSize: number;
  private readonly deliveryMaxAttempts: number;
  private readonly deliveryRetryDelaysMs: number[];
  private readonly processingTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.fromAddress = this.configService.getOrThrow<string>('MAIL_FROM');
    this.defaultLanguage = this.resolveDefaultLanguage(
      this.configService.get<string>('MAIL_DEFAULT_LANGUAGE'),
    );
    this.currency = this.configService.get<string>('MAIL_CURRENCY') ?? 'EUR';
    this.deliveryBatchSize = this.parsePositiveInteger(
      this.configService.get<string>('MAIL_DELIVERY_BATCH_SIZE'),
      DEFAULT_DELIVERY_BATCH_SIZE,
    );
    this.deliveryMaxAttempts = this.parsePositiveInteger(
      this.configService.get<string>('MAIL_DELIVERY_MAX_ATTEMPTS'),
      DEFAULT_DELIVERY_MAX_ATTEMPTS,
    );
    this.deliveryRetryDelaysMs = this.parseRetryDelays(
      this.configService.get<string>('MAIL_DELIVERY_RETRY_DELAYS_MINUTES'),
    );
    this.processingTimeoutMs =
      this.parsePositiveInteger(
        this.configService.get<string>(
          'MAIL_DELIVERY_PROCESSING_TIMEOUT_MINUTES',
        ),
        DEFAULT_PROCESSING_TIMEOUT_MINUTES,
      ) *
      60 *
      1000;

    const host = this.configService.getOrThrow<string>('SMTP_HOST');
    const port = Number(
      this.configService.getOrThrow<string>('SMTP_PORT') ?? 587,
    );
    const user = this.configService.getOrThrow<string>('SMTP_USER');
    const pass = this.configService.getOrThrow<string>('SMTP_PASS');

    const hasSmtpCredentials =
      Boolean(host) &&
      Number.isFinite(port) &&
      Boolean(user) &&
      Boolean(pass) &&
      user !== '...' &&
      pass !== '...';

    if (hasSmtpCredentials) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
      return;
    }

    this.logger.warn(
      'SMTP configuration is missing or incomplete. Emails will be logged only.',
    );
  }

  async sendMerchantInvitationEmail(
    to: string,
    activationLink: string,
    storeName: string,
    language?: AppLanguage,
  ): Promise<void> {
    await this.enqueueDelivery(
      EmailTemplate.MERCHANT_INVITATION,
      to,
      {
        activationLink,
        storeName,
      },
      language,
    );
  }

  async sendPasswordResetEmail(
    to: string,
    resetLink: string,
    language?: AppLanguage,
  ): Promise<void> {
    await this.enqueueDelivery(
      EmailTemplate.PASSWORD_RESET,
      to,
      { resetLink },
      language,
    );
  }

  async sendCustomerEmailVerificationEmail(
    to: string,
    verificationLink: string,
    language?: AppLanguage,
  ): Promise<void> {
    await this.enqueueDelivery(
      EmailTemplate.CUSTOMER_EMAIL_VERIFICATION,
      to,
      { verificationLink },
      language,
    );
  }

  async sendCustomerOrderPendingEmail(
    to: string,
    payload: OrderNotificationPayload,
    language?: AppLanguage,
  ): Promise<void> {
    await this.enqueueDelivery(
      EmailTemplate.CUSTOMER_ORDER_PENDING,
      to,
      payload,
      language,
    );
  }

  async sendMerchantNewOrderEmail(
    to: string,
    payload: OrderNotificationPayload,
    language?: AppLanguage,
  ): Promise<void> {
    await this.enqueueDelivery(
      EmailTemplate.MERCHANT_NEW_ORDER,
      to,
      payload,
      language,
    );
  }

  async sendCustomerOrderStatusEmail(
    to: string,
    payload: CustomerOrderStatusPayload,
    language?: AppLanguage,
  ): Promise<void> {
    await this.enqueueDelivery(
      EmailTemplate.CUSTOMER_ORDER_STATUS,
      to,
      payload,
      language,
    );
  }

  async processPendingDeliveries(
    limit = this.deliveryBatchSize,
  ): Promise<MailDeliveryProcessingSummary> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.processingTimeoutMs);
    const dueDeliveries = await this.findDueDeliveries(now, staleBefore, limit);

    const summary: MailDeliveryProcessingSummary = {
      processed: 0,
      sent: 0,
      rescheduled: 0,
      failed: 0,
      skipped: 0,
    };

    for (const delivery of dueDeliveries) {
      const result = await this.processDeliveryById(delivery.id);
      summary.processed += 1;
      summary[result.outcome] += 1;
    }

    return summary;
  }

  private async enqueueDelivery<TTemplate extends EmailTemplate>(
    template: TTemplate,
    recipientEmail: string,
    payload: MailTemplatePayloadMap[TTemplate],
    language?: AppLanguage,
  ): Promise<void> {
    const resolvedLanguage = this.resolveLanguage(language);
    const delivery = await this.createDelivery(
      template,
      recipientEmail,
      resolvedLanguage,
      payload,
    );

    try {
      await this.processDeliveryById(delivery.id);
    } catch (error) {
      const message = this.stringifyError(error);
      this.logger.warn(
        `Immediate email delivery attempt failed for ${delivery.id}; queued for retry (${message})`,
      );
    }
  }

  private async processDeliveryById(
    deliveryId: string,
  ): Promise<MailDeliveryProcessingResult> {
    const delivery = await this.claimDelivery(deliveryId);
    if (!delivery) {
      return { outcome: 'skipped' };
    }

    try {
      const renderedMail = this.renderDelivery(delivery);
      const providerMessageId = await this.sendMail({
        to: delivery.recipientEmail,
        subject: renderedMail.subject,
        text: renderedMail.text,
      });

      await this.markDeliveryAsSent(delivery.id, providerMessageId);

      return { outcome: 'sent' };
    } catch (error) {
      const errorMessage = this.stringifyError(error);
      const shouldRetry =
        this.isRetryableMailError(error) &&
        delivery.attemptCount < delivery.maxAttempts;

      if (shouldRetry) {
        await this.rescheduleDelivery(
          delivery.id,
          this.computeNextAttemptAt(delivery.attemptCount),
          errorMessage,
        );

        return { outcome: 'rescheduled' };
      }

      await this.markDeliveryAsFailed(delivery.id, errorMessage);

      return { outcome: 'failed' };
    }
  }

  private async claimDelivery(
    deliveryId: string,
  ): Promise<EmailDeliveryRecord | null> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.processingTimeoutMs);
    const claimResult = await this.prisma.$executeRaw`
      UPDATE email_deliveries
      SET
        status = ${EmailDeliveryStatus.PROCESSING},
        lastAttemptAt = ${now},
        attemptCount = attemptCount + 1,
        updatedAt = ${now}
      WHERE id = ${deliveryId}
        AND (
          (status = ${EmailDeliveryStatus.PENDING} AND nextAttemptAt <= ${now})
          OR (status = ${EmailDeliveryStatus.PROCESSING} AND lastAttemptAt < ${staleBefore})
        )
    `;

    if (claimResult === 0) {
      return null;
    }

    return this.findDeliveryById(deliveryId);
  }

  private renderDelivery(delivery: EmailDeliveryRecord): RenderedMail {
    switch (delivery.template) {
      case EmailTemplate.MERCHANT_INVITATION:
        return this.renderMerchantInvitationEmail(
          delivery.payload as unknown as MerchantInvitationPayload,
          delivery.language,
        );
      case EmailTemplate.PASSWORD_RESET:
        return this.renderPasswordResetEmail(
          delivery.payload as unknown as PasswordResetPayload,
          delivery.language,
        );
      case EmailTemplate.CUSTOMER_EMAIL_VERIFICATION:
        return this.renderCustomerEmailVerificationEmail(
          delivery.payload as unknown as CustomerEmailVerificationPayload,
          delivery.language,
        );
      case EmailTemplate.CUSTOMER_ORDER_PENDING:
        return this.renderCustomerOrderPendingEmail(
          delivery.payload as unknown as OrderNotificationPayload,
          delivery.language,
        );
      case EmailTemplate.MERCHANT_NEW_ORDER:
        return this.renderMerchantNewOrderEmail(
          delivery.payload as unknown as OrderNotificationPayload,
          delivery.language,
        );
      case EmailTemplate.CUSTOMER_ORDER_STATUS:
        return this.renderCustomerOrderStatusEmail(
          delivery.payload as unknown as CustomerOrderStatusPayload,
          delivery.language,
        );
      default:
        throw new MailDeliveryRenderError(
          `Unsupported email template: ${delivery.template}`,
        );
    }
  }

  private async createDelivery<TTemplate extends EmailTemplate>(
    template: TTemplate,
    recipientEmail: string,
    language: AppLanguage,
    payload: MailTemplatePayloadMap[TTemplate],
  ): Promise<EmailDeliveryRecord> {
    const deliveryId = randomUUID();
    const now = new Date();

    await this.prisma.$executeRaw`
      INSERT INTO email_deliveries (
        id,
        template,
        recipientEmail,
        language,
        payload,
        status,
        attemptCount,
        maxAttempts,
        nextAttemptAt,
        createdAt,
        updatedAt
      )
      VALUES (
        ${deliveryId},
        ${template},
        ${recipientEmail},
        ${language},
        ${JSON.stringify(payload)},
        ${EmailDeliveryStatus.PENDING},
        0,
        ${this.deliveryMaxAttempts},
        ${now},
        ${now},
        ${now}
      )
    `;

    const delivery = await this.findDeliveryById(deliveryId);
    if (!delivery) {
      throw new Error(`Failed to create queued email delivery ${deliveryId}`);
    }

    return delivery;
  }

  private async findDueDeliveries(
    now: Date,
    staleBefore: Date,
    limit: number,
  ): Promise<EmailDeliveryRecord[]> {
    const rows = await this.prisma.$queryRaw<EmailDeliveryRow[]>(Prisma.sql`
      SELECT *
      FROM email_deliveries
      WHERE (
        (status = ${EmailDeliveryStatus.PENDING} AND nextAttemptAt <= ${now})
        OR (status = ${EmailDeliveryStatus.PROCESSING} AND lastAttemptAt < ${staleBefore})
      )
      ORDER BY nextAttemptAt ASC, createdAt ASC
      LIMIT ${Prisma.raw(String(limit))}
    `);

    return rows.map((row) => this.normalizeDelivery(row));
  }

  private async findDeliveryById(
    deliveryId: string,
  ): Promise<EmailDeliveryRecord | null> {
    const rows = await this.prisma.$queryRaw<EmailDeliveryRow[]>`
      SELECT *
      FROM email_deliveries
      WHERE id = ${deliveryId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    return this.normalizeDelivery(rows[0]);
  }

  private async markDeliveryAsSent(
    deliveryId: string,
    providerMessageId: string | null,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.$executeRaw`
      UPDATE email_deliveries
      SET
        status = ${EmailDeliveryStatus.SENT},
        sentAt = ${now},
        lastError = ${null},
        providerMessageId = ${providerMessageId},
        updatedAt = ${now}
      WHERE id = ${deliveryId}
    `;
  }

  private async rescheduleDelivery(
    deliveryId: string,
    nextAttemptAt: Date,
    lastError: string,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.$executeRaw`
      UPDATE email_deliveries
      SET
        status = ${EmailDeliveryStatus.PENDING},
        nextAttemptAt = ${nextAttemptAt},
        lastError = ${lastError},
        updatedAt = ${now}
      WHERE id = ${deliveryId}
    `;
  }

  private async markDeliveryAsFailed(
    deliveryId: string,
    lastError: string,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.$executeRaw`
      UPDATE email_deliveries
      SET
        status = ${EmailDeliveryStatus.FAILED},
        lastError = ${lastError},
        updatedAt = ${now}
      WHERE id = ${deliveryId}
    `;
  }

  private normalizeDelivery(row: EmailDeliveryRow): EmailDeliveryRecord {
    return {
      ...row,
      payload:
        typeof row.payload === 'string'
          ? (JSON.parse(row.payload) as Prisma.JsonValue)
          : row.payload,
    };
  }

  private renderMerchantInvitationEmail(
    payload: MerchantInvitationPayload,
    language: AppLanguage,
  ): RenderedMail {
    const subject =
      language === AppLanguage.ar
        ? 'تفعيل حساب التاجر الخاص بك'
        : 'Activation de votre compte commerçant';
    const text =
      language === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            `تم إنشاء حساب التاجر الخاص بك لـ "${payload.storeName}".`,
            'فعّل حسابك وأنشئ كلمة المرور عبر هذا الرابط:',
            payload.activationLink,
            '',
            'إذا لم تكن معنيًا بهذا البريد، يمكنك تجاهله.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            `Votre compte commerçant pour "${payload.storeName}" a été créé.`,
            'Activez votre compte et définissez votre mot de passe via ce lien :',
            payload.activationLink,
            '',
            "Si vous n'êtes pas concerné, ignorez cet email.",
          ].join('\n');

    return { subject, text };
  }

  private renderPasswordResetEmail(
    payload: PasswordResetPayload,
    language: AppLanguage,
  ): RenderedMail {
    const subject =
      language === AppLanguage.ar
        ? 'إعادة تعيين كلمة المرور'
        : 'Réinitialisation de votre mot de passe';
    const text =
      language === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            'لقد طلبت إعادة تعيين كلمة المرور الخاصة بك.',
            'استخدم هذا الرابط لتعيين كلمة مرور جديدة:',
            payload.resetLink,
            '',
            'إذا لم تطلب ذلك، يرجى تجاهل هذا البريد.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            'Vous avez demandé la réinitialisation de votre mot de passe.',
            'Utilisez ce lien pour définir un nouveau mot de passe :',
            payload.resetLink,
            '',
            "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
          ].join('\n');

    return { subject, text };
  }

  private renderCustomerEmailVerificationEmail(
    payload: CustomerEmailVerificationPayload,
    language: AppLanguage,
  ): RenderedMail {
    const subject =
      language === AppLanguage.ar
        ? 'تأكيد عنوان بريدك الإلكتروني'
        : 'Confirmez votre adresse email';
    const text =
      language === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            'شكرًا لتسجيلك في Click & Collect.',
            'أكد عنوان بريدك الإلكتروني عبر هذا الرابط:',
            payload.verificationLink,
            '',
            'إذا لم تقم بهذا التسجيل، يرجى تجاهل هذا البريد.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            'Merci pour votre inscription sur Click & Collect.',
            'Confirmez votre adresse email en cliquant sur ce lien :',
            payload.verificationLink,
            '',
            "Si vous n'etes pas a l'origine de cette inscription, ignorez cet email.",
          ].join('\n');

    return { subject, text };
  }

  private renderCustomerOrderPendingEmail(
    payload: OrderNotificationPayload,
    language: AppLanguage,
  ): RenderedMail {
    const subject =
      language === AppLanguage.ar
        ? `الطلب ${payload.orderId} بانتظار التأكيد`
        : `Commande ${payload.orderId} en attente de confirmation`;
    const text =
      language === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            `تم تسجيل طلبك ${payload.orderId} لدى "${payload.storeName}".`,
            `المبلغ التقديري: ${this.formatPrice(payload.totalInCents, language)}.`,
            `عدد العناصر: ${payload.itemCount}.`,
            `موعد الاستلام المتوقع: ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, language)}.`,
            '',
            'سنقوم بإبلاغك بمجرد تأكيد التاجر للطلب.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            `Votre commande ${payload.orderId} a bien ete enregistree chez "${payload.storeName}".`,
            `Montant estime : ${this.formatPrice(payload.totalInCents, language)}.`,
            `Nombre d'articles : ${payload.itemCount}.`,
            `Retrait prevu : ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, language)}.`,
            '',
            'Nous vous informerons des que le marchand confirme la commande.',
          ].join('\n');

    return { subject, text };
  }

  private renderMerchantNewOrderEmail(
    payload: OrderNotificationPayload,
    language: AppLanguage,
  ): RenderedMail {
    const subject =
      language === AppLanguage.ar
        ? `طلب جديد ${payload.orderId}`
        : `Nouvelle commande ${payload.orderId}`;
    const text =
      language === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            `تم تسجيل طلب جديد لمتجر "${payload.storeName}".`,
            `الطلب: ${payload.orderId}.`,
            `المبلغ التقديري: ${this.formatPrice(payload.totalInCents, language)}.`,
            `عدد العناصر: ${payload.itemCount}.`,
            `نافذة الاستلام: ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, language)}.`,
            '',
            'يرجى تسجيل الدخول إلى لوحة التاجر لتأكيد الطلب أو معالجته.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            `Une nouvelle commande a ete passee pour "${payload.storeName}".`,
            `Commande : ${payload.orderId}.`,
            `Montant estime : ${this.formatPrice(payload.totalInCents, language)}.`,
            `Nombre d'articles : ${payload.itemCount}.`,
            `Creneau de retrait : ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, language)}.`,
            '',
            'Connectez-vous au back-office pour la confirmer ou la traiter.',
          ].join('\n');

    return { subject, text };
  }

  private renderCustomerOrderStatusEmail(
    payload: CustomerOrderStatusPayload,
    language: AppLanguage,
  ): RenderedMail {
    const statusLabel = this.getStatusLabel(payload.status, language);
    if (!statusLabel) {
      throw new MailDeliveryRenderError(
        `Unsupported order status for email delivery: ${payload.status}`,
      );
    }

    const cancellationReasonBlock =
      payload.status === OrderStatus.CANCELLED && payload.cancellationReason
        ? [
            '',
            language === AppLanguage.ar
              ? `سبب الإلغاء: ${payload.cancellationReason}`
              : `Motif d'annulation : ${payload.cancellationReason}`,
          ]
        : [];

    const subject =
      language === AppLanguage.ar
        ? `الطلب ${payload.orderId} ${statusLabel.subjectSuffix}`
        : `Commande ${payload.orderId} ${statusLabel.subjectSuffix}`;
    const text =
      language === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            `طلبك ${payload.orderId} لدى "${payload.storeName}" أصبح الآن ${statusLabel.label}.`,
            `المبلغ: ${this.formatPrice(payload.totalInCents, language)}.`,
            `عدد العناصر: ${payload.itemCount}.`,
            `الاستلام: ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, language)}.`,
            '',
            statusLabel.description,
            ...cancellationReasonBlock,
          ].join('\n')
        : [
            'Bonjour,',
            '',
            `Votre commande ${payload.orderId} chez "${payload.storeName}" est maintenant ${statusLabel.label}.`,
            `Montant : ${this.formatPrice(payload.totalInCents, language)}.`,
            `Nombre d'articles : ${payload.itemCount}.`,
            `Retrait : ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, language)}.`,
            '',
            statusLabel.description,
            ...cancellationReasonBlock,
          ].join('\n');

    return { subject, text };
  }

  private async sendMail(options: {
    to: string;
    subject: string;
    text: string;
  }): Promise<string | null> {
    if (!this.transporter) {
      this.logger.log(
        `[MAIL MOCK] to=${options.to} subject="${options.subject}" content="${options.text}"`,
      );
      return 'mock';
    }

    const info = await this.transporter.sendMail({
      from: this.fromAddress,
      ...options,
    });

    return this.extractProviderMessageId(info);
  }

  private formatPrice(totalInCents: number, language: AppLanguage): string {
    return new Intl.NumberFormat(LANGUAGE_TO_LOCALE[language], {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: 2,
    }).format(totalInCents / 100);
  }

  private formatDateRange(
    startsAt: Date,
    endsAt: Date,
    language: AppLanguage,
  ): string {
    const formatter = new Intl.DateTimeFormat(LANGUAGE_TO_LOCALE[language], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return `${formatter.format(startsAt)} - ${formatter.format(endsAt)}`;
  }

  private resolveDefaultLanguage(raw: string | undefined): AppLanguage {
    if (raw === AppLanguage.ar || raw === AppLanguage.fr) {
      return raw;
    }

    return DEFAULT_LANGUAGE;
  }

  private resolveLanguage(language?: AppLanguage): AppLanguage {
    return language ?? this.defaultLanguage;
  }

  private parsePositiveInteger(
    rawValue: string | undefined,
    fallback: number,
  ): number {
    const parsed = Number.parseInt(rawValue ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private parseRetryDelays(rawValue: string | undefined): number[] {
    const parsedDelays = (rawValue ?? '')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => value * 60 * 1000);

    return parsedDelays.length > 0
      ? parsedDelays
      : DEFAULT_RETRY_DELAYS_MINUTES.map((value) => value * 60 * 1000);
  }

  private computeNextAttemptAt(attemptCount: number): Date {
    const retryDelay =
      this.deliveryRetryDelaysMs[
        Math.min(attemptCount - 1, this.deliveryRetryDelaysMs.length - 1)
      ];

    return new Date(Date.now() + retryDelay);
  }

  private isRetryableMailError(error: unknown): boolean {
    return !(error instanceof MailDeliveryRenderError);
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      const errorCode = (error as { code?: string }).code;
      return errorCode
        ? `${error.name}: ${error.message} (${errorCode})`
        : `${error.name}: ${error.message}`;
    }

    return String(error);
  }

  private extractProviderMessageId(info: SentMessageInfo): string | null {
    if (typeof info === 'string') {
      return info;
    }

    if ('messageId' in info && typeof info.messageId === 'string') {
      return info.messageId;
    }

    return null;
  }

  private getStatusLabel(
    status: OrderStatus,
    language: AppLanguage,
  ): OrderStatusLabel | null {
    if (language === AppLanguage.ar) {
      switch (status) {
        case OrderStatus.CONFIRMED:
          return {
            label: 'مؤكداً',
            subjectSuffix: 'تم تأكيده',
            description: 'أكد التاجر طلبك. الطلب قيد التحضير الآن.',
          };
        case OrderStatus.READY:
          return {
            label: 'جاهزاً',
            subjectSuffix: 'جاهز للاستلام',
            description: 'طلبك جاهز الآن. يمكنك استلامه خلال الموعد المحدد.',
          };
        case OrderStatus.COLLECTED:
          return {
            label: 'مستلمًا',
            subjectSuffix: 'تم استلامه',
            description: 'تم تأكيد استلام طلبك بنجاح.',
          };
        case OrderStatus.CANCELLED:
          return {
            label: 'ملغى',
            subjectSuffix: 'تم إلغاؤه',
            description: 'تم إلغاء طلبك. يمكنك التواصل مع التاجر عند الحاجة.',
          };
        default:
          return null;
      }
    }

    switch (status) {
      case OrderStatus.CONFIRMED:
        return {
          label: 'confirmee',
          subjectSuffix: 'confirmee',
          description:
            'Le marchand a confirme votre commande. Elle est en preparation.',
        };
      case OrderStatus.READY:
        return {
          label: 'prete',
          subjectSuffix: 'prete a etre retiree',
          description:
            'Votre commande est prete. Vous pouvez venir la recuperer sur le creneau prevu.',
        };
      case OrderStatus.COLLECTED:
        return {
          label: 'retiree',
          subjectSuffix: 'retiree',
          description: 'Le retrait de votre commande a ete confirme.',
        };
      case OrderStatus.CANCELLED:
        return {
          label: 'annulee',
          subjectSuffix: 'annulee',
          description:
            'Votre commande a ete annulee. Contactez le marchand si besoin.',
        };
      default:
        return null;
    }
  }
}

type OrderStatusLabel = {
  label: string;
  subjectSuffix: string;
  description: string;
};
