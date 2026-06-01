import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppLanguage, OrderStatus } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { SentMessageInfo } from 'nodemailer';

type OrderNotificationPayload = {
  orderId: string;
  storeName: string;
  totalInCents: number;
  itemCount: number;
  pickupStartsAt: Date;
  pickupEndsAt: Date;
};

const DEFAULT_LANGUAGE: AppLanguage = AppLanguage.fr;
const LANGUAGE_TO_LOCALE: Record<AppLanguage, string> = {
  [AppLanguage.fr]: 'fr-FR',
  [AppLanguage.ar]: 'ar-MA',
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly defaultLanguage: AppLanguage;
  private readonly currency: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress = this.configService.getOrThrow<string>('MAIL_FROM');
    this.defaultLanguage = this.resolveDefaultLanguage(
      this.configService.get<string>('MAIL_DEFAULT_LANGUAGE'),
    );
    this.currency = this.configService.get<string>('MAIL_CURRENCY') ?? 'EUR';

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
    const resolvedLanguage = this.resolveLanguage(language);
    const subject =
      resolvedLanguage === AppLanguage.ar
        ? 'تفعيل حساب التاجر الخاص بك'
        : 'Activation de votre compte commerçant';
    const text =
      resolvedLanguage === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            `تم إنشاء حساب التاجر الخاص بك لـ "${storeName}".`,
            'فعّل حسابك وأنشئ كلمة المرور عبر هذا الرابط:',
            activationLink,
            '',
            'إذا لم تكن معنيًا بهذا البريد، يمكنك تجاهله.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            `Votre compte commerçant pour "${storeName}" a été créé.`,
            'Activez votre compte et définissez votre mot de passe via ce lien :',
            activationLink,
            '',
            "Si vous n'êtes pas concerné, ignorez cet email.",
          ].join('\n');

    await this.sendMail({ to, subject, text });
  }

  async sendPasswordResetEmail(
    to: string,
    resetLink: string,
    language?: AppLanguage,
  ): Promise<void> {
    const resolvedLanguage = this.resolveLanguage(language);
    const subject =
      resolvedLanguage === AppLanguage.ar
        ? 'إعادة تعيين كلمة المرور'
        : 'Réinitialisation de votre mot de passe';
    const text =
      resolvedLanguage === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            'لقد طلبت إعادة تعيين كلمة المرور الخاصة بك.',
            'استخدم هذا الرابط لتعيين كلمة مرور جديدة:',
            resetLink,
            '',
            'إذا لم تطلب ذلك، يرجى تجاهل هذا البريد.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            'Vous avez demandé la réinitialisation de votre mot de passe.',
            'Utilisez ce lien pour définir un nouveau mot de passe :',
            resetLink,
            '',
            "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
          ].join('\n');

    await this.sendMail({ to, subject, text });
  }

  async sendCustomerEmailVerificationEmail(
    to: string,
    verificationLink: string,
    language?: AppLanguage,
  ): Promise<void> {
    const resolvedLanguage = this.resolveLanguage(language);
    const subject =
      resolvedLanguage === AppLanguage.ar
        ? 'تأكيد عنوان بريدك الإلكتروني'
        : 'Confirmez votre adresse email';
    const text =
      resolvedLanguage === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            'شكرًا لتسجيلك في Click & Collect.',
            'أكد عنوان بريدك الإلكتروني عبر هذا الرابط:',
            verificationLink,
            '',
            'إذا لم تقم بهذا التسجيل، يرجى تجاهل هذا البريد.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            'Merci pour votre inscription sur Click & Collect.',
            'Confirmez votre adresse email en cliquant sur ce lien :',
            verificationLink,
            '',
            "Si vous n'etes pas a l'origine de cette inscription, ignorez cet email.",
          ].join('\n');

    await this.sendMail({ to, subject, text });
  }

  async sendCustomerOrderPendingEmail(
    to: string,
    payload: OrderNotificationPayload,
    language?: AppLanguage,
  ): Promise<void> {
    const resolvedLanguage = this.resolveLanguage(language);
    const subject =
      resolvedLanguage === AppLanguage.ar
        ? `الطلب ${payload.orderId} بانتظار التأكيد`
        : `Commande ${payload.orderId} en attente de confirmation`;
    const text =
      resolvedLanguage === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            `تم تسجيل طلبك ${payload.orderId} لدى "${payload.storeName}".`,
            `المبلغ التقديري: ${this.formatPrice(payload.totalInCents, resolvedLanguage)}.`,
            `عدد العناصر: ${payload.itemCount}.`,
            `موعد الاستلام المتوقع: ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, resolvedLanguage)}.`,
            '',
            'سنقوم بإبلاغك بمجرد تأكيد التاجر للطلب.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            `Votre commande ${payload.orderId} a bien ete enregistree chez "${payload.storeName}".`,
            `Montant estime : ${this.formatPrice(payload.totalInCents, resolvedLanguage)}.`,
            `Nombre d'articles : ${payload.itemCount}.`,
            `Retrait prevu : ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, resolvedLanguage)}.`,
            '',
            'Nous vous informerons des que le marchand confirme la commande.',
          ].join('\n');

    await this.sendMail({ to, subject, text });
  }

  async sendMerchantNewOrderEmail(
    to: string,
    payload: OrderNotificationPayload,
    language?: AppLanguage,
  ): Promise<void> {
    const resolvedLanguage = this.resolveLanguage(language);
    const subject =
      resolvedLanguage === AppLanguage.ar
        ? `طلب جديد ${payload.orderId}`
        : `Nouvelle commande ${payload.orderId}`;
    const text =
      resolvedLanguage === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            `تم تسجيل طلب جديد لمتجر "${payload.storeName}".`,
            `الطلب: ${payload.orderId}.`,
            `المبلغ التقديري: ${this.formatPrice(payload.totalInCents, resolvedLanguage)}.`,
            `عدد العناصر: ${payload.itemCount}.`,
            `نافذة الاستلام: ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, resolvedLanguage)}.`,
            '',
            'يرجى تسجيل الدخول إلى لوحة التاجر لتأكيد الطلب أو معالجته.',
          ].join('\n')
        : [
            'Bonjour,',
            '',
            `Une nouvelle commande a ete passee pour "${payload.storeName}".`,
            `Commande : ${payload.orderId}.`,
            `Montant estime : ${this.formatPrice(payload.totalInCents, resolvedLanguage)}.`,
            `Nombre d'articles : ${payload.itemCount}.`,
            `Creneau de retrait : ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, resolvedLanguage)}.`,
            '',
            'Connectez-vous au back-office pour la confirmer ou la traiter.',
          ].join('\n');

    await this.sendMail({ to, subject, text });
  }

  async sendCustomerOrderStatusEmail(
    to: string,
    payload: OrderNotificationPayload & {
      status: OrderStatus;
      cancellationReason?: string | null;
    },
    language?: AppLanguage,
  ): Promise<void> {
    const resolvedLanguage = this.resolveLanguage(language);
    const statusLabel = this.getStatusLabel(payload.status, resolvedLanguage);
    if (!statusLabel) {
      return;
    }

    const cancellationReasonBlock =
      payload.status === OrderStatus.CANCELLED && payload.cancellationReason
        ? [
            '',
            resolvedLanguage === AppLanguage.ar
              ? `سبب الإلغاء: ${payload.cancellationReason}`
              : `Motif d'annulation : ${payload.cancellationReason}`,
          ]
        : [];

    const subject =
      resolvedLanguage === AppLanguage.ar
        ? `الطلب ${payload.orderId} ${statusLabel.subjectSuffix}`
        : `Commande ${payload.orderId} ${statusLabel.subjectSuffix}`;
    const text =
      resolvedLanguage === AppLanguage.ar
        ? [
            'مرحباً،',
            '',
            `طلبك ${payload.orderId} لدى "${payload.storeName}" أصبح الآن ${statusLabel.label}.`,
            `المبلغ: ${this.formatPrice(payload.totalInCents, resolvedLanguage)}.`,
            `عدد العناصر: ${payload.itemCount}.`,
            `الاستلام: ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, resolvedLanguage)}.`,
            '',
            statusLabel.description,
            ...cancellationReasonBlock,
          ].join('\n')
        : [
            'Bonjour,',
            '',
            `Votre commande ${payload.orderId} chez "${payload.storeName}" est maintenant ${statusLabel.label}.`,
            `Montant : ${this.formatPrice(payload.totalInCents, resolvedLanguage)}.`,
            `Nombre d'articles : ${payload.itemCount}.`,
            `Retrait : ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt, resolvedLanguage)}.`,
            '',
            statusLabel.description,
            ...cancellationReasonBlock,
          ].join('\n');

    await this.sendMail({ to, subject, text });
  }

  private async sendMail(options: {
    to: string;
    subject: string;
    text: string;
  }): Promise<SentMessageInfo | void> {
    if (!this.transporter) {
      this.logger.log(
        `[MAIL MOCK] to=${options.to} subject="${options.subject}" content="${options.text}"`,
      );
      return;
    }

    return this.transporter.sendMail({
      from: this.fromAddress,
      ...options,
    });
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
