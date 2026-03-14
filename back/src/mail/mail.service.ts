import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SentMessageInfo } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress =
      this.configService.get<string>('MAIL_FROM') ??
      'no-reply@click-and-collect.local';

    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

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
}
