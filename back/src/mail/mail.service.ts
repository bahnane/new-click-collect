import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
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

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress = this.configService.getOrThrow<string>('MAIL_FROM');

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
  ): Promise<void> {
    const subject = 'Activation de votre compte commerçant';
    const text = [
      `Bonjour,`,
      '',
      `Votre compte commerçant pour "${storeName}" a été créé.`,
      `Activez votre compte et définissez votre mot de passe via ce lien :`,
      activationLink,
      '',
      `Si vous n'êtes pas concerné, ignorez cet email.`,
    ].join('\n');

    await this.sendMail({ to, subject, text });
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    const subject = 'Réinitialisation de votre mot de passe';
    const text = [
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
  ): Promise<void> {
    const subject = 'Confirmez votre adresse email';
    const text = [
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
  ): Promise<void> {
    const subject = `Commande ${payload.orderId} en attente de confirmation`;
    const text = [
      'Bonjour,',
      '',
      `Votre commande ${payload.orderId} a bien ete enregistree chez "${payload.storeName}".`,
      `Montant estime : ${this.formatPrice(payload.totalInCents)}.`,
      `Nombre d'articles : ${payload.itemCount}.`,
      `Retrait prevu : ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt)}.`,
      '',
      'Nous vous informerons des que le marchand confirme la commande.',
    ].join('\n');

    await this.sendMail({ to, subject, text });
  }

  async sendMerchantNewOrderEmail(
    to: string,
    payload: OrderNotificationPayload,
  ): Promise<void> {
    const subject = `Nouvelle commande ${payload.orderId}`;
    const text = [
      'Bonjour,',
      '',
      `Une nouvelle commande a ete passee pour "${payload.storeName}".`,
      `Commande : ${payload.orderId}.`,
      `Montant estime : ${this.formatPrice(payload.totalInCents)}.`,
      `Nombre d'articles : ${payload.itemCount}.`,
      `Creneau de retrait : ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt)}.`,
      '',
      'Connectez-vous au back-office pour la confirmer ou la traiter.',
    ].join('\n');

    await this.sendMail({ to, subject, text });
  }

  async sendCustomerOrderStatusEmail(
    to: string,
    payload: OrderNotificationPayload & { status: OrderStatusLabel },
  ): Promise<void> {
    const subject = `Commande ${payload.orderId} ${payload.status.subjectSuffix}`;
    const text = [
      'Bonjour,',
      '',
      `Votre commande ${payload.orderId} chez "${payload.storeName}" est maintenant ${payload.status.label}.`,
      `Montant : ${this.formatPrice(payload.totalInCents)}.`,
      `Nombre d'articles : ${payload.itemCount}.`,
      `Retrait : ${this.formatDateRange(payload.pickupStartsAt, payload.pickupEndsAt)}.`,
      '',
      payload.status.description,
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

  private formatPrice(totalInCents: number): string {
    return `${(totalInCents / 100).toFixed(2)} EUR`;
  }

  private formatDateRange(startsAt: Date, endsAt: Date): string {
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return `${formatter.format(startsAt)} - ${formatter.format(endsAt)}`;
  }
}

type OrderStatusLabel = {
  label: string;
  subjectSuffix: string;
  description: string;
};
